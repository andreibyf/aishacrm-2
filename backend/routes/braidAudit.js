/**
 * Braid Audit Log API Routes
 * Query and analyze AI tool execution audit logs
 */

import express from 'express';
import { queryAuditLogs, getAuditStats } from '../../braid-llm-kit/sdk/index.js';
import logger from '../lib/logger.js';

const router = express.Router();

/**
 * GET /api/braid/audit
 * Query audit logs with filters
 */
router.get('/', async (req, res) => {
  try {
    const { supabase, user, tenant } = req;
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Only admins/superadmins can query audit logs
    if (!['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({ error: 'Audit log access requires admin role' });
    }
    
    const {
      user_id,
      tool_name,
      policy,
      result_tag,
      start_date,
      end_date,
      limit = 100,
      offset = 0,
      order_by = 'created_at',
      order_dir = 'desc'
    } = req.query;
    
    const { data, error } = await queryAuditLogs(supabase, {
      tenantId: tenant?.id,
      userId: user_id,
      toolName: tool_name,
      policy,
      resultTag: result_tag,
      startDate: start_date,
      endDate: end_date,
      limit: Math.min(parseInt(limit) || 100, 1000),
      offset: parseInt(offset) || 0,
      orderBy: order_by,
      orderDir: order_dir
    });
    
    if (error) {
      return res.status(500).json({ error });
    }
    
    res.json({ 
      data,
      count: data.length,
      filters: { tool_name, policy, result_tag, start_date, end_date }
    });
  } catch (err) {
    logger.error('[Braid Audit API] Query error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/braid/audit/stats
 * Get audit statistics for the tenant
 */
router.get('/stats', async (req, res) => {
  try {
    const { supabase, user, tenant } = req;
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({ error: 'Audit stats access requires admin role' });
    }
    
    const { period = 'day' } = req.query;
    
    if (!['hour', 'day', 'week', 'month'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Use: hour, day, week, month' });
    }
    
    const stats = await getAuditStats(supabase, tenant?.id, period);
    
    if (stats.error) {
      return res.status(500).json({ error: stats.error });
    }
    
    res.json(stats);
  } catch (err) {
    logger.error('[Braid Audit API] Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/braid/audit/tools
 * Get list of unique tools in audit log
 */
router.get('/tools', async (req, res) => {
  try {
    const { supabase, user, tenant } = req;
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({ error: 'Audit access requires admin role' });
    }
    
    const { data, error } = await supabase
      .from('braid_audit_log')
      .select('tool_name, policy')
      .eq('tenant_id', tenant?.id)
      .limit(1000);
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    // Get unique tools with their policies
    const toolMap = {};
    data.forEach(row => {
      if (!toolMap[row.tool_name]) {
        toolMap[row.tool_name] = row.policy;
      }
    });
    
    const tools = Object.entries(toolMap).map(([name, policy]) => ({ name, policy }));
    
    res.json({ tools, count: tools.length });
  } catch (err) {
    logger.error('[Braid Audit API] Tools error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/braid/audit/user/:userId
 * Get audit logs for a specific user
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { supabase, user, tenant } = req;
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Users can view their own logs, admins can view any
    if (user.id !== req.params.userId && !['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const { limit = 50 } = req.query;
    
    const { data, error } = await queryAuditLogs(supabase, {
      tenantId: tenant?.id,
      userId: req.params.userId,
      limit: Math.min(parseInt(limit) || 50, 500),
      orderDir: 'desc'
    });
    
    if (error) {
      return res.status(500).json({ error });
    }
    
    res.json({ data, count: data.length });
  } catch (err) {
    logger.error('[Braid Audit API] User logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
