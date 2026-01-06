/**
 * Lead Routes
 * Full CRUD operations with PostgreSQL database
 */

import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';
import {
  extractPersonDataFromLead,
  buildContactProvenanceMetadata,
  determineConversionAction,
  validateLeadConversion,
  determineContactType
} from '../utils/conversionHelpers.js';

export default function createLeadRoutes(_pgPool) {
  const router = express.Router();
  /**
   * @openapi
   * /api/leads:
   *   get:
   *     summary: List leads
   *     tags: [leads]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: status
   *         schema: { oneOf: [ { type: string }, { type: object } ] }
   *       - in: query
   *         name: account_id
   *         schema: { type: string, nullable: true }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Leads list
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
   *                     leads:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           tenant_id:
   *                             type: string
   *                             format: uuid
   *                           first_name:
   *                             type: string
   *                           last_name:
   *                             type: string
   *                           email:
   *                             type: string
   *                             format: email
   *                           phone:
   *                             type: string
   *                           company:
   *                             type: string
   *                           status:
   *                             type: string
   *                             example: new
   *                           source:
   *                             type: string
   *                           account_id:
   *                             type: string
   *                             nullable: true
   *                           created_at:
   *                             type: string
   *                             format: date-time
   *   post:
   *     summary: Create lead
   *     tags: [leads]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, first_name, last_name]
   *           example:
   *             tenant_id: "550e8400-e29b-41d4-a716-446655440000"
   *             first_name: "John"
   *             last_name: "Smith"
   *             email: "john.smith@example.com"
   *             phone: "+1-555-9876"
   *             company: "Smith Industries"
   *             status: "new"
   *             source: "website"
   *     responses:
   *       200:
   *         description: Lead created
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
   *                     first_name:
   *                       type: string
   *                     last_name:
   *                       type: string
   *                     email:
   *                       type: string
   *                     phone:
   *                       type: string
   *                     company:
   *                       type: string
   *                     status:
   *                       type: string
   *                     created_at:
   *                       type: string
   *                       format: date-time
   */

  // Apply tenant validation and employee data scope to all routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  const toNullableString = (value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    return null;
  };

  const toInteger = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const toNumeric = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const toBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    }
    return null;
  };

  const toTagArray = (value) => {
    if (!Array.isArray(value)) return null;
    return value
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean);
  };

  const MIRRORED_METADATA_KEYS = [
    'score',
    'score_reason',
    'estimated_value',
    'do_not_call',
    'do_not_text',
    'address_1',
    'address_2',
    'city',
    'state',
    'zip',
    'country',
    'unique_id',
    'tags',
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
    if (value === null) {
      target[key] = null;
      return;
    }
    target[key] = toNullableString(value);
  };

  const assignIntegerField = (target, key, value) => {
    if (value === undefined) return;
    if (value === null) {
      target[key] = null;
      return;
    }
    const parsed = toInteger(value);
    if (parsed !== null) {
      target[key] = parsed;
    }
  };

  const assignNumericField = (target, key, value) => {
    if (value === undefined) return;
    if (value === null) {
      target[key] = null;
      return;
    }
    const parsed = toNumeric(value);
    if (parsed !== null) {
      target[key] = parsed;
    }
  };

  const assignBooleanField = (target, key, value) => {
    if (value === undefined) return;
    if (value === null) {
      target[key] = null;
      return;
    }
    const parsed = toBoolean(value);
    if (parsed !== null) {
      target[key] = parsed;
    }
  };

  const assignTagsField = (target, value) => {
    if (value === undefined) return;
    if (value === null) {
      target.tags = null;
      return;
    }
    const parsed = toTagArray(value);
    if (parsed !== null) {
      target.tags = parsed;
    }
  };

// Helper function to expand metadata fields to top-level properties
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...metadata,
      ...rest,
      metadata,
    };
  };

  // GET /api/leads/search - Search leads by name/email/company
  /**
   * @openapi
   * /api/leads/search:
   *   get:
   *     summary: Search leads by name, email, or company
   *     tags: [leads]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: q
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 25 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Search results
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/search', cacheList('leads', 180), async (req, res) => {
    try {
      let { tenant_id, q = '' } = req.query;
      const limit = parseInt(req.query.limit || '25', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      if (!q || !q.trim()) {
        return res.status(400).json({ status: 'error', message: 'q is required' });
      }

      const like = `%${q}%`;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error, count } = await supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},company.ilike.${like}`)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);

      const leads = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          leads,
          total: count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      logger.error('Error searching leads:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/leads - List leads
  router.get('/', cacheList('leads', 180), async (req, res) => {
    try {
      let { tenant_id, status, account_id, filter } = req.query;
      const isTestData = req.query.is_test_data;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase.from('leads').select('*', { count: 'exact' }).eq('tenant_id', tenant_id);

      // Honor is_test_data filter when provided
      // When false: exclude test data (show only real data: false or NULL)
      // When true: show only test data (is_test_data = true)
      if (typeof isTestData !== 'undefined') {
        const flag = String(isTestData).toLowerCase();
        if (flag === 'false') {
          try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore if column absent */ }
        } else if (flag === 'true') {
          try { q = q.eq('is_test_data', true); } catch { /* ignore if column absent */ }
        }
      }

      // Handle $or filter for dynamic search (frontend passes filter as JSON string)
      if (filter) {
        let parsedFilter = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsedFilter = JSON.parse(filter);
            logger.debug('[Leads] Parsed filter:', JSON.stringify(parsedFilter, null, 2));
          } catch {
            // treat as literal
          }
        }

        // Handle assigned_to filter (supports UUID, null, or email)
        if (typeof parsedFilter === 'object' && parsedFilter.assigned_to !== undefined) {
          logger.debug('[Leads] Applying assigned_to filter:', parsedFilter.assigned_to);
          q = q.eq('assigned_to', parsedFilter.assigned_to);
        }

        // Handle is_test_data filter from parsed filter object
        if (typeof parsedFilter === 'object' && parsedFilter.is_test_data !== undefined) {
          logger.debug('[Leads] Applying is_test_data filter:', parsedFilter.is_test_data);
          q = q.eq('is_test_data', parsedFilter.is_test_data);
        }
        
        // Handle $or for unassigned or dynamic search
        if (typeof parsedFilter === 'object' && parsedFilter.$or && Array.isArray(parsedFilter.$or)) {
          // Check if this is an "unassigned" filter
          const isUnassignedFilter = parsedFilter.$or.some(cond => 
            cond.assigned_to === null || cond.assigned_to === ''
          );
          
          if (isUnassignedFilter) {
            logger.debug('[Leads] Applying unassigned filter');
            // For unassigned, check for null or empty string
            q = q.or('assigned_to.is.null,assigned_to.eq.');
          } else {
            // Handle other $or conditions (like search)
            // Build OR condition: match any of the $or criteria
            // Use Supabase's or() method for multiple OR conditions
            const orConditions = parsedFilter.$or.map(condition => {
              // Each condition is like { first_name: { $icontains: "search_term" } }
              const [field, opObj] = Object.entries(condition)[0];
              if (opObj && opObj.$icontains) {
                return `${field}.ilike.%${opObj.$icontains}%`;
              }
              return null;
            }).filter(Boolean);
            
            if (orConditions.length > 0) {
              // Use Supabase or() to combine conditions with OR logic
              q = q.or(orConditions.join(','));
            }
          }
        }
      }

      if (status && status !== 'all' && status !== 'any' && status !== '' && status !== 'undefined') {
        let parsedStatus = status;
        if (typeof status === 'string' && status.startsWith('{')) {
          try {
            parsedStatus = JSON.parse(status);
          } catch {
            // treat as literal
          }
        }
        if (typeof parsedStatus === 'object' && parsedStatus.$nin) {
          // NOT IN: filter out these statuses
          for (const s of parsedStatus.$nin) {
            q = q.neq('status', s);
          }
        } else {
          q = q.eq('status', status);
        }
      }
      if (account_id) q = q.eq('account_id', account_id);
      q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      const leads = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: { leads, total: count || 0, status, limit, offset },
      });
    } catch (error) {
      logger.error('Error listing leads:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/leads - Create lead
  router.post('/', invalidateCache('leads'), async (req, res) => {
    try {
      const {
        tenant_id,
        first_name,
        last_name,
        email,
        phone,
        company,
        job_title,
        title,
        description,
        status = 'new',
        source,
        metadata = {},
        is_test_data,
        score,
        score_reason,
        estimated_value,
        do_not_call,
        do_not_text,
        address_1,
        address_2,
        city,
        state,
        zip,
        country,
        unique_id,
        tags,
        assigned_to,
        assigned_to_name,
        account_id,
        ...otherFields
      } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Validate required name fields
      if (!first_name || !first_name.trim()) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'first_name is required and cannot be empty',
          field: 'first_name'
        });
      }

      if (!last_name || !last_name.trim()) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'last_name is required and cannot be empty',
          field: 'last_name'
        });
      }

      const normalizedStatus = typeof status === 'string' && status.trim() ? status.trim() : 'new';
      const metadataExtras = {};
      if (title !== undefined && title !== null) metadataExtras.title = title;
      if (description !== undefined && description !== null) metadataExtras.description = description;
      if (account_id !== undefined) metadataExtras.account_id = account_id;
      const combinedMetadata = sanitizeMetadataPayload(metadata, otherFields, metadataExtras);

      const nowIso = new Date().toISOString();
      const leadPayload = {
        tenant_id,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        status: normalizedStatus,
        metadata: combinedMetadata,
        created_at: nowIso,
        created_date: nowIso,
        updated_at: nowIso,
      };

      assignStringField(leadPayload, 'email', email);
      assignStringField(leadPayload, 'phone', phone);
      assignStringField(leadPayload, 'company', company);
      assignStringField(leadPayload, 'job_title', job_title);
      assignStringField(leadPayload, 'source', source);
      assignStringField(leadPayload, 'score_reason', score_reason);
      assignStringField(leadPayload, 'address_1', address_1);
      assignStringField(leadPayload, 'address_2', address_2);
      assignStringField(leadPayload, 'city', city);
      assignStringField(leadPayload, 'state', state);
      assignStringField(leadPayload, 'zip', zip);
      assignStringField(leadPayload, 'country', country);
      assignStringField(leadPayload, 'unique_id', unique_id);
      assignIntegerField(leadPayload, 'score', score);
      assignNumericField(leadPayload, 'estimated_value', estimated_value);
      assignBooleanField(leadPayload, 'do_not_call', do_not_call);
      assignBooleanField(leadPayload, 'do_not_text', do_not_text);
      assignTagsField(leadPayload, tags);
      if (typeof is_test_data === 'boolean') {
        leadPayload.is_test_data = is_test_data;
      }
      if (assigned_to !== undefined) leadPayload.assigned_to = assigned_to || null;
      if (assigned_to_name !== undefined) leadPayload.assigned_to_name = assigned_to_name || null;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .insert([leadPayload])
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      const lead = expandMetadata(data);

      logger.debug('[Leads POST] Successfully created lead:', lead.id);
      res.status(201).json({
        status: 'success',
        message: 'Lead created',
        data: { lead },
      });
    } catch (error) {
      logger.error('Error creating lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/leads/:id - Get single lead (tenant required)
  /**
   * @openapi
   * /api/leads/{id}:
   *   get:
   *     summary: Get lead by ID
   *     tags: [leads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Lead details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   put:
   *     summary: Update lead
   *     tags: [leads]
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
   *         description: Lead updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   delete:
   *     summary: Delete lead
   *     tags: [leads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Lead deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }
      if (error) throw new Error(error.message);

      const lead = expandMetadata(data);

      res.json({
        status: 'success',
        data: { lead },
      });
    } catch (error) {
      logger.error('Error fetching lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/leads/:id - Update lead
  router.put('/:id', invalidateCache('leads'), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        first_name,
        last_name,
        email,
        phone,
        title,
        description,
        company,
        job_title,
        status,
        source,
        metadata = {},
        is_test_data,
        score,
        score_reason,
        estimated_value,
        do_not_call,
        do_not_text,
        address_1,
        address_2,
        city,
        state,
        zip,
        country,
        unique_id,
        tags,
        assigned_to,
        assigned_to_name,
        account_id,
        ...otherFields
      } = req.body;

      // Validate required name fields if provided
      if (first_name !== undefined && (!first_name || !first_name.trim())) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'first_name cannot be empty',
          field: 'first_name'
        });
      }

      if (last_name !== undefined && (!last_name || !last_name.trim())) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'last_name cannot be empty',
          field: 'last_name'
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data: current, error: fetchErr } = await supabase
        .from('leads')
        .select('metadata')
        .eq('id', id)
        .single();
      if (fetchErr?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }
      if (fetchErr) throw new Error(fetchErr.message);

      const metadataExtras = {};
      if (title !== undefined) metadataExtras.title = title;
      if (description !== undefined) metadataExtras.description = description;
      if (account_id !== undefined) metadataExtras.account_id = account_id;
      const updatedMetadata = sanitizeMetadataPayload(current?.metadata, metadata, otherFields, metadataExtras);

      const payload = { metadata: updatedMetadata, updated_at: new Date().toISOString() };
      if (first_name !== undefined) payload.first_name = first_name.trim();
      if (last_name !== undefined) payload.last_name = last_name.trim();
      assignStringField(payload, 'email', email);
      assignStringField(payload, 'phone', phone);
      assignStringField(payload, 'company', company);
      assignStringField(payload, 'job_title', job_title);
      assignStringField(payload, 'source', source);
      assignStringField(payload, 'score_reason', score_reason);
      assignStringField(payload, 'address_1', address_1);
      assignStringField(payload, 'address_2', address_2);
      assignStringField(payload, 'city', city);
      assignStringField(payload, 'state', state);
      assignStringField(payload, 'zip', zip);
      assignStringField(payload, 'country', country);
      assignStringField(payload, 'unique_id', unique_id);
      if (status !== undefined) {
        if (status === null) {
          payload.status = null;
        } else if (typeof status === 'string') {
          payload.status = status.trim() || null;
        } else {
          payload.status = status;
        }
      }
      assignIntegerField(payload, 'score', score);
      assignNumericField(payload, 'estimated_value', estimated_value);
      assignBooleanField(payload, 'do_not_call', do_not_call);
      assignBooleanField(payload, 'do_not_text', do_not_text);
      assignTagsField(payload, tags);
      if (typeof is_test_data === 'boolean') payload.is_test_data = is_test_data;
      if (assigned_to !== undefined) payload.assigned_to = assigned_to || null;
      if (assigned_to_name !== undefined) payload.assigned_to_name = assigned_to_name || null;

      const { data, error } = await supabase
        .from('leads')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }
      if (error) throw new Error(error.message);

      const updatedLead = expandMetadata(data);

      res.json({
        status: 'success',
        message: 'Lead updated',
        data: { lead: updatedLead },
      });
    } catch (error) {
      logger.error('Error updating lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/leads/:id - Delete lead
  router.delete('/:id', invalidateCache('leads'), async (req, res) => {
    try {
      const { id } = req.params;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) return res.status(404).json({ status: 'error', message: 'Lead not found' });

      res.json({
        status: 'success',
        message: 'Lead deleted',
        data: { id: data.id },
      });
    } catch (error) {
      logger.error('Error deleting lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/leads/:id/convert - Convert lead to contact/opportunity
  /**
   * @openapi
   * /api/leads/{id}/convert:
   *   post:
   *     summary: Convert lead
   *     description: Convert a lead into a contact and optionally create an account and opportunity.
   *     tags: [leads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id: { type: string }
   *               create_account: { type: boolean }
   *               account_name: { type: string }
   *               selected_account_id: { type: string, nullable: true }
   *               create_opportunity: { type: boolean }
   *               opportunity_name: { type: string }
   *               opportunity_amount: { type: number }
   *     responses:
   *       200:
   *         description: Lead converted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.post('/:id/convert', invalidateCache('leads'), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        tenant_id,
        performed_by,
        create_account = false,
        account_name,
        selected_account_id,
        create_opportunity = false,
        opportunity_name,
        opportunity_amount,
      } = req.body || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Fetch the lead
      const { data: lead, error: leadErr } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();
      if (leadErr?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }
      if (leadErr) throw new Error(leadErr.message);

      // Prepare bookkeeping for compensating actions if something fails
      let accountId = selected_account_id || null;
      let newAccount = null;
      let contact = null;
      let opportunity = null;

      try {
        // Create account if requested
        if (!accountId && create_account) {
          const name = (account_name || lead.company || '').trim();
          if (!name) throw new Error('Account name is required to create a new account');
          const nowIso = new Date().toISOString();
          const { data: acc, error: accErr } = await supabase
            .from('accounts')
            .insert([{
              tenant_id,
              name,
              phone: lead.phone || null,
              assigned_to: lead.assigned_to || performed_by || null,
              created_at: nowIso,
              updated_at: nowIso,
            }])
            .select('*')
            .single();
          if (accErr) throw new Error(accErr.message);
          newAccount = acc;
          accountId = newAccount.id;
        }

        // ========== v3.0.0 CONVERSION LOGIC ==========
        // Validate lead can be converted
        const validation = validateLeadConversion(lead);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // Determine contact type (preserves B2B/B2C classification)
        const contactType = determineContactType(lead.lead_type);

        // Extract person data from lead
        const personData = extractPersonDataFromLead(lead);

        // Build comprehensive provenance metadata
        const provenanceMetadata = buildContactProvenanceMetadata(lead);

        // Determine conversion action
        const conversionAction = determineConversionAction(lead.status);
        logger.info(`[Lead Conversion] Converting lead ${lead.id} with action: ${conversionAction}`);

        // Create contact from lead (v3.0.0: preserves account_id, captures full provenance)
        const nowIso = new Date().toISOString();
        const { data: cont, error: contErr } = await supabase
          .from('contacts')
          .insert([{
            tenant_id,
            account_id: accountId || lead.account_id || null,  // Preserve v3.0.0 account relationship
            first_name: personData.first_name,
            last_name: personData.last_name,
            email: personData.email,
            phone: personData.phone,
            job_title: personData.job_title,
            status: 'prospect',
            metadata: provenanceMetadata,  // Full lifecycle provenance
            assigned_to: lead.assigned_to || performed_by || null,
            created_at: nowIso,
            updated_at: nowIso,
          }])
          .select('*')
          .single();
        if (contErr) throw new Error(contErr.message);
        contact = cont;
        
        logger.debug('[Leads Convert v3.0.0] Contact created:', {
          contact_id: contact.id,
          account_id: accountId || lead.account_id,
          lead_type: contactType,
          has_provenance: !!provenanceMetadata.converted_from_lead_id
        });

        // Optionally create Opportunity
        if (create_opportunity) {
          const oppName = (opportunity_name && opportunity_name.trim()) || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'New Opportunity';
          const oppAmt = Number(opportunity_amount || lead.estimated_value || 0) || 0;
          const closeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const { data: opp, error: oppErr } = await supabase
            .from('opportunities')
            .insert([{
              tenant_id,
              name: oppName,
              account_id: accountId || null,
              contact_id: contact.id,
              stage: 'prospecting',
              amount: oppAmt,
              probability: 25,
              assigned_to: lead.assigned_to || performed_by || null,
              close_date: closeDate,
              created_at: nowIso,
              updated_at: nowIso,
            }])
            .select('*')
            .single();
          if (oppErr) throw new Error(oppErr.message);
          opportunity = opp;
        }

        // Re-link Activities from lead -> contact
        await supabase
          .from('activities')
          .update({ related_to: 'contact', related_id: contact.id })
          .eq('tenant_id', tenant_id)
          .eq('related_to', 'lead')
          .eq('related_id', lead.id);

        // Re-link opportunities that reference this lead (best-effort)
        try {
          // TODO: PostgREST doesn't support jsonb ->> operator directly; skip metadata-based lookup
          // Instead try description ILIKE
          await supabase
            .from('opportunities')
            .update({
              contact_id: contact.id,
              account_id: accountId || null,
              updated_at: nowIso,
            })
            .eq('tenant_id', tenant_id)
            .ilike('description', `%[Lead:${lead.id}]%`);

          logger.debug('[Leads] Converted: attempted to relink opportunities by description');
        } catch (oppLinkErr) {
          logger.warn('[Leads] Failed to relink opportunities from lead', oppLinkErr);
        }

        // Record transition snapshot
        const transLib = await import('../lib/transitions.js');
        await transLib.logEntityTransition(supabase, {
          tenant_id,
          from_table: 'leads',
          from_id: lead.id,
          to_table: 'contacts',
          to_id: contact.id,
          action: 'convert',
          performed_by,
          snapshot: lead,
        });

        // Delete lead
        await supabase.from('leads').delete().eq('id', lead.id).eq('tenant_id', tenant_id);

        return res.json({
          status: 'success',
          message: 'Lead converted and moved to contacts',
          data: { contact, account: newAccount, opportunity }
        });

      } catch (innerErr) {
        // Compensate created records when running without DB transactions (best-effort)
        logger.error('[Leads] conversion inner error, attempting cleanup:', innerErr.message || innerErr);
        try {
          if (opportunity && opportunity.id) await supabase.from('opportunities').delete().eq('id', opportunity.id).eq('tenant_id', tenant_id);
        } catch (e) { logger.warn('Cleanup opportunity failed', e.message || e); }
        try {
          if (contact && contact.id) await supabase.from('contacts').delete().eq('id', contact.id).eq('tenant_id', tenant_id);
        } catch (e) { logger.warn('Cleanup contact failed', e.message || e); }
        try {
          if (newAccount && newAccount.id) await supabase.from('accounts').delete().eq('id', newAccount.id).eq('tenant_id', tenant_id);
        } catch (e) { logger.warn('Cleanup account failed', e.message || e); }

        logger.error('[Leads] convert error:', innerErr);
        return res.status(500).json({ status: 'error', message: innerErr.message || String(innerErr) });
      }
    } catch (error) {
      logger.error('[Leads] convert error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
