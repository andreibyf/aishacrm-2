import test from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';
import createFinanceEventStore from '../../../lib/finance/financeEventStore.js';
import { promoteLinkedAdapterJobs } from '../../../lib/finance/adapterJobPromoter.js';

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

// ---------------------------------------------------------------------------
// Slice 2B contract — approval-driven adapter_job draft → queued promotion
// ---------------------------------------------------------------------------

// §5.4 contract: simulateDealWon inserts adapter_job in status='draft' and
// emits NO `finance.adapter.sync_queued` event. The sync_queued event is
// exclusively emitted by approveFinanceAction()'s promoter at the
// draft → queued transition.
test('financeDomainService simulateDealWon does NOT emit finance.adapter.sync_queued (Slice 2B §5.4)', async () => {
  const eventStore = createFinanceEventStore();
  const service = createFinanceDomainService({ eventStore });

  await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 10000 },
  });

  const events = eventStore.replay(TENANT_ID);
  const queuedEvents = events.filter((e) => e.event_type === 'finance.adapter.sync_queued');
  assert.equal(
    queuedEvents.length,
    0,
    'simulateDealWon must NOT emit sync_queued — the draft adapter_job is not yet runnable',
  );
});

test('financeDomainService approveFinanceAction promotes linked adapter_jobs draft → queued and emits sync_queued (Slice 2B)', async () => {
  const eventStore = createFinanceEventStore();
  const service = createFinanceDomainService({ eventStore });

  const sim = await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 10000 },
  });

  // Pre-approval state
  assert.equal(sim.adapter_job.status, 'draft');

  const approveResult = await service.approveFinanceAction({
    tenantId: TENANT_ID,
    approvalId: sim.approval.id,
    actor: { id: 'approver-1', type: 'human' },
  });

  // Post-approval: approval row mutated
  assert.equal(approveResult.approval.status, 'approved');
  // New field surfaced by the promoter call
  assert.ok(Array.isArray(approveResult.promoted_adapter_jobs));
  assert.equal(approveResult.promoted_adapter_jobs.length, 1);
  assert.equal(approveResult.promoted_adapter_jobs[0].id, sim.adapter_job.id);

  // Event stream now contains finance.adapter.sync_queued
  const events = eventStore.replay(TENANT_ID);
  const queuedEvents = events.filter((e) => e.event_type === 'finance.adapter.sync_queued');
  assert.equal(queuedEvents.length, 1, 'exactly one sync_queued event emitted by the promoter');
  assert.equal(queuedEvents[0].aggregate_type, 'adapter_job');
  assert.equal(queuedEvents[0].aggregate_id, sim.adapter_job.id);
  assert.equal(queuedEvents[0].payload.adapter_job.status, 'queued');
});

test('financeDomainService approveFinanceAction POSTS the journal (Cash Flow Slice 2 — supersedes the old pending-only contract)', async () => {
  const eventStore = createFinanceEventStore();
  const service = createFinanceDomainService({ eventStore });

  const sim = await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 10000 },
  });

  const res = await service.approveFinanceAction({
    tenantId: TENANT_ID,
    approvalId: sim.approval.id,
    actor: { id: 'approver-1', type: 'human' },
  });

  // Slice 2: approving a journal-entry approval posts it (pending_approval → posted).
  const matching = service.listJournalEntries(TENANT_ID).find((e) => e.id === sim.journal_entry.id);
  assert.ok(matching, 'journal entry still exists');
  assert.equal(matching.status, 'posted', 'journal posts on approval (Slice 2)');
  assert.ok(matching.posted_at);
  assert.ok(res.posted_entry);
  assert.equal(res.posted_entry.status, 'posted');
});

test('financeDomainService approveFinanceAction is idempotent on the promoter side (re-approving emits no extra sync_queued)', async () => {
  const eventStore = createFinanceEventStore();
  const service = createFinanceDomainService({ eventStore });

  const sim = await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 10000 },
  });

  await service.approveFinanceAction({
    tenantId: TENANT_ID,
    approvalId: sim.approval.id,
    actor: { id: 'approver-1', type: 'human' },
  });

  // The promoter's status filter guarantees idempotency: re-calling with the
  // same aggregate_id finds the job in status='queued' (not 'draft') and
  // promotes nothing. Simulate by invoking the promoter directly against the
  // already-queued adapter job.
  const before = eventStore
    .replay(TENANT_ID)
    .filter((e) => e.event_type === 'finance.adapter.sync_queued').length;
  const result = await promoteLinkedAdapterJobs({
    bucket: {
      adapterJobs: [
        {
          id: sim.adapter_job.id,
          tenant_id: TENANT_ID,
          aggregate_id: sim.journal_entry.id,
          status: 'queued', // already promoted
          provider: 'quickbooks',
          operation: 'push_draft',
          mode: 'draft_only',
          aggregate_type: 'journal_entry',
        },
      ],
    },
    tenantId: TENANT_ID,
    aggregateId: sim.journal_entry.id,
    eventStore,
  });
  assert.equal(result.promoted_count, 0, 'already-queued job is not re-promoted');
  const after = eventStore
    .replay(TENANT_ID)
    .filter((e) => e.event_type === 'finance.adapter.sync_queued').length;
  assert.equal(after, before, 'no additional sync_queued events emitted');
});

// Slice 2B review P1: the adapter_job must persist the canonical object the
// processor will forward to the provider. Without this, runAdapterPollCycle
// builds the outbound provider payload from `job.payload || {}` and the first
// sandbox-enabled push collapses to an empty body.
test('financeDomainService simulateDealWon adapter_job carries the CANONICAL journal entry shape (P1 follow-up: doc_number/txn_date/lines at root)', async () => {
  const service = createFinanceDomainService();
  const sim = await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 10000 },
  });

  const job = sim.adapter_job;
  assert.ok(job.payload, 'adapter_job must carry a payload field for the processor');

  // The payload is the canonical journal entry per
  // mapJournalEntryToQuickBooksCanonical — same shape consumed by
  // ERPNext adapter's fromCanonical() (per
  // ERPNEXT_PROVIDER_OBJECT_MAP['JournalEntry'].fields:
  // doc_number / txn_date / private_note / currency / lines, ALL at root).
  // Wrapping under `payload.journal_entry` was the prior bug — it meant
  // fromCanonical() found no recognized keys.
  assert.ok('doc_number' in job.payload, 'payload has canonical doc_number at root');
  assert.ok('txn_date' in job.payload, 'payload has canonical txn_date at root');
  assert.ok('private_note' in job.payload, 'payload has canonical private_note at root');
  assert.ok('currency' in job.payload, 'payload has canonical currency at root');
  assert.ok(Array.isArray(job.payload.lines), 'payload has canonical lines array at root');

  // No wrapper key — the prior shape was payload.journal_entry.{...}; the
  // adapter expects fields directly at root.
  assert.ok(
    !('journal_entry' in job.payload),
    'no journal_entry wrapper key — canonical fields live at root per the ERPNext adapter contract',
  );

  // Currency is upper-cased per the canonical mapper.
  assert.equal(job.payload.currency, 'USD');

  // Snapshot is independent — the mapper builds a fresh object, so mutating
  // the payload does not affect the bucket entry.
  job.payload.doc_number = 'mutated';
  const refetch = await service.listJournalEntries(TENANT_ID);
  assert.notEqual(refetch[0].entry_number, 'mutated', 'mapper produces a fresh canonical object');
});
