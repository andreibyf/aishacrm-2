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
      const { limit = 100, level = 'all' } = req.query;

      res.json({
        status: 'success',
        data: {
          logs: [],
          limit: parseInt(limit),
          level,
          message: 'Log retrieval not yet implemented',
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
