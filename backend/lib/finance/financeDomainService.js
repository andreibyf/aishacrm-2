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
  function pushApproval(bucket, record) {
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

    async listAuditEvents(tenantId) {
      return await eventStore.query({ tenant_id: tenantId });
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
      bucket.invoices.push(invoice);

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
          payload: { invoice },
          policyDecision: decision,
        }),
      );

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

      Object.assign(invoice, payload, {
        updated_by: normalizedActor.id,
        updated_at: now(),
      });

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
          payload: { invoice: clone(invoice) },
          policyDecision: decision,
        }),
      );

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

      const journalEntry = {
        id: `journal_${generateId()}`,
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
        lines: validation.lines,
        created_at: now(),
        updated_at: now(),
      };
      bucket.journalEntries.push(journalEntry);

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

      const draftEntry = bucket.journalEntries.find((entry) => entry.id === draft.journal_entry.id);
      draftEntry.status = 'pending_approval';
      draftEntry.governance_policy_snapshot = decision;
      draftEntry.updated_at = now();

      const approval = pushApproval(
        bucket,
        buildApprovalRecord({
          tenantId,
          actor: normalizedActor,
          aggregateType: 'journal_entry',
          aggregateId: draftEntry.id,
          decision,
          requestId,
        }),
      );

      const adapterJob = {
        id: `adapter_job_${generateId()}`,
        tenant_id: tenantId,
        status: 'draft',
        provider: payload.provider || 'quickbooks',
        aggregate_type: 'journal_entry',
        aggregate_id: draftEntry.id,
        operation: 'push_draft',
        mode: 'draft_only',
        created_at: now(),
        updated_at: now(),
      };
      bucket.adapterJobs.push(adapterJob);

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
          payload: { approval: clone(approval), adapter_job: clone(adapterJob) },
          policyDecision: decision,
        }),
      );

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

      bucket.journalEntries.push(reversalEntry);

      const approval = pushApproval(
        bucket,
        buildApprovalRecord({
          tenantId,
          actor: normalizedActor,
          aggregateType: 'journal_entry',
          aggregateId: reversalEntry.id,
          decision,
          requestId,
        }),
      );

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

      approval.status = 'approved';
      approval.approved_by = normalizedActor.id;
      approval.approved_at = now();

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
          payload: { approval: clone(approval) },
          policyDecision: decision,
        }),
      );

      return {
        approval: clone(approval),
        governance_decision: decision,
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
