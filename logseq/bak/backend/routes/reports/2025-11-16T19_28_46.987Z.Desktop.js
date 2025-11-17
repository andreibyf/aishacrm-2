/**
 * Reports Routes
 * Dashboard stats, analytics, custom reports
 */

import express from 'express';

// Helper: attempt to count rows from a table safely (optionally by tenant)
async function safeCount(pgPool, table, tenantId) {
  if (!pgPool) return 0;

  // Whitelist of allowed table names
  const allowedTables = ['contacts', 'accounts', 'leads', 'opportunities', 'activities'];
  if (!allowedTables.includes(table)) {
    return 0; // Invalid table name, prevent SQL injection
  }

  try {
    // Try tenant-scoped count first if a tenantId is provided
    if (tenantId) {
      try {
        const result = await pgPool.query(
          `SELECT COUNT(*)::int AS count FROM ${table} WHERE tenant_id = $1`,
          [tenantId]
        );
        return result.rows?.[0]?.count ?? 0;
      } catch {
        // Fall through to global count if tenant_id column doesn't exist
      }
    }
    const result = await pgPool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    return result.rows?.[0]?.count ?? 0;
  } catch {
    return 0; // table might not exist yet; return 0 as a safe default
  }
}

// Helper: get recent activities safely (limit 10), optionally by tenant
async function safeRecentActivities(pgPool, tenantId, limit = 10) {
  if (!pgPool) return [];
  try {
    if (tenantId) {
      try {
        const result = await pgPool.query(
          `SELECT id, type, subject, created_at
           FROM activities
           WHERE tenant_id = $1
           ORDER BY created_at DESC NULLS LAST
           LIMIT ${Math.max(1, Math.min(100, limit))}`,
          [tenantId]
        );
        return result.rows || [];
      } catch {
        // Fall through to global query if tenant_id column doesn't exist
      }
    }
    const result = await pgPool.query(
      `SELECT id, type, subject, created_at
       FROM activities
       ORDER BY created_at DESC NULLS LAST
       LIMIT ${Math.max(1, Math.min(100, limit))}`
    );
    return result.rows || [];
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

  return router;
}
