/**
 * Metrics Routes
 * Performance and analytics metrics
 */

import express from 'express';

export default function createMetricsRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/metrics/performance - Get performance metrics
  router.get('/performance', async (req, res) => {
    try {
      res.json({
        status: 'success',
        data: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/metrics/usage - Get usage statistics
  router.get('/usage', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      res.json({
        status: 'success',
        data: { tenant_id, api_calls: 0, storage_used: 0 },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
