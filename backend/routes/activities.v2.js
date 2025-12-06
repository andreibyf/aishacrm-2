import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildActivityAiContext } from '../lib/aiContextEnricher.js';

export default function createActivityV2Routes(_pgPool) {
  const router = express.Router();

  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata, body, ...rest } = record;
    const metadataObj = metadata && typeof metadata === 'object' ? metadata : {};

    const description = body ?? metadataObj.description ?? null;
    const type = rest.type ?? metadataObj.type ?? null;
    const competitor = rest.competitor ?? metadataObj.competitor ?? '';
    const lead_source = rest.lead_source ?? metadataObj.lead_source ?? null;
    const is_test_data =
      typeof rest.is_test_data === 'boolean'
        ? rest.is_test_data
        : (typeof metadataObj.is_test_data === 'boolean' ? metadataObj.is_test_data : false);
    const duration_minutes =
      rest.duration_minutes ?? metadataObj.duration_minutes ?? null;
    const tags = Array.isArray(rest.tags)
      ? rest.tags
      : Array.isArray(metadataObj.tags)
        ? metadataObj.tags
        : [];

    return {
      ...metadataObj,
      ...rest,
      description,
      type,
      competitor,
      lead_source,
      is_test_data,
      duration_minutes,
      tags,
      metadata: metadataObj,
    };
  };

  router.get('/', async (req, res) => {
    try {
      const { tenant_id, filter } = req.query;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);
      const includeStats = req.query.include_stats === 'true' || req.query.include_stats === '1';

      let q = supabase
        .from('activities')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (filter) {
        let parsed = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsed = JSON.parse(filter);
          } catch {
            // ignore
          }
        }
        if (parsed && typeof parsed === 'object') {
          if (parsed.status) q = q.eq('status', parsed.status);
          if (parsed.type) q = q.eq('type', parsed.type);
          if (parsed.related_id) q = q.eq('related_id', parsed.related_id);
        }
      }

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      const activities = (data || []).map(expandMetadata);

      // Compute counts if requested
      let counts = null;
      if (includeStats) {
        // Fetch all activities for this tenant to compute status counts
        const { data: allData, error: allError } = await supabase
          .from('activities')
          .select('status, due_date, due_time')
          .eq('tenant_id', tenant_id);

        if (!allError && allData) {
          const now = new Date();
          const buildDueDateTime = (a) => {
            if (!a.due_date) return null;
            try {
              if (a.due_time) {
                const [h, m, s] = a.due_time.split(':');
                const date = new Date(a.due_date);
                date.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, parseInt(s || '0', 10) || 0, 0);
                return date;
              }
              const date = new Date(a.due_date);
              date.setHours(23, 59, 59, 999);
              return date;
            } catch { return new Date(a.due_date); }
          };

          counts = {
            total: allData.length,
            scheduled: allData.filter(a => a.status === 'scheduled').length,
            in_progress: allData.filter(a => a.status === 'in_progress' || a.status === 'in-progress').length,
            overdue: allData.filter(a => {
              if (a.status === 'completed' || a.status === 'cancelled') return false;
              const due = buildDueDateTime(a);
              if (!due) return false;
              return due < now;
            }).length,
            completed: allData.filter(a => a.status === 'completed').length,
            cancelled: allData.filter(a => a.status === 'cancelled').length,
          };
        }
      }

      res.json({
        status: 'success',
        data: {
          activities,
          total: count || 0,
          limit,
          offset,
          counts,
        },
      });
    } catch (error) {
      console.error('Error in v2 activities list:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { tenant_id, metadata, description, body, duration_minutes, duration, tags, ...payload } = req.body || {};
      // Accept either duration_minutes or duration (legacy) - prefer duration_minutes
      const durationValue = duration_minutes ?? duration ?? undefined;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const bodyText = description ?? body ?? null;
      const insertPayload = {
        tenant_id,
        ...payload,
        ...(durationValue !== undefined ? { duration_minutes: durationValue } : {}),
        ...(Array.isArray(tags) ? { tags } : {}),
        body: bodyText,
        metadata: metadata && typeof metadata === 'object'
          ? { ...metadata, description: bodyText ?? metadata.description }
          : (bodyText != null ? { description: bodyText } : undefined),
      };

      const { data, error } = await supabase
        .from('activities')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      const created = expandMetadata(data);
      const aiContext = await buildActivityAiContext(created, {});
      
      res.status(201).json({
        status: 'success',
        data: { activity: created, aiContext },
      });
    } catch (error) {
      console.error('Error in v2 activity create:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();

      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Activity not found' });
      }
      if (error) throw new Error(error.message);

      const activity = expandMetadata(data);
      const aiContext = await buildActivityAiContext(activity, {});
      
      res.json({ status: 'success', data: { activity, aiContext } });
    } catch (error) {
      console.error('Error in v2 activity get:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, metadata, description, body, duration_minutes, duration, tags, ...payload } = req.body || {};
      // Accept either duration_minutes or duration (legacy) - prefer duration_minutes
      const durationValue = duration_minutes ?? duration ?? undefined;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const bodyText = description ?? body;
      const updatePayload = {
        ...payload,
        ...(bodyText !== undefined ? { body: bodyText } : {}),
        ...(durationValue !== undefined ? { duration_minutes: durationValue } : {}),
        ...(Array.isArray(tags) ? { tags } : {}),
        ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
      };

      const { data: current, error: fetchErr } = await supabase
        .from('activities')
        .select('metadata')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (fetchErr?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Activity not found' });
      }
      if (fetchErr) throw new Error(fetchErr.message);

      const existingMeta = current?.metadata && typeof current.metadata === 'object' ? current.metadata : {};
      const mergedMeta = {
        ...existingMeta,
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
      };
      if (bodyText !== undefined) {
        mergedMeta.description = bodyText ?? null;
      }
      updatePayload.metadata = mergedMeta;

      const { data, error } = await supabase
        .from('activities')
        .update(updatePayload)
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .single();

      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Activity not found' });
      }
      if (error) throw new Error(error.message);

      const updated = expandMetadata(data);
      res.json({ status: 'success', data: { activity: updated } });
    } catch (error) {
      console.error('Error in v2 activity update:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Activity not found' });
      }

      res.json({ status: 'success', message: 'Activity deleted successfully' });
    } catch (error) {
      console.error('Error in v2 activity delete:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
