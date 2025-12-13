/**
 * Leads v2 Routes
 * Flattened metadata for cleaner API responses
 * Uses static imports for efficiency
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildLeadAiContext } from '../lib/aiContextEnricher.js';
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';

export default function createLeadsV2Routes() {
  const router = express.Router();

  // Helper to expand metadata fields to top-level
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      // Spread metadata first so DB columns override
      ...metadata,
      ...rest,
      // Keep original metadata for backwards compatibility
      metadata,
    };
  };

  /**
   * @openapi
   * /api/v2/leads:
   *   get:
   *     summary: List leads with flattened metadata
   *     tags: [leads-v2]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: status
   *         schema: { type: string }
   *         description: Filter by status (new, contacted, qualified, etc.)
   *       - in: query
   *         name: source
   *         schema: { type: string }
   *         description: Filter by lead source
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Leads list with flattened metadata
   */
  router.get('/', cacheList('leads', 180), async (req, res) => {
    try {
      const { tenant_id, status, source, account_id, filter, assigned_to, is_test_data } = req.query;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      console.log('[V2 Leads GET] Called with:', { tenant_id, filter, status, assigned_to, is_test_data });

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      let query = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id);

      // Handle filter parameter with $or support
      if (filter) {
        let parsedFilter = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsedFilter = JSON.parse(filter);
            console.log('[V2 Leads] Parsed filter:', JSON.stringify(parsedFilter, null, 2));
          } catch {
            // treat as literal
          }
        }

        // Handle $or for assigned_to filtering
        if (typeof parsedFilter === 'object' && parsedFilter.$or && Array.isArray(parsedFilter.$or)) {
          // Check if this is an "unassigned" filter
          const isUnassignedFilter = parsedFilter.$or.some(cond =>
            cond.assigned_to === null || cond.assigned_to === ''
          );

          if (isUnassignedFilter) {
            console.log('[V2 Leads] Applying unassigned filter');
            // For unassigned, check for null or empty string
            query = query.or('assigned_to.is.null,assigned_to.eq.');
          } else {
            // Check if this is an assigned_to filter (UUID or email matching)
            const assignedToConditions = parsedFilter.$or.filter(cond =>
              cond.assigned_to !== undefined && cond.assigned_to !== null && cond.assigned_to !== ''
            );

            if (assignedToConditions.length > 0) {
              // Build OR condition for assigned_to matching
              console.log('[V2 Leads] Applying assigned_to $or filter:', assignedToConditions);
              const orParts = assignedToConditions.map(cond =>
                `assigned_to.eq.${cond.assigned_to}`
              );
              query = query.or(orParts.join(','));
            }
          }
        }

        // Handle is_test_data filter from parsed filter
        if (typeof parsedFilter === 'object' && parsedFilter.is_test_data !== undefined) {
          console.log('[V2 Leads] Applying is_test_data filter:', parsedFilter.is_test_data);
          if (parsedFilter.is_test_data === false) {
            query = query.or('is_test_data.is.false,is_test_data.is.null');
          } else {
            query = query.eq('is_test_data', parsedFilter.is_test_data);
          }
        }
      }

      // Handle direct query parameters (fallback if no filter param)
      if (status && status !== 'all' && status !== 'any' && status !== '' && status !== 'undefined') {
        let parsedStatus = status;
        if (typeof status === 'string' && status.startsWith('{')) {
          try {
            parsedStatus = JSON.parse(status);
          } catch {
            // treat as literal
          }
        }
        // Handle $nin (not-in) operator for status filtering
        if (typeof parsedStatus === 'object' && parsedStatus.$nin) {
          console.log('[V2 Leads] Applying status $nin from query param:', parsedStatus.$nin);
          // Use NOT IN with Supabase
          query = query.not('status', 'in', `(${parsedStatus.$nin.join(',')})`);
        } else {
          query = query.eq('status', status);
        }
      }
      if (source) query = query.eq('source', source);
      if (account_id) query = query.eq('account_id', account_id);
      if (assigned_to && !filter) query = query.eq('assigned_to', assigned_to);

      // Handle is_test_data from query param
      if (is_test_data !== undefined && !filter) {
        const flag = String(is_test_data).toLowerCase();
        if (flag === 'false') {
          console.log('[V2 Leads] Excluding test data from query param');
          query = query.or('is_test_data.is.false,is_test_data.is.null');
        } else if (flag === 'true') {
          console.log('[V2 Leads] Including only test data from query param');
          query = query.eq('is_test_data', true);
        }
      }

      query = query.order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      const leads = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: { leads, total: count || leads.length },
      });
    } catch (err) {
      console.error('[Leads v2 GET] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/leads:
   *   post:
   *     summary: Create lead with flattened fields
   *     tags: [leads-v2]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, first_name, last_name]
   *             properties:
   *               tenant_id: { type: string, format: uuid }
   *               first_name: { type: string }
   *               last_name: { type: string }
   *               email: { type: string, format: email }
   *               phone: { type: string }
   *               company: { type: string }
   *               job_title: { type: string }
   *               status: { type: string, default: 'new' }
   *               source: { type: string }
   *               score: { type: integer }
   *               estimated_value: { type: number }
   *               address_1: { type: string }
   *               city: { type: string }
   *               state: { type: string }
   *               zip: { type: string }
   *               tags: { type: array, items: { type: string } }
   *     responses:
   *       200:
   *         description: Lead created
   */
  router.post('/', async (req, res) => {
    try {
      const {
        tenant_id,
        first_name,
        last_name,
        email,
        phone,
        company,
        job_title,
        status = 'new',
        source,
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
        account_id,
        is_test_data,
        metadata = {},
      } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      if (!first_name?.trim()) {
        return res.status(400).json({ status: 'error', message: 'first_name is required' });
      }
      if (!last_name?.trim()) {
        return res.status(400).json({ status: 'error', message: 'last_name is required' });
      }

      const nowIso = new Date().toISOString();
      const payload = {
        tenant_id,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        status: status || 'new',
        created_at: nowIso,
        created_date: nowIso,
        updated_at: nowIso,
        metadata,
      };

      // Optional fields
      if (email) payload.email = email;
      if (phone) payload.phone = phone;
      if (company) payload.company = company;
      if (job_title) payload.job_title = job_title;
      if (source) payload.source = source;
      if (account_id) payload.account_id = account_id;
      if (score !== undefined) payload.score = score;
      if (score_reason) payload.score_reason = score_reason;
      if (estimated_value !== undefined) payload.estimated_value = estimated_value;
      if (do_not_call !== undefined) payload.do_not_call = do_not_call;
      if (do_not_text !== undefined) payload.do_not_text = do_not_text;
      if (address_1) payload.address_1 = address_1;
      if (address_2) payload.address_2 = address_2;
      if (city) payload.city = city;
      if (state) payload.state = state;
      if (zip) payload.zip = zip;
      if (country) payload.country = country;
      if (unique_id) payload.unique_id = unique_id;
      if (tags) payload.tags = Array.isArray(tags) ? tags : [];
      if (typeof is_test_data === 'boolean') payload.is_test_data = is_test_data;

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .insert([payload])
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      const created = expandMetadata(data);
      const aiContext = await buildLeadAiContext(created, { tenantId: tenant_id });

      res.json({
        status: 'success',
        message: 'Lead created',
        data: { lead: created, aiContext },
      });
    } catch (err) {
      console.error('[Leads v2 POST] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/leads/{id}:
   *   get:
   *     summary: Get lead by ID with flattened metadata
   *     tags: [leads-v2]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Lead details
   *       404:
   *         description: Lead not found
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ status: 'error', message: 'Lead not found' });
        }
        throw new Error(error.message);
      }

      const lead = expandMetadata(data);
      const aiContext = await buildLeadAiContext(lead, { tenantId: tenant_id });

      res.json({
        status: 'success',
        data: { lead, aiContext },
      });
    } catch (err) {
      console.error('[Leads v2 GET/:id] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/leads/{id}:
   *   put:
   *     summary: Update lead with flattened fields
   *     tags: [leads-v2]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id]
   *     responses:
   *       200:
   *         description: Lead updated
   *       404:
   *         description: Lead not found
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, ...updates } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Build update payload
      const payload = {
        updated_at: new Date().toISOString(),
      };

      // Map allowed fields
      const allowedFields = [
        'first_name', 'last_name', 'email', 'phone', 'company', 'job_title',
        'status', 'source', 'account_id', 'score', 'score_reason', 'estimated_value',
        'do_not_call', 'do_not_text', 'address_1', 'address_2', 'city', 'state',
        'zip', 'country', 'unique_id', 'tags', 'is_test_data', 'metadata',
      ];

      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
          payload[field] = updates[field];
        }
      });

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .update(payload)
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ status: 'error', message: 'Lead not found' });
        }
        throw new Error(error.message);
      }

      res.json({
        status: 'success',
        message: 'Lead updated',
        data: expandMetadata(data),
      });
    } catch (err) {
      console.error('[Leads v2 PUT] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/leads/{id}:
   *   delete:
   *     summary: Delete lead
   *     tags: [leads-v2]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Lead deleted
   *       404:
   *         description: Lead not found
   */
  router.delete('/:id', invalidateCache('leads'), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('id')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ status: 'error', message: 'Lead not found' });
        }
        throw new Error(error.message);
      }

      res.json({
        status: 'success',
        message: 'Lead deleted',
        data: { id: data.id },
      });
    } catch (err) {
      console.error('[Leads v2 DELETE] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
