import express from 'express';
import logger from '../lib/logger.js';
import { getSupabaseClient as defaultGetSupabaseClient } from '../lib/supabase-db.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import createFinanceDomainService from '../lib/finance/financeDomainService.js';
import { checkFinanceOpsEnabled } from '../lib/finance/financeModuleGate.js';
import {
  fetchFinanceDataMode,
  setFinanceDataMode,
  FINANCE_DATA_MODES,
} from '../lib/finance/financeDataMode.js';
import { buildEvidencePack } from '../lib/finance/auditEvidenceBuilder.js';
import { listFinanceAdapters } from '../lib/finance/financeAdapterRegistry.js';
import { createInMemoryFinanceReadAdapter } from '../lib/finance/readAdapters/inMemoryFinanceReadAdapter.js';
import { createProjectionBackedFinanceReadAdapter } from '../lib/finance/readAdapters/projectionBackedFinanceReadAdapter.js';
import { createPgAuditEventsReader } from '../lib/finance/readAdapters/pgAuditEventsReader.js';
import { createPgProjectionStoreProvider } from '../lib/finance/projections/projectionStore.pg.js';
import { createFinancePgEventStore } from '../lib/finance/financeEventStore.pg.js';
import {
  runPersistentWrite as defaultRunPersistentWrite,
  rebuildFinanceProjections as defaultRebuildFinanceProjections,
} from '../lib/finance/persistentWriteRunner.js';
import { createLedgerProjectionWorker } from '../lib/finance/projections/ledgerProjection.js';
import { createJournalEntriesProjectionWorker } from '../lib/finance/projections/journalEntriesProjection.js';
import { createApprovalQueueProjectionWorker } from '../lib/finance/projections/approvalQueueProjection.js';
import { createAdapterQueueProjectionWorker } from '../lib/finance/projections/adapterQueueProjection.js';
import { createInvoiceProjectionWorker } from '../lib/finance/projections/invoiceProjection.js';

/**
 * Phase 4-1 §5 — default FinanceReadAdapter factory. In-memory by default;
 * projection-backed (Postgres) when ENABLE_FINANCE_PERSISTENT_EVENTS=true.
 * Loud-on-misconfig: persistent-events without a pool refuses to mount — the
 * fail-closed posture the prior split-brain guard provided, now structural.
 */
export function defaultFinanceReadAdapterFactory({
  persistentEvents,
  pgPool,
  service,
  createStoreProvider,
}) {
  if (!persistentEvents) {
    return createInMemoryFinanceReadAdapter({ service });
  }
  if (!pgPool && !createStoreProvider) {
    throw new Error(
      'ENABLE_FINANCE_PERSISTENT_EVENTS=true requires a Postgres pool for ' +
        'projection-backed reads; refusing to mount the finance v2 routes.',
    );
  }
  const auditEventsReader = createPgAuditEventsReader({ pool: pgPool });
  const workers = {
    ledger: createLedgerProjectionWorker(),
    journalEntries: createJournalEntriesProjectionWorker(),
    approvalQueue: createApprovalQueueProjectionWorker(),
    adapterQueue: createAdapterQueueProjectionWorker(),
    invoices: createInvoiceProjectionWorker(),
  };
  // Task 8: the read path and the persistent WRITE path must share projection
  // state so a write's synchronous advancement is visible to the next read
  // (read-your-write). When the caller injects a shared `createStoreProvider`,
  // use it. Otherwise fall back to building a FRESH Postgres projection-store
  // provider per request so reads always reflect the latest worker-persisted
  // projection_state — `getLiveStore()` caches for the provider's lifetime, so a
  // single long-lived PG provider would pin the first hydrated snapshot until
  // restart.
  return createProjectionBackedFinanceReadAdapter({
    createStoreProvider:
      createStoreProvider || (() => createPgProjectionStoreProvider({ pool: pgPool })),
    auditEventsReader,
    workers,
  });
}

/**
 * Slice 6b-2 — orchestrate a finance Test/Live data-mode change: persist the new
 * mode, then (PERSISTENT-only) rebuild the tenant's projections from the NEW mode's
 * events so reads immediately reflect the switch (the shared projection_state row
 * otherwise holds the OLD mode's data until the next write).
 *
 * Extracted as a thin, exported helper so the persist+rebuild orchestration is
 * unit-testable WITHOUT going through validateTenantAccess (a superadmin write
 * there needs a Supabase canonical-tenant lookup).
 *
 * FAIL-LOUD (Codex P2): the rebuild is what makes reads reflect the new mode.
 * Because `projection_state` is shared per (projection, tenant), a FAILED rebuild
 * leaves the OLD partition's projection rows in place — so returning success would
 * let reads serve the opposite partition while /runtime/status reports the new
 * mode (a silent test↔live leak). On rebuild failure we therefore REVERT the
 * persisted mode back to the pre-switch value (so status stays consistent with the
 * un-rebuilt projections) and THROW so the operator retries — never a silent
 * success. In-memory mode (persistent=false, or no stores) skips the rebuild
 * entirely — there are no persistent projections to rebuild.
 *
 * @returns {Promise<*>} the persisted mode (whatever setFinanceDataMode returned).
 * @throws  {Error} code FINANCE_MODE_SWITCH_REBUILD_FAILED (statusCode 503) when
 *          the persistent post-switch rebuild fails.
 */
export async function applyFinanceDataModeChange({
  tenantId,
  mode,
  persistent,
  setFinanceDataMode: setFinanceDataModeFn,
  rebuildFinanceProjections: rebuildFinanceProjectionsFn,
  getFinanceDataMode: getFinanceDataModeFn = null,
  eventStore,
  storeProvider,
  logger: log = logger,
}) {
  // Slice 6 (Codex PR #634 P2): in-memory deployments have NO test/live isolation
  // — runWrite() and the read adapter share one un-partitioned domain-service
  // bucket, so switching TEST→LIVE would expose sandbox test entries through the
  // live read endpoints (and let them be acted on as live data). Refuse to
  // advertise an isolation the in-memory path can't provide: LIVE requires
  // persistent events. TEST stays available — it is the safe default.
  if (!persistent && mode === FINANCE_DATA_MODES.LIVE) {
    const err = new Error(
      'Live data mode requires persistent events (ENABLE_FINANCE_PERSISTENT_EVENTS). ' +
        'In-memory deployments are test-only — there is no test/live data isolation, ' +
        'so live mode would expose sandbox test entries as live data.',
    );
    err.statusCode = 409;
    err.code = 'FINANCE_LIVE_REQUIRES_PERSISTENT';
    throw err;
  }

  const willRebuild = persistent && eventStore && storeProvider;

  // Capture the pre-switch mode up front so a failed rebuild can roll back to it.
  // Codex PR #634 P1: if we CAN'T read the current mode, we have no rollback path
  // — so fail the switch BEFORE persisting, rather than persist a new mode we
  // could never revert (which would leave /runtime/status on the new mode while
  // the projections stay on the old partition if the rebuild then fails).
  let previousMode = null;
  if (willRebuild && typeof getFinanceDataModeFn === 'function') {
    try {
      previousMode = await getFinanceDataModeFn({ tenantId });
    } catch (err) {
      const e = new Error(
        'Finance data-mode switch aborted: could not read the current mode to enable ' +
          'rollback on a failed rebuild. Nothing was changed. Retry the switch.',
      );
      e.statusCode = 503;
      e.code = 'FINANCE_MODE_SWITCH_PRECHECK_FAILED';
      e.cause = err;
      throw e;
    }
  }

  const persisted = await setFinanceDataModeFn({ tenantId, mode });

  if (willRebuild) {
    // Shared revert+fail used by BOTH a thrown rebuild and a degraded outcome:
    // revert the persisted mode so /runtime/status stays consistent with the
    // un-rebuilt projections, then throw 503 so the operator retries.
    const failSwitch = async (reason) => {
      log.error('[finance.v2] post-switch projection rebuild failed:', reason);
      if (previousMode && previousMode !== mode) {
        try {
          await setFinanceDataModeFn({ tenantId, mode: previousMode });
        } catch (revertErr) {
          log.error(
            '[finance.v2] mode revert after failed rebuild ALSO failed:',
            revertErr?.message,
          );
        }
      }
      const e = new Error(
        'Finance data-mode switch failed: projection rebuild error — mode reverted, reads unchanged. Retry the switch.',
      );
      e.statusCode = 503;
      e.code = 'FINANCE_MODE_SWITCH_REBUILD_FAILED';
      throw e;
    };

    let rebuildResult;
    try {
      rebuildResult = await rebuildFinanceProjectionsFn({
        eventStore,
        storeProvider,
        tenantId,
        isTestData: mode === FINANCE_DATA_MODES.TEST,
        logger: log,
      });
    } catch (err) {
      await failSwitch(err?.message);
    }
    // Codex PR #634 P1: a DEGRADED projection (replay RESOLVED `{outcome:'degraded'}`
    // rather than throwing) discarded its shadow and left the live store on the OLD
    // partition — the same test↔live leak hazard as a throw. Treat a non-empty
    // degraded result as a failed switch, not a success.
    if (
      rebuildResult &&
      Array.isArray(rebuildResult.degraded) &&
      rebuildResult.degraded.length > 0
    ) {
      await failSwitch(`degraded projections: ${rebuildResult.degraded.join(', ')}`);
    }
  }
  return persisted;
}

function resolveTenantId(req) {
  // M-5: Trust only server-injected sources. req.body?.tenant_id and req.query?.tenant_id
  // are attacker-controlled; a manipulated body can supply a foreign tenant_id that
  // propagates into domain service calls before any mismatch is detected.
  return req.tenant?.id || req.user?.tenant_id || null;
}

function buildActor(req) {
  // Actor identity is derived exclusively from the authenticated session.
  // Never trust body-supplied actor_type or actor_id — doing so would allow
  // any caller to impersonate a human actor and bypass AI governance checks.
  const isAiAgent = req.user?.is_ai_agent === true || req.user?.role === 'ai_agent';
  return {
    id: req.user?.id || null,
    type: isAiAgent ? 'ai_agent' : 'human',
  };
}

// The authenticate middleware normalizes super_admin/super-admin/etc. → 'superadmin'
// and sets an is_superadmin flag. Honor either; never trust body-supplied roles.
function isSuperAdmin(req) {
  return req.user?.role === 'superadmin' || req.user?.is_superadmin === true;
}

function sendError(res, error) {
  const statusCode = Number(error?.statusCode) || 500;
  return res.status(statusCode).json({
    status: 'error',
    message: error?.message || 'Unexpected finance route error',
    // Structured error envelope (design freeze §5.4). code/details are additive
    // and only present when the error carries them; the client already reads them.
    ...(error?.code ? { code: error.code } : {}),
    ...(error?.details ? { details: error.details } : {}),
    ...(error?.decision ? { governance_decision: error.decision } : {}),
  });
}

// Provenance / freshness disclosure block attached to every read payload
// (design freeze §5.7). `mode` reflects the deploy-time persistence decision:
// 'in_memory' when serving from the in-memory domain service, 'persistent' when
// serving from the Postgres-backed projections. `makeBuildSource` binds the mode
// once at construction so each handler's buildSource() reports it.
function makeBuildSource(persistentEvents) {
  const mode = persistentEvents ? 'persistent' : 'in_memory';
  return function buildSource(projection = null) {
    return {
      mode,
      served_at: new Date().toISOString(),
      projection,
      cursor_lag_ms: null,
    };
  };
}

// Offset/limit pagination defaults + clamping (design freeze §5.3). Values
// outside the allowed range are clamped, never rejected with a 400.
function clampPagination(query = {}) {
  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = 200;
  const rawLimit = Number.parseInt(query.limit, 10);
  const rawOffset = Number.parseInt(query.offset, 10);
  const limit = Number.isNaN(rawLimit) ? DEFAULT_LIMIT : Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
  const offset = Number.isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0);
  return { limit, offset };
}

// Opaque, tenant-scoped cursor for /audit-events (design freeze §6.5). Encodes
// the (created_at, id) boundary plus the tenant so a cursor minted for one
// tenant cannot be replayed against another. Decode rejects malformed AND
// cross-tenant cursors with 400 PAGINATION_INVALID (§10 row 5).
function encodeAuditCursor({ tenantId, created_at, id }) {
  return Buffer.from(JSON.stringify({ tenant_id: tenantId, created_at, id })).toString('base64url');
}

function decodeAuditCursor(cursor, tenantId) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
  } catch {
    parsed = null;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.created_at !== 'string' ||
    typeof parsed.id !== 'string' ||
    parsed.tenant_id !== tenantId
  ) {
    const error = new Error('Invalid or expired pagination cursor');
    error.statusCode = 400;
    error.code = 'PAGINATION_INVALID';
    throw error;
  }
  return parsed;
}

export default function createFinanceV2Routes(pgPool, opts = {}) {
  const router = express.Router();
  // Phase 4-1 §5: persistence mode is a deploy-time decision — read the env ONCE
  // at construction (no per-request read, no runtime swap).
  const persistentEvents = process.env.ENABLE_FINANCE_PERSISTENT_EVENTS === 'true';

  // Phase 4-1 Task 8 — ACTIVATION. The boot guard is gone: persistent mode now
  // mounts and is fully functional (durable reads + writes, read-your-write).
  // The fail-closed posture is preserved structurally — persistent mode still
  // requires a Postgres pool OR injected stores (the factory's no-pool guard and
  // the persistent-deps construction below both enforce it).

  // Build the SHARED persistent dependencies ONCE at construction. The READ path
  // (projection-backed read adapter) and the WRITE path (persistentWriteRunner)
  // must share the SAME projection-store provider so a write's synchronous
  // projection advancement is visible to the very next read (read-your-write),
  // and the SAME persistent event store so a write's durable appends are what the
  // next write hydrates from. Both are injectable for tests.
  const persistentEventStore =
    opts.eventStore ||
    (persistentEvents && pgPool ? createFinancePgEventStore({ pool: pgPool }) : null);
  const createStoreProvider =
    opts.createStoreProvider ||
    (persistentEvents && pgPool ? () => createPgProjectionStoreProvider({ pool: pgPool }) : null);
  const runPersistentWriteFn = opts.runPersistentWrite || defaultRunPersistentWrite;
  // Slice 6b-2: on a data-mode SWITCH, rebuild the tenant's projections from the
  // NEW mode's events (PERSISTENT-only; injectable for tests).
  const rebuildFinanceProjectionsFn =
    opts.rebuildFinanceProjections || defaultRebuildFinanceProjections;

  // Single mutation dispatch path shared by all 6 mutating handlers. In
  // persistent mode the command runs through the durable write runner (hydrate →
  // run → advance); in default mode it runs directly against the in-memory
  // domain service. Behaviour is identical to the per-handler branch it replaces.
  async function runWrite(req, command) {
    if (persistentEvents) {
      // Slice 6b-1: resolve the tenant's active Test/Live data mode and thread it
      // into the durable write runner so HYDRATE + the projection REBUILD both
      // operate on the active mode's partition only. Codex PR #634 P1: FAIL-CLOSED
      // — `runPersistentWrite` stamps every captured envelope with this flag, so a
      // guessed partition would persist a live write as `is_test_data=true`
      // (omitted from live reads, deletable by test cleanup) or vice-versa. If the
      // mode can't be resolved, REFUSE the write rather than acknowledge it in the
      // wrong partition.
      let isTestData;
      try {
        isTestData =
          (await getFinanceDataMode({ tenantId: req.financeTenantId, req })) ===
          FINANCE_DATA_MODES.TEST;
      } catch (err) {
        const e = new Error(
          'Cannot resolve the finance data mode for this tenant; refusing the write to ' +
            'avoid persisting it in the wrong (test/live) partition.',
        );
        e.statusCode = 503;
        e.code = 'FINANCE_DATA_MODE_UNRESOLVED';
        e.cause = err;
        throw e;
      }
      return runPersistentWriteFn({
        tenantId: req.financeTenantId,
        eventStore: persistentEventStore,
        storeProvider: createStoreProvider(),
        // Codex PR #633 P1: the pool used to materialize finance.adapter_jobs rows
        // so the SQL adapter worker can claim jobs created via the persistent write.
        adapterJobPool: pgPool,
        logger,
        command,
        isTestData,
      });
    }
    return command(service);
  }

  // Slice 6 (Codex P1): resolve the Test/Live read partition for the two raw
  // event-stream endpoints (/audit-events, /evidence-packs), which read the
  // durable event stream DIRECTLY (not via the projection rebuild that segregates
  // the other reads). Mirrors runWrite's mode resolution. In in-memory mode events
  // are unstamped → return null (NO filter; behaviour unchanged). FAIL-SAFE to
  // TEST so an unresolved mode never exposes live events on these endpoints.
  async function resolveReadIsTestData(req) {
    if (!persistentEvents) return null;
    try {
      return (
        (await getFinanceDataMode({ tenantId: req.financeTenantId, req })) ===
        FINANCE_DATA_MODES.TEST
      );
    } catch {
      return true;
    }
  }

  // The domain service's eventStore is the SAME persistent event store in
  // persistent mode (so /audit-events + /evidence-packs read the durable PG
  // stream); in-memory by default. In persistent mode the top-level `service` is
  // NOT used for the 6 mutations — those go through the write runner, which
  // builds its own hydrated domain service per request.
  const eventStoreOpt = persistentEventStore ? { eventStore: persistentEventStore } : {};
  const service = opts.service || createFinanceDomainService(eventStoreOpt);

  // Provenance/freshness `source` block bound to the deploy-time mode.
  const buildSource = makeBuildSource(persistentEvents);

  // Select the read adapter ONCE at construction time. In persistent mode it is
  // projection-backed and shares `createStoreProvider` with the write path; in
  // default mode it is the in-memory adapter (behaviourally identical to the
  // pre-lift handlers).
  const readAdapter = (opts.readAdapterFactory || defaultFinanceReadAdapterFactory)({
    persistentEvents,
    pgPool,
    service,
    createStoreProvider,
  });
  const getSupabaseClient = opts.getSupabaseClient || defaultGetSupabaseClient;
  const isFinanceModuleEnabled =
    opts.isFinanceModuleEnabled ||
    (({ tenantId }) => checkFinanceOpsEnabled({ tenantId, getSupabaseClient }));
  // Per-tenant Test/Live data mode (superadmin-controlled). Injectable for tests;
  // defaults to reading the financeOps modulesettings row.
  const getFinanceDataMode =
    opts.getFinanceDataMode ||
    (({ tenantId }) => fetchFinanceDataMode({ tenantId, getSupabaseClient }));
  const setFinanceDataModeFn =
    opts.setFinanceDataMode ||
    (({ tenantId, mode }) => setFinanceDataMode({ tenantId, mode, getSupabaseClient }));

  // Slice 6d: count of the tenant's dormant TEST finance events, surfaced on
  // /runtime/status so the console can warn that test data exists (in any mode).
  // Injectable for tests; defaults to the persistent event store's partitioned
  // getCount. In-memory mode has no durable test partition → reports 0.
  const getTestDataCount =
    opts.getTestDataCount ||
    (async ({ tenantId, isTestData }) => {
      if (!persistentEventStore) return 0;
      return persistentEventStore.getCount(tenantId, isTestData);
    });

  router.use(validateTenantAccess);

  router.use(async (req, res, next) => {
    try {
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const enabled = await isFinanceModuleEnabled({ tenantId, req, getSupabaseClient });
      if (!enabled) {
        return res.status(403).json({
          status: 'error',
          message: 'Finance Ops is not enabled for this tenant',
        });
      }

      req.financeTenantId = tenantId;
      next();
    } catch (error) {
      logger.error('[finance.v2] module gate error:', error);
      sendError(res, error);
    }
  });

  router.get('/runtime/status', async (req, res) => {
    try {
      // Resolve the authoritative per-tenant Test/Live data mode FIRST (replacing
      // the legacy `mock_read_only` placeholder). Resolve failures fail-safe to
      // `test` — never expose a tenant as `live` on a lookup error.
      let dataMode = FINANCE_DATA_MODES.TEST;
      try {
        dataMode = await getFinanceDataMode({ tenantId: req.financeTenantId, req });
      } catch (err) {
        logger.warn('[finance.v2] data-mode resolve failed; defaulting to test:', err?.message);
      }
      // Codex PR #634 P2: count audit events for the ACTIVE partition only, so
      // `counts.audit_events` / `persistence_lag.audit_events_total` match the
      // (partitioned) /audit-events read instead of counting the opposite partition.
      // PERSISTENT-only — in-memory has no durable partition (null = count all).
      const runtimeIsTestData = persistentEvents ? dataMode === FINANCE_DATA_MODES.TEST : null;
      const status = await readAdapter.getRuntimeStatus(req.financeTenantId, {
        isTestData: runtimeIsTestData,
      });
      status.runtime = { ...status.runtime, mode: dataMode, data_mode: dataMode };
      // Slice 6d: attach the count of dormant TEST finance events. FAIL-SAFE:
      // never break /runtime/status — default to 0 on any error.
      let testDataCount = 0;
      try {
        testDataCount = await getTestDataCount({ tenantId: req.financeTenantId, isTestData: true });
      } catch (err) {
        logger.warn('[finance.v2] test-data count failed; defaulting to 0:', err?.message);
      }
      status.test_data_count = Number.isFinite(testDataCount) ? testDataCount : 0;
      res.json({ status: 'success', data: status });
    } catch (error) {
      logger.error('[finance.v2] runtime status failed:', error);
      sendError(res, error);
    }
  });

  // Superadmin-only: flip the per-tenant Test/Live finance data mode. Admins and
  // below cannot change it (stricter than the modulesettings admin gate). The
  // module gate above already required Finance Ops to be enabled for the tenant.
  router.put('/settings/data-mode', async (req, res) => {
    try {
      if (!isSuperAdmin(req)) {
        const err = new Error('Only a superadmin can change the finance data mode');
        err.statusCode = 403;
        err.code = 'FINANCE_DATA_MODE_FORBIDDEN';
        throw err;
      }
      const mode = req.body?.mode;
      if (mode !== FINANCE_DATA_MODES.TEST && mode !== FINANCE_DATA_MODES.LIVE) {
        const err = new Error("Finance data mode must be 'test' or 'live'");
        err.statusCode = 400;
        err.code = 'FINANCE_DATA_MODE_INVALID';
        throw err;
      }
      // Persist the new mode, then (PERSISTENT-only) rebuild the tenant's
      // projections from the NEW mode's events so the very next read reflects the
      // switch. FAIL-LOUD: if the rebuild fails, applyFinanceDataModeChange reverts
      // the mode and throws (503) rather than reporting a success while reads still
      // serve the old partition (Codex P2). In-memory mode skips the rebuild (no
      // persistent projections). The helper keeps this handler thin and makes the
      // persist+rebuild orchestration unit-testable without Express.
      const updated = await applyFinanceDataModeChange({
        tenantId: req.financeTenantId,
        mode,
        persistent: persistentEvents,
        setFinanceDataMode: ({ tenantId, mode: m }) =>
          setFinanceDataModeFn({ tenantId, mode: m, req }),
        rebuildFinanceProjections: rebuildFinanceProjectionsFn,
        // Needed to roll the mode back if the post-switch rebuild fails.
        getFinanceDataMode: ({ tenantId }) => getFinanceDataMode({ tenantId, req }),
        eventStore: persistentEventStore,
        storeProvider: createStoreProvider ? createStoreProvider() : null,
        logger,
      });
      res.json({ status: 'success', data: { mode: updated } });
    } catch (error) {
      logger.error('[finance.v2] set data mode failed:', error);
      sendError(res, error);
    }
  });

  router.get('/journal-entries', async (req, res) => {
    try {
      const journalEntries = await readAdapter.listJournalEntries(req.financeTenantId);
      res.json({ status: 'success', data: { journal_entries: journalEntries } });
    } catch (error) {
      logger.error('[finance.v2] list journal entries failed:', error);
      sendError(res, error);
    }
  });

  router.get('/ledger', async (req, res) => {
    try {
      const ledger = await readAdapter.getLedger(req.financeTenantId);
      res.json({ status: 'success', data: ledger });
    } catch (error) {
      logger.error('[finance.v2] ledger failed:', error);
      sendError(res, error);
    }
  });

  router.get('/profit-loss', async (req, res) => {
    try {
      const profitLoss = await readAdapter.getProfitLoss(req.financeTenantId);
      res.json({ status: 'success', data: profitLoss });
    } catch (error) {
      logger.error('[finance.v2] profit-loss failed:', error);
      sendError(res, error);
    }
  });

  router.get('/balance-sheet', async (req, res) => {
    try {
      const balanceSheet = await readAdapter.getBalanceSheet(req.financeTenantId);
      res.json({ status: 'success', data: balanceSheet });
    } catch (error) {
      logger.error('[finance.v2] balance-sheet failed:', error);
      sendError(res, error);
    }
  });

  // -------------------------------------------------------------------------
  // Read-only GET endpoints — Finance Read API Implementation Slice 1.
  // Contracts frozen in finance-ui-slice-1-api-gaps-design.md §6. Each serves
  // from the in-memory domain service; the persistent/projection branch is
  // deferred to Phase 4-1. No mutation, no provider writes, no env flips.
  // -------------------------------------------------------------------------

  // §6.1 — draft invoices. Field mapping: amount_cents<-total_cents,
  // customer_name<-null (not stored in-memory), updated_at<-updated_at||created_at.
  router.get('/draft-invoices', async (req, res) => {
    try {
      const { limit, offset } = clampPagination(req.query);
      const customerId = req.query.customer_id || null;
      const all = (await readAdapter.listInvoices(req.financeTenantId))
        .filter((inv) => inv.status === 'draft')
        .filter((inv) => (customerId ? inv.customer_id === customerId : true));
      const page = all.slice(offset, offset + limit).map((inv) => ({
        id: inv.id,
        status: inv.status,
        customer_id: inv.customer_id ?? null,
        customer_name: null,
        currency: inv.currency ?? null,
        amount_cents: Number(inv.total_cents ?? 0),
        created_at: inv.created_at ?? null,
        updated_at: inv.updated_at ?? inv.created_at ?? null,
      }));
      res.json({
        status: 'success',
        data: { invoices: page, total: all.length, source: buildSource('invoices') },
      });
    } catch (error) {
      logger.error('[finance.v2] list draft invoices failed:', error);
      sendError(res, error);
    }
  });

  // §6.2 — journal drafts: the draft + pending_approval slice of journal entries.
  // Mapping: aggregate_id<-id, account_code<-null, amount_cents<-sum(debit_cents).
  router.get('/journal-drafts', async (req, res) => {
    try {
      const { limit, offset } = clampPagination(req.query);
      const aggregateId = req.query.aggregate_id || null;
      const all = (await readAdapter.listJournalEntries(req.financeTenantId))
        .filter((j) => j.status === 'draft' || j.status === 'pending_approval')
        .filter((j) => (aggregateId ? j.id === aggregateId : true));
      const page = all.slice(offset, offset + limit).map((j) => ({
        id: j.id,
        aggregate_id: j.id,
        status: j.status,
        account_code: null,
        amount_cents: Array.isArray(j.lines)
          ? j.lines.reduce((sum, line) => sum + Number(line.debit_cents || 0), 0)
          : 0,
        currency: j.currency ?? null,
        created_at: j.created_at ?? null,
      }));
      res.json({
        status: 'success',
        data: { journal_drafts: page, total: all.length, source: buildSource('journal_entries') },
      });
    } catch (error) {
      logger.error('[finance.v2] list journal drafts failed:', error);
      sendError(res, error);
    }
  });

  // §6.3 — approvals. ?status default 'pending' ('all' = no filter). Mapping:
  // subject_*<-target_*. decided_by/decided_at coalesce across the decision
  // outcomes (approved / rejected / cancelled) so a rejected or cancelled row
  // keeps its decision actor + timestamp instead of dropping them.
  router.get('/approvals', async (req, res) => {
    try {
      const { limit, offset } = clampPagination(req.query);
      const status = req.query.status || 'pending';
      const all = (await readAdapter.listApprovals(req.financeTenantId)).filter((a) =>
        status === 'all' ? true : a.status === status,
      );
      const page = all.slice(offset, offset + limit).map((a) => ({
        id: a.id,
        status: a.status,
        subject_type: a.target_type ?? null,
        subject_id: a.target_id ?? null,
        requested_by: a.requested_by ?? null,
        requested_at: a.requested_at ?? null,
        decided_by: a.approved_by ?? a.rejected_by ?? a.cancelled_by ?? null,
        decided_at: a.approved_at ?? a.rejected_at ?? a.cancelled_at ?? null,
      }));
      res.json({
        status: 'success',
        data: { approvals: page, total: all.length, source: buildSource('approval_queue') },
      });
    } catch (error) {
      logger.error('[finance.v2] list approvals failed:', error);
      sendError(res, error);
    }
  });

  // §6.4 — adapter jobs. Row status is the canonical migration-172 enum
  // (draft|queued|running|succeeded|failed). attempts/next_attempt_at/last_error
  // are not tracked in-memory yet (0/null/null).
  router.get('/adapter-jobs', async (req, res) => {
    try {
      const { limit, offset } = clampPagination(req.query);
      const status = req.query.status || 'all';
      const operation = req.query.operation || null;
      const all = (await readAdapter.listAdapterJobs(req.financeTenantId))
        .filter((j) => (status === 'all' ? true : j.status === status))
        .filter((j) => (operation ? j.operation === operation : true));
      const page = all.slice(offset, offset + limit).map((j) => ({
        id: j.id,
        operation: j.operation ?? null,
        status: j.status,
        attempts: Number(j.attempts ?? 0),
        next_attempt_at: j.next_attempt_at ?? null,
        last_error: j.last_error ?? null,
        created_at: j.created_at ?? null,
      }));
      res.json({
        status: 'success',
        data: { adapter_jobs: page, total: all.length, source: buildSource('adapter_jobs') },
      });
    } catch (error) {
      logger.error('[finance.v2] list adapter jobs failed:', error);
      sendError(res, error);
    }
  });

  // §6.5 — audit events. Cursor-paginated, newest first by (created_at, id).
  // Mapping: occurred_at<-created_at, actor<-actor_id??null.
  router.get('/audit-events', async (req, res) => {
    try {
      const rawLimit = Number.parseInt(req.query.limit, 10);
      const limit = Number.isNaN(rawLimit) ? 100 : Math.min(Math.max(rawLimit, 1), 1000);
      const eventTypePrefix = req.query.event_type
        ? String(req.query.event_type).replace(/\*$/, '')
        : null;
      const cursor = req.query.cursor
        ? decodeAuditCursor(req.query.cursor, req.financeTenantId)
        : null;

      const isTestData = await resolveReadIsTestData(req);
      const events = (await service.listAuditEvents(req.financeTenantId, isTestData))
        .filter((e) => (eventTypePrefix ? String(e.event_type).startsWith(eventTypePrefix) : true))
        .slice()
        .sort((a, b) => {
          if (a.created_at === b.created_at) return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
          return a.created_at < b.created_at ? 1 : -1; // DESC
        });

      const afterCursor = cursor
        ? events.filter(
            (e) =>
              e.created_at < cursor.created_at ||
              (e.created_at === cursor.created_at && e.id < cursor.id),
          )
        : events;

      const page = afterCursor.slice(0, limit);
      const hasMore = afterCursor.length > limit;
      const last = page[page.length - 1];
      const next_cursor =
        hasMore && last
          ? encodeAuditCursor({
              tenantId: req.financeTenantId,
              created_at: last.created_at,
              id: last.id,
            })
          : null;

      res.json({
        status: 'success',
        data: {
          events: page.map((e) => ({
            id: e.id,
            event_type: e.event_type,
            aggregate_id: e.aggregate_id ?? null,
            aggregate_type: e.aggregate_type ?? null,
            occurred_at: e.created_at ?? null,
            actor: e.actor_id ?? null,
            payload: e.payload ?? null,
          })),
          next_cursor,
          source: buildSource('audit_events'),
        },
      });
    } catch (error) {
      logger.error('[finance.v2] list audit events failed:', error);
      sendError(res, error);
    }
  });

  // §6.7 — registered adapters. Read-only declarative metadata (capability /
  // status / posture discovery). NOT a provider-operation surface: no sync,
  // retry, credentials, or write path. provider_writes_enabled reflects the
  // FINANCE_PROVIDER_WRITES_ENABLED kill switch (default false).
  router.get('/adapters', async (req, res) => {
    try {
      const adapters = listFinanceAdapters({
        providerWritesEnabled: process.env.FINANCE_PROVIDER_WRITES_ENABLED === 'true',
        // Mirror the worker's registration gate (financeAdapterWorker.js:484-516):
        // ERPNext registers only when the three creds are present AND the base
        // URL passes the sandbox guard; the registry validates the same signal.
        erpnext: {
          baseUrl: process.env.FINANCE_ERPNEXT_BASE_URL,
          apiKey: process.env.FINANCE_ERPNEXT_API_KEY,
          apiSecret: process.env.FINANCE_ERPNEXT_API_SECRET,
          sandboxAllowlist: (process.env.FINANCE_ERPNEXT_SANDBOX_BASE_URLS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      res.json({ status: 'success', data: { adapters, source: buildSource(null) } });
    } catch (error) {
      logger.error('[finance.v2] list adapters failed:', error);
      sendError(res, error);
    }
  });

  // §6.8 (FIXED) — evidence packs: an on-demand single-pack build, NOT a
  // historical registry. Builds one tamper-evident pack from the tenant event
  // stream and returns metadata + integrity hashes only. No list, no total,
  // no pagination. buildEvidencePack is pure/read-only.
  router.get('/evidence-packs', async (req, res) => {
    try {
      const isTestData = await resolveReadIsTestData(req);
      const built = await buildEvidencePack(service.getEventStore(), {
        tenantId: req.financeTenantId,
        fromDate: req.query.from || null,
        toDate: req.query.to || null,
        targetId: req.query.target_id || null,
        isTestData,
        generatedBy: { actor_id: req.user?.id || null, actor_type: buildActor(req).type },
      });
      res.json({
        status: 'success',
        data: {
          pack: {
            pack_id: built.pack_id,
            generated_at: built.generated_at,
            scope: {
              from: req.query.from || null,
              to: req.query.to || null,
              target_id: req.query.target_id || null,
            },
            summary: built.summary,
            artifact_count: Number(built.event_count ?? 0),
            integrity: {
              pack_hash: built.integrity?.pack_hash ?? null,
              events_hash: built.integrity?.events_hash ?? null,
              approvals_hash: built.integrity?.approvals_hash ?? null,
            },
          },
          source: buildSource(null),
        },
      });
    } catch (error) {
      logger.error('[finance.v2] build evidence pack failed:', error);
      sendError(res, error);
    }
  });

  router.post('/draft-invoices', async (req, res) => {
    try {
      const command = (svc) =>
        svc.createDraftInvoice({
          tenantId: req.financeTenantId,
          actor: buildActor(req),
          payload: req.body || {},
          requestId: req.headers['x-request-id'] || null,
          braidTraceId: req.body?.braid_trace_id || null,
        });
      const result = await runWrite(req, command);
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] create draft invoice failed:', error);
      sendError(res, error);
    }
  });

  router.patch('/draft-invoices/:id', async (req, res) => {
    try {
      const command = (svc) =>
        svc.updateDraftInvoice({
          tenantId: req.financeTenantId,
          invoiceId: req.params.id,
          actor: buildActor(req),
          payload: req.body || {},
          requestId: req.headers['x-request-id'] || null,
          braidTraceId: req.body?.braid_trace_id || null,
        });
      const result = await runWrite(req, command);
      res.json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] update draft invoice failed:', error);
      sendError(res, error);
    }
  });

  router.post('/journal-drafts', async (req, res) => {
    try {
      const command = (svc) =>
        svc.createJournalDraft({
          tenantId: req.financeTenantId,
          actor: buildActor(req),
          payload: req.body || {},
          requestId: req.headers['x-request-id'] || null,
          braidTraceId: req.body?.braid_trace_id || null,
        });
      const result = await runWrite(req, command);
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] create journal draft failed:', error);
      sendError(res, error);
    }
  });

  router.post('/simulate/deal-won', async (req, res) => {
    try {
      const command = (svc) =>
        svc.simulateDealWon({
          tenantId: req.financeTenantId,
          actor: buildActor(req),
          payload: req.body || {},
          requestId: req.headers['x-request-id'] || null,
          braidTraceId: req.body?.braid_trace_id || null,
        });
      const result = await runWrite(req, command);
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] simulate deal won failed:', error);
      sendError(res, error);
    }
  });

  router.post('/journal-entries/:id/reverse', async (req, res) => {
    try {
      const command = (svc) =>
        svc.reverseJournalEntry({
          tenantId: req.financeTenantId,
          journalEntryId: req.params.id,
          actor: buildActor(req),
          payload: req.body || {},
          requestId: req.headers['x-request-id'] || null,
          braidTraceId: req.body?.braid_trace_id || null,
        });
      const result = await runWrite(req, command);
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] reverse journal entry failed:', error);
      sendError(res, error);
    }
  });

  router.post('/approvals/:id/approve', async (req, res) => {
    try {
      const command = (svc) =>
        svc.approveFinanceAction({
          tenantId: req.financeTenantId,
          approvalId: req.params.id,
          actor: buildActor(req),
          requestId: req.headers['x-request-id'] || null,
          braidTraceId: req.body?.braid_trace_id || null,
        });
      const result = await runWrite(req, command);
      res.json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] approve finance action failed:', error);
      sendError(res, error);
    }
  });

  return router;
}
