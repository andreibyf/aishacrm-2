import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

// Codex PR #632 P2 — "Avoid exposing non-atomic PG writes". In persistent mode
// the domain service is wired to the Postgres event store, but its write methods
// mutated their in-memory bucket BEFORE awaiting eventStore.append(). If the
// append fails, the bucket already changed → a phantom draft / approval / job is
// exposed through the still-service-backed read endpoints, while the persistent
// store never recorded the event.
//
// The contract these tests pin: the in-memory bucket must NEVER hold state the
// event store hasn't durably recorded. Every write appends FIRST and only
// mutates the bucket after append resolves. With a failing store, a rejected
// write leaves the read surface exactly as it was.

const T = '00000000-0000-4000-8000-000000000050';

const BALANCED_LINES = [
  { account_name: 'Cash', classification: 'Asset', debit_cents: 1000, credit_cents: 0 },
  { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 1000 },
];

// An event store whose append throws on the Nth call (1-indexed); earlier calls
// succeed. query() returns [] so listAuditEvents/getState stay benign.
function failOnNthAppend(n) {
  let calls = 0;
  return {
    append: async () => {
      calls += 1;
      if (calls >= n) throw new Error(`event store down on append #${calls}`);
    },
    query: async () => [],
  };
}

const failingStore = () => failOnNthAppend(1);

describe('financeDomainService — append-before-mutate (no phantom on append failure)', () => {
  test('createJournalDraft: a failed append leaves no phantom journal entry', async () => {
    const service = createFinanceDomainService({ eventStore: failingStore() });
    await assert.rejects(
      () =>
        service.createJournalDraft({
          tenantId: T,
          actor: { id: 'u', type: 'human' },
          payload: { lines: BALANCED_LINES },
        }),
      /event store down/,
    );
    assert.equal(service.listJournalEntries(T).length, 0, 'no phantom journal entry');
  });

  test('createDraftInvoice: a failed append leaves no phantom invoice', async () => {
    const service = createFinanceDomainService({ eventStore: failingStore() });
    await assert.rejects(
      () =>
        service.createDraftInvoice({
          tenantId: T,
          actor: { id: 'u', type: 'human' },
          payload: { customer_id: 'cust-1', total_cents: 5000 },
        }),
      /event store down/,
    );
    assert.equal(service.listInvoices(T).length, 0, 'no phantom invoice');
  });

  test('updateDraftInvoice: a failed append leaves the existing invoice unchanged', async () => {
    const service = createFinanceDomainService({ eventStore: failingStore() });
    const seeded = service.seedInvoice({
      id: 'invoice_seed',
      tenant_id: T,
      status: 'draft',
      customer_id: 'cust-1',
      currency: 'usd',
      total_cents: 100,
      memo: 'original',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    });
    await assert.rejects(
      () =>
        service.updateDraftInvoice({
          tenantId: T,
          invoiceId: seeded.id,
          actor: { id: 'u', type: 'human' },
          payload: { total_cents: 999, memo: 'mutated' },
        }),
      /event store down/,
    );
    const [row] = service.listInvoices(T);
    assert.equal(row.total_cents, 100, 'amount not mutated');
    assert.equal(row.memo, 'original', 'memo not mutated');
  });

  test('simulateDealWon: a failed approval.requested append leaves draft un-promoted, no approval, no adapter job', async () => {
    // The draft_created append (call #1) succeeds; the approval.requested append
    // (call #2) fails — exercising the multi-mutation second half of the flow.
    const service = createFinanceDomainService({ eventStore: failOnNthAppend(2) });
    await assert.rejects(
      () =>
        service.simulateDealWon({
          tenantId: T,
          actor: { id: 'u', type: 'human' },
          payload: { amount_cents: 5000 },
        }),
      /event store down/,
    );
    const entries = service.listJournalEntries(T);
    assert.equal(entries.length, 1, 'the persisted draft remains (its append succeeded)');
    assert.equal(entries[0].status, 'draft', 'draft was NOT promoted to pending_approval');
    assert.equal(service.listApprovals(T).length, 0, 'no phantom approval');
    assert.equal(service.listAdapterJobs(T).length, 0, 'no phantom adapter job');
  });

  test('reverseJournalEntry: a failed append leaves no phantom reversal or approval', async () => {
    const service = createFinanceDomainService({ eventStore: failingStore() });
    service.seedJournalEntry({
      id: 'journal_posted',
      tenant_id: T,
      status: 'posted',
      currency: 'usd',
      lines: BALANCED_LINES,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    });
    await assert.rejects(
      () =>
        service.reverseJournalEntry({
          tenantId: T,
          journalEntryId: 'journal_posted',
          actor: { id: 'u', type: 'human' },
          payload: {},
        }),
      /event store down/,
    );
    assert.equal(service.listJournalEntries(T).length, 1, 'only the original entry, no reversal');
    assert.equal(service.listApprovals(T).length, 0, 'no phantom approval');
  });

  test('approveFinanceAction: a failed append leaves the approval pending', async () => {
    const service = createFinanceDomainService({ eventStore: failingStore() });
    service.seedApproval({
      id: 'approval_seed',
      tenant_id: T,
      target_type: 'journal_entry',
      target_id: 'journal_x',
      status: 'pending',
      requested_by: 'u',
      requested_at: '2026-06-01T00:00:00Z',
    });
    await assert.rejects(
      () =>
        service.approveFinanceAction({
          tenantId: T,
          approvalId: 'approval_seed',
          actor: { id: 'approver', type: 'human' },
        }),
      /event store down/,
    );
    const [row] = service.listApprovals(T);
    assert.equal(row.status, 'pending', 'approval not marked approved');
    assert.equal(row.approved_by ?? null, null, 'no approver recorded');
  });
});
