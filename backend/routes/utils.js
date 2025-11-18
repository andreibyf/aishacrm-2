/**
 * Utility Routes
 * Miscellaneous utility functions
 */

import express from 'express';
import crypto from 'crypto';

export default function createUtilsRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/utils/health - Utility service health check
  router.get('/health', async (req, res) => {
    try {
      res.json({
        status: 'success',
        data: {
          service: 'utils',
          healthy: true,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/utils/hash - Hash a string
  router.post('/hash', async (req, res) => {
    try {
      const { text, algorithm = 'sha256' } = req.body;

      res.json({
        status: 'success',
        message: 'Hashing not yet implemented',
        data: { algorithm, text_length: text?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/utils/generate-uuid - Generate UUID
  router.post('/generate-uuid', async (req, res) => {
    try {
      const uuid = crypto.randomUUID();

      res.json({
        status: 'success',
        data: { uuid },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
