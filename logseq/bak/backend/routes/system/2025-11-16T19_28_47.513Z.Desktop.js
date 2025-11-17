/**
 * System Routes
 * Health checks, diagnostics, logs, monitoring
 */

import express from 'express';

export default function createSystemRoutes(pgPool) {
  const router = express.Router();

  // GET /api/system/status - System status check
  router.get('/status', async (req, res) => {
    try {
      let dbStatus = 'disconnected';
      
      if (pgPool) {
        try {
          await pgPool.query('SELECT 1');
          dbStatus = 'connected';
        } catch (err) {
          dbStatus = 'error: ' + err.message;
        }
      }

      res.json({
        status: 'success',
        data: {
          server: 'running',
          database: dbStatus,
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // GET /api/system/diagnostics - Run full diagnostics
  router.get('/diagnostics', async (req, res) => {
    try {
      const diagnostics = {
        timestamp: new Date().toISOString(),
        database: {
          configured: !!pgPool,
          connected: false,
        },
        functions: {
          total: 197,
          categories: 26,
        },
        entities: {
          total: 47,
        },
      };

      if (pgPool) {
        try {
          const result = await pgPool.query('SELECT version()');
          diagnostics.database.connected = true;
          diagnostics.database.version = result.rows[0].version;
        } catch (err) {
          diagnostics.database.error = err.message;
        }
      }

      res.json({
        status: 'success',
        data: diagnostics,
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // GET /api/system/logs - Get system logs
  router.get('/logs', async (req, res) => {
    try {
      const { tenant_id, limit = 100, level, source } = req.query;

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      // Build query with filters
      let query = 'SELECT * FROM system_logs WHERE tenant_id = $1';
      const params = [tenant_id];
      let paramCount = 1;

      if (level && level !== 'all') {
        paramCount++;
        query += ` AND level = $${paramCount}`;
        params.push(level);
      }

      if (source && source !== 'all') {
        paramCount++;
        query += ` AND source = $${paramCount}`;
        params.push(source);
      }

      query += ' ORDER BY created_at DESC LIMIT $' + (paramCount + 1);
      params.push(parseInt(limit));

      const result = await pgPool.query(query, params);

      res.json({
        status: 'success',
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching system logs:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  return router;
}
