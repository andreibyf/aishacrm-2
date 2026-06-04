/**
 * persistentWriteRunner.js
 *
 * Phase 4-1 Task 7 — the core write-orchestration module for persistent mode.
 *
 * `runPersistentWrite(opts)` executes ONE finance mutation durably:
 *
 *   1. HYDRATE  — replay the tenant's PG event stream and fold it into a
 *      domain-service bucket (rebuildBucketFromEvents), so the existing command
 *      logic sees the FULL durable state — not just this process's in-memory
 *      slice. This is the core Codex-fix: a durable approval is visible to the
 *      command's `bucket.approvals.find`, so an approve does NOT spuriously 404.
 *
 *   2. RUN      — build a per-request domain service over { the hydrated bucket,
 *      a CAPTURING event store } and run the caller-supplied command closure.
 *      The capturing store records every appended envelope WHILE still appending
 *      to the real (durable) event store — append-before-mutate is preserved.
 *
 *   3. ADVANCE  — catch up the AFFECTED projections by REBUILDING each from the
 *      durable event stream (read-your-write). We do NOT dispatch only this
 *      write's new envelopes in isolation: a projection in this process can be
 *      BEHIND the durable stream (cold start, async-worker lag, or — the core
 *      scenario — approving an approval whose `finance.approval.requested` is
 *      durably in the event store but was never projected into this process).
 *      Dispatching the new `finance.approval.approved` onto an approval_queue
 *      projection that lacks the prior `pending` entry makes the worker throw and
 *      DEGRADES the projection. Instead, for every captured envelope we compute
 *      the DISTINCT set of projection names whose worker consumes that event
 *      type, and `runner.replay(projectionName, tenantId)` each one. `replay`
 *      rebuilds the projection from `eventStore.replay(tenantId)` (which now
 *      includes this write's appended events — the capturing store forwarded them
 *      to the real durable store) into a shadow store and atomically promotes it.
 *      Rebuild is idempotent, recovers a degraded projection, and is correct
 *      regardless of the projection's prior state. Advancement is best-effort and
 *      NON-FATAL — it NEVER throws. Two surfaces are logged: (a) `replay` returns
 *      `{ outcome: 'degraded' }` — the rebuild itself failed (e.g. a worker
 *      handler threw on the full stream); (b) `replay` THROWS — an infra/PG error.
 *      In both cases the event is already durably appended, so we log and
 *      continue; the async worker loop re-drives the projection. The
 *      authoritative write result (or the command's error) is returned/rethrown.
 *
 *      Tradeoff: rebuild is O(stream) per affected projection per write. That is
 *      acceptable for the low-write-volume finance console; an incremental
 *      catch-up-since-cursor (dispatch only events after the projection's stored
 *      cursor) could optimize this later if write volume grows.
 *
 * Everything is injectable for tests; defaults are built from `pgPool`, mirroring
 * `defaultFinanceReadAdapterFactory` in backend/routes/finance.v2.js.
 */

import defaultLogger from '../logger.js';
import createFinanceDomainService from './financeDomainService.js';
import rebuildBucketFromEvents from './financeDomainReplay.js';
import { createFinancePgEventStore } from './financeEventStore.pg.js';
import { createPgProjectionStoreProvider } from './projections/projectionStore.pg.js';
import { createProjectionRunner } from './projections/projectionRunner.js';
import { createLedgerProjectionWorker } from './projections/ledgerProjection.js';
import { createJournalEntriesProjectionWorker } from './projections/journalEntriesProjection.js';
import { createApprovalQueueProjectionWorker } from './projections/approvalQueueProjection.js';
import { createAdapterQueueProjectionWorker } from './projections/adapterQueueProjection.js';
import { createInvoiceProjectionWorker } from './projections/invoiceProjection.js';
import { materializeAdapterJobs as defaultMaterializeAdapterJobs } from './persistentAdapterJobWriter.js';

// Build the five projection workers used to advance projections in-process.
// Mirrors defaultFinanceReadAdapterFactory's `workers` block.
function buildDefaultWorkers() {
  return {
    ledger: createLedgerProjectionWorker(),
    journalEntries: createJournalEntriesProjectionWorker(),
    approvalQueue: createApprovalQueueProjectionWorker(),
    adapterQueue: createAdapterQueueProjectionWorker(),
    invoices: createInvoiceProjectionWorker(),
  };
}

/**
 * Default factory: build a projection runner over the (eventStore, storeProvider)
 * with all five workers registered. Injectable as `createRunner` for tests so a
 * spy runner can record dispatch calls.
 */
function buildDefaultRunner({ eventStore, storeProvider, workers, maxAttempts, retryBackoffMs }) {
  const runner = createProjectionRunner({
    eventStore,
    storeProvider,
    maxAttempts,
    retryBackoffMs,
  });
  for (const worker of Object.values(workers)) {
    runner.register(worker);
  }
  return runner;
}

/**
 * Execute one finance mutation durably in persistent mode.
 *
 * @param {object}   opts
 * @param {object}  [opts.pgPool]         pg Pool — used to build defaults.
 * @param {string}   opts.tenantId        tenant UUID (server-derived).
 * @param {Function} opts.command         async (service) => result — the mutation.
 * @param {object}  [opts.eventStore]     injectable; default createFinancePgEventStore({ pool }).
 * @param {object}  [opts.storeProvider]  injectable; default createPgProjectionStoreProvider({ pool }).
 * @param {object}  [opts.workers]        injectable five-worker map.
 * @param {Function}[opts.createRunner]   injectable runner factory (for spies).
 * @param {object}  [opts.logger]         injectable logger (default project logger).
 * @param {number}  [opts.maxAttempts=3]  advance retry attempts per envelope.
 * @param {number}  [opts.retryBackoffMs=20] base exponential back-off.
 * @returns {Promise<*>} the command's result.
 */
export async function runPersistentWrite({
  pgPool,
  tenantId,
  command,
  eventStore,
  storeProvider,
  workers,
  createRunner,
  logger = defaultLogger,
  maxAttempts = 3,
  retryBackoffMs = 20,
  // Test/Live data-mode partition (slice 6a): hydrate replays only the current
  // mode's events, and every appended envelope is stamped with this mode.
  // Live (false) by default so existing behaviour is preserved.
  isTestData = false,
  // Codex PR #633 P1: pool used to materialize finance.adapter_jobs rows (so the
  // SQL adapter worker can claim them). Injectable writer for tests.
  adapterJobPool,
  materializeAdapterJobs: materializeAdapterJobsFn = defaultMaterializeAdapterJobs,
} = {}) {
  if (!tenantId) {
    throw new Error('runPersistentWrite requires a tenantId');
  }
  if (typeof command !== 'function') {
    throw new Error('runPersistentWrite requires a command(service) function');
  }

  // Resolve the durable dependencies. If they are not injected, build them from
  // pgPool (mirrors defaultFinanceReadAdapterFactory). Refuse to run with no way
  // to reach Postgres — a missing pool here is a misconfiguration, not a silent
  // in-memory fallback.
  const resolvedEventStore =
    eventStore || (pgPool ? createFinancePgEventStore({ pool: pgPool }) : null);
  const resolvedStoreProvider =
    storeProvider || (pgPool ? createPgProjectionStoreProvider({ pool: pgPool }) : null);
  if (!resolvedEventStore || !resolvedStoreProvider) {
    throw new Error(
      'runPersistentWrite requires a pgPool (or an injected eventStore + storeProvider) ' +
        'to reach the persistent event store and projection store',
    );
  }
  const resolvedWorkers = workers || buildDefaultWorkers();

  // 1. HYDRATE — replay the tenant's durable event stream into a bucket. The PG
  // event store's replay(tenantId) returns the tenant's ordered events; the
  // projection runner consumes replay() the same way (see projectionRunner.js
  // doReplay → eventStore.replay(tenantId)), so we mirror that call shape.
  // Slice 6a: replay only the current mode's partition (test ⇒ true).
  const events = await resolvedEventStore.replay(tenantId, isTestData);
  const bucket = rebuildBucketFromEvents(events);

  // 2. RUN — a per-request domain service over the hydrated bucket and a
  // CAPTURING event store. The hydrated store is the exact shape
  // createFinanceDomainService({ store }) expects ({ tenants: Map<tenantId,
  // bucket> }); the bucket already carries { journalEntries, invoices, approvals,
  // adapterJobs, commands }. The capturing store collects every appended
  // envelope WHILE forwarding it to the durable event store — so appends remain
  // durable AND we know exactly what to advance.
  const hydratedStore = { tenants: new Map([[tenantId, bucket]]) };
  const captured = [];
  const capturingEventStore = {
    append: async (envelope) => {
      // Slice 6a: stamp the current data-mode onto every appended envelope so
      // the command's parent + all spawned events are tagged for the partition.
      const stamped = { ...envelope, is_test_data: isTestData };
      captured.push(stamped);
      return resolvedEventStore.append(stamped);
    },
    query: (...args) => resolvedEventStore.query(...args),
    replay: (...args) => resolvedEventStore.replay(...args),
  };

  const service = createFinanceDomainService({
    store: hydratedStore,
    eventStore: capturingEventStore,
  });

  // 3. Run the command. Capture any thrown error but DO NOT rethrow yet — even a
  // failing command (e.g. journal validation) may have durably appended events
  // (finance.journal.validation_failed) that the projections must still advance.
  let result;
  let commandError;
  try {
    result = await command(service);
  } catch (err) {
    commandError = err;
  }

  // 4. ADVANCE (read-your-write) — catch up the AFFECTED projections by
  // REBUILDING each from the durable event stream. We do NOT dispatch only this
  // write's new envelopes: a projection may be behind the durable stream (cold
  // start / async-worker lag) or — the core scenario — a prior durable event
  // (e.g. finance.approval.requested) may have never been projected into this
  // process, so an isolated dispatch of only the new event would DEGRADE the
  // projection. Rebuilding from the stream (which now includes this write's
  // appended events) is idempotent, recovers a degraded projection, and is
  // correct regardless of prior state. Best-effort and NON-FATAL: never throws.
  if (captured.length > 0) {
    // Codex PR #633 P1: materialize finance.adapter_jobs ROWS from the captured
    // adapter-job events so the SQL adapter worker (claimPersistent) can drain
    // them — the in-memory promote path emits sync_queued but never writes the
    // canonical table. Best-effort and NON-FATAL: the events are already durable
    // and the adapter_queue projection already reflects the job.
    const resolvedAdapterJobPool = adapterJobPool || pgPool || null;
    if (resolvedAdapterJobPool) {
      try {
        await materializeAdapterJobsFn({
          pool: resolvedAdapterJobPool,
          tenantId,
          events: captured,
          logger,
        });
      } catch (err) {
        logger.warn(
          { tenant_id: tenantId, err: err?.message ?? String(err) },
          'persistentWriteRunner: adapter-jobs materialization failed (non-fatal); events durable + projected',
        );
      }
    }

    const makeRunner = createRunner || buildDefaultRunner;
    const runner = makeRunner({
      eventStore: resolvedEventStore,
      storeProvider: resolvedStoreProvider,
      workers: resolvedWorkers,
      maxAttempts,
      retryBackoffMs,
    });

    // Compute the DISTINCT set of projection names affected by this write: every
    // worker whose consumedEvents includes any captured envelope's event_type.
    const workerList = Object.values(resolvedWorkers);
    const affected = new Set();
    for (const envelope of captured) {
      const eventType = envelope?.event_type;
      for (const worker of workerList) {
        if (worker?.consumedEvents?.includes(eventType)) {
          affected.add(worker.projectionName);
        }
      }
    }

    for (const projectionName of affected) {
      let replayResult;
      try {
        // Slice 6b-1: rebuild each affected projection from the ACTIVE mode's
        // events only — a test-mode write rebuilds from the test partition,
        // a live-mode write from the live partition. Default false (live)
        // preserves existing behaviour.
        replayResult = await runner.replay(projectionName, tenantId, isTestData);
      } catch (err) {
        // Infra-level failure (projection-store / Postgres error): replay threw.
        // The event is already durably appended — log and continue; the async
        // worker re-drives.
        logger.warn(
          {
            tenant_id: tenantId,
            projection: projectionName,
            err: err?.message ?? String(err),
          },
          'persistentWriteRunner: projection rebuild failed (infra); event durably appended — async worker will re-drive',
        );
        continue;
      }
      // Rebuild ran but the projection itself degraded (e.g. a worker handler
      // threw replaying the full stream). Surface it — the event is durable.
      if (replayResult?.outcome === 'degraded') {
        logger.warn(
          {
            tenant_id: tenantId,
            projection: projectionName,
            outcome: replayResult.outcome,
            cursor: replayResult.cursor ?? null,
          },
          'persistentWriteRunner: projection rebuild degraded during advance; event durably appended — async worker will re-drive',
        );
      }
    }
  }

  // 5. Rethrow the command error (if any) AFTER advancing whatever was captured;
  // otherwise return the authoritative write result.
  if (commandError) {
    throw commandError;
  }
  return result;
}

/**
 * Slice 6b-2 — rebuild ALL of a tenant's registered finance projections from the
 * NEW data mode's events.
 *
 * `projection_state` is a SHARED row per (projection, tenant) holding the CURRENT
 * mode's projection. Writes (6a/6b-1) rebuild AFFECTED projections from the active
 * mode's events. The gap: when a superadmin SWITCHES the tenant's data mode, the
 * shared projection_state still holds the OLD mode's data until the next write —
 * a read right after a switch would show stale (other-mode) data. This helper, run
 * on a mode switch, rebuilds EVERY registered projection from the NEW mode's events
 * so reads immediately reflect the new mode.
 *
 * PERSISTENT-only: in in-memory mode there are no persistent projections (the
 * in-memory adapter reads the domain-service bucket directly) — the caller skips
 * this entirely (no-op). NON-FATAL: a degraded or throwing replay is logged and
 * does NOT throw — reads of a degraded projection already fail-closed elsewhere
 * (FinanceReadDegradedError).
 *
 * @param {object}   opts
 * @param {object}   opts.eventStore     persistent event store (required).
 * @param {object}   opts.storeProvider  projection-store provider (required).
 * @param {object}  [opts.workers]       injectable five-worker map; default built.
 * @param {Function}[opts.createRunner]  injectable runner factory (for spies).
 * @param {string}   opts.tenantId       tenant UUID (required).
 * @param {boolean} [opts.isTestData]    NEW mode partition (test ⇒ true).
 * @param {object}  [opts.logger]        injectable logger (default project logger).
 * @returns {Promise<{rebuilt: string[], degraded: string[]}>} per-projection summary.
 */
export async function rebuildFinanceProjections({
  eventStore,
  storeProvider,
  workers,
  createRunner,
  tenantId,
  isTestData,
  logger = defaultLogger,
} = {}) {
  if (!eventStore || !storeProvider || !tenantId) {
    throw new Error('rebuildFinanceProjections requires eventStore, storeProvider, and tenantId');
  }

  const resolvedWorkers = workers || buildDefaultWorkers();
  const runner = (createRunner || buildDefaultRunner)({
    eventStore,
    storeProvider,
    workers: resolvedWorkers,
  });

  const rebuilt = [];
  const degraded = [];

  // Rebuild EVERY registered projection from the new mode's events. Prefer the
  // runner's replayAll (6b-1 added the isTestData arg); collect its per-projection
  // results. A whole-batch throw OR a per-projection degraded outcome is NON-FATAL.
  let results;
  try {
    results = await runner.replayAll(tenantId, isTestData);
  } catch (err) {
    // RE-THROW (Codex PR #634 P1): the rebuild could not run, so the shared
    // projection_state is left on the PREVIOUS partition. Swallowing this here
    // would let a mode switch report success while reads still serve the old
    // partition — `applyFinanceDataModeChange` only reverts+fails when this
    // throws. Each caller owns the policy: the mode switch reverts the mode and
    // returns 503; `clearFinanceTestData` catches and stays non-fatal (its delete
    // already committed). The async worker re-drive is a backstop, not a license
    // to report success on a half-applied switch.
    logger.warn(
      {
        tenant_id: tenantId,
        err: err?.message ?? String(err),
      },
      'rebuildFinanceProjections: replayAll failed (infra); rethrowing so the caller decides (mode-switch reverts+fails; clear stays non-fatal)',
    );
    throw err;
  }

  for (const result of results || []) {
    const projection = result?.projectionName ?? null;
    if (result?.outcome === 'degraded') {
      degraded.push(projection);
      logger.warn(
        {
          tenant_id: tenantId,
          projection,
          outcome: result.outcome,
        },
        'rebuildFinanceProjections: projection degraded during mode-switch rebuild; reads fail-closed — async worker will re-drive',
      );
    } else {
      rebuilt.push(projection);
    }
  }

  return { rebuilt, degraded };
}

export default runPersistentWrite;
