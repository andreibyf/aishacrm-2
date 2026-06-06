import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionRunner } from '../../../../lib/finance/projections/projectionRunner.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import { createLedgerProjectionWorker } from '../../../../lib/finance/projections/ledgerProjection.js';
import { createApprovalQueueProjectionWorker } from '../../../../lib/finance/projections/approvalQueueProjection.js';
import { createAdapterQueueProjectionWorker } from '../../../../lib/finance/projections/adapterQueueProjection.js';
import { createJournalEntriesProjectionWorker } from '../../../../lib/finance/projections/journalEntriesProjection.js';
import { createInvoiceProjectionWorker } from '../../../../lib/finance/projections/invoiceProjection.js';
import {
  createProjectionBackedFinanceReadAdapter,
  FinanceReadDegradedError,
} from '../../../../lib/finance/readAdapters/projectionBackedFinanceReadAdapter.js';
import { seedAccountsForTenant } from '../../../../lib/finance/chartOfAccounts.js';

const T = '00000000-0000-4000-8000-000000000011';

// A minimal projection-store-shaped stub so the journal_entries read inside
// listAccounts (Phase 5 has_posted_history stamping) resolves to an empty list
// instead of crashing on a bare `{}` provider. Returns NO journal entries, so
// every folded account gets has_posted_history:false unless the test seeds lines.
const EMPTY_STORE = {
  get: () => undefined,
  set: () => {},
  delete: () => {},
  keys: () => [],
  clear: () => {},
};
const emptyStoreProvider = () => ({ getLiveStore: async () => EMPTY_STORE });

// A store provider whose journal_entries projection returns the given entry
// snapshots (with `lines`), so has_posted_history can be exercised.
function storeProviderWithJournalEntries(entries) {
  const store = {
    get: (k) => store._m.get(k),
    set: (k, v) => store._m.set(k, v),
    delete: (k) => store._m.delete(k),
    keys: () => Array.from(store._m.keys()),
    clear: () => store._m.clear(),
    _m: new Map((entries || []).map((e) => [e.id, e])),
  };
  return () => ({ getLiveStore: async () => store });
}

function workers() {
  return {
    ledger: createLedgerProjectionWorker(),
    journalEntries: createJournalEntriesProjectionWorker(),
    approvalQueue: createApprovalQueueProjectionWorker(),
    adapterQueue: createAdapterQueueProjectionWorker(),
    invoices: createInvoiceProjectionWorker(),
  };
}

// Build real projection snapshots by dispatching a journal lifecycle through a
// runner backed by the memory store provider, then hand the SAME provider +
// workers to the adapter.
async function seededProvider(w) {
  const storeProvider = createMemoryProjectionStoreProvider();
  const runner = createProjectionRunner({
    eventStore: { replay: async () => [] },
    storeProvider,
  });
  for (const worker of Object.values(w)) runner.register(worker);

  const draftCreated = {
    id: 'evt_dc',
    tenant_id: T,
    event_type: 'finance.journal.draft_created',
    created_at: '2026-06-01T00:00:01Z',
    payload: {
      journal_entry: {
        id: 'j1',
        tenant_id: T,
        status: 'draft',
        created_at: '2026-06-01T00:00:01Z',
        currency: 'usd',
        lines: [],
      },
    },
  };
  const approvalRequested = {
    id: 'evt_ar',
    tenant_id: T,
    event_type: 'finance.approval.requested',
    created_at: '2026-06-01T00:00:02Z',
    payload: {
      approval: {
        id: 'appr1',
        status: 'pending',
        target_type: 'journal_entry',
        target_id: 'j1',
        requested_by: 'u',
        requested_at: '2026-06-01T00:00:02Z',
      },
      adapter_job: { id: 'aj1', status: 'queued', operation: 'push_draft' },
      journal_entry: {
        id: 'j1',
        tenant_id: T,
        status: 'pending_approval',
        created_at: '2026-06-01T00:00:01Z',
        updated_at: '2026-06-01T00:00:02Z',
        currency: 'usd',
        lines: [],
      },
    },
  };
  const invoiceDraftCreated = {
    id: 'evt_inv_dc',
    tenant_id: T,
    event_type: 'finance.invoice.draft_created',
    created_at: '2026-06-01T00:00:03Z',
    payload: {
      invoice: {
        id: 'inv1',
        tenant_id: T,
        status: 'draft',
        total_cents: 1000,
        currency: 'usd',
      },
    },
  };
  await runner.dispatch(draftCreated);
  await runner.dispatch(approvalRequested);
  await runner.dispatch(invoiceDraftCreated);
  return storeProvider;
}

describe('ProjectionBackedFinanceReadAdapter', () => {
  test('listAccounts folds the ordered account stream over the baseline + threads the Test/Live partition (Codex PR #647 P2)', async () => {
    const w = workers();
    const calls = [];
    const auditEventsReader = {
      count: async () => 0,
      listByTypesOrdered: async (tenantId, eventTypes, { isTestData } = {}) => {
        calls.push({ tenantId, eventTypes, isTestData });
        return [
          {
            event_type: 'finance.account.created',
            payload: {
              account_id: 'acct_x_4500',
              account_code: '4500',
              name: 'Consulting Fees',
              classification: 'Revenue',
              account_type: 'Revenue',
            },
          },
        ];
      },
    };
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: emptyStoreProvider,
      auditEventsReader,
      workers: w,
    });
    const accounts = await adapter.listAccounts(T, { isTestData: true });
    // baseline (8) + the one folded auto-created account
    assert.equal(accounts.length, 9);
    assert.ok(accounts.find((a) => a.account_code === '1000' && a.is_system === true));
    const created = accounts.find((a) => a.account_code === '4500');
    assert.equal(created.is_system, false);
    assert.equal(created.name, 'Consulting Fees');
    // ordered multi-type read: all three account event types, partition threaded
    assert.deepEqual(calls[0].eventTypes, [
      'finance.account.created',
      'finance.account.updated',
      'finance.account.deactivated',
    ]);
    assert.equal(calls[0].tenantId, T);
    assert.equal(calls[0].isTestData, true);
  });

  // ORDERING regression (Phase 4): a create→deactivate→reactivate stream folds in
  // global append order, so the reactivation (finance.account.updated, is_active:true)
  // — which arrives AFTER the deactivation — wins. A per-type fold would re-flip it off.
  test('listAccounts folds create→deactivate→reactivate in order → is_active:true', async () => {
    const w = workers();
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: emptyStoreProvider,
      auditEventsReader: {
        count: async () => 0,
        // Events already returned in global append order by the reader.
        listByTypesOrdered: async () => [
          {
            event_type: 'finance.account.created',
            payload: {
              account_id: 'acct_bank',
              account_code: '1500',
              name: 'Operating Bank',
              classification: 'Asset',
              account_type: 'Bank',
              source: 'manual',
            },
          },
          { event_type: 'finance.account.deactivated', payload: { account_id: 'acct_bank', reason: 'closing' } },
          // reactivated (rides finance.account.updated; full snapshot, is_active:true)
          {
            event_type: 'finance.account.updated',
            payload: {
              account: {
                id: 'acct_bank',
                tenant_id: T,
                account_code: '1500',
                name: 'Operating Bank',
                classification: 'Asset',
                account_type: 'Bank',
                is_system: false,
                is_active: true,
                source: 'manual',
              },
            },
          },
        ],
      },
      workers: w,
    });
    const accounts = await adapter.listAccounts(T, { isTestData: true });
    const acc = accounts.find((a) => a.id === 'acct_bank');
    assert.ok(acc, 'folded account is present');
    assert.equal(acc.is_active, true, 'reactivation (last in order) wins');
  });

  // A second concurrent finance.account.created shares the first's name-derived
  // account_id (append-always store, each write hydrates before the other appends).
  // The fold MUST switch on event_type — a shape-only fold sees account_id already
  // folded and misreads the second create as a deactivation, flipping it inactive.
  test('a SECOND concurrent finance.account.created (same id) stays ACTIVE — not a deactivation (Codex PR #651 P2)', async () => {
    const w = workers();
    const created = {
      account_id: 'acct_dup',
      account_code: '1500',
      name: 'Operating Bank',
      classification: 'Asset',
      account_type: 'Bank',
      source: 'manual',
    };
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: emptyStoreProvider,
      auditEventsReader: {
        count: async () => 0,
        listByTypesOrdered: async () => [
          { event_type: 'finance.account.created', payload: created },
          { event_type: 'finance.account.created', payload: created },
        ],
      },
      workers: w,
    });
    const accounts = await adapter.listAccounts(T, { isTestData: true });
    const acc = accounts.find((a) => a.id === 'acct_dup');
    assert.ok(acc, 'the concurrently-created account is present');
    assert.equal(acc.is_active, true, 'a duplicate create must NOT be misread as a deactivation');
  });

  test('listAccounts fails closed (FinanceReadDegradedError) when the reader throws', async () => {
    const w = workers();
    const adapter = createProjectionBackedFinanceReadAdapter({
      // Working journal_entries store so the failure is isolated to the COA
      // (auditEventsReader) read, not the Phase 5 has_posted_history read.
      createStoreProvider: emptyStoreProvider,
      auditEventsReader: {
        count: async () => 0,
        listByTypesOrdered: async () => {
          throw new Error('db down');
        },
      },
      workers: w,
    });
    await assert.rejects(() => adapter.listAccounts(T), /chart of accounts/i);
  });

  test('journal-entries read includes the pending_approval entry from the projection', async () => {
    const w = workers();
    const storeProvider = await seededProvider(w);
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => storeProvider,
      auditEventsReader: { count: async () => 2 },
      workers: w,
    });
    const entries = await adapter.listJournalEntries(T);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'j1');
    assert.equal(entries[0].status, 'pending_approval');
  });

  test('ledger / P&L / balance-sheet derive from the ledger projection (empty without posted events)', async () => {
    const w = workers();
    const storeProvider = await seededProvider(w);
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => storeProvider,
      auditEventsReader: { count: async () => 2 },
      workers: w,
    });
    assert.deepEqual(await adapter.getLedger(T), {
      accounts: [],
      totals: { debit_cents: 0, credit_cents: 0 },
    });
    const pl = await adapter.getProfitLoss(T);
    assert.equal(pl.totals.net_income_cents, 0);
    const bs = await adapter.getBalanceSheet(T);
    assert.equal(bs.totals.is_balanced, true);
  });

  test('runtime/status reports persistent mode, projection counts, and lag', async () => {
    const w = workers();
    const storeProvider = await seededProvider(w);
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => storeProvider,
      auditEventsReader: { count: async () => 2 },
      workers: w,
    });
    const status = await adapter.getRuntimeStatus(T);
    assert.equal(status.runtime.persistence, 'persistent');
    assert.equal(status.runtime.mode, 'persistent');
    assert.equal(status.counts.journal_entries, 1);
    assert.equal(status.counts.invoices, 1);
    assert.equal(status.counts.audit_events, 2);
    assert.equal(status.persistence_lag.audit_events_total, 2);
    assert.ok(status.persistence_lag.projections['finance.projection.journal_entries']);
    assert.ok(status.persistence_lag.projections['finance.projection.invoices']);
  });

  test('runtime/status partitions the audit count by the active mode (Codex PR #634 P2)', async () => {
    const w = workers();
    const storeProvider = await seededProvider(w);
    const countCalls = [];
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => storeProvider,
      auditEventsReader: {
        count: async (tenantId, isTestData) => {
          countCalls.push({ tenantId, isTestData });
          return 3;
        },
      },
      workers: w,
    });

    const status = await adapter.getRuntimeStatus(T, { isTestData: true });
    // The audit count is scoped to the active (test) partition, not all rows.
    assert.deepEqual(countCalls, [{ tenantId: T, isTestData: true }]);
    assert.equal(status.counts.audit_events, 3);
    assert.equal(status.persistence_lag.audit_events_total, 3);
  });

  test('no silent fallback: a projection-store read failure throws FinanceReadDegradedError', async () => {
    const w = workers();
    const failingProvider = {
      getLiveStore: async () => {
        throw new Error('pg down');
      },
      getState: async () => null,
    };
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => failingProvider,
      auditEventsReader: { count: async () => 0 },
      workers: w,
    });
    await assert.rejects(() => adapter.listJournalEntries(T), FinanceReadDegradedError);
    await assert.rejects(() => adapter.getLedger(T), FinanceReadDegradedError);
  });

  test('no silent fallback: an audit_events read failure throws on runtime/status', async () => {
    const w = workers();
    const storeProvider = await seededProvider(w);
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => storeProvider,
      auditEventsReader: {
        count: async () => {
          throw new Error('pg down');
        },
      },
      workers: w,
    });
    await assert.rejects(() => adapter.getRuntimeStatus(T), FinanceReadDegradedError);
  });

  // P2 fix: getState failures in the per-projection lag loop must not be silently
  // masked — they must raise FinanceReadDegradedError (§6 no-silent-fallback).
  test('no silent fallback: a projection_state read failure (getState) throws on runtime/status', async () => {
    const w = workers();
    // A projection-store-shaped stub (keys() returns an array, matching the real
    // memory/pg stores) so getProjection runs and the failure is genuinely the
    // getState call — not an incidental TypeError from a native Map.
    const emptyStore = {
      get: () => undefined,
      set: () => {},
      delete: () => {},
      keys: () => [],
      clear: () => {},
    };
    const failingProvider = {
      getLiveStore: async () => emptyStore,
      getState: async () => {
        throw new Error('projection_state query failed');
      },
    };
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => failingProvider,
      auditEventsReader: { count: async () => 2 },
      workers: w,
    });
    await assert.rejects(() => adapter.getRuntimeStatus(T), FinanceReadDegradedError);
  });

  // Fix A: exercise listApprovals' rejected/cancelled reconstruction branches.
  // The parity test can only produce `approved` (the domain service only exposes
  // approveFinanceAction), so dispatch the approval lifecycle directly to
  // materialize one resolved approval per terminal status and assert the adapter
  // stamps the correct status-specific decision fields.
  test('listApprovals reconstructs approved / rejected / cancelled decision fields per status', async () => {
    const w = workers();
    const storeProvider = createMemoryProjectionStoreProvider();
    const runner = createProjectionRunner({
      eventStore: { replay: async () => [] },
      storeProvider,
    });
    for (const worker of Object.values(w)) runner.register(worker);

    // A finance.approval.requested event for the given approval id.
    const requested = (approvalId, targetId) => ({
      id: `evt_req_${approvalId}`,
      tenant_id: T,
      event_type: 'finance.approval.requested',
      created_at: '2026-06-01T00:00:01Z',
      actor_id: 'u_requester',
      payload: {
        approval: {
          id: approvalId,
          tenant_id: T,
          status: 'pending',
          target_type: 'journal_entry',
          target_id: targetId,
          requested_by: 'u_requester',
          requested_at: '2026-06-01T00:00:01Z',
          created_at: '2026-06-01T00:00:01Z',
        },
      },
    });
    // A resolution event (approved/rejected/cancelled). The projection stamps
    // resolved_by from actor_id and resolved_at from created_at.
    const resolved = (eventType, approvalId, actorId) => ({
      id: `evt_res_${approvalId}`,
      tenant_id: T,
      event_type: eventType,
      created_at: '2026-06-01T00:01:00Z',
      actor_id: actorId,
      payload: { approval: { id: approvalId } },
    });

    await runner.dispatch(requested('appr_ok', 'j_ok'));
    await runner.dispatch(requested('appr_rej', 'j_rej'));
    await runner.dispatch(requested('appr_can', 'j_can'));
    await runner.dispatch(resolved('finance.approval.approved', 'appr_ok', 'u_boss'));
    await runner.dispatch(resolved('finance.approval.rejected', 'appr_rej', 'u_boss'));
    await runner.dispatch(resolved('finance.approval.cancelled', 'appr_can', 'u_alice'));

    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => storeProvider,
      auditEventsReader: { count: async () => 0 },
      workers: w,
    });

    const approvals = await adapter.listApprovals(T);
    const byId = Object.fromEntries(approvals.map((a) => [a.id, a]));

    const approved = byId.appr_ok;
    assert.equal(approved.status, 'approved');
    assert.equal(approved.approved_by, 'u_boss');
    assert.equal(approved.approved_at, '2026-06-01T00:01:00Z');
    assert.equal(approved.rejected_by, undefined);
    assert.equal(approved.cancelled_by, undefined);
    assert.equal(approved.requested_by, 'u_requester');
    assert.equal(approved.requested_at, '2026-06-01T00:00:01Z');

    const rejected = byId.appr_rej;
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.rejected_by, 'u_boss');
    assert.equal(rejected.rejected_at, '2026-06-01T00:01:00Z');
    assert.equal(rejected.approved_by, undefined);
    assert.equal(rejected.cancelled_by, undefined);
    assert.equal(rejected.requested_by, 'u_requester');
    assert.equal(rejected.requested_at, '2026-06-01T00:00:01Z');

    const cancelled = byId.appr_can;
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelled_by, 'u_alice');
    assert.equal(cancelled.cancelled_at, '2026-06-01T00:01:00Z');
    assert.equal(cancelled.approved_by, undefined);
    assert.equal(cancelled.rejected_by, undefined);
    assert.equal(cancelled.requested_by, 'u_requester');
    assert.equal(cancelled.requested_at, '2026-06-01T00:00:01Z');
  });

  // #2: the route must not serve a snapshot cached for the router lifetime — the
  // adapter builds a FRESH store provider per request.
  test('builds a fresh store provider per request (no cached-for-lifetime snapshot)', async () => {
    const w = workers();
    const storeProvider = await seededProvider(w);
    let providerBuilds = 0;
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => {
        providerBuilds += 1;
        return storeProvider;
      },
      auditEventsReader: { count: async () => 0 },
      workers: w,
    });
    await adapter.listJournalEntries(T);
    await adapter.listJournalEntries(T);
    await adapter.getLedger(T);
    assert.equal(providerBuilds, 3, 'a fresh provider is built for every read request');
  });

  // Codex PR #632-followup P2: a FAILED adapter job's error text must surface on
  // /adapter-jobs in persistent mode. The route serializer reads `last_error`,
  // but the adapter_queue projection stores it as `error_message`; the adapter
  // must map it back to `last_error` or the failure text is silently dropped.
  test('listAdapterJobs surfaces a failed job error as last_error (route contract)', async () => {
    const w = workers();
    const storeProvider = createMemoryProjectionStoreProvider();
    const runner = createProjectionRunner({
      eventStore: { replay: async () => [] },
      storeProvider,
    });
    for (const worker of Object.values(w)) runner.register(worker);

    await runner.dispatch({
      id: 'evt_sync_failed',
      tenant_id: T,
      event_type: 'finance.adapter.sync_failed',
      created_at: '2026-06-01T00:05:00Z',
      payload: {
        adapter_job: {
          id: 'aj_failed',
          tenant_id: T,
          provider: 'quickbooks',
          operation: 'push_draft',
          mode: 'draft_only',
          status: 'failed',
          attempts: 2,
          error_message: 'provider sync timed out',
        },
      },
    });

    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => storeProvider,
      auditEventsReader: { count: async () => 0 },
      workers: w,
    });

    const [job] = await adapter.listAdapterJobs(T);
    assert.equal(job.id, 'aj_failed');
    assert.equal(job.status, 'failed');
    // The error must land on `last_error` (route-consumed), not be dropped.
    assert.equal(job.last_error, 'provider sync timed out');
    assert.equal('error_message' in job, false, 'reconstruct to last_error, not error_message');
  });

  // Phase 5 (editable COA manager): listAccounts stamps has_posted_history true
  // for an account appearing in a posted/reversed journal line, false otherwise.
  test('listAccounts stamps has_posted_history from the journal_entries projection', async () => {
    const w = workers();
    const folded = {
      account_id: 'acct_posted',
      account_code: '4500',
      name: 'Consulting Fees',
      classification: 'Revenue',
      account_type: 'Revenue',
      source: 'manual',
    };
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: storeProviderWithJournalEntries([
        {
          id: 'je_posted',
          status: 'posted',
          lines: [
            { account_id: 'acct_posted', debit_cents: 0, credit_cents: 5000 },
            { account_id: 'acct_1000_cash', debit_cents: 5000, credit_cents: 0 },
          ],
        },
        {
          id: 'je_draft',
          status: 'draft',
          lines: [{ account_id: 'acct_never', debit_cents: 1000, credit_cents: 0 }],
        },
      ]),
      auditEventsReader: {
        count: async () => 0,
        listByTypesOrdered: async () => [{ event_type: 'finance.account.created', payload: folded }],
      },
      workers: w,
    });
    const accounts = await adapter.listAccounts(T, { isTestData: true });
    const posted = accounts.find((a) => a.id === 'acct_posted');
    assert.equal(posted.has_posted_history, true, 'account in a posted line is flagged');
    // A folded account NOT in any posted line is false.
    const consultingByCode = accounts.find((a) => a.account_code === '4500');
    assert.equal(consultingByCode.has_posted_history, true);
    // The draft-only account never folded into the chart, so assert a baseline
    // account with no posted lines is false.
    const baseline = accounts.find((a) => a.account_code === '2000');
    assert.equal(baseline.has_posted_history, false, 'baseline with no posted line is false');
  });

  test('listAccounts stamps has_posted_history true for a baseline account with a reversed line', async () => {
    const w = workers();
    const accountsBaseline = seedAccountsForTenant(T);
    const cash = accountsBaseline.find((a) => a.account_code === '1000');
    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: storeProviderWithJournalEntries([
        {
          id: 'je_reversed',
          status: 'reversed',
          lines: [{ account_id: cash.id, debit_cents: 1000, credit_cents: 0 }],
        },
      ]),
      auditEventsReader: {
        count: async () => 0,
        listByTypesOrdered: async () => [],
      },
      workers: w,
    });
    const accounts = await adapter.listAccounts(T, { isTestData: true });
    const cashRow = accounts.find((a) => a.account_code === '1000');
    assert.equal(cashRow.has_posted_history, true, 'reversed lines count as posted history');
    const revenue = accounts.find((a) => a.account_code === '4000');
    assert.equal(revenue.has_posted_history, false);
  });

  test('listAdapterJobs surfaces next_attempt_at for a retryable (queued) job (Codex PR #633 P2)', async () => {
    const w = workers();
    const storeProvider = createMemoryProjectionStoreProvider();
    const runner = createProjectionRunner({
      eventStore: { replay: async () => [] },
      storeProvider,
    });
    for (const worker of Object.values(w)) runner.register(worker);

    // A TRANSIENT failure: the projection keeps the job queued with a backoff ETA.
    await runner.dispatch({
      id: 'evt_sync_failed_transient',
      tenant_id: T,
      event_type: 'finance.adapter.sync_failed',
      created_at: '2026-06-01T00:05:00Z',
      payload: {
        permanent: false,
        next_attempt_at: '2026-06-01T00:10:00Z',
        error: { message: 'provider 503', code: null },
        adapter_job: {
          id: 'aj_retry',
          tenant_id: T,
          provider: 'quickbooks',
          operation: 'push_draft',
          mode: 'draft_only',
          status: 'failed',
          attempts: 1,
        },
      },
    });

    const adapter = createProjectionBackedFinanceReadAdapter({
      createStoreProvider: () => storeProvider,
      auditEventsReader: { count: async () => 0 },
      workers: w,
    });

    const [job] = await adapter.listAdapterJobs(T);
    assert.equal(job.id, 'aj_retry');
    assert.equal(job.status, 'queued', 'a transient failure stays queued, not failed');
    assert.equal(
      job.next_attempt_at,
      '2026-06-01T00:10:00Z',
      'the backoff ETA is surfaced, not dropped to null',
    );
    assert.equal(job.last_error, 'provider 503');
  });
});
