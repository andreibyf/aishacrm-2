/**
 * Dashboard API - Direct backend routes
 * Optimized for speed: calls /api/reports/dashboard-bundle directly instead of Firebase Cloud Functions
 *
 * This eliminates cold-start delays and external network latency.
 */

import { BACKEND_URL } from './entities';

// In-flight request deduplication map
// Key: JSON stringified params, Value: Promise
const pendingRequests = new Map();

// Short-term result cache to prevent rapid successive calls
// Key: JSON stringified params, Value: { data, timestamp }
const recentResults = new Map();
const RESULT_CACHE_TTL = 5000; // 5 seconds - prevents duplicate calls during initial load

/**
 * Fast dashboard bundle - calls local backend /api/reports/dashboard-bundle route
 * Uses in-memory caching on backend for instant response
 * Includes in-flight request deduplication to prevent duplicate concurrent calls.
 * Also caches results for 5s to prevent rapid successive calls (e.g., Layout warming + Dashboard load).
 *
 * @param {Object} options - { tenant_id, include_test_data }
 * @returns {Promise<Object>} Dashboard data bundle
 */
export async function getDashboardBundleFast(options = {}) {
  const { tenant_id, include_test_data = true, widgets = [] } = options;

  // Create cache key for deduplication (include widgets to separate cache per widget set)
  const cacheKey = JSON.stringify({ tenant_id, include_test_data, widgets: widgets.sort() });

  // Check short-term result cache first (prevents Layout + Dashboard double-fetch)
  const cached = recentResults.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < RESULT_CACHE_TTL) {
    if (import.meta.env.DEV) {
      console.log('[Dashboard] Returning cached result for:', cacheKey);
    }
    return cached.data;
  }

  // If there's already an in-flight request for these params, return that promise
  if (pendingRequests.has(cacheKey)) {
    if (import.meta.env.DEV) {
      console.log('[Dashboard] Deduplicating in-flight request for:', cacheKey);
    }
    return pendingRequests.get(cacheKey);
  }

  // Create the fetch promise
  const fetchPromise = _fetchDashboardBundle(tenant_id, include_test_data, widgets).then(
    (result) => {
      // Cache the successful result
      recentResults.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    },
  );

  // Store it for deduplication
  pendingRequests.set(cacheKey, fetchPromise);

  // Clean up after resolution (success or failure)
  fetchPromise.finally(() => {
    pendingRequests.delete(cacheKey);
  });

  return fetchPromise;
}

/**
 * Clear the short-term in-memory result cache.
 * Call this after CRM entity mutations (create/update/delete) so the
 * next getDashboardBundleFast() call fetches fresh data from the server.
 */
export function clearDashboardResultsCache() {
  recentResults.clear();
}

/**
 * Internal fetch implementation
 */
async function _fetchDashboardBundle(tenant_id, include_test_data, widgets = []) {
  try {
    // Call backend /api/reports/dashboard-bundle directly (in-memory cached on server)
    const queryParams = new URLSearchParams();
    if (tenant_id) {
      queryParams.append('tenant_id', tenant_id);
    }
    if (!include_test_data) {
      queryParams.append('include_test_data', 'false');
    }
    // Pass visible widget IDs so backend can skip fetching unused data
    if (widgets && widgets.length > 0) {
      queryParams.append('widgets', widgets.join(','));
    }

    const url = `${BACKEND_URL}/api/reports/dashboard-bundle?${queryParams}`;
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    // Unwrap response shape from backend
    const data = json?.data || json;

    // Return compact bundle shape
    return {
      stats: data?.stats || {
        totalContacts: 0,
        totalLeads: 0,
        openLeads: 0,
        activeOpportunities: 0,
        pipelineValue: 0,
        wonOpportunities: 0,
        newLeadsLast30Days: 0,
        activitiesLast30Days: 0,
      },
      lists: data?.lists || {
        recentLeads: [],
        recentOpportunities: [],
        recentActivities: [],
        recentContacts: [],
      },
    };
  } catch (error) {
    console.error('[getDashboardBundleFast] Error:', error);
    // Return empty bundle on error
    return {
      stats: {
        totalContacts: 0,
        totalLeads: 0,
        openLeads: 0,
        activeOpportunities: 0,
        pipelineValue: 0,
        wonOpportunities: 0,
        newLeadsLast30Days: 0,
        activitiesLast30Days: 0,
      },
      lists: {
        recentLeads: [],
        recentOpportunities: [],
        recentActivities: [],
        recentContacts: [],
      },
    };
  }
}
