/**
 * Reports Routes
 * Dashboard stats, analytics, custom reports
 */

import express from 'express';
import { resolveTenantSlug, isUUID } from '../lib/tenantResolver.js';

// Helper: attempt to count rows from a table safely (optionally by tenant)
async function safeCount(_pgPool, table, tenantId) {
  const { getSupabaseClient } = await import('../lib/supabase-db.js');
  const supabase = getSupabaseClient();

  // Whitelist of allowed table names
  const allowedTables = ['contacts', 'accounts', 'leads', 'opportunities', 'activities'];
  if (!allowedTables.includes(table)) {
    return 0; // Invalid table name, prevent SQL injection
  }

  try {
    // Try tenant-scoped count first if a tenantId is provided
    if (tenantId) {
      try {
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId);
        return count ?? 0;
      } catch {
        // Fall through to global count if tenant_id column doesn't exist
      }
    }
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    return count ?? 0;
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

export default function createReportRoutes(pgPool) {
  const router = express.Router();

  // GET /api/reports/dashboard-stats - Get dashboard statistics
  router.get('/dashboard-stats', async (req, res) => {
    try {
      let { tenant_id } = req.query;

      // Normalize UUID tenant_id to slug for database queries
      if (tenant_id && isUUID(tenant_id)) {
        tenant_id = await resolveTenantSlug(tenant_id, pgPool);
      }

      // Optional: allow stats without tenant filter in local mode
      if (!tenant_id && !pgPool) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Try to fetch counts from Postgres if available; otherwise return zeros
      const [contacts, accounts, leads, opportunities, activities] = await Promise.all([
        safeCount(pgPool, 'contacts', tenant_id),
        safeCount(pgPool, 'accounts', tenant_id),
        safeCount(pgPool, 'leads', tenant_id),
        safeCount(pgPool, 'opportunities', tenant_id),
        safeCount(pgPool, 'activities', tenant_id),
      ]);
      const recentActivities = await safeRecentActivities(pgPool, tenant_id, 10);

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

  // GET /api/reports/dashboard-bundle - Get complete dashboard bundle
  router.get('/dashboard-bundle', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      const bundle = {
        stats: {
          totalContacts: 0,
          totalAccounts: 0,
          totalLeads: 0,
        },
        recentActivities: [],
        recentLeads: [],
        opportunities: [],
      };

      res.json({ status: 'success', data: bundle, tenant_id });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

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
  router.get('/pipeline', async (req, res) => {
    try {
      let { tenant_id } = req.query;
      // Normalize UUID to slug
      if (tenant_id && isUUID(tenant_id)) {
        tenant_id = await resolveTenantSlug(tenant_id, pgPool);
      }
      const where = tenant_id ? 'WHERE tenant_id = $1' : '';
      const params = tenant_id ? [tenant_id] : [];
      const sql = `SELECT stage, count FROM v_opportunity_pipeline_by_stage ${where} ORDER BY stage`;
      const result = await pgPool.query(sql, params);
      res.json({ status: 'success', data: { stages: result.rows } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/reports/lead-status - Lead counts by status
  router.get('/lead-status', async (req, res) => {
    try {
      let { tenant_id } = req.query;
      // Normalize UUID to slug
      if (tenant_id && isUUID(tenant_id)) {
        tenant_id = await resolveTenantSlug(tenant_id, pgPool);
      }
      const where = tenant_id ? 'WHERE tenant_id = $1' : '';
      const params = tenant_id ? [tenant_id] : [];
      const sql = `SELECT status, count FROM v_lead_counts_by_status ${where} ORDER BY status`;
      const result = await pgPool.query(sql, params);
      res.json({ status: 'success', data: { statuses: result.rows } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/reports/calendar - Calendar feed from activities
  router.get('/calendar', async (req, res) => {
    try {
      let { tenant_id, from_date, to_date } = req.query;
      // Normalize UUID to slug
      if (tenant_id && isUUID(tenant_id)) {
        tenant_id = await resolveTenantSlug(tenant_id, pgPool);
      }
      const conds = [];
      const params = [];
      if (tenant_id) { params.push(tenant_id); conds.push(`tenant_id = $${params.length}`); }
      if (from_date) { params.push(from_date); conds.push(`(due_at IS NULL OR due_at >= $${params.length})`); }
      if (to_date) { params.push(to_date); conds.push(`(due_at IS NULL OR due_at <= $${params.length})`); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const sql = `SELECT * FROM v_calendar_activities ${where} ORDER BY COALESCE(due_at, created_at)`;
      const result = await pgPool.query(sql, params);
      res.json({ status: 'success', data: { activities: result.rows } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/reports/data-quality - Analyze data quality across entities
  router.get('/data-quality', async (req, res) => {
    try {
      let { tenant_id } = req.query;
      // Normalize UUID to slug
      if (tenant_id && isUUID(tenant_id)) {
        tenant_id = await resolveTenantSlug(tenant_id, pgPool);
      }
      
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
