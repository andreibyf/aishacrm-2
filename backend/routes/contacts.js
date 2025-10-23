/**
 * Contact Routes
 * Contact CRUD operations
 */

import express from 'express';

export default function createContactRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/contacts - List contacts
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      res.json({
        status: 'success',
        data: { contacts: [], total: 0, limit: parseInt(limit), offset: parseInt(offset) },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/contacts - Create contact
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, first_name, last_name, email, phone } = req.body;

      res.json({
        status: 'success',
        message: 'Contact created',
        data: { tenant_id, first_name, last_name, email, phone },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/contacts/:id - Get single contact
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      res.json({
        status: 'success',
        data: { id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/contacts/:id - Update contact
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      res.json({
        status: 'success',
        message: 'Contact updated',
        data: { id, ...updates },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/contacts/:id - Delete contact
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      res.json({
        status: 'success',
        message: 'Contact deleted',
        data: { id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
