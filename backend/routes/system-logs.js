import express from "express";

export default function createSystemLogRoutes(pgPool) {
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

      // Insert only columns that exist in the schema
      const query = `
        INSERT INTO system_logs (
          tenant_id, level, message, source, metadata, stack_trace, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NOW()
        ) RETURNING *
      `;

      // Ensure message is a non-empty string
      const safeMessage = (typeof message === 'string' && message.trim() !== '')
        ? message
        : (message == null ? '(no message)' : (() => { try { return JSON.stringify(message); } catch { return String(message); } })());

      const values = [
        effectiveTenantId,
        level || "INFO",
        safeMessage,
        source,
        JSON.stringify(combinedMetadata), // Ensure metadata is stringified
        stack_trace,
      ];

      const result = await pgPool.query(query, values);

      const systemLog = expandMetadata(result.rows[0]);

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

      let query = "SELECT * FROM system_logs WHERE 1=1";
      const values = [];
      let valueIndex = 1;

      // Add time range filter if hours parameter is provided
      if (hours) {
        query += ` AND created_at > NOW() - INTERVAL '${parseInt(hours)} hours'`;
      }

      if (tenant_id) {
        query += ` AND tenant_id = $${valueIndex}`;
        values.push(tenant_id);
        valueIndex++;
      }

      if (level) {
        query += ` AND level = $${valueIndex}`;
        values.push(level);
        valueIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${valueIndex} OFFSET $${
        valueIndex + 1
      }`;
      values.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, values);

      const systemLogs = result.rows.map(expandMetadata);

      res.json({
        status: "success",
        data: {
          "system-logs": systemLogs,
          total: result.rows.length,
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

      const query = "DELETE FROM system_logs WHERE id = $1 RETURNING *";
      const result = await pgPool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "System log not found",
        });
      }

      res.json({
        status: "success",
        message: "System log deleted",
        data: result.rows[0],
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

      let query = "DELETE FROM system_logs WHERE 1=1";
      const values = [];
      let valueIndex = 1;

      // Add time range filter if hours parameter is provided
      if (hours) {
        query += ` AND created_at > NOW() - INTERVAL '${parseInt(hours)} hours'`;
      }

      if (tenant_id) {
        query += ` AND tenant_id = $${valueIndex}`;
        values.push(tenant_id);
        valueIndex++;
      }

      if (level) {
        query += ` AND level = $${valueIndex}`;
        values.push(level);
        valueIndex++;
      }

      if (older_than_days) {
        query += ` AND created_at < NOW() - INTERVAL '${
          parseInt(older_than_days)
        } days'`;
      }

      query += " RETURNING *";

      const result = await pgPool.query(query, values);

      console.log(`[System Logs] Deleted ${result.rows.length} system log(s) for tenant: ${tenant_id || 'all'}`);

      res.json({
        status: "success",
        message: `Deleted ${result.rows.length} system log(s)`,
        data: {
          deleted_count: result.rows.length,
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
