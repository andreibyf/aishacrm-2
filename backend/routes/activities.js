import express from 'express';
import crypto from 'crypto';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { isMemoryAvailable, getMemoryClient } from '../lib/memoryClient.js';
import { cacheList } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';
import { toNullableString, toInteger } from '../lib/typeConversions.js';

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

  const toJsonObject = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const MIRRORED_METADATA_KEYS = [
    'duration',
    'duration_minutes',
    'outcome',
    'ai_call_config',
    'ai_email_config'
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

  const assignJsonField = (target, key, value) => {
    if (value === undefined) return;
    if (value === null) {
      target[key] = null;
      return;
    }
    const parsed = toJsonObject(value);
    if (parsed !== undefined) {
      target[key] = parsed;
    }
  };

  const normalizeStatusValue = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      return trimmed === 'planned' ? 'scheduled' : trimmed;
    }
    return value;
  };

  const normalizeDueParts = (dateValue, timeValue) => {
    let datePart = dateValue || null;
    let timePart = timeValue || null;
    if (datePart && /T/.test(datePart)) {
      // Check if it has a timezone offset (+ or - after the time, or Z for UTC)
      const hasTimezone = /T\d{2}:\d{2}(:\d{2})?([-+]\d{2}:\d{2}|Z)/.test(datePart);
      if (hasTimezone) {
        // Keep the full ISO datetime - PostgreSQL TIMESTAMPTZ handles it correctly
        // Don't extract time separately; the full timestamp is preserved
        timePart = null; // Clear due_time since full datetime is in due_date
        return { datePart, timePart };
      }
      // No timezone - legacy behavior: extract date and time parts
      const d = new Date(datePart);
      if (!Number.isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        datePart = `${yyyy}-${mm}-${dd}`;
        if (!timePart) {
          const hh = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          timePart = `${hh}:${min}`;
        }
      }
    }
    return { datePart, timePart };
  };

// Helper function to expand metadata fields to top-level properties
  const _expandMetadata = (record) => {
    if (!record) return record;
    const metadataObj = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
    const { metadata: _metadata = {}, ...rest } = record;
    return {
      ...metadataObj,
      ...rest,
      metadata: metadataObj,
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
    const description = row.body ?? meta.description ?? null;
    const status = row.status ?? meta.status ?? null;
    const due_date = row.due_date ?? meta.due_date ?? null;
    const due_time = row.due_time ?? meta.due_time ?? null;
    const assigned_to = row.assigned_to ?? meta.assigned_to ?? null;
    const priority = row.priority ?? meta.priority ?? null;
    const location = row.location ?? meta.location ?? null;
    const outcome = row.outcome ?? meta.outcome ?? null;
    return {
      ...meta,
      ...row,
      description,
      status,
      due_date,
      due_time,
      assigned_to,
      priority,
      location,
      outcome,
      metadata: meta,
    };
  }

  // Safely construct case-insensitive regex from user-provided pattern.
  // Strips leading quantifier characters (?, +, *) which cause `Nothing to repeat` errors
  // and returns null if the pattern cannot be compiled.
  const safeRegex = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    // Remove leading quantifiers that would invalidate the pattern
    let sanitized = raw.replace(/^[?+*]+/, '').trim();
    // Prevent empty or wholly invalid patterns
    if (!sanitized) return null;
    try {
      return new RegExp(sanitized, 'i');
    } catch {
      return null;
    }
  };

  // GET /api/activities/search - Search activities by subject or body
  /**
   * @openapi
   * /api/activities/search:
   *   get:
   *     summary: Search activities by subject or body
   *     tags: [activities]
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

  // NOTE: mark-overdue endpoint is now in activities.v2.js at POST /api/v2/activities/mark-overdue

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
        .from('activities')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .or(`subject.ilike.${like},body.ilike.${like},type.ilike.${like}`)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data: {
          activities: data || [],
          total: count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      logger.error('Error searching activities:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/activities - List activities for a tenant
  router.get('/', cacheList('activities', 120), async (req, res) => {
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
      
      // Simple column filters via Supabase (ignore 'all', 'any', '', 'undefined' as they mean no filter)
      if (req.query.status && req.query.status !== 'all' && req.query.status !== 'any' && req.query.status !== '' && req.query.status !== 'undefined') {
        query = query.eq('status', req.query.status);
      }
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
                const regex = safeRegex(expr.$regex);
                return regex ? regex.test(row.subject || '') : false;
              }
              if (field === 'description' && expr && typeof expr === 'object' && expr.$regex) {
                const regex = safeRegex(expr.$regex);
                const desc = row.body || row.metadata?.description || '';
                return regex ? regex.test(desc) : false;
              }
              if (field === 'related_name' && expr && typeof expr === 'object' && expr.$regex) {
                const regex = safeRegex(expr.$regex);
                return regex ? regex.test(row.metadata?.related_name || '') : false;
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

      let counts = null;
      const includeStats = (req.query.include_stats === 'true' || req.query.include_stats === '1');
      if (includeStats) {
        // Attempt cache lookup (counts independent of pagination)
        let cacheHit = false;
        if (isMemoryAvailable()) {
          try {
            const redis = getMemoryClient();
            const versionKey = `activities:stats:tenant:${tenant_id}:version`;
            const version = await redis.get(versionKey) || '0';
            // Build a normalized filter object excluding pagination params
            const filterDescriptor = {
              status: req.query.status || null,
              type: req.query.type || null,
              related_id: req.query.related_id || null,
              related_to: req.query.related_to || null,
              assigned_to: req.query.assigned_to || null,
              is_test_data: req.query.is_test_data || null,
              tags: req.query.tags || null,
              due_date: req.query.due_date || null,
              or: req.query['$or'] || null,
            };
            const hash = crypto.createHash('sha256').update(JSON.stringify(filterDescriptor)).digest('hex');
            const key = `activities:stats:tenant:${tenant_id}:v${version}:${hash}`;
            const cachedRaw = await redis.get(key);
            if (cachedRaw) {
              const parsed = JSON.parse(cachedRaw);
              if (parsed && parsed.counts && typeof parsed.total === 'number') {
                counts = parsed.counts;
                // Safety: ensure total aligns; if mismatch ignore cache
                if (parsed.total === total) {
                  cacheHit = true;
                  await redis.incr(`activities:stats:tenant:${tenant_id}:hits`);
                } else {
                  counts = null; // fallback to recompute
                  await redis.incr(`activities:stats:tenant:${tenant_id}:skips_mismatch`);
                }
              }
            }
            if (!cacheHit) {
              await redis.incr(`activities:stats:tenant:${tenant_id}:misses`);
            }
            if (!cacheHit) {
              // Compute and cache counts
              const now = new Date();
              const buildDueDateTime = (a) => {
                if (!a.due_date) return null;
                try {
                  if (a.due_time) {
                    const [h,m,s] = a.due_time.split(':');
                    const date = new Date(a.due_date);
                    date.setHours(parseInt(h,10)||0, parseInt(m,10)||0, parseInt(s||'0',10)||0, 0);
                    return date;
                  }
                  const date = new Date(a.due_date);
                  date.setHours(23,59,59,999);
                  return date;
                } catch { return new Date(a.due_date); }
              };
              counts = {
                total,
                scheduled: filtered.filter(a => a.status === 'scheduled').length,
                in_progress: filtered.filter(a => a.status === 'in_progress' || a.status === 'in-progress').length,
                overdue: filtered.filter(a => {
                  if (a.status === 'completed' || a.status === 'cancelled') return false;
                  const due = buildDueDateTime(a);
                  if (!due) return false;
                  return due < now;
                }).length,
                completed: filtered.filter(a => a.status === 'completed').length,
                cancelled: filtered.filter(a => a.status === 'cancelled').length,
              };
              try {
                // Cache for 30s (align with frontend TTL)
                await redis.setEx(key, 30, JSON.stringify({ counts, total }));
              } catch {
                // ignore transient cache errors
              }
            }
          } catch {
            // Redis unavailable or error; compute counts without caching
            const now = new Date();
            const buildDueDateTime = (a) => {
              if (!a.due_date) return null;
              try {
                if (a.due_time) {
                  const [h,m,s] = a.due_time.split(':');
                  const date = new Date(a.due_date);
                  date.setHours(parseInt(h,10)||0, parseInt(m,10)||0, parseInt(s||'0',10)||0, 0);
                  return date;
                }
                const date = new Date(a.due_date);
                date.setHours(23,59,59,999);
                return date;
              } catch { return new Date(a.due_date); }
            };
            counts = {
              total,
              scheduled: filtered.filter(a => a.status === 'scheduled').length,
              in_progress: filtered.filter(a => a.status === 'in_progress' || a.status === 'in-progress').length,
              overdue: filtered.filter(a => {
                if (a.status === 'completed' || a.status === 'cancelled') return false;
                const due = buildDueDateTime(a);
                if (!due) return false;
                return due < now;
              }).length,
              completed: filtered.filter(a => a.status === 'completed').length,
              cancelled: filtered.filter(a => a.status === 'cancelled').length,
            };
          }
        } else {
          // Memory layer not available; compute directly
          const now = new Date();
          const buildDueDateTime = (a) => {
            if (!a.due_date) return null;
            try {
              if (a.due_time) {
                const [h,m,s] = a.due_time.split(':');
                const date = new Date(a.due_date);
                date.setHours(parseInt(h,10)||0, parseInt(m,10)||0, parseInt(s||'0',10)||0, 0);
                return date;
              }
              const date = new Date(a.due_date);
              date.setHours(23,59,59,999);
              return date;
            } catch { return new Date(a.due_date); }
          };
          counts = {
            total,
            scheduled: filtered.filter(a => a.status === 'scheduled').length,
            in_progress: filtered.filter(a => a.status === 'in_progress' || a.status === 'in-progress').length,
            overdue: filtered.filter(a => {
              if (a.status === 'completed' || a.status === 'cancelled') return false;
              const due = buildDueDateTime(a);
              if (!due) return false;
              return due < now;
            }).length,
            completed: filtered.filter(a => a.status === 'completed').length,
            cancelled: filtered.filter(a => a.status === 'cancelled').length,
          };
        }
      }

      res.json({
        status: 'success',
        data: {
          activities: paginated.map(normalizeActivity),
          total,
          limit,
          offset,
          counts,
        }
      });
    } catch (error) {
      logger.error('Error fetching activities:', error);
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
      logger.error('Error fetching activity:', error);
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
        status,
        due_date,
        due_time,
        assigned_to,
        priority,
        location,
        created_by,
        related_to,
        related_name,
        related_email,
        duration,
        duration_minutes,
        outcome,
        ai_call_config,
        ai_email_config,
        metadata = {},
        ...rest
      } = activity || {};

      const allowedTypes = ['task','email','call','meeting','demo','proposal','note','scheduled_ai_call','scheduled_ai_email'];
      let normalizedType = activity?.activity_type ?? type ?? 'task';
      if (!allowedTypes.includes(normalizedType)) {
        normalizedType = 'note';
      }

      // Normalize status (convert legacy planned -> scheduled)
      let normalizedStatus = normalizeStatusValue(status ?? rest.status);
      if (normalizedStatus === undefined || normalizedStatus === null) {
        normalizedStatus = due_date || due_time ? 'scheduled' : 'in-progress';
      }

      // Parse due_date when an ISO timestamp is passed; extract date/time parts
      const { datePart, timePart } = normalizeDueParts(due_date, due_time);

      const metadataExtras = { description: bodyText };
      if (normalizedStatus) metadataExtras.status = normalizedStatus;
      const meta = sanitizeMetadataPayload(metadata, rest, metadataExtras);

      const activityPayload = {
        tenant_id,
        type: normalizedType,
        subject: subject || null,
        body: bodyText,
        related_id: related_id || null,
        status: normalizedStatus,
        due_date: datePart || null,
        due_time: timePart || null,
        assigned_to: assigned_to || null,
        priority: priority ?? 'normal',
        location: location || null,
        created_by: created_by || null,
        created_date: new Date().toISOString(),
        related_to: related_to || null,
        related_name: related_name || null,
        related_email: related_email || null,
        metadata: meta,
      };

      assignIntegerField(activityPayload, 'duration_minutes', duration_minutes ?? duration);
      assignStringField(activityPayload, 'outcome', outcome);
      assignJsonField(activityPayload, 'ai_call_config', ai_call_config);
      assignJsonField(activityPayload, 'ai_email_config', ai_email_config);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('activities')
        .insert([activityPayload])
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      // Invalidate stats cache version for this tenant (increment)
      try {
        if (isMemoryAvailable()) {
          const redis = getMemoryClient();
          await redis.incr(`activities:stats:tenant:${tenant_id}:version`);
        }
      } catch (e) { void e; }
      
      // AI MEMORY INGESTION (async, non-blocking)
      if (data && (data.subject || data.body)) {
        import('../lib/aiMemory/index.js')
          .then(({ upsertMemoryChunks }) => {
            const activityText = `${data.type || 'Activity'} - ${data.subject || '(no subject)'}: ${data.body || ''}`;
            return upsertMemoryChunks({
              tenantId: data.tenant_id,
              content: activityText,
              sourceType: 'activity',
              entityType: null, // Activities don't have entity_type in schema
              entityId: data.related_id,
              metadata: { 
                activityId: data.id, 
                type: data.type,
                status: data.status,
                createdBy: data.created_by 
              }
            });
          })
          .catch(err => {
            logger.error('[ACTIVITY_MEMORY_INGESTION] Failed:', err.message);
          });
      }
      
      res.status(201).json({
        status: 'success',
        data: normalizeActivity(data)
      });
    } catch (error) {
      logger.error('Error creating activity:', error);
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
      const {
        activity_type,
        type,
        subject,
        description,
        body,
        related_id,
        status,
        due_date,
        due_time,
        assigned_to,
        priority,
        location,
        related_to,
        related_name,
        related_email,
        duration,
        duration_minutes,
        outcome,
        ai_call_config,
        ai_email_config,
        metadata = {},
        tenant_id: _tenantId,
        id: _incomingId,
        created_at: _createdAt,
        updated_at: _updatedAt,
        ...rest
      } = payload;

      const hasBodyChange = description !== undefined || body !== undefined;
      const bodyText = hasBodyChange ? (description ?? body ?? null) : undefined;

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

      const allowedTypes = ['task', 'email', 'call', 'meeting', 'demo', 'proposal', 'note', 'scheduled_ai_call', 'scheduled_ai_email'];
      const currentMeta = current?.metadata && typeof current.metadata === 'object' ? current.metadata : {};
      const metadataExtras = {};
      if (hasBodyChange) metadataExtras.description = bodyText ?? null;

      const updatePayload = { updated_at: new Date().toISOString() };
      const typeCandidate = activity_type ?? type;
      if (typeCandidate !== undefined) {
        updatePayload.type = allowedTypes.includes(typeCandidate) ? typeCandidate : 'note';
      }
      if (subject !== undefined) {
        updatePayload.subject = toNullableString(subject);
      }
      if (hasBodyChange) {
        updatePayload.body = bodyText ?? null;
      }
      if (related_id !== undefined) {
        updatePayload.related_id = related_id || null;
      }
      if (related_to !== undefined) {
        updatePayload.related_to = related_to || null;
      }
      if (related_name !== undefined) {
        updatePayload.related_name = related_name || null;
      }
      if (related_email !== undefined) {
        updatePayload.related_email = related_email || null;
      }
      if (status !== undefined) {
        const normalizedStatus = normalizeStatusValue(status);
        updatePayload.status = normalizedStatus ?? null;
        metadataExtras.status = normalizedStatus;
      }
      if (due_date !== undefined || due_time !== undefined) {
        const { datePart, timePart } = normalizeDueParts(
          due_date !== undefined ? due_date : current?.due_date,
          due_time !== undefined ? due_time : current?.due_time
        );
        if (due_date !== undefined) {
          updatePayload.due_date = due_date === null ? null : (datePart ?? null);
        }
        if (due_time !== undefined) {
          updatePayload.due_time = due_time === null ? null : (timePart ?? null);
        }
      }
      if (assigned_to !== undefined) {
        assignStringField(updatePayload, 'assigned_to', assigned_to);
      }
      if (priority !== undefined) {
        assignStringField(updatePayload, 'priority', priority);
      }
      if (location !== undefined) {
        assignStringField(updatePayload, 'location', location);
      }
      if (duration_minutes !== undefined || duration !== undefined) {
        assignIntegerField(updatePayload, 'duration_minutes', duration_minutes ?? duration);
      }
      if (outcome !== undefined) {
        assignStringField(updatePayload, 'outcome', outcome);
      }
      if (ai_call_config !== undefined) {
        assignJsonField(updatePayload, 'ai_call_config', ai_call_config);
      }
      if (ai_email_config !== undefined) {
        assignJsonField(updatePayload, 'ai_email_config', ai_email_config);
      }

      const sanitizedMetadata = sanitizeMetadataPayload(currentMeta, metadata, rest, metadataExtras);
      updatePayload.metadata = sanitizedMetadata;

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
      // Invalidate stats cache version using tenant from current record
      try {
        if (isMemoryAvailable() && current?.tenant_id) {
          const redis = getMemoryClient();
          await redis.incr(`activities:stats:tenant:${current.tenant_id}:version`);
        }
      } catch (e) { void e; }
      
      // AI MEMORY INGESTION (async, non-blocking)
      if (data && (data.subject || data.body)) {
        import('../lib/aiMemory/index.js')
          .then(({ upsertMemoryChunks }) => {
            const activityText = `${data.type || 'Activity'} - ${data.subject || '(no subject)'}: ${data.body || ''}`;
            return upsertMemoryChunks({
              tenantId: data.tenant_id,
              content: activityText,
              sourceType: 'activity',
              entityType: null,
              entityId: data.related_id,
              metadata: { 
                activityId: data.id, 
                type: data.type,
                status: data.status,
                createdBy: data.created_by 
              }
            });
          })
          .catch(err => {
            logger.error('[ACTIVITY_MEMORY_INGESTION] Failed:', err.message);
          });
      }
      
      res.json({
        status: 'success',
        data: normalizeActivity(data)
      });
    } catch (error) {
      logger.error('Error updating activity:', error);
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
      // Invalidate stats cache version for tenant
      try {
        if (isMemoryAvailable() && data?.tenant_id) {
          const redis = getMemoryClient();
          await redis.incr(`activities:stats:tenant:${data.tenant_id}:version`);
        }
      } catch (e) { void e; }
      
      res.json({
        status: 'success',
        message: 'Activity deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Monitoring endpoint for activities stats cache (tenant-agnostic summary)
  // GET /api/activities/stats-monitor
  // Use a non-param-colliding path so it isn't captured by '/:id'
  router.get('/monitor/stats', async (req, res) => {
    try {
      if (!isMemoryAvailable()) {
        return res.json({
          status: 'success',
          data: { available: false, tenants: [] }
        });
      }
      const redis = getMemoryClient();
      const hitKeys = await redis.keys('activities:stats:tenant:*:hits');
      const tenants = [];
      for (const hk of hitKeys.slice(0, 100)) { // limit scan to first 100 tenants
        // hk pattern: activities:stats:tenant:<tenantId>:hits
        const parts = hk.split(':');
        const tenantId = parts[3];
        const [hits, misses, skips, version] = await Promise.all([
          redis.get(`activities:stats:tenant:${tenantId}:hits`),
          redis.get(`activities:stats:tenant:${tenantId}:misses`),
          redis.get(`activities:stats:tenant:${tenantId}:skips_mismatch`),
          redis.get(`activities:stats:tenant:${tenantId}:version`)
        ]);
        tenants.push({
          tenant_id: tenantId,
          version: parseInt(version || '0', 10),
          hits: parseInt(hits || '0', 10),
          misses: parseInt(misses || '0', 10),
          skips_mismatch: parseInt(skips || '0', 10),
          hit_ratio: (parseInt(hits || '0', 10) + parseInt(misses || '0', 10)) > 0
            ? (parseInt(hits || '0', 10) / (parseInt(hits || '0', 10) + parseInt(misses || '0', 10))).toFixed(3)
            : '0.000'
        });
      }
      return res.json({
        status: 'success',
        data: {
          available: true,
          tenants_count: tenants.length,
          tenants
        }
      });
    } catch (e) {
      logger.error('[activities.stats-monitor] Error:', e.message);
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  return router;
}
