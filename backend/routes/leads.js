/**
 * Lead Routes
 * Lead management and conversion
 */

import express from 'express';

export default function createLeadRoutes(pgPool) {
  const router = express.Router();

  // GET /api/leads - List leads
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, status, limit = 50, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      res.json({
        status: 'success',
        data: { leads: [], total: 0, status, limit: parseInt(limit), offset: parseInt(offset) },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/leads - Create lead
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, first_name, last_name, email, phone, company } = req.body;

      res.json({
        status: 'success',
        message: 'Lead created',
        data: { tenant_id, first_name, last_name, email, phone, company },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/leads/:id/convert - Convert lead to contact/opportunity
  router.post('/:id/convert', async (req, res) => {
    try {
      const { id } = req.params;
      const { create_opportunity, create_account } = req.body;

      res.json({
        status: 'success',
        message: 'Lead converted',
        data: { lead_id: id, create_opportunity, create_account },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/leads/:id - Update lead
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      res.json({
        status: 'success',
        message: 'Lead updated',
        data: { id, ...updates },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
