/**
 * Metrics Routes
 * Performance and analytics metrics
 */

import express from 'express';
import { getPerformanceLogBatchStatus, flush as flushPerfLogs } from '../lib/perfLogBatcher.js';

export default function createMetricsRoutes(pgPool) {
  const router = express.Router();

  // GET /api/metrics/performance - system-wide or tenant-scoped performance metrics
  router.get('/performance', async (req, res) => {
    const { tenant_id, limit = 500, hours = 24 } = req.query;
    try {
      // 1. Load recent logs (always needed for chart + JS fallback)
      const logConditions = ['created_at > NOW() - $1::INTERVAL'];
      const logParams = [`${hours} hours`];
      if (tenant_id) {
        logParams.push(tenant_id);
        logConditions.push(`tenant_id = $${logParams.length}`);
      }
      logParams.push(parseInt(limit));
      const logsQuery = `SELECT id, tenant_id, method, endpoint, status_code, duration_ms, response_time_ms, db_query_time_ms,
                               user_email, error_message, created_at
                         FROM performance_logs
                         WHERE ${logConditions.join(' AND ')}
                         ORDER BY created_at DESC
                         LIMIT $${logParams.length}`;
      const logsResult = await pgPool.query(logsQuery, logParams);
      const logs = logsResult.rows;

      // 2. Compute JS fallback metrics from logs
      const durations = logs.map(l => Number(l.duration_ms) || 0);
      const totalFallback = logs.length;
      const sumFallback = durations.reduce((a, b) => a + b, 0);
      const maxFallback = durations.reduce((a, b) => Math.max(a, b), 0);
      const minFallback = durations.length ? durations.reduce((a, b) => Math.min(a, b), durations[0]) : 0;
      const errorCountFallback = logs.filter(l => Number(l.status_code) >= 400).length;
      const serverErrorCountFallback = logs.filter(l => Number(l.status_code) >= 500).length;
      const successCountFallback = logs.filter(l => Number(l.status_code) < 400).length;
      // Success work calls (JS fallback) excluding 304 and non-work endpoints
      const successWorkCallsFallback = logs.filter(l => {
        const sc = Number(l.status_code) || 0;
        const ep = String(l.endpoint || '');
        const is2xx = sc >= 200 && sc <= 299;
        const is304 = sc === 304;
        const isHeartbeat = ep.startsWith('/api/users/heartbeat');
        const isSystemStatus = ep === '/api/system/status';
        return is2xx && !is304 && !isHeartbeat && !isSystemStatus;
      }).length;

      const fallbackAgg = {
        total_calls: totalFallback,
        avg_response_time: totalFallback ? Math.round(sumFallback / totalFallback) : 0,
        max_response_time: maxFallback,
        min_response_time: minFallback,
        error_count: errorCountFallback,
        server_error_count: serverErrorCountFallback,
        success_count: successCountFallback,
        success_work_calls: successWorkCallsFallback
      };

      // 2b. JS fallback metrics excluding 304 Not Modified responses
      const no304Logs = logs.filter(l => Number(l.status_code) !== 304);
      const no304Durations = no304Logs.map(l => Number(l.duration_ms) || 0);
      const totalNo304 = no304Logs.length;
      const sumNo304 = no304Durations.reduce((a, b) => a + b, 0);
      const maxNo304 = no304Durations.reduce((a, b) => Math.max(a, b), 0);
      const minNo304 = no304Durations.length ? no304Durations.reduce((a, b) => Math.min(a, b), no304Durations[0]) : 0;
      const errNo304 = no304Logs.filter(l => Number(l.status_code) >= 400).length;
      const srvErrNo304 = no304Logs.filter(l => Number(l.status_code) >= 500).length;
      const succNo304 = no304Logs.filter(l => Number(l.status_code) < 400).length;
      // Success work calls (JS fallback) on no304 view
      const successWorkCallsFallbackNo304 = no304Logs.filter(l => {
        const sc = Number(l.status_code) || 0;
        const ep = String(l.endpoint || '');
        const is2xx = sc >= 200 && sc <= 299;
        const isHeartbeat = ep.startsWith('/api/users/heartbeat');
        const isSystemStatus = ep === '/api/system/status';
        return is2xx && !isHeartbeat && !isSystemStatus;
      }).length;

      const fallbackAggNo304 = {
        total_calls: totalNo304,
        avg_response_time: totalNo304 ? Math.round(sumNo304 / totalNo304) : 0,
        max_response_time: maxNo304,
        min_response_time: minNo304,
        error_count: errNo304,
        server_error_count: srvErrNo304,
        success_count: succNo304,
        success_work_calls: successWorkCallsFallbackNo304
      };

      // 3. Attempt DB aggregate (fast path); if it fails or returns zero, use fallbackAgg
      let finalAgg = fallbackAgg;
      let finalAggNo304 = fallbackAggNo304;
      try {
        const metricsParams = [`${hours} hours`];
        if (tenant_id) metricsParams.push(tenant_id);
        const metricsWhere = tenant_id
          ? 'WHERE created_at > NOW() - $1::INTERVAL AND tenant_id = $2'
          : 'WHERE created_at > NOW() - $1::INTERVAL';
   const metricsSql = `SELECT COUNT(*) as total_calls,
          AVG(duration_ms) as avg_response_time,
          MAX(duration_ms) as max_response_time,
          MIN(duration_ms) as min_response_time,
          COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
          COUNT(*) FILTER (WHERE status_code >= 500) as server_error_count,
          COUNT(*) FILTER (WHERE status_code < 400) as success_count,
          COUNT(*) FILTER (
            WHERE status_code BETWEEN 200 AND 299
              AND status_code <> 304
              AND endpoint NOT IN ('/api/users/heartbeat', '/api/system/status')
          ) as success_work_calls
        FROM performance_logs
        ${metricsWhere}`;
        const metricsResult = await pgPool.query(metricsSql, metricsParams);
        const row = metricsResult.rows?.[0] || {};
        const dbAgg = {
          total_calls: Number(row.total_calls ?? 0),
          avg_response_time: Number(row.avg_response_time ?? 0),
          max_response_time: Number(row.max_response_time ?? 0),
          min_response_time: Number(row.min_response_time ?? 0),
          error_count: Number(row.error_count ?? 0),
          server_error_count: Number(row.server_error_count ?? 0),
          success_count: Number(row.success_count ?? 0),
          success_work_calls: Number(row.success_work_calls ?? 0)
        };
        // Prefer DB aggregate only if it has at least 1 call
        if (dbAgg.total_calls > 0) {
          finalAgg = dbAgg;
        }

        // DB aggregate excluding 304 responses
   const metricsSqlNo304 = `SELECT COUNT(*) as total_calls,
               AVG(duration_ms) as avg_response_time,
               MAX(duration_ms) as max_response_time,
               MIN(duration_ms) as min_response_time,
               COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
               COUNT(*) FILTER (WHERE status_code >= 500) as server_error_count,
               COUNT(*) FILTER (WHERE status_code < 400) as success_count,
               COUNT(*) FILTER (
                 WHERE status_code BETWEEN 200 AND 299
                   AND status_code <> 304
                   AND endpoint NOT IN ('/api/users/heartbeat', '/api/system/status')
               ) as success_work_calls
             FROM performance_logs
             ${metricsWhere} AND status_code <> 304`;
        const metricsResultNo304 = await pgPool.query(metricsSqlNo304, metricsParams);
        const rowNo304 = metricsResultNo304.rows?.[0] || {};
        const dbAggNo304 = {
          total_calls: Number(rowNo304.total_calls ?? 0),
          avg_response_time: Number(rowNo304.avg_response_time ?? 0),
          max_response_time: Number(rowNo304.max_response_time ?? 0),
          min_response_time: Number(rowNo304.min_response_time ?? 0),
          error_count: Number(rowNo304.error_count ?? 0),
          server_error_count: Number(rowNo304.server_error_count ?? 0),
          success_count: Number(rowNo304.success_count ?? 0),
          success_work_calls: Number(rowNo304.success_work_calls ?? 0)
        };
        if (dbAggNo304.total_calls > 0) {
          finalAggNo304 = dbAggNo304;
        }
      } catch (aggErr) {
        console.warn('[Metrics] DB aggregate failed, using fallback:', aggErr.message);
      }

      const errorRate = finalAgg.total_calls > 0 ? Number(((finalAgg.error_count / finalAgg.total_calls) * 100).toFixed(2)) : 0;
      const errorRateNo304 = finalAggNo304.total_calls > 0 ? Number(((finalAggNo304.error_count / finalAggNo304.total_calls) * 100).toFixed(2)) : 0;
      console.log('[Metrics] performance', {
        tenant_id: tenant_id || 'ALL',
        hours,
        logCount: logs.length,
        usingFallback: finalAgg === fallbackAgg,
        usingFallbackNo304: finalAggNo304 === fallbackAggNo304,
        agg: finalAgg,
        aggNo304: finalAggNo304
      });

      return res.json({
        status: 'success',
        data: {
          logs,
          count: logs.length,
          metrics: {
            totalCalls: finalAgg.total_calls,
            avgResponseTime: finalAgg.avg_response_time,
            maxResponseTime: finalAgg.max_response_time,
            minResponseTime: finalAgg.min_response_time,
            errorRate,
            errorCount: finalAgg.error_count,
            serverErrorCount: finalAgg.server_error_count,
            successCount: finalAgg.success_count,
            uptime: process.uptime(),
            successWorkCalls: finalAgg.success_work_calls || 0,
            // Additional view excluding 304 Not Modified responses
            no304: {
              totalCalls: finalAggNo304.total_calls,
              avgResponseTime: finalAggNo304.avg_response_time,
              maxResponseTime: finalAggNo304.max_response_time,
              minResponseTime: finalAggNo304.min_response_time,
              errorRate: errorRateNo304,
              errorCount: finalAggNo304.error_count,
              serverErrorCount: finalAggNo304.server_error_count,
              successCount: finalAggNo304.success_count,
              successWorkCalls: finalAggNo304.success_work_calls || 0
            }
          }
        }
      });
    } catch (error) {
      console.error('[Metrics] Fatal error in /performance route:', error);
      return res.status(500).json({
        status: 'error',
        message: error.message,
        data: {
          logs: [],
          count: 0,
          metrics: {
            totalCalls: 0,
            avgResponseTime: 0,
            maxResponseTime: 0,
            minResponseTime: 0,
            errorRate: 0,
            errorCount: 0,
            serverErrorCount: 0,
            successCount: 0,
            uptime: process.uptime()
          }
        }
      });
    }
  });

  // GET /api/metrics/usage - simple usage placeholder
  router.get('/usage', async (req, res) => {
    try {
      const { tenant_id } = req.query;
      return res.json({
        status: 'success',
        data: { tenant_id, api_calls: 0, storage_used: 0 }
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/metrics/perf-log-status - queue depth & settings
  router.get('/perf-log-status', (req, res) => {
    try {
      const status = getPerformanceLogBatchStatus();
      return res.json({ status: 'success', data: status });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/metrics/flush-performance-logs - force flush
  router.post('/flush-performance-logs', async (req, res) => {
    try {
      await flushPerfLogs();
      const status = getPerformanceLogBatchStatus();
      return res.json({ status: 'success', message: 'Flush triggered', data: status });
    } catch (error) {
      console.error('[Metrics] Flush endpoint error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/metrics/performance - clear logs for range/tenant
  router.delete('/performance', async (req, res) => {
    try {
      const { tenant_id, hours = 24 } = req.query;
      const conditions = ['created_at > NOW() - $1::INTERVAL'];
      const params = [`${hours} hours`];
      if (tenant_id) {
        params.push(tenant_id);
        conditions.push(`tenant_id = $${params.length}`);
      }
      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const result = await pgPool.query(`DELETE FROM performance_logs ${whereClause} RETURNING id`, params);
      console.log(`[Metrics] Deleted ${result.rows.length} performance log(s) for tenant: ${tenant_id || 'ALL'}`);
      return res.json({ status: 'success', message: `Deleted ${result.rows.length} performance log(s)`, data: { deleted_count: result.rows.length } });
    } catch (error) {
      console.error('[Metrics] Error deleting performance logs:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/metrics/security - high-level security metrics
  router.get('/security', async (req, res) => {
    try {
      const { tenant_id, hours = 24 } = req.query;
      const params = [`${hours} hours`];
      const tenantCondition = tenant_id ? 'AND tenant_id = $2' : '';
      if (tenant_id) params.push(tenant_id);

      // Auth failures
      const authFailuresResult = await pgPool.query(
        `SELECT COUNT(*) FILTER (WHERE status_code = 401) as unauthorized_count,
                COUNT(*) FILTER (WHERE status_code = 403) as forbidden_count,
                COUNT(*) as total_auth_failures,
                jsonb_agg(jsonb_build_object('endpoint', endpoint,'method', method,'status_code', status_code,'user_email', user_email,'created_at', created_at) ORDER BY created_at DESC) FILTER (WHERE status_code IN (401,403)) as recent_failures
         FROM performance_logs
         WHERE created_at > NOW() - $1::INTERVAL ${tenantCondition}`,
        params
      );

      // Rate limiting hits
      const rateLimitResult = await pgPool.query(
        `SELECT COUNT(*) as rate_limit_hits,
                jsonb_agg(jsonb_build_object('endpoint', endpoint,'user_email', user_email,'created_at', created_at) ORDER BY created_at DESC) FILTER (WHERE status_code = 429) as recent_rate_limits
         FROM performance_logs
         WHERE created_at > NOW() - $1::INTERVAL ${tenantCondition}`,
        params
      );

      // CORS-like errors
      const corsErrorsResult = await pgPool.query(
        `SELECT COUNT(*) as cors_error_count
         FROM performance_logs
         WHERE created_at > NOW() - $1::INTERVAL
           AND (error_message ILIKE '%CORS%' OR error_message ILIKE '%origin%') ${tenantCondition}`,
        params
      );

      // API keys active count (best effort)
      let apiKeysCount = 0;
      try {
        const apiKeysResult = await pgPool.query(
          `SELECT COUNT(*) as count FROM apikeys WHERE is_active = true ${tenant_id ? 'AND tenant_id = $1' : ''}`,
          tenant_id ? [tenant_id] : []
        );
        apiKeysCount = parseInt(apiKeysResult.rows[0]?.count || 0);
      } catch {
        console.log('[Metrics] API keys table not found, skipping');
      }

      const authFailures = authFailuresResult.rows[0] || {};
      const rateLimits = rateLimitResult.rows[0] || {};
      const corsErrors = corsErrorsResult.rows[0] || {};

      return res.json({
        status: 'success',
        data: {
          authentication: {
            unauthorized_count: parseInt(authFailures.unauthorized_count || 0),
            forbidden_count: parseInt(authFailures.forbidden_count || 0),
            total_failures: parseInt(authFailures.total_auth_failures || 0),
            recent_failures: (authFailures.recent_failures || []).slice(0, 10),
            status: (authFailures.total_auth_failures || 0) > 10 ? 'warning' : 'healthy'
          },
          rate_limiting: {
            hits: parseInt(rateLimits.rate_limit_hits || 0),
            recent_hits: (rateLimits.recent_rate_limits || []).slice(0, 10),
            status: (rateLimits.rate_limit_hits || 0) > 5 ? 'warning' : 'healthy',
            enabled: true
          },
            cors: {
            error_count: parseInt(corsErrors.cors_error_count || 0),
            status: (corsErrors.cors_error_count || 0) > 0 ? 'warning' : 'healthy',
            allowed_origins: ['http://localhost:5173', 'http://localhost:3001']
          },
          api_keys: { active_count: apiKeysCount, status: 'healthy' },
          rls_policies: { enabled: true, status: 'active', note: 'Row-Level Security enforced' },
          overall_status: ((authFailures.total_auth_failures || 0) > 10 || (rateLimits.rate_limit_hits || 0) > 5)
            ? 'warning'
            : 'healthy'
        }
      });
    } catch (error) {
      console.error('[Metrics] Error fetching security metrics:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
