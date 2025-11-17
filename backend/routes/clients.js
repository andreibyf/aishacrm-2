/**
 * Client Routes
 * Client onboarding and management
 */

import express from 'express';

export default function createClientRoutes(_pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/clients/onboard:
   *   post:
   *     summary: Onboard new client
   *     description: Initiates client onboarding workflow for a tenant.
   *     tags: [clients]
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
   *               company_name:
   *                 type: string
   *               contact_info:
   *                 type: object
   *     responses:
   *       200:
   *         description: Onboarding initiated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/clients/onboard - Onboard new client
  router.post('/onboard', async (req, res) => {
    try {
      const { tenant_id, company_name, contact_info } = req.body;

      res.json({
        status: 'success',
        message: 'Client onboarding initiated',
        data: { tenant_id, company_name, contact_info },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/clients:
   *   get:
   *     summary: List clients
   *     description: Returns a list of clients for the tenant.
   *     tags: [clients]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: List of clients
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // GET /api/clients - List clients
  router.get('/', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      res.json({
        status: 'success',
        data: { clients: [], tenant_id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
