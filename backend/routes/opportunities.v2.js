import express from 'express';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildOpportunityAiContext } from '../lib/opportunityAiContext.js';
import { getVisibilityScope, getAccessLevel, isNotesOnlyUpdate } from '../lib/teamVisibility.js';
import { cacheList, cacheDetail, invalidateCache } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';
import { sanitizeUuidInput } from '../lib/uuidValidator.js';

// NOTE: v2 opportunities router for Phase 4.2 internal pilot.
// This implementation is dev-focused and gated by FEATURE_OPPORTUNITIES_V2.

export default function createOpportunityV2Routes(_pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/v2/opportunities/stats:
   *   get:
   *     summary: Get opportunity stage statistics
   *     tags: [opportunities-v2]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: assigned_to
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: assigned_to_team
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: is_test_data
   *         schema: { type: boolean }
   *     responses:
   *       200:
   *         description: Stage statistics
   *
   * /api/v2/opportunities/count:
   *   get:
   *     summary: Get filtered opportunity count
   *     tags: [opportunities-v2]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: filter
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Count response
   *
   * /api/v2/opportunities:
   *   get:
   *     summary: List opportunities (v2)
   *     tags: [opportunities-v2]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Opportunities list
   *   post:
   *     summary: Create opportunity (v2)
   *     tags: [opportunities-v2]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, name]
   *             properties:
   *               tenant_id: { type: string, format: uuid }
   *               name: { type: string }
   *               stage: { type: string }
   *               amount: { type: number }
   *     responses:
   *       201:
   *         description: Opportunity created
   *
   * /api/v2/opportunities/{id}:
   *   get:
   *     summary: Get opportunity by ID
   *     tags: [opportunities-v2]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Opportunity details
   *   put:
   *     summary: Update opportunity
   *     tags: [opportunities-v2]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             additionalProperties: true
   *     responses:
   *       200:
   *         description: Opportunity updated
   *   delete:
   *     summary: Delete opportunity
   *     tags: [opportunities-v2]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Opportunity deleted
   *
   * /api/v2/opportunities/{id}/assignment-history:
   *   get:
   *     summary: Get assignment history for an opportunity
   *     tags: [opportunities-v2]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Assignment history
   */

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
    'assigned_to_team',
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
      const { tenant_id, stage: _stage, assigned_to, assigned_to_team, is_test_data } = req.query;

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

      // Apply team visibility filter (shared: org-wide read, hierarchical: own teams)
      if (visibilityScope && !visibilityScope.bypass) {
        if (visibilityScope.mode === 'shared' && visibilityScope.teamIds?.length > 0) {
          // org-wide read
        } else if (visibilityScope.employeeIds?.length > 0) {
          const idList = visibilityScope.employeeIds.join(',');
          q = q.or(`assigned_to.in.(${idList}),assigned_to.is.null`);
        }
      }

      // Apply same filters as main query
      if (assigned_to !== undefined) {
        if (
          assigned_to === null ||
          assigned_to === 'null' ||
          assigned_to === '' ||
          assigned_to === 'unassigned'
        ) {
          q = q.is('assigned_to', null);
        } else {
          q = q.eq('assigned_to', assigned_to);
        }
      }

      // Filter by assigned_to_team (team UUID)
      if (assigned_to_team !== undefined && assigned_to_team !== null && assigned_to_team !== '') {
        q = q.eq('assigned_to_team', assigned_to_team);
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
          // Normalize legacy stage values: won → closed_won, lost → closed_lost
          let stageKey = opp.stage;
          if (stageKey === 'won') stageKey = 'closed_won';
          else if (stageKey === 'lost') stageKey = 'closed_lost';

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
      const { tenant_id, stage, assigned_to, assigned_to_team, is_test_data, filter } = req.query;

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

      // Apply team visibility filter (shared: org-wide read, hierarchical: own teams)
      if (visibilityScope && !visibilityScope.bypass) {
        if (visibilityScope.mode === 'shared' && visibilityScope.teamIds?.length > 0) {
          // org-wide read
        } else if (visibilityScope.employeeIds?.length > 0) {
          const idList = visibilityScope.employeeIds.join(',');
          q = q.or(`assigned_to.in.(${idList}),assigned_to.is.null`);
        }
      }

      // Apply same filters as main query
      if (assigned_to !== undefined) {
        if (
          assigned_to === null ||
          assigned_to === 'null' ||
          assigned_to === '' ||
          assigned_to === 'unassigned'
        ) {
          q = q.is('assigned_to', null);
        } else {
          q = q.eq('assigned_to', assigned_to);
        }
      }

      // Filter by assigned_to_team (team UUID)
      if (assigned_to_team !== undefined && assigned_to_team !== null && assigned_to_team !== '') {
        q = q.eq('assigned_to_team', assigned_to_team);
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
        assigned_to_team,
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
          '*, employee:employees!opportunities_assigned_to_fkey(id, first_name, last_name, email), account:accounts!opportunities_account_id_fkey(id, name), contact:contacts!opportunities_contact_id_fkey(id, first_name, last_name, email), team:teams!opportunities_assigned_to_team_fkey(id, name)',
          { count: 'exact' },
        )
        .eq('tenant_id', tenant_id);

      // Apply team visibility filter (shared: org-wide read, hierarchical: own teams)
      if (visibilityScope && !visibilityScope.bypass) {
        if (visibilityScope.mode === 'shared' && visibilityScope.teamIds?.length > 0) {
          // Shared: org-wide read, no additional filter
        } else if (visibilityScope.employeeIds?.length > 0) {
          const idList = visibilityScope.employeeIds.join(',');
          q = q.or(`assigned_to.in.(${idList}),assigned_to.is.null`);
        }
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
        if (
          assigned_to === null ||
          assigned_to === 'null' ||
          assigned_to === '' ||
          assigned_to === 'unassigned'
        ) {
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

      // Filter by assigned_to_team (team UUID)
      if (assigned_to_team !== undefined && assigned_to_team !== null && assigned_to_team !== '') {
        q = q.eq('assigned_to_team', assigned_to_team);
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

        // Handle $or for assigned_to ($in, unassigned, search)
        if (
          typeof parsedFilter === 'object' &&
          parsedFilter.$or &&
          Array.isArray(parsedFilter.$or)
        ) {
          const normalizedOr = parsedFilter.$or.filter((c) => c && typeof c === 'object');
          const hasUnassigned = normalizedOr.some((c) => c.assigned_to === null);

          // Collect assigned_to values: direct UUIDs and $in arrays
          const assignedOrParts = [];
          for (const condition of normalizedOr) {
            const val = condition.assigned_to;
            if (val === null || val === undefined) continue;
            if (typeof val === 'object' && val.$in && Array.isArray(val.$in)) {
              const ids = val.$in.filter((id) => typeof id === 'string' && id.trim());
              if (ids.length > 0) {
                assignedOrParts.push(`assigned_to.in.(${ids.join(',')})`);
              }
            } else if (typeof val === 'string' && val.trim()) {
              assignedOrParts.push(`assigned_to.eq.${val}`);
            }
          }
          if (hasUnassigned) {
            assignedOrParts.push('assigned_to.is.null');
          }
          if (assignedOrParts.length > 0) {
            logger.debug(
              '[V2 Opportunities] Applying assigned_to OR filter:',
              assignedOrParts.join(','),
            );
            q = q.or(assignedOrParts.join(','));
          }

          // Handle other $or conditions (like search with $icontains)
          const searchOrs = normalizedOr
            .map((condition) => {
              const [field, opObj] = Object.entries(condition)[0] || [];
              if (opObj && opObj.$icontains) {
                return `${field}.ilike.%${opObj.$icontains}%`;
              }
              return null;
            })
            .filter(Boolean);
          if (searchOrs.length > 0) {
            q = q.or(searchOrs.join(','));
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
        if (opp.team) {
          expanded.assigned_to_team_name = opp.team.name;
        }
        delete expanded.employee;
        delete expanded.account;
        delete expanded.contact;
        delete expanded.team;
        return expanded;
      });

      // Compute inline stats via a separate aggregation query (not paginated)
      // This ensures stats reflect the FULL filtered dataset, not just the current page
      let stats = {
        total: count || 0,
        prospecting: 0,
        qualification: 0,
        proposal: 0,
        negotiation: 0,
        closed_won: 0,
        closed_lost: 0,
        other: 0,
      };

      try {
        // Build stats query with same base filters as main query (no stage/search/pagination)
        let statsQuery = supabase.from('opportunities').select('stage').eq('tenant_id', tenant_id);

        // Apply same visibility scope
        if (visibilityScope && !visibilityScope.bypass) {
          if (visibilityScope.mode === 'shared' && visibilityScope.teamIds?.length > 0) {
            // Shared: org-wide read, no filter
          } else if (visibilityScope.employeeIds?.length > 0) {
            const idList = visibilityScope.employeeIds.join(',');
            statsQuery = statsQuery.or(`assigned_to.in.(${idList}),assigned_to.is.null`);
          }
        }

        // Apply same filter object as main query (assigned_to, $or, is_test_data) — no stage, no search
        if (filter) {
          let parsedFilter = filter;
          if (typeof filter === 'string' && filter.startsWith('{')) {
            try {
              parsedFilter = JSON.parse(filter);
            } catch {
              // treat as literal
            }
          }
          if (typeof parsedFilter === 'object') {
            if (parsedFilter.assigned_to !== undefined) {
              const at = parsedFilter.assigned_to;
              if (at === null || at === '' || at === 'null') {
                statsQuery = statsQuery.is('assigned_to', null);
              } else {
                const safeAt = sanitizeUuidInput(at);
                if (safeAt) statsQuery = statsQuery.eq('assigned_to', safeAt);
              }
            }
            if (parsedFilter.$or && Array.isArray(parsedFilter.$or)) {
              const normalizedOr = parsedFilter.$or.filter((c) => c && typeof c === 'object');
              const hasUnassigned = normalizedOr.some((c) => c.assigned_to === null);
              const assignedOrParts = [];
              for (const condition of normalizedOr) {
                const val = condition.assigned_to;
                if (val === null || val === undefined) continue;
                if (typeof val === 'object' && val.$in && Array.isArray(val.$in)) {
                  const ids = val.$in.filter((id) => sanitizeUuidInput(id) !== null);
                  if (ids.length > 0) assignedOrParts.push(`assigned_to.in.(${ids.join(',')})`);
                } else if (typeof val === 'string' && sanitizeUuidInput(val) !== null) {
                  assignedOrParts.push(`assigned_to.eq.${val}`);
                }
              }
              if (hasUnassigned) assignedOrParts.push('assigned_to.is.null');
              if (assignedOrParts.length > 0) statsQuery = statsQuery.or(assignedOrParts.join(','));
            }
            if (parsedFilter.is_test_data !== undefined) {
              if (parsedFilter.is_test_data === false) {
                statsQuery = statsQuery.or('is_test_data.is.false,is_test_data.is.null');
              } else {
                statsQuery = statsQuery.eq('is_test_data', parsedFilter.is_test_data);
              }
            }
          }
        }
        if (!filter && assigned_to !== undefined) {
          if (
            assigned_to === null ||
            assigned_to === 'null' ||
            assigned_to === '' ||
            assigned_to === 'unassigned'
          ) {
            statsQuery = statsQuery.is('assigned_to', null);
          } else {
            const safeAssignedTo = sanitizeUuidInput(assigned_to);
            if (safeAssignedTo) statsQuery = statsQuery.eq('assigned_to', safeAssignedTo);
          }
        }
        if (
          assigned_to_team !== undefined &&
          assigned_to_team !== null &&
          assigned_to_team !== ''
        ) {
          const safeTeamId = sanitizeUuidInput(assigned_to_team);
          if (safeTeamId) statsQuery = statsQuery.eq('assigned_to_team', safeTeamId);
        }
        if (account_id) statsQuery = statsQuery.eq('account_id', account_id);
        if (contact_id) statsQuery = statsQuery.eq('contact_id', contact_id);
        if (lead_id) statsQuery = statsQuery.eq('lead_id', lead_id);
        if (is_test_data !== undefined && !filter) {
          const flag = String(is_test_data).toLowerCase();
          if (flag === 'false') {
            statsQuery = statsQuery.or('is_test_data.is.false,is_test_data.is.null');
          } else if (flag === 'true') {
            statsQuery = statsQuery.eq('is_test_data', true);
          }
        }

        const { data: statsData, error: statsError } = await statsQuery;
        if (statsError) {
          logger.warn('[V2 Opportunities] Stats query failed, using fallback:', statsError.message);
        } else if (statsData && Array.isArray(statsData)) {
          // Reset stats from query results
          stats.total = statsData.length;
          stats.prospecting = 0;
          stats.qualification = 0;
          stats.proposal = 0;
          stats.negotiation = 0;
          stats.closed_won = 0;
          stats.closed_lost = 0;
          stats.other = 0;

          for (const row of statsData) {
            // Normalize legacy stage values
            let stageKey = row.stage;
            if (stageKey === 'won') stageKey = 'closed_won';
            else if (stageKey === 'lost') stageKey = 'closed_lost';
            else if (stageKey === 'prospect') stageKey = 'prospecting';

            if (stageKey && Object.prototype.hasOwnProperty.call(stats, stageKey)) {
              stats[stageKey]++;
            } else {
              stats.other++;
            }
          }
        }
      } catch (statsErr) {
        logger.warn('[V2 Opportunities] Stats aggregation error:', statsErr.message);
        // Keep default stats with count from main query
      }

      res.json({
        status: 'success',
        data: {
          opportunities,
          total: count || 0,
          limit,
          offset,
          stats,
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
      const { tenant_id: body_tenant_id, metadata, lead_source, ...payload } = req.body || {};
      // Resolve tenant_id consistently: body → query → middleware-resolved tenant
      const tenant_id = body_tenant_id || req.query.tenant_id || req.tenant?.id;

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

      // ── Two-tier write access check ──
      let previousAssignedTo = undefined;
      if (req.user) {
        const { data: current } = await supabase
          .from('opportunities')
          .select('assigned_to, assigned_to_team')
          .eq('id', id)
          .eq('tenant_id', tenant_id)
          .single();
        previousAssignedTo = current?.assigned_to || null;

        const scope = await getVisibilityScope(req.user, supabase);
        const access = getAccessLevel(
          scope,
          current?.assigned_to_team,
          current?.assigned_to,
          req.user.id,
        );

        if (access === 'none') {
          return res
            .status(403)
            .json({ status: 'error', message: 'You do not have access to this record' });
        }
        if (access === 'read_only') {
          return res.status(403).json({
            status: 'error',
            message: 'This record is read-only for your access level',
          });
        }
        if (access === 'read_notes' && !isNotesOnlyUpdate(updatePayload)) {
          return res.status(403).json({
            status: 'error',
            message: 'You can only add notes to records outside your team',
          });
        }
      } else if (cleanedPayload.assigned_to !== undefined) {
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

      // ── Two-tier write access check for delete ──
      if (req.user) {
        const { data: current } = await supabase
          .from('opportunities')
          .select('assigned_to, assigned_to_team')
          .eq('id', id)
          .eq('tenant_id', tenant_id)
          .single();

        if (current) {
          const scope = await getVisibilityScope(req.user, supabase);
          const access = getAccessLevel(
            scope,
            current.assigned_to_team,
            current.assigned_to,
            req.user.id,
          );
          if (access !== 'full') {
            return res.status(403).json({
              status: 'error',
              message: 'You do not have permission to delete this record',
            });
          }
        }
      }

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
