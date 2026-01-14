import express from "express";
import { sanitizeUuidInput } from "../lib/uuidValidator.js";
import { cacheList, invalidateTenantCache } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

// Configuration constants
const MAX_BULK_BATCH_SIZE = parseInt(process.env.SYSTEM_LOGS_MAX_BULK_BATCH || '200', 10);

export default function createSystemLogRoutes(_pgPool) {
  const router = express.Router();

  // Helper function to expand metadata fields to top-level properties
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata,
      metadata,
    };
  };

  /**
   * @openapi
   * /api/system-logs:
   *   post:
   *     summary: Create a system log entry
   *     description: Creates a log entry, defaulting tenant_id to 'system' when not provided.
   *     tags: [system-logs]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id:
   *                 type: string
   *               level:
   *                 type: string
   *                 enum: [TRACE, DEBUG, INFO, WARNING, ERROR]
   *               message:
   *                 type: string
   *               source:
   *                 type: string
   *               metadata:
   *                 type: object
   *               stack_trace:
   *                 type: string
   *     responses:
   *       201:
   *         description: Log entry created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.post("/", async (req, res) => {
    try {
      const {
        tenant_id,
        level,
        message,
        source,
        user_email,
        metadata,
        user_agent,
        url,
        stack_trace,
        ...otherFields
      } = req.body;

      // For tenant admins, use their tenant_id; for superadmins, allow null
      // This ensures RLS policies work correctly for non-superadmin users
      let effectiveTenantId = tenant_id || null;
      if (!effectiveTenantId && req.user?.tenant_id) {
        effectiveTenantId = req.user.tenant_id; // Use authenticated user's tenant
      }
      
      // Sanitize to handle 'system' alias → NULL for UUID columns
      effectiveTenantId = sanitizeUuidInput(effectiveTenantId);

      // Merge metadata with unknown fields and extra fields that don't exist as columns
      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields,
      };

      // Add user_email, user_agent, url to metadata since they're not columns in the table
      if (user_email) combinedMetadata.user_email = user_email;
      if (user_agent) combinedMetadata.user_agent = user_agent;
      if (url) combinedMetadata.url = url;

      // Ensure message is a non-empty string
      const safeMessage = (typeof message === 'string' && message.trim() !== '')
        ? message
        : (message == null ? '(no message)' : (() => { try { return JSON.stringify(message); } catch { return String(message); } })());

      const nowIso = new Date().toISOString();
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('system_logs')
        .insert([{ tenant_id: effectiveTenantId, level: level || 'INFO', message: safeMessage, source, metadata: combinedMetadata, stack_trace, created_at: nowIso }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      const systemLog = expandMetadata(data);

      res.status(201).json({
        status: "success",
        data: systemLog,
      });
    } catch (error) {
      logger.error("Error creating system log:", error);
      res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  });

  // BULK INSERT endpoint to reduce per-log network overhead (client batches)
  // Accepts: { entries: [ { tenant_id, level, message, source, user_email, metadata, user_agent, url, stack_trace } ] }
  // Returns: { inserted: count }
  
  // Explicit OPTIONS handler for /bulk to ensure CORS preflight works
  // While app.options('/api/*') handles most routes, this ensures the specific
  // /bulk endpoint responds properly to preflight requests from browsers
  router.options('/bulk', (_req, res) => {
    res.status(204).end();
  });

  router.post('/bulk', async (req, res) => {
    try {
      // Note: express.json() sets req.body to {} when no body is provided
      const { entries } = req.body || {};
      
      // Validate entries array
      if (!entries) {
        logger.warn('[System Logs Bulk] Request received with no entries field');
        return res.status(400).json({ status: 'error', message: 'entries field is required' });
      }
      
      if (!Array.isArray(entries)) {
        logger.warn('[System Logs Bulk] entries field is not an array:', typeof entries);
        return res.status(400).json({ status: 'error', message: 'entries must be an array' });
      }
      
      if (entries.length === 0) {
        logger.debug('[System Logs Bulk] Empty entries array received');
        return res.status(200).json({ 
          status: 'success', 
          data: { inserted_count: 0 },
          message: 'No entries to insert'
        });
      }

      // Cap batch size defensively to avoid oversized payloads
      const slice = entries.slice(0, MAX_BULK_BATCH_SIZE);
      
      if (entries.length > MAX_BULK_BATCH_SIZE) {
        logger.warn(`[System Logs Bulk] Batch size ${entries.length} exceeds max ${MAX_BULK_BATCH_SIZE}, truncating`);
      }

      const nowIso = new Date().toISOString();
      const rows = slice.map(e => {
        const {
          tenant_id,
          level,
          message,
          source,
          user_email,
          metadata,
          user_agent,
          url,
          stack_trace,
          ...otherFields
        } = e || {};

        // For tenant admins, use their tenant_id; for superadmins, allow null
        let effectiveTenantId = tenant_id || null;
        if (!effectiveTenantId && req.user?.tenant_id) {
          effectiveTenantId = req.user.tenant_id; // Use authenticated user's tenant
        }
        
        // Sanitize to handle 'system' alias → NULL for UUID columns
        effectiveTenantId = sanitizeUuidInput(effectiveTenantId);
        
        const combinedMetadata = { ...(metadata || {}), ...otherFields };
        if (user_email) combinedMetadata.user_email = user_email;
        if (user_agent) combinedMetadata.user_agent = user_agent;
        if (url) combinedMetadata.url = url;
        const safeMessage = (typeof message === 'string' && message.trim() !== '')
          ? message
          : (message == null ? '(no message)' : (() => { try { return JSON.stringify(message); } catch { return String(message); } })());
        return {
          tenant_id: effectiveTenantId,
          level: level || 'INFO',
          message: safeMessage,
          source,
          metadata: combinedMetadata,
          stack_trace,
          created_at: nowIso,
        };
      });

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('system_logs').insert(rows).select('id');
      if (error) {
        logger.error('[System Logs Bulk] Supabase error:', error.message);
        throw new Error(error.message);
      }

      const insertedCount = data?.length || 0;
      logger.debug(`[System Logs Bulk] Successfully inserted ${insertedCount} log entries`);

      res.status(201).json({
        status: 'success',
        data: { inserted_count: insertedCount },
      });
    } catch (err) {
      logger.error('[System Logs Bulk] Error inserting logs:', err);
      // Ensure we always return a valid JSON response
      res.status(500).json({ 
        status: 'error', 
        message: err.message || 'Internal server error',
        // Don't expose stack traces in production
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    }
  });

  /**
   * @openapi
   * /api/system-logs:
   *   get:
   *     summary: List system logs
   *     description: Returns logs with optional tenant, level, and time filters.
   *     tags: [system-logs]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *       - in: query
   *         name: level
   *         schema:
   *           type: string
   *           enum: [TRACE, DEBUG, INFO, WARNING, ERROR]
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *       - in: query
   *         name: hours
   *         schema:
   *           type: integer
   *         description: Return only logs after now - hours
   *     responses:
   *       200:
   *         description: System logs list
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get("/", cacheList('system_logs', 120), async (req, res) => {
    try {
      const { tenant_id, level, limit = 100, offset = 0, hours } = req.query;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      // Handle tenant_id filtering - 'system' alias maps to NULL (system-wide logs)
      if (tenant_id) {
        const sanitizedTenantId = sanitizeUuidInput(tenant_id);
        if (sanitizedTenantId === null) {
          // 'system' or invalid UUID → query for NULL tenant_id (system-wide logs)
          q = q.is('tenant_id', null);
        } else {
          q = q.eq('tenant_id', sanitizedTenantId);
        }
      }
      if (level) q = q.eq('level', level);
      if (hours) {
        const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000).toISOString();
        q = q.gt('created_at', since);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const systemLogs = (data || []).map(expandMetadata);

      res.json({
        status: "success",
        data: {
          "system-logs": systemLogs,
          total: systemLogs.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      logger.error("Error fetching system logs:", error);
      res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/system-logs/{id}:
   *   delete:
   *     summary: Delete a specific system log
   *     description: Deletes a single system log by ID.
   *     tags: [system-logs]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Log deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       404:
   *         description: Not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('system_logs')
        .delete()
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);

      if (!data) {
        return res.status(404).json({
          status: "error",
          message: "System log not found",
        });
      }

      // Invalidate cache for the affected tenant
      const tenantId = data.tenant_id || req.query.tenant_id || req.user?.tenant_id;
      if (tenantId) {
        await invalidateTenantCache(tenantId, 'system_logs');
      }
      // Also invalidate for 'system' (null tenant) logs
      await invalidateTenantCache(null, 'system_logs');

      res.json({
        status: "success",
        message: "System log deleted",
        data,
      });
    } catch (error) {
      logger.error("Error deleting system log:", error);
      res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/system-logs:
   *   delete:
   *     summary: Bulk delete system logs
   *     description: Deletes system logs by optional filters (tenant, level, hours, older_than_days).
   *     tags: [system-logs]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *       - in: query
   *         name: level
   *         schema:
   *           type: string
   *           enum: [TRACE, DEBUG, INFO, WARNING, ERROR]
   *       - in: query
   *         name: hours
   *         schema:
   *           type: integer
   *       - in: query
   *         name: older_than_days
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Count of deleted logs
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.delete("/", async (req, res) => {
    try {
      const { tenant_id, level, older_than_days, hours } = req.query;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      let del = supabase.from('system_logs').delete();
      
      // Handle tenant_id filtering - 'system' alias maps to NULL (system-wide logs)
      if (tenant_id) {
        const sanitizedTenantId = sanitizeUuidInput(tenant_id);
        if (sanitizedTenantId === null) {
          // 'system' or invalid UUID → query for NULL tenant_id (system-wide logs)
          del = del.is('tenant_id', null);
        } else {
          del = del.eq('tenant_id', sanitizedTenantId);
        }
      }
      if (level) del = del.eq('level', level);
      if (hours) {
        const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000).toISOString();
        del = del.lt('created_at', new Date().toISOString()).gte('created_at', since); // Delete logs within time range
      }
      if (older_than_days) {
        const before = new Date(Date.now() - parseInt(older_than_days) * 24 * 60 * 60 * 1000).toISOString();
        del = del.lt('created_at', before);
      }

      const { data, error } = await del.select('id');
      if (error) throw new Error(error.message);

      const deletedCount = (data || []).length;
      logger.debug(`[System Logs] Deleted ${deletedCount} system log(s) for tenant: ${tenant_id || 'all'}`);

      // Invalidate cache after bulk delete
      const sanitizedTenantId = tenant_id ? sanitizeUuidInput(tenant_id) : null;
      if (sanitizedTenantId) {
        await invalidateTenantCache(sanitizedTenantId, 'system_logs');
      }
      // Also invalidate for 'system' (null tenant) logs
      await invalidateTenantCache(null, 'system_logs');

      res.json({
        status: "success",
        message: `Deleted ${deletedCount} system log(s)`,
        data: {
          deleted_count: deletedCount,
        },
      });
    } catch (error) {
      logger.error("Error clearing system logs:", error);
      res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  });

  return router;
}
