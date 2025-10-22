/**
 * Account Routes
 * CRUD operations for accounts
 */

import express from 'express';

export default function createAccountRoutes(pgPool) {
  const router = express.Router();

  // GET /api/accounts - List accounts
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      res.json({
        status: 'success',
        data: { accounts: [], total: 0, limit: parseInt(limit), offset: parseInt(offset) },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/accounts - Create account
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, name, industry, website } = req.body;

      res.json({
        status: 'success',
        message: 'Account created',
        data: { tenant_id, name, industry, website },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/accounts/:id - Get single account
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      res.json({
        status: 'success',
        data: { id, tenant_id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/accounts/:id - Update account
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      res.json({
        status: 'success',
        message: 'Account updated',
        data: { id, ...updates },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/accounts/:id - Delete account
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      res.json({
        status: 'success',
        message: 'Account deleted',
        data: { id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
