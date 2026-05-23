import test from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-4000-8000-000000000002';

test('financeDomainService enforces balanced journal drafts', async () => {
  const service = createFinanceDomainService();

  await assert.rejects(
    () =>
      service.createJournalDraft({
        tenantId: TENANT_ID,
        actor: { id: 'user-1', type: 'human' },
        payload: {
          lines: [
            {
              account_name: 'Cash',
              classification: 'Asset',
              debit_cents: 1000,
              credit_cents: 0,
            },
            {
              account_name: 'Revenue',
              classification: 'Revenue',
              debit_cents: 0,
              credit_cents: 900,
            },
          ],
        },
      }),
    /unbalanced/i,
  );
});

test('financeDomainService keeps journal visibility tenant-scoped', async () => {
  const service = createFinanceDomainService();

  await service.createJournalDraft({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: {
      lines: [
        {
          account_name: 'Cash',
          classification: 'Asset',
          debit_cents: 1000,
          credit_cents: 0,
        },
        {
          account_name: 'Revenue',
          classification: 'Revenue',
          debit_cents: 0,
          credit_cents: 1000,
        },
      ],
    },
  });

  assert.equal(service.listJournalEntries(TENANT_ID).length, 1);
  assert.equal(service.listJournalEntries(OTHER_TENANT_ID).length, 0);
});

test('financeDomainService blocks AI approvals', async () => {
  const service = createFinanceDomainService();
  const result = await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 5000 },
  });

  assert.equal(result.approval_required, true);

  await assert.rejects(
    () =>
      service.approveFinanceAction({
        tenantId: TENANT_ID,
        approvalId: result.approval.id,
        actor: { id: 'ai-1', type: 'ai_agent' },
      }),
    /cannot approve/i,
  );
});

// CF-1: approval field naming
test('financeDomainService approval uses target_type and target_id, not aggregate_type/aggregate_id', async () => {
  const service = createFinanceDomainService();
  const result = await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 10000 },
  });

  const approval = result.approval;
  assert.ok('target_type' in approval, 'approval should have target_type field');
  assert.ok('target_id' in approval, 'approval should have target_id field');
  assert.equal(approval.target_type, 'journal_entry');
  assert.equal(approval.target_id, result.journal_entry.id);
  assert.ok(!('aggregate_type' in approval), 'approval must not have aggregate_type field');
  assert.ok(!('aggregate_id' in approval), 'approval must not have aggregate_id field');
});

// Adapter-job shape — simulateDealWon must emit the canonical finance.adapter_jobs
// record shape: aggregate_type / aggregate_id (the Track A envelope vocabulary,
// shared with finance.audit_events / finance.approvals) plus operation / mode,
// which the pre-reconciliation object omitted.
test('financeDomainService simulateDealWon adapter_job carries aggregate_type/aggregate_id and operation/mode', async () => {
  const service = createFinanceDomainService();
  const result = await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 10000 },
  });

  const job = result.adapter_job;
  assert.equal(job.aggregate_type, 'journal_entry', 'adapter_job should carry aggregate_type');
  assert.equal(
    job.aggregate_id,
    result.journal_entry.id,
    'adapter_job.aggregate_id should be the draft journal entry id',
  );
  assert.equal(job.operation, 'push_draft', 'adapter_job should declare its operation');
  assert.equal(job.mode, 'draft_only', 'adapter_job should declare its mode');
  assert.equal(job.status, 'draft', 'adapter_job is created in the pre-approval draft status');
  assert.ok(!('object_type' in job), 'adapter_job must not carry the object_type field');
  assert.ok(!('object_id' in job), 'adapter_job must not carry the object_id field');
});

// CF-6: approval schema completeness
test('financeDomainService approval record includes risk_level, created_at, updated_at', async () => {
  const service = createFinanceDomainService();
  const result = await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 10000 },
  });

  const approval = result.approval;
  assert.ok(approval.risk_level, 'approval should have risk_level');
  assert.ok(approval.created_at, 'approval should have created_at');
  assert.ok(approval.updated_at, 'approval should have updated_at');
});

// CF-2: idempotency guard — simulateDealWon throws 409 when a pending approval
// already exists for the same target journal entry id.
// Uses opts.generateId to produce a deterministic id sequence so the second call
// produces the same journal entry id as the first, triggering the guard.
test('financeDomainService simulateDealWon throws FINANCE_APPROVAL_DUPLICATE on duplicate target_id', async () => {
  // generateId() is called as: `journal_${generateId()}` for journal entries,
  // `approval_${generateId()}` for approvals, and `adapter_job_${generateId()}` for jobs.
  // Sequence per simulateDealWon call: journal entry id raw → approval id raw → adapter job id raw
  const ids = [
    // first simulateDealWon
    'deal_001', // → journal entry id becomes 'journal_deal_001'
    'deal_001', // → approval id becomes 'approval_deal_001'
    'deal_001', // → adapter job id becomes 'adapter_job_deal_001'
    // second simulateDealWon — same raw id → same journal entry id 'journal_deal_001'
    'deal_001', // → journal entry id becomes 'journal_deal_001' (collision!)
    'deal_retry', // → approval id (never reached — guard fires before this)
    'deal_retry', // → adapter job id (never reached)
  ];
  let idIdx = 0;
  const service = createFinanceDomainService({
    generateId: () => ids[idIdx++] ?? 'fallback_id',
  });

  // First call — succeeds
  await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 25000 },
  });

  // Second call — same journal entry id produced, guard detects existing pending approval
  let thrown;
  try {
    await service.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { amount_cents: 25000 },
    });
  } catch (err) {
    thrown = err;
  }

  assert.ok(thrown, 'second simulateDealWon should throw');
  assert.equal(thrown.code, 'FINANCE_APPROVAL_DUPLICATE');
  assert.equal(thrown.statusCode, 409);
  assert.match(thrown.message, /pending approval already exists/i);
});

// T-9: M-3 — centralized pushApproval guard prevents duplicates on ANY code path
// Before M-3, the guard only lived inside simulateDealWon and reverseJournalEntry.
// After M-3 it lives in pushApproval(), so every future caller is automatically protected.
// This test verifies the guard fires when a pending approval is pre-seeded via seedApproval(),
// simulating what would happen if a Phase 2 code path tried to create a second approval
// for the same target without going through simulateDealWon or reverseJournalEntry.
test('T-9: pushApproval guard rejects a second pending approval for the same target via any caller', async () => {
  const service = createFinanceDomainService();
  const TARGET_ID = 'invoice_00000000-0000-4000-8000-000000000099';

  // Seed a pending approval directly into the bucket (simulates a Phase 2 domain method)
  service.seedApproval({
    id: 'approval_pre_existing',
    tenant_id: TENANT_ID,
    target_type: 'invoice',
    target_id: TARGET_ID,
    status: 'pending',
    requested_by: 'user-1',
    requested_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Seed a posted journal entry so simulateDealWon has something to build on
  service.seedJournalEntry({
    id: TARGET_ID,
    tenant_id: TENANT_ID,
    status: 'draft',
    currency: 'usd',
    lines: [],
  });

  // Now try to create an approval for the same target via simulateDealWon — must throw 409
  // We use a custom generateId to force the journal entry to use TARGET_ID
  const ids = ['00000000-0000-4000-8000-000000000099', 'approval_new', 'adapter_new'];
  let idx = 0;
  const service2 = createFinanceDomainService({
    generateId: () => ids[idx++] ?? 'fallback',
  });

  // Seed the pre-existing approval into service2
  service2.seedApproval({
    id: 'approval_pre_existing',
    tenant_id: TENANT_ID,
    target_type: 'journal_entry',
    target_id: `journal_${ids[0]}`,
    status: 'pending',
    requested_by: 'user-1',
    requested_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  let thrown;
  try {
    await service2.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { amount_cents: 5000 },
    });
  } catch (err) {
    thrown = err;
  }

  assert.ok(thrown, 'should throw when a pending approval already exists for the target');
  assert.equal(thrown.code, 'FINANCE_APPROVAL_DUPLICATE');
  assert.equal(thrown.statusCode, 409);
});

// Task 6 — async event path: the domain service must await eventStore.append so that
// async event stores (e.g., financeEventStore.pg.js) work. With the previous sync
// implementation, appendEvent did not await — the returned Promise was discarded and
// any error from the async store became an unhandled rejection. This test drives the
// switch by surfacing a rejection from the async store: only an awaiting caller can
// observe the failure as a thrown error.
test('financeDomainService awaits async event store on createDraftInvoice', async () => {
  const appended = [];
  const asyncEventStore = {
    append: async (envelope) => {
      // Yield to the event loop so we are unambiguously asynchronous, then either
      // record the envelope (success path) or signal failure to a caller that awaits.
      await Promise.resolve();
      if (envelope.event_type === 'finance.invoice.draft_created' && envelope.__probe_fail) {
        throw new Error('event store rejected');
      }
      appended.push(envelope);
      return envelope;
    },
    query: async () => [],
    replay: async () => [],
    getCount: async () => 0,
  };
  const service = createFinanceDomainService({ eventStore: asyncEventStore });

  // Happy path — caller must await and observe the appended envelope synchronously
  // after the await resolves.
  const result = await service.createDraftInvoice({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { customer_id: 'cust_1', subtotal_cents: 1000, total_cents: 1000 },
  });

  assert.ok(result.invoice, 'createDraftInvoice should return the invoice');
  assert.equal(appended.length, 1, 'async event store should receive the envelope');
  assert.equal(appended[0].event_type, 'finance.invoice.draft_created');
  assert.equal(appended[0].tenant_id, TENANT_ID);
  assert.equal(appended[0].aggregate_id, result.invoice.id);

  // Failure path — a sync (non-awaiting) call site would *not* throw here because the
  // store's rejection lives in a discarded Promise. An awaiting caller MUST observe the
  // rejection as a thrown error. We probe by passing a custom payload field that the
  // event-envelope factory propagates onto the envelope.
  let thrown;
  try {
    // Inject the probe by stubbing eventStore.append to always reject for the second
    // invocation regardless of the envelope shape — this isolates the await behavior.
    asyncEventStore.append = async () => {
      await Promise.resolve();
      throw new Error('event store rejected');
    };
    await service.createDraftInvoice({
      tenantId: TENANT_ID,
      actor: { id: 'user-2', type: 'human' },
      payload: { customer_id: 'cust_2', subtotal_cents: 2000, total_cents: 2000 },
    });
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, 'awaiting caller must observe event store rejection');
  assert.match(thrown.message, /event store rejected/);
});

test('financeDomainService reversal creates a new journal entry instead of deleting history', async () => {
  const service = createFinanceDomainService();

  service.seedJournalEntry({
    id: 'journal-posted-1',
    tenant_id: TENANT_ID,
    status: 'posted',
    memo: 'Posted revenue',
    currency: 'usd',
    lines: [
      {
        account_name: 'Cash',
        classification: 'Asset',
        debit_cents: 2000,
        credit_cents: 0,
      },
      {
        account_name: 'Revenue',
        classification: 'Revenue',
        debit_cents: 0,
        credit_cents: 2000,
      },
    ],
  });

  const result = await service.reverseJournalEntry({
    tenantId: TENANT_ID,
    journalEntryId: 'journal-posted-1',
    actor: { id: 'user-2', type: 'human' },
    payload: { memo: 'Correction' },
  });

  const entries = service.listJournalEntries(TENANT_ID);
  assert.equal(entries.length, 2);
  assert.equal(result.reversal_entry.reversal_of, 'journal-posted-1');
  assert.equal(entries[0].id, 'journal-posted-1');
  assert.equal(entries[1].id, result.reversal_entry.id);
});
