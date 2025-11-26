/**
 * Reports & Analytics Routes
 */

import express from 'express';

// Helper: attempt to count rows from a table safely (optionally by tenant)
// options:
// - includeTestData: boolean (default true)
// - countMode: 'planned' | 'exact' (default 'planned')
// - confirmSmallCounts: boolean (default true) -> if planned count <= 5, double-check with exact
async function safeCount(_pgPool, table, tenantId, filterBuilder, options = {}) {
  const { getSupabaseClient } = await import('../lib/supabase-db.js');
  const supabase = getSupabaseClient();
  const includeTestData = options.includeTestData !== false;
  const countMode = options.countMode || 'planned';
  const confirmSmall = options.confirmSmallCounts !== false; // default true

  // Whitelist of allowed table names
  const allowedTables = ['contacts', 'accounts', 'leads', 'opportunities', 'activities'];
  if (!allowedTables.includes(table)) {
    return 0; // Invalid table name, prevent SQL injection
  }

  try {
    // Build base query
    let query = supabase.from(table).select('*', { count: countMode, head: true });
    if (tenantId) {
      try {
        query = query.eq('tenant_id', tenantId);
      } catch (e) {
        /* ignore: table may not have tenant_id */ void 0;
      }
    }
    if (!includeTestData) {
      try {
        query = query.eq('is_test_data', false);
      } catch (e) {
        /* ignore: table may not have is_test_data */ void 0;
      }
    }
    // Apply additional filters (e.g., status not in ...)
    if (typeof filterBuilder === 'function') {
      try {
        query = filterBuilder(query) || query;
      } catch {
        // ignore filter builder errors; keep base query
      }
    }
    const { count } = await query;
    const plannedCount = count ?? 0;

    // If using planned estimates, and the estimate is tiny, confirm with exact to avoid false positives on empty sets
    if (countMode === 'planned' && confirmSmall && plannedCount <= 5) {
      try {
        let exact = supabase.from(table).select('*', { count: 'exact', head: true });
        if (tenantId) {
          try { exact = exact.eq('tenant_id', tenantId); } catch (e) { /* ignore */ void 0; }
        }
        if (!includeTestData) {
          try { exact = exact.eq('is_test_data', false); } catch (e) { /* ignore */ void 0; }
        }
        if (typeof filterBuilder === 'function') {
          try { exact = filterBuilder(exact) || exact; } catch (e) { /* ignore */ void 0; }
        }
        const { count: exactCount } = await exact;
        return exactCount ?? plannedCount;
      } catch (e) {
        // fall back to planned on error
        return plannedCount;
      }
    }
    return plannedCount;
  } catch {
    return 0; // table might not exist yet; return 0 as a safe default
  }
}

// Helper: get recent activities safely (limit 10), optionally by tenant
async function safeRecentActivities(_pgPool, tenantId, limit = 10) {
  const { getSupabaseClient } = await import('../lib/supabase-db.js');
  const supabase = getSupabaseClient();
  const max = Math.max(1, Math.min(100, limit));
  try {
    if (tenantId) {
      try {
        const { data, error } = await supabase
          .from('activities')
          .select('id, type, subject, created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(max);
        if (error) throw error;
        return data || [];
      } catch {
        // Fall through to global query if tenant_id column doesn't exist
      }
    }
    const { data } = await supabase
      .from('activities')
      .select('id, type, subject, created_at')
      .order('created_at', { ascending: false })
      .limit(max);
    return data || [];
  } catch {
    return [];
  }
}

export default function createReportRoutes(_pgPool) {
  const router = express.Router();
  // In-memory per-tenant cache for dashboard bundle
  // Shape: Map<key, { data, expiresAt }>
  const bundleCache = new Map();
  const BUNDLE_TTL_MS = 60 * 1000; // 60 seconds

  /**
   * @openapi
   * /api/reports/dashboard-stats:
   *   get:
   *     summary: Dashboard statistics overview
   *     description: Returns high-level counts and recent activities for the tenant.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: true
   *         description: Tenant UUID used to scope the statistics
   *     responses:
   *       200:
   *         description: Dashboard statistics payload
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing tenant_id
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/reports/dashboard-stats - Get dashboard statistics
  router.get('/dashboard-stats', async (req, res) => {
    try {
      let { tenant_id } = req.query;

      console.log('[dashboard-stats] Received tenant_id:', tenant_id);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const [contacts, accounts, leads, opportunities, activities] = await Promise.all([
        safeCount(null, 'contacts', tenant_id),
        safeCount(null, 'accounts', tenant_id),
        safeCount(null, 'leads', tenant_id),
        safeCount(null, 'opportunities', tenant_id),
        safeCount(null, 'activities', tenant_id),
      ]);
      const recentActivities = await safeRecentActivities(null, tenant_id, 10);

      const stats = {
        totalContacts: contacts,
        totalAccounts: accounts,
        totalLeads: leads,
        totalOpportunities: opportunities,
        totalActivities: activities,
        recentActivities,
        revenue: { total: 0, thisMonth: 0, lastMonth: 0 },
      };

      res.json({ status: 'success', data: stats });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/reports/dashboard-bundle:
   *   get:
   *     summary: Complete dashboard bundle
   *     description: Returns a compact bundle used by the dashboard widgets.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID used to scope data
   *     responses:
   *       200:
   *         description: Dashboard bundle payload
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // GET /api/reports/dashboard-bundle - Get complete dashboard bundle
  router.get('/dashboard-bundle', async (req, res) => {
    try {
      const { tenant_id } = req.query;
      const includeTestData = (req.query.include_test_data ?? 'true') !== 'false';
      const cacheKey = tenant_id || 'GLOBAL';
      const now = Date.now();
      const cached = bundleCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return res.json({ status: 'success', data: cached.data, cached: true });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Counts (use planned head counts for speed)
      const commonOpts = { includeTestData };
      const totalContactsP = safeCount(null, 'contacts', tenant_id, undefined, commonOpts);
      const totalAccountsP = safeCount(null, 'accounts', tenant_id, undefined, commonOpts);
      const totalLeadsP = safeCount(null, 'leads', tenant_id, undefined, commonOpts);
      const totalOpportunitiesP = safeCount(null, 'opportunities', tenant_id, undefined, commonOpts);
      const openLeadsP = safeCount(null, 'leads', tenant_id, (q) => q.not('status', 'in', '("converted","lost")'), commonOpts);
      const wonOpportunitiesP = safeCount(null, 'opportunities', tenant_id, (q) => q.in('stage', ['won', 'closed_won']), commonOpts);
      const openOpportunitiesP = safeCount(null, 'opportunities', tenant_id, (q) => q.not('stage', 'in', '("won","closed_won","lost","closed_lost")'), commonOpts);

      // New leads last 30 days
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceISO = since.toISOString();
      const newLeadsP = (async () => {
        try {
          let q = supabase.from('leads').select('*', { count: 'planned', head: true });
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          q = q.gte('created_date', sinceISO);
          if (!includeTestData) {
            try { q = q.eq('is_test_data', false); } catch (e) { /* ignore */ void 0; }
          }
          const { count } = await q;
          const planned = count ?? 0;
          if (planned <= 5) {
            try {
              let exact = supabase.from('leads').select('*', { count: 'exact', head: true });
              if (tenant_id) exact = exact.eq('tenant_id', tenant_id);
              exact = exact.gte('created_date', sinceISO);
              if (!includeTestData) { try { exact = exact.eq('is_test_data', false); } catch (e) { /* ignore */ void 0; } }
              const { count: exactCount } = await exact;
              return exactCount ?? planned;
            } catch (e) { return planned; }
          }
          return planned;
        } catch { return 0; }
      })();

      // Activities last 30 days
      const recentActivitiesCountP = (async () => {
        try {
          let q = supabase.from('activities').select('*', { count: 'planned', head: true });
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          q = q.gte('created_date', sinceISO);
          if (!includeTestData) {
            try { q = q.eq('is_test_data', false); } catch (e) { /* ignore */ void 0; }
          }
          const { count } = await q;
          const planned = count ?? 0;
          if (planned <= 5) {
            try {
              let exact = supabase.from('activities').select('*', { count: 'exact', head: true });
              if (tenant_id) exact = exact.eq('tenant_id', tenant_id);
              exact = exact.gte('created_date', sinceISO);
              if (!includeTestData) { try { exact = exact.eq('is_test_data', false); } catch (e) { /* ignore */ void 0; } }
              const { count: exactCount } = await exact;
              return exactCount ?? planned;
            } catch (e) { return planned; }
          }
          return planned;
        } catch { return 0; }
      })();

      // Recent small lists (narrow columns, limited)
      const recentActivitiesP = (async () => {
        try {
          let q = supabase.from('activities').select('id,type,subject,created_at').order('created_at', { ascending: false }).limit(10);
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          if (!includeTestData) {
            try { q = q.eq('is_test_data', false); } catch (e) { /* ignore */ void 0; }
          }
          const { data } = await q;
          return Array.isArray(data) ? data : [];
        } catch { return []; }
      })();
      const recentLeadsP = (async () => {
        try {
          let q = supabase.from('leads').select('id,first_name,last_name,company,created_date,status').order('created_date', { ascending: false }).limit(5);
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          if (!includeTestData) {
            try { q = q.eq('is_test_data', false); } catch (e) { /* ignore */ void 0; }
          }
          const { data } = await q;
          return Array.isArray(data) ? data : [];
        } catch { return []; }
      })();
      const recentOppsP = (async () => {
        try {
          let q = supabase.from('opportunities').select('id,name,amount,stage,updated_at').order('updated_at', { ascending: false }).limit(5);
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          if (!includeTestData) {
            try { q = q.eq('is_test_data', false); } catch (e) { /* ignore */ void 0; }
          }
          const { data } = await q;
          return Array.isArray(data) ? data : [];
        } catch { return []; }
      })();

      const [
        totalContacts,
        totalAccounts,
        totalLeads,
        totalOpportunities,
        openLeads,
        wonOpportunities,
        openOpportunities,
        newLeads,
        activitiesLast30,
        recentActivities,
        recentLeads,
        recentOpportunities,
      ] = await Promise.all([
        totalContactsP,
        totalAccountsP,
        totalLeadsP,
        totalOpportunitiesP,
        openLeadsP,
        wonOpportunitiesP,
        openOpportunitiesP,
        newLeadsP,
        recentActivitiesCountP,
        recentActivitiesP,
        recentLeadsP,
        recentOppsP,
      ]);

      const bundle = {
        stats: {
          totalContacts,
          totalAccounts,
          totalLeads,
          totalOpportunities,
          openLeads,
          wonOpportunities,
          openOpportunities,
          newLeadsLast30Days: newLeads,
          activitiesLast30Days: activitiesLast30,
        },
        lists: {
          recentActivities,
          recentLeads,
          recentOpportunities,
        },
        meta: {
          tenant_id: tenant_id || null,
          generated_at: new Date().toISOString(),
          ttl_seconds: Math.round(BUNDLE_TTL_MS / 1000),
        },
      };

      bundleCache.set(cacheKey, { data: bundle, expiresAt: now + BUNDLE_TTL_MS });
      res.json({ status: 'success', data: bundle, cached: false });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/reports/generate-custom:
   *   post:
   *     summary: Generate a custom report
   *     description: Initiates generation of a custom report based on provided filters.
   *     tags: [reports]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *                 description: Tenant UUID scope
   *               report_type:
   *                 type: string
   *                 description: The report type to generate (e.g., overview, data-quality)
   *               filters:
   *                 type: object
   *                 additionalProperties: true
   *     responses:
   *       200:
   *         description: Report generation initiated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/reports/generate-custom - Generate custom report
  router.post('/generate-custom', async (req, res) => {
    try {
      const { tenant_id, report_type, filters } = req.body;

      res.json({
        status: 'success',
        message: 'Custom report generation initiated',
        data: { tenant_id, report_type, filters },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });
  // Analytics: Opportunity pipeline by stage
  // GET /api/reports/pipeline - Opportunity counts by stage
  /**
   * @openapi
   * /api/reports/pipeline:
   *   get:
   *     summary: Opportunity counts by stage
   *     description: Aggregated pipeline breakdown by stage for the tenant.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *     responses:
   *       200:
   *         description: Pipeline stages summary
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/pipeline', async (req, res) => {
    try {
      let { tenant_id } = req.query;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let query = supabase.from('v_opportunity_pipeline_by_stage').select('stage, count').order('stage');
      if (tenant_id) query = query.eq('tenant_id', tenant_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      res.json({ status: 'success', data: { stages: data || [] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/reports/lead-status - Lead counts by status
  /**
   * @openapi
   * /api/reports/lead-status:
   *   get:
   *     summary: Lead counts by status
   *     description: Aggregated counts of leads grouped by status.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *     responses:
   *       200:
   *         description: Lead status summary
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/lead-status', async (req, res) => {
    try {
      let { tenant_id } = req.query;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let query = supabase.from('v_lead_counts_by_status').select('status, count').order('status');
      if (tenant_id) query = query.eq('tenant_id', tenant_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      res.json({ status: 'success', data: { statuses: data || [] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/reports/calendar - Calendar feed from activities
  /**
   * @openapi
   * /api/reports/calendar:
   *   get:
   *     summary: Calendar feed from activities
   *     description: Returns activity items suitable for a calendar view.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *       - in: query
   *         name: from_date
   *         schema:
   *           type: string
   *           format: date
   *         required: false
   *         description: Inclusive start date filter (YYYY-MM-DD)
   *       - in: query
   *         name: to_date
   *         schema:
   *           type: string
   *           format: date
   *         required: false
   *         description: Inclusive end date filter (YYYY-MM-DD)
   *     responses:
   *       200:
   *         description: Calendar activity feed
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/calendar', async (req, res) => {
    try {
      let { tenant_id, from_date, to_date } = req.query;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let query = supabase.from('v_calendar_activities').select('*');
      if (tenant_id) query = query.eq('tenant_id', tenant_id);
      if (from_date) query = query.or(`due_at.is.null,due_at.gte.${from_date}`);
      if (to_date) query = query.or(`due_at.is.null,due_at.lte.${to_date}`);
      query = query.order('due_at', { ascending: true, nullsFirst: false });
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      res.json({ status: 'success', data: { activities: data || [] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/reports/data-quality - Analyze data quality across entities
  /**
   * @openapi
   * /api/reports/data-quality:
   *   get:
   *     summary: Data quality analysis
   *     description: Calculates missing or incomplete fields across core entities.
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *     responses:
   *       200:
   *         description: Data quality report
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/data-quality', async (req, res) => {
    try {
      let { tenant_id } = req.query;
            // Build WHERE clause for tenant filtering
      const tenantWhere = tenant_id ? `WHERE tenant_id = $1` : '';
      const params = tenant_id ? [tenant_id] : [];

      // Analyze Contacts
      const contactsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE email IS NULL OR email = '') as missing_email,
          COUNT(*) FILTER (WHERE phone IS NULL OR phone = '') as missing_phone,
          COUNT(*) FILTER (WHERE first_name IS NULL OR first_name = '') as missing_first_name,
          COUNT(*) FILTER (WHERE last_name IS NULL OR last_name = '') as missing_last_name
        FROM contact ${tenantWhere}
      `;
      const contactsResult = await pgPool.query(contactsQuery, params);
      const contacts = contactsResult.rows[0];
      const contactsTotal = parseInt(contacts.total);
      const contactsIssues = parseInt(contacts.missing_email) + parseInt(contacts.missing_phone) + 
                             parseInt(contacts.missing_first_name) + parseInt(contacts.missing_last_name);
      const contactsIssuesPercent = contactsTotal > 0 ? (contactsIssues / (contactsTotal * 4)) * 100 : 0;

      // Analyze Accounts
      const accountsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE name IS NULL OR name = '') as missing_name,
          COUNT(*) FILTER (WHERE industry IS NULL OR industry = '') as missing_industry,
          COUNT(*) FILTER (WHERE website IS NULL OR website = '') as missing_website
        FROM account ${tenantWhere}
      `;
      const accountsResult = await pgPool.query(accountsQuery, params);
      const accounts = accountsResult.rows[0];
      const accountsTotal = parseInt(accounts.total);
      const accountsIssues = parseInt(accounts.missing_name) + parseInt(accounts.missing_industry) + 
                             parseInt(accounts.missing_website);
      const accountsIssuesPercent = accountsTotal > 0 ? (accountsIssues / (accountsTotal * 3)) * 100 : 0;

      // Analyze Leads
      const leadsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE email IS NULL OR email = '') as missing_email,
          COUNT(*) FILTER (WHERE phone IS NULL OR phone = '') as missing_phone,
          COUNT(*) FILTER (WHERE status IS NULL OR status = '') as missing_status,
          COUNT(*) FILTER (WHERE source IS NULL OR source = '') as missing_source
        FROM lead ${tenantWhere}
      `;
      const leadsResult = await pgPool.query(leadsQuery, params);
      const leads = leadsResult.rows[0];
      const leadsTotal = parseInt(leads.total);
      const leadsIssues = parseInt(leads.missing_email) + parseInt(leads.missing_phone) + 
                          parseInt(leads.missing_status) + parseInt(leads.missing_source);
      const leadsIssuesPercent = leadsTotal > 0 ? (leadsIssues / (leadsTotal * 4)) * 100 : 0;

      // Analyze Opportunities
      const oppsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE account_id IS NULL) as missing_account,
          COUNT(*) FILTER (WHERE stage IS NULL OR stage = '') as missing_stage,
          COUNT(*) FILTER (WHERE close_date IS NULL) as missing_close_date,
          COUNT(*) FILTER (WHERE amount IS NULL) as missing_amount
        FROM opportunity ${tenantWhere}
      `;
      const oppsResult = await pgPool.query(oppsQuery, params);
      const opps = oppsResult.rows[0];
      const oppsTotal = parseInt(opps.total);
      const oppsIssues = parseInt(opps.missing_account) + parseInt(opps.missing_stage) + 
                         parseInt(opps.missing_close_date) + parseInt(opps.missing_amount);
      const oppsIssuesPercent = oppsTotal > 0 ? (oppsIssues / (oppsTotal * 4)) * 100 : 0;

      // Build response
      const report = {
        contacts: {
          total: contactsTotal,
          issues_count: contactsIssues,
          issues_percentage: Math.round(contactsIssuesPercent * 100) / 100,
          missing_fields: {
            email: parseInt(contacts.missing_email),
            phone: parseInt(contacts.missing_phone),
            first_name: parseInt(contacts.missing_first_name),
            last_name: parseInt(contacts.missing_last_name)
          }
        },
        accounts: {
          total: accountsTotal,
          issues_count: accountsIssues,
          issues_percentage: Math.round(accountsIssuesPercent * 100) / 100,
          missing_fields: {
            name: parseInt(accounts.missing_name),
            industry: parseInt(accounts.missing_industry),
            website: parseInt(accounts.missing_website)
          }
        },
        leads: {
          total: leadsTotal,
          issues_count: leadsIssues,
          issues_percentage: Math.round(leadsIssuesPercent * 100) / 100,
          missing_fields: {
            email: parseInt(leads.missing_email),
            phone: parseInt(leads.missing_phone),
            status: parseInt(leads.missing_status),
            source: parseInt(leads.missing_source)
          }
        },
        opportunities: {
          total: oppsTotal,
          issues_count: oppsIssues,
          issues_percentage: Math.round(oppsIssuesPercent * 100) / 100,
          missing_fields: {
            account_id: parseInt(opps.missing_account),
            stage: parseInt(opps.missing_stage),
            close_date: parseInt(opps.missing_close_date),
            amount: parseInt(opps.missing_amount)
          }
        }
      };

      res.json({ 
        status: 'success', 
        data: { 
          report,
          generated_at: new Date().toISOString()
        } 
      });
    } catch (error) {
      console.error('Error analyzing data quality:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/reports/export-pdf - Generate PDF report
  /**
   * @openapi
   * /api/reports/export-pdf:
   *   get:
   *     summary: Export report as PDF
   *     description: Generates a PDF for supported report types (e.g., overview, data-quality).
   *     tags: [reports]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *       - in: query
   *         name: report_type
   *         schema:
   *           type: string
   *           enum: [overview, dashboard-stats, data-quality]
   *         required: false
   *         description: The type of report to generate
   *     responses:
   *       200:
   *         description: PDF document
   *         content:
   *           application/pdf:
   *             schema:
   *               type: string
   *               format: binary
   *       500:
   *         description: Failed to generate PDF
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/export-pdf', async (req, res) => {
    let browser;
    try {
      const { tenant_id, report_type = 'overview' } = req.query;

      // Import puppeteer
      const puppeteer = await import('puppeteer');

      // Launch browser with appropriate options
      browser = await puppeteer.default.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();

      // Set viewport for consistent rendering
      await page.setViewport({ width: 1200, height: 800 });

      // Generate HTML content based on report type
      let htmlContent = '';
      
      if (report_type === 'overview' || report_type === 'dashboard-stats') {
        // Fetch dashboard stats data
        const statsUrl = new URL(`${req.protocol}://${req.get('host')}/api/reports/dashboard-stats`);
        if (tenant_id) statsUrl.searchParams.append('tenant_id', tenant_id);
        
        const statsResponse = await fetch(statsUrl.toString());
        const statsData = await statsResponse.json();
        const stats = statsData.data || {};

        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Overview Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
              h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
              h2 { color: #1e40af; margin-top: 30px; }
              .header { text-align: center; margin-bottom: 40px; }
              .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
              .stat-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; background: #f9fafb; }
              .stat-value { font-size: 36px; font-weight: bold; color: #1e40af; margin: 10px 0; }
              .stat-label { font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
              .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
              td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>📊 Dashboard Overview Report</h1>
              <p>Generated on ${new Date().toLocaleString()}</p>
            </div>
            
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">Total Contacts</div>
                <div class="stat-value">${stats.total_contacts || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Accounts</div>
                <div class="stat-value">${stats.total_accounts || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Leads</div>
                <div class="stat-value">${stats.total_leads || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Opportunities</div>
                <div class="stat-value">${stats.total_opportunities || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Open Opportunities</div>
                <div class="stat-value">${stats.open_opportunities || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Pipeline Value</div>
                <div class="stat-value">$${(stats.total_pipeline_value || 0).toLocaleString()}</div>
              </div>
            </div>

            <h2>Recent Activities</h2>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${(stats.recent_activities || []).slice(0, 10).map(activity => `
                  <tr>
                    <td>${activity.type || 'N/A'}</td>
                    <td>${activity.subject || 'No subject'}</td>
                    <td>${new Date(activity.created_at).toLocaleDateString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="footer">
              <p>Aisha CRM - Generated automatically</p>
            </div>
          </body>
          </html>
        `;
      } else if (report_type === 'data-quality') {
        // Fetch data quality report
        const qualityUrl = new URL(`${req.protocol}://${req.get('host')}/api/reports/data-quality`);
        if (tenant_id) qualityUrl.searchParams.append('tenant_id', tenant_id);
        
        const qualityResponse = await fetch(qualityUrl.toString());
        const qualityData = await qualityResponse.json();
        const report = qualityData.data?.report || {};

        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Data Quality Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
              h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
              h2 { color: #1e40af; margin-top: 30px; }
              .header { text-align: center; margin-bottom: 40px; }
              .entity-section { margin: 30px 0; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; }
              .quality-score { font-size: 48px; font-weight: bold; margin: 20px 0; }
              .quality-score.good { color: #10b981; }
              .quality-score.warning { color: #f59e0b; }
              .quality-score.poor { color: #ef4444; }
              .missing-fields { margin: 15px 0; }
              .missing-field-item { padding: 8px; margin: 5px 0; background: #fef3c7; border-left: 3px solid #f59e0b; }
              .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>🔍 Data Quality Report</h1>
              <p>Generated on ${new Date().toLocaleString()}</p>
            </div>
            
            ${Object.entries(report).map(([entity, data]) => {
              const qualityPercent = 100 - (data.issues_percentage || 0);
              const qualityClass = qualityPercent >= 80 ? 'good' : qualityPercent >= 60 ? 'warning' : 'poor';
              
              return `
                <div class="entity-section">
                  <h2>${entity.charAt(0).toUpperCase() + entity.slice(1)}</h2>
                  <p><strong>Total Records:</strong> ${data.total || 0}</p>
                  <div class="quality-score ${qualityClass}">
                    ${qualityPercent.toFixed(1)}%
                  </div>
                  <p><strong>Quality Score</strong></p>
                  <p>Records with Issues: ${data.issues_count || 0} (${(data.issues_percentage || 0).toFixed(1)}%)</p>
                  
                  ${data.missing_fields && Object.keys(data.missing_fields).length > 0 ? `
                    <div class="missing-fields">
                      <h3>Missing Fields:</h3>
                      ${Object.entries(data.missing_fields).map(([field, count]) => `
                        <div class="missing-field-item">
                          <strong>${field}:</strong> ${count} records missing
                        </div>
                      `).join('')}
                    </div>
                  ` : '<p>No missing fields detected</p>'}
                </div>
              `;
            }).join('')}

            <div class="footer">
              <p>Aisha CRM - Data Quality Analysis</p>
            </div>
          </body>
          </html>
        `;
      } else {
        throw new Error(`Unsupported report type: ${report_type}`);
      }

      // Set HTML content
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report_type}_report_${Date.now()}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      // Send PDF
      res.send(pdfBuffer);

    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ 
        status: 'error', 
        message: error.message,
        details: 'Failed to generate PDF report'
      });
    } finally {
      // Always close the browser
      if (browser) {
        await browser.close();
      }
    }
  });

  return router;
}
