/**
 * persistentWriteRunner.test.js
 *
 * Phase 4-1 Task 7 — unit tests for runPersistentWrite (hydrate → run → advance).
 *
 * Uses INJECTED fakes only — no real Postgres. The fake eventStore exposes the
 * same surface the PG event store does (append/query/replay), and an injectable
 * `createRunner` lets the test substitute a spy runner so we can assert exactly
 * which captured envelopes were dispatched, and when, relative to the append.
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

// A spy runner factory: records every dispatch call (and the order vs append).
// `failAlways` makes dispatch reject so we can assert non-fatal advancement.
function makeSpyRunnerFactory({ failAlways = false } = {}) {
  const dispatched = [];
  const registered = [];
  const factory = () => ({
    register: (worker) => registered.push(worker),
    dispatch: async (envelope) => {
      dispatched.push(envelope);
      if (failAlways) {
        throw new Error('projection dispatch boom');
      }
      return { event_id: envelope.id, dispatched: [] };
    },
  });
  factory.dispatched = dispatched;
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

test('hydrate → run → advance: command sees seeded approval, then captured envelope is dispatched AFTER append', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const { logger } = makeFakeLogger();

  // Track relative order of append vs dispatch on a shared timeline.
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
    dispatch: async (env) => {
      timeline.push({ op: 'dispatch', id: env.id, type: env.event_type });
      return { event_id: env.id, dispatched: [] };
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

  // At least the approval.approved envelope was appended then dispatched.
  const approvedAppendIdx = timeline.findIndex(
    (t) => t.op === 'append' && t.type === 'finance.approval.approved',
  );
  const approvedDispatchIdx = timeline.findIndex(
    (t) => t.op === 'dispatch' && t.type === 'finance.approval.approved',
  );
  assert.ok(approvedAppendIdx >= 0, 'approval.approved should be appended');
  assert.ok(approvedDispatchIdx >= 0, 'approval.approved should be dispatched');
  assert.ok(approvedDispatchIdx > approvedAppendIdx, 'dispatch (advance) must happen AFTER append');

  // Every dispatch in the timeline must follow at least one append.
  const firstAppend = timeline.findIndex((t) => t.op === 'append');
  const firstDispatch = timeline.findIndex((t) => t.op === 'dispatch');
  assert.ok(firstAppend >= 0 && firstDispatch > firstAppend);
});

test('read-your-write: every captured envelope is dispatched through the runner', async () => {
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

  // The command (approve + promote linked adapter jobs) appended N envelopes;
  // all N must have been dispatched, in the same order.
  assert.ok(eventStore.appended.length >= 1, 'command appended at least one event');
  assert.equal(
    createRunner.dispatched.length,
    eventStore.appended.length,
    'every appended envelope was dispatched',
  );
  const appendedIds = eventStore.appended.map((e) => e.id);
  const dispatchedIds = createRunner.dispatched.map((e) => e.id);
  assert.deepEqual(dispatchedIds, appendedIds);
});

test('advance failure is non-fatal: resolves with command result, retries maxAttempts, logs warn', async () => {
  const eventStore = makeFakeEventStore([seedApprovalRequestedEvent('A')]);
  const createRunner = makeSpyRunnerFactory({ failAlways: true });
  const { logger, warns } = makeFakeLogger();

  const maxAttempts = 3;
  const result = await runPersistentWrite({
    eventStore,
    storeProvider: {},
    tenantId: TENANT,
    command: approveCommand('A'),
    createRunner,
    logger,
    maxAttempts,
    retryBackoffMs: 1,
  });

  // Resolved with the authoritative command result despite dispatch failure.
  assert.equal(result.approval.status, 'approved');

  // Each captured envelope was retried maxAttempts times.
  const captured = eventStore.appended.length;
  assert.ok(captured >= 1);
  assert.equal(createRunner.dispatched.length, captured * maxAttempts);

  // logger.warn called at least once per failed envelope.
  assert.ok(warns.length >= captured);
  // Warn includes the event id/type + tenant context.
  const flat = JSON.stringify(warns);
  assert.ok(flat.includes(TENANT));
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
