/**
 * Tenant Routes
 * CRUD operations for tenants
 */

import express from 'express';

export default function createTenantRoutes(pgPool) {
  const router = express.Router();

  // GET /api/tenants - List tenants
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0, status } = req.query;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      let query = 'SELECT * FROM tenant WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (tenant_id) {
        query += ` AND tenant_id = $${paramCount}`;
        params.push(tenant_id);
        paramCount++;
      }

      if (status) {
        query += ` AND status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM tenant WHERE 1=1';
      const countParams = [];
      let countParamCount = 1;

      if (tenant_id) {
        countQuery += ` AND tenant_id = $${countParamCount}`;
        countParams.push(tenant_id);
        countParamCount++;
      }

      if (status) {
        countQuery += ` AND status = $${countParamCount}`;
        countParams.push(status);
      }

      const countResult = await pgPool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      res.json({
        status: 'success',
        data: { 
          tenants: result.rows, 
          total, 
          limit: parseInt(limit), 
          offset: parseInt(offset) 
        },
      });
    } catch (error) {
      console.error('Error listing tenants:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/tenants - Create tenant
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, name, settings, status, metadata } = req.body;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      if (!tenant_id) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'tenant_id is required' 
        });
      }

      const query = `
        INSERT INTO tenant (tenant_id, name, settings, status, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const result = await pgPool.query(query, [
        tenant_id,
        name || null,
        settings || {},
        status || 'active',
        metadata || {}
      ]);

      res.json({
        status: 'success',
        message: 'Tenant created',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error creating tenant:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({ 
          status: 'error', 
          message: 'Tenant with this tenant_id already exists' 
        });
      }
      
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/tenants/:id - Get single tenant
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      const query = 'SELECT * FROM tenant WHERE id = $1';
      const result = await pgPool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found',
        });
      }

      res.json({
        status: 'success',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error getting tenant:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/tenants/:id - Update tenant
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, settings, status, metadata } = req.body;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      const updates = [];
      const params = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        params.push(name);
        paramCount++;
      }

      if (settings !== undefined) {
        updates.push(`settings = $${paramCount}`);
        params.push(settings);
        paramCount++;
      }

      if (status !== undefined) {
        updates.push(`status = $${paramCount}`);
        params.push(status);
        paramCount++;
      }

      if (metadata !== undefined) {
        updates.push(`metadata = $${paramCount}`);
        params.push(metadata);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No fields to update',
        });
      }

      params.push(id);
      const query = `
        UPDATE tenant 
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await pgPool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found',
        });
      }

      res.json({
        status: 'success',
        message: 'Tenant updated',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error updating tenant:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/tenants/:id - Delete tenant
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      const query = 'DELETE FROM tenant WHERE id = $1 RETURNING *';
      const result = await pgPool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found',
        });
      }

      res.json({
        status: 'success',
        message: 'Tenant deleted',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error deleting tenant:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
