/**
 * Dashboard API - Direct backend routes
 * Optimized for speed: calls /api/v2/* routes directly instead of Firebase Cloud Functions
 * 
 * This eliminates Firebase cold-start delays and Base44 network latency.
 */

import { Opportunity, Lead, Activity, Contact } from './entities';

/**
 * Fast dashboard bundle - calls local backend routes directly
 * Uses V2 routes with Redis caching for instant response
 * 
 * @param {Object} options - { tenant_id, include_test_data }
 * @returns {Promise<Object>} Dashboard data bundle
 */
export async function getDashboardBundleFast(options = {}) {
  const { tenant_id, include_test_data = true } = options;

  try {
    // Parallel fetch all data from V2 routes (Redis cached)
    const [stats, recentLeads, recentOpps, recentActivities, recentContacts] = await Promise.all([
      // Stats endpoint (fastest - aggregate counts)
      fetch('/api/v2/dashboard/stats' + (tenant_id ? `?tenant_id=${encodeURIComponent(tenant_id)}` : ''), {
        credentials: 'include'
      }).then(r => r.ok ? r.json() : {}),

      // Recent data (narrow columns, sorted, limited)
      Lead.filter({ tenant_id, $limit: 5 }).then(leads => leads || []),
      
      Opportunity.filter({ tenant_id, $limit: 5 }).then(opps => opps || []),
      
      Activity.filter({ tenant_id, $limit: 10 }).then(acts => acts || []),
      
      Contact.filter({ tenant_id, $limit: 5 }).then(contacts => contacts || [])
    ]);

    // Return compact bundle shape matching Firebase function output
    return {
      stats: stats?.data || stats || {
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
        recentLeads: Array.isArray(recentLeads) ? recentLeads : [],
        recentOpportunities: Array.isArray(recentOpps) ? recentOpps : [],
        recentActivities: Array.isArray(recentActivities) ? recentActivities : [],
        recentContacts: Array.isArray(recentContacts) ? recentContacts : []
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
