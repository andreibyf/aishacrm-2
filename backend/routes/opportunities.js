import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';

export default function createOpportunityRoutes(_pgPool) {
  const router = express.Router();
  /**
   * @openapi
   * /api/opportunities:
   *   get:
   *     summary: List opportunities
   *     tags: [opportunities]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Opportunities list
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
   *                     opportunities:
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
   *                           account_id:
   *                             type: string
   *                             nullable: true
   *                           contact_id:
   *                             type: string
   *                             nullable: true
   *                           stage:
   *                             type: string
   *                             example: prospecting
   *                           amount:
   *                             type: number
   *                             format: float
   *                           probability:
   *                             type: integer
   *                             minimum: 0
   *                             maximum: 100
   *                           close_date:
   *                             type: string
   *                             format: date
   *                           created_at:
   *                             type: string
   *                             format: date-time
   *   post:
   *     summary: Create opportunity
   *     tags: [opportunities]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id]
   *           example:
   *             tenant_id: "550e8400-e29b-41d4-a716-446655440000"
   *             name: "Enterprise Software License"
   *             account_id: "acc_12345"
   *             stage: "prospecting"
   *             amount: 50000
   *             probability: 25
   *             close_date: "2025-12-31"
   *     responses:
   *       201:
   *         description: Opportunity created
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
   *                     account_id:
   *                       type: string
   *                     stage:
   *                       type: string
   *                     amount:
   *                       type: number
   *                     probability:
   *                       type: integer
   *                     close_date:
   *                       type: string
   *                       format: date
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
    if (value === null) return null;
    return value === undefined ? undefined : String(value);
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

  const toTagArray = (value) => {
    if (!Array.isArray(value)) return null;
    return value
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean);
  };

  const MIRRORED_METADATA_KEYS = [
    'lead_id',
    'lead_source',
    'type',
    'tags',
    'amount',
    'stage',
    'probability',
    'close_date',
    'name',
    'account_id',
    'contact_id',
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

  const _assignIntegerField = (target, key, value) => {
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

  const _assignNumericField = (target, key, value) => {
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

  const clampProbability = (value) => {
    const parsed = toInteger(value);
    if (parsed === null) return null;
    return Math.min(100, Math.max(0, parsed));
  };

  // Helper function to expand metadata fields to top-level properties
  // IMPORTANT: Do not let metadata keys override persisted columns (e.g., stage, amount)
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata, ...rest } = record;
    const metadataObj = metadata && typeof metadata === 'object' ? metadata : {};
    return {
      ...metadataObj,
      ...rest,
      metadata: metadataObj,
    };
  };

  // GET /api/opportunities/search - Search opportunities by name or account
  /**
   * @openapi
   * /api/opportunities/search:
   *   get:
   *     summary: Search opportunities by name
   *     tags: [opportunities]
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
  router.get('/search', async (req, res) => {
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
        .from('opportunities')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .or(`name.ilike.${like},description.ilike.${like}`)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);

      const opportunities = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          opportunities,
          total: count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error('Error searching opportunities:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/opportunities - List opportunities with filtering
  router.get('/', async (req, res) => {
    try {
      let { tenant_id, filter, stage, assigned_to } = req.query;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase
        .from('opportunities')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id);

      // Handle assigned_to as direct query parameter (primary way frontend sends filter)
      if (assigned_to !== undefined && assigned_to !== '' && assigned_to !== 'all') {
        q = q.eq('assigned_to', assigned_to);
      }

      // Stage filter (ignore 'all', 'any', '', 'undefined' as they mean no filter)
      if (stage && stage !== 'all' && stage !== 'any' && stage !== '' && stage !== 'undefined') {
        q = q.eq('stage', stage.toLowerCase());
      }

      // Handle is_test_data as direct query parameter
      if (req.query.is_test_data !== undefined) {
        const flag = String(req.query.is_test_data).toLowerCase();
        if (flag === 'false') {
          q = q.or('is_test_data.is.false,is_test_data.is.null');
        } else if (flag === 'true') {
          q = q.eq('is_test_data', true);
        }
      }

      // Handle filter for assigned_to and dynamic search (fallback/legacy)
      if (filter) {
        let parsedFilter = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsedFilter = JSON.parse(filter);
          } catch {
            // treat as literal
          }
        }
        
        // Handle assigned_to filter from filter object (only if not already set via direct param)
        if (typeof parsedFilter === 'object' && parsedFilter.assigned_to !== undefined && assigned_to === undefined) {
          q = q.eq('assigned_to', parsedFilter.assigned_to);
        }

        // Handle is_test_data filter from filter object
        if (typeof parsedFilter === 'object' && parsedFilter.is_test_data !== undefined && req.query.is_test_data === undefined) {
          q = q.eq('is_test_data', parsedFilter.is_test_data);
        }

        // Handle $or for unassigned or dynamic search
        if (typeof parsedFilter === 'object' && parsedFilter.$or && Array.isArray(parsedFilter.$or)) {
          // Check if this is an "unassigned" filter
          const isUnassignedFilter = parsedFilter.$or.some(cond =>
            cond.assigned_to === null || cond.assigned_to === ''
          );

          if (isUnassignedFilter) {
            // For unassigned, check for null or empty string
            q = q.or('assigned_to.is.null,assigned_to.eq.');
          } else {
          // Handle other $or conditions (like search)
            const orConditions = parsedFilter.$or.map(condition => {
              const [field, opObj] = Object.entries(condition)[0];
              if (opObj && opObj.$icontains) {
                return `${field}.ilike.%${opObj.$icontains}%`;
              }
              return null;
            }).filter(Boolean);

            if (orConditions.length > 0) {
              q = q.or(orConditions.join(','));
            }
          }
        }
      }
      
      q = q.order('created_date', { ascending: false })
        .range(offset, offset + limit - 1);
      
      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      
      const opportunities = (data || []).map(expandMetadata);
      
      // Disable caching for dynamic list to avoid stale 304 during rapid updates
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.json({
        status: 'success',
        data: {
          opportunities,
          total: count || 0,
          limit,
          offset
        }
      });
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/opportunities/:id - Get single opportunity (tenant required)
  /**
   * @openapi
   * /api/opportunities/{id}:
   *   get:
   *     summary: Get opportunity by ID
   *     tags: [opportunities]
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
   *         description: Opportunity details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   put:
   *     summary: Update opportunity
   *     tags: [opportunities]
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
   *         description: Opportunity updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   delete:
   *     summary: Delete opportunity
   *     tags: [opportunities]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Opportunity deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }
      if (error) throw new Error(error.message);

      // Disable caching for single record as well
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      const opportunity = expandMetadata(data);
      
      res.json({
        status: 'success',
        data: opportunity
      });
    } catch (error) {
      console.error('Error fetching opportunity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // POST /api/opportunities - Create new opportunity
  router.post('/', async (req, res) => {
    try {
      const {
        tenant_id,
        name,
        description,
        expected_revenue,
        next_step,
        account_id,
        contact_id,
        amount,
        stage,
        probability,
        close_date,
        metadata = {},
        lead_id,
        lead_source,
        type: opportunityType,
        tags,
        assigned_to,
        assigned_to_name,
        ...otherFields
      } = req.body || {};
      
      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const metadataExtras = {};
      if (description !== undefined && description !== null) metadataExtras.description = description;
      if (expected_revenue !== undefined && expected_revenue !== null) metadataExtras.expected_revenue = expected_revenue;
      if (next_step !== undefined && next_step !== null) metadataExtras.next_step = next_step;
      if (lead_id !== undefined && lead_id !== null) metadataExtras.lead_id = lead_id;
      if (lead_source !== undefined && lead_source !== null) metadataExtras.lead_source = lead_source;
      if (opportunityType !== undefined && opportunityType !== null) metadataExtras.type = opportunityType;
      const combinedMetadata = sanitizeMetadataPayload(metadata, otherFields, metadataExtras);

      const nowIso = new Date().toISOString();
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const normalizedStage = typeof stage === 'string' && stage.trim() ? stage.trim().toLowerCase() : 'prospecting';
      const parsedAmount = toNumeric(amount);
      const parsedProbability = clampProbability(probability);
      const opportunityPayload = {
        tenant_id,
        name: name?.trim?.() || null,
        account_id: account_id || null,
        contact_id: contact_id || null,
        lead_id: lead_id || null,
        stage: normalizedStage,
        metadata: combinedMetadata,
        created_at: nowIso,
      };

      opportunityPayload.amount = parsedAmount !== null ? parsedAmount : 0;
      opportunityPayload.probability = parsedProbability !== null ? parsedProbability : 0;
      assignStringField(opportunityPayload, 'close_date', close_date);
      assignTagsField(opportunityPayload, tags);
      if (assigned_to !== undefined) opportunityPayload.assigned_to = assigned_to || null;
      if (assigned_to_name !== undefined) opportunityPayload.assigned_to_name = assigned_to_name || null;

      const { data, error } = await supabase
        .from('opportunities')
        .insert([opportunityPayload])
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      
      const opportunity = expandMetadata(data);
      
      res.status(201).json({
        status: 'success',
        data: opportunity
      });
    } catch (error) {
      console.error('Error creating opportunity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // PUT /api/opportunities/:id - Update opportunity
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        expected_revenue,
        next_step,
        account_id,
        contact_id,
        amount,
        stage,
        probability,
        close_date,
        metadata = {},
        lead_id,
        lead_source,
        type: opportunityType,
        tags,
        assigned_to,
        assigned_to_name,
        ...otherFields
      } = req.body || {};
      let requestedTenantId = req.body?.tenant_id || req.query?.tenant_id || null;

      if (!requestedTenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required for update' });
      }
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data: before, error: fetchErr } = await supabase
        .from('opportunities')
        .select('id, tenant_id, stage, metadata')
        .eq('id', id)
        .eq('tenant_id', requestedTenantId)
        .single();
      if (fetchErr?.code === 'PGRST116') {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }
      if (fetchErr) throw new Error(fetchErr.message);

      const metadataExtras = {};
      if (description !== undefined) metadataExtras.description = description;
      if (expected_revenue !== undefined) metadataExtras.expected_revenue = expected_revenue;
      if (next_step !== undefined) metadataExtras.next_step = next_step;
      if (lead_id !== undefined) metadataExtras.lead_id = lead_id;
      if (lead_source !== undefined) metadataExtras.lead_source = lead_source;
      if (opportunityType !== undefined) metadataExtras.type = opportunityType;
      const updatedMetadata = sanitizeMetadataPayload(before?.metadata, metadata, otherFields, metadataExtras);
      const normalizedStage = typeof stage === 'string' ? stage.trim().toLowerCase() : null;
      
      const payload = { metadata: updatedMetadata, updated_at: new Date().toISOString() };
      if (name !== undefined) payload.name = name?.trim?.() || null;
      if (account_id !== undefined) payload.account_id = account_id || null;
      if (contact_id !== undefined) payload.contact_id = contact_id || null;
      if (lead_id !== undefined) payload.lead_id = lead_id || null;
      if (amount !== undefined) {
        const parsedAmount = toNumeric(amount);
        payload.amount = parsedAmount !== null ? parsedAmount : null;
      }
      if (normalizedStage !== null) payload.stage = normalizedStage;
      if (probability !== undefined) {
        const clamped = clampProbability(probability);
        payload.probability = clamped !== null ? clamped : null;
      }
      assignStringField(payload, 'close_date', close_date);
      assignTagsField(payload, tags);
      if (assigned_to !== undefined) payload.assigned_to = assigned_to || null;
      if (assigned_to_name !== undefined) payload.assigned_to_name = assigned_to_name || null;

      const { data, error } = await supabase
        .from('opportunities')
        .update(payload)
        .eq('id', id)
        .eq('tenant_id', requestedTenantId)
        .select('*')
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found for tenant'
        });
      }
      if (error) throw new Error(error.message);

      if (normalizedStage !== null && data.stage !== normalizedStage) {
        console.warn('[Opportunities PUT] ⚠️  Stage mismatch', {
          expected: normalizedStage,
          persisted: data.stage,
          id: data.id
        });
      }

      const updatedOpportunity = expandMetadata(data);
      
      res.json({
        status: 'success',
        data: updatedOpportunity
      });
    } catch (error) {
      console.error('Error updating opportunity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/opportunities/:id - Delete opportunity
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('opportunities')
        .delete()
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }
      
      res.json({
        status: 'success',
        message: 'Opportunity deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting opportunity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
