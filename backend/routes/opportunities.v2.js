import express from 'express';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildOpportunityAiContext } from '../lib/opportunityAiContext.js';
import { getVisibilityScope } from '../lib/teamVisibility.js';
import { cacheList, cacheDetail, invalidateCache } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

// NOTE: v2 opportunities router for Phase 4.2 internal pilot.
// This implementation is dev-focused and gated by FEATURE_OPPORTUNITIES_V2.

export default function createOpportunityV2Routes(_pgPool) {
  const router = express.Router();

  router.use(validateTenantAccess);

  // Allowed sort fields to prevent column injection attacks
  // Organized by category for maintainability
  const ALLOWED_SORT_FIELDS = [
    // Core fields
    'id',
    'name',
    'stage',
    'description',
    // Financial fields
    'amount',
    'probability',
    'expected_revenue',
    // Relationship fields
    'account_id',
    'contact_id',
    'assigned_to',
    // Date fields
    'close_date',
    'expected_close_date',
    'created_at',
    'updated_at',
    'created_date',
    // Other fields
    'lead_source',
    'next_step',
    'ai_health',
  ];

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

  // GET /api/v2/opportunities/stats - aggregate counts by stage (optimized)
  router.get('/stats', cacheList('opportunities', 60), async (req, res) => {
    try {
      const { tenant_id, stage: _stage, assigned_to, is_test_data } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // ── Team visibility scoping ──
      let visibilityScope = null;
      if (req.user) {
        visibilityScope = await getVisibilityScope(req.user, supabase);
      }

      // Build WHERE conditions matching the main query filters
      let q = supabase
        .from('opportunities')
        .select('stage', { count: 'exact' })
        .eq('tenant_id', tenant_id);

      // Apply team visibility filter
      if (visibilityScope && !visibilityScope.bypass && visibilityScope.employeeIds.length > 0) {
        const idList = visibilityScope.employeeIds.join(',');
        q = q.or(`assigned_to.in.(${idList}),assigned_to.is.null`);
      }

      // Apply same filters as main query
      if (assigned_to !== undefined) {
        if (assigned_to === null || assigned_to === 'null' || assigned_to === '') {
          q = q.is('assigned_to', null);
        } else {
          q = q.eq('assigned_to', assigned_to);
        }
      }

      if (is_test_data !== undefined) {
        const flag = String(is_test_data).toLowerCase();
        if (flag === 'false') {
          q = q.or('is_test_data.is.false,is_test_data.is.null');
        } else if (flag === 'true') {
          q = q.eq('is_test_data', true);
        }
      }

      // Execute query to get all matching opportunities
      const { data, error } = await q;
      if (error) throw new Error(error.message);

      // Group by stage in JavaScript (Supabase client doesn't support GROUP BY directly)
      const stats = {
        total: data?.length || 0,
        prospecting: 0,
        qualification: 0,
        proposal: 0,
        negotiation: 0,
        closed_won: 0,
        closed_lost: 0,
      };

      if (data && Array.isArray(data)) {
        data.forEach((opp) => {
          const stageKey = opp.stage;
          if (stageKey && Object.prototype.hasOwnProperty.call(stats, stageKey)) {
            stats[stageKey]++;
          }
        });
      }

      res.json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      logger.error('Error in v2 opportunities stats:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/v2/opportunities/count - get total count (optimized)
  router.get('/count', cacheList('opportunities', 120), async (req, res) => {
    try {
      const { tenant_id, stage, assigned_to, is_test_data, filter } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // ── Team visibility scoping ──
      let visibilityScope = null;
      if (req.user) {
        visibilityScope = await getVisibilityScope(req.user, supabase);
      }

      let q = supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id);

      // Apply team visibility filter
      if (visibilityScope && !visibilityScope.bypass && visibilityScope.employeeIds.length > 0) {
        const idList = visibilityScope.employeeIds.join(',');
        q = q.or(`assigned_to.in.(${idList}),assigned_to.is.null`);
      }

      // Apply same filters as main query
      if (assigned_to !== undefined) {
        if (assigned_to === null || assigned_to === 'null' || assigned_to === '') {
          q = q.is('assigned_to', null);
        } else {
          q = q.eq('assigned_to', assigned_to);
        }
      }

      if (stage && stage !== 'all' && stage !== 'any' && stage !== '' && stage !== 'undefined') {
        q = q.eq('stage', stage.toLowerCase());
      }

      if (is_test_data !== undefined) {
        const flag = String(is_test_data).toLowerCase();
        if (flag === 'false') {
          q = q.or('is_test_data.is.false,is_test_data.is.null');
        } else if (flag === 'true') {
          q = q.eq('is_test_data', true);
        }
      }

      // Handle basic filter for search terms
      if (filter) {
        try {
          const parsedFilter =
            typeof filter === 'string' && filter.startsWith('{') ? JSON.parse(filter) : filter;

          if (
            typeof parsedFilter === 'object' &&
            parsedFilter.$or &&
            Array.isArray(parsedFilter.$or)
          ) {
            const orConditions = parsedFilter.$or
              .map((condition) => {
                const [field, opObj] = Object.entries(condition)[0];
                if (opObj && opObj.$icontains) {
                  return `${field}.ilike.%${opObj.$icontains}%`;
                }
                return null;
              })
              .filter(Boolean);

            if (orConditions.length > 0) {
              q = q.or(orConditions.join(','));
            }
          }
        } catch (e) {
          logger.error('Error parsing filter in count:', e);
        }
      }

      const { count, error } = await q;
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data: { count: count || 0 },
      });
    } catch (error) {
      logger.error('Error in v2 opportunities count:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/v2/opportunities - list opportunities (v2 shape, internal pilot)
  router.get('/', cacheList('opportunities', 30), async (req, res) => {
    try {
      const {
        tenant_id,
        filter,
        stage,
        account_id,
        contact_id,
        lead_id,
        assigned_to,
        is_test_data,
        $or,
      } = req.query;

      logger.debug('[V2 Opportunities GET] Called with:', {
        tenant_id,
        filter,
        stage,
        account_id,
        contact_id,
        lead_id,
        assigned_to,
        is_test_data,
        $or,
      });

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      // ── Team visibility scoping ──
      let visibilityScope = null;
      if (req.user) {
        visibilityScope = await getVisibilityScope(req.user, supabase);
      }

      let q = supabase
        .from('opportunities')
        .select(
          '*, employee:employees!opportunities_assigned_to_fkey(id, first_name, last_name, email), account:accounts!opportunities_account_id_fkey(id, name), contact:contacts!opportunities_contact_id_fkey(id, first_name, last_name, email)',
          { count: 'exact' },
        )
        .eq('tenant_id', tenant_id);

      // Apply team visibility filter
      if (visibilityScope && !visibilityScope.bypass && visibilityScope.employeeIds.length > 0) {
        const idList = visibilityScope.employeeIds.join(',');
        q = q.or(`assigned_to.in.(${idList}),assigned_to.is.null`);
      }

      // Handle $or for unassigned filter (highest priority)
      if ($or) {
        try {
          const orConditions = typeof $or === 'string' ? JSON.parse($or) : $or;
          if (Array.isArray(orConditions)) {
            const isUnassignedFilter = orConditions.some((cond) => cond.assigned_to === null);
            if (isUnassignedFilter) {
              logger.debug('[V2 Opportunities] Applying unassigned filter from $or query param');
              // Only match NULL; empty string is invalid for UUID columns
              q = q.is('assigned_to', null);
            }
          }
        } catch (e) {
          logger.error('[V2 Opportunities] Failed to parse $or:', e);
        }
      }
      // Handle direct assigned_to parameter
      else if (assigned_to !== undefined) {
        // Treat explicit null or empty string as unassigned
        if (assigned_to === null || assigned_to === 'null' || assigned_to === '') {
          logger.debug(
            '[V2 Opportunities] Applying unassigned filter from assigned_to query param',
          );
          q = q.is('assigned_to', null);
        } else {
          logger.debug(
            '[V2 Opportunities] Applying assigned_to filter from query param:',
            assigned_to,
          );
          q = q.eq('assigned_to', assigned_to);
        }
      }

      // Handle stage filter
      if (stage && stage !== 'all' && stage !== 'any' && stage !== '' && stage !== 'undefined') {
        logger.debug('[V2 Opportunities] Applying stage filter from query param:', stage);
        q = q.eq('stage', stage.toLowerCase());
      }

      // Handle account_id filter (filter opportunities by account)
      if (account_id) {
        logger.debug('[V2 Opportunities] Filtering by account_id:', account_id);
        q = q.eq('account_id', account_id);
      }

      // Handle contact_id filter (filter opportunities by contact)
      if (contact_id) {
        logger.debug('[V2 Opportunities] Filtering by contact_id:', contact_id);
        q = q.eq('contact_id', contact_id);
      }

      // Handle lead_id filter (filter opportunities by lead)
      if (lead_id) {
        logger.debug('[V2 Opportunities] Filtering by lead_id:', lead_id);
        q = q.eq('lead_id', lead_id);
      }

      // Handle is_test_data filter
      if (is_test_data !== undefined) {
        const flag = String(is_test_data).toLowerCase();
        if (flag === 'false') {
          logger.debug('[V2 Opportunities] Excluding test data from query param');
          q = q.or('is_test_data.is.false,is_test_data.is.null');
        } else if (flag === 'true') {
          logger.debug('[V2 Opportunities] Including only test data from query param');
          q = q.eq('is_test_data', true);
        }
      }

      // Basic filter passthrough (mirrors v1) for internal use
      if (filter) {
        let parsedFilter = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsedFilter = JSON.parse(filter);
            logger.debug(
              '[V2 Opportunities] Parsed filter:',
              JSON.stringify(parsedFilter, null, 2),
            );
          } catch {
            // treat as literal
          }
        }

        // Handle assigned_to filter (supports UUID, null, or email)
        if (typeof parsedFilter === 'object' && parsedFilter.assigned_to !== undefined) {
          const at = parsedFilter.assigned_to;
          if (at === null || at === '' || at === 'null') {
            logger.debug('[V2 Opportunities] Applying unassigned filter via parsed filter');
            q = q.is('assigned_to', null);
          } else {
            logger.debug('[V2 Opportunities] Applying assigned_to filter:', at);
            q = q.eq('assigned_to', at);
          }
        }

        // Handle is_test_data filter
        if (typeof parsedFilter === 'object' && parsedFilter.is_test_data !== undefined) {
          logger.debug(
            '[V2 Opportunities] Applying is_test_data filter:',
            parsedFilter.is_test_data,
          );
          q = q.eq('is_test_data', parsedFilter.is_test_data);
        }

        // Handle $or for unassigned (null)
        if (
          typeof parsedFilter === 'object' &&
          parsedFilter.$or &&
          Array.isArray(parsedFilter.$or)
        ) {
          // Check if this is an "unassigned" filter
          const isUnassignedFilter = parsedFilter.$or.some((cond) => cond.assigned_to === null);

          if (isUnassignedFilter) {
            logger.debug('[V2 Opportunities] Applying unassigned filter');
            // For unassigned, only match NULL (empty string is invalid for UUID)
            q = q.is('assigned_to', null);
          } else {
            // Handle other $or conditions (like search)
            const orConditions = parsedFilter.$or
              .map((condition) => {
                const [field, opObj] = Object.entries(condition)[0];
                if (opObj && opObj.$icontains) {
                  return `${field}.ilike.%${opObj.$icontains}%`;
                }
                return null;
              })
              .filter(Boolean);

            if (orConditions.length > 0) {
              q = q.or(orConditions.join(','));
            }
          }
        }
      }

      // Keyset pagination support (if cursor provided, use it; otherwise fall back to offset)
      const cursorUpdatedAt = req.query.cursor_updated_at;
      const cursorId = req.query.cursor_id;

      if (cursorUpdatedAt && cursorId) {
        // Use keyset pagination for better performance
        // WHERE (updated_at, id) < (cursor_updated_at, cursor_id)
        // This matches the composite index order and avoids OFFSET scans
        logger.debug('[V2 Opportunities] Using keyset pagination with cursor:', {
          cursorUpdatedAt,
          cursorId,
        });
        q = q.or(
          `updated_at.lt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.lt.${cursorId})`,
        );
      }

      // Parse sort parameter: supports multiple fields separated by commas
      // Format: -field for descending, field for ascending (e.g., "-updated_at,-id")
      const sortParam = req.query.sort;
      const sortFields = [];

      if (sortParam) {
        try {
          // Split by comma to handle multiple sort fields
          // filter(Boolean) removes empty strings after trimming
          const fields = sortParam
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean);

          for (const field of fields) {
            let fieldName;
            let ascending;

            if (field.startsWith('-')) {
              fieldName = field.substring(1);
              ascending = false;
            } else {
              fieldName = field;
              ascending = true;
            }

            // Validate field name against allowlist to prevent column injection
            if (ALLOWED_SORT_FIELDS.includes(fieldName)) {
              sortFields.push({ field: fieldName, ascending });
            } else {
              logger.warn('[V2 Opportunities] Invalid sort field ignored:', fieldName);
            }
          }
        } catch (e) {
          logger.error('[V2 Opportunities] Error parsing sort parameter:', e);
          // Fall back to default sort
          sortFields.push({ field: 'updated_at', ascending: false });
        }
      }

      // Apply default sort if no valid sort fields
      if (sortFields.length === 0) {
        sortFields.push({ field: 'updated_at', ascending: false });
      }

      // When sorting by amount, exclude nulls to avoid descending order issues
      // with PostgREST null-first behavior on DESC queries.
      if (sortFields.some(({ field }) => field === 'amount')) {
        q = q.not('amount', 'is', null);
      }

      // Apply all sort fields in order
      for (const { field, ascending } of sortFields) {
        q = q.order(field, { ascending, nullsFirst: false });
      }

      // Apply pagination range
      q = q.range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      let rows = Array.isArray(data) ? data : [];

      if (sortFields.some(({ field }) => field === 'amount')) {
        const withAmount = rows.filter((row) => row?.amount !== null && row?.amount !== undefined);
        if (withAmount.length > 0) {
          rows = withAmount;
        }
      }

      // Ensure deterministic ordering for null values (PostgREST defaults to nulls first on DESC).
      if (rows.length > 1 && sortFields.length > 0) {
        rows.sort((left, right) => {
          for (const { field, ascending } of sortFields) {
            const aVal = left?.[field];
            const bVal = right?.[field];

            if (aVal === null || aVal === undefined) {
              if (bVal === null || bVal === undefined) continue;
              return 1; // nulls last
            }
            if (bVal === null || bVal === undefined) {
              return -1; // nulls last
            }

            if (aVal === bVal) continue;

            const aComp = typeof aVal === 'string' ? aVal.toLowerCase() : aVal;
            const bComp = typeof bVal === 'string' ? bVal.toLowerCase() : bVal;
            const comparison = aComp > bComp ? 1 : -1;

            return ascending ? comparison : -comparison;
          }
          return 0;
        });
      }

      const opportunities = rows.map((opp) => {
        const expanded = expandMetadata(opp);
        // Add denormalized names from FK joins
        if (opp.employee) {
          expanded.assigned_to_name =
            `${opp.employee.first_name || ''} ${opp.employee.last_name || ''}`.trim();
          expanded.assigned_to_email = opp.employee.email;
        }
        if (opp.account) {
          expanded.account_name = opp.account.name;
        }
        if (opp.contact) {
          expanded.contact_name =
            `${opp.contact.first_name || ''} ${opp.contact.last_name || ''}`.trim();
          expanded.contact_email = opp.contact.email;
        }
        delete expanded.employee;
        delete expanded.account;
        delete expanded.contact;
        return expanded;
      });

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
      logger.error('Error in v2 opportunities list:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/v2/opportunities - create opportunity with AI context hook (internal pilot)
  router.post('/', invalidateCache('opportunities'), async (req, res) => {
    try {
      const { tenant_id, metadata, lead_source, ...payload } = req.body || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Convert empty string date fields to null (PostgreSQL doesn't accept empty strings for date columns)
      const cleanedPayload = { ...payload };
      ['close_date', 'expected_close_date'].forEach((dateField) => {
        if (cleanedPayload[dateField] === '') {
          cleanedPayload[dateField] = null;
        }
      });

      // Convert empty string UUID fields to null (PostgreSQL doesn't accept empty strings for UUID columns)
      ['account_id', 'contact_id', 'lead_id', 'assigned_to'].forEach((uuidField) => {
        if (cleanedPayload[uuidField] === '') {
          cleanedPayload[uuidField] = null;
        }
      });

      const insertPayload = {
        tenant_id,
        ...cleanedPayload,
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
      logger.error('Error in v2 opportunity create:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/v2/opportunities/:id/assignment-history
  router.get('/:id/assignment-history', async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = req.query.tenant_id || req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('assignment_history')
        .select('id, assigned_from, assigned_to, assigned_by, action, note, created_at')
        .eq('entity_type', 'opportunity')
        .eq('entity_id', id)
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);

      const empIds = new Set();
      (data || []).forEach((h) => {
        if (h.assigned_from) empIds.add(h.assigned_from);
        if (h.assigned_to) empIds.add(h.assigned_to);
        if (h.assigned_by) empIds.add(h.assigned_by);
      });

      let empMap = {};
      if (empIds.size > 0) {
        const { data: emps } = await supabase
          .from('employees')
          .select('id, first_name, last_name')
          .in('id', [...empIds]);
        (emps || []).forEach((e) => {
          empMap[e.id] = `${e.first_name || ''} ${e.last_name || ''}`.trim();
        });
      }

      const history = (data || []).map((h) => ({
        ...h,
        assigned_from_name: empMap[h.assigned_from] || null,
        assigned_to_name: empMap[h.assigned_to] || null,
        assigned_by_name: empMap[h.assigned_by] || null,
      }));

      res.json({ status: 'success', data: history });
    } catch (err) {
      logger.error('[Opportunities v2 GET /:id/assignment-history] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /api/v2/opportunities/:id - fetch single opportunity (v2 shape)
  router.get('/:id', cacheDetail('opportunities', 60), async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = req.query.tenant_id || req.tenant?.id;

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
      logger.error('Error in v2 opportunity get:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/v2/opportunities/:id - shallow update (v2 shape)
  router.put('/:id', invalidateCache('opportunities'), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, metadata, lead_source, ...payload } = req.body || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Convert empty string date fields to null (PostgreSQL doesn't accept empty strings for date columns)
      const cleanedPayload = { ...payload };
      ['close_date', 'expected_close_date'].forEach((dateField) => {
        if (cleanedPayload[dateField] === '') {
          cleanedPayload[dateField] = null;
        }
      });

      const updatePayload = {
        ...cleanedPayload,
        ...(lead_source !== undefined ? { lead_source } : {}),
        ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
        updated_at: new Date().toISOString(),
      };

      // Track assignment changes: fetch current assigned_to before update
      let previousAssignedTo = undefined;
      if (cleanedPayload.assigned_to !== undefined) {
        const { data: current } = await supabase
          .from('opportunities')
          .select('assigned_to')
          .eq('id', id)
          .eq('tenant_id', tenant_id)
          .single();
        previousAssignedTo = current?.assigned_to || null;
      }

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

      // Record assignment change in history (non-blocking)
      const newAssignedTo = data.assigned_to || null;
      if (previousAssignedTo !== undefined && previousAssignedTo !== newAssignedTo) {
        const action = !newAssignedTo ? 'unassign' : !previousAssignedTo ? 'assign' : 'reassign';
        supabase
          .from('assignment_history')
          .insert({
            tenant_id,
            entity_type: 'opportunity',
            entity_id: id,
            assigned_from: previousAssignedTo,
            assigned_to: newAssignedTo,
            assigned_by: req.user?.id || null,
            action,
          })
          .then(({ error: histErr }) => {
            if (histErr)
              logger.warn(
                '[Opportunities v2 PUT] Failed to record assignment history:',
                histErr.message,
              );
          });
      }

      const updated = expandMetadata(data);

      res.json({
        status: 'success',
        data: {
          opportunity: updated,
        },
      });
    } catch (error) {
      logger.error('Error in v2 opportunity update:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/v2/opportunities/:id - delete opportunity
  router.delete('/:id', invalidateCache('opportunities'), async (req, res) => {
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
      logger.error('Error in v2 opportunity delete:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
