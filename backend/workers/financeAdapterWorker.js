/**
 * financeAdapterWorker.js
 *
 * Slice 2C deliverable — the `finance-adapter-worker` process: the background
 * poll loop that drains `finance.adapter_jobs WHERE status = 'queued'` for the
 * controlled-tenant allow-list, runs them through the Slice 2B job processor
 * (`runAdapterPollCycle`), and emits canonical sync events.
 *
 * Structural mirror of `financeProjectionWorker.js` (Slice 1 Task 5):
 *
 *   #1  Disabled-by-default. The three-tier env gate
 *       `isFinanceAdapterWorkerEnabled` is the single switch — no implicit
 *       activation from deployment presence. Strict `=== 'true'` on each of
 *       ENABLE_FINANCE_OPS, ENABLE_FINANCE_WORKERS, ENABLE_FINANCE_ADAPTER_WORKER.
 *       Any other value (unset, 'TRUE', '1', 'yes', boolean true) leaves the
 *       gate closed; the worker logs and returns an idle `{ stop }`.
 *
 *   #2  This worker does NOT own job state or claim logic — it just schedules
 *       calls into `runAdapterPollCycle({ pool, adapters, tenantIds, eventStore,
 *       now })`, which is the Slice 2B pure helper. The optimistic-lock claim,
 *       the assertWritePermitted guard, the provider-writes-enabled code gate,
 *       and the sync event emission all live there. This file owns ONLY the
 *       process lifecycle (timer, heartbeat file, signal handlers) and the
 *       dispatch loop wiring. See slice-2-adapter-runtime-design.md §4.3.
 *
 *   #3  Controlled-tenant allow-list. `FINANCE_CONTROLLED_TENANT_IDS` is
 *       parsed via the shared `parseControlledTenantIds` helper from
 *       financeWorkerCommon.js (same exact semantics as the projection
 *       worker). Empty / unset → no tenants → no-op poll cycles. There is
 *       NO implicit "process all tenants" fall-through.
 *
 *   #4  Heartbeat file. Same JSON-on-disk pattern as the projection worker,
 *       written on every poll-cycle completion. The Docker healthcheck in
 *       deploy/coolify/finance-workers.staging.example.yml asserts the
 *       file's existence and a recent mtime — no HTTP /health endpoint is
 *       bound (same Phase 3-4 §5.1 limitation that carries over to this
 *       worker; a follow-up could lift both workers together).
 *
 *   #5  DB connection required at startup even in the disabled state. The
 *       entry block at the bottom requires FINANCE_DB_URL || DATABASE_URL to
 *       be set and process.exit(1)s otherwise — matching the projection
 *       worker's Phase 3-4 §5.1 contract. The pg.Pool is constructed lazily
 *       (no TCP at construction); the disabled gate returns before any
 *       pool.query() runs, so the disabled state opens no actual DB
 *       connection.
 *
 *   #6  Adapter registry is INJECTED, not constructed here. The entry block
 *       starts the worker with an empty `adapters` Map — production adapter
 *       registration (loading the ERPNext adapter via Slice 2A, the
 *       providerPayloadBuilder, the tenant_integrations credentials, etc.)
 *       is out of scope for Slice 2C and lands in a later packet / Phase 3-9.
 *       The empty Map means even if the gate were flipped to enabled, the
 *       job processor would observe no registered providers and skip every
 *       claimed job — defense in depth on top of the disabled-by-default
 *       posture.
 *
 * The pure helpers (`isFinanceAdapterWorkerEnabled`,
 * `runAdapterPollCycleHandler`) are exported for unit tests — they take all
 * dependencies as arguments so they exercise without a real DB, real timers,
 * a real adapter, or a real filesystem. The `startFinanceAdapterWorker`
 * factory and the standalone entry block at the bottom mirror the projection
 * worker's structure.
 *
 * Cross-packet contract (Slice 2B):
 *
 *   import { runAdapterPollCycle } from '../lib/finance/adapterJobProcessor.js';
 *
 *   runAdapterPollCycle({ pool, adapters, tenantIds, eventStore, now })
 *     → Promise<{ claimed_count, succeeded_count, failed_count,
 *                 skipped_count, summary: [...] }>
 *
 * 2B delivers `adapterJobProcessor.js`. This worker assumes that contract
 * per §4.2 of the design freeze. For tests, a fake handler is injected via
 * the `runAdapterPollCycleHandler` parameter on `startFinanceAdapterWorker`
 * (the same test-seam pattern the projection worker uses for runner/
 * eventStore).
 */

import dotenv from 'dotenv';
import logger from '../lib/logger.js';
import {
  parseControlledTenantIds as commonParseControlledTenantIds,
  writeWorkerHeartbeat as commonWriteWorkerHeartbeat,
  installSignalHandlers as commonInstallSignalHandlers,
} from '../lib/finance/financeWorkerCommon.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DEFAULT_HEARTBEAT_PATH = '/tmp/finance-adapter-worker-heartbeat.json';

/**
 * Resolved at every heartbeat write rather than captured at module-load. This
 * lets tests inject FINANCE_ADAPTER_WORKER_HEARTBEAT_PATH per-case without
 * the module-level constant pinning them to /tmp/ (which doesn't exist on
 * Windows dev hosts and silently swallows the write).
 */
function getHeartbeatPath() {
  return process.env.FINANCE_ADAPTER_WORKER_HEARTBEAT_PATH || DEFAULT_HEARTBEAT_PATH;
}

const DEFAULT_POLL_INTERVAL_MS = 5000;

// ── Env gate ────────────────────────────────────────────────────────────────

/**
 * Three-tier env gate. Returns `true` only when every flag is the literal
 * string `'true'`. Anything else — unset, `'TRUE'`, `'1'`, `'yes'`, the
 * boolean `true` — returns `false`. Strict equality matches the projection
 * worker (`financeProjectionWorker.js:69`) and the existing
 * `financeRuntimeGate.js` contract.
 *
 * `env` is a parameter (defaults to `process.env`) so tests can drive every
 * combination without mutating process state.
 */
export function isFinanceAdapterWorkerEnabled(env = process.env) {
  return (
    env.ENABLE_FINANCE_OPS === 'true' &&
    env.ENABLE_FINANCE_WORKERS === 'true' &&
    env.ENABLE_FINANCE_ADAPTER_WORKER === 'true'
  );
}

// ── Tenant config ───────────────────────────────────────────────────────────

/**
 * Re-export of the shared `parseControlledTenantIds` helper so callers can
 * keep importing it from this module path. Implementation lives in
 * `financeWorkerCommon.js` — both workers share the EXACT same parsing
 * semantics (Slice 2C §5.3 factoring).
 */
export const parseControlledTenantIds = commonParseControlledTenantIds;

// ── Poll-cycle wiring (test seam) ───────────────────────────────────────────

/**
 * The handler the worker invokes once per scheduled tick. By default this
 * lazy-imports `runAdapterPollCycle` from the Slice 2B adapter job processor
 * — Slice 2B has not landed yet (parallel packet), and we MUST NOT crash at
 * module-load time if the processor file isn't there. The import happens
 * inside the call so:
 *
 *   - 2C can ship and be reviewed before 2B lands without producing an
 *     ERR_MODULE_NOT_FOUND on every test run.
 *   - Tests inject their own `runAdapterPollCycleHandler` and never trigger
 *     the dynamic import path (matches the projection worker, whose tests
 *     pass `runner` + `eventStore` doubles to `runProjectionPollCycle`).
 *   - In production, once 2B lands, the dynamic import resolves on the
 *     first poll tick. If it fails to resolve, the catch in `runCycle`
 *     logs a single error and the loop continues idle — operator-visible
 *     but not crash-looping.
 *
 * Exported separately so tests can assert it (a) exists and (b) is a
 * function. The factory below accepts a `runAdapterPollCycleHandler`
 * override so test doubles never need to monkeypatch this export.
 */
export async function runAdapterPollCycleHandler(args) {
  const mod = await import('../lib/finance/adapterJobProcessor.js');
  const fn = mod.runAdapterPollCycle || mod.default?.runAdapterPollCycle;
  if (typeof fn !== 'function') {
    throw new Error(
      'adapterJobProcessor.js does not export runAdapterPollCycle (Slice 2B contract)',
    );
  }
  return fn(args);
}

// ── Process lifecycle (timer, heartbeat, factory) ───────────────────────────

function getWorkerPollIntervalMs() {
  // Two env names are supported for the poll interval — the worker-specific
  // FINANCE_ADAPTER_WORKER_POLL_MS (matches the §4.3 design wording) AND the
  // shared FINANCE_WORKER_POLL_INTERVAL_MS used by the projection worker.
  // If the worker-specific override is set it wins; otherwise we fall back
  // to the shared name. This lets an operator pin a different cadence per
  // worker (the projection worker is dispatch-bound; the adapter worker is
  // HTTP-call-bound — different optimal intervals).
  const adapterSpecific = Number.parseInt(process.env.FINANCE_ADAPTER_WORKER_POLL_MS, 10);
  if (Number.isInteger(adapterSpecific) && adapterSpecific > 0) {
    return adapterSpecific;
  }
  const shared = Number.parseInt(process.env.FINANCE_WORKER_POLL_INTERVAL_MS, 10);
  if (Number.isInteger(shared) && shared > 0) {
    return shared;
  }
  return DEFAULT_POLL_INTERVAL_MS;
}

function writeAdapterWorkerHeartbeat(extra = {}) {
  commonWriteWorkerHeartbeat({
    path: getHeartbeatPath(),
    workerName: 'finance-adapter-worker',
    extra,
    log: logger,
  });
}

let workerStarted = false;
let workerTimer = null;

function clearWorkerTimer() {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}

/**
 * Reset the singleton state. Exported for tests so they can run the factory
 * multiple times in one process without the "worker already started" guard
 * tripping. Not part of the production contract.
 */
export function __resetAdapterWorkerStateForTests() {
  workerStarted = false;
  clearWorkerTimer();
}

/**
 * Start the worker. If the three-tier gate is not satisfied, log and return
 * an idle `{ stop, runOnce }` — never open a DB connection, never call the
 * job processor, never write a heartbeat (this is the disabled-by-default
 * contract, mirroring the projection worker's design constraint #8).
 *
 * `pool`, `adapters`, `eventStore` are passed in by the entry block; tests
 * supply doubles. `adapters` is a Map<provider, AdapterInstance>; an empty
 * Map is valid and means the job processor will skip every claimed job's
 * adapter step (defense in depth — see file header constraint #6).
 *
 * `runAdapterPollCycleHandler` is a test seam: defaults to the module-level
 * `runAdapterPollCycleHandler` (which lazy-imports Slice 2B), but tests
 * override it with a fake to avoid the dynamic-import path.
 *
 * The factory returns `{ stop, runOnce }` — `runOnce` runs a single poll
 * cycle and resolves with the processor's return value, used by tests to
 * deterministically observe the heartbeat write + processor invocation
 * without dealing with timers.
 */
export function startFinanceAdapterWorker({
  pool,
  adapters,
  eventStore,
  tenantIds = parseControlledTenantIds(),
  runAdapterPollCycleHandler: pollHandler = runAdapterPollCycleHandler,
  now = () => new Date().toISOString(),
  // `autoStart` controls whether the factory immediately schedules the first
  // poll cycle via setImmediate (production) or leaves driving to the caller
  // via `runOnce` (tests). Defaults to true so the production entry block
  // doesn't need to know about this; tests set it false to avoid the
  // setImmediate racing their explicit runOnce() and double-invoking the
  // injected poll handler. (The projection worker doesn't need this seam
  // because its tests only exercise the pure helper `runProjectionPollCycle`
  // — they never call `startFinanceProjectionWorker`.)
  autoStart = true,
} = {}) {
  if (!isFinanceAdapterWorkerEnabled()) {
    logger.info('[finance-adapter-worker] disabled — idling');
    return {
      stop: () => {
        logger.debug('[finance-adapter-worker] stop called on idle worker');
      },
      runOnce: async () => {
        // The idle worker still exposes runOnce so callers can observe the
        // disabled state symmetrically with the enabled state, but it does
        // not call the processor (mirrors the disabled-by-default contract).
        logger.debug('[finance-adapter-worker] runOnce called on idle worker — no-op');
        return null;
      },
    };
  }

  if (workerStarted) {
    logger.warn('[finance-adapter-worker] worker already started');
    return {
      stop: () => {
        logger.debug('[finance-adapter-worker] stop called on already-running worker');
      },
      runOnce: async () => {
        logger.debug('[finance-adapter-worker] runOnce called on already-running worker');
        return null;
      },
    };
  }

  // pool + eventStore are required when the gate is open — without them the
  // job processor cannot claim rows or emit events. `adapters` may be empty
  // (intentional for the Slice 2C entry block).
  if (!pool || !eventStore) {
    logger.error('[finance-adapter-worker] cannot start without { pool, eventStore } wiring');
    return {
      stop: () => {
        logger.debug('[finance-adapter-worker] stop called on unwired worker');
      },
      runOnce: async () => null,
    };
  }

  const adapterRegistry = adapters instanceof Map ? adapters : new Map();

  workerStarted = true;
  const pollIntervalMs = getWorkerPollIntervalMs();
  logger.info(
    {
      poll_interval_ms: pollIntervalMs,
      tenant_count: tenantIds.length,
      adapter_count: adapterRegistry.size,
    },
    '[finance-adapter-worker] starting finance adapter worker',
  );
  writeAdapterWorkerHeartbeat({
    status: 'starting',
    poll_interval_ms: pollIntervalMs,
    tenant_count: tenantIds.length,
    adapter_count: adapterRegistry.size,
  });

  const runCycleOnce = async () => {
    // Per §4.3 + Slice 2C empty-tenant-list contract: if no tenants are
    // configured we MUST NOT invoke the processor. This is the same
    // "explicit allow-list, no implicit fall-through" rule as the projection
    // worker. Writing a heartbeat in this state so the healthcheck still
    // observes liveness even when there's no work — the operator wants to
    // distinguish "worker is alive but idle" from "worker is dead".
    if (tenantIds.length === 0) {
      logger.debug(
        '[finance-adapter-worker] no controlled tenants configured — poll cycle is a no-op',
      );
      writeAdapterWorkerHeartbeat({
        tenant_count: 0,
        claimed_count: 0,
        succeeded_count: 0,
        failed_count: 0,
        skipped_count: 0,
      });
      return null;
    }

    try {
      const result = await pollHandler({
        pool,
        adapters: adapterRegistry,
        tenantIds,
        eventStore,
        now,
      });

      const claimedCount = result?.claimed_count ?? 0;
      const succeededCount = result?.succeeded_count ?? 0;
      const failedCount = result?.failed_count ?? 0;
      const skippedCount = result?.skipped_count ?? 0;

      logger.info(
        {
          tenant_count: tenantIds.length,
          claimed_count: claimedCount,
          succeeded_count: succeededCount,
          failed_count: failedCount,
          skipped_count: skippedCount,
        },
        '[finance-adapter-worker] poll cycle complete',
      );

      writeAdapterWorkerHeartbeat({
        tenant_count: tenantIds.length,
        claimed_count: claimedCount,
        succeeded_count: succeededCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
      });

      return result;
    } catch (error) {
      // The 2B `runAdapterPollCycle` contract (§4.2) is "the cycle itself
      // never throws — defense-in-depth catch around the inner loop." This
      // catch is the worker's own outer defense, so if the processor ever
      // does throw (programming error, broken 2B import, etc.) the loop
      // logs and keeps running rather than silently dying.
      logger.error(
        {
          error: error?.message || String(error),
          code: error?.code || null,
        },
        '[finance-adapter-worker] poll cycle crashed',
      );
      return null;
    }
  };

  const runCycle = async () => {
    if (!workerStarted) {
      return;
    }
    try {
      await runCycleOnce();
    } finally {
      if (workerStarted) {
        workerTimer = setTimeout(runCycle, pollIntervalMs);
      }
    }
  };

  if (autoStart) {
    setImmediate(runCycle);
  }

  return {
    stop: () => {
      logger.info('[finance-adapter-worker] stopping finance adapter worker');
      workerStarted = false;
      clearWorkerTimer();
      writeAdapterWorkerHeartbeat({ status: 'stopping' });
    },
    runOnce: runCycleOnce,
  };
}

export default {
  isFinanceAdapterWorkerEnabled,
  parseControlledTenantIds,
  runAdapterPollCycleHandler,
  startFinanceAdapterWorker,
};

// ── Standalone entry ────────────────────────────────────────────────────────
//
// When invoked as `node workers/financeAdapterWorker.js` (i.e. the
// `worker:finance-adapter` npm script), build the pg.Pool from
// FINANCE_DB_URL || DATABASE_URL, construct an empty adapters Map, install
// SIGINT/SIGTERM handlers, and start the loop. The DB connection string is
// REQUIRED at startup even in the disabled state — the entry block exits if
// neither env var is set, matching the projection worker (Phase 3-4 §5.1).
//
// Production adapter registration (loading the ERPNext sandbox adapter +
// per-tenant credentials from tenant_integrations) is NOT part of Slice 2C
// — see file header constraint #6. The empty adapters Map combined with the
// disabled-by-default gate means this entry block can be deployed safely
// today; flipping the gate without registering adapters would result in
// every claimed job being skipped at the processor level (defense in depth).

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href
) {
  // pg is imported lazily so the test harness never accidentally opens a
  // pool — tests import the pure helpers from this module without triggering
  // the entry-block code path.
  const { default: pg } = await import('pg');
  const connectionString = process.env.FINANCE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    logger.error(
      '[finance-adapter-worker] FINANCE_DB_URL (or DATABASE_URL) is required to start the worker',
    );
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString,
    max: Number.parseInt(process.env.FINANCE_DB_POOL_MAX || '5', 10),
    statement_timeout: Number.parseInt(process.env.FINANCE_DB_STATEMENT_TIMEOUT_MS || '30000', 10),
  });

  // Adapter registry — populated from environment per the Slice 2A boundary.
  // Per the Slice 2 cross-packet review P2 catch: a Slice-2C worker booted
  // with an empty Map would skip every claimed job ("no adapter registered
  // for provider X"), which defeats the integration claim. We register the
  // ERPNext sandbox adapter at boot when its credentials are present in env;
  // otherwise leave the slot empty (gracefully no-op + worker logs warn).
  //
  // Per-tenant credential loading from `tenant_integrations` is a future
  // packet (the adapter takes one set of credentials per worker process
  // today; a per-tenant credential router is a separate concern, gated on
  // the `tenant_integrations.api_credentials` shape work tracked under
  // Phase 3-10 §6). For Slice 2 the worker registers a single ERPNext
  // adapter instance from env; Phase 3-10's draft-write proof runs against
  // exactly that one sandbox configuration.
  const adapters = new Map();
  const erpnextBaseUrl = process.env.FINANCE_ERPNEXT_BASE_URL;
  const erpnextApiKey = process.env.FINANCE_ERPNEXT_API_KEY;
  const erpnextApiSecret = process.env.FINANCE_ERPNEXT_API_SECRET;
  const erpnextSandboxAllowlist = (process.env.FINANCE_ERPNEXT_SANDBOX_BASE_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (erpnextBaseUrl && erpnextApiKey && erpnextApiSecret) {
    try {
      const { createErpnextSandboxAdapter } = await import(
        '../lib/finance/accountingAdapters/erpnextSandboxAdapter.js'
      );
      const erpnextAdapter = createErpnextSandboxAdapter({
        baseUrl: erpnextBaseUrl,
        apiKey: erpnextApiKey,
        apiSecret: erpnextApiSecret,
        sandboxAllowlist: erpnextSandboxAllowlist,
        // httpClient defaults to the adapter's internal fetch-based client;
        // override via DI if a future Phase needs request signing / tracing.
      });
      adapters.set('erpnext', erpnextAdapter);
      logger.info(
        { provider: 'erpnext', base_url: erpnextBaseUrl },
        '[finance-adapter-worker] registered erpnext sandbox adapter',
      );
    } catch (err) {
      // Constructor throws on production-looking URLs / missing required
      // params. Log and continue — the worker boots without erpnext
      // registered, and the processor will skip any erpnext jobs (no
      // attempt consumed).
      logger.error(
        { error: err?.message || String(err), code: err?.code || null },
        '[finance-adapter-worker] failed to register erpnext sandbox adapter — continuing with empty registry',
      );
    }
  } else {
    logger.info(
      '[finance-adapter-worker] erpnext credentials not configured — provider not registered (worker will skip erpnext jobs)',
    );
  }

  // eventStore wiring — lazy-imported so the test harness path stays clean.
  const { createFinancePgEventStore } = await import('../lib/finance/financeEventStore.pg.js');
  const eventStore = createFinancePgEventStore({ pool });

  const tenantIds = parseControlledTenantIds();

  if (isFinanceAdapterWorkerEnabled() && tenantIds.length === 0) {
    logger.warn(
      '[finance-adapter-worker] enabled but no FINANCE_CONTROLLED_TENANT_IDS configured — poll cycles will be no-ops',
    );
  }

  const worker = startFinanceAdapterWorker({ pool, adapters, eventStore, tenantIds });

  commonInstallSignalHandlers(() => worker.stop(), {
    onAfterStop: async () => {
      try {
        await pool.end();
      } catch (_err) {
        // Pool may already be closing; nothing to do.
      }
    },
  });
}
