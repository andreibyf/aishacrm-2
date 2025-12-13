/**
 * Accounts V2 Routes
 * Streamlined CRUD with flattened metadata fields
 * 
 * @openapi
 * tags:
 *   - name: accounts-v2
 *     description: Accounts API v2 - Streamlined CRUD with flattened metadata
 */

import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildAccountAiContext } from '../lib/aiContextEnricher.js';
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';

export default function createAccountV2Routes(_pgPool) {
  const router = express.Router();

  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  /**
   * Flatten metadata fields into top-level properties for consistent API shape
   */
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata, ...rest } = record;
    const metadataObj = metadata && typeof metadata === 'object' ? metadata : {};

    // Flatten common fields - prefer column value, fallback to metadata
    const address_1 = rest.address_1 ?? rest.street ?? metadataObj.address_1 ?? metadataObj.street ?? null;
    const address_2 = rest.address_2 ?? metadataObj.address_2 ?? null;
    const zip = rest.zip ?? metadataObj.zip ?? null;
    const country = rest.country ?? metadataObj.country ?? null;
    const description = rest.description ?? metadataObj.description ?? null;
    const unique_id = rest.unique_id ?? metadataObj.unique_id ?? null;
    const assigned_to = rest.assigned_to ?? metadataObj.assigned_to ?? null;
    const legacy_id = rest.legacy_id ?? metadataObj.legacy_id ?? null;
    const processed_by_ai_doc = rest.processed_by_ai_doc ?? metadataObj.processed_by_ai_doc ?? false;
    const ai_doc_source_type = rest.ai_doc_source_type ?? metadataObj.ai_doc_source_type ?? null;
    const is_test_data =
      typeof rest.is_test_data === 'boolean'
        ? rest.is_test_data
        : (typeof metadataObj.is_test_data === 'boolean' ? metadataObj.is_test_data : false);
    const tags = Array.isArray(rest.tags)
      ? rest.tags
      : Array.isArray(metadataObj.tags)
        ? metadataObj.tags
        : [];

    return {
      ...rest,
      address_1,
      address_2,
      zip,
      country,
      description,
      unique_id,
      assigned_to,
      legacy_id,
      processed_by_ai_doc,
      ai_doc_source_type,
      is_test_data,
      tags,
      metadata: metadataObj,
    };
  };

  /**
   * @openapi
   * /api/v2/accounts:
   *   get:
   *     tags: [accounts-v2]
   *     summary: List accounts with optional filters
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *       - in: query
   *         name: industry
   *         schema:
   *           type: string
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of accounts
   */
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, type, industry, search } = req.query;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const offset = parseInt(req.query.offset, 10) || 0;

      let query = supabase
        .from('accounts')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (type) query = query.eq('type', type);
      if (industry) query = query.eq('industry', industry);
      if (search) query = query.ilike('name', `%${search}%`);

      const { data, error, count } = await query;

      if (error) {
        console.error('[accounts.v2] List error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }

      const accounts = (data || []).map(expandMetadata);
      return res.json({
        status: 'success',
        data: { accounts, total: count ?? accounts.length, limit, offset },
      });
    } catch (err) {
      console.error('[accounts.v2] List exception:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/accounts:
   *   post:
   *     tags: [accounts-v2]
   *     summary: Create a new account
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - tenant_id
   *               - name
   *             properties:
   *               tenant_id:
   *                 type: string
   *               name:
   *                 type: string
   *               type:
   *                 type: string
   *               industry:
   *                 type: string
   *               website:
   *                 type: string
   *               phone:
   *                 type: string
   *               email:
   *                 type: string
   *               annual_revenue:
   *                 type: number
   *               employee_count:
   *                 type: integer
   *               address_1:
   *                 type: string
   *               city:
   *                 type: string
   *               state:
   *                 type: string
   *               zip:
   *                 type: string
   *               country:
   *                 type: string
   *     responses:
   *       201:
   *         description: Account created
   */
  router.post('/', invalidateCache('accounts'), async (req, res) => {
    try {
      const body = req.body;
      const tenant_id = body.tenant_id || req.query.tenant_id;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      if (!body.name) {
        return res.status(400).json({ status: 'error', message: 'name is required' });
      }

      const supabase = getSupabaseClient();

      // Extract known columns, rest goes to metadata
      const {
        name,
        type,
        industry,
        website,
        phone,
        email,
        annual_revenue,
        employee_count,
        address_1,
        street, // alias for address_1
        address_2,
        city,
        state,
        zip,
        country,
        description,
        tags,
        unique_id,
        assigned_to,
        legacy_id,
        processed_by_ai_doc,
        ai_doc_source_type,
        is_test_data,
        metadata: incomingMetadata,
        tenant_id: _ignoreTenant,
        ...extraFields
      } = body;

      const insertData = {
        tenant_id,
        name,
        type: type || null,
        industry: industry || null,
        website: website || null,
        phone: phone || null,
        email: email || null,
        annual_revenue: annual_revenue ?? null,
        employee_count: employee_count ?? null,
        street: address_1 || street || null,
        city: city || null,
        state: state || null,
        is_test_data: is_test_data ?? false,
        metadata: {
          ...(incomingMetadata || {}),
          ...extraFields,
          address_2: address_2 || null,
          zip: zip || null,
          country: country || null,
          description: description || null,
          tags: Array.isArray(tags) ? tags : [],
          unique_id: unique_id || null,
          assigned_to: assigned_to || null,
          legacy_id: legacy_id || null,
          processed_by_ai_doc: processed_by_ai_doc ?? false,
          ai_doc_source_type: ai_doc_source_type || null,
        },
      };

      const { data, error } = await supabase
        .from('accounts')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('[accounts.v2] Create error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }

      const created = expandMetadata(data);
      const aiContext = await buildAccountAiContext(created, { tenantId: tenant_id });

      return res.status(201).json({
        status: 'success',
        data: { account: created, aiContext },
      });
    } catch (err) {
      console.error('[accounts.v2] Create exception:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/accounts/{id}:
   *   get:
   *     tags: [accounts-v2]
   *     summary: Get account by ID
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Account details
   *       404:
   *         description: Account not found
   */
  router.get('/:id', async (req, res) => {
    try {
      const { tenant_id } = req.query;
      const { id } = req.params;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (error || !data) {
        return res.status(404).json({ status: 'error', message: 'Account not found' });
      }

      const account = expandMetadata(data);
      const aiContext = await buildAccountAiContext(account, { tenantId: tenant_id });

      return res.json({
        status: 'success',
        data: { account, aiContext },
      });
    } catch (err) {
      console.error('[accounts.v2] Get exception:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/accounts/{id}:
   *   put:
   *     tags: [accounts-v2]
   *     summary: Update an account
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id:
   *                 type: string
   *               name:
   *                 type: string
   *               type:
   *                 type: string
   *               industry:
   *                 type: string
   *     responses:
   *       200:
   *         description: Account updated
   *       404:
   *         description: Account not found
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body;
      const tenant_id = body.tenant_id || req.query.tenant_id;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Fetch existing record to merge metadata
      const { data: existing, error: fetchError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (fetchError || !existing) {
        return res.status(404).json({ status: 'error', message: 'Account not found' });
      }

      const existingMeta = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};

      const {
        name,
        type,
        industry,
        website,
        phone,
        email,
        annual_revenue,
        employee_count,
        address_1,
        street,
        address_2,
        city,
        state,
        zip,
        country,
        description,
        tags,
        unique_id,
        assigned_to,
        legacy_id,
        processed_by_ai_doc,
        ai_doc_source_type,
        is_test_data,
        metadata: incomingMetadata,
        tenant_id: _ignoreTenant,
        ...extraFields
      } = body;

      const updateData = {};

      // Only update if provided
      if (name !== undefined) updateData.name = name;
      if (type !== undefined) updateData.type = type;
      if (industry !== undefined) updateData.industry = industry;
      if (website !== undefined) updateData.website = website;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;
      if (annual_revenue !== undefined) updateData.annual_revenue = annual_revenue;
      if (employee_count !== undefined) updateData.employee_count = employee_count;
      if (address_1 !== undefined || street !== undefined) updateData.street = address_1 || street;
      if (city !== undefined) updateData.city = city;
      if (state !== undefined) updateData.state = state;
      if (is_test_data !== undefined) updateData.is_test_data = is_test_data;

      // Merge metadata
      const mergedMeta = { ...existingMeta };
      if (address_2 !== undefined) mergedMeta.address_2 = address_2;
      if (zip !== undefined) mergedMeta.zip = zip;
      if (country !== undefined) mergedMeta.country = country;
      if (description !== undefined) mergedMeta.description = description;
      if (tags !== undefined) mergedMeta.tags = tags;
      if (unique_id !== undefined) mergedMeta.unique_id = unique_id;
      if (assigned_to !== undefined) mergedMeta.assigned_to = assigned_to;
      if (legacy_id !== undefined) mergedMeta.legacy_id = legacy_id;
      if (processed_by_ai_doc !== undefined) mergedMeta.processed_by_ai_doc = processed_by_ai_doc;
      if (ai_doc_source_type !== undefined) mergedMeta.ai_doc_source_type = ai_doc_source_type;
      if (incomingMetadata) Object.assign(mergedMeta, incomingMetadata);
      Object.assign(mergedMeta, extraFields);

      updateData.metadata = mergedMeta;

      const { data, error } = await supabase
        .from('accounts')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select()
        .single();

      if (error) {
        console.error('[accounts.v2] Update error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }

      return res.json({
        status: 'success',
        data: { account: expandMetadata(data) },
      });
    } catch (err) {
      console.error('[accounts.v2] Update exception:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/accounts/{id}:
   *   delete:
   *     tags: [accounts-v2]
   *     summary: Delete an account
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Account deleted
   *       404:
   *         description: Account not found
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { tenant_id } = req.query;
      const { id } = req.params;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id);

      if (error) {
        console.error('[accounts.v2] Delete error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }

      return res.json({ status: 'success', message: 'Account deleted successfully' });
    } catch (err) {
      console.error('[accounts.v2] Delete exception:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
