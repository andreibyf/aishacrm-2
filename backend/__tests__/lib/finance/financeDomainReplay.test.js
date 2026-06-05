import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';
import { rebuildBucketFromEvents } from '../../../lib/finance/financeDomainReplay.js';

// Phase 4-1 Task 5 — durable bucket hydration.
//
// rebuildBucketFromEvents folds an ordered list of finance event envelopes into
// a domain-service tenant bucket:
//   { journalEntries, invoices, approvals, adapterJobs, commands: [] }
//
// THE important test (equivalence): drive a representative command sequence
// through a REAL in-memory createFinanceDomainService whose eventStore is a
// recording double capturing every appended envelope. Then rebuild a bucket
// from the captured events and assert it reproduces the live getState() bucket
// bit-for-bit for the four state-bearing collections. This proves the fold
// reconstructs durable state identically to the live in-memory mutations.

const T = '00000000-0000-4000-8000-000000000099';

const BALANCED_LINES = [
  { account_name: 'Cash', classification: 'Asset', debit_cents: 4200, credit_cents: 0 },
  { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 4200 },
];

// Recording event-store double: captures every appended envelope in order and
// exposes it through query()/replay() so getState()/listAuditEvents() stay sane.
function recordingStore() {
  const captured = [];
  return {
    captured,
    append: async (event) => {
      captured.push(event);
      return event;
    },
    query: async () => captured,
    replay: async () => captured,
  };
}

describe('rebuildBucketFromEvents — equivalence with live getState() bucket', () => {
  test('a full command sequence rebuilds the four collections bit-for-bit', async () => {
    const store = recordingStore();
    const service = createFinanceDomainService({ eventStore: store });
    const actor = { id: 'user-1', type: 'human' };

    // createDraftInvoice then updateDraftInvoice (same invoice).
    const created = await service.createDraftInvoice({
      tenantId: T,
      actor,
      payload: {
        customer_id: 'cust-1',
        invoice_number: 'INV-001',
        subtotal_cents: 10000,
        tax_cents: 800,
        total_cents: 10800,
      },
    });
    await service.updateDraftInvoice({
      tenantId: T,
      invoiceId: created.invoice.id,
      actor,
      payload: { memo: 'updated memo', invoice_number: 'INV-001-R1' },
    });

    // createJournalDraft (balanced lines) — a standalone draft journal entry.
    await service.createJournalDraft({
      tenantId: T,
      actor,
      payload: { memo: 'standalone draft', lines: BALANCED_LINES },
    });

    // simulateDealWon — draft journal → pending_approval, an approval, a draft
    // adapter job (one approval.requested event carrying all three records).
    const sim = await service.simulateDealWon({
      tenantId: T,
      actor,
      payload: { deal_id: 'deal-1', amount_cents: 250000 },
    });

    // approveFinanceAction on the simulateDealWon approval — emits
    // approval.approved + a sync_queued via the adapter-job promoter.
    await service.approveFinanceAction({
      tenantId: T,
      approvalId: sim.approval.id,
      actor: { id: 'controller-1', type: 'human' },
    });

    const live = await service.getState(T);
    const rebuilt = rebuildBucketFromEvents(store.captured);

    // Sanity: the live sequence actually produced state in every collection, so
    // the equivalence assertions below are non-trivial.
    assert.ok(live.invoices.length >= 1, 'expected invoices');
    assert.ok(live.journalEntries.length >= 2, 'expected journal entries');
    assert.ok(live.approvals.length >= 1, 'expected approvals');
    assert.ok(live.adapterJobs.length >= 1, 'expected adapter jobs');

    assert.deepEqual(rebuilt.journalEntries, live.journalEntries);
    assert.deepEqual(rebuilt.invoices, live.invoices);
    assert.deepEqual(rebuilt.approvals, live.approvals);
    assert.deepEqual(rebuilt.adapterJobs, live.adapterJobs);

    // commands is always [] in the rebuilt bucket (command envelopes are not
    // events; the historical command log is not needed for guards/lookups).
    assert.deepEqual(rebuilt.commands, []);
  });
});

describe('rebuildBucketFromEvents — focused folds for paths not reachable via commands', () => {
  test('finance.journal.reversal_requested upserts reversal_entry + approval', () => {
    const reversalEntry = {
      id: 'journal_rev_1',
      tenant_id: T,
      status: 'pending_approval',
      memo: 'Reversal of journal_x',
      lines: BALANCED_LINES,
    };
    const approval = {
      id: 'approval_rev_1',
      tenant_id: T,
      target_type: 'journal_entry',
      target_id: 'journal_rev_1',
      status: 'pending',
    };
    const events = [
      {
        event_type: 'finance.journal.reversal_requested',
        tenant_id: T,
        payload: {
          original_entry_id: 'journal_x',
          reversal_entry: reversalEntry,
          approval,
        },
      },
    ];

    const bucket = rebuildBucketFromEvents(events);
    assert.deepEqual(bucket.journalEntries, [reversalEntry]);
    assert.deepEqual(bucket.approvals, [approval]);
    assert.equal(bucket.adapterJobs.length, 0);
  });

  test('finance.approval.rejected upserts the approval with rejected status', () => {
    const requested = {
      id: 'approval_2',
      tenant_id: T,
      target_type: 'journal_entry',
      target_id: 'journal_y',
      status: 'pending',
    };
    const rejected = { ...requested, status: 'rejected', rejected_by: 'controller-9' };
    const events = [
      { event_type: 'finance.approval.requested', tenant_id: T, payload: { approval: requested } },
      { event_type: 'finance.approval.rejected', tenant_id: T, payload: { approval: rejected } },
    ];

    const bucket = rebuildBucketFromEvents(events);
    assert.equal(bucket.approvals.length, 1, 'upsert replaces in place');
    assert.deepEqual(bucket.approvals[0], rejected);
  });

  test('finance.approval.cancelled upserts the approval with cancelled status', () => {
    const requested = {
      id: 'approval_3',
      tenant_id: T,
      target_type: 'journal_entry',
      target_id: 'journal_z',
      status: 'pending',
    };
    const cancelled = { ...requested, status: 'cancelled', cancelled_by: 'user-3' };
    const events = [
      { event_type: 'finance.approval.requested', tenant_id: T, payload: { approval: requested } },
      { event_type: 'finance.approval.cancelled', tenant_id: T, payload: { approval: cancelled } },
    ];

    const bucket = rebuildBucketFromEvents(events);
    assert.equal(bucket.approvals.length, 1);
    assert.deepEqual(bucket.approvals[0], cancelled);
  });

  test('finance.journal.validation_failed is a no-op (creates no state)', () => {
    const events = [
      {
        event_type: 'finance.journal.validation_failed',
        tenant_id: T,
        payload: { errors: ['unbalanced'] },
      },
    ];

    const bucket = rebuildBucketFromEvents(events);
    assert.deepEqual(bucket.journalEntries, []);
    assert.deepEqual(bucket.invoices, []);
    assert.deepEqual(bucket.approvals, []);
    assert.deepEqual(bucket.adapterJobs, []);
    assert.deepEqual(bucket.commands, []);
  });

  test('unknown / infrastructure event types are no-ops', () => {
    const events = [
      { event_type: 'finance.something.unknown', tenant_id: T, payload: { foo: 'bar' } },
      { event_type: 'finance.adapter.sync_succeeded', tenant_id: T, payload: {} },
    ];
    const bucket = rebuildBucketFromEvents(events);
    assert.deepEqual(bucket.journalEntries, []);
    assert.deepEqual(bucket.invoices, []);
    assert.deepEqual(bucket.approvals, []);
    assert.deepEqual(bucket.adapterJobs, []);
  });

  test('upsert-in-place preserves first-insertion order across two creates + an update', () => {
    const inv1 = { id: 'invoice_1', tenant_id: T, status: 'draft', memo: 'a' };
    const inv2 = { id: 'invoice_2', tenant_id: T, status: 'draft', memo: 'b' };
    const inv1Updated = { ...inv1, memo: 'a-updated' };
    const events = [
      { event_type: 'finance.invoice.draft_created', tenant_id: T, payload: { invoice: inv1 } },
      { event_type: 'finance.invoice.draft_created', tenant_id: T, payload: { invoice: inv2 } },
      {
        event_type: 'finance.invoice.draft_updated',
        tenant_id: T,
        payload: { invoice: inv1Updated },
      },
    ];

    const bucket = rebuildBucketFromEvents(events);
    assert.equal(bucket.invoices.length, 2);
    assert.deepEqual(bucket.invoices[0], inv1Updated, 'first entry updated in place');
    assert.deepEqual(bucket.invoices[1], inv2, 'order preserved');
  });

  test('rebuilt records are deep clones (no shared references with input events)', () => {
    const invoice = { id: 'invoice_x', tenant_id: T, status: 'draft', line_items: [{ qty: 1 }] };
    const events = [
      { event_type: 'finance.invoice.draft_created', tenant_id: T, payload: { invoice } },
    ];
    const bucket = rebuildBucketFromEvents(events);
    // Mutating the source event must not leak into the rebuilt bucket.
    invoice.line_items[0].qty = 999;
    assert.equal(bucket.invoices[0].line_items[0].qty, 1, 'stored record is a deep clone');
  });

  test('approval.requested with missing adapter_job/journal_entry guards gracefully', () => {
    const approval = {
      id: 'approval_4',
      tenant_id: T,
      target_type: 'journal_entry',
      target_id: 'journal_q',
      status: 'pending',
    };
    // A historical approval.requested that predates the adapter_job/journal_entry
    // enrichment — only the approval is present.
    const events = [
      { event_type: 'finance.approval.requested', tenant_id: T, payload: { approval } },
    ];
    const bucket = rebuildBucketFromEvents(events);
    assert.deepEqual(bucket.approvals, [approval]);
    assert.equal(bucket.journalEntries.length, 0);
    assert.equal(bucket.adapterJobs.length, 0);
  });
});
