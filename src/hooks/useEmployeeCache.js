import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/components/shared/useUser';
import { getBackendUrl } from '@/api/backendUrl';

const BACKEND_URL = getBackendUrl();

/**
 * useEmployeeCache - Hook for fast employee ID → name lookups
 * 
 * Uses Redis-cached backend endpoint for near-instant employee name resolution.
 * Automatically fetches on mount and can be manually refreshed.
 * 
 * @returns {Object} { employeeMap, loading, error, refresh }
 */
export function useEmployeeCache() {
  const currentUser = useUser();
  const tenantId = currentUser?.tenant_id;
  const [employeeMap, setEmployeeMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Track which tenant we last fetched for so a tenant switch triggers a reload
  const fetchedForTenantRef = useRef(null);

  const fetchEmployeeMap = useCallback(async (tid) => {
    if (!tid) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(
        `${BACKEND_URL}/api/employees/lookup?tenant_id=${encodeURIComponent(tid)}`,
        { credentials: 'include' },
      );
      const data = await res.json();

      if (res.ok && data?.status === 'success') {
        setEmployeeMap(data.data || {});
      } else {
        throw new Error(data?.message || 'Failed to fetch employee map');
      }
    } catch (err) {
      console.error('[useEmployeeCache] Error:', err);
      setError(err.message);
      setEmployeeMap({});
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when tenant becomes available or changes
  useEffect(() => {
    if (tenantId && fetchedForTenantRef.current !== tenantId) {
      fetchedForTenantRef.current = tenantId;
      fetchEmployeeMap(tenantId);
    }
  }, [tenantId, fetchEmployeeMap]);

  // Manual refresh function — resets cache and refetches
  const refresh = useCallback(() => {
    fetchedForTenantRef.current = null;
    if (tenantId) fetchEmployeeMap(tenantId);
  }, [tenantId, fetchEmployeeMap]);

  return {
    employeeMap,
    loading,
    error,
    refresh,
  };
}

/**
 * Resolve a single employee ID to name
 * @param {Object} employeeMap - Map from useEmployeeCache
 * @param {string} employeeId - Employee UUID
 * @returns {string|null} Employee name or null
 */
export function resolveEmployeeName(employeeMap, employeeId) {
  if (!employeeId || !employeeMap) return null;
  return employeeMap[employeeId] || null;
}

/**
 * Resolve multiple employee IDs to names
 * @param {Object} employeeMap - Map from useEmployeeCache
 * @param {string[]} employeeIds - Array of employee UUIDs
 * @returns {Object} Map of id → name (only resolved IDs)
 */
export function resolveEmployeeNames(employeeMap, employeeIds) {
  if (!employeeIds || !employeeMap) return {};
  
  const result = {};
  for (const id of employeeIds) {
    if (id && employeeMap[id]) {
      result[id] = employeeMap[id];
    }
  }
  return result;
}

export default useEmployeeCache;
