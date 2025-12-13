/**
 * Dashboard API - Direct backend routes
 * Optimized for speed: calls /api/reports/dashboard-bundle directly instead of Firebase Cloud Functions
 * 
 * This eliminates Firebase cold-start delays and Base44 network latency.
 */

import { BACKEND_URL } from './entities';

/**
 * Fast dashboard bundle - calls local backend /api/reports/dashboard-bundle route
 * Uses in-memory caching on backend for instant response
 * 
 * @param {Object} options - { tenant_id, include_test_data }
 * @returns {Promise<Object>} Dashboard data bundle
 */
export async function getDashboardBundleFast(options = {}) {
  const { tenant_id, include_test_data = true } = options;

  try {
    // Call backend /api/reports/dashboard-bundle directly (in-memory cached on server)
    const queryParams = new URLSearchParams();
    if (tenant_id) {
      queryParams.append('tenant_id', tenant_id);
    }
    if (!include_test_data) {
      queryParams.append('include_test_data', 'false');
    }

    const url = `${BACKEND_URL}/api/reports/dashboard-bundle?${queryParams}`;
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
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
        activitiesLast30Days: 0
      },
      lists: data?.lists || {
        recentLeads: [],
        recentOpportunities: [],
        recentActivities: [],
        recentContacts: []
      }
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
        activitiesLast30Days: 0
      },
      lists: {
        recentLeads: [],
        recentOpportunities: [],
        recentActivities: [],
        recentContacts: []
      }
    };
  }
}
