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
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildAccountAiContext } from '../lib/aiContextEnricher.js';
import { getVisibilityScope } from '../lib/teamVisibility.js';
import { cacheList, cacheDetail, invalidateCache } from '../lib/cacheMiddleware.js';
import { sanitizeUuidInput } from '../lib/uuidValidator.js';
import logger from '../lib/logger.js';

export default function createAccountV2Routes(_pgPool) {
  const router = express.Router();

  router.use(validateTenantAccess);

  /**
   * Flatten metadata fields into top-level properties for consistent API shape
   */
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata, ...rest } = record;
    const metadataObj = metadata && typeof metadata === 'object' ? metadata : {};

    // Flatten common fields - prefer column value, fallback to metadata
    const address_1 =
      rest.address_1 ?? rest.street ?? metadataObj.address_1 ?? metadataObj.street ?? null;
    const address_2 = rest.address_2 ?? metadataObj.address_2 ?? null;
    const zip = rest.zip ?? metadataObj.zip ?? null;
    const country = rest.country ?? metadataObj.country ?? null;
    const description = rest.description ?? metadataObj.description ?? null;
    const unique_id = rest.unique_id ?? metadataObj.unique_id ?? null;
    const assigned_to = rest.assigned_to ?? metadataObj.assigned_to ?? null;
    const legacy_id = rest.legacy_id ?? metadataObj.legacy_id ?? null;
    const processed_by_ai_doc =
      rest.processed_by_ai_doc ?? metadataObj.processed_by_ai_doc ?? false;
    const ai_doc_source_type = rest.ai_doc_source_type ?? metadataObj.ai_doc_source_type ?? null;
    const is_test_data =
      typeof rest.is_test_data === 'boolean'
        ? rest.is_test_data
        : typeof metadataObj.is_test_data === 'boolean'
          ? metadataObj.is_test_data
          : false;
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
  router.get('/', cacheList('accounts', 30), async (req, res) => {
    try {
      const { tenant_id, type, industry, search, filter, assigned_to, sort } = req.query;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const offset = parseInt(req.query.offset, 10) || 0;

      // ── Team visibility scoping ──
      let visibilityScope = null;
      if (req.user) {
        visibilityScope = await getVisibilityScope(req.user, supabase);
      }

      // Parse sort parameter: -field for descending, field for ascending
      let sortField = 'created_at';
      let sortAscending = false;
      if (sort) {
        if (sort.startsWith('-')) {
          sortField = sort.substring(1);
          sortAscending = false;
        } else {
          sortField = sort;
          sortAscending = true;
        }
      }

      let query = supabase
        .from('accounts')
        .select(
          '*, employee:employees!accounts_assigned_to_fkey(id, first_name, last_name, email)',
          { count: 'exact' },
        )
        .eq('tenant_id', tenant_id)
        .order(sortField, { ascending: sortAscending })
        .range(offset, offset + limit - 1);

      // Apply team visibility filter
      if (visibilityScope && !visibilityScope.bypass && visibilityScope.employeeIds.length > 0) {
        const idList = visibilityScope.employeeIds.join(',');
        query = query.or(`assigned_to.in.(${idList}),assigned_to.is.null`);
      }

      if (type) query = query.eq('type', type);
      if (industry) query = query.eq('industry', industry);
      if (search) query = query.ilike('name', `%${search}%`);

      // Handle complex filter param (JSON string)
      if (filter) {
        let parsed = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsed = JSON.parse(filter);
          } catch {
            // ignore parse errors
          }
        }
        if (parsed && typeof parsed === 'object') {
          // is_test_data handling
          if (parsed.is_test_data !== undefined) {
            if (parsed.is_test_data === false) {
              query = query.or('is_test_data.is.false,is_test_data.is.null');
            } else {
              query = query.eq('is_test_data', parsed.is_test_data);
            }
          }

          // assigned_to via $or including NULL
          if (parsed.$or && Array.isArray(parsed.$or)) {
            const normalizedOr = parsed.$or.filter((c) => c && typeof c === 'object');
            const hasUnassigned = normalizedOr.some((c) => c.assigned_to === null);
            const assignedVals = normalizedOr
              .map((c) => c.assigned_to)
              .filter((v) => v !== undefined && v !== null && String(v).trim() !== '');

            if (hasUnassigned && assignedVals.length === 0) {
              query = query.is('assigned_to', null);
            } else if (assignedVals.length > 0) {
              const orParts = assignedVals.map((v) => `assigned_to.eq.${v}`);
              query = query.or(orParts.join(','));
            }

            // Preserve any ilike search conditions in $or
            const searchOrs = normalizedOr
              .map((condition) => {
                const [field, opObj] = Object.entries(condition)[0] || [];
                if (opObj && opObj.$icontains) {
                  return `${field}.ilike.%${opObj.$icontains}%`;
                }
                return null;
              })
              .filter(Boolean);
            if (searchOrs.length > 0) {
              query = query.or(searchOrs.join(','));
            }
          }
        }
      }

      // Direct assigned_to param (sanitized)
      const safeAssignedTo = sanitizeUuidInput(assigned_to);
      if (safeAssignedTo !== undefined && safeAssignedTo !== null) {
        query = query.eq('assigned_to', safeAssignedTo);
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error('[accounts.v2] List error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }

      const accounts = (data || []).map((account) => {
        const expanded = expandMetadata(account);
        // Add denormalized names from FK joins
        if (account.employee) {
          expanded.assigned_to_name =
            `${account.employee.first_name || ''} ${account.employee.last_name || ''}`.trim();
          expanded.assigned_to_email = account.employee.email;
        }
        delete expanded.employee;
        return expanded;
      });
      return res.json({
        status: 'success',
        data: { accounts, total: count ?? accounts.length, limit, offset },
      });
    } catch (err) {
      logger.error('[accounts.v2] List exception:', err);
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
      const normalizedAssignedTo = sanitizeUuidInput(assigned_to);

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
        assigned_to: normalizedAssignedTo,
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
          assigned_to: normalizedAssignedTo,
          legacy_id: legacy_id || null,
          processed_by_ai_doc: processed_by_ai_doc ?? false,
          ai_doc_source_type: ai_doc_source_type || null,
        },
      };

      const { data, error } = await supabase.from('accounts').insert(insertData).select().single();

      if (error) {
        logger.error('[accounts.v2] Create error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }

      const created = expandMetadata(data);

      // Build AI context asynchronously - don't wait for it
      // This keeps the response fast (~200ms) instead of waiting for AI enrichment (~5+ seconds)
      buildAccountAiContext(created, { tenantId: tenant_id })
        .then((aiContext) => {
          if (aiContext) {
            logger.debug('[accounts.v2] AI context built in background');
          }
        })
        .catch((err) => {
          logger.warn('[accounts.v2] Background AI context building failed:', err.message);
        });

      // Return immediately with created account - AI context will be available on fetch
      return res.status(201).json({
        status: 'success',
        data: { account: created },
      });
    } catch (err) {
      logger.error('[accounts.v2] Create exception:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * Get assignment history for a specific account.
   */
  router.get('/:id/assignment-history', async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = req.query.tenant_id || req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('assignment_history')
        .select('id, assigned_from, assigned_to, assigned_by, action, note, created_at')
        .eq('entity_type', 'account')
        .eq('entity_id', id)
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);

      const empIds = new Set();
      (data || []).forEach((h) => {
        if (h.assigned_from) empIds.add(h.assigned_from);
        if (h.assigned_to) empIds.add(h.assigned_to);
        if (h.assigned_by) empIds.add(h.assigned_by);
      });

      let empMap = {};
      if (empIds.size > 0) {
        const { data: emps } = await supabase
          .from('employees')
          .select('id, first_name, last_name')
          .in('id', [...empIds]);
        (emps || []).forEach((e) => {
          empMap[e.id] = `${e.first_name || ''} ${e.last_name || ''}`.trim();
        });
      }

      const history = (data || []).map((h) => ({
        ...h,
        assigned_from_name: empMap[h.assigned_from] || null,
        assigned_to_name: empMap[h.assigned_to] || null,
        assigned_by_name: empMap[h.assigned_by] || null,
      }));

      res.json({ status: 'success', data: history });
    } catch (err) {
      logger.error('[accounts.v2 GET /:id/assignment-history] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
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
  router.get('/:id', cacheDetail('accounts', 60), async (req, res) => {
    try {
      const tenant_id = req.query.tenant_id || req.tenant?.id;
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
      logger.error('[accounts.v2] Get exception:', err);
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
  router.put('/:id', invalidateCache('accounts'), async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body;
      const tenant_id = body.tenant_id || req.query.tenant_id;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Fetch existing record to merge metadata + track assignment changes
      const { data: existing, error: fetchError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (fetchError || !existing) {
        return res.status(404).json({ status: 'error', message: 'Account not found' });
      }

      const previousAssignedTo = existing.assigned_to || null;
      const existingMeta =
        existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};

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
      const normalizedAssignedTo =
        assigned_to !== undefined ? sanitizeUuidInput(assigned_to) : undefined;

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
      if (normalizedAssignedTo !== undefined) updateData.assigned_to = normalizedAssignedTo;
      if (is_test_data !== undefined) updateData.is_test_data = is_test_data;

      // Merge metadata
      const mergedMeta = { ...existingMeta };
      if (address_2 !== undefined) mergedMeta.address_2 = address_2;
      if (zip !== undefined) mergedMeta.zip = zip;
      if (country !== undefined) mergedMeta.country = country;
      if (description !== undefined) mergedMeta.description = description;
      if (tags !== undefined) mergedMeta.tags = tags;
      if (unique_id !== undefined) mergedMeta.unique_id = unique_id;
      if (normalizedAssignedTo !== undefined) mergedMeta.assigned_to = normalizedAssignedTo;
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
        logger.error('[accounts.v2] Update error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }

      // Record assignment change in history (non-blocking)
      const newAssignedTo = data.assigned_to || null;
      if (assigned_to !== undefined && previousAssignedTo !== newAssignedTo) {
        const action = !newAssignedTo ? 'unassign' : !previousAssignedTo ? 'assign' : 'reassign';
        supabase
          .from('assignment_history')
          .insert({
            tenant_id,
            entity_type: 'account',
            entity_id: id,
            assigned_from: previousAssignedTo,
            assigned_to: newAssignedTo,
            assigned_by: req.user?.id || null,
            action,
          })
          .then(({ error: histErr }) => {
            if (histErr)
              logger.warn(
                '[accounts.v2 PUT] Failed to record assignment history:',
                histErr.message,
              );
          });
      }

      return res.json({
        status: 'success',
        data: { account: expandMetadata(data) },
      });
    } catch (err) {
      logger.error('[accounts.v2] Update exception:', err);
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
  router.delete('/:id', invalidateCache('accounts'), async (req, res) => {
    try {
      const { tenant_id } = req.query;
      const { id } = req.params;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('id')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        logger.error('[accounts.v2] Delete error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }

      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Account not found' });
      }

      return res.json({ status: 'success', message: 'Account deleted successfully' });
    } catch (err) {
      logger.error('[accounts.v2] Delete exception:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
