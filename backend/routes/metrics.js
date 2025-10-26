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

  return router;
}
