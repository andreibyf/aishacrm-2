import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildOpportunityAiContext } from '../lib/opportunityAiContext.js';

// NOTE: v2 opportunities router for Phase 4.2 internal pilot.
// This implementation is dev-focused and gated by FEATURE_OPPORTUNITIES_V2.

export default function createOpportunityV2Routes(_pgPool) {
  const router = express.Router();

  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

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

  // GET /api/v2/opportunities - list opportunities (v2 shape, internal pilot)
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, filter, stage, assigned_to, is_test_data, $or } = req.query;

      console.log('[V2 Opportunities GET] Called with:', { tenant_id, filter, stage, assigned_to, is_test_data, $or });

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      let q = supabase
        .from('opportunities')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id);

      // Handle $or for unassigned filter (highest priority)
      if ($or) {
        try {
          const orConditions = typeof $or === 'string' ? JSON.parse($or) : $or;
          if (Array.isArray(orConditions)) {
            const isUnassignedFilter = orConditions.some(cond => 
              cond.assigned_to === null || cond.assigned_to === ''
            );
            if (isUnassignedFilter) {
              console.log('[V2 Opportunities] Applying unassigned filter from $or query param');
              q = q.or('assigned_to.is.null,assigned_to.eq.');
            }
          }
        } catch (e) {
          console.error('[V2 Opportunities] Failed to parse $or:', e);
        }
      }
      // Handle direct assigned_to parameter (if not unassigned)
      else if (assigned_to) {
        console.log('[V2 Opportunities] Applying assigned_to filter from query param:', assigned_to);
        q = q.eq('assigned_to', assigned_to);
      }

      // Handle stage filter
      if (stage && stage !== 'all' && stage !== 'any' && stage !== '' && stage !== 'undefined') {
        console.log('[V2 Opportunities] Applying stage filter from query param:', stage);
        q = q.eq('stage', stage.toLowerCase());
      }

      // Handle is_test_data filter
      if (is_test_data !== undefined) {
        const flag = String(is_test_data).toLowerCase();
        if (flag === 'false') {
          console.log('[V2 Opportunities] Excluding test data from query param');
          q = q.or('is_test_data.is.false,is_test_data.is.null');
        } else if (flag === 'true') {
          console.log('[V2 Opportunities] Including only test data from query param');
          q = q.eq('is_test_data', true);
        }
      }

      // Basic filter passthrough (mirrors v1) for internal use
      if (filter) {
        let parsedFilter = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsedFilter = JSON.parse(filter);
            console.log('[V2 Opportunities] Parsed filter:', JSON.stringify(parsedFilter, null, 2));
          } catch {
            // treat as literal
          }
        }

        // Handle assigned_to filter (supports UUID, null, or email)
        if (typeof parsedFilter === 'object' && parsedFilter.assigned_to !== undefined) {
          console.log('[V2 Opportunities] Applying assigned_to filter:', parsedFilter.assigned_to);
          q = q.eq('assigned_to', parsedFilter.assigned_to);
        }

        // Handle is_test_data filter
        if (typeof parsedFilter === 'object' && parsedFilter.is_test_data !== undefined) {
          console.log('[V2 Opportunities] Applying is_test_data filter:', parsedFilter.is_test_data);
          q = q.eq('is_test_data', parsedFilter.is_test_data);
        }

        // Handle $or for unassigned (null or empty)
        if (typeof parsedFilter === 'object' && parsedFilter.$or && Array.isArray(parsedFilter.$or)) {
          // Check if this is an "unassigned" filter
          const isUnassignedFilter = parsedFilter.$or.some(cond => 
            cond.assigned_to === null || cond.assigned_to === ''
          );
          
          if (isUnassignedFilter) {
            console.log('[V2 Opportunities] Applying unassigned filter');
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
      console.error('Error in v2 opportunities list:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/v2/opportunities - create opportunity with AI context hook (internal pilot)
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, metadata, lead_source, ...payload } = req.body || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const insertPayload = {
        tenant_id,
        ...payload,
        ...(lead_source ? { lead_source } : {}),
        metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
      };

      const { data, error } = await supabase
        .from('opportunities')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      const created = expandMetadata(data);

      const aiContext = await buildOpportunityAiContext(created, {});

      res.status(201).json({
        status: 'success',
        data: {
          opportunity: created,
          aiContext,
        },
      });
    } catch (error) {
      console.error('Error in v2 opportunity create:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/v2/opportunities/:id - fetch single opportunity (v2 shape)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();

      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Opportunity not found' });
      }
      if (error) throw new Error(error.message);

      const opportunity = expandMetadata(data);

      // Build AI context for single opportunity fetch
      const aiContext = await buildOpportunityAiContext(opportunity, {});

      res.json({
        status: 'success',
        data: {
          opportunity,
          aiContext,
        },
      });
    } catch (error) {
      console.error('Error in v2 opportunity get:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/v2/opportunities/:id - shallow update (v2 shape)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, metadata, lead_source, ...payload } = req.body || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const updatePayload = {
        ...payload,
        ...(lead_source !== undefined ? { lead_source } : {}),
        ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('opportunities')
        .update(updatePayload)
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .single();

      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Opportunity not found' });
      }
      if (error) throw new Error(error.message);

      const updated = expandMetadata(data);

      res.json({
        status: 'success',
        data: {
          opportunity: updated,
        },
      });
    } catch (error) {
      console.error('Error in v2 opportunity update:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/v2/opportunities/:id - delete opportunity
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('opportunities')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Opportunity not found' });
      }

      res.json({
        status: 'success',
        message: 'Opportunity deleted successfully',
      });
    } catch (error) {
      console.error('Error in v2 opportunity delete:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
