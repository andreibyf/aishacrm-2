import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionRunner } from '../../../../lib/finance/projections/projectionRunner.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import {
  createAdapterQueueProjectionWorker,
  ADAPTER_QUEUE_PROJECTION_NAME,
} from '../../../../lib/finance/projections/adapterQueueProjection.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

// ── Test doubles ──────────────────────────────────────────────────────────────

// An adapter sync event. `payload.adapter_job` mirrors a finance.adapter_jobs
// record — the self-describing job snapshot every adapter event carries.
function adapterEvent(
  eventType,
  id,
  {
    adapterJobId = `adapter_job_${id}`,
    tenant = TENANT_A,
    createdAt = '2026-05-21T00:00:00.000Z',
    jobCreatedAt = createdAt,
    provider = 'quickbooks',
    aggregateType = 'journal_entry',
    aggregateId = `je-${id}`,
    operation = 'push_draft',
    mode = 'draft_only',
    attempts = 0,
    errorMessage = null,
    correlationId = `corr-${id}`,
    causationId = `cause-${id}`,
  } = {},
) {
  return {
    id,
    tenant_id: tenant,
    event_type: eventType,
    created_at: createdAt,
    aggregate_type: 'adapter_job',
    aggregate_id: adapterJobId,
    correlation_id: correlationId,
    causation_id: causationId,
    payload: {
      adapter_job: {
        id: adapterJobId,
        tenant_id: tenant,
        provider,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        operation,
        mode,
        attempts,
        error_message: errorMessage,
        created_at: jobCreatedAt,
        updated_at: createdAt,
      },
    },
  };
}

function fakeEventStore(eventsByTenant = {}) {
  return {
    async replay(tenantId) {
      return (eventsByTenant[tenantId] || []).slice();
    },
  };
}

function makeRunner({ eventStore, storeProvider } = {}) {
  return createProjectionRunner({
    eventStore: eventStore || fakeEventStore(),
    storeProvider: storeProvider || createMemoryProjectionStoreProvider(),
    retryBackoffMs: 0,
  });
}

function queueOf(worker, provider, tenantId) {
  return worker.getProjection(
    tenantId,
    {},
    provider.getLiveStore(ADAPTER_QUEUE_PROJECTION_NAME, tenantId),
  );
}

// ── sync_queued -> queued bucket ───────────────────────────────────────────────

test('a finance.adapter.sync_queued event adds an item to the queued bucket', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    adapterEvent('finance.adapter.sync_queued', 'e1', {
      adapterJobId: 'adapter_job_1',
      aggregateId: 'je-1',
      provider: 'quickbooks',
      operation: 'push_draft',
      mode: 'draft_only',
      attempts: 0,
      createdAt: '2026-05-21T01:00:00.000Z',
      jobCreatedAt: '2026-05-21T01:00:00.000Z',
      correlationId: 'corr-1',
      causationId: 'cause-1',
    }),
  );

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.queued.length, 1);
  assert.equal(queue.running.length, 0);
  assert.equal(queue.failed.length, 0);
  assert.equal(queue.completed.length, 0);

  assert.deepEqual(queue.queued[0], {
    adapter_job_id: 'adapter_job_1',
    tenant_id: TENANT_A,
    provider: 'quickbooks',
    aggregate_type: 'journal_entry',
    aggregate_id: 'je-1',
    operation: 'push_draft',
    mode: 'draft_only',
    status: 'queued',
    attempts: 0,
    error_message: null,
    created_at: '2026-05-21T01:00:00.000Z',
    updated_at: '2026-05-21T01:00:00.000Z',
    correlation_id: 'corr-1',
    causation_id: 'cause-1',
  });
});

// ── sync_succeeded -> completed bucket ─────────────────────────────────────────

test('a finance.adapter.sync_succeeded event places the item in the completed bucket', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    adapterEvent('finance.adapter.sync_succeeded', 'e1', {
      adapterJobId: 'adapter_job_1',
      createdAt: '2026-05-21T01:00:00.000Z',
    }),
  );

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.completed.length, 1);
  assert.equal(queue.queued.length, 0);
  assert.equal(queue.completed[0].adapter_job_id, 'adapter_job_1');
  assert.equal(queue.completed[0].status, 'succeeded');
});

// ── sync_failed -> failed bucket ───────────────────────────────────────────────

test('a finance.adapter.sync_failed event places the item in the failed bucket with its error', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    adapterEvent('finance.adapter.sync_failed', 'e1', {
      adapterJobId: 'adapter_job_1',
      attempts: 2,
      errorMessage: 'provider timeout',
      createdAt: '2026-05-21T01:00:00.000Z',
    }),
  );

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.failed.length, 1);
  assert.equal(queue.queued.length, 0);
  assert.equal(queue.failed[0].status, 'failed');
  assert.equal(queue.failed[0].error_message, 'provider timeout');
  assert.equal(queue.failed[0].attempts, 2);
});

// ── Status transitions ────────────────────────────────────────────────────────

test('status transitions move the item between buckets and never leave it in two', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  // queued
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_queued', 'e1', {
      adapterJobId: 'adapter_job_1',
      createdAt: '2026-05-21T01:00:00.000Z',
    }),
  );
  let queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.queued.length, 1);
  assert.equal(queue.failed.length, 0);

  // queued -> failed
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_failed', 'e2', {
      adapterJobId: 'adapter_job_1',
      attempts: 1,
      errorMessage: 'rate limited',
      createdAt: '2026-05-21T02:00:00.000Z',
    }),
  );
  queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.queued.length, 0, 'left the queued bucket on failure');
  assert.equal(queue.failed.length, 1);

  // failed -> queued (a retry re-queues the same adapter_job_id)
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_queued', 'e3', {
      adapterJobId: 'adapter_job_1',
      attempts: 1,
      createdAt: '2026-05-21T03:00:00.000Z',
    }),
  );
  queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.failed.length, 0, 'left the failed bucket on re-queue');
  assert.equal(queue.queued.length, 1);

  // queued -> completed
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_succeeded', 'e4', {
      adapterJobId: 'adapter_job_1',
      createdAt: '2026-05-21T04:00:00.000Z',
    }),
  );
  queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.queued.length, 0, 'left the queued bucket on success');
  assert.equal(queue.completed.length, 1);

  const total =
    queue.queued.length + queue.running.length + queue.failed.length + queue.completed.length;
  assert.equal(total, 1, 'one adapter_job_id is represented exactly once');
});

// ── Bucket ordering ────────────────────────────────────────────────────────────

// Resolved buckets should reflect the order jobs transitioned, not the order
// the underlying jobs were originally created.
test('the failed bucket is ordered by status-transition time, not original job creation time', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  // Job B was created later but failed first.
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_failed', 'eB', {
      adapterJobId: 'adapter_job_B',
      jobCreatedAt: '2026-05-21T02:00:00.000Z',
      createdAt: '2026-05-21T03:00:00.000Z',
      errorMessage: 'b failed',
    }),
  );
  // Job A was created earlier but failed later.
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_failed', 'eA', {
      adapterJobId: 'adapter_job_A',
      jobCreatedAt: '2026-05-21T01:00:00.000Z',
      createdAt: '2026-05-21T04:00:00.000Z',
      errorMessage: 'a failed',
    }),
  );

  assert.deepEqual(
    queueOf(worker, provider, TENANT_A).failed.map((item) => item.adapter_job_id),
    ['adapter_job_B', 'adapter_job_A'],
    'failed items are ordered by transition time (updated_at), earliest transition first',
  );
});

test('the completed bucket is ordered by status-transition time, not original job creation time', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  // Job B was created later but succeeded first.
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_succeeded', 'eB', {
      adapterJobId: 'adapter_job_B',
      jobCreatedAt: '2026-05-21T02:00:00.000Z',
      createdAt: '2026-05-21T03:00:00.000Z',
    }),
  );
  // Job A was created earlier but succeeded later.
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_succeeded', 'eA', {
      adapterJobId: 'adapter_job_A',
      jobCreatedAt: '2026-05-21T01:00:00.000Z',
      createdAt: '2026-05-21T04:00:00.000Z',
    }),
  );

  assert.deepEqual(
    queueOf(worker, provider, TENANT_A).completed.map((item) => item.adapter_job_id),
    ['adapter_job_B', 'adapter_job_A'],
    'completed items are ordered by transition time (updated_at), earliest transition first',
  );
});

// ── Pending uniqueness invariant ───────────────────────────────────────────────

test('a duplicate finance.adapter.sync_queued keeps one active item per adapter_job_id', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    adapterEvent('finance.adapter.sync_queued', 'e1', {
      adapterJobId: 'adapter_job_1',
      createdAt: '2026-05-21T01:00:00.000Z',
    }),
  );
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_queued', 'e2', {
      adapterJobId: 'adapter_job_1',
      createdAt: '2026-05-21T02:00:00.000Z',
    }),
  );

  assert.equal(queueOf(worker, provider, TENANT_A).queued.length, 1);
});

// ── Replay rebuild (acceptance) ────────────────────────────────────────────────

test('replay and event-by-event dispatch rebuild identical queue state', async () => {
  const events = [
    adapterEvent('finance.adapter.sync_queued', 'e1', {
      adapterJobId: 'adapter_job_1',
      createdAt: '2026-05-21T01:00:00.000Z',
    }),
    adapterEvent('finance.adapter.sync_queued', 'e2', {
      adapterJobId: 'adapter_job_2',
      createdAt: '2026-05-21T02:00:00.000Z',
    }),
    adapterEvent('finance.adapter.sync_succeeded', 'e3', {
      adapterJobId: 'adapter_job_1',
      createdAt: '2026-05-21T03:00:00.000Z',
    }),
    adapterEvent('finance.adapter.sync_failed', 'e4', {
      adapterJobId: 'adapter_job_2',
      errorMessage: 'boom',
      createdAt: '2026-05-21T04:00:00.000Z',
    }),
  ];

  const providerReplay = createMemoryProjectionStoreProvider();
  const runnerReplay = makeRunner({
    eventStore: fakeEventStore({ [TENANT_A]: events }),
    storeProvider: providerReplay,
  });
  const workerReplay = createAdapterQueueProjectionWorker();
  runnerReplay.register(workerReplay);
  await runnerReplay.replay(ADAPTER_QUEUE_PROJECTION_NAME, TENANT_A);

  const providerDispatch = createMemoryProjectionStoreProvider();
  const runnerDispatch = makeRunner({ storeProvider: providerDispatch });
  const workerDispatch = createAdapterQueueProjectionWorker();
  runnerDispatch.register(workerDispatch);
  for (const event of events) {
    await runnerDispatch.dispatch(event);
  }

  assert.deepEqual(
    queueOf(workerReplay, providerReplay, TENANT_A),
    queueOf(workerDispatch, providerDispatch, TENANT_A),
  );
});

test('a repeated replay does not duplicate queue entries', async () => {
  const events = [
    adapterEvent('finance.adapter.sync_queued', 'e1', {
      adapterJobId: 'adapter_job_1',
      createdAt: '2026-05-21T01:00:00.000Z',
    }),
    adapterEvent('finance.adapter.sync_failed', 'e2', {
      adapterJobId: 'adapter_job_1',
      errorMessage: 'boom',
      createdAt: '2026-05-21T02:00:00.000Z',
    }),
  ];
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({
    eventStore: fakeEventStore({ [TENANT_A]: events }),
    storeProvider: provider,
  });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  await runner.replay(ADAPTER_QUEUE_PROJECTION_NAME, TENANT_A);
  const first = queueOf(worker, provider, TENANT_A);

  await runner.replay(ADAPTER_QUEUE_PROJECTION_NAME, TENANT_A);
  const second = queueOf(worker, provider, TENANT_A);

  assert.deepEqual(second, first, 'a repeated replay reproduces identical queue state');
  assert.equal(first.failed.length, 1, 'one job failed — never duplicated');
  assert.equal(first.queued.length, 0);
});

// ── Tenant isolation (acceptance) ──────────────────────────────────────────────

test('adapter queue state is isolated per tenant', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    adapterEvent('finance.adapter.sync_queued', 'a1', {
      adapterJobId: 'adapter_job_a',
      tenant: TENANT_A,
    }),
  );
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_queued', 'b1', {
      adapterJobId: 'adapter_job_b',
      tenant: TENANT_B,
    }),
  );

  const queueA = queueOf(worker, provider, TENANT_A);
  const queueB = queueOf(worker, provider, TENANT_B);
  assert.equal(queueA.queued.length, 1);
  assert.equal(queueA.queued[0].adapter_job_id, 'adapter_job_a');
  assert.equal(queueB.queued.length, 1);
  assert.equal(queueB.queued[0].adapter_job_id, 'adapter_job_b');
});

// The runner scopes the store by the event envelope tenant_id; the read-model
// tenant_id must come from that envelope, never from a stale/wrong payload.
test('a queue item takes its tenant_id from the event envelope, not payload.adapter_job', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  const event = adapterEvent('finance.adapter.sync_queued', 'e1', {
    adapterJobId: 'adapter_job_1',
    tenant: TENANT_A,
  });
  // A stale / wrong payload tenant that disagrees with the envelope.
  event.payload.adapter_job.tenant_id = TENANT_B;
  await runner.dispatch(event);

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.queued.length, 1);
  assert.equal(
    queue.queued[0].tenant_id,
    TENANT_A,
    'the read-model tenant_id is the authoritative envelope tenant',
  );
});

// ── Event filtering (acceptance) ───────────────────────────────────────────────

test('the adapter queue projection ignores finance.audit.event_appended', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch({
    id: 'infra-1',
    tenant_id: TENANT_A,
    event_type: 'finance.audit.event_appended',
    created_at: '2026-05-21T01:00:00.000Z',
    payload: {},
  });

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.queued.length, 0);
  assert.equal(runner.status(ADAPTER_QUEUE_PROJECTION_NAME, TENANT_A).cursor, null);
});

test('the adapter queue projection ignores events it does not consume', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch({
    id: 'jp-1',
    tenant_id: TENANT_A,
    event_type: 'finance.journal.posted',
    created_at: '2026-05-21T01:00:00.000Z',
    payload: {},
  });

  assert.equal(queueOf(worker, provider, TENANT_A).queued.length, 0);
});

// finance.adapter.sync_cancelled / retry_scheduled / dead_lettered are not yet
// canonical taxonomy — they are not consumed, so the runner ignores them. The
// projection must not crash or degrade on a not-yet-canonical adapter event.
test('accepts but ignores finance.adapter.sync_cancelled (future-ready, not yet canonical)', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    adapterEvent('finance.adapter.sync_cancelled', 'e1', {
      adapterJobId: 'adapter_job_1',
      createdAt: '2026-05-21T01:00:00.000Z',
    }),
  );

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.queued.length, 0);
  assert.equal(queue.running.length, 0);
  assert.equal(queue.failed.length, 0);
  assert.equal(queue.completed.length, 0);
  assert.equal(
    runner.status(ADAPTER_QUEUE_PROJECTION_NAME, TENANT_A).is_degraded,
    false,
    'a not-yet-canonical adapter event is ignored, not degraded',
  );
});

// ── Degraded behavior (acceptance) ─────────────────────────────────────────────

test('a malformed adapter event degrades the projection and pauses later dispatch', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  // Malformed: a finance.adapter.sync_queued with no adapter_job payload.
  await runner.dispatch({
    id: 'bad',
    tenant_id: TENANT_A,
    event_type: 'finance.adapter.sync_queued',
    created_at: '2026-05-21T01:00:00.000Z',
    payload: {},
  });
  assert.equal(runner.status(ADAPTER_QUEUE_PROJECTION_NAME, TENANT_A).is_degraded, true);

  // A subsequent valid event is paused while degraded.
  await runner.dispatch(
    adapterEvent('finance.adapter.sync_queued', 'e2', {
      adapterJobId: 'adapter_job_2',
      createdAt: '2026-05-21T02:00:00.000Z',
    }),
  );
  assert.equal(
    queueOf(worker, provider, TENANT_A).queued.length,
    0,
    'while degraded, later events are not applied to the queue',
  );
  assert.equal(runner.status(ADAPTER_QUEUE_PROJECTION_NAME, TENANT_A).cursor, null);
});
