/**
 * Utility Routes
 * Miscellaneous utility functions
 */

import express from 'express';

export default function createUtilsRoutes(pgPool) {
  const router = express.Router();

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
