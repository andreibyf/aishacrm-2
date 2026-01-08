/**
 * Developer AI Health Alerts API
 * 
 * Endpoints for managing health monitoring alerts
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { getActiveAlerts, getHealthStats, resolveAlert, triggerHealthCheck } from '../lib/healthMonitor.js';
import { isSuperadmin } from '../lib/developerAI.js';

const router = express.Router();

// Middleware: Require superadmin for all health alert endpoints
router.use((req, res, next) => {
  const user = req.user;
  if (!isSuperadmin(user)) {
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Health monitoring is restricted to superadmin users' 
    });
  }
  next();
});

/**
 * GET /api/devai/health-alerts
 * Get active health alerts
 */
router.get('/health-alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const includeResolved = req.query.include_resolved === 'true';
    
    const supa = getSupabaseClient();
    
    let query = supa
      .from('devai_health_alerts')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(limit);
    
    if (!includeResolved) {
      query = query.is('resolved_at', null);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      alerts: data || [],
      total: data?.length || 0,
    });
  } catch (error) {
    console.error('[Health Alerts API] Failed to get alerts:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * GET /api/devai/health-stats
 * Get aggregated health statistics
 */
router.get('/health-stats', async (req, res) => {
  try {
    const stats = await getHealthStats();
    
    if (!stats) {
      return res.json({
        success: true,
        stats: {
          active_alerts: 0,
          critical_alerts: 0,
          high_alerts: 0,
          medium_alerts: 0,
          low_alerts: 0,
          alerts_24h: 0,
          alerts_1h: 0,
          last_alert_time: null,
        },
      });
    }
    
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Health Alerts API] Failed to get stats:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * POST /api/devai/health-alerts/:id/resolve
 * Mark an alert as resolved
 */
router.post('/health-alerts/:id/resolve', async (req, res) => {
  try {
    const alertId = req.params.id;
    const userId = req.user?.id;
    
    if (!alertId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Alert ID is required',
      });
    }
    
    const result = await resolveAlert(alertId, userId);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to resolve alert',
        message: result.error,
      });
    }
    
    res.json({
      success: true,
      alert: result.data,
    });
  } catch (error) {
    console.error('[Health Alerts API] Failed to resolve alert:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * POST /api/devai/health-alerts/:id/mark-false-positive
 * Mark an alert as a false positive
 */
router.post('/health-alerts/:id/mark-false-positive', async (req, res) => {
  try {
    const alertId = req.params.id;
    const userId = req.user?.id;
    
    const supa = getSupabaseClient();
    const { data, error } = await supa
      .from('devai_health_alerts')
      .update({
        false_positive: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq('id', alertId)
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      alert: data,
    });
  } catch (error) {
    console.error('[Health Alerts API] Failed to mark false positive:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * POST /api/devai/trigger-health-check
 * Manually trigger a health check (for testing or on-demand diagnostics)
 */
router.post('/trigger-health-check', async (req, res) => {
  try {
    // Trigger health check asynchronously
    triggerHealthCheck().catch(err => {
      console.error('[Health Alerts API] Manual health check failed:', err);
    });
    
    res.json({
      success: true,
      message: 'Health check triggered. Results will be available in 10-30 seconds.',
    });
  } catch (error) {
    console.error('[Health Alerts API] Failed to trigger health check:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/devai/health-alerts/:id
 * Delete an alert (for cleaning up test/invalid alerts)
 */
router.delete('/health-alerts/:id', async (req, res) => {
  try {
    const alertId = req.params.id;
    
    const supa = getSupabaseClient();
    const { error } = await supa
      .from('devai_health_alerts')
      .delete()
      .eq('id', alertId);
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      message: 'Alert deleted',
    });
  } catch (error) {
    console.error('[Health Alerts API] Failed to delete alert:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

export default router;
