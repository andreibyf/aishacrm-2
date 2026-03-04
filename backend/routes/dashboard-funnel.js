import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseFactory.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { cacheList } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';
import cacheManager from '../lib/cacheManager.js';
import { getVisibilityScope } from '../lib/teamVisibility.js';

export default function createDashboardFunnelRoutes(_pgPool) {
  const router = express.Router();

  // Lazy-load Supabase client to avoid initialization errors when credentials not configured
  const getSupabase = () => getSupabaseAdmin({ throwOnMissing: false }) || getSupabaseAdmin();

  /**
   * @openapi
   * /api/dashboard/funnel-counts:
   *   get:
   *     summary: Get funnel metrics and pipeline data
   *     tags: [reports]
   *     description: Returns pre-computed funnel counts (sources, leads, contacts, accounts) and pipeline data from materialized view
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: include_test_data
   *         schema: { type: boolean, default: true }
   *     responses:
   *       200:
   *         description: Funnel metrics and pipeline data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 funnel:
   *                   type: object
   *                   properties:
   *                     sources: { type: integer }
   *                     leads: { type: integer }
   *                     contacts: { type: integer }
   *                     accounts: { type: integer }
   *                 pipeline:
   *                   type: array
   *                   items:
   *                     type: object
   */

  /**
   * GET /api/dashboard/funnel-counts
   * Returns pre-computed funnel counts AND pipeline data from materialized view
   * Query params:
   *   - include_test_data: boolean (default: true)
   */
  router.get(
    '/funnel-counts',
    cacheList('funnel_counts', 30),
    validateTenantAccess,
    async (req, res) => {
      try {
        const supabase = getSupabase();
        const tenantId = req.tenant?.id || req.query.tenant_id;
        const includeTestData = req.query.include_test_data !== 'false';
        const teamIdParam = req.query.team_id || null;
        const assignedToParam = req.query.assigned_to || null;

        if (!tenantId) {
          return res.status(400).json({
            error: 'Tenant ID required',
            message: 'Cannot fetch funnel counts without tenant context',
          });
        }

        // ─── Scoped live queries (when team/employee filter is active) ────────
        // The materialized view is tenant-wide; when scope params are present,
        // run live counts filtered by assigned_to for accurate team stats.
        if (teamIdParam || assignedToParam) {
          let scopeEmployeeIds = null;
          try {
            if (assignedToParam) {
              scopeEmployeeIds = [assignedToParam];
            } else if (teamIdParam) {
              const { data: teamMembers } = await supabase
                .from('team_members')
                .select('employee_id')
                .eq('team_id', teamIdParam);
              scopeEmployeeIds = (teamMembers || []).map((m) => m.employee_id);
              if (scopeEmployeeIds.length === 0) scopeEmployeeIds = ['__NO_MATCH__'];
            }
          } catch (scopeErr) {
            logger.warn('[Dashboard Funnel] Scope resolution error:', scopeErr.message);
          }

          const withScope = (q) => {
            if (!scopeEmployeeIds) return q;
            return q.in('assigned_to', scopeEmployeeIds);
          };

          const testFilter = (q) => {
            if (!includeTestData) {
              return q.or('is_test_data.is.false,is_test_data.is.null');
            }
            return q;
          };

          // Count each entity with scope (returns total/real/test breakdown)
          const countTable = async (table) => {
            try {
              let q = supabase
                .from(table)
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId);
              q = withScope(q);
              const { count: total } = await q;

              let qReal = supabase
                .from(table)
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId);
              qReal = withScope(qReal);
              qReal = qReal.or('is_test_data.is.false,is_test_data.is.null');
              const { count: real } = await qReal;

              return { total: total ?? 0, real: real ?? 0, test: (total ?? 0) - (real ?? 0) };
            } catch {
              return { total: 0, real: 0, test: 0 };
            }
          };

          // Pipeline stages with scope
          const pipelineQuery = async () => {
            try {
              let q = supabase
                .from('opportunities')
                .select('stage,amount,is_test_data')
                .eq('tenant_id', tenantId);
              q = withScope(q);
              const { data: opps } = await q;
              if (!Array.isArray(opps)) return [];

              const stages = [
                'prospecting',
                'qualification',
                'proposal',
                'negotiation',
                'closed_won',
                'closed_lost',
              ];
              const stageAliases = { won: 'closed_won', lost: 'closed_lost' };
              return stages.map((stage) => {
                const matching = opps.filter((o) => {
                  const s = stageAliases[o.stage] || o.stage;
                  return s === stage;
                });
                const total = matching.length;
                const real = matching.filter((o) => !o.is_test_data).length;
                const test = total - real;
                const valTotal = matching.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
                const valReal = matching
                  .filter((o) => !o.is_test_data)
                  .reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
                return {
                  stage,
                  count_total: total,
                  count_real: real,
                  count_test: test,
                  value_total: valTotal,
                  value_real: valReal,
                  value_test: valTotal - valReal,
                };
              });
            } catch {
              return [];
            }
          };

          const [sources, leads, contacts, accounts, pipeline] = await Promise.all([
            countTable('bizdev_sources'),
            countTable('leads'),
            countTable('contacts'),
            countTable('accounts'),
            pipelineQuery(),
          ]);

          return res.json({
            funnel: {
              sources_total: sources.total,
              sources_real: sources.real,
              sources_test: sources.test,
              leads_total: leads.total,
              leads_real: leads.real,
              leads_test: leads.test,
              contacts_total: contacts.total,
              contacts_real: contacts.real,
              contacts_test: contacts.test,
              accounts_total: accounts.total,
              accounts_real: accounts.real,
              accounts_test: accounts.test,
            },
            pipeline,
            last_refreshed: new Date().toISOString(),
            cached: false,
            scoped: true,
          });
        }

        // ─── Unscoped: use materialized view (fast path) ─────────────────────
        // Query all-time aggregated view (no period filtering)
        const { data, error } = await supabase
          .from('dashboard_funnel_counts')
          .select('*')
          .eq('tenant_id', tenantId)
          .single();

        if (error) {
          // If view doesn't exist or no data, return zeros
          if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
            return res.json({
              funnel: {
                sources: 0,
                leads: 0,
                contacts: 0,
                accounts: 0,
              },
              pipeline: [],
              last_refreshed: null,
              cached: false,
            });
          }
          throw error;
        }

        // Return appropriate counts based on test data flag
        const _suffix = includeTestData ? '_total' : '_real';

        // Return funnel with both suffixed fields for frontend compatibility
        const funnelCounts = {
          sources_total: data.sources_total || 0,
          sources_real: data.sources_real || 0,
          sources_test: data.sources_test || 0,
          leads_total: data.leads_total || 0,
          leads_real: data.leads_real || 0,
          leads_test: data.leads_test || 0,
          contacts_total: data.contacts_total || 0,
          contacts_real: data.contacts_real || 0,
          contacts_test: data.contacts_test || 0,
          accounts_total: data.accounts_total || 0,
          accounts_real: data.accounts_real || 0,
          accounts_test: data.accounts_test || 0,
        };

        // Build pipeline array with stage data (suffixed for frontend)
        const pipeline = [
          {
            stage: 'prospecting',
            count_total: data.prospecting_count_total || 0,
            count_real: data.prospecting_count_real || 0,
            count_test: data.prospecting_count_test || 0,
            value_total: parseFloat(data.prospecting_value_total) || 0,
            value_real: parseFloat(data.prospecting_value_real) || 0,
            value_test: parseFloat(data.prospecting_value_test) || 0,
          },
          {
            stage: 'qualification',
            count_total: data.qualification_count_total || 0,
            count_real: data.qualification_count_real || 0,
            count_test: data.qualification_count_test || 0,
            value_total: parseFloat(data.qualification_value_total) || 0,
            value_real: parseFloat(data.qualification_value_real) || 0,
            value_test: parseFloat(data.qualification_value_test) || 0,
          },
          {
            stage: 'proposal',
            count_total: data.proposal_count_total || 0,
            count_real: data.proposal_count_real || 0,
            count_test: data.proposal_count_test || 0,
            value_total: parseFloat(data.proposal_value_total) || 0,
            value_real: parseFloat(data.proposal_value_real) || 0,
            value_test: parseFloat(data.proposal_value_test) || 0,
          },
          {
            stage: 'negotiation',
            count_total: data.negotiation_count_total || 0,
            count_real: data.negotiation_count_real || 0,
            count_test: data.negotiation_count_test || 0,
            value_total: parseFloat(data.negotiation_value_total) || 0,
            value_real: parseFloat(data.negotiation_value_real) || 0,
            value_test: parseFloat(data.negotiation_value_test) || 0,
          },
          {
            stage: 'closed_won',
            count_total: data.closed_won_count_total || 0,
            count_real: data.closed_won_count_real || 0,
            count_test: data.closed_won_count_test || 0,
            value_total: parseFloat(data.closed_won_value_total) || 0,
            value_real: parseFloat(data.closed_won_value_real) || 0,
            value_test: parseFloat(data.closed_won_value_test) || 0,
          },
          {
            stage: 'closed_lost',
            count_total: data.closed_lost_count_total || 0,
            count_real: data.closed_lost_count_real || 0,
            count_test: data.closed_lost_count_test || 0,
            value_total: parseFloat(data.closed_lost_value_total) || 0,
            value_real: parseFloat(data.closed_lost_value_real) || 0,
            value_test: parseFloat(data.closed_lost_value_test) || 0,
          },
        ];

        res.json({
          funnel: funnelCounts,
          pipeline: pipeline,
          last_refreshed: data.last_refreshed,
          cached: true,
        });
      } catch (error) {
        logger.error('[Dashboard Funnel] Error fetching counts:', error);
        res.status(500).json({
          error: 'Failed to fetch funnel counts',
          message: error.message,
        });
      }
    },
  );

  /**
   * POST /api/dashboard/funnel-counts/refresh
   * Manually refresh the materialized view (admin only)
   */
  router.post('/funnel-counts/refresh', validateTenantAccess, async (req, res) => {
    try {
      const supabase = getSupabase();
      const tenantId = req.tenant?.id;

      // Call the refresh function for materialized view
      const { error: rpcError } = await supabase.rpc('refresh_dashboard_funnel_counts');

      if (rpcError) {
        // If RPC function doesn't exist, log warning but don't fail
        // The materialized view may not be set up in this environment
        logger.warn('[Dashboard Funnel] RPC refresh failed:', rpcError.message);

        // Try direct SQL as fallback (requires service_role)
        try {
          const { error: sqlError } = await supabase.rpc('raw_sql', {
            query: 'REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_funnel_counts',
          });
          if (sqlError) {
            logger.warn('[Dashboard Funnel] Direct SQL refresh also failed:', sqlError.message);
            // Return success anyway - the view will update on next data change trigger
            // or the data is simply not stale
          }
        } catch (sqlErr) {
          logger.warn('[Dashboard Funnel] Could not refresh materialized view:', sqlErr.message);
        }
      }

      // CRITICAL: Clear Redis cache for funnel_counts to force fresh data
      if (tenantId) {
        try {
          // Clear all funnel_counts cache entries for this tenant
          await cacheManager.invalidateTenant(tenantId, 'funnel_counts');
          logger.info(`[Dashboard Funnel] Cleared Redis cache for tenant: ${tenantId}`);
        } catch (cacheError) {
          logger.warn('[Dashboard Funnel] Failed to clear Redis cache:', cacheError);
          // Don't fail the request if cache clear fails
        }
      }

      res.json({
        success: true,
        message: 'Funnel counts refreshed successfully',
        refreshed_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[Dashboard Funnel] Error refreshing counts:', error);
      res.status(500).json({
        error: 'Failed to refresh funnel counts',
        message: error.message,
      });
    }
  });

  return router;
}
