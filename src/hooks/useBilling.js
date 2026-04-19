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
 * Hooks do NOT trigger on null/undefined identifiers -- they wait.
 * This keeps tenant-picker flows (where tenantId is initially null)
 * from spamming 400 responses.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as billing from '@/api/billing';

function useAsync(fetchFn, deps) {
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
    // Only fetch if all deps are truthy (prevents spam on null tenantId).
    if (deps.every((d) => d !== null && d !== undefined)) {
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
// Tenant Portal hooks
// ============================================================================

export function usePlans() {
  return useAsync(() => billing.listPlans(), []);
}

export function useBillingAccount(tenantId) {
  return useAsync(() => billing.getAccount(tenantId), [tenantId]);
}

export function useActiveSubscription(tenantId) {
  return useAsync(() => billing.getSubscription(tenantId), [tenantId]);
}

export function useInvoices(tenantId, { status, limit } = {}) {
  return useAsync(
    () => billing.listInvoices(tenantId, { status, limit }),
    [tenantId, status, limit],
  );
}

export function useInvoice(invoiceId, tenantId) {
  return useAsync(
    () => billing.getInvoice(invoiceId, tenantId),
    [invoiceId, tenantId],
  );
}

// ============================================================================
// Superadmin Console hooks
// ============================================================================

export function useBillingSummary(tenantId) {
  return useAsync(() => billing.getBillingSummary(tenantId), [tenantId]);
}

export function useBillingEvents(tenantId, { limit } = {}) {
  return useAsync(() => billing.listEvents(tenantId, { limit }), [tenantId, limit]);
}
