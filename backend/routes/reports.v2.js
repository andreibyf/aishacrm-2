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

const ENABLE_AI_ENRICHMENT = process.env.AI_ENRICHMENT_ENABLED !== 'false';
const SLOW_THRESHOLD_MS = parseInt(process.env.AI_CONTEXT_SLOW_THRESHOLD_MS || '500', 10);
const BUNDLE_TTL_MS = 60_000; // 60 seconds cache

// In-memory cache for v2 bundles
const v2BundleCache = new Map();

/**
 * Log warning if processing exceeds threshold
 */
function warnIfSlow(operation, processingTime) {
  if (processingTime > SLOW_THRESHOLD_MS) {
    logger.warn(`[reports.v2] SLOW: ${operation} took ${processingTime}ms (threshold: ${SLOW_THRESHOLD_MS}ms)`);
  }
}

/**
 * Create stub AI context when enrichment is disabled or fails
 */
function createStubAiContext(startTime, error = null) {
  return {
    confidence: 0,
    suggestions: [],
    predictions: null,
    insights: error ? [`AI enrichment unavailable: ${error}`] : ['AI enrichment disabled'],
    trends: null,
    healthScore: null,
    processingTime: Date.now() - startTime,
    _stub: true,
  };
}

/**
 * Calculate pipeline health based on stage distribution
 */
function calculatePipelineHealth(stages) {
  if (!stages || stages.length === 0) return { score: 0, status: 'no_data' };
  
  const total = stages.reduce((sum, s) => sum + (parseInt(s.count) || 0), 0);
  if (total === 0) return { score: 0, status: 'no_data' };
  
  // Healthy pipeline should have good distribution across stages
  const wonStages = stages.filter(s => 
    ['won', 'closed_won', 'closed'].includes(s.stage?.toLowerCase())
  );
  const lostStages = stages.filter(s => 
    ['lost', 'closed_lost'].includes(s.stage?.toLowerCase())
  );
  const activeStages = stages.filter(s => 
    !['won', 'closed_won', 'closed', 'lost', 'closed_lost'].includes(s.stage?.toLowerCase())
  );
  
  const wonCount = wonStages.reduce((sum, s) => sum + (parseInt(s.count) || 0), 0);
  const lostCount = lostStages.reduce((sum, s) => sum + (parseInt(s.count) || 0), 0);
  const activeCount = activeStages.reduce((sum, s) => sum + (parseInt(s.count) || 0), 0);
  
  // Calculate win rate for closed deals
  const closedTotal = wonCount + lostCount;
  const winRate = closedTotal > 0 ? wonCount / closedTotal : 0;
  
  // Score based on: win rate (50%), active pipeline (30%), distribution (20%)
  let score = 0;
  score += winRate * 50; // Up to 50 points for win rate
  score += Math.min(30, (activeCount / Math.max(total, 1)) * 100); // Up to 30 for active pipeline
  score += activeStages.length >= 3 ? 20 : (activeStages.length * 7); // Up to 20 for stage diversity
  
  let status = 'critical';
  if (score >= 75) status = 'healthy';
  else if (score >= 50) status = 'needs_attention';
  else if (score >= 25) status = 'at_risk';
  
  return { score: Math.round(score), status, winRate: Math.round(winRate * 100) };
}

/**
 * Calculate lead conversion health
 */
function calculateLeadHealth(statuses) {
  if (!statuses || statuses.length === 0) return { score: 0, status: 'no_data' };
  
  const total = statuses.reduce((sum, s) => sum + (parseInt(s.count) || 0), 0);
  if (total === 0) return { score: 0, status: 'no_data' };
  
  const converted = statuses.find(s => s.status?.toLowerCase() === 'converted');
  const qualified = statuses.find(s => s.status?.toLowerCase() === 'qualified');
  const contacted = statuses.find(s => s.status?.toLowerCase() === 'contacted');
  const newLeads = statuses.find(s => s.status?.toLowerCase() === 'new');
  
  const convertedCount = parseInt(converted?.count) || 0;
  const qualifiedCount = parseInt(qualified?.count) || 0;
  const contactedCount = parseInt(contacted?.count) || 0;
  const newCount = parseInt(newLeads?.count) || 0;
  
  // Conversion rate
  const conversionRate = convertedCount / Math.max(total, 1);
  
  // Lead progression score (are leads moving through pipeline?)
  const progressionScore = (qualifiedCount + contactedCount) / Math.max(total - convertedCount, 1);
  
  // Stagnation indicator (too many new, unworked leads)
  const stagnationRisk = newCount / Math.max(total, 1);
  
  // Calculate overall score
  let score = 0;
  score += conversionRate * 40; // Up to 40 for conversion
  score += progressionScore * 35; // Up to 35 for progression
  score += (1 - stagnationRisk) * 25; // Up to 25 for low stagnation
  score = Math.min(100, score * 100);
  
  let status = 'critical';
  if (score >= 70) status = 'healthy';
  else if (score >= 45) status = 'needs_attention';
  else if (score >= 20) status = 'at_risk';
  
  return { 
    score: Math.round(score), 
    status, 
    conversionRate: Math.round(conversionRate * 100),
    stagnationRisk: Math.round(stagnationRisk * 100),
  };
}

/**
 * Generate AI suggestions based on dashboard data
 */
function generateDashboardSuggestions(stats, pipelineHealth, leadHealth) {
  const suggestions = [];
  
  // Pipeline suggestions
  if (pipelineHealth.status === 'at_risk' || pipelineHealth.status === 'critical') {
    suggestions.push({
      action: 'review_stalled_opportunities',
      priority: 'high',
      reason: `Pipeline health is ${pipelineHealth.status} (score: ${pipelineHealth.score}/100)`,
      confidence: 0.85,
      category: 'pipeline',
    });
  }
  
  if (pipelineHealth.winRate !== undefined && pipelineHealth.winRate < 30) {
    suggestions.push({
      action: 'analyze_lost_deals',
      priority: 'high',
      reason: `Win rate is ${pipelineHealth.winRate}% - analyze lost opportunities`,
      confidence: 0.9,
      category: 'pipeline',
    });
  }
  
  // Lead suggestions
  if (leadHealth.stagnationRisk > 50) {
    suggestions.push({
      action: 'work_new_leads',
      priority: 'high',
      reason: `${leadHealth.stagnationRisk}% of leads are unworked - prioritize outreach`,
      confidence: 0.9,
      category: 'leads',
    });
  }
  
  if (leadHealth.conversionRate < 10) {
    suggestions.push({
      action: 'improve_qualification',
      priority: 'medium',
      reason: `Low conversion rate (${leadHealth.conversionRate}%) - review lead sources`,
      confidence: 0.75,
      category: 'leads',
    });
  }
  
  // Activity suggestions
  if (stats.activitiesLast30Days < 10) {
    suggestions.push({
      action: 'increase_activity',
      priority: 'medium',
      reason: 'Low activity volume in last 30 days',
      confidence: 0.8,
      category: 'activities',
    });
  }
  
  // Contact/Account ratio
  if (stats.totalContacts > 0 && stats.totalAccounts > 0) {
    const ratio = stats.totalContacts / stats.totalAccounts;
    if (ratio < 1.5) {
      suggestions.push({
        action: 'add_more_contacts',
        priority: 'low',
        reason: `Low contacts-per-account ratio (${ratio.toFixed(1)})`,
        confidence: 0.65,
        category: 'data_quality',
      });
    }
  }
  
  return suggestions;
}

/**
 * Generate insights from dashboard data
 */
function generateDashboardInsights(stats, pipelineHealth, leadHealth) {
  const insights = [];
  
  // Overall data health
  const totalRecords = (stats.totalContacts || 0) + (stats.totalAccounts || 0) + 
                       (stats.totalLeads || 0) + (stats.totalOpportunities || 0);
  
  if (totalRecords === 0) {
    insights.push('No CRM data found - start by adding leads or accounts');
    return insights;
  }
  
  // Pipeline insights
  if (pipelineHealth.score !== undefined) {
    insights.push(`Pipeline health score: ${pipelineHealth.score}/100 (${pipelineHealth.status})`);
    if (pipelineHealth.winRate !== undefined) {
      insights.push(`Historical win rate: ${pipelineHealth.winRate}%`);
    }
  }
  
  // Lead insights
  if (leadHealth.score !== undefined) {
    insights.push(`Lead funnel health: ${leadHealth.score}/100 (${leadHealth.status})`);
    if (stats.newLeadsLast30Days > 0) {
      insights.push(`${stats.newLeadsLast30Days} new leads in last 30 days`);
    }
  }
  
  // Activity velocity
  if (stats.activitiesLast30Days > 0) {
    const dailyAvg = (stats.activitiesLast30Days / 30).toFixed(1);
    insights.push(`Activity velocity: ${dailyAvg} activities/day`);
  }
  
  // Open opportunity focus
  if (stats.openOpportunities > 0) {
    insights.push(`${stats.openOpportunities} open opportunities require attention`);
  }
  
  return insights;
}

/**
 * Generate trend predictions
 */
function generateTrendPredictions(stats, pipelineHealth, leadHealth) {
  const predictions = {
    nextMonth: {},
    trends: {},
    recommendations: [],
  };
  
  // Lead volume trend prediction
  const monthlyLeadRate = stats.newLeadsLast30Days || 0;
  predictions.nextMonth.expectedNewLeads = monthlyLeadRate; // Assume stable
  predictions.trends.leadVolume = monthlyLeadRate > 10 ? 'stable' : 
                                  monthlyLeadRate > 5 ? 'low' : 'critical';
  
  // Activity trend prediction
  const monthlyActivityRate = stats.activitiesLast30Days || 0;
  predictions.nextMonth.expectedActivities = monthlyActivityRate;
  predictions.trends.activityLevel = monthlyActivityRate > 30 ? 'high' :
                                     monthlyActivityRate > 10 ? 'moderate' : 'low';
  
  // Conversion prediction based on current funnel
  if (leadHealth.conversionRate !== undefined) {
    predictions.nextMonth.expectedConversions = Math.round(
      (stats.totalLeads || 0) * (leadHealth.conversionRate / 100) * 0.1
    );
  }
  
  // Win prediction based on pipeline
  if (stats.openOpportunities > 0 && pipelineHealth.winRate !== undefined) {
    predictions.nextMonth.expectedWins = Math.round(
      stats.openOpportunities * (pipelineHealth.winRate / 100) * 0.15
    );
  }
  
  // Recommendations based on predictions
  if (predictions.trends.leadVolume === 'critical') {
    predictions.recommendations.push('Increase lead generation efforts');
  }
  if (predictions.trends.activityLevel === 'low') {
    predictions.recommendations.push('Schedule more customer touchpoints');
  }
  
  return predictions;
}

/**
 * Build AI context for dashboard bundle
 */
async function buildDashboardAiContext(stats, tenant_id) {
  const startTime = Date.now();
  
  if (!ENABLE_AI_ENRICHMENT) {
    return createStubAiContext(startTime);
  }
  
  try {
    const supabase = getSupabaseClient();
    
    // Fetch pipeline and lead status data in parallel
    const [pipelineResult, leadStatusResult] = await Promise.all([
      (async () => {
        try {
          let q = supabase.from('v_opportunity_pipeline_by_stage').select('stage, count');
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          const { data } = await q;
          return data || [];
        } catch { return []; }
      })(),
      (async () => {
        try {
          let q = supabase.from('v_lead_counts_by_status').select('status, count');
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          const { data } = await q;
          return data || [];
        } catch { return []; }
      })(),
    ]);
    
    // Calculate health scores
    const pipelineHealth = calculatePipelineHealth(pipelineResult);
    const leadHealth = calculateLeadHealth(leadStatusResult);
    
    // Generate AI components
    const suggestions = generateDashboardSuggestions(stats, pipelineHealth, leadHealth);
    const insights = generateDashboardInsights(stats, pipelineHealth, leadHealth);
    const predictions = generateTrendPredictions(stats, pipelineHealth, leadHealth);
    
    // Calculate overall health score (weighted average)
    let overallHealth = 0;
    let weightSum = 0;
    if (pipelineHealth.score !== undefined && pipelineHealth.status !== 'no_data') {
      overallHealth += pipelineHealth.score * 0.5;
      weightSum += 0.5;
    }
    if (leadHealth.score !== undefined && leadHealth.status !== 'no_data') {
      overallHealth += leadHealth.score * 0.5;
      weightSum += 0.5;
    }
    const healthScore = weightSum > 0 ? Math.round(overallHealth / weightSum) : null;
    
    const processingTime = Date.now() - startTime;
    warnIfSlow('dashboard-ai-context', processingTime);
    
    return {
      confidence: 0.82,
      suggestions,
      predictions,
      insights,
      trends: predictions.trends,
      healthScore: {
        overall: healthScore,
        pipeline: pipelineHealth,
        leads: leadHealth,
      },
      processingTime,
    };
  } catch (error) {
    logger.error('[reports.v2] AI context error:', error.message);
    return createStubAiContext(startTime, error.message);
  }
}

/**
 * Safe count helper (copied from v1)
 */
async function safeCount(_, table, tenant_id, filterFn, opts = {}) {
  try {
    const supabase = getSupabaseClient();
    const { includeTestData = true, countMode = 'exact' } = opts;
    let q = supabase.from(table).select('*', { count: countMode, head: true });
    if (tenant_id) q = q.eq('tenant_id', tenant_id);
    if (filterFn) q = filterFn(q);
    if (!includeTestData) {
      try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ void 0; }
    }
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    logger.error(`[reports.v2] safeCount error for ${table}:`, err.message);
    return 0;
  }
}

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
        safeCount(null, 'leads', tenant_id, (q) => q.not('status', 'in', '("converted","lost")'), commonOpts),
        safeCount(null, 'opportunities', tenant_id, (q) => q.in('stage', ['won', 'closed_won']), commonOpts),
        safeCount(null, 'opportunities', tenant_id, (q) => q.not('stage', 'in', '("won","closed_won","lost","closed_lost")'), commonOpts),
        // Fetch ALL opportunities for pipeline calculation
        (async () => {
          try {
            let q = supabase.from('opportunities').select('id,name,amount,stage,created_date');
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ void 0; }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch { return []; }
        })(),
        // New leads last 30 days
        (async () => {
          try {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true });
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            q = q.gte('created_date', sinceISO);
            if (!includeTestData) {
              try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ void 0; }
            }
            const { count } = await q;
            return count ?? 0;
          } catch { return 0; }
        })(),
        // Activities last 30 days
        (async () => {
          try {
            let q = supabase.from('activities').select('*', { count: 'exact', head: true });
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            q = q.gte('created_date', sinceISO);
            if (!includeTestData) {
              try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ void 0; }
            }
            const { count } = await q;
            return count ?? 0;
          } catch { return 0; }
        })(),
        // Recent activities
        (async () => {
          try {
            let q = supabase.from('activities').select('id,type,subject,status,created_at,created_date,assigned_to').order('created_at', { ascending: false }).limit(10);
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ void 0; }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch { return []; }
        })(),
        // Recent leads
        (async () => {
          try {
            let q = supabase.from('leads').select('id,first_name,last_name,company,created_date,status').order('created_date', { ascending: false }).limit(5);
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ void 0; }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch { return []; }
        })(),
        // Recent opportunities
        (async () => {
          try {
            let q = supabase.from('opportunities').select('id,name,amount,stage,updated_at').order('updated_at', { ascending: false }).limit(5);
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ void 0; }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch { return []; }
        })(),
        // All opportunities for pipeline value calculation (needed for accurate metrics)
        (async () => {
          try {
            let q = supabase.from('opportunities').select('amount,stage');
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            if (!includeTestData) {
              try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ void 0; }
            }
            const { data } = await q;
            return Array.isArray(data) ? data : [];
          } catch { return []; }
        })(),
      ]);

      // Extract all opportunities data
      const allOpportunities = allOpportunitiesForPipeline || [];

      // Calculate pipeline value from ALL opportunities data
      const pipelineValue = allOpportunities.reduce((sum, opp) => {
        // Only include active opportunities (not won or closed_lost)
        if (opp.stage !== 'won' && opp.stage !== 'closed_won' && opp.stage !== 'lost' && opp.stage !== 'closed_lost') {
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
          stages: allOpportunities.map(o => ({ stage: o.stage, amount: o.amount, type: typeof o.amount })),
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
          } catch { return []; }
        })(),
        (async () => {
          try {
            let q = supabase.from('v_lead_counts_by_status').select('status, count');
            if (tenant_id) q = q.eq('tenant_id', tenant_id);
            const { data } = await q;
            return data || [];
          } catch { return []; }
        })(),
        (async () => {
          const since = new Date();
          since.setDate(since.getDate() - 30);
          return safeCount(null, 'activities', tenant_id, (q) => q.gte('created_date', since.toISOString()));
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
              grade: normalizedScore >= 90 ? 'A' : 
                     normalizedScore >= 80 ? 'B' :
                     normalizedScore >= 70 ? 'C' :
                     normalizedScore >= 60 ? 'D' : 'F',
            },
            pipeline: pipelineHealth,
            leads: leadHealth,
            activity: {
              score: activityScore,
              status: activityScore >= 70 ? 'healthy' : activityScore >= 40 ? 'needs_attention' : 'low',
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
