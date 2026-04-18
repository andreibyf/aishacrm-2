/**
 * Billing Admin Routes — Superadmin Console
 *
 * Platform billing management for AiSHA staff.
 * All endpoints require superadmin role.
 *
 * Mount: app.use('/api/billing-admin', defaultLimiter, authenticateRequest, createBillingAdminRoutes(pool))
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import { requireSuperAdminRole } from '../middleware/validateTenant.js';
import {
  setExemption,
  removeExemption,
  getOrCreateBillingAccount,
} from '../lib/billing/billingAccountService.js';
import {
  assignPlan,
  changePlan,
  cancelSubscription,
  getActiveSubscription,
} from '../lib/billing/subscriptionService.js';
import {
  createInvoice,
  issueInvoice,
  recordPayment,
  voidInvoice,
  listInvoices,
} from '../lib/billing/invoiceService.js';

export default function createBillingAdminRoutes(_pgPool, opts = {}) {
  const getClient = opts.getSupabaseClient || getSupabaseClient;
  const router = express.Router();
  router.use(requireSuperAdminRole);

  // ==========================================================================
  // GET /api/billing-admin/tenants/:tenantId — billing summary
  // ==========================================================================
  router.get('/tenants/:tenantId', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const supabase = getClient();

      const [{ data: tenant }, account, subscription, invoices] = await Promise.all([
        supabase.from('tenant').select('id, name, billing_state').eq('id', tenantId).maybeSingle(),
        getOrCreateBillingAccount(supabase, tenantId),
        getActiveSubscription(supabase, tenantId),
        listInvoices(supabase, tenantId, { limit: 20 }),
      ]);

      if (!tenant) return res.status(404).json({ status: 'error', message: 'Tenant not found' });

      res.json({
        status: 'success',
        data: { tenant, billing_account: account, subscription, recent_invoices: invoices },
      });
    } catch (err) {
      logger.error('[BillingAdmin] GET /tenants/:id error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================================================
  // Subscription management
  // ==========================================================================
  router.post('/tenants/:tenantId/subscription', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const { plan_code, provider_subscription_id } = req.body;
      const supabase = getClient();
      const sub = await assignPlan(supabase, {
        tenant_id: tenantId,
        plan_code,
        actor_id: req.user.id,
        provider_subscription_id,
        request_id: req.headers['x-request-id'],
      });
      res.status(201).json({ status: 'success', data: sub });
    } catch (err) {
      logger.error('[BillingAdmin] POST subscription error', { error: err.message });
      const code = /already has|not found|inactive|required/.test(err.message) ? 400 : 500;
      res.status(code).json({ status: 'error', message: err.message });
    }
  });

  router.put('/tenants/:tenantId/subscription', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const { plan_code } = req.body;
      const supabase = getClient();
      const sub = await changePlan(supabase, {
        tenant_id: tenantId,
        plan_code,
        actor_id: req.user.id,
        request_id: req.headers['x-request-id'],
      });
      res.json({ status: 'success', data: sub });
    } catch (err) {
      logger.error('[BillingAdmin] PUT subscription error', { error: err.message });
      const code = /no active|already on|not found|inactive|required/.test(err.message) ? 400 : 500;
      res.status(code).json({ status: 'error', message: err.message });
    }
  });

  router.delete('/tenants/:tenantId/subscription', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const { reason } = req.body || {};
      const supabase = getClient();
      const canceled = await cancelSubscription(supabase, {
        tenant_id: tenantId,
        actor_id: req.user.id,
        reason,
        request_id: req.headers['x-request-id'],
      });
      res.json({ status: 'success', data: canceled });
    } catch (err) {
      logger.error('[BillingAdmin] DELETE subscription error', { error: err.message });
      const code = /no active|required/.test(err.message) ? 400 : 500;
      res.status(code).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================================================
  // Exemption management
  // ==========================================================================
  router.post('/tenants/:tenantId/exemption', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const { reason } = req.body;
      const supabase = getClient();
      const result = await setExemption(supabase, {
        tenant_id: tenantId,
        reason,
        actor_id: req.user.id,
        request_id: req.headers['x-request-id'],
      });
      res.json({ status: 'success', data: result });
    } catch (err) {
      logger.error('[BillingAdmin] POST exemption error', { error: err.message });
      const code = /required/.test(err.message) ? 400 : 500;
      res.status(code).json({ status: 'error', message: err.message });
    }
  });

  router.delete('/tenants/:tenantId/exemption', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const supabase = getClient();
      const result = await removeExemption(supabase, {
        tenant_id: tenantId,
        actor_id: req.user.id,
        request_id: req.headers['x-request-id'],
      });
      res.json({ status: 'success', data: result });
    } catch (err) {
      logger.error('[BillingAdmin] DELETE exemption error', { error: err.message });
      const code = /not currently exempt|required/.test(err.message) ? 400 : 500;
      res.status(code).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================================================
  // Invoice management
  // ==========================================================================
  router.post('/tenants/:tenantId/invoices', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const { subscription_id, line_items, currency, due_days, tax_total_cents, memo } = req.body;
      const supabase = getClient();
      const result = await createInvoice(supabase, {
        tenant_id: tenantId,
        subscription_id,
        line_items,
        currency,
        due_days,
        tax_total_cents,
        memo,
        actor_id: req.user.id,
        request_id: req.headers['x-request-id'],
      });
      res.status(201).json({ status: 'success', data: result });
    } catch (err) {
      logger.error('[BillingAdmin] POST invoices error', { error: err.message });
      const code = /exempt|required|negative|quantity/.test(err.message) ? 400 : 500;
      res.status(code).json({ status: 'error', message: err.message });
    }
  });

  router.post('/invoices/:invoiceId/issue', async (req, res) => {
    try {
      const supabase = getClient();
      const invoice = await issueInvoice(supabase, {
        invoice_id: req.params.invoiceId,
        actor_id: req.user.id,
        request_id: req.headers['x-request-id'],
      });
      res.json({ status: 'success', data: invoice });
    } catch (err) {
      logger.error('[BillingAdmin] POST issue error', { error: err.message });
      const code = /not found|must be draft/.test(err.message) ? 400 : 500;
      res.status(code).json({ status: 'error', message: err.message });
    }
  });

  router.post('/invoices/:invoiceId/mark-paid', async (req, res) => {
    try {
      const { amount_cents, payment_method_type, receipt_url } = req.body;
      const supabase = getClient();
      const result = await recordPayment(supabase, {
        invoice_id: req.params.invoiceId,
        amount_cents,
        payment_method_type: payment_method_type || 'manual',
        receipt_url,
        source: 'admin',
        actor_id: req.user.id,
        request_id: req.headers['x-request-id'],
      });
      res.json({ status: 'success', data: result });
    } catch (err) {
      logger.error('[BillingAdmin] POST mark-paid error', { error: err.message });
      const code = /not found|void|uncollectible|must be|> 0/.test(err.message) ? 400 : 500;
      res.status(code).json({ status: 'error', message: err.message });
    }
  });

  router.post('/invoices/:invoiceId/void', async (req, res) => {
    try {
      const { reason } = req.body || {};
      const supabase = getClient();
      const invoice = await voidInvoice(supabase, {
        invoice_id: req.params.invoiceId,
        actor_id: req.user.id,
        reason,
        request_id: req.headers['x-request-id'],
      });
      res.json({ status: 'success', data: invoice });
    } catch (err) {
      logger.error('[BillingAdmin] POST void error', { error: err.message });
      const code = /not found|cannot void/.test(err.message) ? 400 : 500;
      res.status(code).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================================================
  // GET /api/billing-admin/tenants/:tenantId/events — audit trail
  // ==========================================================================
  router.get('/tenants/:tenantId/events', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const supabase = getClient();
      const { data, error } = await supabase
        .from('billing_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      res.json({ status: 'success', data });
    } catch (err) {
      logger.error('[BillingAdmin] GET events error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
