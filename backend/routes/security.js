/**
 * Security & IDR Management API Routes
 *
 * Provides endpoints for:
 * - Viewing security alerts
 * - Managing blocked IPs
 * - Monitoring intrusion detection status
 * - Configuring IDR settings
 *
 * Protected: Requires superadmin role
 */

import express from "express";
import {
  getSecurityStatus,
  manuallyBlockIP,
  unblockIP,
  clearTrackingData
} from "../middleware/intrusionDetection.js";

export default function createSecurityRoutes(pgPool) {
  const router = express.Router();

  /**
   * GET /api/security/alerts
   * Retrieve recent security alerts from system_logs
   */
  router.get("/alerts", async (req, res) => {
    try {
      const {
        tenant_id,
        severity,
        violation_type,
        limit = 100,
        offset = 0,
        start_date,
        end_date
      } = req.query;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      let query = supabase
        .from('system_logs')
        .select('*', { count: 'exact' })
        .eq('level', 'security_alert')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Filter by tenant (superadmin can see all)
      if (tenant_id && tenant_id !== 'all') {
        query = query.eq('tenant_id', tenant_id);
      }

      // Filter by severity
      if (severity) {
        query = query.contains('metadata', { severity });
      }

      // Filter by violation type
      if (violation_type) {
        query = query.contains('metadata', { violation_type });
      }

      // Date range
      if (start_date) {
        query = query.gte('created_at', start_date);
      }
      if (end_date) {
        query = query.lte('created_at', end_date);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Parse metadata for easier consumption
      const alerts = data.map(alert => ({
        ...alert,
        severity: alert.metadata?.severity || 'unknown',
        violation_type: alert.metadata?.violation_type || 'unknown',
        user_email: alert.metadata?.user_email || 'unknown',
        ip_address: alert.metadata?.ip_address || 'unknown',
        attempted_tenant: alert.metadata?.attempted_tenant,
        actual_tenant: alert.metadata?.actual_tenant
      }));

      res.json({
        status: 'success',
        data: {
          alerts,
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching security alerts:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch security alerts',
        error: error.message
      });
    }
  });

  /**
   * GET /api/security/statistics
   * Get aggregated security statistics
   */
  router.get("/statistics", async (req, res) => {
    try {
      const { tenant_id, days = 7 } = req.query;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      let query = supabase
        .from('system_logs')
        .select('metadata, created_at')
        .eq('level', 'security_alert')
        .gte('created_at', startDate.toISOString());

      if (tenant_id && tenant_id !== 'all') {
        query = query.eq('tenant_id', tenant_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Aggregate statistics
      const stats = {
        total_alerts: data.length,
        by_severity: {},
        by_violation_type: {},
        by_tenant: {},
        by_hour: {},
        unique_ips: new Set(),
        unique_users: new Set()
      };

      data.forEach(log => {
        const metadata = log.metadata || {};

        // Count by severity
        const severity = metadata.severity || 'unknown';
        stats.by_severity[severity] = (stats.by_severity[severity] || 0) + 1;

        // Count by violation type
        const violationType = metadata.violation_type || 'unknown';
        stats.by_violation_type[violationType] = (stats.by_violation_type[violationType] || 0) + 1;

        // Count by tenant
        const tenant = log.tenant_id || 'unknown';
        stats.by_tenant[tenant] = (stats.by_tenant[tenant] || 0) + 1;

        // Count by hour
        const hour = new Date(log.created_at).getHours();
        stats.by_hour[hour] = (stats.by_hour[hour] || 0) + 1;

        // Track unique IPs and users
        if (metadata.ip_address) stats.unique_ips.add(metadata.ip_address);
        if (metadata.user_id) stats.unique_users.add(metadata.user_id);
      });

      stats.unique_ips = stats.unique_ips.size;
      stats.unique_users = stats.unique_users.size;

      res.json({
        status: 'success',
        data: {
          statistics: stats,
          period_days: parseInt(days),
          start_date: startDate.toISOString(),
          end_date: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error calculating security statistics:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to calculate statistics',
        error: error.message
      });
    }
  });

  /**
   * GET /api/security/status
   * Get current IDR system status
   */
  router.get("/status", async (req, res) => {
    try {
      const status = getSecurityStatus();

      res.json({
        status: 'success',
        data: {
          idr_status: 'active',
          ...status,
          uptime: process.uptime(),
          memory_usage: process.memoryUsage()
        }
      });
    } catch (error) {
      console.error('Error getting security status:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get security status',
        error: error.message
      });
    }
  });

  /**
   * POST /api/security/block-ip
   * Manually block an IP address
   */
  router.post("/block-ip", async (req, res) => {
    try {
      const { ip, duration_ms = 900000, reason } = req.body; // Default 15 minutes

      if (!ip) {
        return res.status(400).json({
          status: 'error',
          message: 'IP address is required'
        });
      }

      manuallyBlockIP(ip, duration_ms);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Log the manual block
      await supabase.from('system_logs').insert({
        tenant_id: 'system',
        level: 'security_alert',
        message: `IP ${ip} manually blocked by administrator`,
        source: 'IDR:ManualBlock',
        metadata: {
          ip_address: ip,
          duration_ms,
          reason,
          blocked_by: req.user?.email || 'system',
          blocked_at: new Date().toISOString()
        }
      });

      res.json({
        status: 'success',
        message: `IP ${ip} blocked for ${duration_ms}ms`,
        data: { ip, duration_ms, expires_at: new Date(Date.now() + duration_ms) }
      });
    } catch (error) {
      console.error('Error blocking IP:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to block IP',
        error: error.message
      });
    }
  });

  /**
   * POST /api/security/unblock-ip
   * Manually unblock an IP address
   */
  router.post("/unblock-ip", async (req, res) => {
    try {
      const { ip, reason } = req.body;

      if (!ip) {
        return res.status(400).json({
          status: 'error',
          message: 'IP address is required'
        });
      }

      unblockIP(ip);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Log the unblock
      await supabase.from('system_logs').insert({
        tenant_id: 'system',
        level: 'info',
        message: `IP ${ip} manually unblocked by administrator`,
        source: 'IDR:ManualUnblock',
        metadata: {
          ip_address: ip,
          reason,
          unblocked_by: req.user?.email || 'system',
          unblocked_at: new Date().toISOString()
        }
      });

      res.json({
        status: 'success',
        message: `IP ${ip} unblocked`,
        data: { ip }
      });
    } catch (error) {
      console.error('Error unblocking IP:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to unblock IP',
        error: error.message
      });
    }
  });

  /**
   * GET /api/security/threat-intelligence
   * Get threat intelligence summary
   */
  router.get("/threat-intelligence", async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('system_logs')
        .select('metadata')
        .eq('level', 'security_alert')
        .gte('created_at', startDate.toISOString());

      if (error) throw error;

      // Analyze threat patterns
      const ipThreatMap = new Map();
      const userThreatMap = new Map();
      const violationPatterns = {};

      data.forEach(log => {
        const metadata = log.metadata || {};
        const ip = metadata.ip_address;
        const userId = metadata.user_id;
        const violationType = metadata.violation_type;
        const severity = metadata.severity;

        // Track IP threats
        if (ip) {
          if (!ipThreatMap.has(ip)) {
            ipThreatMap.set(ip, {
              ip,
              alert_count: 0,
              violation_types: new Set(),
              severities: { critical: 0, high: 0, medium: 0, low: 0 },
              first_seen: metadata.timestamp,
              last_seen: metadata.timestamp
            });
          }
          const ipData = ipThreatMap.get(ip);
          ipData.alert_count++;
          if (violationType) ipData.violation_types.add(violationType);
          if (severity) ipData.severities[severity]++;
          ipData.last_seen = metadata.timestamp;
        }

        // Track user threats
        if (userId) {
          if (!userThreatMap.has(userId)) {
            userThreatMap.set(userId, {
              user_id: userId,
              user_email: metadata.user_email,
              alert_count: 0,
              violation_types: new Set(),
              tenant_violations: []
            });
          }
          const userData = userThreatMap.get(userId);
          userData.alert_count++;
          if (violationType) userData.violation_types.add(violationType);
          if (metadata.attempted_tenant && metadata.actual_tenant) {
            userData.tenant_violations.push({
              attempted: metadata.attempted_tenant,
              actual: metadata.actual_tenant
            });
          }
        }

        // Track violation patterns
        if (violationType) {
          if (!violationPatterns[violationType]) {
            violationPatterns[violationType] = { count: 0, severities: {} };
          }
          violationPatterns[violationType].count++;
          if (severity) {
            violationPatterns[violationType].severities[severity] =
              (violationPatterns[violationType].severities[severity] || 0) + 1;
          }
        }
      });

      // Convert maps to arrays and sort by threat level
      const topThreateningIPs = Array.from(ipThreatMap.values())
        .map(ip => ({
          ...ip,
          violation_types: Array.from(ip.violation_types),
          threat_score: ip.alert_count + (ip.severities.critical * 10) + (ip.severities.high * 5)
        }))
        .sort((a, b) => b.threat_score - a.threat_score)
        .slice(0, 20);

      const topThreateningUsers = Array.from(userThreatMap.values())
        .map(user => ({
          ...user,
          violation_types: Array.from(user.violation_types),
          threat_score: user.alert_count + (user.tenant_violations.length * 3)
        }))
        .sort((a, b) => b.threat_score - a.threat_score)
        .slice(0, 20);

      res.json({
        status: 'success',
        data: {
          summary: {
            total_alerts: data.length,
            unique_ips: ipThreatMap.size,
            unique_users: userThreatMap.size,
            period_days: parseInt(days)
          },
          top_threatening_ips: topThreateningIPs,
          top_threatening_users: topThreateningUsers,
          violation_patterns: violationPatterns,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error generating threat intelligence:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to generate threat intelligence',
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/security/clear-tracking
   * Clear all IDR tracking data (for maintenance/testing)
   */
  router.delete("/clear-tracking", async (req, res) => {
    try {
      clearTrackingData();

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      await supabase.from('system_logs').insert({
        tenant_id: 'system',
        level: 'info',
        message: 'IDR tracking data cleared by administrator',
        source: 'IDR:ClearTracking',
        metadata: {
          cleared_by: req.user?.email || 'system',
          cleared_at: new Date().toISOString()
        }
      });

      res.json({
        status: 'success',
        message: 'IDR tracking data cleared'
      });
    } catch (error) {
      console.error('Error clearing tracking data:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to clear tracking data',
        error: error.message
      });
    }
  });

  return router;
}