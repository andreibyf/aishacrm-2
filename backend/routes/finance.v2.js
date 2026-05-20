import express from 'express';
import logger from '../lib/logger.js';
import { getSupabaseClient as defaultGetSupabaseClient } from '../lib/supabase-db.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import createFinanceDomainService from '../lib/finance/financeDomainService.js';
import { checkFinanceOpsEnabled } from '../lib/finance/financeModuleGate.js';

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
    ...(error?.decision ? { governance_decision: error.decision } : {}),
  });
}

export default function createFinanceV2Routes(_pgPool, opts = {}) {
  const router = express.Router();
  const service = opts.service || createFinanceDomainService();
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
      const state =
        typeof service.getState === 'function'
          ? service.getState(req.financeTenantId)
          : {
              journalEntries: service.listJournalEntries(req.financeTenantId),
              approvals: service.listApprovals(req.financeTenantId),
              auditEvents: service.listAuditEvents(req.financeTenantId),
              invoices: [],
              adapterJobs: [],
            };

      res.json({
        status: 'success',
        data: {
          tenant_id: req.financeTenantId,
          runtime: {
            mode: 'mock_read_only',
            persistence: 'in_memory',
            provider_sync: 'disabled',
            governance: 'enabled',
          },
          counts: {
            journal_entries: Array.isArray(state.journalEntries) ? state.journalEntries.length : 0,
            invoices: Array.isArray(state.invoices) ? state.invoices.length : 0,
            approvals: Array.isArray(state.approvals) ? state.approvals.length : 0,
            audit_events: Array.isArray(state.auditEvents) ? state.auditEvents.length : 0,
            adapter_jobs: Array.isArray(state.adapterJobs) ? state.adapterJobs.length : 0,
          },
        },
      });
    } catch (error) {
      logger.error('[finance.v2] runtime status failed:', error);
      sendError(res, error);
    }
  });

  router.get('/journal-entries', async (req, res) => {
    try {
      const journalEntries = service.listJournalEntries(req.financeTenantId);
      res.json({ status: 'success', data: { journal_entries: journalEntries } });
    } catch (error) {
      logger.error('[finance.v2] list journal entries failed:', error);
      sendError(res, error);
    }
  });

  router.get('/ledger', async (req, res) => {
    try {
      const ledger = service.getLedger(req.financeTenantId);
      res.json({ status: 'success', data: ledger });
    } catch (error) {
      logger.error('[finance.v2] ledger failed:', error);
      sendError(res, error);
    }
  });

  router.get('/profit-loss', async (req, res) => {
    try {
      const profitLoss = service.getProfitLoss(req.financeTenantId);
      res.json({ status: 'success', data: profitLoss });
    } catch (error) {
      logger.error('[finance.v2] profit-loss failed:', error);
      sendError(res, error);
    }
  });

  router.get('/balance-sheet', async (req, res) => {
    try {
      const balanceSheet = service.getBalanceSheet(req.financeTenantId);
      res.json({ status: 'success', data: balanceSheet });
    } catch (error) {
      logger.error('[finance.v2] balance-sheet failed:', error);
      sendError(res, error);
    }
  });

  router.post('/draft-invoices', async (req, res) => {
    try {
      const result = service.createDraftInvoice({
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
      const result = service.updateDraftInvoice({
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
      const result = service.createJournalDraft({
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
      const result = service.simulateDealWon({
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
      const result = service.reverseJournalEntry({
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
      const result = service.approveFinanceAction({
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
