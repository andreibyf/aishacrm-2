import { randomUUID } from 'node:crypto';
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
} from './chartOfAccounts.js';

function createStore() {
  return {
    tenants: new Map(),
  };
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

      // Append-before-mutate (PR #632 P2): persist the approved transition before
      // mutating the in-memory approval, so a failed append leaves it pending.
      // The append must also land before promoteLinkedAdapterJobs runs, since the
      // promotion is a consequence of a durably-recorded approval.
      const approvedApproval = {
        ...approval,
        status: 'approved',
        approved_by: normalizedActor.id,
        approved_at: now(),
      };

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
        }),
      );
      Object.assign(approval, approvedApproval);

      // Slice 2B: promote any linked adapter_jobs from `draft → queued` and
      // emit one `finance.adapter.sync_queued` event per promoted job. The
      // linkage is structural via shared `aggregate_id` — see §4.1 of the
      // slice-2 adapter runtime design freeze. The promoter is a no-op for
      // approvals whose target has no linked adapter_jobs.
      //
      // IMPORTANT — Phase 3-8 §5.7 contract preserved: this does NOT modify
      // the journal entry's status. The journal stays at `pending_approval`.
      // Only the adapter_job transitions. Journal posting is NOT a Slice 2
      // deliverable.
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
      };
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
  };
}

export default createFinanceDomainService;
