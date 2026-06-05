/**
 * clearFinanceTestData.js
 *
 * Slice 6c — per-tenant "Clear Test Data" for Finance Ops.
 *
 * Finance is event-sourced: the partition column `is_test_data` (slice 6a) on
 * `finance.audit_events` separates sandbox (test) events from real (live) ones.
 * The per-tenant QA "Clear Test Data" button (POST /api/testing/cleanup-test-data)
 * DELETEs `is_test_data = true` rows from the CRM tables. This helper wires the
 * finance event stream into that flow:
 *
 *   1. DELETE the tenant's TEST events from `finance.audit_events`.
 *   2. REBUILD the tenant's projections from its CURRENT data mode's events. The
 *      tenant's `finance.projection_state` is a SHARED row per (projection,
 *      tenant) that holds the CURRENT mode's projection. If the tenant is in test
 *      mode, that shared row was built from the test partition we just cleared, so
 *      a read right after the clear would show stale (now-deleted) data. Rebuilding
 *      from the CURRENT mode's events makes reads correct: test ⇒ empties,
 *      live ⇒ unchanged (live partition was never touched).
 *
 * The rebuild is NON-FATAL: the DELETE is the authoritative effect; if the rebuild
 * throws (infra/PG error), we log and return `rebuilt: false` rather than failing
 * the clear (which already succeeded). The async projection worker re-drives.
 *
 * Everything is injectable (`getSupabaseClient`, `eventStore`, `storeProvider`,
 * `rebuild`) so the helper is fully unit-testable with spies — no real DB.
 */

import defaultLogger from '../logger.js';
import { fetchFinanceDataMode, FINANCE_DATA_MODES } from './financeDataMode.js';
import { rebuildFinanceProjections } from './persistentWriteRunner.js';
import { createFinancePgEventStore } from './financeEventStore.pg.js';
import { createPgProjectionStoreProvider } from './projections/projectionStore.pg.js';

const AUDIT_EVENTS_TABLE = 'finance.audit_events';

/**
 * Clear a single tenant's finance TEST events and rebuild its projections from
 * the current data mode.
 *
 * @param {object}   opts
 * @param {object}   opts.pgPool             pg Pool — used for the DELETE and to build defaults.
 *                                            (Accepts `pool` as an alias.)
 * @param {Function} opts.getSupabaseClient  resolves the tenant's data mode.
 * @param {string}   opts.tenantId           tenant UUID (REQUIRED — per-tenant op).
 * @param {object}  [opts.logger]            injectable logger (default project logger).
 * @param {Function}[opts.rebuild]           injectable rebuild fn (default rebuildFinanceProjections).
 * @param {object}  [opts.eventStore]        injectable; default createFinancePgEventStore({ pool }).
 * @param {object}  [opts.storeProvider]     injectable; default createPgProjectionStoreProvider({ pool }).
 * @returns {Promise<{deleted: number, rebuilt: boolean}>}
 */
export async function clearFinanceTestData({
  pool,
  pgPool,
  getSupabaseClient,
  tenantId,
  logger = defaultLogger,
  rebuild,
  eventStore,
  storeProvider,
} = {}) {
  const resolvedPool = pool || pgPool;

  if (!tenantId) {
    throw new Error('clearFinanceTestData requires a tenantId (finance clear is per-tenant)');
  }

  // 1. DELETE the tenant's TEST events. Parameterized — never interpolate the id.
  const deleteResult = await resolvedPool.query(
    `DELETE FROM ${AUDIT_EVENTS_TABLE} WHERE is_test_data = true AND tenant_id = $1 RETURNING id`,
    [tenantId],
  );
  const deleted = deleteResult?.rowCount ?? deleteResult?.rows?.length ?? 0;

  // 2. REBUILD the tenant's projections from its CURRENT mode so reads are
  // correct after the clear (test ⇒ empties; live ⇒ unchanged). NON-FATAL: the
  // delete already succeeded — a failing rebuild logs and returns rebuilt:false.
  let rebuilt = false;
  try {
    const mode = await fetchFinanceDataMode({ tenantId, getSupabaseClient });
    const isTestData = mode === FINANCE_DATA_MODES.TEST;

    const resolvedRebuild = rebuild || rebuildFinanceProjections;
    const resolvedEventStore = eventStore || createFinancePgEventStore({ pool: resolvedPool });
    const resolvedStoreProvider =
      storeProvider || createPgProjectionStoreProvider({ pool: resolvedPool });

    await resolvedRebuild({
      eventStore: resolvedEventStore,
      storeProvider: resolvedStoreProvider,
      tenantId,
      isTestData,
      logger,
    });
    rebuilt = true;
  } catch (err) {
    logger.warn(
      {
        tenant_id: tenantId,
        deleted,
        err: err?.message ?? String(err),
      },
      'clearFinanceTestData: projection rebuild failed after test-data clear; delete already committed — async worker will re-drive',
    );
  }

  return { deleted, rebuilt };
}

export default clearFinanceTestData;
