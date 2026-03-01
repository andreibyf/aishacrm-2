/**
 * Reports v2 API Routes
 *
 * Enhanced reporting endpoints with AI-powered analytics:
 * - Trend analysis and predictions
 * - AI-generated insights and recommendations
 * - Performance scoring and health indicators
 *
 * All endpoints return aiContext with predictions and suggestions.
 */

import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import {
  calculatePipelineHealth,
  calculateLeadHealth,
  generateDashboardSuggestions,
  generateDashboardInsights,
  buildDashboardAiContext,
  warnIfSlow,
  safeCount,
} from '../lib/reportAnalytics/index.js';

const BUNDLE_TTL_MS = 60_000; // 60 seconds cache

// In-memory cache for v2 bundles
const v2BundleCache = new Map();

export default function createReportsV2Router(_pgPool) {
  const router = Router();

  /**
   * @openapi
   * /api/v2/reports/dashboard-bundle:
   *   get:
   *     summary: Enhanced dashboard bundle with AI insights
   *     description: Returns dashboard metrics with AI-powered predictions, health scores, and recommendations.
   *     tags: [reports-v2]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *       - in: query
   *         name: include_test_data
   *         schema:
   *           type: boolean
   *           default: true
   *         required: false
   *         description: Include test data in counts
   *       - in: query
   *         name: bust_cache
   *         schema:
   *           type: boolean
   *           default: false
   *         required: false
   *         description: Bypass cache for fresh data
   *     responses:
   *       200:
   *         description: Dashboard bundle with AI context
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     stats:
   *                       type: object
   *                     lists:
   *                       type: object
   *                     aiContext:
   *                       type: object
   *                     meta:
   *                       type: object
   */
  router.get('/dashboard-bundle', async (req, res) => {
    try {
      let { tenant_id } = req.query;
      // Normalize: treat "null" string or empty/undefined as no tenant filter (superadmin global)
      if (tenant_id === 'null' || tenant_id === '' || !tenant_id) {
        tenant_id = undefined;
      }
      const includeTestData = (req.query.include_test_data ?? 'true') !== 'false';
      const bustCache = req.query.bust_cache === 'true';
      // OPTIMIZATION: Dashboard doesn't need AI enrichment on first load (adds 100-150ms)
      // Can be fetched separately with ?include_ai=true if needed
      const includeAi = req.query.include_ai === 'true';

      const effectiveTenantKey = tenant_id || 'SUPERADMIN_GLOBAL';
      const cacheKey = `v2::${effectiveTenantKey}::include=${includeTestData ? 'true' : 'false'}::ai=${includeAi ? 'true' : 'false'}`;
      const now = Date.now();

      // Check cache
      const cached = v2BundleCache.get(cacheKey);
      if (!bustCache && cached && cached.expiresAt > now) {
        return res.json({ status: 'success', data: cached.data, cached: true });
      }

      const supabase = getSupabaseClient();
      const commonOpts = { includeTestData, countMode: 'exact', confirmSmallCounts: false };

      // Fetch all counts in parallel
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceISO = since.toISOString();

      const [
        totalContacts,
        totalAccounts,
        totalLeads,
        totalOpportunities,
        openLeads,
        wonOpportunities,
        openOpportunities,
        allOpportunitiesForPipeline,
        newLeadsLast30Days,
        activitiesLast30Days,
        recentActivities,
        recentLeads,
        recentOpportunities,
      ] = await Promise.all([
        safeCount(null, 'contacts', tenant_id, undefined, commonOpts),
        safeCount(null, 'accounts', tenant_id, undefined, commonOpts),
        safeCount(null, 'leads', tenant_id, undefined, commonOpts),
        safeCount(null, 'opportunities', tenant_id, undefined, commonOpts),
        safeCount(
          null,
          'leads',
          tenant_id,
          (q) => q.not('status', 'in', '("converted","lost")'),
          commonOpts,
        ),
        safeCount(
          null,
          'opportunities',
          tenant_id,
          (q) => q.in('stage', ['won', 'closed_won']),
          commonOpts,
        ),
        safeCount(
          null,
          'opportunities',
          tenant_id,
          (q) => q.not('stage', 'in', '("won","closed_won","lost","closed_lost")'),
          commonOpts,
        ),
        // Fetch ALL opportunities for pipeline calculation
        (async () => {
          try {
            let q = supabase.from('opportunities').select('id,name,amount,stage,created_date');
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try {
                q = q.or('is_test_data.is.false,is_test_data.is.null');
              } catch {
                /* ignore */ void 0;
              }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch {
            return [];
          }
        })(),
        // New leads last 30 days (use created_date with created_at fallback for NULL created_date)
        (async () => {
          try {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true });
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            // COALESCE logic: match leads where created_date >= since OR (created_date is NULL AND created_at >= since)
            q = q.or(
              `created_date.gte.${sinceISO},and(created_date.is.null,created_at.gte.${sinceISO})`,
            );
            if (!includeTestData) {
              // PostgREST ANDs multiple or= params, so this is safe to chain
              try {
                q = q.or('is_test_data.is.false,is_test_data.is.null');
              } catch {
                /* ignore */ void 0;
              }
            }
            const { count } = await q;
            return count ?? 0;
          } catch {
            return 0;
          }
        })(),
        // Activities last 30 days (use created_date with created_at fallback for NULL created_date)
        (async () => {
          try {
            let q = supabase.from('activities').select('*', { count: 'exact', head: true });
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            q = q.or(
              `created_date.gte.${sinceISO},and(created_date.is.null,created_at.gte.${sinceISO})`,
            );
            if (!includeTestData) {
              try {
                q = q.or('is_test_data.is.false,is_test_data.is.null');
              } catch {
                /* ignore */ void 0;
              }
            }
            const { count } = await q;
            return count ?? 0;
          } catch {
            return 0;
          }
        })(),
        // Recent activities
        (async () => {
          try {
            let q = supabase
              .from('activities')
              .select('id,type,subject,status,created_at,created_date,assigned_to')
              .order('created_at', { ascending: false })
              .limit(10);
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try {
                q = q.or('is_test_data.is.false,is_test_data.is.null');
              } catch {
                /* ignore */ void 0;
              }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch {
            return [];
          }
        })(),
        // Recent leads
        (async () => {
          try {
            let q = supabase
              .from('leads')
              .select('id,first_name,last_name,company,created_date,created_at,status')
              .order('created_at', { ascending: false })
              .limit(5);
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try {
                q = q.or('is_test_data.is.false,is_test_data.is.null');
              } catch {
                /* ignore */ void 0;
              }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch {
            return [];
          }
        })(),
        // Recent opportunities
        (async () => {
          try {
            let q = supabase
              .from('opportunities')
              .select('id,name,amount,stage,updated_at')
              .order('updated_at', { ascending: false })
              .limit(5);
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try {
                q = q.or('is_test_data.is.false,is_test_data.is.null');
              } catch {
                /* ignore */ void 0;
              }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch {
            return [];
          }
        })(),
        // All opportunities for pipeline value calculation (needed for accurate metrics)
        (async () => {
          try {
            let q = supabase.from('opportunities').select('amount,stage');
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try {
                q = q.or('is_test_data.is.false,is_test_data.is.null');
              } catch {
                /* ignore */ void 0;
              }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch {
            return [];
          }
        })(),
      ]);

      // Extract all opportunities data
      const allOpportunities = allOpportunitiesForPipeline || [];

      // Calculate pipeline value from ALL opportunities data
      const pipelineValue = allOpportunities.reduce((sum, opp) => {
        // Only include active opportunities (not won or closed_lost)
        if (
          opp.stage !== 'won' &&
          opp.stage !== 'closed_won' &&
          opp.stage !== 'lost' &&
          opp.stage !== 'closed_lost'
        ) {
          const amount = parseFloat(opp.amount) || 0;
          return sum + amount;
        }
        return sum;
      }, 0);

      const wonValue = allOpportunities.reduce((sum, opp) => {
        // Only include won opportunities
        if (opp.stage === 'won' || opp.stage === 'closed_won') {
          const amount = parseFloat(opp.amount) || 0;
          return sum + amount;
        }
        return sum;
      }, 0);

      // Debug: log if we have opportunities but no pipeline value
      if (allOpportunities.length > 0 && pipelineValue === 0) {
        logger.warn('[reports.v2] WARNING: Opportunities found but pipelineValue=0', {
          tenantId: tenant_id,
          opportunitiesCount: allOpportunities.length,
          sample: allOpportunities.slice(0, 2),
          stages: allOpportunities.map((o) => ({
            stage: o.stage,
            amount: o.amount,
            type: typeof o.amount,
          })),
        });
      }

      const stats = {
        totalContacts,
        totalAccounts,
        totalLeads,
        totalOpportunities,
        openLeads,
        wonOpportunities,
        openOpportunities,
        newLeadsLast30Days,
        activitiesLast30Days,
        pipelineValue,
        wonValue,
      };

      // Build AI context only if requested (adds 100-150ms processing time)
      // This allows dashboard to load fast without AI enrichment,
      // and fetch it separately if UI needs it later
      const aiContext = includeAi ? await buildDashboardAiContext(stats, tenant_id) : null;

      const bundle = {
        stats,
        lists: {
          recentActivities,
          recentLeads,
          recentOpportunities,
        },
        aiContext,
        meta: {
          tenant_id: tenant_id || null,
          generated_at: new Date().toISOString(),
          ttl_seconds: Math.round(BUNDLE_TTL_MS / 1000),
          api_version: 'v2',
          includeAi,
        },
      };

      // Cache the result
      v2BundleCache.set(cacheKey, { data: bundle, expiresAt: now + BUNDLE_TTL_MS });

      res.json({ status: 'success', data: bundle, cached: false });
    } catch (error) {
      logger.error('[reports.v2] dashboard-bundle error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/v2/reports/health-summary:
   *   get:
   *     summary: AI-powered CRM health summary
   *     description: Returns overall CRM health analysis with AI recommendations.
   *     tags: [reports-v2]
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
   *         description: Health summary with AI context
   */
  router.get('/health-summary', async (req, res) => {
    const startTime = Date.now();

    try {
      const { tenant_id } = req.query;
      const supabase = getSupabaseClient();

      // Fetch data for health analysis
      const [
        totalContacts,
        totalAccounts,
        totalLeads,
        totalOpportunities,
        pipelineData,
        leadStatusData,
        recentActivitiesCount,
      ] = await Promise.all([
        safeCount(null, 'contacts', tenant_id),
        safeCount(null, 'accounts', tenant_id),
        safeCount(null, 'leads', tenant_id),
        safeCount(null, 'opportunities', tenant_id),
        (async () => {
          try {
            let q = supabase.from('v_opportunity_pipeline_by_stage').select('stage, count');
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            const { data } = await q;
            return data || [];
          } catch {
            return [];
          }
        })(),
        (async () => {
          try {
            let q = supabase.from('v_lead_counts_by_status').select('status, count');
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            const { data } = await q;
            return data || [];
          } catch {
            return [];
          }
        })(),
        (async () => {
          const since = new Date();
          since.setDate(since.getDate() - 30);
          const sinceISO = since.toISOString();
          // Use COALESCE logic: created_date >= since OR (created_date is NULL AND created_at >= since)
          return safeCount(null, 'activities', tenant_id, (q) =>
            q.or(
              `created_date.gte.${sinceISO},and(created_date.is.null,created_at.gte.${sinceISO})`,
            ),
          );
        })(),
      ]);

      const stats = {
        totalContacts,
        totalAccounts,
        totalLeads,
        totalOpportunities,
        activitiesLast30Days: recentActivitiesCount,
      };

      const pipelineHealth = calculatePipelineHealth(pipelineData);
      const leadHealth = calculateLeadHealth(leadStatusData);

      // Calculate overall score
      let overallScore = 0;
      let weightSum = 0;
      if (pipelineHealth.status !== 'no_data') {
        overallScore += pipelineHealth.score * 0.4;
        weightSum += 0.4;
      }
      if (leadHealth.status !== 'no_data') {
        overallScore += leadHealth.score * 0.4;
        weightSum += 0.4;
      }
      // Activity health (simple heuristic)
      const activityScore = Math.min(100, recentActivitiesCount * 3);
      overallScore += activityScore * 0.2;
      weightSum += 0.2;

      const normalizedScore = weightSum > 0 ? Math.round(overallScore / weightSum) : 0;

      // Determine overall status
      let overallStatus = 'critical';
      if (normalizedScore >= 75) overallStatus = 'healthy';
      else if (normalizedScore >= 50) overallStatus = 'needs_attention';
      else if (normalizedScore >= 25) overallStatus = 'at_risk';

      const suggestions = generateDashboardSuggestions(stats, pipelineHealth, leadHealth);
      const insights = generateDashboardInsights(stats, pipelineHealth, leadHealth);

      const processingTime = Date.now() - startTime;
      warnIfSlow('health-summary', processingTime);

      const response = {
        status: 'success',
        data: {
          health: {
            overall: {
              score: normalizedScore,
              status: overallStatus,
              grade:
                normalizedScore >= 90
                  ? 'A'
                  : normalizedScore >= 80
                    ? 'B'
                    : normalizedScore >= 70
                      ? 'C'
                      : normalizedScore >= 60
                        ? 'D'
                        : 'F',
            },
            pipeline: pipelineHealth,
            leads: leadHealth,
            activity: {
              score: activityScore,
              status:
                activityScore >= 70 ? 'healthy' : activityScore >= 40 ? 'needs_attention' : 'low',
              count30Days: recentActivitiesCount,
            },
          },
          aiContext: {
            confidence: 0.85,
            suggestions: suggestions.slice(0, 5), // Top 5 suggestions
            insights,
            processingTime,
          },
          stats,
          meta: {
            tenant_id: tenant_id || null,
            generated_at: new Date().toISOString(),
            api_version: 'v2',
          },
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('[reports.v2] health-summary error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/v2/reports/clear-cache:
   *   post:
   *     summary: Clear v2 reports cache
   *     description: Clears the in-memory cache for v2 report bundles.
   *     tags: [reports-v2]
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *     responses:
   *       200:
   *         description: Cache cleared successfully
   */
  router.post('/clear-cache', async (req, res) => {
    try {
      const { tenant_id } = req.body;

      if (tenant_id) {
        // Clear specific tenant cache
        for (const key of v2BundleCache.keys()) {
          if (key.includes(tenant_id)) {
            v2BundleCache.delete(key);
          }
        }
      } else {
        // Clear all cache
        v2BundleCache.clear();
      }

      res.json({
        status: 'success',
        message: `V2 cache cleared${tenant_id ? ' for tenant ' + tenant_id : ' (all tenants)'}`,
        data: { cleared: true, remaining: v2BundleCache.size },
      });
    } catch (error) {
      logger.error('[reports.v2] clear-cache error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  return router;
}
