/**
 * Metrics Routes
 * Performance and analytics metrics
 */

import express from 'express';

export default function createMetricsRoutes(pgPool) {
  const router = express.Router();

  // GET /api/metrics/performance - Get performance metrics with real data
  router.get('/performance', async (req, res) => {
    try {
      const { tenant_id, limit = 500, hours = 24 } = req.query;
      
      // Build WHERE clause
      const conditions = ['created_at > NOW() - $1::INTERVAL'];
      const params = [`${hours} hours`];
      
      if (tenant_id) {
        params.push(tenant_id);
        conditions.push(`tenant_id = $${params.length}`);
      }
      
      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      
      // Get performance logs
      params.push(parseInt(limit));
      const logsResult = await pgPool.query(
        `SELECT 
          id, tenant_id, method, endpoint, status_code, 
          duration_ms, response_time_ms, db_query_time_ms,
          user_email, error_message, created_at
        FROM performance_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
        params
      );

      // Calculate aggregate metrics
      const metricsParams = [`${hours} hours`];
      if (tenant_id) {
        metricsParams.push(tenant_id);
      }
      const metricsWhere = tenant_id 
        ? 'WHERE created_at > NOW() - $1::INTERVAL AND tenant_id = $2' 
        : 'WHERE created_at > NOW() - $1::INTERVAL';
      
      const metricsResult = await pgPool.query(
        `SELECT 
          COUNT(*) as total_calls,
          AVG(duration_ms) as avg_response_time,
          MAX(duration_ms) as max_response_time,
          MIN(duration_ms) as min_response_time,
          COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
          COUNT(*) FILTER (WHERE status_code >= 500) as server_error_count,
          COUNT(*) FILTER (WHERE status_code < 400) as success_count
        FROM performance_logs
        ${metricsWhere}`,
        metricsParams
      );

      const metrics = metricsResult.rows[0];
      const errorRate = metrics.total_calls > 0 
        ? (Number(metrics.error_count) / Number(metrics.total_calls) * 100).toFixed(2)
        : 0;

      res.json({
        status: 'success',
        data: {
          logs: logsResult.rows,
          count: logsResult.rows.length,
          metrics: {
            totalCalls: Number(metrics.total_calls),
            avgResponseTime: Math.round(Number(metrics.avg_response_time) || 0),
            maxResponseTime: Number(metrics.max_response_time) || 0,
            minResponseTime: Number(metrics.min_response_time) || 0,
            errorRate: Number(errorRate),
            errorCount: Number(metrics.error_count),
            serverErrorCount: Number(metrics.server_error_count),
            successCount: Number(metrics.success_count),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
          }
        }
      });
    } catch (error) {
      console.error('[Metrics] Error fetching performance data:', error);
      res.status(500).json({ 
        status: 'error', 
        message: error.message,
        data: {
          logs: [],
          count: 0,
          metrics: {
            totalCalls: 0,
            avgResponseTime: 0,
            errorRate: 0,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
          }
        }
      });
    }
  });

  // GET /api/metrics/usage - Get usage statistics
  router.get('/usage', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      res.json({
        status: 'success',
        data: { tenant_id, api_calls: 0, storage_used: 0 },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/metrics/performance - Clear performance logs
  router.delete('/performance', async (req, res) => {
    try {
      const { tenant_id, hours = 24 } = req.query;
      
      // Build WHERE clause
      const conditions = ['created_at > NOW() - $1::INTERVAL'];
      const params = [`${hours} hours`];
      
      if (tenant_id) {
        params.push(tenant_id);
        conditions.push(`tenant_id = $${params.length}`);
      }
      
      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      
      // Delete performance logs matching criteria
      const result = await pgPool.query(
        `DELETE FROM performance_logs ${whereClause} RETURNING *`,
        params
      );

      console.log(`[Metrics] Deleted ${result.rows.length} performance log(s) for tenant: ${tenant_id || 'all'}`);

      res.json({
        status: 'success',
        message: `Deleted ${result.rows.length} performance log(s)`,
        data: {
          deleted_count: result.rows.length,
        },
      });
    } catch (error) {
      console.error('[Metrics] Error deleting performance logs:', error);
      res.status(500).json({ 
        status: 'error', 
        message: error.message 
      });
    }
  });

  // GET /api/metrics/security - Get security metrics
  router.get('/security', async (req, res) => {
    try {
      const { tenant_id, hours = 24 } = req.query;
      
      // Build WHERE clause for tenant filtering
      const tenantCondition = tenant_id ? `AND tenant_id = $2` : '';
      const params = [`${hours} hours`];
      if (tenant_id) params.push(tenant_id);
      
      // Get authentication failures (401/403 errors)
      const authFailuresResult = await pgPool.query(
        `SELECT 
          COUNT(*) FILTER (WHERE status_code = 401) as unauthorized_count,
          COUNT(*) FILTER (WHERE status_code = 403) as forbidden_count,
          COUNT(*) as total_auth_failures,
          jsonb_agg(
            jsonb_build_object(
              'endpoint', endpoint,
              'method', method,
              'status_code', status_code,
              'user_email', user_email,
              'created_at', created_at
            )
            ORDER BY created_at DESC
          ) FILTER (WHERE status_code IN (401, 403)) as recent_failures
        FROM performance_logs
        WHERE created_at > NOW() - $1::INTERVAL 
          AND status_code IN (401, 403)
          ${tenantCondition}`,
        params
      );

      // Get rate limiting hits (429 errors)
      const rateLimitResult = await pgPool.query(
        `SELECT 
          COUNT(*) as rate_limit_hits,
          jsonb_agg(
            jsonb_build_object(
              'endpoint', endpoint,
              'user_email', user_email,
              'created_at', created_at
            )
            ORDER BY created_at DESC
          ) as recent_rate_limits
        FROM performance_logs
        WHERE created_at > NOW() - $1::INTERVAL 
          AND status_code = 429
          ${tenantCondition}`,
        params
      );

      // Get CORS errors (from error messages)
      const corsErrorsResult = await pgPool.query(
        `SELECT COUNT(*) as cors_error_count
        FROM performance_logs
        WHERE created_at > NOW() - $1::INTERVAL
          AND (error_message ILIKE '%CORS%' OR error_message ILIKE '%origin%')
          ${tenantCondition}`,
        params
      );

      // Get API keys count (if table exists)
      let apiKeysCount = 0;
      try {
        const apiKeysResult = await pgPool.query(
          `SELECT COUNT(*) as count FROM apikeys WHERE is_active = true ${tenant_id ? 'AND tenant_id = $1' : ''}`,
          tenant_id ? [tenant_id] : []
        );
        apiKeysCount = parseInt(apiKeysResult.rows[0]?.count || 0);
      } catch {
        // Table might not exist
        console.log('[Metrics] API keys table not found, skipping');
      }

      const authFailures = authFailuresResult.rows[0];
      const rateLimits = rateLimitResult.rows[0];
      const corsErrors = corsErrorsResult.rows[0];

      res.json({
        status: 'success',
        data: {
          authentication: {
            unauthorized_count: parseInt(authFailures.unauthorized_count || 0),
            forbidden_count: parseInt(authFailures.forbidden_count || 0),
            total_failures: parseInt(authFailures.total_auth_failures || 0),
            recent_failures: (authFailures.recent_failures || []).slice(0, 10),
            status: authFailures.total_auth_failures > 10 ? 'warning' : 'healthy'
          },
          rate_limiting: {
            hits: parseInt(rateLimits.rate_limit_hits || 0),
            recent_hits: (rateLimits.recent_rate_limits || []).slice(0, 10),
            status: rateLimits.rate_limit_hits > 5 ? 'warning' : 'healthy',
            enabled: true // Rate limiting is enabled in server.js
          },
          cors: {
            error_count: parseInt(corsErrors.cors_error_count || 0),
            status: corsErrors.cors_error_count > 0 ? 'warning' : 'healthy',
            allowed_origins: ['http://localhost:5173', 'http://localhost:3001'] // From server.js
          },
          api_keys: {
            active_count: apiKeysCount,
            status: 'healthy'
          },
          rls_policies: {
            enabled: true,
            status: 'active',
            note: 'Supabase Row-Level Security policies are enforced at the database level'
          },
          overall_status: 
            authFailures.total_auth_failures > 10 || rateLimits.rate_limit_hits > 5
              ? 'warning' 
              : 'healthy'
        }
      });
    } catch (error) {
      console.error('[Metrics] Error fetching security metrics:', error);
      res.status(500).json({ 
        status: 'error', 
        message: error.message,
        data: {
          authentication: { status: 'unknown' },
          rate_limiting: { status: 'unknown' },
          cors: { status: 'unknown' },
          api_keys: { status: 'unknown' },
          rls_policies: { status: 'unknown' },
          overall_status: 'error'
        }
      });
    }
  });

  return router;
}
