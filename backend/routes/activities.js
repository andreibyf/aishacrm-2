import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';

export default function createActivityRoutes(_pgPool) {
  const router = express.Router();
  /**
   * @openapi
   * /api/activities:
   *   get:
   *     summary: List activities
   *     tags: [activities]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 1000 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Activities list
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   post:
   *     summary: Create activity
   *     tags: [activities]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id]
   *     responses:
   *       201:
   *         description: Activity created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */

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
    // Promote commonly used fields with fallback to metadata (legacy inserts may have only metadata values)
    const description = row.body ?? meta.description ?? null;
    const status = row.status ?? meta.status ?? null;
    const due_date = row.due_date ?? meta.due_date ?? null;
    const due_time = row.due_time ?? meta.due_time ?? null;
    const assigned_to = row.assigned_to ?? meta.assigned_to ?? null;
    const priority = row.priority ?? meta.priority ?? null;
    const location = row.location ?? meta.location ?? null;
    return {
      ...row,
      description,
      status,
      due_date,
      due_time,
      assigned_to,
      priority,
      location,
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
  /**
   * @openapi
   * /api/activities/{id}:
   *   get:
   *     summary: Get activity by ID
   *     tags: [activities]
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
   *         description: Activity details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   put:
   *     summary: Update activity
   *     tags: [activities]
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
   *         description: Activity updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   delete:
   *     summary: Delete activity
   *     tags: [activities]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Activity deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
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

      // Extract first-class fields we want to promote out of metadata
      const {
        tenant_id,
        type,
        subject,
        related_id,
        status,
        due_date,
        due_time,
        assigned_to,
        priority,
        location,
        created_by,
        related_to,
        // leave remaining fields inside rest for metadata capture
        ...rest
      } = activity || {};

      const allowedTypes = ['task','email','call','meeting','demo','proposal','note','scheduled_ai_call','scheduled_ai_email'];
      let normalizedType = activity?.activity_type ?? type ?? 'task';
      if (!allowedTypes.includes(normalizedType)) {
        normalizedType = 'note';
      }

      // Normalize status (convert legacy planned -> scheduled)
      let normalizedStatus = status ?? rest.status ?? null;
      if (normalizedStatus === 'planned') normalizedStatus = 'scheduled';
      // Provide default status if missing
      if (!normalizedStatus) {
        normalizedStatus = due_date || due_time ? 'scheduled' : 'in-progress';
      }

      // Parse due_date when an ISO timestamp is passed; extract date/time parts
      let datePart = due_date || null;
      let timePart = due_time || null;
      if (datePart && /T/.test(datePart)) {
        const d = new Date(datePart);
        if (!isNaN(d.getTime())) {
          // Format date as YYYY-MM-DD for DATE column
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth()+1).padStart(2,'0');
          const dd = String(d.getDate()).padStart(2,'0');
          datePart = `${yyyy}-${mm}-${dd}`;
          if (!timePart) {
            const hh = String(d.getHours()).padStart(2,'0');
            const min = String(d.getMinutes()).padStart(2,'0');
            timePart = `${hh}:${min}`;
          }
        }
      }

      // Build metadata excluding promoted fields
      const promotedKeys = new Set(['tenant_id','type','activity_type','subject','related_id','status','due_date','due_time','assigned_to','priority','location','created_by','related_to','description','body']);
      const meta = { ...Object.fromEntries(Object.entries(rest).filter(([k]) => !promotedKeys.has(k))), description: bodyText };

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('activities')
        .insert([{
          tenant_id,
          type: normalizedType,
          subject: subject || null,
          body: bodyText,
          related_id: related_id || null,
          status: normalizedStatus,
          due_date: datePart || null,
          due_time: timePart || null,
          assigned_to: assigned_to || null,
          // Provide default priority when omitted
          priority: (priority ?? 'normal'),
          location: location || null,
          created_by: created_by || null,
          related_to: related_to || null,
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
      if (payload.assigned_to !== undefined) updatePayload.assigned_to = payload.assigned_to;
      if (payload.priority !== undefined) updatePayload.priority = payload.priority;

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
