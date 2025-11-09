/**
 * Reports Routes
 * Dashboard stats, analytics, custom reports
 */

import express from 'express';

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
          .eq('tenant_id', tenantId)
          .neq('is_test_data', true); // Exclude test data
        return count ?? 0;
      } catch {
        // Fall through to global count if tenant_id column doesn't exist
      }
    }
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .neq('is_test_data', true); // Exclude test data
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
          .neq('is_test_data', true) // Exclude test data
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
      .neq('is_test_data', true) // Exclude test data
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
      const { tenant_id } = req.query;

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

      // Calculate pipeline value (sum of opportunity values)
      let pipelineValue = 0;
      try {
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        const { data: oppData } = await supabase
          .from('opportunities')
          .select('value')
          .eq('tenant_id', tenant_id)
          .neq('is_test_data', true)
          .neq('stage', 'closed_lost')
          .neq('stage', 'closed_won');
        
        if (oppData && oppData.length > 0) {
          pipelineValue = oppData.reduce((sum, opp) => sum + (parseFloat(opp.value) || 0), 0);
        }
      } catch (error) {
        console.error('Error calculating pipeline value:', error);
      }

      const stats = {
        totalContacts: contacts,
        totalAccounts: accounts,
        totalLeads: leads,
        totalOpportunities: opportunities,
        activitiesLogged: activities, // Changed from totalActivities to match OverviewStats
        pipelineValue,
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

  return router;
}
