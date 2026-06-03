/**
 * projectionDoubleApply.test.js
 *
 * Phase 4-1 — Task 6 (reframed). Proves that the synchronous-advance (API
 * read-your-write) + async-projection-worker coexistence introduced in Task 7
 * is SAFE for every projection that actually receives events today.
 *
 * In Task 7, a persistent-mode write advances projections synchronously in the
 * API process, while a separate async worker ALSO advances the same projections
 * from the same Postgres event store. Both can therefore process the same event.
 * This test pins the property that makes that safe: each of the four FLOWING
 * projection workers — journal_entries, invoices, approval_queue, adapter_queue
 * — is IDEMPOTENT under double-apply, so re-applying the same event yields
 * identical read-model state.
 *
 * Two independent proofs per worker:
 *   1. Direct double-`handleEvent` against a memory store — even with NO cursor
 *      guard, applying the same event twice produces identical `getProjection`
 *      output as applying it once. This is the structural idempotency proof.
 *   2. Double-`dispatch` through a `createProjectionRunner` over a memory
 *      provider — the runner's cursor guard makes the 2nd dispatch a no-op
 *      ('skipped'), so the read model is unchanged. This is the runtime proof.
 *
 * The ledger projection is deliberately EXCLUDED: it is additive
 * (`debit_cents = prev + line.debit_cents`) and NOT idempotent under
 * double-apply. It is safe today only because it consumes `finance.journal.posted`,
 * which has NO emit-site in the codebase (no live events ever reach it). See the
 * locking-prerequisite comment block in ledgerProjection.js and the design doc's
 * "Concurrency / deployment" section.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createProjectionRunner } from '../../../../lib/finance/projections/projectionRunner.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';

import createJournalEntriesProjectionWorker from '../../../../lib/finance/projections/journalEntriesProjection.js';
import createInvoiceProjectionWorker from '../../../../lib/finance/projections/invoiceProjection.js';
import createApprovalQueueProjectionWorker from '../../../../lib/finance/projections/approvalQueueProjection.js';
import createAdapterQueueProjectionWorker from '../../../../lib/finance/projections/adapterQueueProjection.js';

const T = '00000000-0000-4000-8000-000000000abc';

// Minimal store matching the runner's buffered-store surface used by handleEvent.
function memStore() {
  const m = new Map();
  return {
    get: (k) => m.get(k),
    set: (k, v) => m.set(k, v),
    delete: (k) => m.delete(k),
    keys: () => [...m.keys()],
    clear: () => m.clear(),
  };
}

// Drives one event through a worker's handleEvent once vs. twice and asserts the
// resulting getProjection output is identical. This is the cursor-bypassing,
// purely structural idempotency proof: even a double-applied event must not move
// the read model.
function assertDoubleHandleEventIsIdempotent(makeWorker, event) {
  const once = makeWorker();
  const onceStore = memStore();
  once.handleEvent(event, onceStore);
  const onceModel = once.getProjection(T, {}, onceStore);

  const twice = makeWorker();
  const twiceStore = memStore();
  twice.handleEvent(event, twiceStore);
  twice.handleEvent(event, twiceStore);
  const twiceModel = twice.getProjection(T, {}, twiceStore);

  assert.deepEqual(
    twiceModel,
    onceModel,
    'double handleEvent must produce the same read model as a single handleEvent',
  );
}

// Drives one event through a runner via dispatch twice. The cursor guard makes
// the 2nd dispatch a no-op ('skipped'), so the read model is identical to a
// single dispatch. This is the runtime (runner-mediated) proof.
async function assertDoubleDispatchIsIdempotent(makeWorker, event) {
  const projectionName = makeWorker().projectionName;
  const eventStore = { replay: async () => [] };

  const provider = createMemoryProjectionStoreProvider();
  const runner = createProjectionRunner({ eventStore, storeProvider: provider, retryBackoffMs: 0 });
  const worker = makeWorker();
  runner.register(worker);

  const first = await runner.dispatch(event);
  assert.equal(first.dispatched[0].outcome, 'applied', 'first dispatch applies the event');
  const modelAfterFirst = worker.getProjection(T, {}, provider.getLiveStore(projectionName, T));

  const second = await runner.dispatch(event);
  assert.equal(
    second.dispatched[0].outcome,
    'skipped',
    'the cursor guard makes a re-dispatch of the same event a no-op',
  );
  const modelAfterSecond = worker.getProjection(T, {}, provider.getLiveStore(projectionName, T));

  assert.deepEqual(
    modelAfterSecond,
    modelAfterFirst,
    'a second dispatch of the same event must not change the read model',
  );
}

// ── Representative events per flowing projection ───────────────────────────────

const journalEntry = (id, status, created_at) => ({
  id,
  tenant_id: T,
  status,
  created_at,
  updated_at: created_at,
  currency: 'usd',
  lines: [],
});

const journalDraftCreated = {
  id: 'evt_je_1',
  tenant_id: T,
  event_type: 'finance.journal.draft_created',
  created_at: '2026-05-21T01:00:00.000Z',
  payload: { journal_entry: journalEntry('je-1', 'draft', '2026-05-21T01:00:00.000Z') },
};

const invoiceDraftCreated = {
  id: 'evt_inv_1',
  tenant_id: T,
  event_type: 'finance.invoice.draft_created',
  created_at: '2026-05-21T01:00:00.000Z',
  payload: {
    invoice: {
      id: 'inv-1',
      tenant_id: T,
      status: 'draft',
      total_cents: 12345,
      created_at: '2026-05-21T01:00:00.000Z',
    },
  },
};

const approvalRequested = {
  id: 'evt_appr_1',
  tenant_id: T,
  event_type: 'finance.approval.requested',
  created_at: '2026-05-21T01:00:00.000Z',
  actor_id: 'user-1',
  payload: {
    approval: {
      id: 'appr-1',
      target_type: 'journal_entry',
      target_id: 'je-1',
      risk_level: 'high',
      requested_by: 'user-1',
      created_at: '2026-05-21T01:00:00.000Z',
    },
  },
};

const adapterSyncQueued = {
  id: 'evt_aj_1',
  tenant_id: T,
  event_type: 'finance.adapter.sync_queued',
  created_at: '2026-05-21T01:00:00.000Z',
  correlation_id: 'corr-1',
  causation_id: 'cause-1',
  payload: {
    adapter_job: {
      id: 'aj-1',
      provider: 'quickbooks',
      aggregate_type: 'journal_entry',
      aggregate_id: 'je-1',
      operation: 'create',
      mode: 'live',
      attempts: 0,
      created_at: '2026-05-21T01:00:00.000Z',
      updated_at: '2026-05-21T01:00:00.000Z',
    },
  },
};

const FLOWING = [
  ['journal_entries', createJournalEntriesProjectionWorker, journalDraftCreated],
  ['invoices', createInvoiceProjectionWorker, invoiceDraftCreated],
  ['approval_queue', createApprovalQueueProjectionWorker, approvalRequested],
  ['adapter_queue', createAdapterQueueProjectionWorker, adapterSyncQueued],
];

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('flowing projections are idempotent under double-apply', () => {
  for (const [name, makeWorker, event] of FLOWING) {
    test(`${name}: direct double-handleEvent yields the single-apply read model`, () => {
      assertDoubleHandleEventIsIdempotent(makeWorker, event);
    });

    test(`${name}: runner re-dispatch is a cursor-guarded no-op`, async () => {
      await assertDoubleDispatchIsIdempotent(makeWorker, event);
    });
  }
});
