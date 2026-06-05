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
  assert.deepEqual((await runner.status('p', TENANT_A)).cursor, {
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

test('dispatch applies same-millisecond sibling events even when id order is descending', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(recordingWorker({ projectionName: 'p' }));

  const t = '2026-05-21T02:00:00.000Z';
  await runner.dispatch(evt('z-last', { createdAt: t }));
  await runner.dispatch(evt('a-next', { createdAt: t }));

  assert.deepEqual(provider.getLiveStore('p', TENANT_A).get('events'), ['z-last', 'a-next']);
  assert.deepEqual((await runner.status('p', TENANT_A)).cursor, {
    created_at: t,
    id: 'a-next',
  });
});
test('dispatch only routes events a worker consumes', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(
    recordingWorker({ projectionName: 'p', consumedEvents: ['finance.journal.posted'] }),
  );

  await runner.dispatch(evt('e1', { type: 'finance.invoice.draft_created' }));

  assert.equal(provider.getLiveStore('p', TENANT_A).get('events'), undefined);
  assert.equal((await runner.status('p', TENANT_A)).cursor, null);
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

  const status = await runner.status('p', TENANT_A);
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

  assert.equal((await runner.status('p', TENANT_A)).cursor, null);
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
  assert.equal((await runner.status('p', TENANT_A)).is_degraded, true);

  await runner.replay('p', TENANT_A);

  const status = await runner.status('p', TENANT_A);
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
  assert.deepEqual((await runner.status('p', TENANT_A)).cursor, {
    created_at: '2026-05-21T02:00:00.000Z',
    id: 'e2',
  });
});

test('replay tie-breaks same-timestamp events by PG seq (string), not id (Codex PR #633)', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const t = '2026-05-21T03:00:00.000Z';
  // Postgres returns the bigint `seq` identity as a STRING. ids DESCEND while seq
  // ASCENDS, so an id-ASC tie-break would reverse append order — the seq tie-break
  // must preserve it (e.g. draft before its approval, written in one command).
  const eventStore = fakeEventStore({
    [TENANT_A]: [
      { ...evt('z', { createdAt: t }), seq: '1' },
      { ...evt('y', { createdAt: t }), seq: '2' },
      { ...evt('x', { createdAt: t }), seq: '3' },
    ],
  });
  const runner = makeRunner({ eventStore, storeProvider: provider });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.replay('p', TENANT_A);

  assert.deepEqual(
    provider.getLiveStore('p', TENANT_A).get('events'),
    ['z', 'y', 'x'],
    'tied timestamps replay in APPEND order (seq), not id ASC',
  );
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
  assert.equal((await runner.status('p', TENANT_A)).is_degraded, true);
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

// ── slice 6b-1: data-mode partition threaded into the rebuild ─────────────────

/**
 * A spy event store recording every `replay(...)` call's argument tuple so a
 * test can assert the runner forwarded the data-mode filter (or omitted it).
 */
function spyEventStore() {
  const calls = [];
  return {
    calls,
    replay: async (...args) => {
      calls.push(args);
      return [];
    },
  };
}

test('replay(name, tenant, true) forwards isTestData=true to eventStore.replay (test partition)', async () => {
  const eventStore = spyEventStore();
  const runner = makeRunner({ eventStore, storeProvider: createMemoryProjectionStoreProvider() });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.replay('p', TENANT_A, true);

  assert.equal(eventStore.calls.length, 1, 'rebuild replays the stream exactly once');
  assert.deepEqual(
    eventStore.calls[0],
    [TENANT_A, true],
    'replay must be called with (tenantId, true)',
  );
});

test('replay(name, tenant, false) forwards isTestData=false to eventStore.replay (live partition)', async () => {
  const eventStore = spyEventStore();
  const runner = makeRunner({ eventStore, storeProvider: createMemoryProjectionStoreProvider() });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.replay('p', TENANT_A, false);

  assert.deepEqual(eventStore.calls[0], [TENANT_A, false]);
});

test('replay(name, tenant) without a mode replays ALL events (isTestData defaults to null)', async () => {
  const eventStore = spyEventStore();
  const runner = makeRunner({ eventStore, storeProvider: createMemoryProjectionStoreProvider() });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.replay('p', TENANT_A);

  // The default `isTestData = null` is passed through — the in-memory event
  // store treats null as "no filter = all events" (unchanged behaviour).
  assert.deepEqual(
    eventStore.calls[0],
    [TENANT_A, null],
    'omitting the mode must replay(tenantId, null) = all events',
  );
});

test('replayAll threads isTestData into every projection rebuild', async () => {
  const eventStore = spyEventStore();
  const runner = makeRunner({ eventStore, storeProvider: createMemoryProjectionStoreProvider() });
  runner.register(
    recordingWorker({ projectionName: 'p1', consumedEvents: ['finance.journal.posted'] }),
  );
  runner.register(
    recordingWorker({ projectionName: 'p2', consumedEvents: ['finance.invoice.draft_created'] }),
  );

  await runner.replayAll(TENANT_A, true);

  assert.equal(eventStore.calls.length, 2);
  assert.ok(
    eventStore.calls.every((args) => args[0] === TENANT_A && args[1] === true),
    'every replay in replayAll must forward (tenantId, true)',
  );
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
    (await runner.status('p', TENANT_A)).cursor,
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

// ── Code-review fixes (P1 / P2) ────────────────────────────────────────────────

// [P1] A degraded projection must pause dispatch — later events may depend on
// the missing state, so continuing risks compounding divergence and a
// permanently skipped event. Recovery is operator-triggered replay only.
test('a degraded projection pauses dispatch — later events stay unapplied, cursor frozen', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(
    recordingWorker({
      projectionName: 'p',
      handleEvent: (event, store) => {
        if (event.id === 'bad') throw new Error('boom');
        store.set('events', [...(store.get('events') || []), event.id]);
      },
    }),
  );

  // First event fails -> projection is degraded.
  await runner.dispatch(evt('bad', { createdAt: '2026-05-21T01:00:00.000Z' }));
  assert.equal((await runner.status('p', TENANT_A)).is_degraded, true);

  // A later, well-formed event must be PAUSED — not delivered to the handler.
  const result = await runner.dispatch(evt('later', { createdAt: '2026-05-21T02:00:00.000Z' }));

  assert.equal(result.dispatched[0].outcome, 'paused');
  assert.equal(
    provider.getLiveStore('p', TENANT_A).get('events'),
    undefined,
    'a later event must not be applied while the projection is degraded',
  );
  assert.equal(
    (await runner.status('p', TENANT_A)).cursor,
    null,
    'the cursor must not advance past the failed event while degraded',
  );
});

// [P1] A handler that mutates state and then throws must leave NO partial
// writes visible — the live store stays at the last fully-applied event.
test('a handler that mutates then throws leaves the live store untouched', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(
    recordingWorker({
      projectionName: 'p',
      handleEvent: (event, store) => {
        store.set('partial', 'written-before-throw');
        store.set('events', ['half-applied']);
        throw new Error('boom after mutation');
      },
    }),
  );

  await runner.dispatch(evt('e1'));

  assert.deepEqual(
    provider.getLiveStore('p', TENANT_A).keys(),
    [],
    'no write from a failed handler may be visible in the live store',
  );
  assert.equal((await runner.status('p', TENANT_A)).is_degraded, true);
});

// [P1] A clear() inside a failed handler must also be rolled back.
test('a handler that clears the store then throws does not wipe the live store', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(
    recordingWorker({
      projectionName: 'p',
      handleEvent: (event, store) => {
        store.clear();
        throw new Error('boom after clear');
      },
    }),
  );
  provider.getLiveStore('p', TENANT_A).set('important', 'keep-me');

  await runner.dispatch(evt('e1'));

  assert.equal(
    provider.getLiveStore('p', TENANT_A).get('important'),
    'keep-me',
    'a clear() inside a failed handler must be rolled back',
  );
});

// [P2] replay must defensively scope events to the target tenant rather than
// trusting the event store to never return mixed-tenant rows.
test('replay drops events whose tenant_id does not match the target tenant', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const eventStore = fakeEventStore({
    [TENANT_A]: [
      evt('a1', { tenant: TENANT_A, createdAt: '2026-05-21T01:00:00.000Z' }),
      evt('foreign', { tenant: TENANT_B, createdAt: '2026-05-21T02:00:00.000Z' }),
      evt('a2', { tenant: TENANT_A, createdAt: '2026-05-21T03:00:00.000Z' }),
    ],
  });
  const runner = makeRunner({ eventStore, storeProvider: provider });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.replay('p', TENANT_A);

  assert.deepEqual(
    provider.getLiveStore('p', TENANT_A).get('events'),
    ['a1', 'a2'],
    "a foreign-tenant event must never be replayed into another tenant's projection",
  );
});

// ── Buffered-store rollback isolation ──────────────────────────────────────────

// [P1] The runtime must enforce rollback isolation even for a badly-written
// (non-immutable) handler: get() must never expose a mutable live-store
// reference, so an in-place mutation inside a failed handler cannot corrupt
// the live store.
test('a handler that mutates a live value in place then throws does not corrupt the live store', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(
    recordingWorker({
      projectionName: 'p',
      handleEvent: (event, store) => {
        // Non-immutable handler: read the value and mutate it IN PLACE.
        store.get('events').push(event.id);
        store.get('meta').count += 1;
        throw new Error('boom after in-place mutation');
      },
    }),
  );
  const live = provider.getLiveStore('p', TENANT_A);
  live.set('events', ['seed']);
  live.set('meta', { count: 0 });

  await runner.dispatch(evt('e1'));

  assert.deepEqual(
    provider.getLiveStore('p', TENANT_A).get('events'),
    ['seed'],
    'an in-place array mutation inside a failed handler must not reach the live store',
  );
  assert.deepEqual(
    provider.getLiveStore('p', TENANT_A).get('meta'),
    { count: 0 },
    'an in-place object mutation inside a failed handler must not reach the live store',
  );
  assert.equal((await runner.status('p', TENANT_A)).cursor, null, 'the cursor must not advance');
  assert.equal(
    (await runner.status('p', TENANT_A)).is_degraded,
    true,
    'the projection is degraded',
  );
});

// Success path: a handler that mutates a (cloned) value and explicitly set()s
// it still commits the intended change.
test('a handler that mutates a value and set()s it commits the change on success', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  runner.register(
    recordingWorker({
      projectionName: 'p',
      handleEvent: (event, store) => {
        const events = store.get('events') || [];
        events.push(event.id);
        store.set('events', events);
      },
    }),
  );
  provider.getLiveStore('p', TENANT_A).set('events', ['seed']);

  await runner.dispatch(evt('e1', { createdAt: '2026-05-21T01:00:00.000Z' }));

  assert.deepEqual(
    provider.getLiveStore('p', TENANT_A).get('events'),
    ['seed', 'e1'],
    'an explicit set() of a mutated value is committed to the live store on success',
  );
  assert.deepEqual((await runner.status('p', TENANT_A)).cursor, {
    created_at: '2026-05-21T01:00:00.000Z',
    id: 'e1',
  });
});

// ── Async store-provider seam ──────────────────────────────────────────────────

/**
 * Wrap the sync memory provider so every provider method returns a Promise.
 * This stands in for a real async backend (e.g. Postgres) without changing the
 * underlying semantics — the live ProjectionStore returned by getLiveStore
 * remains synchronous (per design constraint #3).
 */
function asyncifyProvider(sync) {
  return {
    async getLiveStore(projectionName, tenantId) {
      return sync.getLiveStore(projectionName, tenantId);
    },
    async createShadowStore(projectionName, tenantId) {
      return sync.createShadowStore(projectionName, tenantId);
    },
    async promoteShadow(projectionName, tenantId) {
      return sync.promoteShadow(projectionName, tenantId);
    },
    async discardShadow(projectionName, tenantId) {
      return sync.discardShadow(projectionName, tenantId);
    },
    async getState(projectionName, tenantId) {
      return sync.getState(projectionName, tenantId);
    },
    async setState(projectionName, tenantId, state) {
      return sync.setState(projectionName, tenantId, state);
    },
  };
}

// An async provider (e.g. Postgres) must be supported by the runner's
// store-provider seam. Every provider call site must `await` the result so the
// runner sees the resolved value rather than a Promise. With a sync provider
// `await value` is a no-op, so this change is fully backward-compatible.
test('dispatch works with a fully async store provider (Postgres-style seam)', async () => {
  const sync = createMemoryProjectionStoreProvider();
  const asyncProvider = asyncifyProvider(sync);
  const runner = makeRunner({ storeProvider: asyncProvider });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.dispatch(evt('e1', { createdAt: '2026-05-21T01:00:00.000Z' }));

  // The underlying live store must hold the applied event — proving the runner
  // resolved the Promise from `getLiveStore` rather than treating it as a store.
  assert.deepEqual(sync.getLiveStore('p', TENANT_A).get('events'), ['e1']);

  // The cursor must advance — proving the runner resolved the Promise from
  // `getState`/`setState` rather than treating the Promise as the state record.
  const status = await runner.status('p', TENANT_A);
  assert.deepEqual(status.cursor, {
    created_at: '2026-05-21T01:00:00.000Z',
    id: 'e1',
  });
  assert.equal(status.state, 'idle');
  assert.equal(status.is_degraded, false);
});

test('replay works with a fully async store provider (Postgres-style seam)', async () => {
  const sync = createMemoryProjectionStoreProvider();
  const asyncProvider = asyncifyProvider(sync);
  const eventStore = fakeEventStore({
    [TENANT_A]: [
      evt('e1', { createdAt: '2026-05-21T01:00:00.000Z' }),
      evt('e2', { createdAt: '2026-05-21T02:00:00.000Z' }),
    ],
  });
  const runner = makeRunner({ eventStore, storeProvider: asyncProvider });
  runner.register(recordingWorker({ projectionName: 'p' }));

  await runner.replay('p', TENANT_A);

  // Shadow store was created, written into, and atomically promoted.
  assert.deepEqual(sync.getLiveStore('p', TENANT_A).get('events'), ['e1', 'e2']);
  const status = await runner.status('p', TENANT_A);
  assert.deepEqual(status.cursor, {
    created_at: '2026-05-21T02:00:00.000Z',
    id: 'e2',
  });
});
