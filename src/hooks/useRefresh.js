/**
 * useRefresh — Centralized refresh utility for all entity pages.
 *
 * Handles the full cache-bust + reload cycle in one call:
 *   1. Clears client-side ApiManager cache (in-memory dedup layer)
 *   2. Invalidates backend Redis cache via POST /api/cache/invalidate
 *   3. Calls the provided reload callback(s)
 *   4. Shows a success toast
 *
 * Usage:
 *   const { refresh, refreshing } = useRefresh({
 *     modules: ['leads', 'employees', 'users'],  // backend cache modules to bust
 *     onReload: async () => { await loadLeads(); await loadStats(); },
 *     toastMessage: 'Leads refreshed',
 *   });
 *
 *   <RefreshButton onClick={refresh} loading={refreshing} />
 */

import { useState, useCallback } from 'react';
import { useApiManager } from '@/components/shared/ApiManager';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';

const BACKEND_URL = getBackendUrl();

/**
 * Explicit mapping from backend cache module names to ApiManager entity keys.
 * ApiManager uses singular PascalCase entity names (e.g. 'Lead', 'BizDevSource').
 */
const MODULE_TO_ENTITY_KEY = {
  leads: 'Lead',
  contacts: 'Contact',
  accounts: 'Account',
  opportunities: 'Opportunity',
  activities: 'Activity',
  bizdevsources: 'BizDevSource',
  users: 'User',
  employees: 'Employee',
  notes: 'Note',
  documents: 'Document',
  workflows: 'Workflow',
  reports: 'Report',
};

/**
 * Invalidate backend Redis cache for specific modules + tenant.
 * Falls back silently on failure (non-blocking — data will just be up to 30s stale).
 */
async function invalidateBackendCache(tenantId, modules = []) {
  if (!tenantId || modules.length === 0) return;
  try {
    const response = await fetch(`${BACKEND_URL}/api/cache/invalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tenant_id: tenantId, modules }),
    });

    // Treat non-OK HTTP responses as a (non-fatal) invalidation failure.
    if (!response.ok && import.meta.env.DEV) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        // Ignore body read errors; we still have status info.
      }
      console.warn('[useRefresh] Backend cache invalidation rejected (non-fatal):', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
    }
  } catch (err) {
    // Non-fatal — worst case the data is 30s stale
    if (import.meta.env.DEV) {
      console.warn('[useRefresh] Backend cache invalidation failed (non-fatal):', err.message);
    }
  }
}

export function useRefresh({
  modules = [],
  clientCacheKeys = [],
  onReload,
  toastMessage,
  tenantId,
} = {}) {
  const [refreshing, setRefreshing] = useState(false);
  const { clearCacheByKey } = useApiManager();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // 1. Clear client-side ApiManager cache
      // If specific keys provided, use those; otherwise derive from module→entity mapping
      const keysToClean =
        clientCacheKeys.length > 0
          ? clientCacheKeys
          : modules.map((m) => MODULE_TO_ENTITY_KEY[m] || m).filter(Boolean);

      for (const key of keysToClean) {
        clearCacheByKey(key);
      }

      // 2. Invalidate backend Redis cache (non-blocking)
      if (tenantId && modules.length > 0) {
        await invalidateBackendCache(tenantId, modules);
      }

      // 3. Call the reload callback(s)
      if (onReload) {
        await onReload();
      }

      // 4. Show toast
      if (toastMessage) {
        toast.success(toastMessage);
      }
    } catch (err) {
      console.error('[useRefresh] Error during refresh:', err);
      toast.error('Refresh failed — try again');
    } finally {
      setRefreshing(false);
    }
  }, [modules, clientCacheKeys, onReload, toastMessage, tenantId, clearCacheByKey]);

  return { refresh, refreshing };
}

export default useRefresh;
