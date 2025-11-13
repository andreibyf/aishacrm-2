/**
 * Account Routes
 * Full CRUD operations with PostgreSQL database
 */

import express from "express";
import {
  enforceEmployeeDataScope,
  validateTenantAccess,
} from "../middleware/validateTenant.js";
import { tenantScopedId, buildGetByIdSQL } from "../middleware/tenantScopedId.js";

export default function createAccountRoutes(pgPool) {
  const router = express.Router();

  // Apply tenant validation and employee data scope to all routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  // Helper function to expand metadata fields to top-level properties
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata, // Spread all metadata fields to top level
      metadata, // Keep original for backwards compatibility
    };
  };

  // GET /api/accounts - List accounts
  router.get("/", async (req, res) => {
    try {
      const { tenant_id, type, limit = 50, offset = 0 } = req.query;

      // Build dynamic query based on tenant_id presence
      let query = "SELECT * FROM accounts";
      const params = [];
      const whereClauses = [];

      // Add tenant_id filter if provided (optional for superadmins)
      if (tenant_id) {
        params.push(tenant_id);
        whereClauses.push(`tenant_id = $${params.length}`);
      }

      if (type) {
        params.push(type);
        whereClauses.push(`type = $${params.length}`);
      }

      if (whereClauses.length > 0) {
        query += " WHERE " + whereClauses.join(" AND ");
      }

      query += " ORDER BY created_at DESC LIMIT $" + (params.length + 1) +
        " OFFSET $" + (params.length + 2);
      params.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, params);

      // Build count query with same filters
      let countQuery = "SELECT COUNT(*) FROM accounts";
      const countParams = [];
      const countWhereClauses = [];

      if (tenant_id) {
        countParams.push(tenant_id);
        countWhereClauses.push(`tenant_id = $${countParams.length}`);
      }
      if (type) {
        countParams.push(type);
        countWhereClauses.push(`type = $${countParams.length}`);
      }

      if (countWhereClauses.length > 0) {
        countQuery += " WHERE " + countWhereClauses.join(" AND ");
      }

      const countResult = await pgPool.query(countQuery, countParams);

      // Expand metadata for all accounts
      const accounts = result.rows.map(expandMetadata);

      res.json({
        status: "success",
        data: {
          accounts,
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      console.error("Error listing accounts:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/accounts - Create account
  router.post("/", async (req, res) => {
    try {
      const { tenant_id, name, type, industry, website } = req.body;

      if (!tenant_id) {
        return res.status(400).json({
          status: "error",
          message: "tenant_id is required",
        });
      }

      if (!name) {
        return res.status(400).json({
          status: "error",
          message: "name is required",
        });
      }

      const query = `
        INSERT INTO accounts (tenant_id, name, type, industry, website, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING *
      `;

      const result = await pgPool.query(query, [
        tenant_id,
        name,
        type,
        industry,
        website,
      ]);

      res.json({
        status: "success",
        message: "Account created",
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating account:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // GET /api/accounts/:id - Get single account (centralized tenant/id scoping)
  router.get("/:id", tenantScopedId(), async (req, res) => {
    try {
      const { text, params } = buildGetByIdSQL("accounts", req.idScope);
      const result = await pgPool.query(text, params);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Account not found",
        });
      }

      const account = expandMetadata(result.rows[0]);
      res.json({ status: "success", data: account });
    } catch (error) {
      console.error("Error fetching account:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // GET /api/accounts/:id/related-people - Contacts and Leads under the Account
  router.get('/:id/related-people', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      const sql = `SELECT * FROM v_account_related_people WHERE tenant_id = $1 AND account_id = $2 ORDER BY created_at DESC`;
      const result = await pgPool.query(sql, [tenant_id, id]);
      return res.json({ status: 'success', data: { people: result.rows } });
    } catch (error) {
      console.error('[Accounts] related-people error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/accounts/:id - Update account
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, type, industry, website, metadata, ...otherFields } =
        req.body;

      // First, get current account to merge metadata
      const currentAccount = await pgPool.query(
        "SELECT metadata FROM accounts WHERE id = $1",
        [id],
      );

      if (currentAccount.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Account not found",
        });
      }

      // Merge metadata - preserve existing and add/update new fields
      const currentMetadata = currentAccount.rows[0].metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields, // Any unknown fields go into metadata
      };

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (type !== undefined) {
        updates.push(`type = $${paramCount++}`);
        values.push(type);
      }
      if (industry !== undefined) {
        updates.push(`industry = $${paramCount++}`);
        values.push(industry);
      }
      if (website !== undefined) {
        updates.push(`website = $${paramCount++}`);
        values.push(website);
      }

      // Always update metadata with merged data
      updates.push(`metadata = $${paramCount++}`);
      values.push(updatedMetadata);

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const query = `UPDATE accounts SET ${
        updates.join(", ")
      } WHERE id = $${paramCount} RETURNING *`;
      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Account not found",
        });
      }

      // Expand metadata in response
      const updatedAccount = expandMetadata(result.rows[0]);

      res.json({
        status: "success",
        message: "Account updated",
        data: updatedAccount,
      });
    } catch (error) {
      console.error("Error updating account:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // DELETE /api/accounts/:id - Delete account
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pgPool.query(
        "DELETE FROM accounts WHERE id = $1 RETURNING id",
        [id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Account not found",
        });
      }

      res.json({
        status: "success",
        message: "Account deleted",
        data: { id: result.rows[0].id },
      });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  return router;
}
