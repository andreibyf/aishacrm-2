import express from "express";
import { sanitizeUuidInput } from "../lib/uuidValidator.js";

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
      if (!effectiveTenantId && req.tenant?.id) {
        effectiveTenantId = req.tenant.id; // Use authenticated user's tenant
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
      console.error("Error creating system log:", error);
      res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  });

  // BULK INSERT endpoint to reduce per-log network overhead (client batches)
  // Accepts: { entries: [ { tenant_id, level, message, source, user_email, metadata, user_agent, url, stack_trace } ] }
  // Returns: { inserted: count }
  router.post('/bulk', async (req, res) => {
    try {
      const { entries } = req.body || {};
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ status: 'error', message: 'entries array required' });
      }

      // Cap batch size defensively to avoid oversized payloads
      const MAX_BATCH = 200; // can be tuned; small for safety
      const slice = entries.slice(0, MAX_BATCH);

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
        if (!effectiveTenantId && req.tenant?.id) {
          effectiveTenantId = req.tenant.id; // Use authenticated user's tenant
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
      if (error) throw new Error(error.message);

      res.status(201).json({
        status: 'success',
        data: { inserted_count: data?.length || 0 },
      });
    } catch (err) {
      console.error('[System Logs Bulk] Error inserting logs:', err);
      res.status(500).json({ status: 'error', message: err.message });
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
  router.get("/", async (req, res) => {
    try {
      const { tenant_id, level, limit = 100, offset = 0, hours } = req.query;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (tenant_id) q = q.eq('tenant_id', tenant_id);
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
      console.error("Error fetching system logs:", error);
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

      res.json({
        status: "success",
        message: "System log deleted",
        data,
      });
    } catch (error) {
      console.error("Error deleting system log:", error);
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
      if (tenant_id) del = del.eq('tenant_id', tenant_id);
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
      console.log(`[System Logs] Deleted ${deletedCount} system log(s) for tenant: ${tenant_id || 'all'}`);

      res.json({
        status: "success",
        message: `Deleted ${deletedCount} system log(s)`,
        data: {
          deleted_count: deletedCount,
        },
      });
    } catch (error) {
      console.error("Error clearing system logs:", error);
      res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  });

  return router;
}
