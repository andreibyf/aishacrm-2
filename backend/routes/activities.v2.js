import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildActivityAiContext } from '../lib/aiContextEnricher.js';
import { cacheList, cacheDetail, invalidateCache } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

/**
 * Look up the name and email for a related entity (lead, contact, account, opportunity)
 * @param {object} supabase - Supabase client
 * @param {string} relatedTo - Entity type ('lead', 'contact', 'account', 'opportunity')
 * @param {string} relatedId - Entity UUID
 * @returns {Promise<{name: string|null, email: string|null}>}
 */
async function lookupRelatedEntity(supabase, relatedTo, relatedId) {
  if (!relatedTo || !relatedId) return { name: null, email: null };
  
  // B2B CRM: Different entities have different columns
  const entityConfig = {
    lead: { table: 'leads', select: 'company, first_name, last_name, email' },
    contact: { table: 'contacts', select: 'company, first_name, last_name, email' },
    account: { table: 'accounts', select: 'name, email, phone' },
    opportunity: { table: 'opportunities', select: 'name' }
  };
  
  const config = entityConfig[relatedTo];
  if (!config) return { name: null, email: null };
  
  try {
    const { data, error } = await supabase
      .from(config.table)
      .select(config.select)
      .eq('id', relatedId)
      .single();
    
    if (error || !data) {
      logger.warn('[Activities] lookupRelatedEntity failed:', { relatedTo, relatedId, error: error?.message });
      return { name: null, email: null };
    }
    
    // Build name based on entity type (B2B: show company + contact for leads)
    let name = null;
    if (relatedTo === 'lead') {
      // B2B Leads: "Company Name (Contact Name)" format
      const personName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
      if (data.company && personName) {
        name = `${data.company} (${personName})`;
      } else {
        name = data.company || personName || null;
      }
    } else if (relatedTo === 'contact') {
      // Contacts: full name, fall back to company
      const fullName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
      name = fullName || data.company || null;
    } else {
      // Accounts, Opportunities: just name field
      name = data.name || null;
    }
    
    return { name, email: data.email || null };
  } catch (err) {
    logger.warn('[Activities] Failed to lookup related entity:', err.message);
    return { name: null, email: null };
  }
}

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

  /**
   * Resolve assigned_to to a valid UUID.
   * Accepts either a UUID directly, or an email address to look up.
   * Returns null if not resolvable.
   */
  async function resolveAssignedTo(assignedTo, tenantId, supabase) {
    if (!assignedTo) return null;
    
    // If it's already a valid UUID, return it directly
    if (UUID_REGEX.test(assignedTo)) return assignedTo;
    
    // If it looks like an email, try to look up the user/employee
    if (assignedTo.includes('@')) {
      // Try employees table first (for CRM-specific employee records)
      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('email', assignedTo)
        .limit(1)
        .maybeSingle();
      
      if (employee?.id) return employee.id;
      
      // Fallback: try users table
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('email', assignedTo)
        .limit(1)
        .maybeSingle();
      
      if (user?.id) return user.id;
    }
    
    return null; // Not resolvable
  }

  /**
   * POST /mark-overdue - Mark past-due activities as overdue
   * Updates activities with 'scheduled', 'planned', or 'in_progress' status
   * to 'overdue' if their due_date has passed.
   */
  router.post('/mark-overdue', async (req, res) => {
    try {
      const { tenant_id } = req.body;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

      const supabase = getSupabaseClient();

      // Build query - optionally filter by tenant
      let query = supabase
        .from('activities')
        .update({
          status: 'overdue',
          updated_at: new Date().toISOString()
        })
        .in('status', ['scheduled', 'planned', 'in_progress'])
        .not('due_date', 'is', null)
        .lt('due_date', today);

      if (tenant_id) {
        query = query.eq('tenant_id', tenant_id);
      }

      const { data, error } = await query.select('id, subject, due_date, status');

      if (error) throw new Error(error.message);

      // Invalidate activities cache for affected tenant(s)
      if (tenant_id) {
        invalidateCache(`activities_${tenant_id}`);
      }

      logger.info(`[Activities] Marked ${data?.length || 0} activities as overdue`, { tenant_id, today });

      res.json({
        status: 'success',
        message: `Marked ${data?.length || 0} activities as overdue`,
        data: {
          updated_count: data?.length || 0,
          today,
          activities: (data || []).slice(0, 10)
        }
      });
    } catch (error) {
      logger.error('[Activities] Error marking overdue:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.get('/', cacheList('activities', 180), async (req, res) => {
    try {
      const { tenant_id, filter, sort } = req.query;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);
      // Enable stats when explicitly requested via query param
      const includeStats = req.query.include_stats === 'true' || req.query.include_stats === '1';

      // Parse sort parameter: -field for descending, field for ascending
      let sortField = 'created_at';
      let sortAscending = false;
      if (sort) {
        if (sort.startsWith('-')) {
          sortField = sort.substring(1);
          sortAscending = false;
        } else {
          sortField = sort;
          sortAscending = true;
        }
      }

      let q = supabase
        .from('activities')
        .select('*, employee:employees!activities_assigned_to_fkey(id, first_name, last_name, email)', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .order(sortField, { ascending: sortAscending })
        .range(offset, offset + limit - 1);

      // Handle direct query parameters (compatibility with generic frontend filters)
      const { type, status, related_id, related_to_type, related_to_id, assigned_to, is_test_data } = req.query;

      if (type) q = q.eq('type', type);
      // status handled below
      if (related_id) q = q.eq('related_id', related_id);
      // Support filtering by related entity type (lead, contact, account, opportunity) and ID
      if (related_to_type) q = q.eq('related_to', related_to_type);
      if (related_to_id) q = q.eq('related_id', related_to_id);
      
      // Resolve assigned_to (supports both UUID and email)
      if (assigned_to) {
        const resolvedAssignee = await resolveAssignedTo(assigned_to, tenant_id, supabase);
        if (resolvedAssignee) {
          q = q.eq('assigned_to', resolvedAssignee);
        } else {
          logger.warn(`[Activities V2] Could not resolve assigned_to: ${assigned_to}`);
        }
      }

      // Handle simple text search via 'q' parameter (WAF-safe alternative to MongoDB $regex)
      // Searches subject, body (description), and related_name fields using PostgreSQL ILIKE
      const searchQuery = req.query.q;
      if (searchQuery && searchQuery.trim()) {
        const searchTerm = searchQuery.trim();
        const likePattern = `%${searchTerm}%`;
        logger.debug('[Activities V2] Applying text search:', { searchTerm, likePattern });
        // Search across subject, body (description), and related_name with case-insensitive ILIKE
        q = q.or(`subject.ilike.${likePattern},body.ilike.${likePattern},related_name.ilike.${likePattern}`);
      }

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
            logger.debug('[Activities V2] Parsed filter:', JSON.stringify(parsed, null, 2));
          } catch {
            // ignore
          }
        }
        if (parsed && typeof parsed === 'object') {
          // Handle assigned_to filter from filter object (supports UUID or email)
          if (parsed.assigned_to !== undefined && parsed.assigned_to !== null && parsed.assigned_to !== '') {
            logger.debug('[Activities V2] Applying assigned_to filter:', parsed.assigned_to);
            const resolvedFilterAssignee = await resolveAssignedTo(parsed.assigned_to, tenant_id, supabase);
            if (resolvedFilterAssignee) {
              q = q.eq('assigned_to', resolvedFilterAssignee);
            } else {
              logger.warn(`[Activities V2] Could not resolve filter assigned_to: ${parsed.assigned_to}`);
            }
          }

          // Handle $or filters (unassigned, search with $regex, etc.)
          if (parsed.$or && Array.isArray(parsed.$or)) {
            // Check if this is an unassigned filter
            const isUnassignedFilter = parsed.$or.some(cond =>
              cond.assigned_to === null || cond.assigned_to === ''
            );

            if (isUnassignedFilter) {
              logger.debug('[Activities V2] Applying unassigned filter');
              q = q.or('assigned_to.is.null,assigned_to.eq.');
            }
            
            // Check if this is a search filter with $regex (MongoDB-style from frontend)
            // Convert MongoDB $regex to Supabase ILIKE for PostgreSQL compatibility
            const hasRegexConditions = parsed.$or.some(cond => {
              return Object.values(cond).some(val => 
                val && typeof val === 'object' && val.$regex
              );
            });
            
            if (hasRegexConditions && !isUnassignedFilter) {
              logger.debug('[Activities V2] Applying search filter with $regex translation');
              
              // Build OR conditions for Supabase
              const orConditions = [];
              
              for (const condition of parsed.$or) {
                for (const [field, value] of Object.entries(condition)) {
                  if (value && typeof value === 'object' && value.$regex) {
                    // Extract regex pattern and convert to ILIKE pattern
                    const pattern = value.$regex;
                    const likePattern = `%${pattern}%`;
                    
                    // Map frontend field names to database columns
                    let dbField = field;
                    if (field === 'description') {
                      dbField = 'body'; // 'description' is stored as 'body' in DB
                    }
                    
                    // Build Supabase ILIKE condition
                    orConditions.push(`${dbField}.ilike.${likePattern}`);
                  }
                }
              }
              
              if (orConditions.length > 0) {
                // Apply all OR conditions at once using Supabase's .or() method
                const orQuery = orConditions.join(',');
                logger.debug('[Activities V2] Applying OR search:', orQuery);
                q = q.or(orQuery);
              }
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
      logger.error('Error in v2 activities list:', error);
      // Ensure CORS headers are present in error responses
      if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.post('/', invalidateCache('activities'), async (req, res) => {
    try {
      logger.debug('[Activities v2 POST] Raw body:', JSON.stringify(req.body));
      const { tenant_id, metadata, description, body, duration_minutes, duration, tags, activity_type, assigned_to, ...payload } = req.body || {};
      logger.debug('[Activities v2 POST] Destructured payload:', JSON.stringify({ tenant_id, activity_type, payload }));
      // Accept either duration_minutes or duration (legacy) - prefer duration_minutes
      const durationValue = duration_minutes ?? duration ?? undefined;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const bodyText = description ?? body ?? null;
      // Map activity_type to type (Braid SDK uses activity_type, DB column is 'type')
      const activityType = activity_type ?? payload.type ?? null;
      
      // Sanitize UUID fields: must be valid UUID or null (AI may pass strings like "Unassigned" or "budget_meeting")
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validAssignedTo = assigned_to && UUID_REGEX.test(assigned_to) ? assigned_to : null;
      
      // Sanitize related_id: must be valid UUID or null
      const rawRelatedId = payload.related_id;
      const validRelatedId = rawRelatedId && UUID_REGEX.test(rawRelatedId) ? rawRelatedId : null;
      
      // Lookup related entity name/email if related_to and related_id are provided
      // Only valid entity types should be looked up
      const VALID_ENTITY_TYPES = ['lead', 'contact', 'account', 'opportunity'];
      const relatedTo = VALID_ENTITY_TYPES.includes(payload.related_to) ? payload.related_to : null;
      const relatedId = validRelatedId;
      const { name: relatedName, email: relatedEmail } = await lookupRelatedEntity(supabase, relatedTo, relatedId);
      
      const insertPayload = {
        tenant_id,
        ...payload,
        assigned_to: validAssignedTo,
        related_to: relatedTo,   // Use sanitized related_to
        related_id: relatedId,   // Use sanitized related_id (valid UUID or null)
        ...(relatedName ? { related_name: relatedName } : {}),
        ...(relatedEmail ? { related_email: relatedEmail } : {}),
        ...(activityType ? { type: activityType } : {}),
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
      logger.error('Error in v2 activity create:', error);      // Ensure CORS headers are present in error responses
      if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ============================================================================
  // POST /api/v2/activities/search - WAF-safe search endpoint
  // Accepts search parameters in POST body instead of URL query string
  // This avoids WAF blocking MongoDB-style operators in URLs
  // ============================================================================
  router.post('/search', async (req, res) => {
    try {
      const tenantId = req.query.tenant_id || req.body.tenant_id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const {
        q,                    // Search term
        fields = ['subject', 'body', 'related_name'],  // Fields to search (valid columns only)
        limit = 50,           // Max results
        offset = 0,           // Pagination offset
        status,               // Filter by status
        type,                 // Filter by activity type
        assigned_to,          // Filter by assigned user
        related_to,           // Filter by related entity type
        related_id,           // Filter by related entity ID
        date_from,            // Filter by date range start
        date_to,              // Filter by date range end
        sort_by = 'due_date', // Sort field
        sort_order = 'desc'   // Sort direction
      } = req.body;

      const supabase = getSupabaseClient();
      let query = supabase
        .from('activities')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId);

      // Apply text search using PostgreSQL ILIKE
      if (q && q.trim()) {
        const searchTerm = q.trim();
        const likePattern = `%${searchTerm}%`;
        
        // Build OR condition for specified fields (only valid activity columns)
        const searchConditions = fields
          .filter(f => ['subject', 'body', 'related_name'].includes(f))
          .map(f => `${f}.ilike.${likePattern}`)
          .join(',');
        
        if (searchConditions) {
          query = query.or(searchConditions);
        }
        logger.debug('[Activities V2 Search] Text search:', { searchTerm, fields, searchConditions });
      }

      // Apply filters
      if (status) query = query.eq('status', status);
      if (type) query = query.eq('type', type);
      if (assigned_to) query = query.eq('assigned_to', assigned_to);
      if (related_to) query = query.eq('related_to', related_to);
      if (related_id) query = query.eq('related_id', related_id);
      if (date_from) query = query.gte('due_date', date_from);
      if (date_to) query = query.lte('due_date', date_to);

      // Apply sorting
      const validSortFields = ['due_date', 'created_at', 'updated_at', 'subject', 'status', 'type'];
      const sortField = validSortFields.includes(sort_by) ? sort_by : 'due_date';
      const ascending = sort_order.toLowerCase() === 'asc';
      query = query.order(sortField, { ascending, nullsFirst: false });

      // Apply pagination
      const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 1000);
      const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
      query = query.range(safeOffset, safeOffset + safeLimit - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      const activities = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          activities,
          pagination: {
            total: count || 0,
            limit: safeLimit,
            offset: safeOffset,
            hasMore: (safeOffset + activities.length) < (count || 0)
          }
        }
      });
    } catch (error) {
      logger.error('Error in v2 activity search:', error);
      if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.get('/:id', cacheDetail('activities', 300), async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = req.query.tenant_id || req.tenant?.id;
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
      logger.error('Error in v2 activity get:', error);      // Ensure CORS headers are present in error responses
      if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.put('/:id', invalidateCache('activities'), async (req, res) => {
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
          logger.debug('[Activities V2] Extracted time from due_date:', { due_date: datePart, due_time: updatePayload.due_time });
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
      logger.error('Error in v2 activity update:', error);
      // Ensure CORS headers are present in error responses
      if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
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

      // DEBUG: First verify the activity exists before attempting delete
      const { data: existing, error: fetchErr } = await supabase
        .from('activities')
        .select('id, tenant_id')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) {
        logger.error('[Activities V2 DELETE] Fetch error:', fetchErr);
        throw new Error(fetchErr.message);
      }

      if (!existing) {
        logger.warn('[Activities V2 DELETE] Activity not found:', { id, tenant_id });
        return res.status(404).json({ status: 'error', message: 'Activity not found' });
      }

      // Verify tenant ownership
      if (existing.tenant_id !== tenant_id) {
        logger.warn('[Activities V2 DELETE] Tenant mismatch:', {
          id,
          requested: tenant_id,
          actual: existing.tenant_id
        });
        return res.status(404).json({ status: 'error', message: 'Activity not found' });
      }

      const { data, error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        logger.error('[Activities V2 DELETE] Delete error:', error);
        throw new Error(error.message);
      }
      
      if (!data) {
        logger.warn('[Activities V2 DELETE] Delete returned no data:', { id, tenant_id });
        return res.status(404).json({ status: 'error', message: 'Activity not found' });
      }

      res.json({ status: 'success', message: 'Activity deleted successfully' });
    } catch (error) {
      logger.error('Error in v2 activity delete:', error);
      // Ensure CORS headers are present in error responses
      if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
