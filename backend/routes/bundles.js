/**
 * Bundle Routes - Optimized endpoints for page data loading
 *
 * These endpoints return all data needed for a page in a single request,
 * eliminating N+1 query problems and reducing API round-trips.
 *
 * Pattern: Each bundle endpoint fetches related entities concurrently
 * using Promise.all() and returns them in a single payload.
 *
 * ============================================================================
 * INTEGRATION STATUS (January 2026)
 * ============================================================================
 *
 * These bundle endpoints are COMPLETE and TESTED but NOT YET INTEGRATED into
 * the main CRM pages (Leads.jsx, Contacts.jsx, Opportunities.jsx).
 *
 * WHY NOT INTEGRATED:
 * - Leads.jsx has complex age filtering with hybrid client/server pagination
 *   that requires fetching larger batches and filtering client-side
 * - The existing pages already optimize with Promise.all() for supporting data
 * - Bundle endpoints don't support the $or search filters with $icontains
 * - Risk of breaking existing functionality outweighed the benefit
 *
 * RECOMMENDED USE CASES:
 * - New features needing combined entity data in a single request
 * - AI/Braid tools that need tenant data snapshots (see snapshot.braid)
 * - Mobile clients or external integrations with simpler data needs
 * - Dashboard widgets needing combined entity + stats data
 * - Simpler CRUD pages without complex client-side filtering
 *
 * FRONTEND CLIENT: src/api/bundles.js
 * DOCS: docs/BUNDLE_ENDPOINTS_TESTING.md
 * TESTS: backend/__tests__/bundles.test.js, scripts/test-bundle-endpoints.js
 * ============================================================================
 */

import express from 'express';
import logger from '../lib/logger.js';
import { requireAuthCookie } from '../middleware/authCookie.js';

export default function createBundleRoutes(_pgPool) {
  const router = express.Router();

  // Redis cache TTL for bundles (shorter than dashboard since data changes more frequently)
  const BUNDLE_TTL_SECONDS = 60; // 1 minute

  /**
   * GET /api/bundles/leads
   * Returns leads page bundle: leads + users + employees + accounts + stats
   *
   * Query params:
   * - tenant_id: UUID (required)
   * - page: number (default 1)
   * - page_size: number (default 25, max 100)
   * - search: string (optional)
   * - status: string (optional, e.g., "new", "contacted")
   * - assigned_to: UUID or email (optional)
   * - include_test_data: boolean (default true)
   * - tags: comma-separated tag IDs (optional)
   * - age_min: number (days, optional)
   * - age_max: number (days, optional)
   */
  router.get('/leads', requireAuthCookie, async (req, res) => {
    try {
      const {
        tenant_id,
        page = 1,
        page_size = 25,
        search = '',
        status = 'all',
        assigned_to,
        include_test_data = 'true',
        tags = '',
        age_min,
        age_max
      } = req.query;

      // Validate required params
      if (!tenant_id || tenant_id === 'null' || tenant_id === '') {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const includeTestData = include_test_data !== 'false';
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size, 10) || 25));
      const offset = (pageNum - 1) * pageSizeNum;

      // Build cache key
      const cacheKey = `bundle:leads:${tenant_id}:page=${pageNum}:size=${pageSizeNum}:search=${search}:status=${status}:assigned=${assigned_to || 'all'}:test=${includeTestData}:tags=${tags}:age=${age_min || ''}-${age_max || ''}`;

      // Try cache first
      const cacheManager = req.app?.locals?.cacheManager;
      if (cacheManager && cacheManager.client) {
        try {
          const cached = await cacheManager.get(cacheKey);
          if (cached) {
            logger.debug(`[bundles/leads] Cache HIT key=${cacheKey}`);
            return res.json({ status: 'success', data: cached, cached: true });
          }
        } catch (err) {
          logger.warn(`[bundles/leads] Cache read error: ${err.message}`);
        }
      }

      logger.debug(`[bundles/leads] Cache MISS key=${cacheKey}`);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Build base filters
      const buildTestDataFilter = (query) => {
        if (!includeTestData) {
          return query.or('is_test_data.is.false,is_test_data.is.null');
        }
        return query;
      };

      // Fetch all data concurrently
      const startTime = Date.now();

      // 1. Fetch paginated leads with filters
      const leadsPromise = (async () => {
        try {
          let query = supabase
            .from('leads')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenant_id);

          // Apply filters
          if (search) {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
          }

          if (status && status !== 'all') {
            query = query.eq('status', status);
          }

          if (assigned_to && assigned_to !== 'all') {
            if (assigned_to === 'unassigned') {
              query = query.is('assigned_to', null);
            } else {
              query = query.eq('assigned_to', assigned_to);
            }
          }

          if (tags) {
            const tagIds = tags.split(',').map(t => t.trim()).filter(Boolean);
            if (tagIds.length > 0) {
              query = query.contains('tag_ids', tagIds);
            }
          }

          // Age filtering (if specified)
          if (age_min !== undefined || age_max !== undefined) {
            const today = new Date();
            if (age_max !== undefined) {
              const maxDate = new Date(today);
              maxDate.setDate(maxDate.getDate() - parseInt(age_min || 0, 10));
              query = query.gte('created_date', maxDate.toISOString());
            }
            if (age_min !== undefined && age_max !== undefined) {
              const minDate = new Date(today);
              minDate.setDate(minDate.getDate() - parseInt(age_max, 10));
              query = query.lte('created_date', minDate.toISOString());
            }
          }

          query = buildTestDataFilter(query);
          query = query.order('created_date', { ascending: false })
                       .range(offset, offset + pageSizeNum - 1);

          const { data, error, count } = await query;
          if (error) throw error;
          return { data: data || [], count: count || 0 };
        } catch (error) {
          logger.error('[bundles/leads] Error fetching leads:', error);
          return { data: [], count: 0 };
        }
      })();

      // 2. Fetch stats (all leads for status counts)
      const statsPromise = (async () => {
        try {
          let query = supabase
            .from('leads')
            .select('status', { count: 'exact', head: false })
            .eq('tenant_id', tenant_id);

          if (assigned_to && assigned_to !== 'all') {
            if (assigned_to === 'unassigned') {
              query = query.is('assigned_to', null);
            } else {
              query = query.eq('assigned_to', assigned_to);
            }
          }

          query = buildTestDataFilter(query);

          const { data, error } = await query;
          if (error) throw error;

          // Count by status
          const stats = {
            total: data?.length || 0,
            new: data?.filter(l => l.status === 'new').length || 0,
            contacted: data?.filter(l => l.status === 'contacted').length || 0,
            qualified: data?.filter(l => l.status === 'qualified').length || 0,
            unqualified: data?.filter(l => l.status === 'unqualified').length || 0,
            converted: data?.filter(l => l.status === 'converted').length || 0,
            lost: data?.filter(l => l.status === 'lost').length || 0,
          };
          return stats;
        } catch (error) {
          logger.error('[bundles/leads] Error fetching stats:', error);
          return { total: 0, new: 0, contacted: 0, qualified: 0, unqualified: 0, converted: 0, lost: 0 };
        }
      })();

      // 3. Fetch users (limit 1000)
      const usersPromise = (async () => {
        try {
          let query = supabase
            .from('users')
            .select('id, email, first_name, last_name, role')
            .eq('tenant_id', tenant_id)
            .order('email', { ascending: true })
            .limit(1000);

          const { data, error } = await query;
          if (error) throw error;
          return data || [];
        } catch (error) {
          logger.error('[bundles/leads] Error fetching users:', error);
          return [];
        }
      })();

      // 4. Fetch employees (limit 1000)
      const employeesPromise = (async () => {
        try {
          let query = supabase
            .from('employees')
            .select('id, user_email, first_name, last_name, employee_role')
            .eq('tenant_id', tenant_id)
            .order('user_email', { ascending: true })
            .limit(1000);

          const { data, error } = await query;
          if (error) throw error;
          return data || [];
        } catch (error) {
          logger.error('[bundles/leads] Error fetching employees:', error);
          return [];
        }
      })();

      // 5. Fetch accounts (limit 1000)
      const accountsPromise = (async () => {
        try {
          let query = supabase
            .from('accounts')
            .select('id, name, website, industry')
            .eq('tenant_id', tenant_id)
            .order('name', { ascending: true })
            .limit(1000);

          const { data, error } = await query;
          if (error) throw error;
          return data || [];
        } catch (error) {
          logger.error('[bundles/leads] Error fetching accounts:', error);
          return [];
        }
      })();

      // Execute all queries concurrently
      const [leadsResult, stats, users, employees, accounts] = await Promise.all([
        leadsPromise,
        statsPromise,
        usersPromise,
        employeesPromise,
        accountsPromise
      ]);

      const elapsed = Date.now() - startTime;

      const bundle = {
        leads: leadsResult.data,
        stats,
        users,
        employees,
        accounts,
        pagination: {
          page: pageNum,
          page_size: pageSizeNum,
          total_items: leadsResult.count,
          total_pages: Math.ceil(leadsResult.count / pageSizeNum)
        },
        meta: {
          tenant_id,
          generated_at: new Date().toISOString(),
          ttl_seconds: BUNDLE_TTL_SECONDS,
          source: 'manual_aggregation',
          elapsed_ms: elapsed
        }
      };

      // Store in cache
      if (cacheManager && cacheManager.client) {
        try {
          await cacheManager.set(cacheKey, bundle, BUNDLE_TTL_SECONDS);
        } catch (err) {
          logger.warn(`[bundles/leads] Cache write error: ${err.message}`);
        }
      }

      logger.info(`[bundles/leads] Bundle generated in ${elapsed}ms for tenant ${tenant_id}`);
      res.json({ status: 'success', data: bundle, cached: false });

    } catch (error) {
      logger.error('[bundles/leads] Unexpected error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/bundles/contacts
   * Returns contacts page bundle: contacts + users + employees + accounts + stats
   *
   * Query params: Similar to /leads endpoint
   */
  router.get('/contacts', requireAuthCookie, async (req, res) => {
    try {
      const {
        tenant_id,
        page = 1,
        page_size = 25,
        search = '',
        status = 'all',
        assigned_to,
        include_test_data = 'true',
        tags = ''
      } = req.query;

      if (!tenant_id || tenant_id === 'null' || tenant_id === '') {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const includeTestData = include_test_data !== 'false';
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size, 10) || 25));
      const offset = (pageNum - 1) * pageSizeNum;

      const cacheKey = `bundle:contacts:${tenant_id}:page=${pageNum}:size=${pageSizeNum}:search=${search}:status=${status}:assigned=${assigned_to || 'all'}:test=${includeTestData}:tags=${tags}`;

      // Try cache
      const cacheManager = req.app?.locals?.cacheManager;
      if (cacheManager && cacheManager.client) {
        try {
          const cached = await cacheManager.get(cacheKey);
          if (cached) {
            logger.debug(`[bundles/contacts] Cache HIT key=${cacheKey}`);
            return res.json({ status: 'success', data: cached, cached: true });
          }
        } catch (err) {
          logger.warn(`[bundles/contacts] Cache read error: ${err.message}`);
        }
      }

      logger.debug(`[bundles/contacts] Cache MISS key=${cacheKey}`);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const buildTestDataFilter = (query) => {
        if (!includeTestData) {
          return query.or('is_test_data.is.false,is_test_data.is.null');
        }
        return query;
      };

      const startTime = Date.now();

      // Fetch paginated contacts
      const contactsPromise = (async () => {
        try {
          let query = supabase
            .from('contacts')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenant_id);

          if (search) {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
          }

          if (status && status !== 'all') {
            query = query.eq('status', status);
          }

          if (assigned_to && assigned_to !== 'all') {
            if (assigned_to === 'unassigned') {
              query = query.is('assigned_to', null);
            } else {
              query = query.eq('assigned_to', assigned_to);
            }
          }

          if (tags) {
            const tagIds = tags.split(',').map(t => t.trim()).filter(Boolean);
            if (tagIds.length > 0) {
              query = query.contains('tag_ids', tagIds);
            }
          }

          query = buildTestDataFilter(query);
          query = query.order('created_at', { ascending: false })
                       .range(offset, offset + pageSizeNum - 1);

          const { data, error, count } = await query;
          if (error) throw error;
          return { data: data || [], count: count || 0 };
        } catch (error) {
          logger.error('[bundles/contacts] Error fetching contacts:', error);
          return { data: [], count: 0 };
        }
      })();

      // Fetch stats
      const statsPromise = (async () => {
        try {
          let query = supabase
            .from('contacts')
            .select('status', { count: 'exact', head: false })
            .eq('tenant_id', tenant_id);

          if (assigned_to && assigned_to !== 'all') {
            if (assigned_to === 'unassigned') {
              query = query.is('assigned_to', null);
            } else {
              query = query.eq('assigned_to', assigned_to);
            }
          }

          query = buildTestDataFilter(query);

          const { data, error } = await query;
          if (error) throw error;

          const stats = {
            total: data?.length || 0,
            active: data?.filter(c => c.status === 'active').length || 0,
            prospect: data?.filter(c => c.status === 'prospect').length || 0,
            customer: data?.filter(c => c.status === 'customer').length || 0,
            inactive: data?.filter(c => c.status === 'inactive').length || 0,
          };
          return stats;
        } catch (error) {
          logger.error('[bundles/contacts] Error fetching stats:', error);
          return { total: 0, active: 0, prospect: 0, customer: 0, inactive: 0 };
        }
      })();

      // Fetch supporting data
      const usersPromise = (async () => {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('id, email, first_name, last_name, role')
            .eq('tenant_id', tenant_id)
            .order('email', { ascending: true })
            .limit(1000);
          if (error) throw error;
          return data || [];
        } catch (error) {
          logger.error('[bundles/contacts] Error fetching users:', error);
          return [];
        }
      })();

      const employeesPromise = (async () => {
        try {
          const { data, error } = await supabase
            .from('employees')
            .select('id, user_email, first_name, last_name, employee_role')
            .eq('tenant_id', tenant_id)
            .order('user_email', { ascending: true })
            .limit(1000);
          if (error) throw error;
          return data || [];
        } catch (error) {
          logger.error('[bundles/contacts] Error fetching employees:', error);
          return [];
        }
      })();

      const accountsPromise = (async () => {
        try {
          const { data, error } = await supabase
            .from('accounts')
            .select('id, name, website, industry')
            .eq('tenant_id', tenant_id)
            .order('name', { ascending: true })
            .limit(1000);
          if (error) throw error;
          return data || [];
        } catch (error) {
          logger.error('[bundles/contacts] Error fetching accounts:', error);
          return [];
        }
      })();

      const [contactsResult, stats, users, employees, accounts] = await Promise.all([
        contactsPromise,
        statsPromise,
        usersPromise,
        employeesPromise,
        accountsPromise
      ]);

      const elapsed = Date.now() - startTime;

      const bundle = {
        contacts: contactsResult.data,
        stats,
        users,
        employees,
        accounts,
        pagination: {
          page: pageNum,
          page_size: pageSizeNum,
          total_items: contactsResult.count,
          total_pages: Math.ceil(contactsResult.count / pageSizeNum)
        },
        meta: {
          tenant_id,
          generated_at: new Date().toISOString(),
          ttl_seconds: BUNDLE_TTL_SECONDS,
          source: 'manual_aggregation',
          elapsed_ms: elapsed
        }
      };

      // Store in cache
      if (cacheManager && cacheManager.client) {
        try {
          await cacheManager.set(cacheKey, bundle, BUNDLE_TTL_SECONDS);
        } catch (err) {
          logger.warn(`[bundles/contacts] Cache write error: ${err.message}`);
        }
      }

      logger.info(`[bundles/contacts] Bundle generated in ${elapsed}ms for tenant ${tenant_id}`);
      res.json({ status: 'success', data: bundle, cached: false });

    } catch (error) {
      logger.error('[bundles/contacts] Unexpected error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/bundles/opportunities
   * Returns opportunities page bundle: opportunities + users + employees + accounts + contacts + leads + stats
   *
   * Query params: Similar to /leads endpoint (stage instead of status)
   */
  router.get('/opportunities', requireAuthCookie, async (req, res) => {
    try {
      const {
        tenant_id,
        page = 1,
        page_size = 25,
        search = '',
        stage = 'all',
        assigned_to,
        include_test_data = 'true',
        tags = ''
      } = req.query;

      if (!tenant_id || tenant_id === 'null' || tenant_id === '') {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const includeTestData = include_test_data !== 'false';
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size, 10) || 25));
      const offset = (pageNum - 1) * pageSizeNum;

      const cacheKey = `bundle:opportunities:${tenant_id}:page=${pageNum}:size=${pageSizeNum}:search=${search}:stage=${stage}:assigned=${assigned_to || 'all'}:test=${includeTestData}:tags=${tags}`;

      // Try cache
      const cacheManager = req.app?.locals?.cacheManager;
      if (cacheManager && cacheManager.client) {
        try {
          const cached = await cacheManager.get(cacheKey);
          if (cached) {
            logger.debug(`[bundles/opportunities] Cache HIT key=${cacheKey}`);
            return res.json({ status: 'success', data: cached, cached: true });
          }
        } catch (err) {
          logger.warn(`[bundles/opportunities] Cache read error: ${err.message}`);
        }
      }

      logger.debug(`[bundles/opportunities] Cache MISS key=${cacheKey}`);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const buildTestDataFilter = (query) => {
        if (!includeTestData) {
          return query.or('is_test_data.is.false,is_test_data.is.null');
        }
        return query;
      };

      const startTime = Date.now();

      // Fetch paginated opportunities
      const opportunitiesPromise = (async () => {
        try {
          let query = supabase
            .from('opportunities')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenant_id);

          if (search) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
          }

          if (stage && stage !== 'all') {
            query = query.eq('stage', stage);
          }

          if (assigned_to && assigned_to !== 'all') {
            if (assigned_to === 'unassigned') {
              query = query.is('assigned_to', null);
            } else {
              query = query.eq('assigned_to', assigned_to);
            }
          }

          if (tags) {
            const tagIds = tags.split(',').map(t => t.trim()).filter(Boolean);
            if (tagIds.length > 0) {
              query = query.contains('tag_ids', tagIds);
            }
          }

          query = buildTestDataFilter(query);
          query = query.order('updated_at', { ascending: false })
                       .range(offset, offset + pageSizeNum - 1);

          const { data, error, count } = await query;
          if (error) throw error;
          return { data: data || [], count: count || 0 };
        } catch (error) {
          logger.error('[bundles/opportunities] Error fetching opportunities:', error);
          return { data: [], count: 0 };
        }
      })();

      // Fetch stats
      const statsPromise = (async () => {
        try {
          let query = supabase
            .from('opportunities')
            .select('stage', { count: 'exact', head: false })
            .eq('tenant_id', tenant_id);

          if (assigned_to && assigned_to !== 'all') {
            if (assigned_to === 'unassigned') {
              query = query.is('assigned_to', null);
            } else {
              query = query.eq('assigned_to', assigned_to);
            }
          }

          query = buildTestDataFilter(query);

          const { data, error } = await query;
          if (error) throw error;

          const stats = {
            total: data?.length || 0,
            prospecting: data?.filter(o => o.stage === 'prospecting').length || 0,
            qualification: data?.filter(o => o.stage === 'qualification').length || 0,
            proposal: data?.filter(o => o.stage === 'proposal').length || 0,
            negotiation: data?.filter(o => o.stage === 'negotiation').length || 0,
            closed_won: data?.filter(o => o.stage === 'closed_won').length || 0,
            closed_lost: data?.filter(o => o.stage === 'closed_lost').length || 0,
          };
          return stats;
        } catch (error) {
          logger.error('[bundles/opportunities] Error fetching stats:', error);
          return { total: 0, prospecting: 0, qualification: 0, proposal: 0, negotiation: 0, closed_won: 0, closed_lost: 0 };
        }
      })();

      // Fetch supporting data (more entities for opportunities)
      const [opportunitiesResult, stats, users, employees, accounts, contacts, leads] = await Promise.all([
        opportunitiesPromise,
        statsPromise,
        (async () => {
          try {
            const { data, error } = await supabase
              .from('users')
              .select('id, email, first_name, last_name, role')
              .eq('tenant_id', tenant_id)
              .order('email', { ascending: true })
              .limit(1000);
            if (error) throw error;
            return data || [];
          } catch (error) {
            logger.error('[bundles/opportunities] Error fetching users:', error);
            return [];
          }
        })(),
        (async () => {
          try {
            const { data, error } = await supabase
              .from('employees')
              .select('id, user_email, first_name, last_name, employee_role')
              .eq('tenant_id', tenant_id)
              .order('user_email', { ascending: true })
              .limit(1000);
            if (error) throw error;
            return data || [];
          } catch (error) {
            logger.error('[bundles/opportunities] Error fetching employees:', error);
            return [];
          }
        })(),
        (async () => {
          try {
            const { data, error } = await supabase
              .from('accounts')
              .select('id, name, website, industry')
              .eq('tenant_id', tenant_id)
              .order('name', { ascending: true })
              .limit(1000);
            if (error) throw error;
            return data || [];
          } catch (error) {
            logger.error('[bundles/opportunities] Error fetching accounts:', error);
            return [];
          }
        })(),
        (async () => {
          try {
            const { data, error } = await supabase
              .from('contacts')
              .select('id, first_name, last_name, email, phone')
              .eq('tenant_id', tenant_id)
              .order('last_name', { ascending: true })
              .limit(1000);
            if (error) throw error;
            return data || [];
          } catch (error) {
            logger.error('[bundles/opportunities] Error fetching contacts:', error);
            return [];
          }
        })(),
        (async () => {
          try {
            const { data, error } = await supabase
              .from('leads')
              .select('id, first_name, last_name, email, company')
              .eq('tenant_id', tenant_id)
              .order('last_name', { ascending: true })
              .limit(1000);
            if (error) throw error;
            return data || [];
          } catch (error) {
            logger.error('[bundles/opportunities] Error fetching leads:', error);
            return [];
          }
        })()
      ]);

      const elapsed = Date.now() - startTime;

      const bundle = {
        opportunities: opportunitiesResult.data,
        stats,
        users,
        employees,
        accounts,
        contacts,
        leads,
        pagination: {
          page: pageNum,
          page_size: pageSizeNum,
          total_items: opportunitiesResult.count,
          total_pages: Math.ceil(opportunitiesResult.count / pageSizeNum)
        },
        meta: {
          tenant_id,
          generated_at: new Date().toISOString(),
          ttl_seconds: BUNDLE_TTL_SECONDS,
          source: 'manual_aggregation',
          elapsed_ms: elapsed
        }
      };

      // Store in cache
      if (cacheManager && cacheManager.client) {
        try {
          await cacheManager.set(cacheKey, bundle, BUNDLE_TTL_SECONDS);
        } catch (err) {
          logger.warn(`[bundles/opportunities] Cache write error: ${err.message}`);
        }
      }

      logger.info(`[bundles/opportunities] Bundle generated in ${elapsed}ms for tenant ${tenant_id}`);
      res.json({ status: 'success', data: bundle, cached: false });

    } catch (error) {
      logger.error('[bundles/opportunities] Unexpected error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
