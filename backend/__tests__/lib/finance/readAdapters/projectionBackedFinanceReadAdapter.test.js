import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionRunner } from '../../../../lib/finance/projections/projectionRunner.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import { createLedgerProjectionWorker } from '../../../../lib/finance/projections/ledgerProjection.js';
import { createApprovalQueueProjectionWorker } from '../../../../lib/finance/projections/approvalQueueProjection.js';
import { createAdapterQueueProjectionWorker } from '../../../../lib/finance/projections/adapterQueueProjection.js';
import { createJournalEntriesProjectionWorker } from '../../../../lib/finance/projections/journalEntriesProjection.js';
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
  await runner.dispatch(draftCreated);
  await runner.dispatch(approvalRequested);
  return storeProvider;
}

describe('ProjectionBackedFinanceReadAdapter', () => {
  test('journal-entries read includes the pending_approval entry from the projection', async () => {
    const w = workers();
    const storeProvider = await seededProvider(w);
    const adapter = createProjectionBackedFinanceReadAdapter({
      storeProvider,
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
      storeProvider,
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
      storeProvider,
      auditEventsReader: { count: async () => 2 },
      workers: w,
    });
    const status = await adapter.getRuntimeStatus(T);
    assert.equal(status.runtime.persistence, 'persistent');
    assert.equal(status.runtime.mode, 'persistent');
    assert.equal(status.counts.journal_entries, 1);
    assert.equal(status.counts.audit_events, 2);
    assert.equal(status.persistence_lag.audit_events_total, 2);
    assert.ok(status.persistence_lag.projections['finance.projection.journal_entries']);
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
      storeProvider: failingProvider,
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
      storeProvider,
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
    const failingProvider = {
      getLiveStore: async (projName, tenantId) => {
        return new Map();
      },
      getState: async () => {
        throw new Error('projection_state query failed');
      },
    };
    const adapter = createProjectionBackedFinanceReadAdapter({
      storeProvider: failingProvider,
      auditEventsReader: { count: async () => 2 },
      workers: w,
    });
    await assert.rejects(() => adapter.getRuntimeStatus(T), FinanceReadDegradedError);
  });
});
