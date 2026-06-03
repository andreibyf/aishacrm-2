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
 *   3. ADVANCE  — synchronously dispatch every captured envelope (in append
 *      order) through an in-process projection runner so the PG-backed
 *      projections reflect the write (read-your-write). Advancement failure is
 *      NON-FATAL: the event is already durably appended, so we log and continue;
 *      the async worker loop catches up. The authoritative write result (or the
 *      command's error) is what's returned/rethrown.
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  for (const worker of [
    workers.ledger,
    workers.journalEntries,
    workers.approvalQueue,
    workers.adapterQueue,
    workers.invoices,
  ]) {
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
  const events = await resolvedEventStore.replay(tenantId);
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
      captured.push(envelope);
      return resolvedEventStore.append(envelope);
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

  // 4. ADVANCE (read-your-write) — dispatch every captured envelope, in order,
  // through the in-process projection runner so the PG-backed projections
  // reflect this write before we return. Advancement is best-effort: a dispatch
  // that still fails after retries is logged and skipped (the event is durably
  // appended; the async worker loop will catch up). This is the design's
  // "advancement failure returns the authoritative write result" rule.
  if (captured.length > 0) {
    const makeRunner = createRunner || buildDefaultRunner;
    const runner = makeRunner({
      eventStore: resolvedEventStore,
      storeProvider: resolvedStoreProvider,
      workers: resolvedWorkers,
      maxAttempts,
      retryBackoffMs,
    });

    for (const envelope of captured) {
      let dispatched = false;
      let lastError;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await runner.dispatch(envelope);
          dispatched = true;
          break;
        } catch (err) {
          lastError = err;
          if (attempt < maxAttempts) {
            await sleep(retryBackoffMs * 2 ** (attempt - 1));
          }
        }
      }
      if (!dispatched) {
        logger.warn(
          {
            tenant_id: tenantId,
            event_id: envelope?.id ?? null,
            event_type: envelope?.event_type ?? null,
            attempts: maxAttempts,
            err: lastError?.message ?? String(lastError),
          },
          'persistentWriteRunner: projection advancement failed after retries; ' +
            'event is durably appended — async worker will catch up',
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

export default runPersistentWrite;
