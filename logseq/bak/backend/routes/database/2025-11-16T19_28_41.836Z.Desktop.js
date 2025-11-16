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

  return router;
}
