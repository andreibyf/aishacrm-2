import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';

export default function createActivityRoutes(_pgPool) {
  const router = express.Router();

  // Apply tenant validation and employee data scope to all routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

// Helper function to expand metadata fields to top-level properties
  const _expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata,
      metadata,
    };
  };

  // Helper to merge metadata and expose UI-friendly fields
  function normalizeActivity(row) {
    let meta = {};
    if (row.metadata) {
      if (typeof row.metadata === 'object') {
        meta = row.metadata;
      } else if (typeof row.metadata === 'string') {
        try { meta = JSON.parse(row.metadata); } catch { meta = {}; }
      }
    }
    // Map body -> description for the UI and spread metadata back to top-level (non-destructive)
    return {
      ...row,
      description: row.body ?? meta.description ?? null,
      ...meta,
    };
  }

  // GET /api/activities - List activities for a tenant
  router.get('/', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      // Parse limit/offset if provided; default to generous limits for local dev
      const limit = req.query.limit ? parseInt(req.query.limit) : 1000;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;

      // Helper: try JSON.parse for values that may be JSON-encoded
      const parseMaybeJson = (val) => {
        if (val == null) return val;
        if (typeof val !== 'string') return val;
        const s = val.trim();
        if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
          try { return JSON.parse(s); } catch { return val; }
        }
        return val;
      };

      // Use Supabase for base query, client-side filter for complex metadata queries
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      let query = supabase.from('activities').select('*').eq('tenant_id', tenant_id);
      
      // Simple column filters via Supabase
      if (req.query.status) query = query.eq('status', req.query.status);
      if (req.query.type) query = query.eq('type', req.query.type);
      if (req.query.related_id) query = query.eq('related_id', req.query.related_id);
      
      query = query.order('created_at', { ascending: false });
      
      const { data: allData, error } = await query;
      if (error) throw new Error(error.message);
      
      // Client-side filtering for complex metadata queries
      let filtered = allData || [];
      
      if (req.query.related_to) {
        const v = parseMaybeJson(req.query.related_to);
        if (typeof v === 'string') {
          filtered = filtered.filter(row => row.metadata?.related_to === v);
        }
      }
      
      if (req.query.assigned_to) {
        const v = parseMaybeJson(req.query.assigned_to);
        if (typeof v === 'string') {
          filtered = filtered.filter(row => row.metadata?.assigned_to === v);
        }
      }
      
      if (req.query.is_test_data) {
        const v = parseMaybeJson(req.query.is_test_data);
        if (v && typeof v === 'object' && v.$ne === true) {
          filtered = filtered.filter(row => !(row.metadata?.is_test_data === true));
        } else if (v === true || v === 'true') {
          filtered = filtered.filter(row => row.metadata?.is_test_data === true);
        }
      }
      
      if (req.query.tags) {
        const v = parseMaybeJson(req.query.tags);
        if (v && typeof v === 'object' && Array.isArray(v.$all)) {
          const requiredTags = v.$all;
          filtered = filtered.filter(row => {
            const tags = row.metadata?.tags;
            if (!Array.isArray(tags)) return false;
            return requiredTags.every(tag => tags.includes(tag));
          });
        }
      }
      
      if (req.query.due_date) {
        const v = parseMaybeJson(req.query.due_date);
        if (v && typeof v === 'object') {
          filtered = filtered.filter(row => {
            const dueDate = row.metadata?.due_date;
            if (!dueDate) return false;
            const date = new Date(dueDate);
            if (v.$gte && date < new Date(v.$gte)) return false;
            if (v.$lte && date > new Date(v.$lte)) return false;
            return true;
          });
        }
      }
      
      if (req.query['$or']) {
        const v = parseMaybeJson(req.query['$or']);
        if (Array.isArray(v) && v.length > 0) {
          filtered = filtered.filter(row => {
            return v.some(cond => {
              const [field, expr] = Object.entries(cond)[0] || [];
              if (!field) return false;
              
              if (field === 'subject' && expr && typeof expr === 'object' && expr.$regex) {
                const regex = new RegExp(expr.$regex, 'i');
                return regex.test(row.subject || '');
              }
              if (field === 'description' && expr && typeof expr === 'object' && expr.$regex) {
                const regex = new RegExp(expr.$regex, 'i');
                const desc = row.body || row.metadata?.description || '';
                return regex.test(desc);
              }
              if (field === 'related_name' && expr && typeof expr === 'object' && expr.$regex) {
                const regex = new RegExp(expr.$regex, 'i');
                return regex.test(row.metadata?.related_name || '');
              }
              if (field === 'assigned_to') {
                const assigned = row.metadata?.assigned_to;
                if (expr === null) return assigned == null;
                if (expr === '') return assigned === '';
                return assigned === expr;
              }
              return false;
            });
          });
        }
      }
      
      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit);

      res.json({
        status: 'success',
        data: {
          activities: paginated.map(normalizeActivity),
          total,
          limit,
          offset,
        }
      });
    } catch (error) {
      console.error('Error fetching activities:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/activities/:id - Get single activity (tenant scoped when tenant_id provided)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};
      
      // Require tenant_id for proper RLS enforcement
        if (!tenant_id) {
          return res.status(400).json({
            status: 'error',
            message: 'tenant_id is required'
          });
        }

        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('activities')
          .select('*')
          .eq('tenant_id', tenant_id)
          .eq('id', id)
          .single();
        if (error?.code === 'PGRST116') {
          return res.status(404).json({
            status: 'error',
            message: 'Activity not found'
          });
        }
        if (error) throw new Error(error.message);

        res.json({
          status: 'success',
          data: normalizeActivity(data)
        });
    } catch (error) {
      console.error('Error fetching activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // POST /api/activities - Create new activity
  router.post('/', async (req, res) => {
    try {
      const activity = req.body;
      
      if (!activity.tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const bodyText = activity.description ?? activity.body ?? null;
      const {
        tenant_id,
        type,
        subject,
        related_id,
        ...rest
      } = activity || {};

      const normalizedType = activity?.activity_type ?? type;
      const meta = { ...rest, description: bodyText };

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('activities')
        .insert([{
          tenant_id,
          type: normalizedType || 'task',
          subject: subject || null,
          body: bodyText,
          related_id: related_id || null,
          metadata: meta,
        }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      
      res.status(201).json({
        status: 'success',
        data: normalizeActivity(data)
      });
    } catch (error) {
      console.error('Error creating activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // PUT /api/activities/:id - Update activity
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
  const payload = req.body || {};

      const bodyText = payload.description ?? payload.body ?? null;
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data: current, error: fetchErr } = await supabase
        .from('activities')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr?.code === 'PGRST116') {
        return res.status(404).json({
          status: 'error',
          message: 'Activity not found'
        });
      }
      if (fetchErr) throw new Error(fetchErr.message);
      
      const currentMeta = current?.metadata && typeof current.metadata === 'object' ? current.metadata : {};
      const { tenant_id: _t, description: _d, body: _b, id: _id, created_at: _ca, updated_at: _ua, ...extras } = payload;
      const newMeta = { ...currentMeta, ...extras, description: bodyText };

      const updatePayload = { metadata: newMeta };
      const updateType = payload.activity_type !== undefined ? payload.activity_type : payload.type;
      if (updateType !== undefined) updatePayload.type = updateType;
      if (payload.subject !== undefined) updatePayload.subject = payload.subject;
      if (bodyText !== undefined) updatePayload.body = bodyText;
      if (payload.related_id !== undefined) updatePayload.related_id = payload.related_id;
      if (payload.status !== undefined) updatePayload.status = payload.status;
      if (payload.due_date !== undefined) updatePayload.due_date = payload.due_date;

      if (Object.keys(updatePayload).length === 1 && 'metadata' in updatePayload) {
        return res.json({
          status: 'success',
          data: normalizeActivity(current)
        });
      }

      const { data, error } = await supabase
        .from('activities')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({
          status: 'error',
          message: 'Activity not found'
        });
      }
      if (error) throw new Error(error.message);
      
      res.json({
        status: 'success',
        data: normalizeActivity(data)
      });
    } catch (error) {
      console.error('Error updating activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/activities/:id - Delete activity
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'Activity not found'
        });
      }
      
      res.json({
        status: 'success',
        message: 'Activity deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
