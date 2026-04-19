/**
 * Platform Billing API Client
 *
 * Single source of truth for all HTTP calls to the platform billing
 * backend (PR #517). Distinct from Cal.com tenant Stripe integration,
 * which lives at /api/tenantintegrations and uses the entity layer.
 *
 * All calls use cookie-based auth (credentials: 'include') and expect
 * the standard backend envelope: { status, data, message?, code? }.
 *
 * On non-2xx, throws an Error with:
 *   err.status : HTTP status code
 *   err.code   : backend error code (e.g. 'CONFLICT', 'INVALID_INPUT',
 *                'EXEMPT', 'NOT_FOUND') or null
 *   err.message: human-readable message from the backend, or 'HTTP 500'
 *
 * Usage:
 *   import * as billing from '@/api/billing';
 *   const plans = await billing.listPlans();
 *   try { await billing.assignPlan(tid, { plan_code: 'starter_monthly' }); }
 *   catch (e) { if (e.code === 'CONFLICT') ... }
 */

import { getBackendUrl } from './backendUrl';

/**
 * Internal request helper. Throws structured errors on non-2xx.
 * Returns the `data` field unwrapped for convenience.
 */
async function request(path, { method = 'GET', body, signal } = {}) {
  const url = `${getBackendUrl()}${path}`;
  const res = await fetch(url, {
    method,
    credentials: 'include',
    signal,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  // Attempt to parse JSON even on errors so we can surface backend codes.
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json.code || null;
    err.details = json.details || null;
    throw err;
  }

  return json.data;
}

function qs(params) {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

// ============================================================================
// Tenant Portal -- /api/billing
// ============================================================================

/** List active plans (public to authenticated users). */
export function listPlans() {
  return request('/api/billing/plans');
}

/** Get the tenant's billing account (creates empty row on first access). */
export function getAccount(tenantId) {
  return request(`/api/billing/account${qs({ tenant_id: tenantId })}`);
}

/** Update tenant's billing profile (contact, address, tax_id, notes, etc.). */
export function updateAccount(tenantId, updates) {
  return request('/api/billing/account', {
    method: 'PUT',
    body: { tenant_id: tenantId, ...updates },
  });
}

/** Get the tenant's current active subscription with plan details. */
export function getSubscription(tenantId) {
  return request(`/api/billing/subscription${qs({ tenant_id: tenantId })}`);
}

/** List invoices for the tenant. Defaults to 20 most-recent. */
export function listInvoices(tenantId, { status, limit = 20 } = {}) {
  return request(`/api/billing/invoices${qs({ tenant_id: tenantId, status, limit })}`);
}

/** Get a single invoice with line items. */
export function getInvoice(invoiceId, tenantId) {
  return request(`/api/billing/invoices/${invoiceId}${qs({ tenant_id: tenantId })}`);
}

/** Create a Stripe Checkout session for a plan. Returns { url, session_id }. */
export function createCheckoutSession({ tenant_id, plan_code, success_url, cancel_url }) {
  return request('/api/billing/checkout-session', {
    method: 'POST',
    body: { tenant_id, plan_code, success_url, cancel_url },
  });
}

/** Create a Stripe Billing Portal session for payment-method updates. Returns { url }. */
export function createPortalSession({ tenant_id, return_url }) {
  return request('/api/billing/portal-session', {
    method: 'POST',
    body: { tenant_id, return_url },
  });
}

// ============================================================================
// Superadmin Console -- /api/billing-admin
// ============================================================================

/** Full billing summary for a tenant: {tenant, billing_account, subscription, recent_invoices}. */
export function getBillingSummary(tenantId) {
  return request(`/api/billing-admin/tenants/${tenantId}`);
}

/** Assign a plan to a tenant (creates subscription). Fails 409 if one already exists. */
export function assignPlan(tenantId, { plan_code, provider_subscription_id }) {
  return request(`/api/billing-admin/tenants/${tenantId}/subscription`, {
    method: 'POST',
    body: { plan_code, provider_subscription_id },
  });
}

/** Change a tenant's plan (cancels existing, creates new). */
export function changePlan(tenantId, { plan_code }) {
  return request(`/api/billing-admin/tenants/${tenantId}/subscription`, {
    method: 'PUT',
    body: { plan_code },
  });
}

/** Cancel a tenant's active subscription. */
export function cancelSubscription(tenantId, { reason }) {
  return request(`/api/billing-admin/tenants/${tenantId}/subscription`, {
    method: 'DELETE',
    body: { reason },
  });
}

/** Mark a tenant as billing-exempt (requires reason + actor auto-derived server-side). */
export function setExemption(tenantId, { reason }) {
  return request(`/api/billing-admin/tenants/${tenantId}/exemption`, {
    method: 'POST',
    body: { reason },
  });
}

/** Remove billing exemption. */
export function removeExemption(tenantId) {
  return request(`/api/billing-admin/tenants/${tenantId}/exemption`, { method: 'DELETE' });
}

/** Create an invoice (draft). */
export function createInvoice(tenantId, { line_items, subscription_id, currency, due_days, tax_total_cents, memo }) {
  return request(`/api/billing-admin/tenants/${tenantId}/invoices`, {
    method: 'POST',
    body: { line_items, subscription_id, currency, due_days, tax_total_cents, memo },
  });
}

/** Issue a draft invoice (draft -> open). */
export function issueInvoice(invoiceId) {
  return request(`/api/billing-admin/invoices/${invoiceId}/issue`, { method: 'POST' });
}

/** Record a manual payment against an invoice. */
export function markInvoicePaid(invoiceId, { amount_cents, payment_method_type, receipt_url }) {
  return request(`/api/billing-admin/invoices/${invoiceId}/mark-paid`, {
    method: 'POST',
    body: { amount_cents, payment_method_type, receipt_url },
  });
}

/** Void an invoice with a reason. */
export function voidInvoice(invoiceId, { reason }) {
  return request(`/api/billing-admin/invoices/${invoiceId}/void`, {
    method: 'POST',
    body: { reason },
  });
}

/** Fetch the billing audit-event timeline for a tenant (most recent first). */
export function listEvents(tenantId, { limit = 100 } = {}) {
  return request(`/api/billing-admin/tenants/${tenantId}/events${qs({ limit })}`);
}

/** Export for testing: allow swapping the internal request helper. */
export const __internal = { request };
