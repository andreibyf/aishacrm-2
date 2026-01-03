/**
 * BizDev Routes
 * Business development sources and tracking
 * 
 * @deprecated This route is deprecated. Use /api/bizdevsources instead.
 * @see backend/routes/bizdevsources.js
 * 
 * Status: DEPRECATED - Scheduled for removal
 * Replacement: /api/bizdevsources
 * Migration: All functionality moved to bizdevsources.js
 */

import express from 'express';

export default function createBizDevRoutes(_pgPool) {
  const router = express.Router();

  // Index route for service discovery and health
  router.get('/', async (req, res) => {
    try {
      return res.json({
        status: 'success',
        service: 'bizdev',
        endpoints: [
          'GET /api/bizdev/sources',
          'POST /api/bizdev/track'
        ],
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/bizdev/sources:
   *   get:
   *     summary: List BizDev sources (deprecated)
   *     description: Legacy endpoint. Use /api/bizdevsources instead.
   *     tags: [bizdev]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: List of BizDev sources
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // GET /api/bizdev/sources - List bizdev sources
  router.get('/sources', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      res.json({
        status: 'success',
        data: { sources: [], tenant_id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/bizdev/track:
   *   post:
   *     summary: Track BizDev activity
   *     description: Logs business development activity for tracking.
   *     tags: [bizdev]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               source_id:
   *                 type: string
   *               activity_type:
   *                 type: string
   *               data:
   *                 type: object
   *     responses:
   *       200:
   *         description: Activity tracked
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/bizdev/track - Track bizdev activity
  router.post('/track', async (req, res) => {
    try {
      const { tenant_id, source_id, activity_type, data } = req.body;

      res.json({
        status: 'success',
        message: 'BizDev activity tracked',
        data: { tenant_id, source_id, activity_type, data },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
