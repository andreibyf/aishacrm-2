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

  const toNullableString = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    return String(value);
  };

  const toNumeric = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const toInteger = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const MIRRORED_METADATA_KEYS = [
    'name',
    'type',
    'industry',
    'website',
    'phone',
    'email',
    'annual_revenue',
    'employee_count',
    'street',
    'city',
    'state',
    'zip',
    'country',
    'assigned_to'
  ];

  const sanitizeMetadataPayload = (...sources) => {
    const merged = sources.reduce((acc, src) => {
      if (src && typeof src === 'object' && !Array.isArray(src)) {
        Object.assign(acc, src);
      }
      return acc;
    }, {});

    MIRRORED_METADATA_KEYS.forEach((key) => {
      if (key in merged) {
        delete merged[key];
      }
    });

    return merged;
  };

  const assignStringField = (target, key, value) => {
    if (value === undefined) return;
    target[key] = toNullableString(value);
  };

  const assignNumericField = (target, key, value) => {
    if (value === undefined) return;
    target[key] = value === null ? null : toNumeric(value);
  };

  const assignIntegerField = (target, key, value) => {
    if (value === undefined) return;
    target[key] = value === null ? null : toInteger(value);
  };

  const normalizeAccount = (record) => {
    if (!record) return record;
    const metadataObj = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
    return {
      ...metadataObj,
      ...record,
      metadata: metadataObj,
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

      const accounts = (data || []).map(normalizeAccount);

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
      const { tenant_id, name, type, industry, website, phone, email,
        annual_revenue, employee_count, street, city, state, zip, country,
        assigned_to, metadata, ...otherFields } = req.body;

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
      const metadataPayload = sanitizeMetadataPayload(metadata, otherFields);
      const insertPayload = {
        tenant_id,
        name,
        metadata: metadataPayload,
        created_at: nowIso,
        updated_at: nowIso,
      };

      assignStringField(insertPayload, 'type', type);
      assignStringField(insertPayload, 'industry', industry);
      assignStringField(insertPayload, 'website', website);
      assignStringField(insertPayload, 'phone', phone);
      assignStringField(insertPayload, 'email', email);
      assignNumericField(insertPayload, 'annual_revenue', annual_revenue);
      assignIntegerField(insertPayload, 'employee_count', employee_count);
      assignStringField(insertPayload, 'street', street);
      assignStringField(insertPayload, 'city', city);
      assignStringField(insertPayload, 'state', state);
      assignStringField(insertPayload, 'zip', zip);
      assignStringField(insertPayload, 'country', country);
      assignStringField(insertPayload, 'assigned_to', assigned_to);
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('accounts')
        .insert([insertPayload])
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      res.json({
        status: "success",
        message: "Account created",
        data: normalizeAccount(data),
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

      const account = normalizeAccount(data);
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
      const { name, type, industry, website, phone, email,
        annual_revenue, employee_count, street, city, state, zip, country,
        assigned_to, metadata, ...otherFields } = req.body;

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
      const updatedMetadata = sanitizeMetadataPayload(currentMetadata, metadata, otherFields);

      const payload = {
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      };

      assignStringField(payload, 'name', name);
      assignStringField(payload, 'type', type);
      assignStringField(payload, 'industry', industry);
      assignStringField(payload, 'website', website);
      assignStringField(payload, 'phone', phone);
      assignStringField(payload, 'email', email);
      assignNumericField(payload, 'annual_revenue', annual_revenue);
      assignIntegerField(payload, 'employee_count', employee_count);
      assignStringField(payload, 'street', street);
      assignStringField(payload, 'city', city);
      assignStringField(payload, 'state', state);
      assignStringField(payload, 'zip', zip);
      assignStringField(payload, 'country', country);
      assignStringField(payload, 'assigned_to', assigned_to);

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

      const updatedAccount = normalizeAccount(data);

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
