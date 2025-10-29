/**
 * Database Routes
 * Sync, archive, cleanup operations
 */

import express from 'express';

export default function createDatabaseRoutes(pgPool) {
  const router = express.Router();

  // POST /api/database/sync - Sync data from Base44 to PostgreSQL
  router.post('/sync', async (req, res) => {
    try {
      if (!pgPool) {
        return res.status(503).json({
          status: 'error',
          message: 'Database not configured - set DATABASE_URL in .env',
        });
      }

      const { tenant_id, entities } = req.body;

      res.json({
        status: 'success',
        message: 'Database sync initiated',
        data: {
          tenant_id,
          entities: entities || ['Contact', 'Account', 'Lead', 'Opportunity', 'Activity'],
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // GET /api/database/check-volume - Check data volume
  router.get('/check-volume', async (req, res) => {
    try {
      if (!pgPool) {
        return res.status(503).json({
          status: 'error',
          message: 'Database not configured',
        });
      }

      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required',
        });
      }

      const result = await pgPool.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
      `);

      res.json({
        status: 'success',
        data: result.rows,
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/database/archive-aged-data - Archive old data
  router.post('/archive-aged-data', async (req, res) => {
    try {
      const { tenant_id, days } = req.body;
      
      res.json({
        status: 'success',
        message: `Archive function for data older than ${days} days`,
        data: { tenant_id, days },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/database/cleanup-orphaned-data - Clean up orphaned records
  router.post('/cleanup-orphaned-data', async (req, res) => {
    try {
      const { tenant_id } = req.body;
      
      res.json({
        status: 'success',
        message: 'Orphaned data cleanup initiated',
        data: { tenant_id },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/database/nuclear-cleanup - DELETE ALL DATA (use with extreme caution!)
  router.post('/nuclear-cleanup', async (req, res) => {
    try {
      if (!pgPool) {
        return res.status(503).json({
          status: 'error',
          message: 'Database not configured',
        });
      }

      const { confirm } = req.body;

      if (confirm !== 'DELETE_ALL_DATA') {
        return res.status(400).json({
          status: 'error',
          message: 'Confirmation required. Send {"confirm": "DELETE_ALL_DATA"}',
        });
      }

      // Delete from all entity tables (in correct order to respect foreign keys)
      const results = {};

      // Activities first (has foreign keys to other tables)
      const activitiesResult = await pgPool.query('DELETE FROM activities RETURNING id');
      results.activities = activitiesResult.rowCount;

      // Opportunities
      const oppsResult = await pgPool.query('DELETE FROM opportunities RETURNING id');
      results.opportunities = oppsResult.rowCount;

      // Accounts
      const accountsResult = await pgPool.query('DELETE FROM accounts RETURNING id');
      results.accounts = accountsResult.rowCount;

      // Leads
      const leadsResult = await pgPool.query('DELETE FROM leads RETURNING id');
      results.leads = leadsResult.rowCount;

      // Contacts
      const contactsResult = await pgPool.query('DELETE FROM contacts RETURNING id');
      results.contacts = contactsResult.rowCount;

      const totalDeleted = Object.values(results).reduce((sum, count) => sum + count, 0);

      res.json({
        status: 'success',
        message: `Nuclear cleanup complete. Deleted ${totalDeleted} total records.`,
        data: {
          deletedCounts: results,
          totalDeleted,
          timestamp: new Date().toISOString(),
        },
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
