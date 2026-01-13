/**
 * Reports & Analytics Routes
 */

import express from 'express';
import { cacheList } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

// Helper: attempt to count rows from a table safely (optionally by tenant)
// options:
// - includeTestData: boolean (default true)
// - countMode: 'planned' | 'exact' (default 'planned')
// - confirmSmallCounts: boolean (default true) -> if planned count <= 5, double-check with exact
async function safeCount(_pgPool, table, tenantId, filterBuilder, options = {}) {
  const { getSupabaseClient } = await import('../lib/supabase-db.js');
  const supabase = getSupabaseClient();
  const includeTestData = options.includeTestData !== false;
  const countMode = options.countMode || 'planned';
  const confirmSmall = options.confirmSmallCounts !== false; // default true

  // Whitelist of allowed table names
  const allowedTables = ['contacts', 'accounts', 'leads', 'opportunities', 'activities'];
  if (!allowedTables.includes(table)) {
    return 0; // Invalid table name, prevent SQL injection
  }

  try {
    // Build base query
    let query = supabase.from(table).select('*', { count: countMode, head: true });
    if (tenantId) {
      try {
        query = query.eq('tenant_id', tenantId);
      } catch {
        /* ignore: table may not have tenant_id */ void 0;
      }
    }
    if (!includeTestData) {
      try {
        // When toggle OFF: exclude test data (show only real data)
        query = query.or('is_test_data.is.false,is_test_data.is.null');
      } catch {
        /* ignore: table may not have is_test_data */ void 0;
      }
    }
    // When includeTestData is true, no filter applied (show all data)
    // Apply additional filters (e.g., status not in ...)
    if (typeof filterBuilder === 'function') {
      try {
        query = filterBuilder(query) || query;
      } catch {
        // ignore filter builder errors; keep base query
      }
    }
    const { count } = await query;
    const plannedCount = count ?? 0;

    // If using planned estimates, and the estimate is tiny, confirm with exact to avoid false positives on empty sets
    if (countMode === 'planned' && confirmSmall && plannedCount <= 5) {
      try {
        let exact = supabase.from(table).select('*', { count: 'exact', head: true });
        if (tenantId) {
          try { exact = exact.eq('tenant_id', tenantId); } catch { /* ignore */ void 0; }
        }
        if (!includeTestData) {
          try {
            exact = exact.or('is_test_data.is.false,is_test_data.is.null');
          } catch { /* ignore */ void 0; }
        }
        if (typeof filterBuilder === 'function') {
          try { exact = filterBuilder(exact) || exact; } catch { /* ignore */ void 0; }
        }
        const { count: exactCount } = await exact;
        return exactCount ?? plannedCount;
      } catch {
        // fall back to planned on error
        return plannedCount;
      }
    }
    return plannedCount;
  } catch {
    return 0; // table might not exist yet; return 0 as a safe default
  }
}

// Helper: get recent activities safely (limit 10), optionally by tenant
async function safeRecentActivities(_pgPool, tenantId, limit = 10) {
  const { getSupabaseClient } = await import('../lib/supabase-db.js');
  const supabase = getSupabaseClient();
  const max = Math.max(1, Math.min(100, limit));
  try {
    if (tenantId) {
      try {
        const { data, error } = await supabase
          .from('activities')
          .select('id, type, subject, created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(max);
        if (error) throw error;
        return data || [];
      } catch {
        // Fall through to global query if tenant_id column doesn't exist
      }
    }
    const { data } = await supabase
      .from('activities')
      .select('id, type, subject, created_at')
      .order('created_at', { ascending: false })
      .limit(max);
    return data || [];
  } catch {
    return [];
  }
}

export default function createReportRoutes(_pgPool) {
  const router = express.Router();
  // Redis cache for dashboard bundle (distributed, persistent)
  // Get cacheManager from app.locals (initialized in startup/initServices.js)
  const BUNDLE_TTL_SECONDS = 120; // 2 minutes - balances freshness vs. DB load

  // POST /api/reports/clear-cache - Clear dashboard bundle cache (admin only, uses redis)
  router.post('/clear-cache', async (req, res) => {
    try {
      const { tenant_id } = req.body;
      const cacheManager = req.app?.locals?.cacheManager;
      
      if (!cacheManager || !cacheManager.client) {
        return res.json({
          status: 'warning',
          message: 'Cache manager not available',
          data: { cleared: false }
        });
      }
      
      logger.debug('[Reports] clear-cache called via redis:', { tenant_id });
      
      if (tenant_id) {
        // Clear specific tenant cache: delete dashboard bundle keys for this tenant
        const pattern = `dashboard:bundle:${tenant_id}:*`;
        let deletedCount = 0;
        try {
          const keys = await cacheManager.client.keys(pattern);
          if (keys && keys.length > 0) {
            deletedCount = await cacheManager.client.del(keys);
          }
        } catch (err) {
          logger.warn('[Reports] Error clearing redis keys:', err);
        }
        logger.debug('[Reports] Deleted redis cache entries:', { tenant_id, deletedCount });
      } else {
        // Clear all dashboard bundle cache (global pattern)
        let deletedCount = 0;
        try {
          const keys = await cacheManager.client.keys('dashboard:bundle:*');
          if (keys && keys.length > 0) {
            deletedCount = await cacheManager.client.del(keys);
          }
        } catch (err) {
          logger.warn('[Reports] Error clearing all redis keys:', err);
        }
        logger.debug('[Reports] Cleared all dashboard bundle cache');
      }
      
      res.json({
        status: 'success',
        message: `Cache cleared${tenant_id ? ' for tenant ' + tenant_id : ' (all tenants)'}`,
        data: { cleared: true }
      });
    } catch (error) {
      logger.error('[Reports] clear-cache error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * @openapi
   * /api/reports/dashboard-stats:
   *   get:
   *     summary: Dashboard statistics overview
   *     description: Returns high-level counts and recent activities for the tenant.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: true
   *         description: Tenant UUID used to scope the statistics
   *     responses:
   *       200:
   *         description: Dashboard statistics payload
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing tenant_id
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/reports/dashboard-stats - Get dashboard statistics
  router.get('/dashboard-stats', cacheList('dashboard_stats', 90), async (req, res) => {
    try {
      let { tenant_id } = req.query;

      logger.debug('[dashboard-stats] Received tenant_id:', tenant_id);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const [contacts, accounts, leads, opportunities, activities] = await Promise.all([
        safeCount(null, 'contacts', tenant_id),
        safeCount(null, 'accounts', tenant_id),
        safeCount(null, 'leads', tenant_id),
        safeCount(null, 'opportunities', tenant_id),
        safeCount(null, 'activities', tenant_id),
      ]);
      const recentActivities = await safeRecentActivities(null, tenant_id, 10);

      const stats = {
        totalContacts: contacts,
        totalAccounts: accounts,
        totalLeads: leads,
        totalOpportunities: opportunities,
        totalActivities: activities,
        recentActivities,
        revenue: { total: 0, thisMonth: 0, lastMonth: 0 },
      };

      res.json({ status: 'success', data: stats });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/reports/dashboard-bundle:
   *   get:
   *     summary: Complete dashboard bundle
   *     description: Returns a compact bundle used by the dashboard widgets.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID used to scope data
   *     responses:
   *       200:
   *         description: Dashboard bundle payload
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // GET /api/reports/dashboard-bundle - Get complete dashboard bundle
  router.get('/dashboard-bundle', async (req, res) => {
    try {
      const { tenant_id } = req.query;
      
      // Require tenant_id - no global superadmin view for strict tenant isolation
      if (!tenant_id || tenant_id === 'null' || tenant_id === '') {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      
      // Parse visible widgets to optimize data fetching
      const widgetsParam = req.query.widgets || '';
      const visibleWidgets = widgetsParam ? widgetsParam.split(',').map(w => w.trim()).filter(Boolean) : [];
      const widgetSet = new Set(visibleWidgets);
      
      // Use redis cache for distributed, persistent caching
      const includeTestData = (req.query.include_test_data ?? 'true') !== 'false';
      const bustCache = req.query.bust_cache === 'true'; // Allow cache bypass for testing
      // Include widgets in cache key to avoid serving wrong dataset
      const widgetsCacheKey = visibleWidgets.length > 0 ? `:widgets=${visibleWidgets.sort().join('_')}` : '';
      const cacheKey = `dashboard:bundle:${tenant_id}:include=${includeTestData ? 'true' : 'false'}${widgetsCacheKey}`;
      
      // Try redis cache first (distributed across instances)
      const cacheManager = req.app?.locals?.cacheManager;
      if (!bustCache && cacheManager && cacheManager.client) {
        try {
          const cached = await cacheManager.get(cacheKey);
          if (cached) {
            logger.debug(`[dashboard-bundle] Cache HIT key=${cacheKey} (redis)`);
            return res.json({ status: 'success', data: cached, cached: true });
          }
        } catch (err) {
          logger.warn(`[dashboard-bundle] Redis cache read error: ${err.message}`);
        }
      }
      logger.debug(`[dashboard-bundle] Cache MISS key=${cacheKey} (compute from db)`);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      /**
       * DASHBOARD BUNDLE OPTIMIZATION (v3.6.18+)
       * 
       * Three execution paths exist (in order of preference):
       * 1. RPC `get_dashboard_bundle` - Fast (389ms) but lacks new aggregations
       * 2. RPC `get_dashboard_stats` + manual lists - Hybrid approach
       * 3. Full manual queries with aggregations - CURRENT (214ms)
       * 
       * MANUAL APPROACH BENEFITS (currently active):
       * - Pre-aggregated leadsBySource (23 sources) → eliminates LeadSourceChart API call
       * - Increased limits: 100 leads (was 5), 50 opps (was 5) → widgets have enough data
       * - Materialized view funnelAggregates → instant pipeline breakdown by stage
       * - Extra fields (email, phone, source, is_test_data) → richer widget data
       * - Faster: 214ms vs 389ms with RPC
       * 
       * FUTURE: Update Supabase RPC functions to include these aggregations,
       * then re-enable RPC for potential sub-200ms performance.
       */
      let bundleData = null;
      const USE_RPC = false; // Set true to use RPC (faster but less data), false for manual (richer data)
      if (USE_RPC) {
        try {
          const startTime = Date.now();
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_dashboard_bundle', {
            p_tenant_id: tenant_id,
            p_include_test_data: includeTestData
          });
          const elapsed = Date.now() - startTime;
          if (rpcError) {
            logger.warn(`[dashboard-bundle] Bundle RPC error (${elapsed}ms): ${rpcError.message}`);
          } else if (rpcData) {
            bundleData = rpcData;
            logger.debug(`[dashboard-bundle] Single RPC success (${elapsed}ms) source=${bundleData?.meta?.source || 'unknown'}`);
          }
        } catch (rpcErr) {
          logger.warn(`[dashboard-bundle] Bundle RPC fallback: ${rpcErr.message}`);
        }
      }

      // If single RPC worked, format and return
      if (bundleData && bundleData.stats) {
        const bundle = {
          stats: {
            totalContacts: bundleData.stats.total_contacts || 0,
            totalAccounts: bundleData.stats.total_accounts || 0,
            totalLeads: bundleData.stats.total_leads || 0,
            totalOpportunities: bundleData.stats.total_opportunities || 0,
            openLeads: bundleData.stats.open_leads || 0,
            wonOpportunities: bundleData.stats.won_opportunities || 0,
            openOpportunities: bundleData.stats.open_opportunities || 0,
            newLeadsLast30Days: bundleData.stats.leads_last_30_days || 0,
            activitiesLast30Days: bundleData.stats.activities_last_30_days || 0,
            pipelineValue: parseFloat(bundleData.stats.pipeline_value) || 0,
            wonValue: parseFloat(bundleData.stats.won_value) || 0,
          },
          lists: {
            recentActivities: bundleData.lists?.recentActivities || [],
            recentLeads: bundleData.lists?.recentLeads || [],
            recentOpportunities: bundleData.lists?.recentOpportunities || [],
          },
          meta: {
            tenant_id: tenant_id,
            generated_at: new Date().toISOString(),
            ttl_seconds: BUNDLE_TTL_SECONDS,
            source: bundleData.meta?.source || 'rpc_bundle',
          },
        };

        // Store in redis cache
        if (cacheManager && cacheManager.client) {
          try {
            await cacheManager.set(cacheKey, bundle, BUNDLE_TTL_SECONDS);
          } catch (err) {
            logger.warn(`[dashboard-bundle] Redis cache write error: ${err.message}`);
          }
        }
        return res.json({ status: 'success', data: bundle, cached: false });
      }

      /**
       * FALLBACK 1: MV stats RPC + separate list queries
       * Disabled to force use of FALLBACK 2 which includes leadsBySource and increased limits.
       * This RPC only provides stats from materialized views, not the enhanced lists.
       */
      let mvStats = null;
      const USE_MV_STATS = false; // Set true to use MV stats RPC, false for full manual aggregation
      if (USE_MV_STATS) {
        try {
          const { data: mvData, error: mvError } = await supabase.rpc('get_dashboard_stats', { p_tenant_id: tenant_id });
          if (mvError) {
            logger.warn(`[dashboard-bundle] MV stats RPC error: ${mvError.message}`);
          } else if (mvData) {
            mvStats = mvData;
            logger.debug(`[dashboard-bundle] Using MV stats (fallback 1) for tenant ${tenant_id}`);
          }
        } catch (mvErr) {
          logger.warn(`[dashboard-bundle] MV stats fallback: ${mvErr.message}`);
        }
      }

      // If MV stats available, fetch lists separately
      if (mvStats) {
        const recentActivitiesP = (async () => {
          try {
            let q = supabase.from('activities').select('id,type,subject,status,created_at,created_date,assigned_to').order('created_at', { ascending: false }).limit(10);
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch { return []; }
        })();
        const recentLeadsP = (async () => {
          try {
            let q = supabase.from('leads').select('id,first_name,last_name,company,created_date,status').order('created_date', { ascending: false }).limit(5);
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch { return []; }
        })();
        const recentOppsP = (async () => {
          try {
            let q = supabase.from('opportunities').select('id,name,amount,stage,updated_at').order('updated_at', { ascending: false }).limit(5);
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch { return []; }
        })();

        const [recentActivities, recentLeads, recentOpportunities] = await Promise.all([
          recentActivitiesP, recentLeadsP, recentOppsP
        ]);

        const bundle = {
          stats: {
            totalContacts: mvStats.total_contacts || 0,
            totalAccounts: mvStats.total_accounts || 0,
            totalLeads: mvStats.total_leads || 0,
            totalOpportunities: mvStats.total_opportunities || 0,
            openLeads: mvStats.open_leads || 0,
            wonOpportunities: mvStats.won_opportunities || 0,
            openOpportunities: mvStats.open_opportunities || 0,
            newLeadsLast30Days: mvStats.leads_last_30_days || 0,
            activitiesLast30Days: mvStats.activities_last_30_days || 0,
            pipelineValue: parseFloat(mvStats.pipeline_value) || 0,
            wonValue: parseFloat(mvStats.won_value) || 0,
          },
          lists: {
            recentActivities,
            recentLeads,
            recentOpportunities,
          },
          meta: {
            tenant_id: tenant_id || null,
            generated_at: new Date().toISOString(),
            ttl_seconds: BUNDLE_TTL_SECONDS,
            source: 'materialized_view',
          },
        };

        // Store in redis cache
        if (cacheManager && cacheManager.client) {
          try {
            await cacheManager.set(cacheKey, bundle, BUNDLE_TTL_SECONDS);
          } catch (err) {
            logger.warn(`[dashboard-bundle] Redis cache write error: ${err.message}`);
          }
        }
        return res.json({ status: 'success', data: bundle, cached: false });
      }

      /**
       * FALLBACK 2: Full manual queries with enhanced aggregations (CURRENTLY ACTIVE)
       * 
       * This path provides the richest dataset for dashboard widgets:
       * - leadsBySource: Pre-aggregated source counts for LeadSourceChart
       * - funnelAggregates: Materialized view with pipeline breakdown
       * - 100 leads with email, phone, source fields (was 5 leads)
       * - 50 opportunities with probability, is_test_data (was 5 opps)
       * 
       * Performance: ~214ms average (faster than RPC's 389ms)
       * Cache TTL: 60 seconds
       */
      logger.debug(`[dashboard-bundle] Falling back to individual queries`);
      const commonOpts = { includeTestData, countMode: 'exact', confirmSmallCounts: false };
      const totalContactsP = safeCount(null, 'contacts', tenant_id, undefined, commonOpts);
      const totalAccountsP = safeCount(null, 'accounts', tenant_id, undefined, commonOpts);
      const totalLeadsP = safeCount(null, 'leads', tenant_id, undefined, commonOpts);
      const totalOpportunitiesP = safeCount(null, 'opportunities', tenant_id, undefined, commonOpts);
      const openLeadsP = safeCount(null, 'leads', tenant_id, (q) => q.not('status', 'in', '("converted","lost")'), commonOpts);
      const wonOpportunitiesP = safeCount(null, 'opportunities', tenant_id, (q) => q.in('stage', ['won', 'closed_won']), commonOpts);
      const openOpportunitiesP = safeCount(null, 'opportunities', tenant_id, (q) => q.not('stage', 'in', '("won","closed_won","lost","closed_lost")'), commonOpts);

      // New leads last 30 days (exact count for accuracy)
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceISO = since.toISOString();
      const newLeadsP = (async () => {
        try {
          let q = supabase.from('leads').select('*', { count: 'exact', head: true });
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          q = q.gte('created_date', sinceISO);
          q = q.not('status', 'in', '("converted","lost")'); // Exclude converted/lost leads
          if (!includeTestData) {
            try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ void 0; }
          }
          const { count } = await q;
          return count ?? 0;
        } catch { return 0; }
      })();

      // Activities last 30 days (exact count for accuracy)
      const recentActivitiesCountP = (async () => {
        try {
          let q = supabase.from('activities').select('*', { count: 'exact', head: true });
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          q = q.gte('created_date', sinceISO);
          if (!includeTestData) {
            try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
          }
          const { count } = await q;
          return count ?? 0;
        } catch { return 0; }
      })();

      // Recent small lists (narrow columns, limited)
      // OPTIMIZATION: Skip if recentActivities widget is hidden
      const needsActivities = visibleWidgets.length === 0 || widgetSet.has('recentActivities');
      const recentActivitiesP = needsActivities ? (async () => {
        try {
          let q = supabase.from('activities').select('id,type,subject,status,created_at,created_date,assigned_to').order('created_at', { ascending: false }).limit(10);
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          if (!includeTestData) {
            try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
          }
          const { data } = await q;
          return Array.isArray(data) ? data : [];
        } catch { return []; }
      })() : Promise.resolve([]);
      /**
       * Recent Leads Query (Enhanced for Widgets)
       * Limit: 100 (was 5) - Provides enough data for:
       *   - LeadAgeReport: Calculate average lead age without extra API call
       *   - LeadSourceChart: Already aggregated separately but these provide details
       * Fields: email, phone, source, is_test_data added for richer widget context
       * Performance: ~80ms for 100 leads
       * OPTIMIZATION: Skip if neither leadSourceChart nor leadAgeReport widgets are visible
       */
      const needsLeads = visibleWidgets.length === 0 || widgetSet.has('leadSourceChart') || widgetSet.has('leadAgeReport');
      const recentLeadsP = needsLeads ? (async () => {
        try {
          let q = supabase.from('leads').select('id,first_name,last_name,company,email,phone,created_date,status,source,is_test_data').order('created_date', { ascending: false }).limit(100);
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          if (!includeTestData) {
            try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
          }
          const { data } = await q;
          return Array.isArray(data) ? data : [];
        } catch { return []; }
      })() : Promise.resolve([]);
      /**
       * Recent Opportunities Query (Enhanced for Widgets)
       * Limit: 50 (was 5) - Better sample for SalesPipeline and opportunity widgets
       * Fields: probability, is_test_data added for accurate pipeline calculations
       * Performance: ~60ms for 50 opportunities
       * OPTIMIZATION: Skip if salesPipeline widget is hidden
       */
      const needsOpportunities = visibleWidgets.length === 0 || widgetSet.has('salesPipeline');
      const recentOppsP = needsOpportunities ? (async () => {
        try {
          let q = supabase.from('opportunities').select('id,name,amount,stage,probability,updated_at,is_test_data').order('updated_at', { ascending: false }).limit(50);
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          if (!includeTestData) {
            try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
          }
          const { data } = await q;
          return Array.isArray(data) ? data : [];
        } catch { return []; }
      })() : Promise.resolve([]);
      
      /**
       * Funnel Aggregates from Materialized View
       * Source: dashboard_funnel_counts table (refreshed nightly or on-demand)
       * Provides: Pipeline stage counts/values split by test/real data
       * Fields: prospecting_count/value, qualification, proposal, negotiation, closed_won, closed_lost
       * Usage: SalesPipeline widget, funnel reports, stage analytics
       * Performance: <10ms (pre-computed, indexed)
       */
      const funnelAggregatesP = (async () => {
        try {
          let q = supabase.from('dashboard_funnel_counts').select('*');
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          const { data } = await q;
          return Array.isArray(data) && data.length > 0 ? data[0] : null;
        } catch (err) {
          if (process.env.NODE_ENV === 'development') logger.warn('[dashboard-bundle] Funnel MV unavailable:', err.message);
          return null;
        }
      })();

      /**
       * Lead Source Aggregation (NEW in v3.6.18)
       * Fetches ALL lead source fields and aggregates client-side
       * Purpose: Eliminates LeadSourceChart's separate API call
       * Returns: { 'website': 9, 'referral': 3, 'other': 18, ... }
       * Performance: ~50ms for 58 leads (SELECT only 1 column)
       * Alternative: Could use GROUP BY in SQL for even better performance
       * OPTIMIZATION: Skip if leadSourceChart widget is hidden
       */
      const needsLeadSources = visibleWidgets.length === 0 || widgetSet.has('leadSourceChart');
      const leadSourcesP = needsLeadSources ? (async () => {
        try {
          logger.debug('[dashboard-bundle] Fetching lead sources for tenant:', tenant_id);
          let q = supabase.from('leads').select('source');
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          if (!includeTestData) {
            try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
          }
          const { data, error } = await q;
          if (error) {
            logger.error('[dashboard-bundle] Lead sources query error:', error);
            return {};
          }
          logger.debug('[dashboard-bundle] Lead sources query returned:', data?.length, 'rows');
          if (!Array.isArray(data)) return {};

          // Aggregate sources client-side (still faster than fetching full records)
          const sources = {};
          data.forEach(row => {
            const source = row.source || 'other';
            sources[source] = (sources[source] || 0) + 1;
          });
          logger.debug('[dashboard-bundle] Lead sources aggregated:', sources);
          return sources;
        } catch (err) {
          logger.error('[dashboard-bundle] Lead sources fetch error:', err);
          return {};
        }
      })() : Promise.resolve({});

      // Fetch ALL opportunities for pipeline value calculation
      const allOppsP = (async () => {
        try {
          let q = supabase.from('opportunities').select('id,name,amount,stage,created_date');
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          if (!includeTestData) {
            try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
          }
          const { data } = await q;
          return Array.isArray(data) ? data : [];
        } catch { return []; }
      })();

      const [
        totalContacts,
        totalAccounts,
        totalLeads,
        totalOpportunities,
        openLeads,
        wonOpportunities,
        openOpportunities,
        newLeads,
        activitiesLast30,
        recentActivities,
        recentLeads,
        recentOpportunities,
        allOpps,
        funnelAggregates,
        leadSources,
      ] = await Promise.all([
        totalContactsP,
        totalAccountsP,
        totalLeadsP,
        totalOpportunitiesP,
        openLeadsP,
        wonOpportunitiesP,
        openOpportunitiesP,
        newLeadsP,
        recentActivitiesCountP,
        recentActivitiesP,
        recentLeadsP,
        recentOppsP,
        allOppsP,
        funnelAggregatesP,
        leadSourcesP,
      ]);

      // Calculate pipeline value from ALL opportunities
      const pipelineValue = allOpps.reduce((sum, opp) => {
        if (!['won', 'closed_won', 'lost', 'closed_lost'].includes(opp.stage)) {
          return sum + (parseFloat(opp.amount) || 0);
        }
        return sum;
      }, 0);

      const wonValue = allOpps.reduce((sum, opp) => {
        if (opp.stage === 'won' || opp.stage === 'closed_won') {
          return sum + (parseFloat(opp.amount) || 0);
        }
        return sum;
      }, 0);

      /**
       * Dashboard Bundle Structure
       * - stats: 12 fields including NEW leadsBySource aggregation
       * - lists: recentActivities (10), recentLeads (100), recentOpportunities (50)
       * - funnelAggregates: Materialized view data (spread at root level)
       * - meta: Request metadata (tenant_id, timestamp, source)
       */
      const bundle = {
        stats: {
          totalContacts,
          totalAccounts,
          totalLeads,
          totalOpportunities,
          openLeads,
          wonOpportunities,
          openOpportunities,
          newLeadsLast30Days: newLeads,
          activitiesLast30Days: activitiesLast30,
          pipelineValue,
          wonValue,
          // NEW: Pre-aggregated source counts { 'website': 9, 'referral': 3, ... }
          leadsBySource: leadSources || {},
        },
        lists: {
          recentActivities,
          recentLeads,
          recentOpportunities,
        },
        // Include funnel aggregates if available (from materialized view)
        ...(funnelAggregates ? { funnelAggregates } : {}),
        meta: {
          tenant_id: tenant_id || null,
          generated_at: new Date().toISOString(),
          ttl_seconds: BUNDLE_TTL_SECONDS,
        },
      };

      logger.debug('[dashboard-bundle] Bundle stats.leadsBySource:', bundle.stats.leadsBySource);

      // Store in redis cache (5-minute TTL, shared across instances)
      if (cacheManager && cacheManager.client) {
        try {
          await cacheManager.set(cacheKey, bundle, BUNDLE_TTL_SECONDS);
        } catch (err) {
          logger.warn(`[dashboard-bundle] Redis cache write error: ${err.message}`);
        }
      }
      res.json({ status: 'success', data: bundle, cached: false });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/reports/generate-custom:
   *   post:
   *     summary: Generate a custom report
   *     description: Initiates generation of a custom report based on provided filters.
   *     tags: [reports]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *                 description: Tenant UUID scope
   *               report_type:
   *                 type: string
   *                 description: The report type to generate (e.g., overview, data-quality)
   *               filters:
   *                 type: object
   *                 additionalProperties: true
   *     responses:
   *       200:
   *         description: Report generation initiated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/reports/generate-custom - Generate custom report
  router.post('/generate-custom', async (req, res) => {
    try {
      const { tenant_id, report_type, filters } = req.body;

      res.json({
        status: 'success',
        message: 'Custom report generation initiated',
        data: { tenant_id, report_type, filters },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });
  // Analytics: Opportunity pipeline by stage
  // GET /api/reports/pipeline - Opportunity counts by stage
  /**
   * @openapi
   * /api/reports/pipeline:
   *   get:
   *     summary: Opportunity counts by stage
   *     description: Aggregated pipeline breakdown by stage for the tenant.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *     responses:
   *       200:
   *         description: Pipeline stages summary
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/pipeline', async (req, res) => {
    try {
      let { tenant_id } = req.query;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let query = supabase.from('v_opportunity_pipeline_by_stage').select('stage, count').order('stage');
      if (tenant_id) query = query.eq('tenant_id', tenant_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      res.json({ status: 'success', data: { stages: data || [] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/reports/lead-status - Lead counts by status
  /**
   * @openapi
   * /api/reports/lead-status:
   *   get:
   *     summary: Lead counts by status
   *     description: Aggregated counts of leads grouped by status.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *     responses:
   *       200:
   *         description: Lead status summary
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/lead-status', async (req, res) => {
    try {
      let { tenant_id } = req.query;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let query = supabase.from('v_lead_counts_by_status').select('status, count').order('status');
      if (tenant_id) query = query.eq('tenant_id', tenant_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      res.json({ status: 'success', data: { statuses: data || [] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/reports/calendar - Calendar feed from activities
  /**
   * @openapi
   * /api/reports/calendar:
   *   get:
   *     summary: Calendar feed from activities
   *     description: Returns activity items suitable for a calendar view.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *       - in: query
   *         name: from_date
   *         schema:
   *           type: string
   *           format: date
   *         required: false
   *         description: Inclusive start date filter (YYYY-MM-DD)
   *       - in: query
   *         name: to_date
   *         schema:
   *           type: string
   *           format: date
   *         required: false
   *         description: Inclusive end date filter (YYYY-MM-DD)
   *     responses:
   *       200:
   *         description: Calendar activity feed
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/calendar', async (req, res) => {
    try {
      let { tenant_id, from_date, to_date } = req.query;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let query = supabase.from('v_calendar_activities').select('*');
      if (tenant_id) query = query.eq('tenant_id', tenant_id);
      if (from_date) query = query.or(`due_at.is.null,due_at.gte.${from_date}`);
      if (to_date) query = query.or(`due_at.is.null,due_at.lte.${to_date}`);
      query = query.order('due_at', { ascending: true, nullsFirst: false });
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      res.json({ status: 'success', data: { activities: data || [] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/reports/data-quality - Analyze data quality across entities
  /**
   * @openapi
   * /api/reports/data-quality:
   *   get:
   *     summary: Data quality analysis
   *     description: Calculates missing or incomplete fields across core entities.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *     responses:
   *       200:
   *         description: Data quality report
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/data-quality', async (req, res) => {
    try {
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let { tenant_id } = req.query;

      // Helper to analyze a table's data quality using Supabase
      async function analyzeTable(tableName, fields, tenantId) {
        // Get all records for analysis
        let query = supabase.from(tableName).select(fields.join(','));
        if (tenantId) {
          query = query.eq('tenant_id', tenantId);
        }
        const { data, error } = await query;
        
        if (error) {
          logger.error(`Error analyzing ${tableName}:`, error);
          return { total: 0, missingFields: {} };
        }
        
        const records = data || [];
        const total = records.length;
        const missingFields = {};
        
        // Count missing values for each field
        fields.forEach(field => {
          missingFields[field] = records.filter(r => 
            r[field] === null || r[field] === '' || r[field] === undefined
          ).length;
        });
        
        return { total, missingFields };
      }

      // Analyze Contacts
      const contactFields = ['email', 'phone', 'first_name', 'last_name'];
      const contactsAnalysis = await analyzeTable('contacts', contactFields, tenant_id);
      const contactsTotal = contactsAnalysis.total;
      const contactsIssues = Object.values(contactsAnalysis.missingFields).reduce((a, b) => a + b, 0);
      const contactsIssuesPercent = contactsTotal > 0 ? (contactsIssues / (contactsTotal * contactFields.length)) * 100 : 0;

      // Analyze Accounts
      const accountFields = ['name', 'industry', 'website'];
      const accountsAnalysis = await analyzeTable('accounts', accountFields, tenant_id);
      const accountsTotal = accountsAnalysis.total;
      const accountsIssues = Object.values(accountsAnalysis.missingFields).reduce((a, b) => a + b, 0);
      const accountsIssuesPercent = accountsTotal > 0 ? (accountsIssues / (accountsTotal * accountFields.length)) * 100 : 0;

      // Analyze Leads
      const leadFields = ['email', 'phone', 'status', 'source'];
      const leadsAnalysis = await analyzeTable('leads', leadFields, tenant_id);
      const leadsTotal = leadsAnalysis.total;
      const leadsIssues = Object.values(leadsAnalysis.missingFields).reduce((a, b) => a + b, 0);
      const leadsIssuesPercent = leadsTotal > 0 ? (leadsIssues / (leadsTotal * leadFields.length)) * 100 : 0;

      // Analyze Opportunities
      const oppFields = ['account_id', 'stage', 'close_date', 'amount'];
      const oppsAnalysis = await analyzeTable('opportunities', oppFields, tenant_id);
      const oppsTotal = oppsAnalysis.total;
      const oppsIssues = Object.values(oppsAnalysis.missingFields).reduce((a, b) => a + b, 0);
      const oppsIssuesPercent = oppsTotal > 0 ? (oppsIssues / (oppsTotal * oppFields.length)) * 100 : 0;

      // Build response
      const report = {
        contacts: {
          total: contactsTotal,
          issues_count: contactsIssues,
          issues_percentage: Math.round(contactsIssuesPercent * 100) / 100,
          missing_fields: {
            email: contactsAnalysis.missingFields.email || 0,
            phone: contactsAnalysis.missingFields.phone || 0,
            first_name: contactsAnalysis.missingFields.first_name || 0,
            last_name: contactsAnalysis.missingFields.last_name || 0
          }
        },
        accounts: {
          total: accountsTotal,
          issues_count: accountsIssues,
          issues_percentage: Math.round(accountsIssuesPercent * 100) / 100,
          missing_fields: {
            name: accountsAnalysis.missingFields.name || 0,
            industry: accountsAnalysis.missingFields.industry || 0,
            website: accountsAnalysis.missingFields.website || 0
          }
        },
        leads: {
          total: leadsTotal,
          issues_count: leadsIssues,
          issues_percentage: Math.round(leadsIssuesPercent * 100) / 100,
          missing_fields: {
            email: leadsAnalysis.missingFields.email || 0,
            phone: leadsAnalysis.missingFields.phone || 0,
            status: leadsAnalysis.missingFields.status || 0,
            source: leadsAnalysis.missingFields.source || 0
          }
        },
        opportunities: {
          total: oppsTotal,
          issues_count: oppsIssues,
          issues_percentage: Math.round(oppsIssuesPercent * 100) / 100,
          missing_fields: {
            account_id: oppsAnalysis.missingFields.account_id || 0,
            stage: oppsAnalysis.missingFields.stage || 0,
            close_date: oppsAnalysis.missingFields.close_date || 0,
            amount: oppsAnalysis.missingFields.amount || 0
          }
        }
      };

      res.json({ 
        status: 'success', 
        data: { 
          report,
          generated_at: new Date().toISOString()
        } 
      });
    } catch (error) {
      logger.error('Error analyzing data quality:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/reports/export-insights-pdf - Generate AI Insights PDF with data
  router.post('/export-insights-pdf', async (req, res) => {
    let browser;
    try {
      const { tenant_id, tenant_name, industry, business_model, geographic_focus, insights } = req.body;

      if (!insights) {
        return res.status(400).json({ status: 'error', message: 'No insights data provided. Please generate insights first.' });
      }

      // Import puppeteer
      const puppeteer = await import('puppeteer');

      // Launch browser
      browser = await puppeteer.default.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      // Helper to safely get array items
      const safeArray = (arr) => Array.isArray(arr) ? arr : [];
      const safeStr = (str) => str || 'N/A';
      
      // Helper to format large numbers
      const formatLargeNumber = (num) => {
        if (num === null || num === undefined || typeof num !== 'number' || isNaN(num)) return num;
        if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
        if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
        if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
        return num.toFixed(1);
      };

      // Helper to format display value with unit
      const formatDisplayValue = (value, unit) => {
        if (value === null || value === undefined || typeof value !== 'number' || isNaN(value)) return value;
        if (unit && typeof unit === 'string') {
          const lowerUnit = unit.toLowerCase();
          if (lowerUnit.includes("usd") || lowerUnit.includes("dollar")) return "$" + formatLargeNumber(value);
          if (lowerUnit.includes("percent") || lowerUnit === "%") return value.toFixed(1) + "%";
        }
        return value.toLocaleString("en-US", { maximumFractionDigits: 2 }) + (unit ? " " + unit : "");
      };

      // Build comprehensive HTML from insights data
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Executive Market Intelligence Report</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Merriweather:wght@300;400;700&display=swap');
            
            * { box-sizing: border-box; }
            body { 
              font-family: 'Inter', sans-serif; 
              margin: 0; 
              padding: 0; 
              color: #1e293b; 
              background: #fff; 
              line-height: 1.5;
            }
            
            .page-container {
              max-width: 100%;
              margin: 0 auto;
            }

            /* Cover Page */
            .cover-page {
              height: 1123px; /* A4 height approx */
              display: flex;
              flex-direction: column;
              justify-content: center;
              padding: 60px;
              background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
              color: white;
              position: relative;
              page-break-after: always;
            }
            
            .cover-logo {
              font-size: 24px;
              font-weight: 700;
              letter-spacing: 1px;
              margin-bottom: 100px;
              color: #60a5fa;
              text-transform: uppercase;
            }
            
            .cover-title {
              font-family: 'Merriweather', serif;
              font-size: 48px;
              font-weight: 700;
              margin-bottom: 20px;
              line-height: 1.2;
            }
            
            .cover-subtitle {
              font-size: 24px;
              font-weight: 300;
              opacity: 0.9;
              margin-bottom: 60px;
              color: #94a3b8;
            }
            
            .cover-meta {
              margin-top: auto;
              border-top: 1px solid #334155;
              padding-top: 30px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
            }
            
            .cover-meta-item {
              font-size: 14px;
            }
            
            .cover-meta-label {
              color: #64748b;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 5px;
            }
            
            .cover-meta-value {
              font-weight: 600;
              color: white;
            }

            /* Content Pages */
            .content-page {
              padding: 40px 50px;
              background: white;
            }
            
            .header-strip {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #f1f5f9;
              padding-bottom: 15px;
              margin-bottom: 30px;
            }
            
            .header-title {
              font-size: 12px;
              text-transform: uppercase;
              color: #64748b;
              font-weight: 600;
              letter-spacing: 1px;
            }
            
            .section {
              margin-bottom: 40px;
              page-break-inside: avoid;
            }
            
            .section-title {
              font-family: 'Merriweather', serif;
              font-size: 22px;
              font-weight: 700;
              color: #0f172a;
              margin-bottom: 20px;
              padding-bottom: 10px;
              border-bottom: 1px solid #e2e8f0;
              display: flex;
              align-items: center;
              gap: 10px;
            }
            
            .section-icon {
              color: #3b82f6;
            }
            
            .narrative-box {
              font-size: 15px;
              line-height: 1.8;
              color: #334155;
              text-align: justify;
            }
            
            /* SWOT Grid */
            .swot-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin-top: 20px;
            }
            
            .swot-card {
              padding: 20px;
              border-radius: 8px;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
            }
            
            .swot-header {
              display: flex;
              align-items: center;
              gap: 10px;
              margin-bottom: 15px;
              font-weight: 700;
              font-size: 14px;
              text-transform: uppercase;
            }
            
            .swot-strengths .swot-header { color: #059669; }
            .swot-weaknesses .swot-header { color: #dc2626; }
            .swot-opportunities .swot-header { color: #0284c7; }
            .swot-threats .swot-header { color: #d97706; }
            
            .swot-list {
              margin: 0;
              padding-left: 20px;
              font-size: 13px;
              color: #475569;
            }
            
            .swot-list li {
              margin-bottom: 8px;
            }

            /* Indicators */
            .indicators-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 15px;
            }
            
            .indicator-card {
              background: white;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 20px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.02);
            }
            
            .indicator-name {
              font-size: 12px;
              color: #64748b;
              font-weight: 600;
              text-transform: uppercase;
              margin-bottom: 8px;
            }
            
            .indicator-value {
              font-size: 24px;
              font-weight: 700;
              color: #0f172a;
              margin-bottom: 5px;
            }
            
            .indicator-trend {
              font-size: 12px;
              display: flex;
              align-items: center;
              gap: 5px;
            }
            
            .trend-up { color: #16a34a; }
            .trend-down { color: #dc2626; }
            .trend-stable { color: #64748b; }

            /* News */
            .news-item {
              display: flex;
              gap: 15px;
              margin-bottom: 20px;
              padding-bottom: 20px;
              border-bottom: 1px solid #f1f5f9;
            }
            
            .news-date {
              min-width: 100px;
              font-size: 12px;
              color: #94a3b8;
              font-weight: 600;
            }
            
            .news-content h4 {
              margin: 0 0 5px 0;
              font-size: 15px;
              color: #1e293b;
            }
            
            .news-desc {
              font-size: 13px;
              color: #64748b;
              margin: 0;
            }
            
            .sentiment-badge {
              display: inline-block;
              padding: 2px 8px;
              border-radius: 12px;
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              margin-left: 8px;
            }
            
            .sentiment-positive { background: #dcfce7; color: #166534; }
            .sentiment-negative { background: #fee2e2; color: #991b1b; }
            .sentiment-neutral { background: #f1f5f9; color: #475569; }

            /* Recommendations */
            .rec-card {
              background: #f8fafc;
              border-left: 4px solid #3b82f6;
              padding: 20px;
              margin-bottom: 15px;
              border-radius: 0 8px 8px 0;
            }
            
            .rec-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 10px;
            }
            
            .rec-title {
              font-weight: 700;
              color: #1e293b;
              font-size: 15px;
            }
            
            .rec-priority {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              padding: 4px 10px;
              border-radius: 4px;
            }
            
            .priority-high { background: #fee2e2; color: #991b1b; }
            .priority-medium { background: #fef3c7; color: #92400e; }
            .priority-low { background: #dcfce7; color: #166534; }
            
            .rec-desc {
              font-size: 13px;
              color: #475569;
              line-height: 1.6;
            }

            .footer {
              text-align: center;
              font-size: 10px;
              color: #cbd5e1;
              margin-top: 50px;
              padding-top: 20px;
              border-top: 1px solid #f1f5f9;
            }
            
            .badge {
              display: inline-block;
              padding: 4px 12px;
              background: #e0e7ff;
              color: #4338ca;
              border-radius: 16px;
              font-size: 12px;
              font-weight: 500;
              margin-right: 5px;
              margin-bottom: 5px;
            }
          </style>
        </head>
        <body>
          <!-- Cover Page -->
          <div class="cover-page">
            <div class="cover-logo">AISHA CRM INTELLIGENCE</div>
            <div class="cover-title">Executive Market<br>Intelligence Report</div>
            <div class="cover-subtitle">Strategic Analysis & Recommendations</div>
            
            <div class="cover-meta">
              <div class="cover-meta-item">
                <div class="cover-meta-label">Prepared For</div>
                <div class="cover-meta-value">${safeStr(tenant_name)}</div>
              </div>
              <div class="cover-meta-item">
                <div class="cover-meta-label">Date</div>
                <div class="cover-meta-value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
              <div class="cover-meta-item">
                <div class="cover-meta-label">Industry Focus</div>
                <div class="cover-meta-value">${safeStr(industry)}</div>
              </div>
              <div class="cover-meta-item">
                <div class="cover-meta-label">Region</div>
                <div class="cover-meta-value">${safeStr(geographic_focus)}</div>
              </div>
            </div>
          </div>

          <!-- Content Pages -->
          <div class="content-page">
            <div class="header-strip">
              <div class="header-title">Market Intelligence Report</div>
              <div class="header-title">Confidential</div>
            </div>

            <!-- Market Overview -->
            ${insights.market_overview ? `
              <div class="section">
                <div class="section-title">
                  <span class="section-icon">🌐</span> Market Overview
                </div>
                <div class="narrative-box">
                  ${insights.market_overview}
                </div>
              </div>
            `: ''}

            <!-- SWOT Analysis -->
            ${(insights.swot_analysis?.strengths?.length || insights.swot_analysis?.weaknesses?.length || insights.swot_analysis?.opportunities?.length || insights.swot_analysis?.threats?.length) ? `
              <div class="section">
                <div class="section-title">
                  <span class="section-icon">📊</span> SWOT Analysis
                </div>
                <div class="swot-grid">
                  <div class="swot-card swot-strengths">
                    <div class="swot-header">Strengths</div>
                    <ul class="swot-list">
                      ${safeArray(insights.swot_analysis?.strengths).map(s => `<li>${s}</li>`).join('') || '<li>No data</li>'}
                    </ul>
                  </div>
                  <div class="swot-card swot-weaknesses">
                    <div class="swot-header">Weaknesses</div>
                    <ul class="swot-list">
                      ${safeArray(insights.swot_analysis?.weaknesses).map(w => `<li>${w}</li>`).join('') || '<li>No data</li>'}
                    </ul>
                  </div>
                  <div class="swot-card swot-opportunities">
                    <div class="swot-header">Opportunities</div>
                    <ul class="swot-list">
                      ${safeArray(insights.swot_analysis?.opportunities).map(o => `<li>${o}</li>`).join('') || '<li>No data</li>'}
                    </ul>
                  </div>
                  <div class="swot-card swot-threats">
                    <div class="swot-header">Threats</div>
                    <ul class="swot-list">
                      ${safeArray(insights.swot_analysis?.threats).map(t => `<li>${t}</li>`).join('') || '<li>No data</li>'}
                    </ul>
                  </div>
                </div>
              </div>
            `: ''}

            <!-- Competitive Landscape -->
            ${insights.competitive_landscape ? `
              <div class="section">
                <div class="section-title">
                  <span class="section-icon">🏆</span> Competitive Landscape
                </div>
                <div class="narrative-box">
                  <p>${insights.competitive_landscape.overview || ''}</p>
                  
                  ${safeArray(insights.competitive_landscape.major_competitors).length > 0 ? `
                    <div style="margin-top: 20px;">
                      <strong style="display: block; margin-bottom: 10px; font-size: 13px; text-transform: uppercase; color: #64748b;">Major Competitors</strong>
                      <div>
                        ${safeArray(insights.competitive_landscape.major_competitors).map(c => `<span class="badge">${c}</span>`).join('')}
                      </div>
                    </div>
                  `: ''}
                  
                  ${insights.competitive_landscape.market_dynamics ? `
                    <div style="margin-top: 20px; background: #f1f5f9; padding: 15px; border-radius: 6px; font-size: 13px;">
                      <strong>Market Dynamics:</strong> ${insights.competitive_landscape.market_dynamics}
                    </div>
                  `: ''}
                </div>
              </div>
            `: ''}

            <!-- Economic Indicators -->
            ${safeArray(insights.economic_indicators).length > 0 ? `
              <div class="section">
                <div class="section-title">
                  <span class="section-icon">📈</span> Key Economic Indicators
                </div>
                <div class="indicators-grid">
                  ${safeArray(insights.economic_indicators).map(ind => `
                    <div class="indicator-card">
                      <div class="indicator-name">${ind.name || 'Indicator'}</div>
                      <div class="indicator-value">${formatDisplayValue(ind.current_value, ind.unit)}</div>
                      <div class="indicator-trend ${ind.trend === 'up' ? 'trend-up' : ind.trend === 'down' ? 'trend-down' : 'trend-stable'}">
                        ${ind.trend === 'up' ? '▲' : ind.trend === 'down' ? '▼' : '●'} ${ind.trend ? ind.trend.toUpperCase() : 'STABLE'}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `: ''}

            <!-- Major News -->
            ${safeArray(insights.major_news).length > 0 ? `
              <div class="section">
                <div class="section-title">
                  <span class="section-icon">📰</span> Major News & Events
                </div>
                <div>
                  ${safeArray(insights.major_news).slice(0, 5).map(news => `
                    <div class="news-item">
                      <div class="news-date">${news.date || 'Recent'}</div>
                      <div class="news-content">
                        <h4>
                          ${news.title}
                          <span class="sentiment-badge sentiment-${news.impact || 'neutral'}">${news.impact || 'neutral'}</span>
                        </h4>
                        <p class="news-desc">${news.description || ''}</p>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `: ''}

            <!-- Strategic Recommendations -->
            ${safeArray(insights.recommendations).length > 0 ? `
              <div class="section">
                <div class="section-title">
                  <span class="section-icon">⚡</span> Strategic Recommendations
                </div>
                <div>
                  ${safeArray(insights.recommendations).map(rec => `
                    <div class="rec-card">
                      <div class="rec-header">
                        <div class="rec-title">${rec.title}</div>
                        <div class="rec-priority priority-${rec.priority || 'medium'}">${rec.priority || 'MEDIUM'} PRIORITY</div>
                      </div>
                      <div class="rec-desc">${rec.description || ''}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `: ''}

            <div class="footer">
              Generated by Aisha CRM Intelligence • ${new Date().getFullYear()} • Confidential & Proprietary
            </div>
          </div>
        </body>
        </html>
      `;

      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' } // Zero margins because we handle padding in CSS
      });

      const pdfData = Buffer.from(pdfBuffer);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ai_insights_report_${Date.now()}.pdf"`);
      res.setHeader('Content-Length', pdfData.length);
      res.end(pdfData);

    } catch (error) {
      logger.error('Error generating AI insights PDF:', error);
      res.status(500).json({ status: 'error', message: error.message, details: 'Failed to generate PDF report' });
    } finally {
      if (browser) await browser.close();
    }
  });

  // GET /api/reports/export-pdf - Generate PDF report
  /**
   * @openapi
   * /api/reports/export-pdf:
   *   get:
   *     summary: Export report as PDF
   *     description: Generates a PDF for supported report types (e.g., overview, data-quality).
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *       - in: query
   *         name: report_type
   *         schema:
   *           type: string
   *           enum: [overview, dashboard-stats, data-quality]
   *         required: false
   *         description: The type of report to generate
   *     responses:
   *       200:
   *         description: PDF document
   *         content:
   *           application/pdf:
   *             schema:
   *               type: string
   *               format: binary
   *       500:
   *         description: Failed to generate PDF
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/export-pdf', async (req, res) => {
    let browser;
    try {
      const { tenant_id, report_type = 'overview' } = req.query;

      // Import puppeteer
      const puppeteer = await import('puppeteer');

      // Launch browser with appropriate options
      browser = await puppeteer.default.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();

      // Set viewport for consistent rendering
      await page.setViewport({ width: 1200, height: 800 });

      // Generate HTML content based on report type
      let htmlContent = '';
      
      if (report_type === 'overview' || report_type === 'dashboard-stats') {
        // Fetch dashboard stats data
        const statsUrl = new URL(`${req.protocol}://${req.get('host')}/api/reports/dashboard-stats`);
        if (tenant_id) statsUrl.searchParams.append('tenant_id', tenant_id);
        
        const statsResponse = await fetch(statsUrl.toString());
        const statsData = await statsResponse.json();
        const stats = statsData.data || {};

        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Overview Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
              h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
              h2 { color: #1e40af; margin-top: 30px; }
              .header { text-align: center; margin-bottom: 40px; }
              .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
              .stat-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; background: #f9fafb; }
              .stat-value { font-size: 36px; font-weight: bold; color: #1e40af; margin: 10px 0; }
              .stat-label { font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
              .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
              td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>📊 Dashboard Overview Report</h1>
              <p>Generated on ${new Date().toLocaleString()}</p>
            </div>
            
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">Total Contacts</div>
                <div class="stat-value">${stats.total_contacts || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Accounts</div>
                <div class="stat-value">${stats.total_accounts || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Leads</div>
                <div class="stat-value">${stats.total_leads || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Opportunities</div>
                <div class="stat-value">${stats.total_opportunities || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Open Opportunities</div>
                <div class="stat-value">${stats.open_opportunities || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Pipeline Value</div>
                <div class="stat-value">$${(stats.total_pipeline_value || 0).toLocaleString()}</div>
              </div>
            </div>

            <h2>Recent Activities</h2>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${(stats.recent_activities || []).slice(0, 10).map(activity => `
                  <tr>
                    <td>${activity.type || 'N/A'}</td>
                    <td>${activity.subject || 'No subject'}</td>
                    <td>${new Date(activity.created_at).toLocaleDateString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="footer">
              <p>Aisha CRM - Generated automatically</p>
            </div>
          </body>
          </html>
        `;
      } else if (report_type === 'data-quality') {
        // Fetch data quality report
        const qualityUrl = new URL(`${req.protocol}://${req.get('host')}/api/reports/data-quality`);
        if (tenant_id) qualityUrl.searchParams.append('tenant_id', tenant_id);
        
        const qualityResponse = await fetch(qualityUrl.toString());
        const qualityData = await qualityResponse.json();
        const report = qualityData.data?.report || {};

        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Data Quality Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
              h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
              h2 { color: #1e40af; margin-top: 30px; }
              .header { text-align: center; margin-bottom: 40px; }
              .entity-section { margin: 30px 0; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; }
              .quality-score { font-size: 48px; font-weight: bold; margin: 20px 0; }
              .quality-score.good { color: #10b981; }
              .quality-score.warning { color: #f59e0b; }
              .quality-score.poor { color: #ef4444; }
              .missing-fields { margin: 15px 0; }
              .missing-field-item { padding: 8px; margin: 5px 0; background: #fef3c7; border-left: 3px solid #f59e0b; }
              .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>🔍 Data Quality Report</h1>
              <p>Generated on ${new Date().toLocaleString()}</p>
            </div>
            
            ${Object.entries(report).map(([entity, data]) => {
              const qualityPercent = 100 - (data.issues_percentage || 0);
              const qualityClass = qualityPercent >= 80 ? 'good' : qualityPercent >= 60 ? 'warning' : 'poor';
              
              return `
                <div class="entity-section">
                  <h2>${entity.charAt(0).toUpperCase() + entity.slice(1)}</h2>
                  <p><strong>Total Records:</strong> ${data.total || 0}</p>
                  <div class="quality-score ${qualityClass}">
                    ${qualityPercent.toFixed(1)}%
                  </div>
                  <p><strong>Quality Score</strong></p>
                  <p>Records with Issues: ${data.issues_count || 0} (${(data.issues_percentage || 0).toFixed(1)}%)</p>
                  
                  ${data.missing_fields && Object.keys(data.missing_fields).length > 0 ? `
                    <div class="missing-fields">
                      <h3>Missing Fields:</h3>
                      ${Object.entries(data.missing_fields).map(([field, count]) => `
                        <div class="missing-field-item">
                          <strong>${field}:</strong> ${count} records missing
                        </div>
                      `).join('')}
                    </div>
                  ` : '<p>No missing fields detected</p>'}
                </div>
              `;
            }).join('')}

            <div class="footer">
              <p>Aisha CRM - Data Quality Analysis</p>
            </div>
          </body>
          </html>
        `;
      } else if (report_type === 'ai-insights' || report_type === 'insights') {
        // AI Market Insights Report
        // Note: This generates a template for manually-triggered insights
        // The actual insights are generated via /api/mcp/market-insights
        
        // Get tenant info for context
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        
        let tenantInfo = { name: 'Unknown Tenant', industry: 'Not specified' };
        if (tenant_id) {
          const { data: tenantData } = await supabase
            .from('tenant')
            .select('name, industry, business_model, geographic_focus')
            .eq('id', tenant_id)
            .single();
          if (tenantData) {
            tenantInfo = tenantData;
          }
        }

        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>AI Market Insights Report</title>
            <style>
              body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 40px; color: #1e293b; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); }
              .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); overflow: hidden; }
              .header { background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; padding: 40px; text-align: center; }
              .header h1 { margin: 0 0 10px 0; font-size: 32px; font-weight: 700; }
              .header p { margin: 0; opacity: 0.9; font-size: 16px; }
              .content { padding: 40px; }
              .section { margin-bottom: 30px; padding: 25px; background: #f8fafc; border-radius: 12px; border-left: 4px solid #3b82f6; }
              .section h2 { color: #3b82f6; margin: 0 0 15px 0; font-size: 20px; display: flex; align-items: center; gap: 10px; }
              .section h2::before { content: ''; width: 8px; height: 8px; background: #3b82f6; border-radius: 50%; }
              .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
              .info-card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
              .info-card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
              .info-card .value { font-size: 18px; font-weight: 600; color: #1e293b; }
              .note { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin-top: 30px; }
              .note-title { font-weight: 600; color: #92400e; margin-bottom: 5px; }
              .note-text { color: #78350f; font-size: 14px; }
              .footer { text-align: center; padding: 30px; background: #f1f5f9; color: #64748b; font-size: 12px; }
              .badge { display: inline-block; padding: 4px 12px; background: #e0e7ff; color: #4338ca; border-radius: 20px; font-size: 12px; font-weight: 500; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🧠 AI Market Insights Report</h1>
                <p>Powered by Aisha CRM Intelligence</p>
              </div>
              
              <div class="content">
                <div class="info-grid">
                  <div class="info-card">
                    <div class="label">Organization</div>
                    <div class="value">${tenantInfo.name || 'N/A'}</div>
                  </div>
                  <div class="info-card">
                    <div class="label">Industry</div>
                    <div class="value">${tenantInfo.industry || 'Not specified'}</div>
                  </div>
                  <div class="info-card">
                    <div class="label">Business Model</div>
                    <div class="value"><span class="badge">${tenantInfo.business_model || 'B2B'}</span></div>
                  </div>
                  <div class="info-card">
                    <div class="label">Geographic Focus</div>
                    <div class="value">${tenantInfo.geographic_focus || 'North America'}</div>
                  </div>
                </div>

                <div class="section">
                  <h2>Market Overview</h2>
                  <p>AI-generated market analysis provides real-time insights into your industry landscape, competitive positioning, and growth opportunities.</p>
                </div>

                <div class="section">
                  <h2>Key Indicators Tracked</h2>
                  <ul style="color: #475569; line-height: 1.8;">
                    <li><strong>Market Size & Growth</strong> - Current market valuation and projected growth rates</li>
                    <li><strong>Industry Trends</strong> - Emerging patterns and technology adoption</li>
                    <li><strong>Competitive Landscape</strong> - Key players and market positioning</li>
                    <li><strong>Economic Indicators</strong> - GDP impact, employment trends, investment flows</li>
                    <li><strong>Risk Assessment</strong> - Potential threats and mitigation strategies</li>
                    <li><strong>Opportunities</strong> - Actionable growth opportunities for your business</li>
                  </ul>
                </div>

                <div class="note">
                  <div class="note-title">💡 Interactive Insights Available</div>
                  <div class="note-text">
                    For detailed, real-time AI-generated insights including market indicators, trend analysis, 
                    and personalized recommendations, please use the interactive AI Insights dashboard in the 
                    Aisha CRM application. Click "Generate Insights" to get the latest market intelligence.
                  </div>
                </div>
              </div>

              <div class="footer">
                <p>Generated on ${new Date().toLocaleString()}</p>
                <p>Aisha CRM - AI-Powered Customer Relationship Management</p>
              </div>
            </div>
          </body>
          </html>
        `;
      } else {
        throw new Error(`Unsupported report type: ${report_type}`);
      }

      // Set HTML content
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      // Convert to Buffer if needed (puppeteer returns Uint8Array in newer versions)
      const pdfData = Buffer.from(pdfBuffer);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report_type}_report_${Date.now()}.pdf"`);
      res.setHeader('Content-Length', pdfData.length);

      // Send PDF as binary
      res.end(pdfData);

    } catch (error) {
      logger.error('Error generating PDF:', error);
      res.status(500).json({ 
        status: 'error', 
        message: error.message,
        details: 'Failed to generate PDF report'
      });
    } finally {
      // Always close the browser
      if (browser) {
        await browser.close();
      }
    }
  });

  return router;
}
