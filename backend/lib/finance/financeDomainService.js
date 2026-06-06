import { randomUUID, createHash } from 'node:crypto';
import {
  assertBalancedJournal,
  buildBalanceSheet,
  buildLedger,
  buildProfitAndLoss,
  createReversalDraft,
} from './accountingEngine.js';
import createFinanceCommandEnvelope from './financeCommandEnvelope.js';
import createFinanceEventEnvelope from './financeEventEnvelope.js';
import {
  createGovernanceDecision,
  evaluateFinanceGovernance,
} from './financeGovernanceDecision.js';
import createFinanceEventStore from './financeEventStore.js';
import { promoteLinkedAdapterJobs } from './adapterJobPromoter.js';
import { mapJournalEntryToQuickBooksCanonical } from './accountingAdapters/quickbooksCanonicalAdapter.js';
import {
  seedAccountsForTenant,
  resolveAccount,
  normalizeAccountKey,
  buildManualAccount,
  isValidAccountType,
} from './chartOfAccounts.js';
import { FINANCE_CLASSIFICATIONS } from './accountingEngine.js';
import { buildCashFlowStatement } from './cashFlowStatement.js';

// Phase 3a (editable COA manager, design §2). "Has posted history" = the
// account_id appears in any posted/reversed journal line. Renaming/locking
// decisions key on this; pure, no I/O. Mirrors the ledger projection's
// posted+reversed filter so the two agree on what counts as money truth.
const POSTED_STATUSES = new Set(['posted', 'reversed']);

function hasPostedHistory(bucket, accountId) {
  const entries = Array.isArray(bucket?.journalEntries) ? bucket.journalEntries : [];
  return entries.some(
    (entry) =>
      POSTED_STATUSES.has(entry.status) &&
      Array.isArray(entry.lines) &&
      entry.lines.some((line) => line.account_id === accountId),
  );
}

// Net posted balance (Σ debit_cents − Σ credit_cents) for an account across
// posted/reversed entries. Same filter as hasPostedHistory so a nonzero balance
// implies posted history. Used by the deactivate guard (design §2 — nonzero
// posted balance blocks deactivation).
function accountBalanceCents(bucket, accountId) {
  const entries = Array.isArray(bucket?.journalEntries) ? bucket.journalEntries : [];
  let net = 0;
  for (const entry of entries) {
    if (!POSTED_STATUSES.has(entry.status) || !Array.isArray(entry.lines)) continue;
    for (const line of entry.lines) {
      if (line.account_id !== accountId) continue;
      net += Number(line.debit_cents || 0) - Number(line.credit_cents || 0);
    }
  }
  return net;
}

function createStore() {
  return {
    tenants: new Map(),
  };
}

// Deterministic, valid-shaped (v5) UUID for a REVERSAL's finance.approval.approved
// event, keyed on the SOURCE entry id. Two approvals for two reversals of the SAME
// source therefore mint the SAME approval-approved event id, so the durable event
// store's primary key rejects the second append (23505 →
// FINANCE_EVENT_STORE_DUPLICATE_EVENT_ID). This is the cross-process concurrency guard
// (the persistent runner hydrates a fresh per-request bucket, so an in-memory check
// alone can't see a sibling request's in-flight reversal; the durable PK can). The CAS
// gates the APPROVAL transition itself — the loser is rejected BEFORE it is durably
// recorded as approved, so persistentWriteRunner never advances a losing approval into
// the approval_queue while its reversal stays unpostable. Non-secret — a stable id.
function reversalApprovalEventId(sourceEntryId) {
  const h = createHash('sha256').update(`finance.reversal.approval-claim:${sourceEntryId}`).digest('hex');
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

function getTenantBucket(store, tenantId) {
  if (!tenantId) {
    const error = new Error('tenant_id is required');
    error.statusCode = 400;
    throw error;
  }

  if (!store.tenants.has(tenantId)) {
    store.tenants.set(tenantId, {
      journalEntries: [],
      invoices: [],
      approvals: [],
      adapterJobs: [],
      commands: [],
    });
  }

  return store.tenants.get(tenantId);
}

// In-memory chart of accounts per tenant (COA Slice 1). Ensures the baseline
// system accounts are present (idempotent by account_code) on every access —
// robust whether the bucket is fresh OR was rebuilt from events in persistent
// mode (where `finance.account.created` events replay the auto-created accounts
// and this fills in the non-event baseline). Auto-created accounts are appended
// here and emitted as audit-only `finance.account.created` events.
function getTenantCoa(bucket, tenantId) {
  if (!Array.isArray(bucket.accounts)) bucket.accounts = [];
  for (const base of seedAccountsForTenant(tenantId)) {
    if (!bucket.accounts.some((a) => a.account_code === base.account_code)) {
      bucket.accounts.push(base);
    }
  }
  return bucket.accounts;
}

function createActor(actor = {}) {
  return {
    id: actor.id || null,
    type: actor.type === 'ai_agent' || actor.type === 'system' ? actor.type : 'human',
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createFinanceDomainService(opts = {}) {
  const store = opts.store || createStore();
  const eventStore = opts.eventStore || createFinanceEventStore();
  const now = opts.now || (() => new Date().toISOString());
  const generateId = opts.generateId || randomUUID;

  function appendCommand(bucket, envelope) {
    bucket.commands.push(envelope);
  }

  // Task 6: appendEvent is async. The in-memory financeEventStore.js returns
  // synchronously (await is a no-op there), and the financeEventStore.pg.js
  // adapter returns a Promise from its underlying pg.query() — only by awaiting
  // do we preserve correctness for both stores.
  async function appendEvent(_bucket, envelope) {
    await eventStore.append(envelope);
  }

  // M-3 / CF-2: Centralized duplicate approval guard.
  // Previously the tenant+target_type+target_id uniqueness check was duplicated
  // inline inside simulateDealWon and reverseJournalEntry. Any new code path
  // that calls bucket.approvals.push() directly bypasses the invariant silently.
  // All approval creation MUST go through pushApproval().
  function assertNoDuplicateApproval(bucket, record) {
    const existing = bucket.approvals.find(
      (a) =>
        a.tenant_id === record.tenant_id &&
        a.target_type === record.target_type &&
        a.target_id === record.target_id &&
        !['approved', 'rejected', 'cancelled'].includes(a.status),
    );
    if (existing) {
      const err = new Error(
        `A pending approval already exists for ${record.target_type} ${record.target_id}`,
      );
      err.code = 'FINANCE_APPROVAL_DUPLICATE';
      err.statusCode = 409;
      throw err;
    }
  }

  function pushApproval(bucket, record) {
    // Re-checks the duplicate invariant atomically at push time. Callers that
    // append an event before pushing (append-before-mutate, PR #632 P2) also
    // call assertNoDuplicateApproval() up front so a duplicate is rejected
    // without persisting an approval.requested event; this re-check is the
    // authoritative one that runs after any await on append.
    assertNoDuplicateApproval(bucket, record);
    bucket.approvals.push(record);
    return record;
  }

  function buildApprovalRecord({
    tenantId,
    actor,
    aggregateType,
    aggregateId,
    decision,
    requestId = null,
  }) {
    const ts = now();
    return {
      id: `approval_${generateId()}`,
      tenant_id: tenantId,
      target_type: aggregateType,
      target_id: aggregateId,
      status: 'pending',
      requested_by: actor.id,
      requested_at: ts,
      approval_policy: decision.approval_policy || null,
      escalation_target: decision.escalation_target || null,
      risk_level: decision.risk_level || 'high',
      request_id: requestId,
      created_at: ts,
      updated_at: ts,
    };
  }

  function ensureTenantMatch(record, tenantId) {
    if (!record || record.tenant_id !== tenantId) {
      const error = new Error('Finance record not found for tenant');
      error.statusCode = 404;
      throw error;
    }
  }

  return {
    listJournalEntries(tenantId) {
      const bucket = getTenantBucket(store, tenantId);
      return clone(bucket.journalEntries);
    },

    listApprovals(tenantId) {
      const bucket = getTenantBucket(store, tenantId);
      return clone(bucket.approvals);
    },

    listInvoices(tenantId) {
      const bucket = getTenantBucket(store, tenantId);
      return clone(bucket.invoices);
    },

    // COA Slice 1: the tenant chart of accounts (baseline seed + any accounts
    // auto-created by journal-draft resolution this process). Read-only.
    listAccounts(tenantId) {
      const bucket = getTenantBucket(store, tenantId);
      return clone(getTenantCoa(bucket, tenantId));
    },

    // Cash Flow Slice 2 (Bridge B): read-only cash-flow statement derived from
    // this tenant's posted journal lines on cash/bank accounts. Reconciles to the
    // ledger (same posted/reversed filter).
    getCashFlow(tenantId) {
      const bucket = getTenantBucket(store, tenantId);
      return buildCashFlowStatement(bucket.journalEntries, getTenantCoa(bucket, tenantId));
    },

    listAdapterJobs(tenantId) {
      const bucket = getTenantBucket(store, tenantId);
      return clone(bucket.adapterJobs);
    },

    // Slice 6 (Codex P1): segregate by Test/Live partition. `isTestData` is the
    // active mode's flag (true=test, false=live); null means NO filter — the
    // backward-compatible default the in-memory/unstamped path relies on (the
    // store treats null/undefined as "all events"). The persistent route resolves
    // the tenant mode and threads it in so the raw event stream can't leak the
    // opposite partition.
    async listAuditEvents(tenantId, isTestData = null) {
      return await eventStore.query({ tenant_id: tenantId, is_test_data: isTestData });
    },

    getLedger(tenantId) {
      const bucket = getTenantBucket(store, tenantId);
      return buildLedger(bucket.journalEntries);
    },

    getProfitLoss(tenantId) {
      const bucket = getTenantBucket(store, tenantId);
      return buildProfitAndLoss(bucket.journalEntries);
    },

    getBalanceSheet(tenantId) {
      const bucket = getTenantBucket(store, tenantId);
      return buildBalanceSheet(bucket.journalEntries);
    },

    async createDraftInvoice({
      tenantId,
      actor,
      payload = {},
      requestId = null,
      braidTraceId = null,
    }) {
      const bucket = getTenantBucket(store, tenantId);
      const normalizedActor = createActor(actor);
      const command = createFinanceCommandEnvelope({
        tenantId,
        commandType: 'CreateDraftInvoiceCommand',
        actorId: normalizedActor.id,
        actorType: normalizedActor.type,
        requestId,
        braidTraceId,
        payload,
      });
      appendCommand(bucket, command);

      const decision = evaluateFinanceGovernance({
        commandType: command.command_type,
        actorType: normalizedActor.type,
        braidTraceId,
      });

      if (!decision.allowed) {
        const error = new Error(decision.explanation || 'Finance action blocked');
        error.statusCode = 403;
        error.decision = decision;
        throw error;
      }

      const invoice = {
        id: `invoice_${generateId()}`,
        tenant_id: tenantId,
        status: 'draft',
        customer_id: payload.customer_id || null,
        invoice_number: payload.invoice_number || null,
        currency: payload.currency || 'usd',
        subtotal_cents: Number(payload.subtotal_cents || 0),
        tax_cents: Number(payload.tax_cents || 0),
        total_cents: Number(payload.total_cents || payload.subtotal_cents || 0),
        issue_date: payload.issue_date || null,
        due_date: payload.due_date || null,
        memo: payload.memo || null,
        line_items: Array.isArray(payload.line_items) ? payload.line_items : [],
        created_by: normalizedActor.id,
        updated_by: normalizedActor.id,
        created_at: now(),
        updated_at: now(),
      };
      // Append-before-mutate (PR #632 P2): persist the event first; only add the
      // invoice to the in-memory bucket after the append resolves, so a failed
      // append never exposes a phantom draft through the read endpoints.
      await appendEvent(
        bucket,
        createFinanceEventEnvelope({
          tenantId,
          eventType: 'finance.invoice.draft_created',
          aggregateType: 'invoice',
          aggregateId: invoice.id,
          actorId: normalizedActor.id,
          actorType: normalizedActor.type,
          requestId,
          braidTraceId,
          payload: { invoice: clone(invoice) },
          policyDecision: decision,
        }),
      );
      bucket.invoices.push(invoice);

      return {
        invoice: clone(invoice),
        governance_decision: decision,
        approval_required: decision.requires_approval,
      };
    },

    async updateDraftInvoice({
      tenantId,
      invoiceId,
      actor,
      payload = {},
      requestId = null,
      braidTraceId = null,
    }) {
      const bucket = getTenantBucket(store, tenantId);
      const normalizedActor = createActor(actor);
      const invoice = bucket.invoices.find((row) => row.id === invoiceId);
      ensureTenantMatch(invoice, tenantId);

      if (invoice.status !== 'draft') {
        const error = new Error('Only draft invoices can be modified');
        error.statusCode = 409;
        throw error;
      }

      const command = createFinanceCommandEnvelope({
        tenantId,
        commandType: 'UpdateDraftInvoiceCommand',
        actorId: normalizedActor.id,
        actorType: normalizedActor.type,
        requestId,
        braidTraceId,
        payload: { invoice_id: invoiceId, ...payload },
      });
      appendCommand(bucket, command);

      const decision = evaluateFinanceGovernance({
        commandType: command.command_type,
        actorType: normalizedActor.type,
        braidTraceId,
      });

      // Append-before-mutate (PR #632 P2): compute the updated snapshot, persist
      // it, and only then apply the in-place mutation — so a failed append leaves
      // the existing invoice untouched rather than half-updated.
      const updatedInvoice = {
        ...invoice,
        ...payload,
        updated_by: normalizedActor.id,
        updated_at: now(),
      };

      await appendEvent(
        bucket,
        createFinanceEventEnvelope({
          tenantId,
          eventType: 'finance.invoice.draft_updated',
          aggregateType: 'invoice',
          aggregateId: invoice.id,
          actorId: normalizedActor.id,
          actorType: normalizedActor.type,
          requestId,
          braidTraceId,
          payload: { invoice: clone(updatedInvoice) },
          policyDecision: decision,
        }),
      );
      Object.assign(invoice, updatedInvoice);

      return {
        invoice: clone(invoice),
        governance_decision: decision,
        approval_required: decision.requires_approval,
      };
    },

    async createJournalDraft({
      tenantId,
      actor,
      payload = {},
      requestId = null,
      braidTraceId = null,
    }) {
      const bucket = getTenantBucket(store, tenantId);
      const normalizedActor = createActor(actor);
      const command = createFinanceCommandEnvelope({
        tenantId,
        commandType: 'CreateJournalDraftCommand',
        actorId: normalizedActor.id,
        actorType: normalizedActor.type,
        requestId,
        braidTraceId,
        payload,
      });
      appendCommand(bucket, command);

      let validation;
      try {
        validation = assertBalancedJournal(payload.lines || []);
      } catch (error) {
        await appendEvent(
          bucket,
          createFinanceEventEnvelope({
            tenantId,
            eventType: 'finance.journal.validation_failed',
            aggregateType: 'journal_entry',
            aggregateId: null,
            actorId: normalizedActor.id,
            actorType: normalizedActor.type,
            requestId,
            braidTraceId,
            payload: { errors: error.details?.errors || [error.message] },
            policyDecision: createGovernanceDecision({
              allowed: false,
              requiresApproval: false,
              riskLevel: 'medium',
              explanation: error.message,
              braidTraceId,
            }),
          }),
        );
        throw error;
      }

      const totalAmountCents = validation.debit_cents;
      const decision = evaluateFinanceGovernance({
        commandType: command.command_type,
        actorType: normalizedActor.type,
        amountCents: totalAmountCents,
        braidTraceId,
      });

      // COA Slice 1: resolve each validated line to a real chart-of-accounts
      // account (account_id + denormalized account_code). Auto-create a
      // non-system account on a miss and emit an audit-only
      // `finance.account.created` event (no business projection consumes it, so
      // it never affects ledger totals or statements). Generate the journal id
      // up front so the account-created events can carry it as provenance.
      const journalEntryId = `journal_${generateId()}`;
      const coa = getTenantCoa(bucket, tenantId);
      // assertBalancedJournal's normalizeLine keeps account_id but DROPS
      // account_code (Codex PR #647 P2), so read the caller-supplied code from the
      // raw payload line at the same index (validateJournalLines maps in order).
      const inputLines = Array.isArray(payload.lines) ? payload.lines : [];
      const resolvedLines = [];
      for (let i = 0; i < validation.lines.length; i += 1) {
        const line = validation.lines[i];
        const { account, created } = resolveAccount({
          tenantId,
          accounts: coa,
          classification: line.classification,
          account_name: line.account_name,
          account_code: inputLines[i]?.account_code,
          account_id: line.account_id,
        });
        if (created) {
          // Phase 2: stamp provenance so the in-memory chart matches the
          // replayed shape (the fold carries source onto folded accounts).
          account.source = 'auto_resolution';
          coa.push(account);
          await appendEvent(
            bucket,
            createFinanceEventEnvelope({
              tenantId,
              eventType: 'finance.account.created',
              aggregateType: 'account',
              aggregateId: account.id,
              actorId: normalizedActor.id,
              actorType: normalizedActor.type,
              requestId,
              braidTraceId,
              payload: {
                account_id: account.id,
                account_code: account.account_code,
                name: account.name,
                classification: account.classification,
                account_type: account.account_type,
                is_system: false,
                source: 'auto_resolution',
                match_key: normalizeAccountKey(account.classification, account.name),
                source_journal_draft_id: journalEntryId,
                correlation_id: requestId || null,
              },
              policyDecision: createGovernanceDecision({
                allowed: true,
                requiresApproval: false,
                riskLevel: 'low',
                explanation: 'Auto-created chart-of-accounts account (COA management; not money movement).',
                braidTraceId,
              }),
            }),
          );
        }
        // Canonicalize the line's name + classification FROM the resolved account
        // (Codex PR #647 review). On an explicit account_code/account_id match the
        // input name/classification can be wrong or normalizeLine-defaulted
        // (Uncategorized/Expense); the ledger / P&L / balance-sheet read these
        // fields, so a line resolved to AR (1100, Asset) must not stay an Expense.
        // For name-matched + auto-created lines this is a no-op (already aligned).
        // Balance is unaffected (debit/credit sums don't depend on classification).
        resolvedLines.push({
          ...line,
          account_id: account.id,
          account_code: account.account_code,
          account_name: account.name,
          classification: account.classification,
        });
      }

      const journalEntry = {
        id: journalEntryId,
        tenant_id: tenantId,
        source_type: payload.source_type || 'finance',
        source_id: payload.source_id || null,
        memo: payload.memo || null,
        currency: payload.currency || 'usd',
        status: 'draft',
        created_by: normalizedActor.id,
        braid_trace_id: braidTraceId,
        ai_generated: normalizedActor.type === 'ai_agent',
        governance_policy_snapshot: decision,
        lines: resolvedLines,
        created_at: now(),
        updated_at: now(),
      };
      // Append-before-mutate (PR #632 P2): persist draft_created first, then add
      // the entry to the in-memory bucket, so a failed append never leaves a
      // phantom draft visible to the read endpoints.
      await appendEvent(
        bucket,
        createFinanceEventEnvelope({
          tenantId,
          eventType: 'finance.journal.draft_created',
          aggregateType: 'journal_entry',
          aggregateId: journalEntry.id,
          actorId: normalizedActor.id,
          actorType: normalizedActor.type,
          requestId,
          braidTraceId,
          payload: { journal_entry: clone(journalEntry) },
          policyDecision: decision,
        }),
      );
      bucket.journalEntries.push(journalEntry);

      return {
        journal_entry: clone(journalEntry),
        governance_decision: decision,
        approval_required: decision.requires_approval,
      };
    },

    async simulateDealWon({
      tenantId,
      actor,
      payload = {},
      requestId = null,
      braidTraceId = null,
    }) {
      const bucket = getTenantBucket(store, tenantId);
      const normalizedActor = createActor(actor);
      const amountCents = Number(payload.amount_cents || 0);

      const draft = await this.createJournalDraft({
        tenantId,
        actor: normalizedActor,
        requestId,
        braidTraceId,
        payload: {
          source_type: 'deal_simulation',
          source_id: payload.deal_id || null,
          memo: payload.memo || 'Simulated deal-won journal draft',
          currency: payload.currency || 'usd',
          lines: payload.lines || [
            {
              account_name: 'Accounts Receivable',
              classification: 'Asset',
              debit_cents: amountCents,
              credit_cents: 0,
            },
            {
              account_name: 'Revenue',
              classification: 'Revenue',
              debit_cents: 0,
              credit_cents: amountCents,
            },
          ],
        },
      });

      const decision = createGovernanceDecision({
        allowed: true,
        requiresApproval: true,
        riskLevel: amountCents >= 500000 ? 'critical' : 'high',
        approvalPolicy: 'finance.high_value.approval_required',
        escalationTarget: 'finance_controller',
        explanation: 'Simulation may create a draft, but execution requires human approval.',
        braidTraceId,
        policyTrace: [
          {
            policy: 'finance.high_value.approval_required',
            result: 'approval_required',
            reason: 'Deal-won journal flow is operationally significant',
          },
        ],
      });

      // Append-before-mutate (PR #632 P2): the draft_created event + entry are
      // already persisted by createJournalDraft above. The rest of this flow
      // (promote the draft to pending_approval, create the approval, queue the
      // adapter job) is gated behind a SINGLE approval.requested append. We build
      // every post-transition snapshot WITHOUT touching the bucket, append once,
      // and only then apply the in-memory mutations — so a failed append leaves
      // the entry an un-promoted draft with no phantom approval or adapter job.
      const draftEntry = bucket.journalEntries.find((entry) => entry.id === draft.journal_entry.id);
      const updatedDraftEntry = {
        ...draftEntry,
        status: 'pending_approval',
        governance_policy_snapshot: decision,
        updated_at: now(),
      };

      const approval = buildApprovalRecord({
        tenantId,
        actor: normalizedActor,
        aggregateType: 'journal_entry',
        aggregateId: updatedDraftEntry.id,
        decision,
        requestId,
      });
      // Reject a duplicate approval up front so we never persist an
      // approval.requested event for one; pushApproval() re-checks atomically
      // after the append resolves.
      assertNoDuplicateApproval(bucket, approval);

      // Slice 2B review P1 + follow-up P1: the adapter_job must carry the
      // canonical object snapshot in the EXACT SHAPE the Slice 2A ERPNext
      // adapter's `fromCanonical(canonicalObject, objectType)` consumes —
      // i.e., the provider-neutral canonical with root-level fields like
      // `doc_number`, `txn_date`, `private_note`, `currency`, `lines` per
      // `ERPNEXT_PROVIDER_OBJECT_MAP['JournalEntry'].fields`. Storing the
      // raw in-memory `draftEntry` (with fields like `entry_number`,
      // `created_at`, `memo`) would mean `fromCanonical()` finds no
      // recognized keys and the adapter pushes an empty body. Wrapping
      // under a `journal_entry` key would have the same effect (fields not
      // at root).
      //
      // We resolve both by running the existing canonical mapper at the
      // producer boundary. `mapJournalEntryToQuickBooksCanonical` (despite
      // its name) is provider-neutral — it produces the same
      // `{ doc_number, txn_date, private_note, currency, lines }` shape
      // that BOTH QuickBooks and the ERPNext adapter consume. The processor
      // then forwards this directly via `buildProviderPayload` (which
      // strips internal metadata) into `adapter.pushDraft`.
      //
      // The processor maps `aggregate_type='journal_entry'` →
      // `objectType='JournalEntry'` per `OBJECT_TYPE_MAP` in
      // `adapterJobProcessor.js`, since the Track A envelope vocabulary
      // (snake_case) differs from the provider object-type vocabulary
      // (PascalCase per `ERPNEXT_PROVIDER_OBJECT_MAP` keys).
      //
      // The canonical is cloned implicitly by the mapper (which builds a
      // fresh object from selected fields), so future bucket mutations
      // cannot leak into the persisted payload. Mapped from the post-transition
      // snapshot (status is not a canonical field, so the body is identical to
      // mapping the pre-transition entry).
      const adapterJobPayload = mapJournalEntryToQuickBooksCanonical(updatedDraftEntry);

      const adapterJob = {
        id: `adapter_job_${generateId()}`,
        tenant_id: tenantId,
        status: 'draft',
        provider: payload.provider || 'quickbooks',
        aggregate_type: 'journal_entry',
        aggregate_id: updatedDraftEntry.id,
        operation: 'push_draft',
        mode: 'draft_only',
        payload: adapterJobPayload,
        created_at: now(),
        updated_at: now(),
      };

      await appendEvent(
        bucket,
        createFinanceEventEnvelope({
          tenantId,
          eventType: 'finance.approval.requested',
          aggregateType: 'approval',
          aggregateId: approval.id,
          actorId: normalizedActor.id,
          actorType: normalizedActor.type,
          requestId,
          braidTraceId,
          // Phase 4-1 Amendment A: carry the post-transition journal_entry
          // (updatedDraftEntry — status 'pending_approval') so the
          // journal_entries projection can reproduce listJournalEntries()
          // bit-for-bit. Additive — approval + adapter_job keys unchanged.
          payload: {
            approval: clone(approval),
            adapter_job: clone(adapterJob),
            journal_entry: clone(updatedDraftEntry),
          },
          policyDecision: decision,
        }),
      );

      // Append succeeded — apply the in-memory mutations. Promote the draft in
      // place, then push the approval (atomic duplicate re-check) and the
      // adapter job.
      Object.assign(draftEntry, updatedDraftEntry);
      pushApproval(bucket, approval);
      bucket.adapterJobs.push(adapterJob);

      return {
        journal_entry: clone(draftEntry),
        approval: clone(approval),
        adapter_job: clone(adapterJob),
        governance_decision: decision,
        approval_required: true,
      };
    },

    // Cash Flow Slice 2 — test-mode sandbox convenience: simulate a won deal AND
    // immediately approve it so the journal POSTS, populating the ledger / P&L /
    // balance-sheet / cash-flow with sample data. Composes the two real operations
    // (simulateDealWon → approveFinanceAction) on the same bucket; it does NOT add
    // a general approve control. Surfaced ONLY by the test-mode create panel; live
    // posting still goes through the real human approval flow. Human-gated:
    // approveFinanceAction blocks AI actors.
    async simulatePostedDealWon({ tenantId, actor, payload = {}, requestId = null, braidTraceId = null }) {
      // A posted CASH sale (Debit Cash / Credit Revenue) — touches a cash account
      // so it shows in the cash-flow statement, unlike simulateDealWon's default
      // Debit-AR credit sale (revenue accrued, cash not yet received). Callers may
      // still override payload.lines.
      const amountCents = Number(payload.amount_cents || 0);
      const simPayload = {
        ...payload,
        memo: payload.memo || 'Simulated posted cash sale',
        lines: payload.lines || [
          { account_name: 'Cash', classification: 'Asset', debit_cents: amountCents, credit_cents: 0 },
          { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: amountCents },
        ],
      };
      const sim = await this.simulateDealWon({ tenantId, actor, payload: simPayload, requestId, braidTraceId });
      const approved = await this.approveFinanceAction({
        tenantId,
        approvalId: sim.approval.id,
        actor,
        requestId,
        braidTraceId,
      });
      return {
        journal_entry: approved.posted_entry || sim.journal_entry,
        approval: approved.approval,
        posted_entry: approved.posted_entry,
        governance_decision: sim.governance_decision,
      };
    },

    async reverseJournalEntry({
      tenantId,
      journalEntryId,
      actor,
      payload = {},
      requestId = null,
      braidTraceId = null,
    }) {
      const bucket = getTenantBucket(store, tenantId);
      const normalizedActor = createActor(actor);
      const original = bucket.journalEntries.find((entry) => entry.id === journalEntryId);
      ensureTenantMatch(original, tenantId);

      if (original.status !== 'posted') {
        const error = new Error('Only posted journal entries can be reversed');
        error.statusCode = 409;
        throw error;
      }

      const decision = evaluateFinanceGovernance({
        commandType: 'RequestJournalReversalCommand',
        actorType: normalizedActor.type,
        braidTraceId,
      });

      if (!decision.allowed) {
        const error = new Error(decision.explanation || 'Finance action blocked');
        error.statusCode = 403;
        error.decision = decision;
        throw error;
      }

      const reversalEntry = createReversalDraft(original, {
        tenant_id: tenantId,
        memo: payload.memo,
        created_by: normalizedActor.id,
        braid_trace_id: braidTraceId,
        ai_generated: normalizedActor.type === 'ai_agent',
        governance_policy_snapshot: decision,
        created_at: now(),
        updated_at: now(),
      });

      // Append-before-mutate (PR #632 P2): build the reversal entry + approval,
      // pre-validate the duplicate invariant, append the event, and only then
      // add both to the in-memory bucket — so a failed append leaves no phantom
      // reversal or approval.
      const approval = buildApprovalRecord({
        tenantId,
        actor: normalizedActor,
        aggregateType: 'journal_entry',
        aggregateId: reversalEntry.id,
        decision,
        requestId,
      });
      assertNoDuplicateApproval(bucket, approval);

      await appendEvent(
        bucket,
        createFinanceEventEnvelope({
          tenantId,
          eventType: 'finance.journal.reversal_requested',
          aggregateType: 'journal_entry',
          aggregateId: reversalEntry.id,
          actorId: normalizedActor.id,
          actorType: normalizedActor.type,
          requestId,
          braidTraceId,
          payload: {
            original_entry_id: original.id,
            reversal_entry: clone(reversalEntry),
            approval: clone(approval),
          },
          policyDecision: decision,
        }),
      );

      bucket.journalEntries.push(reversalEntry);
      pushApproval(bucket, approval);

      return {
        original_entry_id: original.id,
        reversal_entry: clone(reversalEntry),
        approval: clone(approval),
        governance_decision: decision,
        approval_required: decision.requires_approval,
      };
    },

    async approveFinanceAction({
      tenantId,
      approvalId,
      actor,
      requestId = null,
      braidTraceId = null,
    }) {
      const bucket = getTenantBucket(store, tenantId);
      const normalizedActor = createActor(actor);
      const decision = evaluateFinanceGovernance({
        commandType: 'ApproveFinanceActionCommand',
        actorType: normalizedActor.type,
        braidTraceId,
      });

      if (!decision.allowed) {
        const error = new Error(decision.explanation || 'Finance approval blocked');
        error.statusCode = 403;
        error.decision = decision;
        throw error;
      }

      const approval = bucket.approvals.find((row) => row.id === approvalId);
      ensureTenantMatch(approval, tenantId);

      // Double-reversal guard + SYNCHRONOUS CLAIM (Codex PR #650 P2). Two reversals
      // can race from the same posted source — `reverseJournalEntry` only guards on
      // the source being `posted`, and the source flips to `reversed` at step 2 below,
      // so two requests created before either approval both pass. Without protection,
      // approving the second posts a second `finance.journal.posted` reversal and
      // double-reverses the original in the ledger/cash-flow.
      //   • Same-process (in-memory shared bucket): this block runs BEFORE any await,
      //     so the `source.reversed_by` claim is set atomically — a second approval
      //     interleaving at the awaits below sees the claim and is rejected (409).
      //   • Cross-process (persistent hydrates a fresh per-request bucket, so the
      //     claim is process-local): the durable guarantee comes from the DETERMINISTIC
      //     finance.approval.approved id below — the event store PK rejects the second,
      //     gating the APPROVAL transition itself so a losing approval is never durably
      //     recorded as approved while its reversal stays unpostable (Codex PR #650 P1).
      // An idempotent re-approval of the SAME reversal (reversed_by === target.id)
      // falls through — step 1 no-ops on the already-posted entry and step 2 heals a
      // source left `posted` by a partial append.
      let reversalSourceId = null;
      if (approval.target_type === 'journal_entry') {
        const target = bucket.journalEntries.find((e) => e.id === approval.target_id);
        if (target?.reversal_of) {
          reversalSourceId = target.reversal_of;
          const source = bucket.journalEntries.find((e) => e.id === target.reversal_of);
          if (source) {
            if (source.reversed_by && source.reversed_by !== target.id) {
              const error = new Error('This entry has already been reversed by another reversal; a second reversal cannot be posted.');
              error.statusCode = 409;
              throw error;
            }
            // Synchronous claim — no await between the read above and this write.
            if (source.status !== 'reversed') {
              source.reversed_by = target.id;
            }
          }
        }
      }

      // Append-before-mutate (PR #632 P2): persist the approved transition before
      // mutating the in-memory approval, so a failed append leaves it pending.
      // The append must also land before promoteLinkedAdapterJobs runs, since the
      // promotion is a consequence of a durably-recorded approval.
      //
      // Skip re-appending when the approval is ALREADY approved (idempotent re-approval
      // / heal retry): the durable approval transition already landed, and with the
      // deterministic reversal-claim id below a re-append would self-collide. The
      // posting/heal steps still run.
      if (approval.status !== 'approved') {
        const approvedApproval = {
          ...approval,
          status: 'approved',
          approved_by: normalizedActor.id,
          approved_at: now(),
        };

        // For a REVERSAL approval, the approval-approved event id is DETERMINISTIC on
        // the SOURCE id (reversalSourceId), so two approvals for two reversals of the
        // same source collide on the event store PK — the LOSER's approval transition
        // is rejected (409) and never durably recorded, so it cannot be advanced into
        // the approval_queue while its reversal stays unpostable (Codex PR #650 P1).
        const approvedEventId = reversalSourceId ? reversalApprovalEventId(reversalSourceId) : null;
        try {
          await appendEvent(
            bucket,
            createFinanceEventEnvelope({
              tenantId,
              eventType: 'finance.approval.approved',
              aggregateType: 'approval',
              aggregateId: approval.id,
              actorId: normalizedActor.id,
              actorType: normalizedActor.type,
              requestId,
              braidTraceId,
              payload: { approval: clone(approvedApproval) },
              policyDecision: decision,
              id: approvedEventId,
            }),
          );
        } catch (err) {
          // The durable PK rejected a concurrent reversal approval of the same source.
          if (err?.code === 'FINANCE_EVENT_STORE_DUPLICATE_EVENT_ID' && reversalSourceId) {
            const e = new Error('This entry is already being reversed by a concurrent request; a second reversal cannot be approved.');
            e.statusCode = 409;
            throw e;
          }
          throw err;
        }
        Object.assign(approval, approvedApproval);
      }

      // Cash Flow Slice 2 — JOURNAL POSTING. When the approved approval targets a
      // journal entry, post it (pending_approval → posted) and emit
      // `finance.journal.posted` with the full posted entry (the shape
      // journalEntriesProjection + rebuildBucketFromEvents already expect). This
      // is what makes the ledger / P&L / balance-sheet / cash-flow reflect the
      // entry. Human-gated: approveFinanceAction is AI-blocked above
      // (finance.ai.no_money_movement), so an AI actor can never post. Idempotent:
      // an already-posted/reversed entry is left untouched.
      let postedEntry = null;
      if (approval.target_type === 'journal_entry') {
        const entry = bucket.journalEntries.find((e) => e.id === approval.target_id);
        if (entry) {
          // 1. Post the target entry if not already posted/reversed.
          if (entry.status !== 'posted' && entry.status !== 'reversed') {
            postedEntry = {
              ...clone(entry),
              status: 'posted',
              posted_at: now(),
              posted_by: normalizedActor.id,
              updated_at: now(),
            };
            // The concurrency guard is on the approval transition above (the durable
            // reversal-claim CAS), so a losing reversal never reaches this post.
            await appendEvent(
              bucket,
              createFinanceEventEnvelope({
                tenantId,
                eventType: 'finance.journal.posted',
                aggregateType: 'journal_entry',
                aggregateId: entry.id,
                actorId: normalizedActor.id,
                actorType: normalizedActor.type,
                requestId,
                braidTraceId,
                payload: { journal_entry: clone(postedEntry) },
                policyDecision: decision,
              }),
            );
            Object.assign(entry, postedEntry);
          }

          // 2. If the target is a REVERSAL (`reversal_of` set), mark its SOURCE
          // entry `reversed` so it cannot be reversed again (reverseJournalEntry
          // only allows `status === 'posted'` sources — otherwise one original
          // could be reversed repeatedly). This runs INDEPENDENTLY of step 1 and
          // is idempotent (Codex PR #650 P2 follow-up): on a retry after a partial
          // append (posted landed durably, reversed failed), the reversal entry is
          // already `posted` and skips step 1, but the source still needs healing —
          // re-approving the same reversal now marks it. The reversal entry's own
          // posting nets the original in the ledger; the ledger projection does not
          // consume finance.journal.reversed, so balances are unchanged.
          if (entry.reversal_of) {
            const original = bucket.journalEntries.find((e) => e.id === entry.reversal_of);
            if (original && original.status !== 'reversed') {
              // Stamp `reversed_by` with THIS reversal's id so the double-reversal
              // guard above can tell a redundant second reversal (different id →
              // reject) from an idempotent re-approval of the same one (same id →
              // heal). Carried by the finance.journal.reversed payload, so it
              // survives projection rebuild + persistent rehydration.
              const reversedOriginal = { ...clone(original), status: 'reversed', reversed_by: entry.id, updated_at: now() };
              await appendEvent(
                bucket,
                createFinanceEventEnvelope({
                  tenantId,
                  eventType: 'finance.journal.reversed',
                  aggregateType: 'journal_entry',
                  aggregateId: original.id,
                  actorId: normalizedActor.id,
                  actorType: normalizedActor.type,
                  requestId,
                  braidTraceId,
                  payload: { journal_entry: clone(reversedOriginal) },
                  policyDecision: decision,
                }),
              );
              Object.assign(original, reversedOriginal);
            }
          }
        }
      }

      // Slice 2B: promote any linked adapter_jobs from `draft → queued` and
      // emit one `finance.adapter.sync_queued` event per promoted job. The
      // linkage is structural via shared `aggregate_id` — see §4.1 of the
      // slice-2 adapter runtime design freeze. The promoter is a no-op for
      // approvals whose target has no linked adapter_jobs.
      const promotion = await promoteLinkedAdapterJobs({
        bucket,
        tenantId,
        aggregateId: approval.target_id,
        eventStore: { append: (envelope) => appendEvent(bucket, envelope) },
        actor: normalizedActor,
        requestId,
        braidTraceId,
        now,
      });

      return {
        approval: clone(approval),
        governance_decision: decision,
        promoted_adapter_jobs: promotion.promoted_jobs,
        posted_entry: postedEntry ? clone(postedEntry) : null,
      };
    },

    // Phase 3a (editable COA manager, design §2 + plan Task 6). Create a MANUAL,
    // non-system chart-of-accounts account. Event-sourced (Approach A): append a
    // FLAT `finance.account.created` (source:'manual') BEFORE mutating the chart,
    // mirroring the auto-create emission shape so the replay fold upserts it
    // identically. Human-only: an ai_agent is fail-closed by the governance default
    // (ManageChartOfAccountsCommand is an unknown command type → blocked for AI)
    // before any event lands. No update/deactivate/reactivate here (Phase 3b).
    async createAccount({ tenantId, actor, payload = {}, requestId = null, braidTraceId = null }) {
      const bucket = getTenantBucket(store, tenantId);
      const normalizedActor = createActor(actor);
      const { name, classification, account_type } = payload;

      // 1. Governance: COA management is human-only. The governance default
      // fail-closes ai_agent for unknown command types (ManageChartOfAccountsCommand
      // is intentionally NOT in any allow-list).
      const decision = evaluateFinanceGovernance({
        commandType: 'ManageChartOfAccountsCommand',
        actorType: normalizedActor.type,
        braidTraceId,
      });
      if (!decision.allowed) {
        const e = new Error('AI actors cannot manage the chart of accounts.');
        e.statusCode = 403;
        e.code = 'FINANCE_COA_AI_FORBIDDEN';
        e.decision = decision;
        throw e;
      }

      // 2. classification must be one of the 5 canonical values.
      if (!FINANCE_CLASSIFICATIONS.includes(classification)) {
        const e = new Error(`Invalid account classification: ${classification}`);
        e.statusCode = 400;
        e.code = 'FINANCE_COA_INVALID_CLASSIFICATION';
        throw e;
      }

      // 3. account_type must be curated AND valid for the classification.
      if (!isValidAccountType(classification, account_type)) {
        const e = new Error(`Invalid account_type '${account_type}' for classification '${classification}'`);
        e.statusCode = 400;
        e.code = 'FINANCE_COA_INVALID_ACCOUNT_TYPE';
        throw e;
      }

      // 4. Reject a duplicate normalized (classification, name) — prevents the
      // fragmentation the manager exists to retire (design §2).
      const coa = getTenantCoa(bucket, tenantId);
      const matchKey = normalizeAccountKey(classification, name);
      if (coa.some((a) => normalizeAccountKey(a.classification, a.name) === matchKey)) {
        const e = new Error(`An account named '${name}' already exists in ${classification}`);
        e.statusCode = 409;
        e.code = 'FINANCE_COA_DUPLICATE_NAME';
        throw e;
      }

      const account = buildManualAccount({
        tenantId,
        classification,
        name,
        account_type,
        existingCodes: coa.map((a) => a.account_code),
      });
      // Stamp provenance so the in-memory chart matches the replayed shape (the
      // fold carries `source` onto folded accounts), exactly like the auto-create path.
      account.source = 'manual';

      // Append-before-mutate (PR #632 P2): persist the FLAT created event first;
      // only push onto the chart after the append resolves.
      await appendEvent(
        bucket,
        createFinanceEventEnvelope({
          tenantId,
          eventType: 'finance.account.created',
          aggregateType: 'account',
          aggregateId: account.id,
          actorId: normalizedActor.id,
          actorType: normalizedActor.type,
          requestId,
          braidTraceId,
          payload: {
            account_id: account.id,
            account_code: account.account_code,
            name: account.name,
            classification: account.classification,
            account_type: account.account_type,
            is_system: false,
            source: 'manual',
            match_key: normalizeAccountKey(account.classification, account.name),
          },
          policyDecision: createGovernanceDecision({
            allowed: true,
            requiresApproval: false,
            riskLevel: 'low',
            explanation: 'Manually created chart-of-accounts account (COA management; not money movement).',
            braidTraceId,
          }),
        }),
      );
      coa.push(account);

      return clone(account);
    },

    seedJournalEntry(entry) {
      const bucket = getTenantBucket(store, entry?.tenant_id);
      bucket.journalEntries.push(clone(entry));
      return clone(entry);
    },

    // T-9 / testing: seed a pre-existing approval record directly into the bucket.
    // This lets tests verify that pushApproval() rejects duplicates for ANY caller,
    // not just the two domain methods that were already using inline guards before M-3.
    seedApproval(approval) {
      const bucket = getTenantBucket(store, approval?.tenant_id);
      bucket.approvals.push(clone(approval));
      return clone(approval);
    },

    // Testing: seed a pre-existing invoice / adapter-job directly into the bucket
    // so read-route tests can assert filtering and field-mapping across statuses
    // that the create flows do not produce on their own (e.g. running / failed
    // adapter jobs, non-draft invoices). Mirrors seedJournalEntry / seedApproval.
    seedInvoice(invoice) {
      const bucket = getTenantBucket(store, invoice?.tenant_id);
      bucket.invoices.push(clone(invoice));
      return clone(invoice);
    },

    seedAdapterJob(job) {
      const bucket = getTenantBucket(store, job?.tenant_id);
      bucket.adapterJobs.push(clone(job));
      return clone(job);
    },

    async getState(tenantId) {
      const bucket = clone(getTenantBucket(store, tenantId));
      // Populate auditEvents as an array so the route handler's Array.isArray() check
      // works correctly after the event store replaced the old auditEvents bucket array.
      bucket.auditEvents = await eventStore.query({ tenant_id: tenantId });
      return bucket;
    },

    getEventStore() {
      return eventStore;
    },

    // Phase 3a test seams (plan Task 5). Expose the pure COA history/balance
    // helpers and the live bucket so unit tests can assert posted-history +
    // net-balance directly over seeded journal entries.
    __getBucket(tenantId) {
      return getTenantBucket(store, tenantId);
    },

    __hasPostedHistory(bucket, accountId) {
      return hasPostedHistory(bucket, accountId);
    },

    __accountBalanceCents(bucket, accountId) {
      return accountBalanceCents(bucket, accountId);
    },
  };
}

export default createFinanceDomainService;
