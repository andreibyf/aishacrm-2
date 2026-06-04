/**
 * financeProjectionWorker.test.js
 *
 * Unit tests for the pure pieces of the finance-projection-worker process
 * (Phase 3 Slice 1, Task 5). The worker itself owns only process lifecycle
 * (timer, heartbeat file, signal handling) — those are intentionally NOT
 * exercised here. What IS exercised:
 *
 *   1. `isFinanceProjectionWorkerEnabled(env)` — the three-tier env gate.
 *      All three flags must be the literal string `'true'`; any one unset or
 *      anything-but-'true' returns false.
 *
 *   2. `runProjectionPollCycle({ runner, eventStore, tenantIds })` — the pure
 *      poll-cycle helper. Per tenant: replay() the full ordered stream from
 *      the event store, dispatch() each event through the runner, return a
 *      per-tenant summary. No timers, no DB, no filesystem.
 *
 *   3. Per-tenant error isolation. A thrown error from one tenant's replay or
 *      dispatch must not crash the loop — it must be recorded and the next
 *      tenant must still be processed.
 *
 * Design constraint #1 (runner is the orchestration authority): the worker
 * NEVER owns cursor / replay / persistence logic — these tests verify it just
 * calls `runner.dispatch(event)` for each event from `eventStore.replay()`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isFinanceProjectionWorkerEnabled,
  runProjectionPollCycle,
} from '../../workers/financeProjectionWorker.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';
const TENANT_C = '00000000-0000-4000-8000-cccccccccccc';

// ── Test doubles ─────────────────────────────────────────────────────────────

/** Build a minimal event envelope — only the fields the worker forwards. */
function evt(id, { tenant = TENANT_A, type = 'finance.journal.posted' } = {}) {
  return {
    id,
    tenant_id: tenant,
    event_type: type,
    created_at: '2026-05-22T00:00:00.000Z',
  };
}

/**
 * A fake event store. `eventsByTenant` is a plain map tenantId -> event[].
 * Optional `failTenants` (Set) causes replay() to throw for those tenant ids.
 */
function fakeEventStore(eventsByTenant = {}, { failTenants = new Set() } = {}) {
  const calls = [];
  return {
    calls,
    async replay(tenantId) {
      calls.push(tenantId);
      if (failTenants.has(tenantId)) {
        throw new Error(`replay failed for ${tenantId}`);
      }
      return (eventsByTenant[tenantId] || []).slice();
    },
  };
}

/**
 * A fake runner. Records each dispatched event. Optional `failEventIds` (Set)
 * causes dispatch() to throw for those event ids — used to verify that a
 * mid-tenant dispatch failure is isolated to that tenant.
 */
function fakeRunner({ failEventIds = new Set() } = {}) {
  const dispatched = [];
  return {
    dispatched,
    async dispatch(event) {
      dispatched.push(event);
      if (failEventIds.has(event.id)) {
        throw new Error(`dispatch failed for ${event.id}`);
      }
      return { event_id: event.id, dispatched: [] };
    },
  };
}

// ── 1. The three-tier env gate ───────────────────────────────────────────────

test('isFinanceProjectionWorkerEnabled — all three flags truthy → true', () => {
  const env = {
    ENABLE_FINANCE_OPS: 'true',
    ENABLE_FINANCE_WORKERS: 'true',
    ENABLE_FINANCE_PROJECTION_WORKER: 'true',
  };
  assert.equal(isFinanceProjectionWorkerEnabled(env), true);
});

test('isFinanceProjectionWorkerEnabled — ENABLE_FINANCE_OPS unset → false', () => {
  const env = {
    ENABLE_FINANCE_WORKERS: 'true',
    ENABLE_FINANCE_PROJECTION_WORKER: 'true',
  };
  assert.equal(isFinanceProjectionWorkerEnabled(env), false);
});

test('isFinanceProjectionWorkerEnabled — ENABLE_FINANCE_WORKERS unset → false', () => {
  const env = {
    ENABLE_FINANCE_OPS: 'true',
    ENABLE_FINANCE_PROJECTION_WORKER: 'true',
  };
  assert.equal(isFinanceProjectionWorkerEnabled(env), false);
});

test('isFinanceProjectionWorkerEnabled — ENABLE_FINANCE_PROJECTION_WORKER unset → false', () => {
  const env = {
    ENABLE_FINANCE_OPS: 'true',
    ENABLE_FINANCE_WORKERS: 'true',
  };
  assert.equal(isFinanceProjectionWorkerEnabled(env), false);
});

test('isFinanceProjectionWorkerEnabled — empty env → false', () => {
  assert.equal(isFinanceProjectionWorkerEnabled({}), false);
});

test('isFinanceProjectionWorkerEnabled — any flag set to non-"true" string → false', () => {
  // The contract is *strict equality with the string 'true'*: every other
  // value (including the literal boolean true, '1', 'TRUE', 'yes') is treated
  // as not-enabled. This matches the existing financeRuntimeGate.js pattern
  // and prevents accidental enablement from typos / coerced values.
  assert.equal(
    isFinanceProjectionWorkerEnabled({
      ENABLE_FINANCE_OPS: 'TRUE',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_PROJECTION_WORKER: 'true',
    }),
    false,
  );
  assert.equal(
    isFinanceProjectionWorkerEnabled({
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: '1',
      ENABLE_FINANCE_PROJECTION_WORKER: 'true',
    }),
    false,
  );
  assert.equal(
    isFinanceProjectionWorkerEnabled({
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_PROJECTION_WORKER: 'yes',
    }),
    false,
  );
});

test('isFinanceProjectionWorkerEnabled — defaults env to process.env when omitted', () => {
  // Save & restore so the test does not leak state into sibling tests.
  const prior = {
    ENABLE_FINANCE_OPS: process.env.ENABLE_FINANCE_OPS,
    ENABLE_FINANCE_WORKERS: process.env.ENABLE_FINANCE_WORKERS,
    ENABLE_FINANCE_PROJECTION_WORKER: process.env.ENABLE_FINANCE_PROJECTION_WORKER,
  };
  try {
    delete process.env.ENABLE_FINANCE_OPS;
    delete process.env.ENABLE_FINANCE_WORKERS;
    delete process.env.ENABLE_FINANCE_PROJECTION_WORKER;
    assert.equal(isFinanceProjectionWorkerEnabled(), false);

    process.env.ENABLE_FINANCE_OPS = 'true';
    process.env.ENABLE_FINANCE_WORKERS = 'true';
    process.env.ENABLE_FINANCE_PROJECTION_WORKER = 'true';
    assert.equal(isFinanceProjectionWorkerEnabled(), true);
  } finally {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// ── 2. The poll-cycle helper ─────────────────────────────────────────────────

test('runProjectionPollCycle — for each tenant, replays and dispatches every event', async () => {
  const eventsA = [evt('a-1'), evt('a-2'), evt('a-3')];
  const eventsB = [evt('b-1', { tenant: TENANT_B })];
  const eventStore = fakeEventStore({ [TENANT_A]: eventsA, [TENANT_B]: eventsB });
  const runner = fakeRunner();

  const summary = await runProjectionPollCycle({
    runner,
    eventStore,
    tenantIds: [TENANT_A, TENANT_B],
  });

  // replay was called once per tenant, in order.
  assert.deepEqual(eventStore.calls, [TENANT_A, TENANT_B]);

  // dispatch received every event from every tenant, in stream order.
  assert.deepEqual(
    runner.dispatched.map((e) => e.id),
    ['a-1', 'a-2', 'a-3', 'b-1'],
  );

  // Per-tenant summary: ok=true, event_count matches, no error.
  assert.equal(summary.length, 2);
  assert.deepEqual(summary[0], { tenant_id: TENANT_A, ok: true, event_count: 3, error: null });
  assert.deepEqual(summary[1], { tenant_id: TENANT_B, ok: true, event_count: 1, error: null });
});

test('runProjectionPollCycle — replays only the ACTIVE partition per tenant (Codex PR #634 P1)', async () => {
  const replayCalls = []; // [{ tenantId, isTestData }]
  const eventStore = {
    async replay(tenantId, isTestData) {
      replayCalls.push({ tenantId, isTestData });
      return [];
    },
  };
  const runner = fakeRunner();
  // TENANT_A is in TEST mode, TENANT_B in LIVE mode.
  const resolveIsTestData = async (tenantId) => tenantId === TENANT_A;

  await runProjectionPollCycle({
    runner,
    eventStore,
    tenantIds: [TENANT_A, TENANT_B],
    resolveIsTestData,
  });

  // Each tenant's replay is scoped to its active partition — never the whole stream.
  assert.deepEqual(replayCalls, [
    { tenantId: TENANT_A, isTestData: true },
    { tenantId: TENANT_B, isTestData: false },
  ]);
});

test('runProjectionPollCycle — a failing mode resolver SKIPS the tenant (fail-closed) (Codex PR #634 P2)', async () => {
  const replayCalls = [];
  const eventStore = {
    async replay(tenantId, isTestData) {
      replayCalls.push({ tenantId, isTestData });
      return [];
    },
  };
  const runner = fakeRunner();
  const resolveIsTestData = async () => {
    throw new Error('supabase down');
  };

  const summary = await runProjectionPollCycle({
    runner,
    eventStore,
    tenantIds: [TENANT_A, TENANT_B],
    // TENANT_B resolves fine — proves the skip is per-tenant, not a whole-cycle abort.
    resolveIsTestData: async (t) => {
      if (t === TENANT_A) return resolveIsTestData();
      return false;
    },
  });

  // FAIL-CLOSED: the unresolvable tenant is skipped (no replay, never an arbitrary
  // partition); TENANT_B still runs on its active (live) partition.
  assert.deepEqual(replayCalls, [{ tenantId: TENANT_B, isTestData: false }]);
  assert.equal(summary[0].tenant_id, TENANT_A);
  assert.equal(summary[0].ok, false);
  assert.match(summary[0].error, /data-mode resolve failed/);
  assert.equal(summary[1].tenant_id, TENANT_B);
  assert.equal(summary[1].ok, true);
});

test('runProjectionPollCycle — with NO resolver injected, replays all events (isTestData=null, back-compat)', async () => {
  const replayCalls = [];
  const eventStore = {
    async replay(tenantId, isTestData) {
      replayCalls.push({ tenantId, isTestData });
      return [];
    },
  };
  const runner = fakeRunner();

  await runProjectionPollCycle({ runner, eventStore, tenantIds: [TENANT_A] });

  assert.deepEqual(replayCalls, [{ tenantId: TENANT_A, isTestData: null }]);
});

test('runProjectionPollCycle — empty tenant stream is fine (event_count=0, ok=true)', async () => {
  const eventStore = fakeEventStore({ [TENANT_A]: [] });
  const runner = fakeRunner();

  const summary = await runProjectionPollCycle({
    runner,
    eventStore,
    tenantIds: [TENANT_A],
  });

  assert.equal(runner.dispatched.length, 0);
  assert.deepEqual(summary, [{ tenant_id: TENANT_A, ok: true, event_count: 0, error: null }]);
});

test('runProjectionPollCycle — no tenants configured → no work, returns []', async () => {
  const eventStore = fakeEventStore({});
  const runner = fakeRunner();

  const summary = await runProjectionPollCycle({ runner, eventStore, tenantIds: [] });
  assert.deepEqual(summary, []);
  assert.equal(eventStore.calls.length, 0);
  assert.equal(runner.dispatched.length, 0);
});

// ── 3. Per-tenant error isolation ────────────────────────────────────────────

test('runProjectionPollCycle — replay() throwing for one tenant is isolated; other tenants still run', async () => {
  const eventsB = [evt('b-1', { tenant: TENANT_B })];
  const eventsC = [evt('c-1', { tenant: TENANT_C })];
  const eventStore = fakeEventStore(
    { [TENANT_A]: [evt('a-1')], [TENANT_B]: eventsB, [TENANT_C]: eventsC },
    { failTenants: new Set([TENANT_A]) },
  );
  const runner = fakeRunner();

  const summary = await runProjectionPollCycle({
    runner,
    eventStore,
    tenantIds: [TENANT_A, TENANT_B, TENANT_C],
  });

  // Tenant A's replay threw, so nothing was dispatched for A. B and C still
  // processed end-to-end.
  assert.deepEqual(
    runner.dispatched.map((e) => e.id),
    ['b-1', 'c-1'],
  );

  assert.equal(summary.length, 3);
  assert.equal(summary[0].tenant_id, TENANT_A);
  assert.equal(summary[0].ok, false);
  assert.equal(summary[0].event_count, 0);
  assert.match(summary[0].error, /replay failed for/);

  assert.deepEqual(summary[1], { tenant_id: TENANT_B, ok: true, event_count: 1, error: null });
  assert.deepEqual(summary[2], { tenant_id: TENANT_C, ok: true, event_count: 1, error: null });
});

test('runProjectionPollCycle — dispatch() throwing mid-stream is isolated to that tenant; other tenants still run', async () => {
  const eventsA = [evt('a-1'), evt('a-2'), evt('a-3')];
  const eventsB = [evt('b-1', { tenant: TENANT_B })];
  const eventStore = fakeEventStore({ [TENANT_A]: eventsA, [TENANT_B]: eventsB });
  // Tenant A's second event blows up.
  const runner = fakeRunner({ failEventIds: new Set(['a-2']) });

  const summary = await runProjectionPollCycle({
    runner,
    eventStore,
    tenantIds: [TENANT_A, TENANT_B],
  });

  // Dispatch was attempted for a-1 and a-2; a-2 threw and stopped tenant A's
  // inner loop (the worker does NOT re-attempt or skip-past a failed dispatch
  // — that's the runner's degraded-state responsibility). a-3 is therefore
  // NOT dispatched in this cycle. Tenant B still gets its full stream.
  assert.deepEqual(
    runner.dispatched.map((e) => e.id),
    ['a-1', 'a-2', 'b-1'],
  );

  assert.equal(summary.length, 2);
  assert.equal(summary[0].tenant_id, TENANT_A);
  assert.equal(summary[0].ok, false);
  // event_count reflects events successfully dispatched before the failure.
  assert.equal(summary[0].event_count, 1);
  assert.match(summary[0].error, /dispatch failed for a-2/);

  assert.deepEqual(summary[1], { tenant_id: TENANT_B, ok: true, event_count: 1, error: null });
});

test('runProjectionPollCycle — never throws even when every tenant fails', async () => {
  const eventStore = fakeEventStore(
    { [TENANT_A]: [], [TENANT_B]: [] },
    { failTenants: new Set([TENANT_A, TENANT_B]) },
  );
  const runner = fakeRunner();

  // Should resolve, not reject — that is the entire point of error isolation.
  const summary = await runProjectionPollCycle({
    runner,
    eventStore,
    tenantIds: [TENANT_A, TENANT_B],
  });
  assert.equal(summary.length, 2);
  assert.equal(
    summary.every((row) => row.ok === false),
    true,
  );
});
