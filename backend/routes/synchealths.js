/**
 * SyncHealth Routes
 * CRUD operations for sync health monitoring
 */

import express from "express";
import { validateTenantAccess } from "../middleware/validateTenant.js";

export default function createSyncHealthRoutes(pgPool) {
  const router = express.Router();

  // Apply tenant validation to all routes
  router.use(validateTenantAccess);

  // GET /api/synchealths - List sync health records
  router.get("/", async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0 } = req.query;

      let query = "SELECT * FROM synchealth";
      const params = [];
      const whereClauses = [];

      if (tenant_id) {
        params.push(tenant_id);
        whereClauses.push(`tenant_id = $${params.length}`);
      }

      if (whereClauses.length > 0) {
        query += " WHERE " + whereClauses.join(" AND ");
      }

      query += " ORDER BY created_at DESC";

      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
      params.push(parseInt(offset));
      query += ` OFFSET $${params.length}`;

      const result = await pgPool.query(query, params);
      res.json({ data: result.rows, total: result.rowCount });
    } catch (error) {
      console.error("Error fetching sync health records:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/synchealths/:id - Get single sync health record
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pgPool.query(
        "SELECT * FROM synchealth WHERE id = $1",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "SyncHealth record not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching sync health record:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/synchealths - Create sync health record
  router.post("/", async (req, res) => {
    try {
      const { tenant_id, status, last_sync, error_message, ...rest } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ error: "tenant_id is required" });
      }

      const result = await pgPool.query(
        `INSERT INTO synchealth (tenant_id, status, last_sync, error_message, metadata, created_at, created_date)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [
          tenant_id,
          status || "unknown",
          last_sync || null,
          error_message || null,
          JSON.stringify(rest),
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating sync health record:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/synchealths/:id - Update sync health record
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, last_sync, error_message, ...rest } = req.body;

      const result = await pgPool.query(
        `UPDATE synchealth
         SET status = COALESCE($1, status),
             last_sync = COALESCE($2, last_sync),
             error_message = COALESCE($3, error_message),
             metadata = COALESCE($4, metadata)
         WHERE id = $5
         RETURNING *`,
        [status, last_sync, error_message, JSON.stringify(rest), id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "SyncHealth record not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating sync health record:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/synchealths/:id - Delete sync health record
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pgPool.query(
        "DELETE FROM synchealth WHERE id = $1 RETURNING *",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "SyncHealth record not found" });
      }

      res.json({ message: "SyncHealth record deleted", id });
    } catch (error) {
      console.error("Error deleting sync health record:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
