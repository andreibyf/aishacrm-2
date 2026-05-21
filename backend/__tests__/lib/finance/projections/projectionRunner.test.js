import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionRunner } from '../../../../lib/finance/projections/projectionRunner.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import { ProjectionRuntimeError } from '../../../../lib/finance/projections/projectionRuntimeErrors.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

// ── Test doubles ──────────────────────────────────────────────────────────────

/** Build a finance event envelope. */
function evt(id, { tenant = TENANT_A, type = 'finance.journal.posted', createdAt } = {}) {
  return {
    id,
    tenant_id: tenant,
    event_type: type,
    created_at: createdAt || '2026-05-21T00:00:00.000Z',
    aggregate_type: 'journal_entry',
    aggregate_id: 'agg-1',
    payload: {},
  };
}

/**
 * A stand-in for the finance event store — the runner only needs `replay`.
 * `eventsByTenant` is a plain map of tenantId -> event[].
 */
function fakeEventStore(eventsByTenant = {}) {
  return {
    async replay(tenantId) {
      return (eventsByTenant[tenantId] || []).slice();
    },
  };
}

/**
 * A projection worker that records each applied event id, in order, under the
 * store key `events`. handleEvent and replay apply the SAME per-event mutation
 * so a replayed and a live-dispatched projection converge.
 */
function recordingWorker(opts = {}) {
  const worker = {
    projectionName: opts.projectionName || 'finance.projection.test',
    consumedEvents: opts.consumedEvents || ['finance.journal.posted'],
    schemaVersion: opts.schemaVersion || 1,
    handleEvent(event, store) {
      store.set('events', [...(store.get('events') || []), event.id]);
    },
    replay(events, store) {
      for (const e of events) {
        store.set('events', [...(store.get('events') || []), e.id]);
      }
    },
    getProjection() {
      return {};
    },
  };
  if (opts.includeInfrastructureEvents) worker.includeInfrastructureEvents = true;
  if (opts.handleEvent) worker.handleEvent = opts.handleEvent;
  if (opts.replay) worker.replay = opts.replay;
  return worker;
}

function makeRunner({ eventStore, storeProvider } = {}) {
  return createProjectionRunner({
    eventStore: eventStore || fakeEventStore(),
    storeProvider: storeProvider || createMemoryProjectionStoreProvider(),
    retryBackoffMs: 0, // keep degraded-path tests fast
  });
}

// ── Factory / registration ────────────────────────────────────────────────────

test('createProjectionRunner throws without an event store', () => {
  assert.throws(
    () => createProjectionRunner({ storeProvider: createMemoryProjectionStoreProvider() }),
    (err) => {
      assert.ok(err instanceof ProjectionRuntimeError);
      assert.equal(err.code, 'PROJECTION_RUNTIME_INVALID');
      return true;
    },
  );
});

test('register throws on a duplicate projectionName', () => {
  const runner = makeRunner();
  runner.register(recordingWorker({ projectionName: 'finance.projection.ledger' }));
  assert.throws(
    () => runner.register(recordingWorker({ projectionName: 'finance.projection.ledger' })),
    (err) => {
      assert.ok(err instanceof ProjectionRuntimeError);
      assert.equal(err.code, 'PROJECTION_RUNTIME_INVALID');
      return true;
    },
  );
});

test('register rejects a malformed worker', () => {
  const runner = makeRunner();
  // missing projectionName
  assert.throws(
    () =>
      runner.register({
        consumedEvents: ['finance.journal.posted'],
        handleEvent() {},
        replay() {},
      }),
    ProjectionRuntimeError,
  );
  // empty consumedEvents
  assert.throws(
    () => runner.register(recordingWorker({ projectionName: 'p1', consumedEvents: [] })),
    ProjectionRuntimeError,
  );
  // handleEvent not a function
  assert.throws(
    () =>
      runner.register({
        projectionName: 'p2',
        consumedEvents: ['x'],
        handleEvent: 'no',
        replay() {},
      }),
    ProjectionRuntimeError,
  );
});

// ── Dispatch + cursor ─────────────────────────────────────────────────────────

test('dispatch applies a consumed event and advances the cursor', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.dispatch(evt('e1', { createdAt: '2026-05-21T01:00:00.000Z' }));

  assert.deepEqual(provider.getLiveStore('p', TENANT_A).get('events'), ['e1']);
  assert.deepEqual(runner.status('p', TENANT_A).cursor, {
    created_at: '2026-05-21T01:00:00.000Z',
    id: 'e1',
  });
});

test('dispatch skips an event at or below the cursor (out-of-order / duplicate)', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.dispatch(evt('e2', { createdAt: '2026-05-21T02:00:00.000Z' }));
  await runner.dispatch(evt('e1', { createdAt: '2026-05-21T01:00:00.000Z' })); // earlier → skipped
  await runner.dispatch(evt('e2', { createdAt: '2026-05-21T02:00:00.000Z' })); // duplicate → skipped

  assert.deepEqual(provider.getLiveStore('p', TENANT_A).get('events'), ['e2']);
});

test('dispatch only routes events a worker consumes', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(
    recordingWorker({ projectionName: 'p', consumedEvents: ['finance.journal.posted'] }),
  );

  await runner.dispatch(evt('e1', { type: 'finance.invoice.draft_created' }));

  assert.equal(provider.getLiveStore('p', TENANT_A).get('events'), undefined);
  assert.equal(runner.status('p', TENANT_A).cursor, null);
});

test('cursors are tracked independently per (projection, tenant)', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.dispatch(evt('a', { tenant: TENANT_A, createdAt: '2026-05-21T01:00:00.000Z' }));
  await runner.dispatch(evt('b', { tenant: TENANT_B, createdAt: '2026-05-21T01:00:00.000Z' }));

  assert.deepEqual(provider.getLiveStore('p', TENANT_A).get('events'), ['a']);
  assert.deepEqual(provider.getLiveStore('p', TENANT_B).get('events'), ['b']);
});

// ── Degraded state ────────────────────────────────────────────────────────────

test('a failing handler puts the projection into degraded state', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(
    recordingWorker({
      projectionName: 'p',
      handleEvent: () => {
        throw new Error('boom');
      },
    }),
  );

  await runner.dispatch(evt('e1'));

  const status = runner.status('p', TENANT_A);
  assert.equal(status.is_degraded, true);
  assert.equal(status.state, 'degraded');
});

test('a failing handler does not advance the cursor', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(
    recordingWorker({
      projectionName: 'p',
      handleEvent: () => {
        throw new Error('boom');
      },
    }),
  );

  await runner.dispatch(evt('e1', { createdAt: '2026-05-21T01:00:00.000Z' }));

  assert.equal(runner.status('p', TENANT_A).cursor, null);
});

test('degraded state is cleared only by a successful replay (operator-triggered)', async () => {
  const provider = createMemoryProjectionStoreProvider();
  // handleEvent throws (degrades on dispatch); replay uses the default success path.
  const eventStore = fakeEventStore({ [TENANT_A]: [evt('e1')] });
  const runner = makeRunner({ eventStore, storeProvider: provider });
  runner.register(
    recordingWorker({
      projectionName: 'p',
      handleEvent: () => {
        throw new Error('boom');
      },
    }),
  );

  await runner.dispatch(evt('e1'));
  assert.equal(runner.status('p', TENANT_A).is_degraded, true);

  await runner.replay('p', TENANT_A);

  const status = runner.status('p', TENANT_A);
  assert.equal(status.is_degraded, false);
  assert.equal(status.state, 'idle');
});

// ── Replay ────────────────────────────────────────────────────────────────────

test('replay rebuilds the projection from the event store and sets the cursor', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const eventStore = fakeEventStore({
    [TENANT_A]: [
      evt('e1', { createdAt: '2026-05-21T01:00:00.000Z' }),
      evt('e2', { createdAt: '2026-05-21T02:00:00.000Z' }),
    ],
  });
  const runner = makeRunner({ eventStore, storeProvider: provider });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.replay('p', TENANT_A);

  assert.deepEqual(provider.getLiveStore('p', TENANT_A).get('events'), ['e1', 'e2']);
  assert.deepEqual(runner.status('p', TENANT_A).cursor, {
    created_at: '2026-05-21T02:00:00.000Z',
    id: 'e2',
  });
});

test('replay applies events in created_at ASC, id ASC order regardless of store order', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const eventStore = fakeEventStore({
    [TENANT_A]: [
      evt('e-c', { createdAt: '2026-05-21T03:00:00.000Z' }),
      evt('e-b', { createdAt: '2026-05-21T02:00:00.000Z' }),
      evt('tie-2', { createdAt: '2026-05-21T05:00:00.000Z' }),
      evt('tie-1', { createdAt: '2026-05-21T05:00:00.000Z' }),
      evt('tie-3', { createdAt: '2026-05-21T05:00:00.000Z' }),
      evt('e-a', { createdAt: '2026-05-21T01:00:00.000Z' }),
    ],
  });
  const runner = makeRunner({ eventStore, storeProvider: provider });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.replay('p', TENANT_A);

  assert.deepEqual(provider.getLiveStore('p', TENANT_A).get('events'), [
    'e-a',
    'e-b',
    'e-c',
    'tie-1',
    'tie-2',
    'tie-3',
  ]);
});

test('replay throws PROJECTION_NOT_FOUND for an unregistered projection', async () => {
  const runner = makeRunner();
  await assert.rejects(runner.replay('finance.projection.nope', TENANT_A), (err) => {
    assert.ok(err instanceof ProjectionRuntimeError);
    assert.equal(err.code, 'PROJECTION_NOT_FOUND');
    return true;
  });
});

test('a failed replay promotes nothing — the live store is left untouched', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const eventStore = fakeEventStore({ [TENANT_A]: [evt('e1')] });
  const runner = makeRunner({ eventStore, storeProvider: provider });
  runner.register(
    recordingWorker({
      projectionName: 'p',
      replay: () => {
        throw new Error('replay boom');
      },
    }),
  );
  // Seed prior live content.
  provider.getLiveStore('p', TENANT_A).set('events', ['pre-existing']);

  await runner.replay('p', TENANT_A);

  assert.deepEqual(
    provider.getLiveStore('p', TENANT_A).get('events'),
    ['pre-existing'],
    'a failed replay must not mutate the live store',
  );
  assert.equal(runner.status('p', TENANT_A).is_degraded, true);
});

test('replayAll rebuilds every registered projection', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const eventStore = fakeEventStore({
    [TENANT_A]: [
      evt('e1', { type: 'finance.journal.posted', createdAt: '2026-05-21T01:00:00.000Z' }),
      evt('e2', { type: 'finance.invoice.draft_created', createdAt: '2026-05-21T02:00:00.000Z' }),
    ],
  });
  const runner = makeRunner({ eventStore, storeProvider: provider });
  runner.register(
    recordingWorker({ projectionName: 'journal', consumedEvents: ['finance.journal.posted'] }),
  );
  runner.register(
    recordingWorker({
      projectionName: 'invoice',
      consumedEvents: ['finance.invoice.draft_created'],
    }),
  );

  const results = await runner.replayAll(TENANT_A);

  assert.equal(results.length, 2);
  assert.deepEqual(provider.getLiveStore('journal', TENANT_A).get('events'), ['e1']);
  assert.deepEqual(provider.getLiveStore('invoice', TENANT_A).get('events'), ['e2']);
});

// ── Infrastructure event filtering ────────────────────────────────────────────

test('finance.audit.event_appended is not delivered to a business projection (even if listed)', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  // A business worker that mistakenly lists the infrastructure event.
  runner.register(
    recordingWorker({
      projectionName: 'p',
      consumedEvents: ['finance.journal.posted', 'finance.audit.event_appended'],
    }),
  );

  await runner.dispatch(evt('infra-1', { type: 'finance.audit.event_appended' }));

  assert.equal(
    provider.getLiveStore('p', TENANT_A).get('events'),
    undefined,
    'infrastructure events must not reach a business projection',
  );
  assert.equal(
    runner.status('p', TENANT_A).cursor,
    null,
    'infrastructure events must never advance a business-projection cursor',
  );
});

test('finance.audit.event_appended is delivered to a worker with includeInfrastructureEvents', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(
    recordingWorker({
      projectionName: 'finance.projection.audit_timeline',
      consumedEvents: ['finance.audit.event_appended'],
      includeInfrastructureEvents: true,
    }),
  );

  await runner.dispatch(evt('infra-1', { type: 'finance.audit.event_appended' }));

  assert.deepEqual(
    provider.getLiveStore('finance.projection.audit_timeline', TENANT_A).get('events'),
    ['infra-1'],
  );
});

// ── Convergence ───────────────────────────────────────────────────────────────

test('replay and dispatch converge to the same final state', async () => {
  const events = [
    evt('e1', { createdAt: '2026-05-21T01:00:00.000Z' }),
    evt('e2', { createdAt: '2026-05-21T02:00:00.000Z' }),
    evt('e3', { createdAt: '2026-05-21T03:00:00.000Z' }),
  ];

  // Path A — rebuild via replay.
  const providerA = createMemoryProjectionStoreProvider();
  const runnerA = makeRunner({
    eventStore: fakeEventStore({ [TENANT_A]: events }),
    storeProvider: providerA,
  });
  runnerA.register(recordingWorker({ projectionName: 'p' }));
  await runnerA.replay('p', TENANT_A);

  // Path B — live dispatch of the same ordered events.
  const providerB = createMemoryProjectionStoreProvider();
  const runnerB = makeRunner({ storeProvider: providerB });
  runnerB.register(recordingWorker({ projectionName: 'p' }));
  for (const e of events) {
    await runnerB.dispatch(e);
  }

  const replayed = providerA.getLiveStore('p', TENANT_A).get('events');
  const dispatched = providerB.getLiveStore('p', TENANT_A).get('events');
  assert.deepEqual(replayed, dispatched);
  assert.deepEqual(replayed, ['e1', 'e2', 'e3']);
});
