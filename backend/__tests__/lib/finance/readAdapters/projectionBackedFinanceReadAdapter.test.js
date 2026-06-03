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

const T = '00000000-0000-4000-8000-000000000011';

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
});
