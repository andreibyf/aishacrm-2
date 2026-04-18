/**
 * requireBillingActive Middleware
 *
 * Blocks access to non-billing routes when a tenant's billing_state is 'suspended'.
 * Billing routes themselves must remain reachable so the tenant can cure the
 * delinquency (update payment method, complete checkout).
 *
 * States allowed through: active, past_due, grace_period, billing_exempt, canceled
 * State blocked: suspended (returns 402 Payment Required + portal URL hint)
 *
 * Usage:
 *   app.use('/api/contacts', authenticateRequest, validateTenantAccess, requireBillingActive, ...)
 *
 * NOT applied to:
 *   /api/billing            (tenant must manage their own subscription)
 *   /api/billing-admin      (superadmin)
 *   /api/webhooks/*         (external callbacks)
 *   /api/auth/*             (login/refresh)
 *   /health, /api/status    (monitoring)
 */

import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

const BLOCKED_STATES = new Set(['suspended']);

export async function requireBillingActive(req, res, next) {
  try {
    // Superadmins are never blocked
    if (req.user?.role === 'superadmin') return next();

    // Need a resolved tenant to check billing state
    const tenantId = req.tenant?.id || req.user?.tenant_uuid;
    if (!tenantId) return next(); // Let downstream middleware handle missing tenant

    const supabase = getSupabaseClient();
    const { data: tenant, error } = await supabase
      .from('tenant')
      .select('billing_state')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      logger.warn('[requireBillingActive] Lookup failed — failing open', {
        tenant_id: tenantId,
        error: error.message,
      });
      return next();
    }

    const state = tenant?.billing_state;
    if (state && BLOCKED_STATES.has(state)) {
      logger.info('[requireBillingActive] Blocked request from suspended tenant', {
        tenant_id: tenantId,
        path: req.originalUrl,
      });
      return res.status(402).json({
        status: 'error',
        code: 'billing_suspended',
        message:
          'Your account is suspended due to unpaid invoices. Visit the billing portal to restore access.',
        billing_portal_url: '/app/settings/billing',
      });
    }

    return next();
  } catch (err) {
    logger.error('[requireBillingActive] Unexpected error — failing open', { error: err.message });
    return next();
  }
}

export default requireBillingActive;
