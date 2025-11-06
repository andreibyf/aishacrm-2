import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';

export default function createTenantIntegrationRoutes(pool) {
  const router = express.Router();

  // GET /api/tenantintegrations - List tenant integrations with filters
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, integration_type, is_active } = req.query;
      
      let query = 'SELECT * FROM tenant_integrations WHERE 1=1';
      const params = [];
      
      if (tenant_id) {
        params.push(tenant_id);
        query += ` AND tenant_id = $${params.length}`;
      }
      
      if (integration_type) {
        params.push(integration_type);
        query += ` AND integration_type = $${params.length}`;
      }
      
      if (is_active !== undefined) {
        params.push(is_active === 'true');
        query += ` AND is_active = $${params.length}`;
      }
      
      query += ' ORDER BY created_at DESC';
      
      const result = await pool.query(query, params);
      res.json({ status: 'success', data: { tenantintegrations: result.rows } });
    } catch (error) {
      console.error('Error fetching tenant integrations:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/tenantintegrations/:id - Get single tenant integration (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const result = await pool.query(
        'SELECT * FROM tenant_integrations WHERE tenant_id = $1 AND id = $2 LIMIT 1',
        [tenant_id, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Integration not found' });
      }
      
      // Safety check
      if (result.rows[0].tenant_id !== tenant_id) {
        return res.status(404).json({ status: 'error', message: 'Integration not found' });
      }

      res.json({ status: 'success', data: result.rows[0] });
    } catch (error) {
      console.error('Error fetching tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/tenantintegrations - Create new tenant integration
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, integration_type, integration_name, is_active, api_credentials, config, metadata } = req.body;
      
      const result = await pool.query(
        `INSERT INTO tenant_integrations (tenant_id, integration_type, integration_name, is_active, api_credentials, config, metadata) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING *`,
        [
          tenant_id,
          integration_type,
          integration_name || null,
          is_active !== undefined ? is_active : true,
          api_credentials || {},
          config || {},
          metadata || {}
        ]
      );
      
      res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
      console.error('Error creating tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/tenantintegrations/:id - Update tenant integration (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;
      const { integration_type, integration_name, is_active, api_credentials, config, metadata } = req.body;

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      
      const updates = [];
      const params = [tenant_id];
      let paramIndex = 2;
      
      if (integration_type !== undefined) {
        params.push(integration_type);
        updates.push(`integration_type = $${paramIndex++}`);
      }
      if (integration_name !== undefined) {
        params.push(integration_name);
        updates.push(`integration_name = $${paramIndex++}`);
      }
      if (is_active !== undefined) {
        params.push(is_active);
        updates.push(`is_active = $${paramIndex++}`);
      }
      if (api_credentials !== undefined) {
        params.push(api_credentials);
        updates.push(`api_credentials = $${paramIndex++}`);
      }
      if (config !== undefined) {
        params.push(config);
        updates.push(`config = $${paramIndex++}`);
      }
      if (metadata !== undefined) {
        params.push(metadata);
        updates.push(`metadata = $${paramIndex++}`);
      }
      
      if (updates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }
      
      updates.push(`updated_at = now()`);
      params.push(id);
      
      const query = `UPDATE tenant_integrations SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $${paramIndex} RETURNING *`;
      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Integration not found' });
      }
      
      res.json({ status: 'success', data: result.rows[0] });
    } catch (error) {
      console.error('Error updating tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/tenantintegrations/:id - Delete tenant integration (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const result = await pool.query(
        'DELETE FROM tenant_integrations WHERE tenant_id = $1 AND id = $2 RETURNING *',
        [tenant_id, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Integration not found' });
      }
      
      res.json({ status: 'success', data: result.rows[0] });
    } catch (error) {
      console.error('Error deleting tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
