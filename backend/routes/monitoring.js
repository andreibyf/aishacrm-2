/**
 * Monitoring Routes
 * Comprehensive monitoring dashboard for API routes, traffic, and system metrics
 */

import express from 'express';
import { auditAPIRoutes, generateSwaggerTemplate } from '../lib/apiAuditor.js';
import {
  getTrafficLog,
  getIPStats,
  getTopIPs,
  getSuspiciousIPs,
  clearTrafficData,
} from '../middleware/trafficMonitor.js';
import {
  collectMetrics,
  getMetricsHistory,
  getAggregatedMetrics,
  checkSystemHealth,
  clearMetricsHistory,
} from '../lib/systemMetrics.js';
import {
  getRateLimitStats,
  getTopOffendingIPs,
  blockIP,
  unblockIP,
  isIPBlocked,
  getBlockedIPs,
  cleanupExpiredBlocks,
} from '../lib/rateLimitTracker.js';
import logger from '../lib/logger.js';

export default function createMonitoringRoutes() {
  const router = express.Router();

  /**
   * @openapi
   * /api/monitoring/overview:
   *   get:
   *     summary: Get comprehensive monitoring overview
   *     tags: [monitoring]
   *     responses:
   *       200:
   *         description: Monitoring overview
   */
  router.get('/overview', async (req, res) => {
    try {
      // Collect latest metrics in parallel
      const [apiAudit, systemHealth, rateLimitStats, topIPs, suspiciousIPs, blockedIPs] =
        await Promise.all([
          auditAPIRoutes().catch(() => ({ error: 'Failed to audit API routes' })),
          checkSystemHealth(),
          getRateLimitStats({ hours: 24 }).catch(() => ({
            total: 0,
            violations: [],
            error: 'Failed to get rate limit stats',
          })),
          getTopIPs(10),
          getSuspiciousIPs(),
          getBlockedIPs(true).catch(() => []),
        ]);

      res.json({
        status: 'success',
        data: {
          timestamp: new Date().toISOString(),
          api: {
            totalRoutes: apiAudit.totalRoutes || 0,
            documented: apiAudit.documented || 0,
            undocumented: apiAudit.undocumented || 0,
            coverage: apiAudit.coverage || 0,
            error: apiAudit.error,
          },
          system: systemHealth,
          rateLimit: {
            violations24h: rateLimitStats.total,
            topOffenders: topIPs.slice(0, 5),
            suspiciousIPs: suspiciousIPs.length,
            blockedIPs: blockedIPs.length,
          },
          security: {
            blockedIPs: blockedIPs.length,
            suspiciousActivity: suspiciousIPs.length > 0,
          },
        },
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting overview:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get monitoring overview',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/api-audit:
   *   get:
   *     summary: Audit API routes and Swagger documentation coverage
   *     tags: [monitoring]
   *     responses:
   *       200:
   *         description: API audit report
   */
  router.get('/api-audit', async (req, res) => {
    try {
      const audit = await auditAPIRoutes();
      res.json({
        status: 'success',
        data: audit,
      });
    } catch (error) {
      logger.error('[Monitoring] Error auditing API routes:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to audit API routes',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/api-audit/undocumented:
   *   get:
   *     summary: Get list of undocumented routes with Swagger templates
   *     tags: [monitoring]
   *     responses:
   *       200:
   *         description: Undocumented routes with templates
   */
  router.get('/api-audit/undocumented', async (req, res) => {
    try {
      const audit = await auditAPIRoutes();
      const withTemplates = audit.undocumentedRoutes.map((route) => ({
        ...route,
        swaggerTemplate: generateSwaggerTemplate(route),
      }));

      res.json({
        status: 'success',
        data: {
          count: withTemplates.length,
          routes: withTemplates,
        },
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting undocumented routes:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get undocumented routes',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/traffic:
   *   get:
   *     summary: Get recent traffic log
   *     tags: [monitoring]
   *     parameters:
   *       - in: query
   *         name: ip
   *         schema: { type: string }
   *       - in: query
   *         name: path
   *         schema: { type: string }
   *       - in: query
   *         name: statusCode
   *         schema: { type: integer }
   *       - in: query
   *         name: minDuration
   *         schema: { type: integer }
   *       - in: query
   *         name: isBot
   *         schema: { type: boolean }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 100 }
   *     responses:
   *       200:
   *         description: Traffic log
   */
  router.get('/traffic', (req, res) => {
    try {
      const traffic = getTrafficLog(req.query);
      res.json({
        status: 'success',
        data: {
          count: traffic.length,
          traffic,
        },
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting traffic log:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get traffic log',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/traffic/ip-stats:
   *   get:
   *     summary: Get IP statistics
   *     tags: [monitoring]
   *     parameters:
   *       - in: query
   *         name: ip
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: IP statistics
   */
  router.get('/traffic/ip-stats', (req, res) => {
    try {
      const stats = getIPStats(req.query.ip);
      res.json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting IP stats:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get IP stats',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/traffic/top-ips:
   *   get:
   *     summary: Get top IPs by traffic volume
   *     tags: [monitoring]
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10 }
   *     responses:
   *       200:
   *         description: Top IPs
   */
  router.get('/traffic/top-ips', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const topIPs = getTopIPs(limit);
      res.json({
        status: 'success',
        data: topIPs,
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting top IPs:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get top IPs',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/traffic/suspicious:
   *   get:
   *     summary: Get suspicious IPs (high error rate or blocks)
   *     tags: [monitoring]
   *     responses:
   *       200:
   *         description: Suspicious IPs
   */
  router.get('/traffic/suspicious', (req, res) => {
    try {
      const suspicious = getSuspiciousIPs();
      res.json({
        status: 'success',
        data: suspicious,
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting suspicious IPs:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get suspicious IPs',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/traffic/clear:
   *   post:
   *     summary: Clear traffic log and stats (admin only)
   *     tags: [monitoring]
   *     responses:
   *       200:
   *         description: Traffic data cleared
   */
  router.post('/traffic/clear', (req, res) => {
    try {
      clearTrafficData();
      res.json({
        status: 'success',
        message: 'Traffic data cleared',
      });
    } catch (error) {
      logger.error('[Monitoring] Error clearing traffic data:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to clear traffic data',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/system:
   *   get:
   *     summary: Get current system metrics
   *     tags: [monitoring]
   *     responses:
   *       200:
   *         description: System metrics
   */
  router.get('/system', async (req, res) => {
    try {
      const metrics = await collectMetrics();
      res.json({
        status: 'success',
        data: metrics,
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting system metrics:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get system metrics',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/system/history:
   *   get:
   *     summary: Get system metrics history
   *     tags: [monitoring]
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 100 }
   *     responses:
   *       200:
   *         description: Metrics history
   */
  router.get('/system/history', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const history = getMetricsHistory(limit);
      res.json({
        status: 'success',
        data: {
          count: history.length,
          metrics: history,
        },
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting metrics history:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get metrics history',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/system/aggregated:
   *   get:
   *     summary: Get aggregated system metrics over time period
   *     tags: [monitoring]
   *     parameters:
   *       - in: query
   *         name: minutes
   *         schema: { type: integer, default: 60 }
   *     responses:
   *       200:
   *         description: Aggregated metrics
   */
  router.get('/system/aggregated', (req, res) => {
    try {
      const minutes = parseInt(req.query.minutes) || 60;
      const aggregated = getAggregatedMetrics(minutes);
      res.json({
        status: 'success',
        data: aggregated,
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting aggregated metrics:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get aggregated metrics',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/system/health:
   *   get:
   *     summary: Check system health status
   *     tags: [monitoring]
   *     responses:
   *       200:
   *         description: Health status
   */
  router.get('/system/health', (req, res) => {
    try {
      const health = checkSystemHealth();
      res.json({
        status: 'success',
        data: health,
      });
    } catch (error) {
      logger.error('[Monitoring] Error checking system health:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to check system health',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/system/clear:
   *   post:
   *     summary: Clear system metrics history (admin only)
   *     tags: [monitoring]
   *     responses:
   *       200:
   *         description: Metrics history cleared
   */
  router.post('/system/clear', (req, res) => {
    try {
      clearMetricsHistory();
      res.json({
        status: 'success',
        message: 'System metrics history cleared',
      });
    } catch (error) {
      logger.error('[Monitoring] Error clearing metrics history:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to clear metrics history',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/rate-limits:
   *   get:
   *     summary: Get rate limit violations
   *     tags: [monitoring]
   *     parameters:
   *       - in: query
   *         name: ip
   *         schema: { type: string }
   *       - in: query
   *         name: endpoint
   *         schema: { type: string }
   *       - in: query
   *         name: hours
   *         schema: { type: integer, default: 24 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 100 }
   *     responses:
   *       200:
   *         description: Rate limit violations
   */
  router.get('/rate-limits', async (req, res) => {
    try {
      const stats = await getRateLimitStats(req.query);
      res.json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting rate limit stats:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get rate limit stats',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/rate-limits/top-offenders:
   *   get:
   *     summary: Get top rate limit offending IPs
   *     tags: [monitoring]
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10 }
   *       - in: query
   *         name: hours
   *         schema: { type: integer, default: 24 }
   *     responses:
   *       200:
   *         description: Top offending IPs
   */
  router.get('/rate-limits/top-offenders', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const hours = parseInt(req.query.hours) || 24;
      const offenders = await getTopOffendingIPs(limit, hours);
      res.json({
        status: 'success',
        data: offenders,
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting top offenders:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get top offending IPs',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/blocked-ips:
   *   get:
   *     summary: Get list of blocked IPs
   *     tags: [monitoring]
   *     parameters:
   *       - in: query
   *         name: activeOnly
   *         schema: { type: boolean, default: true }
   *     responses:
   *       200:
   *         description: Blocked IPs
   */
  router.get('/blocked-ips', async (req, res) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const blockedIPs = await getBlockedIPs(activeOnly);
      res.json({
        status: 'success',
        data: blockedIPs,
      });
    } catch (error) {
      logger.error('[Monitoring] Error getting blocked IPs:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get blocked IPs',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/blocked-ips/{ip}:
   *   get:
   *     summary: Check if IP is blocked
   *     tags: [monitoring]
   *     parameters:
   *       - in: path
   *         name: ip
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Block status
   */
  router.get('/blocked-ips/:ip', async (req, res) => {
    try {
      const block = await isIPBlocked(req.params.ip);
      res.json({
        status: 'success',
        data: {
          isBlocked: !!block,
          block,
        },
      });
    } catch (error) {
      logger.error('[Monitoring] Error checking IP block:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to check IP block status',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/blocked-ips:
   *   post:
   *     summary: Block an IP address (admin only)
   *     tags: [monitoring]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [ip, reason]
   *             properties:
   *               ip: { type: string }
   *               reason: { type: string }
   *               durationHours: { type: integer }
   *     responses:
   *       200:
   *         description: IP blocked successfully
   */
  router.post('/blocked-ips', async (req, res) => {
    try {
      const { ip, reason, durationHours } = req.body;

      if (!ip || !reason) {
        return res.status(400).json({
          status: 'error',
          message: 'IP and reason are required',
        });
      }

      const blockedBy = req.user?.id || 'system';
      const block = await blockIP(ip, reason, blockedBy, durationHours);

      res.json({
        status: 'success',
        data: block,
      });
    } catch (error) {
      logger.error('[Monitoring] Error blocking IP:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to block IP',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/blocked-ips/{ip}:
   *   delete:
   *     summary: Unblock an IP address (admin only)
   *     tags: [monitoring]
   *     parameters:
   *       - in: path
   *         name: ip
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: IP unblocked successfully
   */
  router.delete('/blocked-ips/:ip', async (req, res) => {
    try {
      await unblockIP(req.params.ip);
      res.json({
        status: 'success',
        message: 'IP unblocked successfully',
      });
    } catch (error) {
      logger.error('[Monitoring] Error unblocking IP:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to unblock IP',
      });
    }
  });

  /**
   * @openapi
   * /api/monitoring/blocked-ips/cleanup:
   *   post:
   *     summary: Clean up expired IP blocks (admin only)
   *     tags: [monitoring]
   *     responses:
   *       200:
   *         description: Cleanup completed
   */
  router.post('/blocked-ips/cleanup', async (req, res) => {
    try {
      const count = await cleanupExpiredBlocks();
      res.json({
        status: 'success',
        data: {
          cleaned: count,
        },
      });
    } catch (error) {
      logger.error('[Monitoring] Error cleaning up expired blocks:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to clean up expired blocks',
      });
    }
  });

  return router;
}
