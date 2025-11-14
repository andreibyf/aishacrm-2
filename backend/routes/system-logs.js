import express from "express";

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

  // POST /api/system-logs - Create system log entry
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

      // Default to 'system' tenant for null/undefined tenant_id (superadmins, system logs)
      const effectiveTenantId = tenant_id || "system";

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

  // GET /api/system-logs - List system logs
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

  // DELETE /api/system-logs/:id - Delete a specific system log
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

  // DELETE /api/system-logs - Clear all system logs (with optional filters)
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
        del = del.gt('created_at', since);
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
