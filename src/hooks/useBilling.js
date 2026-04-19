/**
 * Platform Billing -- React data hooks
 *
 * Thin wrappers over @/api/billing.js that provide the standard
 * {data, loading, error, refetch} shape used across the codebase.
 *
 * Convention: each hook accepts the identifiers it needs as args,
 * and re-fetches when those identifiers change. Call refetch() after
 * a mutation (assignPlan, markPaid, etc.) to reflect the new state.
 *
 * Fetch gating: the first dependency is treated as the required
 * identifier (e.g. tenantId, invoiceId). Only that dep is required
 * to be non-null/undefined for the fetch to fire. Subsequent deps
 * (e.g. `status`, `limit`) are filter/option params and are allowed
 * to be undefined -- changing them still triggers re-fetch, but
 * their initial undefined state does NOT suppress the initial fetch.
 *
 * This matches how TanStack Query handles `enabled` + filter deps
 * and prevents the "hook never loads without explicit filter param"
 * regression the naive "all deps truthy" gate caused.
 *
 * Normalization: several hooks normalize the raw backend payload into
 * a stable UI-facing shape. For example, useActiveSubscription maps
 * Supabase's joined `billing_plans` key to `plan`, and maps
 * `renewal_date` to both `renewal_date` and `current_period_end` so
 * downstream components can read either. See each hook for details.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as billing from '@/api/billing';

function useAsync(fetchFn, deps, { requiredDepCount = 1 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const refetch = useCallback(async () => {
    // Abort any in-flight request before firing a new one
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn({ signal: controller.signal });
      if (!controller.signal.aborted) setData(result);
    } catch (err) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        setError(err);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    // Only require the first `requiredDepCount` deps to be non-null/undefined.
    // Remaining deps are optional filters -- they may be undefined initially
    // and must not suppress the first fetch.
    const requiredDeps = deps.slice(0, requiredDepCount);
    const ready = requiredDeps.every((d) => d !== null && d !== undefined);

    if (ready) {
      refetch();
    } else {
      setData(null);
      setLoading(false);
      setError(null);
    }
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch };
}

// ============================================================================
// Backend payload normalizers
// ============================================================================

/**
 * Normalize a tenant_subscriptions row joined with billing_plans into a
 * stable UI shape. Backend returns the joined plan as `billing_plans`
 * (Supabase's default key from `.select('*, billing_plans(*)')`). We
 * expose it as `plan` for ergonomics and keep the original key too.
 *
 * Also exposes:
 *   - current_period_end: alias of renewal_date (common UI term)
 *   - cancel_at_period_end: true if status === 'canceled' AND canceled_at
 *     is in the future (grace period). False otherwise.
 */
function normalizeSubscription(raw) {
  if (!raw) return null;
  const plan = raw.plan || raw.billing_plans || null;
  const planNormalized = plan
    ? {
        // UI conventions
        interval: plan.interval || plan.billing_interval || null,
        ...plan,
      }
    : null;

  const now = Date.now();
  const canceledAt = raw.canceled_at ? new Date(raw.canceled_at).getTime() : null;

  return {
    ...raw,
    plan: planNormalized,
    current_period_end: raw.current_period_end || raw.renewal_date || null,
    cancel_at_period_end:
      raw.cancel_at_period_end === true ||
      (raw.status === 'canceled' && canceledAt !== null && canceledAt > now),
  };
}

/**
 * Normalize an invoice row so the UI can read UI-conventional names
 * (`issued_at`, `due_at`) regardless of the DB column names
 * (`issue_date`, `due_date`).
 */
function normalizeInvoice(raw) {
  if (!raw) return null;
  return {
    ...raw,
    issued_at: raw.issued_at || raw.issue_date || null,
    due_at: raw.due_at || raw.due_date || null,
  };
}

// ============================================================================
// Tenant Portal hooks
// ============================================================================

export function usePlans() {
  // No identifier needed -- always fetch.
  return useAsync(() => billing.listPlans(), [], { requiredDepCount: 0 });
}

export function useBillingAccount(tenantId) {
  return useAsync(() => billing.getAccount(tenantId), [tenantId]);
}

export function useActiveSubscription(tenantId) {
  const result = useAsync(() => billing.getSubscription(tenantId), [tenantId]);
  return { ...result, data: normalizeSubscription(result.data) };
}

/**
 * useInvoices -- paginated invoice list for a tenant.
 * tenantId is required; status and limit are optional filters.
 */
export function useInvoices(tenantId, { status, limit } = {}) {
  const result = useAsync(
    () => billing.listInvoices(tenantId, { status, limit }),
    [tenantId, status, limit],
    { requiredDepCount: 1 },
  );
  const normalized = Array.isArray(result.data) ? result.data.map(normalizeInvoice) : result.data;
  return { ...result, data: normalized };
}

/**
 * useInvoice -- single invoice with line items. The backend returns
 * { invoice, line_items } as separate keys; we flatten into a single
 * object: { ...invoice, line_items, payments: [] }. (Backend does not
 * currently return payments joined with the invoice; until it does,
 * payments is exposed as an empty array for UI stability.)
 */
export function useInvoice(invoiceId, tenantId) {
  const result = useAsync(
    () => billing.getInvoice(invoiceId, tenantId),
    [invoiceId, tenantId],
    { requiredDepCount: 2 },
  );
  let data = null;
  if (result.data) {
    const inv = result.data.invoice || result.data;
    data = {
      ...normalizeInvoice(inv),
      line_items: result.data.line_items || inv.line_items || [],
      payments: result.data.payments || inv.payments || [],
    };
  }
  return { ...result, data };
}

// ============================================================================
// Superadmin Console hooks
// ============================================================================

export function useBillingSummary(tenantId) {
  return useAsync(() => billing.getBillingSummary(tenantId), [tenantId]);
}

/**
 * useBillingEvents -- tenant audit feed.
 * tenantId is required; limit is optional.
 */
export function useBillingEvents(tenantId, { limit } = {}) {
  return useAsync(
    () => billing.listEvents(tenantId, { limit }),
    [tenantId, limit],
    { requiredDepCount: 1 },
  );
}

// Exported for tests only
export const __testing = { normalizeSubscription, normalizeInvoice };
