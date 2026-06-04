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

import { runPersistentWrite } from '../../../lib/finance/persistentWriteRunner.js';

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
  return {
    appended,
    seedEvents,
    replay: async (_tenantId) => [...seedEvents],
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
    replay: async (projectionName, tenantId) => {
      replayed.push({ projectionName, tenantId });
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

  // The command appended finance.approval.approved (+ a finance.adapter.sync_queued
  // from promoting the seeded draft adapter_job for journal_X). The affected
  // projection set is every worker consuming those event types:
  //   approval.approved   → approval_queue, journal_entries
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
  // Non-affected projections must NOT be rebuilt (no posted/invoice events here).
  assert.ok(
    !replayedNames.includes('finance.projection.ledger'),
    'ledger consumes only finance.journal.posted — not affected',
  );
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
