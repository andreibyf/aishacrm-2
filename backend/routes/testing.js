/**
 * Testing Routes
 * Test utilities and mocks
 */

import express from 'express';

export default function createTestingRoutes(pgPool) {
  const router = express.Router();

  // GET /api/testing/ping - Simple ping test
  router.get('/ping', async (req, res) => {
    try {
      res.json({
        status: 'success',
        data: { message: 'pong', timestamp: new Date().toISOString() },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/testing/mock-data - Generate mock data
  router.post('/mock-data', async (req, res) => {
    try {
      const { entity_type, count = 10 } = req.body;

      res.json({
        status: 'success',
        message: 'Mock data generation not yet implemented',
        data: { entity_type, count },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
