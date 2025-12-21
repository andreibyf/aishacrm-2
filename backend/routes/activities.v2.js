import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildActivityAiContext } from '../lib/aiContextEnricher.js';
import { cacheList, cacheDetail, invalidateCache } from '../lib/cacheMiddleware.js';

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

  router.get('/', cacheList('activities', 180), async (req, res) => {
    try {
      const { tenant_id, filter } = req.query;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);
      // Enable stats when explicitly requested via query param
      const includeStats = req.query.include_stats === 'true' || req.query.include_stats === '1';

      let q = supabase
        .from('activities')
        .select('*, employee:employees!activities_assigned_to_fkey(id, first_name, last_name, email)', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Handle direct query parameters (compatibility with generic frontend filters)
      const { type, status, related_id, assigned_to, is_test_data } = req.query;

      if (type) q = q.eq('type', type);
      // status handled below
      if (related_id) q = q.eq('related_id', related_id);
      if (assigned_to) q = q.eq('assigned_to', assigned_to);

      // Handle is_test_data filter
      if (is_test_data !== undefined) {
        const flag = String(is_test_data).toLowerCase();
        if (flag === 'false') {
          // Exclude test data (false or null)
          q = q.or('is_test_data.is.false,is_test_data.is.null');
        } else if (flag === 'true') {
          // Show only test data
          q = q.eq('is_test_data', true);
        }
      }

      // Special handling for legacy/simple 'overdue' status request
      // This catches ?status=overdue properly in the backend query
      // Special handling for status filtering to ensure mutual exclusivity with 'overdue'
      // Overdue = (Scheduled OR In Progress) AND Due Date < Today
      // Scheduled = Scheduled AND (Due Date >= Today OR Null)
      // In Progress = In Progress AND (Due Date >= Today OR Null)
      const todayStr = new Date().toISOString().split('T')[0];

      // Normalize status aliases (context dictionary mapping)
      // AI/user-friendly terms → database terms
      let normalizedStatus = status;
      if (status === 'planned' || status === 'pending') {
        normalizedStatus = 'scheduled';
      } else if (status === 'done' || status === 'finished') {
        normalizedStatus = 'completed';
      }

      if (normalizedStatus === 'overdue') {
        // Just check for status='overdue' in DB
        q = q.eq('status', 'overdue');
      } else if (normalizedStatus === 'scheduled') {
        q = q.eq('status', 'scheduled')
          .or(`due_date.gte.${todayStr},due_date.is.null`);
      } else if (normalizedStatus === 'in_progress') {
        q = q.eq('status', 'in_progress')
          .or(`due_date.gte.${todayStr},due_date.is.null`);
      } else if (normalizedStatus && normalizedStatus !== 'all') {
        q = q.eq('status', normalizedStatus);
      }

      if (filter) {
        let parsed = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsed = JSON.parse(filter);
            console.log('[Activities V2] Parsed filter:', JSON.stringify(parsed, null, 2));
          } catch {
            // ignore
          }
        }
        if (parsed && typeof parsed === 'object') {
          // Handle assigned_to filter from filter object
          if (parsed.assigned_to !== undefined) {
            console.log('[Activities V2] Applying assigned_to filter:', parsed.assigned_to);
            q = q.eq('assigned_to', parsed.assigned_to);
          }

          // Handle $or for unassigned
          if (parsed.$or && Array.isArray(parsed.$or)) {
            const isUnassignedFilter = parsed.$or.some(cond =>
              cond.assigned_to === null || cond.assigned_to === ''
            );

            if (isUnassignedFilter) {
              console.log('[Activities V2] Applying unassigned filter');
              q = q.or('assigned_to.is.null,assigned_to.eq.');
            }
          }

          // Other filters
          if (parsed.status) q = q.eq('status', parsed.status);
          if (parsed.type) q = q.eq('type', parsed.type);
          if (parsed.related_id) q = q.eq('related_id', parsed.related_id);
        }
      }

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      const activities = (data || []).map(activity => {
        const expanded = expandMetadata(activity);
        // Add denormalized names from FK joins
        if (activity.employee) {
          expanded.assigned_to_name = `${activity.employee.first_name || ''} ${activity.employee.last_name || ''}`.trim();
          expanded.assigned_to_email = activity.employee.email;
        }
        delete expanded.employee;
        return expanded;
      });

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

  router.get('/:id', cacheDetail('activities', 300), async (req, res) => {
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

      // Smart handling: Extract time from due_date if it contains a time component
      // AI often passes due_date as "2025-12-20T15:00:00" instead of separate due_date + due_time
      if (updatePayload.due_date && updatePayload.due_date.includes('T')) {
        const [datePart, timePart] = updatePayload.due_date.split('T');
        updatePayload.due_date = datePart;

        // Extract time (HH:mm:ss or HH:mm) from the datetime
        const timeMatch = timePart.match(/^(\d{2}:\d{2}(:\d{2})?)/);
        if (timeMatch) {
          const extractedTime = timeMatch[1];
          // Normalize to HH:mm:ss format
          updatePayload.due_time = extractedTime.length === 5 ? `${extractedTime}:00` : extractedTime;
          console.log('[Activities V2] Extracted time from due_date:', { due_date: datePart, due_time: updatePayload.due_time });
        }
      }

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

  router.delete('/:id', invalidateCache('activities'), async (req, res) => {
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
