/**
 * persistentWriteRunner.test.js
 *
 * Phase 4-1 Task 7 — unit tests for runPersistentWrite (hydrate → run → advance).
 *
 * Uses INJECTED fakes only — no real Postgres. The fake eventStore exposes the
 * same surface the PG event store does (append/query/replay), and an injectable
 * `createRunner` lets the test substitute a spy runner so we can assert exactly
 * which projections were REBUILT (runner.replay) during the advance, and that
 * the rebuild covers the AFFECTED projection set for the captured event types.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runPersistentWrite,
  rebuildFinanceProjections,
} from '../../../lib/finance/persistentWriteRunner.js';

const TENANT = 'tenant-7';

// A minimal approval.requested replay event so the hydrated bucket exposes a
// pending approval 'A' to the command. Mirrors the simulateDealWon emit-site
// payload shape (approval + journal_entry under finance.approval.requested).
function seedApprovalRequestedEvent(approvalId = 'A') {
  return {
    id: `evt_seed_${approvalId}`,
    tenant_id: TENANT,
    event_type: 'finance.approval.requested',
    aggregate_type: 'approval',
    aggregate_id: approvalId,
    created_at: '2026-01-01T00:00:00.000Z',
    payload: {
      approval: {
        id: approvalId,
        tenant_id: TENANT,
        target_type: 'journal_entry',
        target_id: 'journal_X',
        status: 'pending',
        requested_by: 'user-1',
        requested_at: '2026-01-01T00:00:00.000Z',
      },
      journal_entry: {
        id: 'journal_X',
        tenant_id: TENANT,
        status: 'pending_approval',
        lines: [],
      },
      adapter_job: {
        id: 'adapter_job_X',
        tenant_id: TENANT,
        status: 'draft',
        aggregate_type: 'journal_entry',
        aggregate_id: 'journal_X',
      },
    },
  };
}

// Fake eventStore mirroring the PG store surface used by the runner.
function makeFakeEventStore(seedEvents = []) {
  const appended = [];
  const replayCalls = []; // [{ tenantId, isTestData }] — proves hydrate's mode arg
  return {
    appended,
    replayCalls,
    seedEvents,
    replay: async (_tenantId, isTestData) => {
      replayCalls.push({ tenantId: _tenantId, isTestData });
      return [...seedEvents];
    },
    append: async (e) => {
      appended.push(e);
      return e;
    },
    query: async () => [...seedEvents],
  };
}

// A spy runner factory: records every replay(projectionName, tenantId) call made
// during the advance (the catch-up-by-rebuild step). `failAlways` makes replay
// REJECT (infra-level failure: projection-store / PG error) so we can assert
// non-fatal advancement. `degradeAlways` makes replay RESOLVE with a degraded
// outcome — the rebuild itself failed (a worker threw on the full stream).
function makeSpyRunnerFactory({ failAlways = false, degradeAlways = false } = {}) {
  const replayed = []; // [{ projectionName, tenantId }]
  const registered = [];
  const factory = () => ({
    register: (worker) => registered.push(worker),
    replay: async (projectionName, tenantId, isTestData) => {
      // Slice 6b-1: capture the data-mode arg so tests can assert the active
      // mode is threaded into each affected projection's rebuild.
      replayed.push({ projectionName, tenantId, isTestData });
      if (failAlways) {
        throw new Error('projection rebuild boom');
      }
      if (degradeAlways) {
        return { outcome: 'degraded', cursor: null };
      }
      return { outcome: 'rebuilt', cursor: null };
    },
  });
  factory.replayed = replayed;
  factory.registered = registered;
  return factory;
}

function makeFakeLogger() {
  const warns = [];
  return {
    logger: {
      warn: (...args) => warns.push(args),
      info: () => {},
      error: () => {},
      debug: () => {},
    },
    warns,
  };
}

// A real domain command: approve the seeded approval 'A'. Succeeds only if the
// hydrated bucket made approval 'A' visible (proving hydration ran first).
function approveCommand(approvalId = 'A') {
  return (svc) =>
    svc.approveFinanceAction({
      tenantId: TENANT,
      approvalId,
      actor: { id: 'approver-1', type: 'human' },
    });
}

test('hydrate → run → advance: command sees seeded approval, then affected projections are rebuilt AFTER append', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const { logger } = makeFakeLogger();

  // Track relative order of append vs replay (rebuild) on a shared timeline.
  const timeline = [];
  const wrappedStore = {
    ...eventStore,
    append: async (e) => {
      timeline.push({ op: 'append', id: e.id, type: e.event_type });
      return eventStore.append(e);
    },
  };
  const createRunnerTracked = () => ({
    register: () => {},
    replay: async (projectionName) => {
      timeline.push({ op: 'replay', projection: projectionName });
      return { outcome: 'rebuilt', cursor: null };
    },
  });

  const result = await runPersistentWrite({
    eventStore: wrappedStore,
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner: createRunnerTracked,
    logger,
  });

  // Command resolved (hydration made approval 'A' visible → no 404).
  assert.equal(result.approval.id, 'A');
  assert.equal(result.approval.status, 'approved');

  // The approval.approved envelope was appended, then at least one rebuild ran.
  const approvedAppendIdx = timeline.findIndex(
    (t) => t.op === 'append' && t.type === 'finance.approval.approved',
  );
  const firstReplayIdx = timeline.findIndex((t) => t.op === 'replay');
  assert.ok(approvedAppendIdx >= 0, 'approval.approved should be appended');
  assert.ok(firstReplayIdx >= 0, 'at least one projection should be rebuilt');
  assert.ok(firstReplayIdx > approvedAppendIdx, 'rebuild (advance) must happen AFTER append');

  // Every rebuild in the timeline must follow at least one append.
  const firstAppend = timeline.findIndex((t) => t.op === 'append');
  assert.ok(firstAppend >= 0 && firstReplayIdx > firstAppend);
});

test('read-your-write: the AFFECTED projections (and only those) are rebuilt during advance', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const createRunner = makeSpyRunnerFactory();
  const { logger } = makeFakeLogger();

  await runPersistentWrite({
    eventStore,
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner,
    logger,
  });

  // The command appended finance.approval.approved + finance.journal.posted
  // (Cash Flow Slice 2 — approving a journal-entry approval now posts it) + a
  // finance.adapter.sync_queued from promoting the seeded draft adapter_job for
  // journal_X. The affected projection set is every worker consuming those types:
  //   approval.approved   → approval_queue, journal_entries
  //   journal.posted      → journal_entries, ledger
  //   adapter.sync_queued → adapter_queue
  assert.ok(eventStore.appended.length >= 1, 'command appended at least one event');
  const replayedNames = createRunner.replayed.map((r) => r.projectionName);

  // Each affected projection replayed EXACTLY once (distinct set), for TENANT.
  assert.ok(
    replayedNames.includes('finance.projection.approval_queue'),
    'approval_queue is affected by approval.approved',
  );
  assert.ok(
    replayedNames.includes('finance.projection.journal_entries'),
    'journal_entries is affected by approval.approved',
  );
  assert.ok(
    replayedNames.includes('finance.projection.adapter_queue'),
    'adapter_queue is affected by adapter.sync_queued',
  );
  // Cash Flow Slice 2: posting on approval emits finance.journal.posted, which the
  // ledger projection consumes — so ledger IS now affected by an approve.
  assert.ok(
    replayedNames.includes('finance.projection.ledger'),
    'ledger is affected by finance.journal.posted (posting on approval)',
  );
  // Non-affected projections must NOT be rebuilt (no invoice events here).
  assert.ok(
    !replayedNames.includes('finance.projection.invoices'),
    'invoices consumes only invoice draft events — not affected',
  );
  // Distinct set: no projection rebuilt twice.
  assert.equal(replayedNames.length, new Set(replayedNames).size, 'each affected projection once');
  // Every replay scoped to the write's tenant.
  assert.ok(createRunner.replayed.every((r) => r.tenantId === TENANT));
});

test('materializes finance.adapter_jobs from captured events when a pool is present (Codex PR #633 P1)', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const createRunner = makeSpyRunnerFactory();
  const { logger } = makeFakeLogger();
  const materializeCalls = [];
  const fakePool = { query: async () => ({ rowCount: 1 }) };

  await runPersistentWrite({
    eventStore,
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner,
    adapterJobPool: fakePool,
    materializeAdapterJobs: async (args) => {
      materializeCalls.push(args);
      return { written: 1 };
    },
    logger,
  });

  // Invoked once with the pool, tenant, and the captured envelopes — including the
  // sync_queued emitted by promoting the seeded draft adapter_job — so the SQL
  // adapter worker has a row to claim.
  assert.equal(materializeCalls.length, 1);
  assert.equal(materializeCalls[0].pool, fakePool);
  assert.equal(materializeCalls[0].tenantId, TENANT);
  const types = materializeCalls[0].events.map((e) => e.event_type);
  assert.ok(
    types.includes('finance.adapter.sync_queued'),
    'the sync_queued envelope is handed to the materializer',
  );
});

test('skips adapter-jobs materialization when no pool is available (in-memory/test path)', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const createRunner = makeSpyRunnerFactory();
  const { logger } = makeFakeLogger();
  let called = false;

  await runPersistentWrite({
    eventStore,
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner,
    // no adapterJobPool / pgPool
    materializeAdapterJobs: async () => {
      called = true;
      return { written: 0 };
    },
    logger,
  });

  assert.equal(called, false, 'no pool → the materializer is not invoked');
});

test('TEST-mode writes do NOT materialize finance.adapter_jobs (keep test jobs out of the provider worker) (Codex PR #634 P1)', async () => {
  let called = false;
  const { logger } = makeFakeLogger();

  await runPersistentWrite({
    eventStore: makeFakeEventStore([seedApprovalRequestedEvent('A')]),
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner: makeSpyRunnerFactory(),
    adapterJobPool: { query: async () => ({ rowCount: 0 }) },
    isTestData: true,
    materializeAdapterJobs: async () => {
      called = true;
      return { written: 0 };
    },
    logger,
  });

  // finance.adapter_jobs has no is_test_data column and claimPersistent claims any
  // queued row, so a test job must NEVER enter the claimable table.
  assert.equal(called, false, 'test adapter jobs are not materialized into the claimable table');
});

test('a non-durable event (append REJECTS) is NOT captured — no advance, no materialization (Codex PR #633 P1)', async () => {
  const materializeCalls = [];
  const replayed = [];
  const failingStore = {
    replay: async () => [],
    query: async () => [],
    append: async () => {
      throw new Error('durable append rejected');
    },
  };
  const createRunner = () => ({
    register: () => {},
    replay: async (p) => {
      replayed.push(p);
      return { outcome: 'rebuilt', cursor: null };
    },
  });
  const { logger } = makeFakeLogger();

  await assert.rejects(
    runPersistentWrite({
      eventStore: failingStore,
      storeProvider: {},
      tenantId: TENANT,
      // createDraftInvoice appends finance.invoice.draft_created (append-before-mutate),
      // so a rejecting durable append makes the command throw before anything is captured.
      command: (svc) =>
        svc.createDraftInvoice({
          tenantId: TENANT,
          actor: { id: 'u', type: 'human' },
          payload: { customer_id: 'c1', subtotal_cents: 100, total_cents: 100 },
        }),
      createRunner,
      adapterJobPool: { query: async () => ({ rowCount: 0 }) },
      materializeAdapterJobs: async (args) => {
        materializeCalls.push(args);
        return { written: 0 };
      },
      logger,
    }),
    /durable append rejected/,
  );

  // Append rejected ⇒ nothing captured ⇒ no projection advance, no adapter-jobs
  // materialization (a phantom finance.adapter_jobs row for a non-durable event
  // would let the SQL worker claim a job with no event-store fact).
  assert.equal(replayed.length, 0, 'no projection rebuild for a non-durable event');
  assert.equal(materializeCalls.length, 0, 'no materialization for a non-durable event');
});

test('advance failure (infra: replay REJECTS) is non-fatal: resolves with command result, rebuilds each affected projection once, logs warn', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const createRunner = makeSpyRunnerFactory({ failAlways: true });
  const { logger, warns } = makeFakeLogger();

  const result = await runPersistentWrite({
    eventStore,
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner,
    logger,
    maxAttempts: 3,
    retryBackoffMs: 1,
  });

  // Resolved with the authoritative command result despite the rebuild rejecting.
  assert.equal(result.approval.status, 'approved');

  // Each affected projection's rebuild is attempted exactly once.
  const affected = new Set(createRunner.replayed.map((r) => r.projectionName));
  assert.ok(affected.size >= 1, 'at least one affected projection');
  assert.equal(
    createRunner.replayed.length,
    affected.size,
    'each affected projection replayed once',
  );

  // logger.warn called at least once per failed rebuild.
  assert.ok(warns.length >= affected.size);
  const flat = JSON.stringify(warns);
  assert.ok(flat.includes(TENANT));
  assert.ok(flat.includes('infra'), 'infra failure is logged');
});

test('advance degradation (replay RESOLVES with degraded outcome) is non-fatal: resolves with command result, logs warn with degraded projection', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const createRunner = makeSpyRunnerFactory({ degradeAlways: true });
  const { logger, warns } = makeFakeLogger();

  const result = await runPersistentWrite({
    eventStore,
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner,
    logger,
  });

  // Resolved with the authoritative command result despite the degraded rebuild.
  assert.equal(result.approval.status, 'approved');

  // Rebuild resolved (not rejected) — each affected projection once.
  const affected = new Set(createRunner.replayed.map((r) => r.projectionName));
  assert.ok(affected.size >= 1);
  assert.equal(createRunner.replayed.length, affected.size);

  // logger.warn was called, surfacing the degraded projection in its payload.
  assert.ok(warns.length >= affected.size, 'a warn fires per degraded rebuild');
  const flat = JSON.stringify(warns);
  assert.ok(flat.includes(TENANT));
  assert.ok(flat.includes('finance.projection.'), 'degraded projection name is logged');
  assert.ok(flat.includes('degraded'), 'degraded outcome is logged');
});

test('command error propagates after best-effort advancing captured events', async () => {
  // Seed nothing → approval 'A' is NOT visible → command throws 404.
  const eventStore = makeFakeEventStore([]);
  const createRunner = makeSpyRunnerFactory();
  const { logger } = makeFakeLogger();

  await assert.rejects(
    () =>
      runPersistentWrite({
        eventStore,
        storeProvider: {},
        tenantId: TENANT,
        command: approveCommand('A'),
        createRunner,
        logger,
      }),
    (err) => {
      assert.equal(err.statusCode, 404);
      return true;
    },
  );
});

test('durable hydration proof: seeded PG approval is visible to the command (no 404)', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const createRunner = makeSpyRunnerFactory();
  const { logger } = makeFakeLogger();

  // Replay was the hydration source; approval 'A' lives only in the event store.
  const result = await runPersistentWrite({
    eventStore,
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner,
    logger,
  });

  assert.equal(result.approval.id, 'A');
  assert.equal(result.approval.status, 'approved');
});

// ── slice 6a: Test/Live data-mode stamping ────────────────────────────────────

test('isTestData=true: hydrate replays the test partition and every captured envelope is stamped is_test_data=true', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const createRunner = makeSpyRunnerFactory();
  const { logger } = makeFakeLogger();

  const result = await runPersistentWrite({
    eventStore,
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner,
    logger,
    isTestData: true,
  });

  assert.equal(result.approval.status, 'approved');

  // (a) HYDRATE replayed with the current mode (test ⇒ true).
  assert.ok(eventStore.replayCalls.length >= 1, 'hydrate must call replay');
  assert.equal(
    eventStore.replayCalls[0].isTestData,
    true,
    'hydrate must replay(tenantId, true) for test mode',
  );

  // (b) Every appended/captured envelope is stamped is_test_data=true.
  assert.ok(eventStore.appended.length >= 1, 'at least one event appended');
  assert.ok(
    eventStore.appended.every((e) => e.is_test_data === true),
    'every captured envelope must be stamped is_test_data=true',
  );

  // (c) Slice 6b-1: the ADVANCE rebuild forwards the active mode (test ⇒ true)
  // to runner.replay for EVERY affected projection — projections are rebuilt
  // from the test partition only.
  assert.ok(createRunner.replayed.length >= 1, 'at least one projection rebuilt');
  assert.ok(
    createRunner.replayed.every((r) => r.isTestData === true),
    'every affected projection must be rebuilt with isTestData=true',
  );
});

test('default (no isTestData): hydrate replays live partition and envelopes are stamped is_test_data=false', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const createRunner = makeSpyRunnerFactory();
  const { logger } = makeFakeLogger();

  const result = await runPersistentWrite({
    eventStore,
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner,
    logger,
  });

  assert.equal(result.approval.status, 'approved');

  // Hydrate replays with the default live mode (false).
  assert.equal(
    eventStore.replayCalls[0].isTestData,
    false,
    'default hydrate must replay(tenantId, false)',
  );
  // Every captured envelope stamped live (false).
  assert.ok(eventStore.appended.length >= 1);
  assert.ok(
    eventStore.appended.every((e) => e.is_test_data === false),
    'default mode must stamp envelopes is_test_data=false',
  );

  // Slice 6b-1: the ADVANCE rebuild forwards the default live mode (false) to
  // runner.replay for every affected projection.
  assert.ok(createRunner.replayed.length >= 1, 'at least one projection rebuilt');
  assert.ok(
    createRunner.replayed.every((r) => r.isTestData === false),
    'default mode must rebuild every affected projection with isTestData=false',
  );
});

test('validation: missing tenantId / command / deps throw a clear error', async () => {
  const eventStore = makeFakeEventStore([]);
  const createRunner = makeSpyRunnerFactory();
  const { logger } = makeFakeLogger();

  await assert.rejects(
    () =>
      runPersistentWrite({
        eventStore,
        storeProvider: {},
        tenantId: null,
        command: approveCommand('A'),
        createRunner,
        logger,
      }),
    /tenantId/,
  );

  await assert.rejects(
    () =>
      runPersistentWrite({
        eventStore,
        storeProvider: {},
        tenantId: TENANT,
        command: null,
        createRunner,
        logger,
      }),
    /command/,
  );

  // No pgPool AND no injected eventStore/storeProvider → must throw.
  await assert.rejects(
    () => runPersistentWrite({ tenantId: TENANT, command: approveCommand('A') }),
    /pgPool|eventStore|storeProvider/,
  );
});

// ── slice 6b-2: rebuildFinanceProjections (mode-switch projection rebuild) ─────

// A spy runner factory exposing replayAll (the mode-switch rebuild path). Records
// every replayAll(tenantId, isTestData) call. `failAll` makes replayAll REJECT
// (infra error). `degradeNames` is a set of projection names that come back with
// a degraded outcome; everything else is 'rebuilt'.
function makeReplayAllRunnerFactory({ failAll = false, degradeNames = [] } = {}) {
  const replayAllCalls = []; // [{ tenantId, isTestData }]
  const allProjections = [
    'finance.projection.ledger',
    'finance.projection.journal_entries',
    'finance.projection.approval_queue',
    'finance.projection.adapter_queue',
    'finance.projection.invoices',
  ];
  const degraded = new Set(degradeNames);
  const factory = () => ({
    register: () => {},
    replayAll: async (tenantId, isTestData) => {
      replayAllCalls.push({ tenantId, isTestData });
      if (failAll) {
        throw new Error('replayAll boom');
      }
      return allProjections.map((projectionName) => ({
        projectionName,
        outcome: degraded.has(projectionName) ? 'degraded' : 'rebuilt',
        cursor: null,
      }));
    },
  });
  factory.replayAllCalls = replayAllCalls;
  factory.allProjections = allProjections;
  return factory;
}

test('rebuildFinanceProjections: rebuilds EVERY projection via replayAll(tenantId, isTestData=true) for test mode', async () => {
  const eventStore = makeFakeEventStore([]);
  const createRunner = makeReplayAllRunnerFactory();
  const { logger } = makeFakeLogger();

  const summary = await rebuildFinanceProjections({
    eventStore,
    storeProvider: {},
    createRunner,
    tenantId: TENANT,
    isTestData: true,
    logger,
  });

  // replayAll called exactly once with the NEW mode's partition (test ⇒ true).
  assert.equal(createRunner.replayAllCalls.length, 1);
  assert.equal(createRunner.replayAllCalls[0].tenantId, TENANT);
  assert.equal(createRunner.replayAllCalls[0].isTestData, true);

  // Every registered projection reported as rebuilt; none degraded.
  assert.deepEqual(new Set(summary.rebuilt), new Set(createRunner.allProjections));
  assert.deepEqual(summary.degraded, []);
});

test('rebuildFinanceProjections: live mode threads isTestData=false', async () => {
  const eventStore = makeFakeEventStore([]);
  const createRunner = makeReplayAllRunnerFactory();
  const { logger } = makeFakeLogger();

  await rebuildFinanceProjections({
    eventStore,
    storeProvider: {},
    createRunner,
    tenantId: TENANT,
    isTestData: false,
    logger,
  });

  assert.equal(createRunner.replayAllCalls[0].isTestData, false);
});

test('rebuildFinanceProjections: a degraded projection is NON-FATAL — logged, surfaced in summary.degraded', async () => {
  const eventStore = makeFakeEventStore([]);
  const createRunner = makeReplayAllRunnerFactory({
    degradeNames: ['finance.projection.ledger'],
  });
  const { logger, warns } = makeFakeLogger();

  const summary = await rebuildFinanceProjections({
    eventStore,
    storeProvider: {},
    createRunner,
    tenantId: TENANT,
    isTestData: true,
    logger,
  });

  // Resolves (no throw); the degraded projection is reported, the rest rebuilt.
  assert.deepEqual(summary.degraded, ['finance.projection.ledger']);
  assert.ok(summary.rebuilt.length === createRunner.allProjections.length - 1);
  assert.ok(!summary.rebuilt.includes('finance.projection.ledger'));

  // logger.warn fired, naming the tenant + degraded projection.
  const flat = JSON.stringify(warns);
  assert.ok(flat.includes(TENANT));
  assert.ok(flat.includes('finance.projection.ledger'));
  assert.ok(flat.includes('degraded'));
});

test('rebuildFinanceProjections: a THROWING replayAll (infra) RE-THROWS so the caller decides (Codex PR #634 P1)', async () => {
  const eventStore = makeFakeEventStore([]);
  const createRunner = makeReplayAllRunnerFactory({ failAll: true });
  const { logger, warns } = makeFakeLogger();

  // Re-throws (was swallowed): the shared projection_state is left on the OLD
  // partition, so the caller must be able to react — applyFinanceDataModeChange
  // reverts the mode + returns 503; clearFinanceTestData catches and stays
  // non-fatal. Reporting success here would hide a half-applied mode switch.
  await assert.rejects(
    () =>
      rebuildFinanceProjections({
        eventStore,
        storeProvider: {},
        createRunner,
        tenantId: TENANT,
        isTestData: true,
        logger,
      }),
    /replayAll boom/,
  );
  // The warn still fires for observability before the re-throw.
  assert.ok(warns.length >= 1);
  assert.ok(JSON.stringify(warns).includes(TENANT));
});

test('rebuildFinanceProjections: missing eventStore / storeProvider / tenantId throws a clear error', async () => {
  const eventStore = makeFakeEventStore([]);
  const createRunner = makeReplayAllRunnerFactory();
  const { logger } = makeFakeLogger();

  await assert.rejects(
    () =>
      rebuildFinanceProjections({
        storeProvider: {},
        createRunner,
        tenantId: TENANT,
        logger,
      }),
    /eventStore|storeProvider|tenantId/,
  );
  await assert.rejects(
    () =>
      rebuildFinanceProjections({
        eventStore,
        createRunner,
        tenantId: TENANT,
        logger,
      }),
    /eventStore|storeProvider|tenantId/,
  );
  await assert.rejects(
    () =>
      rebuildFinanceProjections({
        eventStore,
        storeProvider: {},
        createRunner,
        tenantId: null,
        logger,
      }),
    /eventStore|storeProvider|tenantId/,
  );
});
