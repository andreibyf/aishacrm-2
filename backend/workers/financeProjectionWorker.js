/**
 * financeProjectionWorker.js
 *
 * Phase 3 / Slice 1 — Task 5. The `finance-projection-worker` process: the
 * background poll loop that drives Finance Ops projections forward off the
 * persistent event store (`finance.audit_events`).
 *
 * Design constraints (see docs/plans/2026-05-22-finance-phase-3-slice-1-design.md §6):
 *
 *   #1  The Projection Runner is the orchestration authority. This worker
 *       NEVER owns cursor / replay / persistence logic — it just schedules
 *       calls into `runner.dispatch(event)` (and, eventually, `runner.replay`).
 *       The runner's per-(projection, tenant) cursor guard makes re-dispatch
 *       safe, so a full `eventStore.replay(tenantId)` per poll is the Slice 1
 *       contract. (Incremental "events-after-cursor" is the Phase-3
 *       prerequisite for production scale and explicitly out of Slice 1.)
 *
 *   #6  This worker is operational infrastructure. The projection definitions
 *       and the runner stay pure and isolated from polling / runtime concerns;
 *       this file owns ONLY the process lifecycle (timer, heartbeat, signals)
 *       and the dispatch loop wiring.
 *
 *   #8  Workers are disabled-by-default. The three-tier gate
 *       `isFinanceProjectionWorkerEnabled` is the single switch — no implicit
 *       activation from deployment presence. If any of `ENABLE_FINANCE_OPS`,
 *       `ENABLE_FINANCE_WORKERS`, `ENABLE_FINANCE_PROJECTION_WORKER` is not
 *       the literal string `'true'`, the worker starts, logs that it is
 *       disabled, and idles (returns a no-op `{ stop }`).
 *
 * The pure helpers (`isFinanceProjectionWorkerEnabled`,
 * `runProjectionPollCycle`) are exported for unit tests — they take all their
 * dependencies as arguments so they exercise without a real DB, real timers,
 * or a real filesystem. The `startFinanceProjectionWorker` factory and the
 * standalone entry block at the bottom mirror `communicationsWorker.js`.
 */

import dotenv from 'dotenv';
import logger from '../lib/logger.js';
import { createProjectionRunner } from '../lib/finance/projections/projectionRunner.js';
import { createFinancePgEventStore } from '../lib/finance/financeEventStore.pg.js';
import { createPgProjectionStoreProvider } from '../lib/finance/projections/projectionStore.pg.js';
import { createLedgerProjectionWorker } from '../lib/finance/projections/ledgerProjection.js';
import { createApprovalQueueProjectionWorker } from '../lib/finance/projections/approvalQueueProjection.js';
import { createAdapterQueueProjectionWorker } from '../lib/finance/projections/adapterQueueProjection.js';
import { createAuditTimelineProjectionWorker } from '../lib/finance/projections/auditTimelineProjection.js';
import { createJournalEntriesProjectionWorker } from '../lib/finance/projections/journalEntriesProjection.js';
import { createInvoiceProjectionWorker } from '../lib/finance/projections/invoiceProjection.js';
// Slice 2C: shared worker process-lifecycle helpers extracted to a common module
// so finance-adapter-worker (and any future finance-*-worker) follows the same
// disabled-by-default + heartbeat-file + clean-shutdown contract without
// re-implementing it. Pure mechanical refactor — externally observable behavior
// of this worker is unchanged. See backend/lib/finance/financeWorkerCommon.js.
import {
  parseControlledTenantIds as commonParseControlledTenantIds,
  writeWorkerHeartbeat as commonWriteWorkerHeartbeat,
  installSignalHandlers as commonInstallSignalHandlers,
} from '../lib/finance/financeWorkerCommon.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const HEARTBEAT_PATH =
  process.env.FINANCE_PROJECTION_WORKER_HEARTBEAT_PATH ||
  '/tmp/finance-projection-worker-heartbeat.json';

const DEFAULT_POLL_INTERVAL_MS = 5000;

// ── Env gate ────────────────────────────────────────────────────────────────

/**
 * Three-tier env gate. Returns `true` only when every flag is the literal
 * string `'true'`. Anything else — unset, `'TRUE'`, `'1'`, the boolean `true`
 * — returns `false`. Strict equality matches the existing
 * `financeRuntimeGate.js` contract and prevents accidental enablement from
 * coerced/typo'd values.
 *
 * `env` is a parameter (defaults to `process.env`) so tests can drive every
 * combination without mutating process state.
 */
export function isFinanceProjectionWorkerEnabled(env = process.env) {
  return (
    env.ENABLE_FINANCE_OPS === 'true' &&
    env.ENABLE_FINANCE_WORKERS === 'true' &&
    env.ENABLE_FINANCE_PROJECTION_WORKER === 'true'
  );
}

// ── Tenant config ───────────────────────────────────────────────────────────

/**
 * Slice 1 processes only the configured controlled tenant(s). Parsing rules:
 *   - comma-separated string in `FINANCE_CONTROLLED_TENANT_IDS`
 *   - trim each entry
 *   - drop empty entries (so trailing commas / extra spaces are tolerated)
 *
 * Returns an empty array when the env var is unset or only whitespace —
 * which causes the poll cycle to do nothing (no implicit fall-through to
 * "all tenants"; tenants must be explicitly listed).
 *
 * Slice 2C: implementation moved to financeWorkerCommon.parseControlledTenantIds;
 * this re-export preserves the existing import path for callers and tests.
 */
export const parseControlledTenantIds = commonParseControlledTenantIds;

// ── Poll cycle (the pure helper) ────────────────────────────────────────────

/**
 * Run ONE poll cycle: for each tenant id, replay the full ordered event
 * stream and feed each event through `runner.dispatch`. Returns a per-tenant
 * summary `{ tenant_id, ok, event_count, error }`.
 *
 * Error isolation is the load-bearing behavior: a thrown error from one
 * tenant's `eventStore.replay()` OR from any `runner.dispatch()` is logged
 * and the loop continues with the next tenant. The cycle itself never throws.
 *
 * `event_count` reflects events successfully dispatched before any failure
 * for that tenant — useful operator signal when a partial cycle ran.
 */
export async function runProjectionPollCycle({ runner, eventStore, tenantIds }) {
  const summary = [];

  for (const tenantId of tenantIds) {
    let events;
    try {
      events = await eventStore.replay(tenantId);
    } catch (error) {
      logger.error(
        {
          tenant_id: tenantId,
          error: error?.message || String(error),
        },
        '[finance-projection-worker] eventStore.replay failed for tenant',
      );
      summary.push({
        tenant_id: tenantId,
        ok: false,
        event_count: 0,
        error: error?.message || String(error),
      });
      continue;
    }

    let dispatched = 0;
    let tenantError = null;
    for (const event of events) {
      try {
        await runner.dispatch(event);
        dispatched += 1;
      } catch (error) {
        logger.error(
          {
            tenant_id: tenantId,
            event_id: event?.id || null,
            event_type: event?.event_type || null,
            error: error?.message || String(error),
          },
          '[finance-projection-worker] runner.dispatch failed for event',
        );
        tenantError = error?.message || String(error);
        // Stop this tenant's inner loop on the first dispatch failure. The
        // runner's per-(projection, tenant) cursor guard means the unprocessed
        // events will be re-dispatched safely on the next cycle; pushing past
        // a failed dispatch risks compounding state divergence and is the
        // runner's degraded-projection responsibility, not the worker's.
        break;
      }
    }

    summary.push({
      tenant_id: tenantId,
      ok: tenantError === null,
      event_count: dispatched,
      error: tenantError,
    });
  }

  return summary;
}

// ── Runner construction (production wiring) ─────────────────────────────────

/**
 * Build the production runner: a `createProjectionRunner` wired to the
 * Postgres event store + the Postgres projection-state provider, with every
 * business + infrastructure projection registered (ledger, approval_queue,
 * adapter_queue, audit_timeline, journal_entries, invoices).
 *
 * The audit-timeline worker opts into the reserved internal infrastructure
 * event `finance.audit.event_appended` (the runtime gates infra-event
 * delivery on both `consumedEvents` membership AND this opt-in flag — see
 * `projectionRunner.workerConsumes`).
 */
export function buildProjectionRunner({ pool }) {
  const runner = createProjectionRunner({
    eventStore: createFinancePgEventStore({ pool }),
    storeProvider: createPgProjectionStoreProvider({ pool }),
  });

  runner.register(createLedgerProjectionWorker());
  runner.register(createApprovalQueueProjectionWorker());
  runner.register(createAdapterQueueProjectionWorker());
  runner.register(createAuditTimelineProjectionWorker({ includeInfrastructureEvents: true }));
  runner.register(createJournalEntriesProjectionWorker());
  runner.register(createInvoiceProjectionWorker());

  return runner;
}

// ── Process lifecycle (timer, heartbeat, factory) ───────────────────────────

function getWorkerPollIntervalMs() {
  const configured = Number.parseInt(process.env.FINANCE_WORKER_POLL_INTERVAL_MS, 10);
  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_POLL_INTERVAL_MS;
}

function writeWorkerHeartbeat(extra = {}) {
  // Slice 2C: delegate to the shared helper so both workers write byte-identical
  // heartbeat JSON. The shared helper accepts a `log` interface and the
  // `workerName` for the warn-on-failure log message, so the existing operator
  // log-scraping ("[finance-projection-worker] failed to write heartbeat")
  // continues to match the same message text.
  commonWriteWorkerHeartbeat({
    path: HEARTBEAT_PATH,
    workerName: 'finance-projection-worker',
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
 * Start the worker. If the three-tier gate is not satisfied, log and return
 * an idle `{ stop }` — never open a DB connection, never schedule a timer,
 * never write a heartbeat (this is the disabled-by-default contract, design
 * constraint #8).
 *
 * The standalone entry block at the bottom builds a `pg.Pool` from
 * `FINANCE_DB_URL` (falling back to `DATABASE_URL`) and passes the constructed
 * runner / event store / tenant list in. Tests use the pure helpers directly
 * and never call this factory.
 */
export function startFinanceProjectionWorker({
  runner,
  eventStore,
  tenantIds = parseControlledTenantIds(),
} = {}) {
  if (!isFinanceProjectionWorkerEnabled()) {
    logger.info('[finance-projection-worker] disabled — idling');
    return {
      stop: () => {
        logger.debug('[finance-projection-worker] stop called on idle worker');
      },
    };
  }

  if (workerStarted) {
    logger.warn('[finance-projection-worker] worker already started');
    return {
      stop: () => {
        logger.debug('[finance-projection-worker] stop called on already-running worker');
      },
    };
  }

  if (!runner || !eventStore) {
    // The factory is normally called from the standalone entry block which
    // builds runner+eventStore from env. If a caller skips that wiring and
    // we have nothing to drive, refuse to start rather than crash mid-cycle.
    logger.error('[finance-projection-worker] cannot start without { runner, eventStore } wiring');
    return {
      stop: () => {
        logger.debug('[finance-projection-worker] stop called on unwired worker');
      },
    };
  }

  workerStarted = true;
  const pollIntervalMs = getWorkerPollIntervalMs();
  logger.info(
    { poll_interval_ms: pollIntervalMs, tenant_count: tenantIds.length },
    '[finance-projection-worker] starting finance projection worker',
  );
  writeWorkerHeartbeat({
    status: 'starting',
    poll_interval_ms: pollIntervalMs,
    tenant_count: tenantIds.length,
  });

  const runCycle = async () => {
    if (!workerStarted) {
      return;
    }

    try {
      const summary = await runProjectionPollCycle({ runner, eventStore, tenantIds });
      const successCount = summary.filter((row) => row.ok).length;
      const failureCount = summary.length - successCount;
      const eventCount = summary.reduce((acc, row) => acc + row.event_count, 0);

      logger.info(
        {
          tenant_count: summary.length,
          success_count: successCount,
          failure_count: failureCount,
          event_count: eventCount,
        },
        '[finance-projection-worker] poll cycle complete',
      );

      writeWorkerHeartbeat({
        tenant_count: summary.length,
        success_count: successCount,
        failure_count: failureCount,
        event_count: eventCount,
      });
    } catch (error) {
      // `runProjectionPollCycle` itself is designed never to throw; this
      // catch is defense-in-depth so a programming error inside the cycle
      // never silently kills the loop.
      logger.error(
        {
          error: error?.message || String(error),
          code: error?.code || null,
        },
        '[finance-projection-worker] poll cycle crashed',
      );
    } finally {
      if (workerStarted) {
        workerTimer = setTimeout(runCycle, pollIntervalMs);
      }
    }
  };

  setImmediate(runCycle);

  return {
    stop: () => {
      logger.info('[finance-projection-worker] stopping finance projection worker');
      workerStarted = false;
      clearWorkerTimer();
      writeWorkerHeartbeat({ status: 'stopping' });
    },
  };
}

export default {
  isFinanceProjectionWorkerEnabled,
  parseControlledTenantIds,
  runProjectionPollCycle,
  buildProjectionRunner,
  startFinanceProjectionWorker,
};

// ── Standalone entry ────────────────────────────────────────────────────────
//
// When invoked as `node workers/financeProjectionWorker.js` (i.e. the
// `worker:finance-projection` npm script), build the pg Pool, wire the runner
// and event store, install SIGINT/SIGTERM handlers, and start the loop.

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
      '[finance-projection-worker] FINANCE_DB_URL (or DATABASE_URL) is required to start the worker',
    );
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString,
    max: Number.parseInt(process.env.FINANCE_DB_POOL_MAX || '5', 10),
    statement_timeout: Number.parseInt(process.env.FINANCE_DB_STATEMENT_TIMEOUT_MS || '30000', 10),
  });

  const runner = buildProjectionRunner({ pool });
  const eventStore = createFinancePgEventStore({ pool });
  const tenantIds = parseControlledTenantIds();

  if (isFinanceProjectionWorkerEnabled() && tenantIds.length === 0) {
    logger.warn(
      '[finance-projection-worker] enabled but no FINANCE_CONTROLLED_TENANT_IDS configured — poll cycles will be no-ops',
    );
  }

  const worker = startFinanceProjectionWorker({ runner, eventStore, tenantIds });

  // Slice 2C: signal-handler installation delegated to the shared helper so the
  // same SIGINT/SIGTERM + pool.end() + delayed exit(0) shape is reused by
  // finance-adapter-worker. Behavior matches the prior inline implementation:
  // stop() → pool.end() (best-effort) → setTimeout(exit(0), 50).
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
