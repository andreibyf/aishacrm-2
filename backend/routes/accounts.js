/**
 * Account Routes
 * Full CRUD operations with PostgreSQL database
 */

import express from "express";
import {
  enforceEmployeeDataScope,
  validateTenantAccess,
} from "../middleware/validateTenant.js";
import { tenantScopedId, buildGetByIdSQL as _buildGetByIdSQL } from "../middleware/tenantScopedId.js";
import { cacheList, invalidateCache } from "../lib/cacheMiddleware.js";

export default function createAccountRoutes(_pgPool) {
  const router = express.Router();
  /**
   * @openapi
   * /api/accounts:
   *   get:
   *     summary: List accounts
   *     tags: [accounts]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema: { type: string, nullable: true }
   *       - in: query
   *         name: type
   *         schema: { type: string, nullable: true }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Accounts list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     accounts:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           tenant_id:
   *                             type: string
   *                             format: uuid
   *                           name:
   *                             type: string
   *                           type:
   *                             type: string
   *                             example: customer
   *                           industry:
   *                             type: string
   *                           website:
   *                             type: string
   *                           created_at:
   *                             type: string
   *                             format: date-time
   *                           updated_at:
   *                             type: string
   *                             format: date-time
   *   post:
   *     summary: Create account
   *     tags: [accounts]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, name]
   *             properties:
   *               tenant_id: { type: string }
   *               name: { type: string }
   *               type: { type: string }
   *               industry: { type: string }
   *               website: { type: string }
   *           example:
   *             tenant_id: "550e8400-e29b-41d4-a716-446655440000"
   *             name: "Acme Corporation"
   *             type: "customer"
   *             industry: "Technology"
   *             website: "https://acme.example.com"
   *     responses:
   *       200:
   *         description: Account created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     tenant_id:
   *                       type: string
   *                       format: uuid
   *                     name:
   *                       type: string
   *                     type:
   *                       type: string
   *                     industry:
   *                       type: string
   *                     website:
   *                       type: string
   *                     created_at:
   *                       type: string
   *                       format: date-time
   */

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

  // GET /api/accounts - List accounts (with caching)
  router.get("/", cacheList('accounts', 180), async (req, res) => {
    try {
      let { tenant_id, type } = req.query;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase.from('accounts').select('*', { count: 'exact' });
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      if (type) q = q.eq('type', type);
      q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      const accounts = (data || []).map(expandMetadata);

      res.json({
        status: "success",
        data: {
          accounts,
          total: count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error("Error listing accounts:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/accounts - Create account (invalidate cache)
  router.post("/", invalidateCache('accounts'), async (req, res) => {
    try {
      const { tenant_id, name, type, industry, website, phone, email, description, 
              annual_revenue, employee_count, street, city, state, zip, country } = req.body;

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

      const nowIso = new Date().toISOString();
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('accounts')
        .insert([{
          tenant_id,
          name,
          type,
          industry,
          website,
          phone: phone || null,
          email: email || null,
          description: description || null,
          annual_revenue: annual_revenue || null,
          employee_count: employee_count || null,
          street: street || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
          country: country || null,
          created_at: nowIso,
          updated_at: nowIso,
        }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      res.json({
        status: "success",
        message: "Account created",
        data,
      });
    } catch (error) {
      console.error("Error creating account:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // GET /api/accounts/:id - Get single account (centralized tenant/id scoping)
  /**
   * @openapi
   * /api/accounts/{id}:
   *   get:
   *     summary: Get account by ID
   *     tags: [accounts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: tenant_id
   *         schema: { type: string, nullable: true }
   *     responses:
   *       200:
   *         description: Account details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   put:
   *     summary: Update account
   *     tags: [accounts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Account updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   delete:
   *     summary: Delete account
   *     tags: [accounts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Account deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get("/:id", tenantScopedId(), async (req, res) => {
    try {
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase.from('accounts').select('*').eq('id', req.idScope.id);
      if (req.idScope.tenant_id) q = q.eq('tenant_id', req.idScope.tenant_id);
      const { data, error } = await q.single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({
          status: "error",
          message: "Account not found",
        });
      }
      if (error) throw new Error(error.message);

      const account = expandMetadata(data);
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
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('v_account_related_people')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('account_id', id)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return res.json({ status: 'success', data: { people: data || [] } });
    } catch (error) {
      console.error('[Accounts] related-people error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/accounts/:id - Update account (invalidate cache)
  router.put("/:id", invalidateCache('accounts'), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, type, industry, website, phone, email, description,
              annual_revenue, employee_count, street, city, state, zip, country,
              metadata, ...otherFields } = req.body;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data: current, error: fetchErr } = await supabase
        .from('accounts')
        .select('metadata')
        .eq('id', id)
        .single();
      if (fetchErr?.code === 'PGRST116') {
        return res.status(404).json({
          status: "error",
          message: "Account not found",
        });
      }
      if (fetchErr) throw new Error(fetchErr.message);

      const currentMetadata = current?.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields,
      };

      const payload = { metadata: updatedMetadata, updated_at: new Date().toISOString() };
      if (name !== undefined) payload.name = name;
      if (type !== undefined) payload.type = type;
      if (industry !== undefined) payload.industry = industry;
      if (website !== undefined) payload.website = website;
      if (phone !== undefined) payload.phone = phone;
      if (email !== undefined) payload.email = email;
      if (description !== undefined) payload.description = description;
      if (annual_revenue !== undefined) payload.annual_revenue = annual_revenue;
      if (employee_count !== undefined) payload.employee_count = employee_count;
      if (street !== undefined) payload.street = street;
      if (city !== undefined) payload.city = city;
      if (state !== undefined) payload.state = state;
      if (zip !== undefined) payload.zip = zip;
      if (country !== undefined) payload.country = country;

      const { data, error } = await supabase
        .from('accounts')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({
          status: "error",
          message: "Account not found",
        });
      }
      if (error) throw new Error(error.message);

      const updatedAccount = expandMetadata(data);

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

  // DELETE /api/accounts/:id - Delete account (invalidate cache)
  router.delete("/:id", invalidateCache('accounts'), async (req, res) => {
    try {
      const { id } = req.params;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) return res.status(404).json({
        status: "error",
        message: "Account not found",
      });

      res.json({
        status: "success",
        message: "Account deleted",
        data: { id: data.id },
      });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  return router;
}
