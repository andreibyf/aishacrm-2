/**
 * Braid Metrics REST API
 * 
 * Dashboard-ready endpoints for tool performance, usage, and health metrics.
 * Combines real-time Redis counters with historical data from braid_audit_log.
 * 
 * AUTHENTICATION: Superadmin-only (ADMIN_EMAILS) - monitors ALL tenants
 * 
 * @module routes/braidMetrics
 */

import express from 'express';
import { requireAuthCookie } from '../middleware/authCookie.js';
import { getRealtimeMetrics } from '../lib/braidIntegration-v2.js';
import { getToolMetrics, getMetricsTimeSeries, getErrorAnalysis, getAuditStats } from '../../braid-llm-kit/tools/braid-rt.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

const router = express.Router();

// Superadmin authentication helper (from mcp.js pattern)
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.email) {
    return res.status(401).json({
      error: "Unauthorized - authentication required"
    });
  }

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    return res.status(403).json({
      error: "Admin access not configured (ADMIN_EMAILS missing)"
    });
  }

  const userEmail = String(req.user.email).toLowerCase();
  if (!adminEmails.includes(userEmail)) {
    return res.status(403).json({
      error: "Forbidden - superadmin access required"
    });
  }

  return next();
}

// Apply superadmin authentication to all routes
router.use(requireAuthCookie);
router.use(requireAdmin);

/**
 * GET /api/braid/metrics/realtime
 * 
 * Returns real-time metrics from Redis counters (last minute and hour).
 * Fastest endpoint - no database queries.
 * 
 * Query params:
 * - tenant_id: Optional - filter by specific tenant UUID (superadmin can monitor any tenant)
 * 
 * Response:
 * {
 *   minute: { total: 45, success: 42, failed: 3, cacheHits: 20, totalLatencyMs: 12500 },
 *   hour: { total: 850, success: 830, failed: 20, cacheHits: 400, totalLatencyMs: 280000 },
 *   derived: { minuteSuccessRate: 0.93, hourSuccessRate: 0.976, minuteCacheRate: 0.44, avgLatencyMs: 15 }
 * }
 */
router.get('/realtime', async (req, res) => {
  try {
    // Superadmin can optionally filter by tenant, or see all tenants aggregated
    const tenantId = req.query.tenant_id || null; // null = aggregate all tenants

    // Get both minute and hour windows
    const [minuteMetrics, hourMetrics] = await Promise.all([
      getRealtimeMetrics(tenantId, 'minute'),
      getRealtimeMetrics(tenantId, 'hour')
    ]);
    
    const metrics = {
      minute: {
        total: minuteMetrics.calls,
        success: minuteMetrics.calls - minuteMetrics.errors,
        failed: minuteMetrics.errors,
        cacheHits: minuteMetrics.cacheHits,
        totalLatencyMs: 0 // Not tracked in current implementation
      },
      hour: {
        total: hourMetrics.calls,
        success: hourMetrics.calls - hourMetrics.errors,
        failed: hourMetrics.errors,
        cacheHits: hourMetrics.cacheHits,
        totalLatencyMs: 0 // Not tracked in current implementation
      }
    };
    
    // Add derived metrics for easy dashboard consumption
    const derived = {
      minuteSuccessRate: metrics.minute.total > 0 
        ? metrics.minute.success / metrics.minute.total 
        : 1,
      hourSuccessRate: metrics.hour.total > 0 
        ? metrics.hour.success / metrics.hour.total 
        : 1,
      minuteCacheRate: metrics.minute.total > 0 
        ? metrics.minute.cacheHits / metrics.minute.total 
        : 0,
      hourCacheRate: metrics.hour.total > 0 
        ? metrics.hour.cacheHits / metrics.hour.total 
        : 0,
      minuteAvgLatencyMs: 0, // Not tracked yet
      hourAvgLatencyMs: 0 // Not tracked yet
    };

    res.json({
      ...metrics,
      derived,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Metrics] Realtime error:', error);
    res.status(500).json({ error: 'Failed to fetch realtime metrics', details: error.message });
  }
});

/**
 * GET /api/braid/metrics/tools
 * 
 * Returns per-tool metrics with health scores.
 * 
 * Query params:
 * - period: '1h' | '24h' | '7d' | '30d' (default: '24h')
 * - tenant_id: Optional - filter by specific tenant UUID (superadmin can monitor any tenant)
 * 
 * Response:
 * {
 *   tools: [
 *     { tool: 'crm_search_accounts', total: 500, success: 490, successRate: 0.98, avgLatency: 120, health: 95, status: 'healthy' },
 *     ...
 *   ],
 *   summary: { totalTools: 15, healthyCount: 12, degradedCount: 2, criticalCount: 1 }
 * }
 */
router.get('/tools', async (req, res) => {
  try {
    // Superadmin can optionally filter by tenant, or see all tenants aggregated
    const tenantId = req.query.tenant_id || null; // null = aggregate all tenants

    const period = req.query.period || '24h';
    const validPeriods = ['1h', '24h', '7d', '30d'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: `Invalid period. Use: ${validPeriods.join(', ')}` });
    }

    // Map route periods to braid-rt periods
    const periodMap = { '1h': 'hour', '24h': 'day', '7d': 'week', '30d': 'month' };
    const braidPeriod = periodMap[period] || 'day';

    const supabase = getSupabaseClient();
    const result = await getToolMetrics(supabase, tenantId, braidPeriod);

    // Handle error response from getToolMetrics
    if (result.error) {
      return res.status(500).json({ error: 'Failed to fetch tool metrics', details: result.error });
    }

    // Extract tools array from result
    const tools = result.tools || [];

    // Generate summary
    const summary = {
      totalTools: tools.length,
      healthyCount: tools.filter(t => t.healthStatus === 'healthy').length,
      degradedCount: tools.filter(t => t.healthStatus === 'degraded').length,
      warningCount: tools.filter(t => t.healthStatus === 'warning').length,
      criticalCount: tools.filter(t => t.healthStatus === 'critical').length,
      overallHealth: tools.length > 0 
        ? Math.round(tools.reduce((sum, t) => sum + t.healthScore, 0) / tools.length) 
        : 100
    };

    res.json({
      period,
      tools,
      summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Metrics] Tools error:', error);
    res.status(500).json({ error: 'Failed to fetch tool metrics', details: error.message });
  }
});

/**
 * GET /api/braid/metrics/timeseries
 * 
 * Returns time-series data for charting.
 * 
 * Query params:
 * - granularity: 'minute' | 'hour' | 'day' (default: 'hour')
 * - points: number of data points (default: 24, max: 168)
 * - tenant_id: Optional - filter by specific tenant UUID
 * 
 * Response:
 * {
 *   granularity: 'hour',
 *   data: [
 *     { bucket: '2025-01-15T10:00:00Z', total: 150, success: 145, failed: 5, avgLatency: 85, cacheHits: 60 },
 *     ...
 *   ]
 * }
 */
router.get('/timeseries', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id || null;

    const granularity = req.query.granularity || 'hour';
    const validGranularities = ['minute', 'hour', 'day'];
    if (!validGranularities.includes(granularity)) {
      return res.status(400).json({ error: `Invalid granularity. Use: ${validGranularities.join(', ')}` });
    }

    const points = Math.min(parseInt(req.query.points) || 24, 168);

    const supabase = getSupabaseClient();
    const data = await getMetricsTimeSeries(supabase, tenantId, granularity, points);

    res.json({
      granularity,
      points,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Metrics] Timeseries error:', error);
    res.status(500).json({ error: 'Failed to fetch timeseries metrics', details: error.message });
  }
});

/**
 * GET /api/braid/metrics/errors
 * 
 * Returns error analysis for debugging.
 * 
 * Query params:
 * - period: '1h' | '24h' | '7d' | '30d' (default: '24h')
 * - tenant_id: Optional - filter by specific tenant UUID
 * 
 * Response:
 * {
 *   totalErrors: 25,
 *   byType: { validation_error: 10, rate_limited: 8, permission_denied: 7 },
 *   byTool: { crm_create_lead: 12, crm_update_account: 8, ... },
 *   recentErrors: [ { tool, error, timestamp, userId }, ... ]
 * }
 */
router.get('/errors', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id || null;

    const period = req.query.period || '24h';
    const validPeriods = ['1h', '24h', '7d', '30d'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: `Invalid period. Use: ${validPeriods.join(', ')}` });
    }

    const supabase = getSupabaseClient();
    const analysis = await getErrorAnalysis(supabase, tenantId, period);

    res.json({
      period,
      ...analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Metrics] Errors analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch error analysis', details: error.message });
  }
});

/**
 * GET /api/braid/metrics/summary
 * 
 * Returns a combined summary for dashboard widgets.
 * Includes realtime stats, top tools, and health overview.
 * 
 * Query params:
 * - tenant_id: Optional - filter by specific tenant UUID
 */
router.get('/summary', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id || null;

    const supabase = getSupabaseClient();

    // Fetch in parallel
    const [realtime, toolMetricsResult, auditStats] = await Promise.all([
      getRealtimeMetrics(tenantId),
      getToolMetrics(supabase, tenantId, 'day'),
      getAuditStats(supabase, tenantId, 'day')
    ]);

    // Extract tools array from result
    const toolMetrics = toolMetricsResult?.tools || [];

    // Top 5 most-used tools
    const topTools = toolMetrics
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5)
      .map(t => ({ name: t.name, total: t.calls, successRate: t.successRate, health: t.healthScore }));

    // Tools needing attention (health < 80)
    const problemTools = toolMetrics
      .filter(t => t.healthScore < 80)
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 5)
      .map(t => ({ name: t.name, health: t.healthScore, status: t.healthStatus, successRate: t.successRate }));

    // Calculate overall health
    const overallHealth = toolMetrics.length > 0
      ? Math.round(toolMetrics.reduce((sum, t) => sum + t.healthScore, 0) / toolMetrics.length)
      : 100;

    // Determine overall status
    let overallStatus = 'healthy';
    if (problemTools.some(t => t.status === 'critical')) overallStatus = 'critical';
    else if (problemTools.some(t => t.status === 'warning')) overallStatus = 'warning';
    else if (problemTools.length > 0) overallStatus = 'degraded';

    res.json({
      realtime: {
        lastMinute: realtime.minute,
        lastHour: realtime.hour
      },
      today: auditStats,
      topTools,
      problemTools,
      health: {
        score: overallHealth,
        status: overallStatus,
        toolCount: toolMetrics.length,
        healthyCount: toolMetrics.filter(t => t.healthScore >= 80).length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Metrics] Summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary metrics', details: error.message });
  }
});

export default router;
