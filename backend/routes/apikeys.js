/**
 * API Keys Routes
 * Manage API keys for tenants
 */

import express from 'express';

export default function createApikeyRoutes(pgPool) {
  const router = express.Router();

  // GET /api/apikeys - List API keys for a tenant
  router.get('/', async (req, res) => {
    try {
      const { tenant_id } = req.query;
      const limit = parseInt(req.query.limit || '100', 10);

      if (!pgPool) {
        // Return empty list in non-DB mode
        return res.json({ status: 'success', data: { apikeys: [], tenant_id } });
      }

      const q = `SELECT id, tenant_id, key_name, key_value, is_active, description, created_at, created_date, created_by, usage_count, last_used
                 FROM apikey
                 WHERE tenant_id = $1
                 ORDER BY created_date DESC
                 LIMIT $2`;
      const { rows } = await pgPool.query(q, [tenant_id, limit]);
      return res.json({ status: 'success', data: { apikeys: rows } });
    } catch (error) {
      console.error('apikeys:list error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/apikeys - Create a new API key
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, key_name, key_value, description, created_by } = req.body;

      if (!tenant_id || !key_name || !key_value) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, key_name and key_value are required' });
      }

      if (!pgPool) {
        const newKey = {
          id: `local-apikey-${Date.now()}`,
          tenant_id,
          key_name,
          key_value,
          description: description || null,
          is_active: true,
          created_at: new Date().toISOString(),
          created_date: new Date().toISOString(),
          created_by: created_by || null,
        };
        return res.json({ status: 'success', message: 'API key created (local)', data: newKey });
      }

      const q = `INSERT INTO apikey (tenant_id, key_name, key_value, description, is_active, created_at, created_date, created_by)
                 VALUES ($1, $2, $3, $4, true, now(), now(), $5)
                 RETURNING id, tenant_id, key_name, key_value, description, is_active, created_at, created_date, created_by`;
      const values = [tenant_id, key_name, key_value, description || null, created_by || null];
      const { rows } = await pgPool.query(q, values);
      return res.json({ status: 'success', message: 'API key created', data: rows[0] });
    } catch (error) {
      console.error('apikeys:create error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/apikeys/:id - Get a single API key (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      if (!pgPool) {
        // In non-DB mode, echo back request context
        return res.json({ status: 'success', data: { id, tenant_id } });
      }

      const q = `SELECT id, tenant_id, key_name, key_value, description, is_active, created_at, created_date, created_by
                 FROM apikey
                 WHERE tenant_id = $1 AND id = $2
                 LIMIT 1`;
      const { rows } = await pgPool.query(q, [tenant_id, id]);
      if (rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      // Safety check
      if (rows[0].tenant_id !== tenant_id) return res.status(404).json({ status: 'error', message: 'Not found' });
      return res.json({ status: 'success', data: rows[0] });
    } catch (error) {
      console.error('apikeys:get error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/apikeys/:id - Delete an API key
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!pgPool) {
        return res.json({ status: 'success', message: 'Deleted (local)', data: { id } });
      }
      const q = 'DELETE FROM apikey WHERE id = $1 RETURNING id';
      const { rows } = await pgPool.query(q, [id]);
      if (rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      return res.json({ status: 'success', message: 'Deleted', data: { id: rows[0].id } });
    } catch (error) {
      console.error('apikeys:delete error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
