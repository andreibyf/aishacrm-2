/**
 * financeAdapterWorker.test.js
 *
 * Unit tests for the pure pieces of the finance-adapter-worker process
 * (Slice 2C). Mirrors the projection-worker test suite shape — exercise the
 * env gate, the controlled-tenant parser, the disabled-state contract, the
 * enabled-empty-tenant no-op contract, the heartbeat-write side effect, and
 * the test-seam injection that keeps these tests independent of the parallel
 * Slice 2B `adapterJobProcessor.js` module.
 *
 * What is NOT exercised here:
 *   - The actual `runAdapterPollCycle` from Slice 2B — that's a sibling packet
 *     and has its own test file. The worker injects the handler so these tests
 *     run with a controllable fake; production wiring is verified by the
 *     entry-block + the Slice 2D integration test.
 *   - The standalone entry block (pg.Pool construction, SIGINT/SIGTERM). The
 *     shared signal-handler helper has its own contract in financeWorkerCommon;
 *     the entry block is just glue.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  isFinanceAdapterWorkerEnabled,
  parseControlledTenantIds,
  runAdapterPollCycleHandler,
  startFinanceAdapterWorker,
  __resetAdapterWorkerStateForTests,
} from '../../workers/financeAdapterWorker.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Snapshot the three-tier gate env vars + the controlled-tenant + heartbeat
 * path, set the supplied values, and return a restore() to put them back.
 * Tests use this so they can drive the gate without leaking into siblings.
 */
async function withEnv(overrides, fn) {
  // NOTE: this function MUST be async — otherwise `return fn()` returns the
  // unresolved Promise and the synchronous `finally` restores env vars BEFORE
  // the test body has read them. Bug we hit on first run: every test that
  // depended on the worker being enabled silently saw the disabled stub.
  const keys = [
    'ENABLE_FINANCE_OPS',
    'ENABLE_FINANCE_WORKERS',
    'ENABLE_FINANCE_ADAPTER_WORKER',
    'ENABLE_FINANCE_PROJECTION_WORKER',
    'FINANCE_CONTROLLED_TENANT_IDS',
    'FINANCE_ADAPTER_WORKER_HEARTBEAT_PATH',
    'FINANCE_ADAPTER_WORKER_POLL_MS',
    'FINANCE_WORKER_POLL_INTERVAL_MS',
  ];
  const prior = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return await fn();
  } finally {
    for (const k of keys) {
      const v = prior[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/**
 * Build a fake `runAdapterPollCycle` that records every invocation and
 * returns the supplied result shape. Default result mirrors the Slice 2B
 * contract `{ claimed_count, succeeded_count, failed_count, skipped_count,
 * summary }`.
 */
function fakePollHandler(result = null) {
  const calls = [];
  const handler = async (args) => {
    calls.push(args);
    return (
      result || {
        claimed_count: 0,
        succeeded_count: 0,
        failed_count: 0,
        skipped_count: 0,
        summary: [],
      }
    );
  };
  handler.calls = calls;
  return handler;
}

function fakeEventStore() {
  return { append: async () => undefined };
}

function fakePool() {
  // Sentinel — the worker passes this straight through to the processor and
  // never calls anything on it. A bare object is fine.
  return { __fake_pool: true };
}

function tmpHeartbeatPath(label) {
  return path.join(os.tmpdir(), `finance-adapter-worker-heartbeat-${label}-${process.pid}.json`);
}

// ── 1. The three-tier env gate ───────────────────────────────────────────────

test('isFinanceAdapterWorkerEnabled — all three flags "true" → true', () => {
  assert.equal(
    isFinanceAdapterWorkerEnabled({
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
    }),
    true,
  );
});

test('isFinanceAdapterWorkerEnabled — ENABLE_FINANCE_OPS unset → false', () => {
  assert.equal(
    isFinanceAdapterWorkerEnabled({
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
    }),
    false,
  );
});

test('isFinanceAdapterWorkerEnabled — ENABLE_FINANCE_WORKERS unset → false', () => {
  assert.equal(
    isFinanceAdapterWorkerEnabled({
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
    }),
    false,
  );
});

test('isFinanceAdapterWorkerEnabled — ENABLE_FINANCE_ADAPTER_WORKER unset → false', () => {
  assert.equal(
    isFinanceAdapterWorkerEnabled({
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
    }),
    false,
  );
});

test('isFinanceAdapterWorkerEnabled — empty env → false', () => {
  assert.equal(isFinanceAdapterWorkerEnabled({}), false);
});

test('isFinanceAdapterWorkerEnabled — strict "true" only ("TRUE", "1", "yes", bool true → false)', () => {
  // The whole point of the three-tier gate is to refuse anything-but-the-
  // literal-string. This mirrors the projection worker's same-named test
  // and prevents accidental enablement from coerced/typo'd values.
  assert.equal(
    isFinanceAdapterWorkerEnabled({
      ENABLE_FINANCE_OPS: 'TRUE',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
    }),
    false,
  );
  assert.equal(
    isFinanceAdapterWorkerEnabled({
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: '1',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
    }),
    false,
  );
  assert.equal(
    isFinanceAdapterWorkerEnabled({
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'yes',
    }),
    false,
  );
  assert.equal(
    isFinanceAdapterWorkerEnabled({
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: true, // boolean, not string
    }),
    false,
  );
});

test('isFinanceAdapterWorkerEnabled — defaults env to process.env when omitted', () => {
  withEnv(
    {
      ENABLE_FINANCE_OPS: undefined,
      ENABLE_FINANCE_WORKERS: undefined,
      ENABLE_FINANCE_ADAPTER_WORKER: undefined,
    },
    () => {
      assert.equal(isFinanceAdapterWorkerEnabled(), false);
    },
  );
  withEnv(
    {
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
    },
    () => {
      assert.equal(isFinanceAdapterWorkerEnabled(), true);
    },
  );
});

// ── 2. Controlled-tenant parser (re-exported from common) ────────────────────

test('parseControlledTenantIds — comma-separated UUIDs, trimmed', () => {
  assert.deepEqual(
    parseControlledTenantIds({
      FINANCE_CONTROLLED_TENANT_IDS: `${TENANT_A}, ${TENANT_B}`,
    }),
    [TENANT_A, TENANT_B],
  );
});

test('parseControlledTenantIds — empty / unset → []', () => {
  assert.deepEqual(parseControlledTenantIds({}), []);
  assert.deepEqual(parseControlledTenantIds({ FINANCE_CONTROLLED_TENANT_IDS: '' }), []);
  assert.deepEqual(parseControlledTenantIds({ FINANCE_CONTROLLED_TENANT_IDS: '   ' }), []);
});

test('parseControlledTenantIds — drops empty entries (trailing comma / double comma tolerated)', () => {
  assert.deepEqual(
    parseControlledTenantIds({
      FINANCE_CONTROLLED_TENANT_IDS: `${TENANT_A},,${TENANT_B},`,
    }),
    [TENANT_A, TENANT_B],
  );
});

// ── 3. Disabled-state contract ───────────────────────────────────────────────

test('startFinanceAdapterWorker — disabled gate returns idle stub, never calls processor', async () => {
  __resetAdapterWorkerStateForTests();
  await withEnv(
    {
      ENABLE_FINANCE_OPS: 'false',
      ENABLE_FINANCE_WORKERS: 'false',
      ENABLE_FINANCE_ADAPTER_WORKER: 'false',
      FINANCE_CONTROLLED_TENANT_IDS: TENANT_A,
      FINANCE_ADAPTER_WORKER_HEARTBEAT_PATH: tmpHeartbeatPath('disabled'),
    },
    async () => {
      const poll = fakePollHandler();
      const worker = startFinanceAdapterWorker({
        pool: fakePool(),
        adapters: new Map(),
        eventStore: fakeEventStore(),
        runAdapterPollCycleHandler: poll,
        autoStart: false,
      });

      // The idle worker exposes both stop() and runOnce(); neither calls the
      // processor (mirrors the projection worker's disabled-state contract).
      assert.equal(typeof worker.stop, 'function');
      assert.equal(typeof worker.runOnce, 'function');

      // Even an explicit runOnce on the idle worker is a no-op — the gate is
      // load-bearing for safety, not just a startup check.
      const result = await worker.runOnce();
      assert.equal(result, null);
      assert.equal(poll.calls.length, 0);

      // No heartbeat is written in the disabled state — same Phase 3-4 §8.2
      // limitation as the projection worker. The healthcheck reporting
      // unhealthy in this state is intentional (the container is alive but
      // not doing work).
      worker.stop();
    },
  );
});

test('startFinanceAdapterWorker — any one of three gates non-"true" keeps worker disabled', async () => {
  // Exercises each of the three legs of the gate independently.
  const combinations = [
    {
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'false',
    },
    {
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'false',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
    },
    {
      ENABLE_FINANCE_OPS: 'false',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
    },
  ];

  for (const combo of combinations) {
    __resetAdapterWorkerStateForTests();
    await withEnv(
      {
        ...combo,
        FINANCE_CONTROLLED_TENANT_IDS: TENANT_A,
        FINANCE_ADAPTER_WORKER_HEARTBEAT_PATH: tmpHeartbeatPath('gate-leg'),
      },
      async () => {
        const poll = fakePollHandler();
        const worker = startFinanceAdapterWorker({
          pool: fakePool(),
          adapters: new Map(),
          eventStore: fakeEventStore(),
          runAdapterPollCycleHandler: poll,
          autoStart: false,
        });
        await worker.runOnce();
        assert.equal(
          poll.calls.length,
          0,
          `expected disabled state for combo ${JSON.stringify(combo)}`,
        );
        worker.stop();
      },
    );
  }
});

// ── 4. Enabled-empty-tenant no-op contract ──────────────────────────────────

test('startFinanceAdapterWorker — enabled with empty FINANCE_CONTROLLED_TENANT_IDS → no-op poll cycle, no processor call', async () => {
  __resetAdapterWorkerStateForTests();
  const heartbeatPath = tmpHeartbeatPath('empty-tenants');
  await withEnv(
    {
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
      FINANCE_CONTROLLED_TENANT_IDS: '', // explicit empty — NO implicit "all tenants"
      FINANCE_ADAPTER_WORKER_HEARTBEAT_PATH: heartbeatPath,
    },
    async () => {
      const poll = fakePollHandler();
      const worker = startFinanceAdapterWorker({
        pool: fakePool(),
        adapters: new Map(),
        eventStore: fakeEventStore(),
        runAdapterPollCycleHandler: poll,
        autoStart: false,
      });
      const result = await worker.runOnce();

      // The processor was never invoked — empty tenants means no claims.
      assert.equal(poll.calls.length, 0);
      assert.equal(result, null);

      // The empty-tenant path still writes a liveness heartbeat (so the
      // healthcheck distinguishes "alive but idle" from "dead"). Verify the
      // counters are all zero. Read BEFORE stop() — stop() overwrites the
      // heartbeat with `{ status: 'stopping' }` (no counters).
      assert.equal(fs.existsSync(heartbeatPath), true);
      const heartbeat = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
      assert.equal(heartbeat.tenant_count, 0);
      assert.equal(heartbeat.claimed_count, 0);
      assert.equal(heartbeat.succeeded_count, 0);
      assert.equal(heartbeat.failed_count, 0);
      assert.equal(heartbeat.skipped_count, 0);

      worker.stop();
      fs.unlinkSync(heartbeatPath);
    },
  );
});

// ── 5. Enabled path invokes the processor with the contract args ────────────

test('startFinanceAdapterWorker — enabled with tenants invokes pollHandler with { pool, adapters, tenantIds, eventStore, now }', async () => {
  __resetAdapterWorkerStateForTests();
  const heartbeatPath = tmpHeartbeatPath('enabled-call');
  await withEnv(
    {
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
      FINANCE_CONTROLLED_TENANT_IDS: `${TENANT_A},${TENANT_B}`,
      FINANCE_ADAPTER_WORKER_HEARTBEAT_PATH: heartbeatPath,
    },
    async () => {
      const pool = fakePool();
      const eventStore = fakeEventStore();
      const adapters = new Map([['erpnext', { __sentinel: 'fake-adapter' }]]);
      const poll = fakePollHandler({
        claimed_count: 1,
        succeeded_count: 1,
        failed_count: 0,
        skipped_count: 0,
        summary: [{ job_id: 'job-1', outcome: 'succeeded' }],
      });

      const worker = startFinanceAdapterWorker({
        pool,
        adapters,
        eventStore,
        runAdapterPollCycleHandler: poll,
        autoStart: false,
      });
      const result = await worker.runOnce();

      assert.equal(poll.calls.length, 1);
      const args = poll.calls[0];
      assert.equal(args.pool, pool, 'processor must receive the same pool');
      assert.equal(args.eventStore, eventStore, 'processor must receive the same eventStore');
      assert.equal(args.adapters, adapters, 'processor must receive the adapter registry');
      assert.deepEqual(args.tenantIds, [TENANT_A, TENANT_B]);
      assert.equal(typeof args.now, 'function', '`now` must be a callable for test injection');

      // The processor return surfaces straight through runOnce — Slice 2D
      // integration relies on this for end-to-end assertions.
      assert.equal(result.claimed_count, 1);
      assert.equal(result.succeeded_count, 1);

      // Heartbeat reflects the processor's counters, not just zeros. Read it
      // BEFORE worker.stop() — stop() overwrites the heartbeat with
      // `{ status: 'stopping' }` so the per-cycle counter assertions would
      // see undefined if we checked after stop.
      assert.equal(fs.existsSync(heartbeatPath), true);
      const heartbeat = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
      assert.equal(heartbeat.tenant_count, 2);
      assert.equal(heartbeat.claimed_count, 1);
      assert.equal(heartbeat.succeeded_count, 1);
      assert.equal(heartbeat.failed_count, 0);
      assert.equal(heartbeat.skipped_count, 0);

      worker.stop();
      fs.unlinkSync(heartbeatPath);
    },
  );
});

test('startFinanceAdapterWorker — processor throw is caught; worker logs but does not crash', async () => {
  __resetAdapterWorkerStateForTests();
  const heartbeatPath = tmpHeartbeatPath('processor-throw');
  await withEnv(
    {
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
      FINANCE_CONTROLLED_TENANT_IDS: TENANT_A,
      FINANCE_ADAPTER_WORKER_HEARTBEAT_PATH: heartbeatPath,
    },
    async () => {
      const throwingHandler = async () => {
        throw new Error('simulated processor crash');
      };
      const worker = startFinanceAdapterWorker({
        pool: fakePool(),
        adapters: new Map(),
        eventStore: fakeEventStore(),
        runAdapterPollCycleHandler: throwingHandler,
        autoStart: false,
      });

      // Outer defense-in-depth: runCycleOnce catches the throw and returns
      // null rather than letting the loop die. This mirrors the projection
      // worker's outer catch around runProjectionPollCycle.
      const result = await worker.runOnce();
      worker.stop();
      assert.equal(result, null);

      if (fs.existsSync(heartbeatPath)) fs.unlinkSync(heartbeatPath);
    },
  );
});

// ── 6. Wiring guard ─────────────────────────────────────────────────────────

test('startFinanceAdapterWorker — enabled gate but missing pool/eventStore → returns unwired idle stub', async () => {
  __resetAdapterWorkerStateForTests();
  await withEnv(
    {
      ENABLE_FINANCE_OPS: 'true',
      ENABLE_FINANCE_WORKERS: 'true',
      ENABLE_FINANCE_ADAPTER_WORKER: 'true',
      FINANCE_CONTROLLED_TENANT_IDS: TENANT_A,
      FINANCE_ADAPTER_WORKER_HEARTBEAT_PATH: tmpHeartbeatPath('unwired'),
    },
    async () => {
      const poll = fakePollHandler();
      // No pool, no eventStore — unwired.
      const worker = startFinanceAdapterWorker({
        adapters: new Map(),
        runAdapterPollCycleHandler: poll,
        autoStart: false,
      });
      assert.equal(typeof worker.stop, 'function');
      assert.equal(typeof worker.runOnce, 'function');
      const result = await worker.runOnce();
      assert.equal(result, null);
      assert.equal(poll.calls.length, 0);
      worker.stop();
    },
  );
});

// ── 7. runAdapterPollCycleHandler shape (test-seam sanity) ───────────────────

test('runAdapterPollCycleHandler is an async function (lazy-imports Slice 2B at call time)', () => {
  // The test seam exists specifically so 2C can ship before 2B lands. We do
  // NOT invoke it here — that would trigger the lazy import and crash if 2B
  // isn't on disk yet. We just assert the export shape.
  assert.equal(typeof runAdapterPollCycleHandler, 'function');
});
