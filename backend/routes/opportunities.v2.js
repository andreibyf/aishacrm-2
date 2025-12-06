import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildOpportunityAiContext } from '../lib/opportunityAiContext.js';

// NOTE: v2 opportunities router for Phase 4.2 internal pilot.
// This implementation is dev-focused and gated by FEATURE_OPPORTUNITIES_V2.

export default function createOpportunityV2Routes(_pgPool) {
  const router = express.Router();

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
      const { tenant_id, filter } = req.query;

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

      // Basic filter passthrough (mirrors v1) for internal use
      if (filter) {
        let parsedFilter = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsedFilter = JSON.parse(filter);
          } catch {
            // treat as literal
          }
        }

        if (typeof parsedFilter === 'object' && parsedFilter.$or && Array.isArray(parsedFilter.$or)) {
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
