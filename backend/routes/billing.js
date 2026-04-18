/**
 * Billing Routes — Tenant Portal
 *
 * Platform billing endpoints that tenants access to view and manage
 * their subscription with AiSHA.
 *
 * Domain: AiSHA <- tenant (PLATFORM BILLING ONLY).
 * Distinct from Cal.com session purchases (handled by session-credits.js).
 *
 * Mount: app.use('/api/billing', defaultLimiter, authenticateRequest, createBillingRoutes(pool))
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import {
  getOrCreateBillingAccount,
  updateBillingProfile,
} from '../lib/billing/billingAccountService.js';
import { getActiveSubscription } from '../lib/billing/subscriptionService.js';
import { listInvoices } from '../lib/billing/invoiceService.js';
import * as stripeAdapter from '../lib/billing/stripePlatformAdapter.js';
import { getPlatformBillingConfig } from '../lib/billing/config.js';
import { classifyBillingError } from '../lib/billing/errors.js';

export function resolveTenantId(req) {
  // req.tenant is populated by validateTenantAccess after canonical resolution
  // of whatever identifier was supplied (UUID, slug, or 'system').
  // { id: <uuid>, tenant_id: <slug>, name: <string> }
  const canonicalUuid = req.tenant?.id;
  const canonicalSlug = req.tenant?.tenant_id;
  const fromRequest = req.query?.tenant_id || req.body?.tenant_id;

  if (canonicalUuid) {
    // Accept match against either the resolved UUID or the resolved slug —
    // both are canonical forms of the same tenant. This matches how
    // validateTenantAccess itself compares tenant identifiers.
    if (fromRequest && fromRequest !== canonicalUuid && fromRequest !== canonicalSlug) {
      return { error: 'tenant_id mismatch' };
    }
    // Always return the canonical UUID for downstream DB queries
    return { tenant_id: canonicalUuid };
  }

  if (fromRequest) return { tenant_id: fromRequest };
  return { error: 'tenant_id is required' };
}

export default function createBillingRoutes(_pgPool, opts = {}) {
  const getClient = opts.getSupabaseClient || getSupabaseClient;
  const router = express.Router();
  router.use(validateTenantAccess);

  // ==========================================================================
  // GET /api/billing/plans — list available plans (public to all authenticated)
  // ==========================================================================
  router.get('/plans', async (_req, res) => {
    try {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('billing_plans')
        .select('*')
        .eq('is_active', true)
        .order('amount_cents', { ascending: true });

      if (error) throw new Error(error.message);
      res.json({ status: 'success', data });
    } catch (err) {
      logger.error('[Billing] GET /plans error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================================================
  // GET /api/billing/account — tenant's billing profile
  // ==========================================================================
  router.get('/account', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const supabase = getClient();
      const account = await getOrCreateBillingAccount(supabase, tenant_id);
      res.json({ status: 'success', data: account });
    } catch (err) {
      logger.error('[Billing] GET /account error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================================================
  // PUT /api/billing/account — update billing profile
  // ==========================================================================
  router.put('/account', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const supabase = getClient();
      const updated = await updateBillingProfile(supabase, tenant_id, req.body);
      res.json({ status: 'success', data: updated });
    } catch (err) {
      logger.error('[Billing] PUT /account error', { error: err.message });
      const status = classifyBillingError(err, /setExemption|no updatable/);
      res.status(status).json({
        status: 'error',
        message: err.message,
        code: err.code || null,
      });
    }
  });

  // ==========================================================================
  // GET /api/billing/subscription — current subscription with plan details
  // ==========================================================================
  router.get('/subscription', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const supabase = getClient();
      const sub = await getActiveSubscription(supabase, tenant_id);
      res.json({ status: 'success', data: sub });
    } catch (err) {
      logger.error('[Billing] GET /subscription error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================================================
  // GET /api/billing/invoices — list tenant invoices
  // ==========================================================================
  router.get('/invoices', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { status, limit } = req.query;
      const supabase = getClient();
      const data = await listInvoices(supabase, tenant_id, {
        status,
        limit: limit ? Math.min(Number(limit), 200) : 50,
      });
      res.json({ status: 'success', data });
    } catch (err) {
      logger.error('[Billing] GET /invoices error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================================================
  // GET /api/billing/invoices/:id — single invoice with line items
  // ==========================================================================
  router.get('/invoices/:id', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const supabase = getClient();
      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (invErr) throw new Error(invErr.message);
      if (!invoice) return res.status(404).json({ status: 'error', message: 'Invoice not found' });

      const { data: lineItems, error: liErr } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoice.id)
        .order('created_at', { ascending: true });

      if (liErr) throw new Error(liErr.message);

      res.json({ status: 'success', data: { invoice, line_items: lineItems || [] } });
    } catch (err) {
      logger.error('[Billing] GET /invoices/:id error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================================================
  // POST /api/billing/checkout-session — create Stripe Checkout for plan purchase
  // Body: { plan_code, success_url, cancel_url }
  // ==========================================================================
  router.post('/checkout-session', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { plan_code, success_url, cancel_url } = req.body;
      if (!plan_code || !success_url || !cancel_url) {
        return res.status(400).json({
          status: 'error',
          message: 'plan_code, success_url, and cancel_url are required',
        });
      }

      if (!getPlatformBillingConfig().isConfigured) {
        return res.status(503).json({
          status: 'error',
          message: 'Platform billing not configured on server',
        });
      }

      const supabase = getClient();

      // Guard: refuse checkout for exempt tenants
      const account = await getOrCreateBillingAccount(supabase, tenant_id);
      if (account.billing_exempt) {
        return res.status(409).json({
          status: 'error',
          message: 'Tenant is billing-exempt; checkout not applicable',
        });
      }

      // Load plan
      const { data: plan, error: planErr } = await supabase
        .from('billing_plans')
        .select('*')
        .eq('code', plan_code)
        .eq('is_active', true)
        .maybeSingle();
      if (planErr) throw new Error(planErr.message);
      if (!plan) return res.status(404).json({ status: 'error', message: 'Plan not found' });

      // Create-or-reuse Stripe customer
      let customerId = account.provider_customer_id;
      if (!customerId) {
        const customer = await stripeAdapter.createCustomer({
          billing_email: account.billing_email,
          company_name: account.company_name,
          metadata: { tenant_id },
        });
        customerId = customer.id;
        await updateBillingProfile(supabase, tenant_id, { provider_customer_id: customerId });
      }

      const session = await stripeAdapter.createCheckoutSession({
        customer_id: customerId,
        amount_cents: plan.amount_cents,
        currency: plan.currency,
        description: `${plan.name} — ${plan.billing_interval}`,
        success_url,
        cancel_url,
        metadata: { tenant_id, plan_code, plan_id: plan.id, source: 'platform_billing' },
      });

      res.json({ status: 'success', data: { url: session.url, session_id: session.id } });
    } catch (err) {
      logger.error('[Billing] POST /checkout-session error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================================================
  // POST /api/billing/portal-session — Stripe billing portal for PM updates
  // Body: { return_url }
  // ==========================================================================
  router.post('/portal-session', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { return_url } = req.body;
      if (!return_url) {
        return res.status(400).json({ status: 'error', message: 'return_url is required' });
      }

      if (!getPlatformBillingConfig().isConfigured) {
        return res.status(503).json({
          status: 'error',
          message: 'Platform billing not configured on server',
        });
      }

      const supabase = getClient();
      const account = await getOrCreateBillingAccount(supabase, tenant_id);
      if (!account.provider_customer_id) {
        return res.status(409).json({
          status: 'error',
          message: 'No Stripe customer on file. Complete a checkout first.',
        });
      }

      const session = await stripeAdapter.createPortalSession({
        customer_id: account.provider_customer_id,
        return_url,
      });
      res.json({ status: 'success', data: { url: session.url } });
    } catch (err) {
      logger.error('[Billing] POST /portal-session error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
