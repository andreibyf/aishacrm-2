/**
 * Leads v2 Routes
 * Flattened metadata for cleaner API responses
 * Uses static imports for efficiency
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { sanitizeUuidInput } from '../lib/uuidValidator.js';
import { buildLeadAiContext } from '../lib/aiContextEnricher.js';
import {
  cacheList,
  cacheDetail,
  invalidateCache,
  invalidateTenantCache,
} from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

export default function createLeadsV2Routes() {
  const router = express.Router();

  // Helper to expand metadata fields to top-level
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      // Spread metadata first so DB columns override
      ...metadata,
      ...rest,
      // Keep original metadata for backwards compatibility
      metadata,
    };
  };

  /**
   * @openapi
   * /api/v2/leads/stats:
   *   get:
   *     summary: Get lead counts by status (fast aggregation)
   *     tags: [leads-v2]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: is_test_data
   *         schema: { type: boolean }
   *         description: Filter by test data flag
   *     responses:
   *       200:
   *         description: Lead stats by status
   */
  router.get('/stats', async (req, res) => {
    try {
      const { tenant_id, is_test_data } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Build filter for test data
      let testDataFilter = '';
      if (is_test_data === 'false') {
        testDataFilter = 'AND (is_test_data IS NULL OR is_test_data = false)';
      }

      // Use raw SQL for efficient GROUP BY aggregation
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: `
          SELECT 
            COALESCE(status, 'unknown') as status,
            COUNT(*)::int as count
          FROM leads 
          WHERE tenant_id = $1 ${testDataFilter}
          GROUP BY status
        `,
        params: [tenant_id],
      });

      // If RPC not available, fall back to simple count queries
      if (error && error.message?.includes('function')) {
        // Fallback: Run parallel count queries
        const statuses = ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost'];
        const countPromises = statuses.map(async (status) => {
          let query = supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenant_id)
            .eq('status', status);

          if (is_test_data === 'false') {
            query = query.or('is_test_data.is.false,is_test_data.is.null');
          }

          const { count } = await query;
          return { status, count: count || 0 };
        });

        // Also get total
        let totalQuery = supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant_id);

        if (is_test_data === 'false') {
          totalQuery = totalQuery.or('is_test_data.is.false,is_test_data.is.null');
        }

        const [totalResult, ...statusResults] = await Promise.all([totalQuery, ...countPromises]);

        const stats = {
          total: totalResult.count || 0,
        };
        statusResults.forEach(({ status, count }) => {
          stats[status] = count;
        });

        return res.json({ status: 'success', data: stats });
      }

      if (error) throw new Error(error.message);

      // Transform RPC result to stats object
      const stats = { total: 0 };
      (data || []).forEach((row) => {
        stats[row.status] = row.count;
        stats.total += row.count;
      });

      res.json({ status: 'success', data: stats });
    } catch (err) {
      logger.error('[Leads v2 GET /stats] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/leads:
   *   get:
   *     summary: List leads with flattened metadata
   *     tags: [leads-v2]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: status
   *         schema: { type: string }
   *         description: Filter by status (new, contacted, qualified, etc.)
   *       - in: query
   *         name: source
   *         schema: { type: string }
   *         description: Filter by lead source
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *       - in: query
   *         name: exclude_status
   *         schema: { type: string }
   *         description: Comma-separated list of statuses to exclude (e.g., "converted,lost")
   *     responses:
   *       200:
   *         description: Leads list with flattened metadata
   */
  router.get('/', cacheList('leads', 180), async (req, res) => {
    try {
      const {
        tenant_id,
        status,
        source,
        filter,
        assigned_to,
        account_id,
        is_test_data,
        query: searchQuery,
        exclude_status,
        sort,
      } = req.query;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      logger.debug('[V2 Leads GET] Called with:', {
        tenant_id,
        filter,
        status,
        exclude_status,
        assigned_to,
        account_id,
        is_test_data,
        searchQuery,
        sort,
      });

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Allowlist of valid sort fields + alias map for frontend-facing names.
      // Prevents passing arbitrary column names to Supabase and maps frontend
      // aliases (e.g. updated_date) to actual DB column names (e.g. updated_at).
      const SORT_FIELD_ALIASES = {
        updated_date: 'updated_at',
        created_date: 'created_at',
        updated_at: 'updated_at',
        created_at: 'created_at',
        first_name: 'first_name',
        last_name: 'last_name',
        company: 'company',
        score: 'score',
        status: 'status',
        estimated_value: 'estimated_value',
        email: 'email',
        source: 'source',
      };

      // Parse sort parameter: -field for descending, field for ascending
      let sortField = 'created_at';
      let sortAscending = false;
      if (sort) {
        const rawField = sort.startsWith('-') ? sort.substring(1) : sort;
        sortAscending = !sort.startsWith('-');
        sortField = SORT_FIELD_ALIASES[rawField] ?? 'created_at'; // safe fallback
        if (!SORT_FIELD_ALIASES[rawField]) {
          logger.warn(`[V2 Leads] Unknown sort field '${rawField}' — falling back to created_at`);
        }
        logger.debug('[V2 Leads] Sorting by:', sortField, 'ascending:', sortAscending);
      }

      const supabase = getSupabaseClient();

      // Helper function to build the base query with all filters
      const buildBaseQuery = (selectClause) => {
        let query = supabase
          .from('leads')
          .select(selectClause, { count: 'exact' })
          .eq('tenant_id', tenant_id);

        // Text search across name and email fields
        if (searchQuery && searchQuery.trim()) {
          logger.debug('[V2 Leads] Applying text search:', searchQuery);
          const searchTerm = searchQuery.trim();
          const searchPattern = `%${searchTerm}%`;

          const orConditions = [
            `first_name.ilike.${searchPattern}`,
            `last_name.ilike.${searchPattern}`,
            `email.ilike.${searchPattern}`,
            `company.ilike.${searchPattern}`,
          ];

          // If search contains a space, also search concatenated first_name + last_name
          // This handles full name searches like "John Doe" or "Iso Check"
          if (searchTerm.includes(' ')) {
            // PostgreSQL: concat(first_name, ' ', last_name) ILIKE '%search%'
            // PostgREST doesn't support concat directly in filters, so we search for each part
            const parts = searchTerm.split(/\s+/).filter((p) => p.length > 0);
            if (parts.length >= 2) {
              // Add condition: first_name matches first part AND last_name matches second part
              // Format: (first_name.ilike.%Iso%,last_name.ilike.%Check%)
              const firstPart = `%${parts[0]}%`;
              const lastPart = `%${parts[parts.length - 1]}%`;
              orConditions.push(`first_name.ilike.${firstPart},last_name.ilike.${lastPart}`);
              logger.debug('[V2 Leads] Added full name search condition for parts:', parts);
            }
          }

          query = query.or(orConditions.join(','));
          logger.debug('[V2 Leads] Search OR conditions:', orConditions.join(','));
        }

        // Handle filter parameter with $or support
        if (filter) {
          let parsedFilter = filter;
          if (typeof filter === 'string' && filter.startsWith('{')) {
            try {
              parsedFilter = JSON.parse(filter);
              logger.debug('[V2 Leads] Parsed filter:', JSON.stringify(parsedFilter, null, 2));
            } catch {
              // treat as literal
            }
          }

          // Handle $or with $icontains for text search (from frontend filters)
          if (
            typeof parsedFilter === 'object' &&
            parsedFilter.$or &&
            Array.isArray(parsedFilter.$or)
          ) {
            // Check if this is a text search filter (contains $icontains operators)
            const hasTextSearch = parsedFilter.$or.some(
              (cond) =>
                cond &&
                typeof cond === 'object' &&
                Object.values(cond).some(
                  (val) => val && typeof val === 'object' && '$icontains' in val,
                ),
            );

            if (hasTextSearch) {
              // Build PostgREST OR conditions for text search
              const orConditions = [];
              parsedFilter.$or.forEach((cond) => {
                Object.entries(cond).forEach(([field, value]) => {
                  if (value && typeof value === 'object' && value.$icontains) {
                    orConditions.push(`${field}.ilike.%${value.$icontains}%`);
                  }
                });
              });

              if (orConditions.length > 0) {
                logger.debug('[V2 Leads] Applying text search filter:', orConditions.join(','));
                query = query.or(orConditions.join(','));
              }
            } else {
              // Handle $or for assigned_to filtering
              const normalizedOr = parsedFilter.$or.filter(
                (cond) => cond && typeof cond === 'object',
              );

              // Detect unassigned explicitly and apply a safe null check
              const hasUnassigned = normalizedOr.some((cond) => cond.assigned_to === null);
              const nonEmptyAssignedTo = normalizedOr
                .map((cond) => cond.assigned_to)
                .filter((val) => val !== undefined && val !== null && String(val).trim() !== '');

              if (hasUnassigned && nonEmptyAssignedTo.length === 0) {
                logger.debug('[V2 Leads] Applying unassigned-only filter');
                query = query.is('assigned_to', null);
              } else if (nonEmptyAssignedTo.length > 0) {
                logger.debug('[V2 Leads] Applying assigned_to $or filter:', nonEmptyAssignedTo);
                const orParts = nonEmptyAssignedTo.map((val) => `assigned_to.eq.${val}`);
                query = query.or(orParts.join(','));
              }
            }
          }

          // Handle is_test_data filter from parsed filter
          if (typeof parsedFilter === 'object' && parsedFilter.is_test_data !== undefined) {
            logger.debug('[V2 Leads] Applying is_test_data filter:', parsedFilter.is_test_data);
            if (parsedFilter.is_test_data === false) {
              query = query.or('is_test_data.is.false,is_test_data.is.null');
            } else {
              query = query.eq('is_test_data', parsedFilter.is_test_data);
            }
          }
        }

        // Handle direct query parameters (fallback if no filter param)
        if (
          status &&
          status !== 'all' &&
          status !== 'any' &&
          status !== '' &&
          status !== 'undefined'
        ) {
          let parsedStatus = status;
          if (typeof status === 'string' && status.startsWith('{')) {
            try {
              parsedStatus = JSON.parse(status);
            } catch {
              // treat as literal
            }
          }
          // Handle $nin (not-in) operator for status filtering
          if (typeof parsedStatus === 'object' && parsedStatus.$nin) {
            logger.debug('[V2 Leads] Applying status $nin from query param:', parsedStatus.$nin);
            // Use NOT IN with Supabase
            query = query.not('status', 'in', `(${parsedStatus.$nin.join(',')})`);
          } else {
            query = query.eq('status', status);
          }
        }

        // Handle exclude_status parameter (WAF-safe alternative to $nin in filter)
        // Usage: exclude_status=converted,lost
        if (exclude_status && typeof exclude_status === 'string') {
          const excludeList = exclude_status
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (excludeList.length > 0) {
            logger.debug('[V2 Leads] Applying exclude_status filter:', excludeList);
            query = query.not('status', 'in', `(${excludeList.join(',')})`);
          }
        }

        if (source) query = query.eq('source', source);
        // Filter by account_id if provided
        const safeAccountId = sanitizeUuidInput(account_id);
        if (safeAccountId) {
          logger.debug('[V2 Leads] Filtering by account_id:', safeAccountId);
          query = query.eq('account_id', safeAccountId);
        }
        // Sanitize potential UUID query params to avoid "invalid input syntax for type uuid" errors
        const safeAssignedTo = sanitizeUuidInput(assigned_to);
        if (!filter && safeAssignedTo !== undefined && safeAssignedTo !== null) {
          query = query.eq('assigned_to', safeAssignedTo);
        }

        // Handle is_test_data from query param
        if (is_test_data !== undefined && !filter) {
          const flag = String(is_test_data).toLowerCase();
          if (flag === 'false') {
            logger.debug('[V2 Leads] Excluding test data from query param');
            query = query.or('is_test_data.is.false,is_test_data.is.null');
          } else if (flag === 'true') {
            logger.debug('[V2 Leads] Including only test data from query param');
            query = query.eq('is_test_data', true);
          }
        }

        return query
          .order(sortField, { ascending: sortAscending })
          .range(offset, offset + limit - 1);
      };

      // Try with FK join first (requires leads_assigned_to_fkey constraint)
      // Falls back to simple query without join if FK constraint doesn't exist
      let data, error, count;

      const fkJoinSelect =
        '*, employee:employees!leads_assigned_to_fkey(id, first_name, last_name, email)';
      const simpleSelect = '*';

      let result = await buildBaseQuery(fkJoinSelect);
      ({ data, error, count } = result);

      // If FK join fails (constraint doesn't exist), fall back to simple query
      if (
        error &&
        (error.message?.includes('relationship') ||
          error.message?.includes('hint') ||
          error.code === 'PGRST200')
      ) {
        logger.warn('[V2 Leads GET] FK join failed, falling back to simple query:', error.message);
        result = await buildBaseQuery(simpleSelect);
        ({ data, error, count } = result);
      }

      if (error) throw new Error(error.message);

      // Transform leads: expand metadata and denormalize employee name
      const leads = (data || []).map((lead) => {
        const expanded = expandMetadata(lead);
        // Add assigned_to_name from joined employee data
        if (lead.employee) {
          expanded.assigned_to_name =
            `${lead.employee.first_name || ''} ${lead.employee.last_name || ''}`.trim();
          expanded.assigned_to_email = lead.employee.email;
        }
        // Remove the nested employee object from response
        delete expanded.employee;
        return expanded;
      });

      res.json({
        status: 'success',
        data: { leads, total: count || leads.length },
      });
    } catch (err) {
      logger.error('[Leads v2 GET] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/leads:
   *   post:
   *     summary: Create lead with flattened fields
   *     tags: [leads-v2]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, first_name, last_name]
   *             properties:
   *               tenant_id: { type: string, format: uuid }
   *               first_name: { type: string }
   *               last_name: { type: string }
   *               email: { type: string, format: email }
   *               phone: { type: string }
   *               company: { type: string }
   *               job_title: { type: string }
   *               status: { type: string, default: 'new' }
   *               source: { type: string }
   *               score: { type: integer }
   *               estimated_value: { type: number }
   *               address_1: { type: string }
   *               city: { type: string }
   *               state: { type: string }
   *               zip: { type: string }
   *               tags: { type: array, items: { type: string } }
   *     responses:
   *       200:
   *         description: Lead created
   */
  router.post('/', async (req, res) => {
    try {
      const {
        tenant_id,
        first_name,
        last_name,
        email,
        phone,
        company,
        job_title,
        status = 'new',
        source,
        score,
        score_reason,
        estimated_value,
        do_not_call,
        do_not_text,
        address_1,
        address_2,
        city,
        state,
        zip,
        country,
        unique_id,
        tags,
        is_test_data,
        metadata = {},
      } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      if (!first_name?.trim()) {
        return res.status(400).json({ status: 'error', message: 'first_name is required' });
      }
      if (!last_name?.trim()) {
        return res.status(400).json({ status: 'error', message: 'last_name is required' });
      }

      const nowIso = new Date().toISOString();
      const payload = {
        tenant_id,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        status: status || 'new',
        created_at: nowIso,
        created_date: nowIso,
        updated_at: nowIso,
        metadata,
      };

      // ── Auto-swap: detect AI sending phone in company and vice versa ──
      let fixedPhone = phone;
      let fixedCompany = company;
      if (phone && company) {
        const phoneIsDigits = /^[\d\s\-().+]+$/.test(phone.trim());
        const companyIsDigits = /^[\d\s\-().+]+$/.test(company.trim());
        const phoneHasLetters = /[a-zA-Z]/.test(phone);
        const companyHasLetters = /[a-zA-Z]/.test(company);
        if (companyIsDigits && !companyHasLetters && phoneHasLetters && !phoneIsDigits) {
          logger.warn(`🔄 [AUTO-FIX] Swapping company/phone — AI sent them incorrectly`);
          fixedPhone = company;
          fixedCompany = phone;
        }
      }

      // Optional fields
      if (email) payload.email = email;
      if (fixedPhone) payload.phone = fixedPhone;
      if (fixedCompany) payload.company = fixedCompany;
      if (job_title) payload.job_title = job_title;
      if (source) payload.source = source;
      if (score !== undefined) payload.score = score;
      if (score_reason) payload.score_reason = score_reason;
      if (estimated_value !== undefined) payload.estimated_value = estimated_value;
      if (do_not_call !== undefined) payload.do_not_call = do_not_call;
      if (do_not_text !== undefined) payload.do_not_text = do_not_text;
      if (address_1) payload.address_1 = address_1;
      if (address_2) payload.address_2 = address_2;
      if (city) payload.city = city;
      if (state) payload.state = state;
      if (zip) payload.zip = zip;
      if (country) payload.country = country;
      if (unique_id) payload.unique_id = unique_id;
      if (tags) payload.tags = Array.isArray(tags) ? tags : [];
      if (typeof is_test_data === 'boolean') payload.is_test_data = is_test_data;

      // ── Use SECURITY DEFINER for INSERT (bypasses 8s PostgREST timeout) ──
      const supabase = getSupabaseClient();
      const insertStart = Date.now();
      const { data: insertedId, error: rpcErr } = await supabase.rpc('leads_insert_definer', {
        p_tenant_id: tenant_id,
        p_first_name: first_name.trim(),
        p_last_name: last_name.trim(),
        p_email: email || null,
        p_phone: fixedPhone || null,
        p_company: fixedCompany || null,
        p_job_title: job_title || null,
        p_source: source || null,
        p_status: status || 'new',
        p_metadata: metadata || {},
      });
      const insertMs = Date.now() - insertStart;
      logger.info(`[Leads v2 POST] INSERT via definer in ${insertMs}ms`);
      if (insertMs > 2000) logger.warn(`[Leads v2 POST] SLOW INSERT: ${insertMs}ms`);

      if (rpcErr) throw new Error(rpcErr.message);

      // Patch extra fields the definer doesn't accept (address, score, tags, etc.)
      const extraFields = {};
      if (score !== undefined) extraFields.score = score;
      if (score_reason) extraFields.score_reason = score_reason;
      if (estimated_value !== undefined) extraFields.estimated_value = estimated_value;
      if (do_not_call !== undefined) extraFields.do_not_call = do_not_call;
      if (do_not_text !== undefined) extraFields.do_not_text = do_not_text;
      if (address_1) extraFields.address_1 = address_1;
      if (address_2) extraFields.address_2 = address_2;
      if (city) extraFields.city = city;
      if (state) extraFields.state = state;
      if (zip) extraFields.zip = zip;
      if (country) extraFields.country = country;
      if (unique_id) extraFields.unique_id = unique_id;
      if (tags) extraFields.tags = Array.isArray(tags) ? tags : [];
      if (typeof is_test_data === 'boolean') extraFields.is_test_data = is_test_data;

      let data;
      if (Object.keys(extraFields).length > 0) {
        // Patch extra fields + fetch full record
        const { data: patched, error: patchErr } = await supabase
          .from('leads')
          .update(extraFields)
          .eq('id', insertedId)
          .eq('tenant_id', tenant_id)
          .select('*')
          .single();
        if (patchErr) logger.warn('[Leads v2 POST] Extra fields patch failed:', patchErr.message);
        data = patched;
      }
      if (!data) {
        // Fetch full record
        const { data: fetched } = await supabase
          .from('leads')
          .select('*')
          .eq('id', insertedId)
          .eq('tenant_id', tenant_id)
          .single();
        data = fetched;
      }

      if (!data) throw new Error('Lead created but could not be fetched');

      // Invalidate cache in background
      invalidateTenantCache(tenant_id, 'leads').catch((err) =>
        logger.warn('[Leads v2 POST] Cache invalidation failed:', err.message),
      );

      const created = expandMetadata(data);
      const aiContext = await buildLeadAiContext(created, { tenantId: tenant_id });

      res.json({
        status: 'success',
        message: 'Lead created',
        data: { lead: created, aiContext },
      });
    } catch (err) {
      logger.error('[Leads v2 POST] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/leads/{id}:
   *   get:
   *     summary: Get lead by ID with flattened metadata
   *     tags: [leads-v2]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Lead details
   *       404:
   *         description: Lead not found
   */
  router.get('/:id', cacheDetail('leads', 300), async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = req.query.tenant_id || req.tenant?.id;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ status: 'error', message: 'Lead not found' });
        }
        throw new Error(error.message);
      }

      const lead = expandMetadata(data);
      const aiContext = await buildLeadAiContext(lead, { tenantId: tenant_id });

      res.json({
        status: 'success',
        data: { lead, aiContext },
      });
    } catch (err) {
      logger.error('[Leads v2 GET/:id] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/leads/{id}:
   *   put:
   *     summary: Update lead with flattened fields
   *     tags: [leads-v2]
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
   *             required: [tenant_id]
   *     responses:
   *       200:
   *         description: Lead updated
   *       404:
   *         description: Lead not found
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id, ...updates } = req.body || {};

      // Fallback: if tenant_id is not provided in the body, use req.tenant.id
      // This keeps multi-tenant isolation while allowing internal callers
      // (like AI tools) that rely on authenticated tenant context to work
      // without explicitly passing tenant_id in the payload.
      if (!tenant_id && req.tenant?.id) {
        tenant_id = req.tenant.id;
      }

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Build update payload
      const payload = {
        updated_at: new Date().toISOString(),
      };

      // Map allowed fields
      const allowedFields = [
        'first_name',
        'last_name',
        'email',
        'phone',
        'company',
        'job_title',
        'status',
        'source',
        'score',
        'score_reason',
        'estimated_value',
        'do_not_call',
        'do_not_text',
        'address_1',
        'address_2',
        'city',
        'state',
        'zip',
        'country',
        'unique_id',
        'tags',
        'is_test_data',
        'metadata',
        'assigned_to',
      ];

      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
          payload[field] = updates[field];
        }
      });

      // ── Use SECURITY DEFINER for UPDATE (bypasses 8s PostgREST timeout) ──
      const supabase = getSupabaseClient();
      const updateStart = Date.now();
      const { data: result, error } = await supabase.rpc('leads_update_definer', {
        p_lead_id: id,
        p_tenant_id: tenant_id,
        p_payload: payload,
      });
      const updateMs = Date.now() - updateStart;
      logger.info(`[Leads v2 PUT] UPDATE via definer in ${updateMs}ms`);
      if (updateMs > 2000) logger.warn(`[Leads v2 PUT] SLOW UPDATE: ${updateMs}ms`);

      if (error) {
        if (error.message && error.message.includes('not found')) {
          return res.status(404).json({ status: 'error', message: 'Lead not found' });
        }
        throw new Error(error.message);
      }

      // Invalidate cache in background
      invalidateTenantCache(tenant_id, 'leads').catch((err) =>
        logger.warn('[Leads v2 PUT] Cache invalidation failed:', err.message),
      );

      res.json({
        status: 'success',
        message: 'Lead updated',
        data: expandMetadata(result || {}),
      });
    } catch (err) {
      logger.error('[Leads v2 PUT] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * @openapi
   * /api/v2/leads/{id}:
   *   delete:
   *     summary: Delete lead
   *     tags: [leads-v2]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Lead deleted
   *       404:
   *         description: Lead not found
   */
  /**
   * @openapi
   * /api/v2/leads/bulk-delete:
   *   post:
   *     summary: Bulk delete leads by IDs (single DB round-trip, avoids N×429 issues)
   *     tags: [leads-v2]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, ids]
   *             properties:
   *               tenant_id: { type: string, format: uuid }
   *               ids:
   *                 type: array
   *                 items: { type: string, format: uuid }
   *                 maxItems: 500
   *     responses:
   *       200:
   *         description: Bulk delete result
   */
  router.post('/bulk-delete', async (req, res) => {
    try {
      const { tenant_id, ids } = req.body || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ status: 'error', message: 'ids must be a non-empty array' });
      }
      if (ids.length > 500) {
        return res.status(400).json({ status: 'error', message: 'Maximum 500 ids per request' });
      }

      const supabase = getSupabaseClient();
      const startMs = Date.now();

      const { error, count } = await supabase
        .from('leads')
        .delete({ count: 'exact' })
        .eq('tenant_id', tenant_id)
        .in('id', ids);

      const elapsed = Date.now() - startMs;
      logger.info(`[Leads v2 BULK-DELETE] Deleted ${count ?? '?'} leads in ${elapsed}ms`);

      if (error) throw new Error(error.message);

      // Invalidate cache once for the whole batch
      invalidateTenantCache(tenant_id, 'leads').catch((err) =>
        logger.warn('[Leads v2 BULK-DELETE] Cache invalidation failed:', err.message),
      );

      res.json({
        status: 'success',
        message: `${count ?? ids.length} lead(s) deleted`,
        data: { deleted: count ?? ids.length, requested: ids.length },
      });
    } catch (err) {
      logger.error('[Leads v2 BULK-DELETE] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  router.delete('/:id', invalidateCache('leads'), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // ── Use SECURITY DEFINER for DELETE (bypasses 8s PostgREST timeout) ──
      const supabase = getSupabaseClient();
      const deleteStart = Date.now();
      const { error } = await supabase.rpc('leads_delete_definer', {
        p_lead_id: id,
        p_tenant_id: tenant_id,
      });
      const deleteMs = Date.now() - deleteStart;
      logger.info(`[Leads v2 DELETE] DELETE via definer in ${deleteMs}ms`);
      if (deleteMs > 2000) logger.warn(`[Leads v2 DELETE] SLOW DELETE: ${deleteMs}ms`);

      if (error) {
        if (error.message && error.message.includes('not found')) {
          return res.status(404).json({ status: 'error', message: 'Lead not found' });
        }
        throw new Error(error.message);
      }

      res.json({
        status: 'success',
        message: 'Lead deleted',
        data: { id },
      });
    } catch (err) {
      logger.error('[Leads v2 DELETE] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
