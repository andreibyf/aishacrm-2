import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import api from '@/api/api';

/**
 * useEmployeeCache - Hook for fast employee ID → name lookups
 * 
 * Uses Redis-cached backend endpoint for near-instant employee name resolution.
 * Automatically fetches on mount and can be manually refreshed.
 * 
 * @returns {Object} { employeeMap, loading, error, refresh }
 */
export function useEmployeeCache() {
  const { user } = useAuth();
  const [employeeMap, setEmployeeMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetchedRef = useRef(false);

  const fetchEmployeeMap = useCallback(async () => {
    if (!user?.tenant_id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/api/employees/lookup', {
        params: { tenant_id: user.tenant_id },
      });

      if (response.data?.status === 'success') {
        setEmployeeMap(response.data.data || {});
      } else {
        throw new Error(response.data?.message || 'Failed to fetch employee map');
      }
    } catch (err) {
      console.error('[useEmployeeCache] Error:', err);
      setError(err.message);
      setEmployeeMap({});
    } finally {
      setLoading(false);
    }
  }, [user?.tenant_id]);

  // Fetch on mount
  useEffect(() => {
    if (!fetchedRef.current && user?.tenant_id) {
      fetchedRef.current = true;
      fetchEmployeeMap();
    }
  }, [user?.tenant_id, fetchEmployeeMap]);

  // Manual refresh function
  const refresh = useCallback(() => {
    fetchedRef.current = false;
    return fetchEmployeeMap();
  }, [fetchEmployeeMap]);

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
