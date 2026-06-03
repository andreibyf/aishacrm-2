import express from 'express';
import logger from '../lib/logger.js';
import { getSupabaseClient as defaultGetSupabaseClient } from '../lib/supabase-db.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import createFinanceDomainService from '../lib/finance/financeDomainService.js';
import { checkFinanceOpsEnabled } from '../lib/finance/financeModuleGate.js';
import { buildEvidencePack } from '../lib/finance/auditEvidenceBuilder.js';
import { listFinanceAdapters } from '../lib/finance/financeAdapterRegistry.js';
import { createInMemoryFinanceReadAdapter } from '../lib/finance/readAdapters/inMemoryFinanceReadAdapter.js';
import { createProjectionBackedFinanceReadAdapter } from '../lib/finance/readAdapters/projectionBackedFinanceReadAdapter.js';
import { createPgAuditEventsReader } from '../lib/finance/readAdapters/pgAuditEventsReader.js';
import { createPgProjectionStoreProvider } from '../lib/finance/projections/projectionStore.pg.js';
import { createFinancePgEventStore } from '../lib/finance/financeEventStore.pg.js';
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
export function defaultFinanceReadAdapterFactory({ persistentEvents, pgPool, service }) {
  if (!persistentEvents) {
    return createInMemoryFinanceReadAdapter({ service });
  }
  if (!pgPool) {
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
  // Build a FRESH projection-store provider per request so reads always reflect
  // the latest worker-persisted projection_state — `getLiveStore()` caches for
  // the provider's lifetime, so a single long-lived provider would pin the
  // first hydrated snapshot until restart.
  return createProjectionBackedFinanceReadAdapter({
    createStoreProvider: () => createPgProjectionStoreProvider({ pool: pgPool }),
    auditEventsReader,
    workers,
  });
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
// (design freeze §5.7). Slice 1 serves exclusively from the in-memory domain
// service, so mode is always 'in_memory' and no projection/cursor lag applies.
function buildSource(projection = null) {
  return {
    mode: 'in_memory',
    served_at: new Date().toISOString(),
    projection,
    cursor_lag_ms: null,
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

  // Phase 4-1 / Codex PR #632 — BOOT GUARD: persistent mode is NOT yet
  // activatable; refuse to mount when the flag is on (fail-closed).
  //
  // The infrastructure ships and is unit-tested: the Postgres event-store wiring
  // (`eventStoreOpt` below), the projection-backed read adapter
  // (`defaultFinanceReadAdapterFactory`'s persistent branch — covered by
  // finance.v2.adapterSelection.test.js + projectionBackedFinanceReadAdapter.test.js),
  // the projections, and append-before-mutate atomic writes. What is NOT yet
  // done is the read/mutation surface: several GET handlers (`/journal-drafts`,
  // `/approvals`, `/adapter-jobs`, `/draft-invoices`) and the approve/reverse/
  // update mutations still read the in-memory domain-service buckets, which start
  // empty per process. Enabling the flag would expose a PG-persisted draft/
  // approval through the projection-backed reads while the service-backed reads
  // 404/empty it (and a second instance or a restart would lose it entirely).
  // Until those flows are routed through durable state, mounting persistent mode
  // is unsafe — so we refuse, the same fail-closed posture the no-pool guard
  // already enforces. Removing this guard is the activation step of the
  // remaining Phase 4-1 read/mutation migration.
  if (persistentEvents) {
    throw new Error(
      'ENABLE_FINANCE_PERSISTENT_EVENTS=true is not yet supported: the finance v2 ' +
        'service-backed read/mutation endpoints are not projection-durable. ' +
        'Refusing to mount the finance v2 routes (fail-closed).',
    );
  }

  // Persistent write path (gated by the boot guard above): in persistent mode the
  // domain service's WRITES would emit into the Postgres event store rather than
  // the in-memory bucket. Retained as the activation wiring; `opts.eventStore`
  // injection remains for tests.
  const eventStoreOpt = opts.eventStore
    ? { eventStore: opts.eventStore }
    : persistentEvents && pgPool
      ? { eventStore: createFinancePgEventStore({ pool: pgPool }) }
      : {};
  const service = opts.service || createFinanceDomainService(eventStoreOpt);

  // Select the read adapter ONCE at construction time. With the boot guard above,
  // `persistentEvents` is always false here, so this resolves to the in-memory
  // adapter (behaviourally identical to the pre-lift handlers). The factory's
  // projection-backed branch remains the activation path for when persistent mode
  // lands, and is exercised directly in finance.v2.adapterSelection.test.js.
  const readAdapter = (opts.readAdapterFactory || defaultFinanceReadAdapterFactory)({
    persistentEvents,
    pgPool,
    service,
  });
  const getSupabaseClient = opts.getSupabaseClient || defaultGetSupabaseClient;
  const isFinanceModuleEnabled =
    opts.isFinanceModuleEnabled ||
    (({ tenantId }) => checkFinanceOpsEnabled({ tenantId, getSupabaseClient }));

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
      res.json({
        status: 'success',
        data: await readAdapter.getRuntimeStatus(req.financeTenantId),
      });
    } catch (error) {
      logger.error('[finance.v2] runtime status failed:', error);
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

      const events = (await service.listAuditEvents(req.financeTenantId))
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
      const built = await buildEvidencePack(service.getEventStore(), {
        tenantId: req.financeTenantId,
        fromDate: req.query.from || null,
        toDate: req.query.to || null,
        targetId: req.query.target_id || null,
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
      const result = await service.createDraftInvoice({
        tenantId: req.financeTenantId,
        actor: buildActor(req),
        payload: req.body || {},
        requestId: req.headers['x-request-id'] || null,
        braidTraceId: req.body?.braid_trace_id || null,
      });
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] create draft invoice failed:', error);
      sendError(res, error);
    }
  });

  router.patch('/draft-invoices/:id', async (req, res) => {
    try {
      const result = await service.updateDraftInvoice({
        tenantId: req.financeTenantId,
        invoiceId: req.params.id,
        actor: buildActor(req),
        payload: req.body || {},
        requestId: req.headers['x-request-id'] || null,
        braidTraceId: req.body?.braid_trace_id || null,
      });
      res.json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] update draft invoice failed:', error);
      sendError(res, error);
    }
  });

  router.post('/journal-drafts', async (req, res) => {
    try {
      const result = await service.createJournalDraft({
        tenantId: req.financeTenantId,
        actor: buildActor(req),
        payload: req.body || {},
        requestId: req.headers['x-request-id'] || null,
        braidTraceId: req.body?.braid_trace_id || null,
      });
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] create journal draft failed:', error);
      sendError(res, error);
    }
  });

  router.post('/simulate/deal-won', async (req, res) => {
    try {
      const result = await service.simulateDealWon({
        tenantId: req.financeTenantId,
        actor: buildActor(req),
        payload: req.body || {},
        requestId: req.headers['x-request-id'] || null,
        braidTraceId: req.body?.braid_trace_id || null,
      });
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] simulate deal won failed:', error);
      sendError(res, error);
    }
  });

  router.post('/journal-entries/:id/reverse', async (req, res) => {
    try {
      const result = await service.reverseJournalEntry({
        tenantId: req.financeTenantId,
        journalEntryId: req.params.id,
        actor: buildActor(req),
        payload: req.body || {},
        requestId: req.headers['x-request-id'] || null,
        braidTraceId: req.body?.braid_trace_id || null,
      });
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] reverse journal entry failed:', error);
      sendError(res, error);
    }
  });

  router.post('/approvals/:id/approve', async (req, res) => {
    try {
      const result = await service.approveFinanceAction({
        tenantId: req.financeTenantId,
        approvalId: req.params.id,
        actor: buildActor(req),
        requestId: req.headers['x-request-id'] || null,
        braidTraceId: req.body?.braid_trace_id || null,
      });
      res.json({ status: 'success', data: result });
    } catch (error) {
      logger.error('[finance.v2] approve finance action failed:', error);
      sendError(res, error);
    }
  });

  return router;
}
