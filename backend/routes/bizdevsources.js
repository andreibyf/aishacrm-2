/**
 * BizDev Sources Routes
 * Manage business development lead sources
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';

export default function createBizDevSourceRoutes(pgPool) {
  const router = express.Router();

  // Get all bizdev sources (with optional filtering)
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, status, source_type, priority } = req.query;
      
      let query = 'SELECT * FROM bizdev_sources WHERE 1=1';
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

      if (source_type) {
        query += ` AND source_type = $${paramCount}`;
        params.push(source_type);
        paramCount++;
      }

      if (priority) {
        query += ` AND priority = $${paramCount}`;
        params.push(priority);
        paramCount++;
      }

      query += ' ORDER BY created_at DESC';

      const result = await pgPool.query(query, params);

      res.json({
        status: 'success',
        data: { bizdevsources: result.rows }
      });
    } catch (error) {
      console.error('Error fetching bizdev sources:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Get single bizdev source by ID (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      
      const result = await pgPool.query(
        'SELECT * FROM bizdev_sources WHERE tenant_id = $1 AND id = $2 LIMIT 1',
        [tenant_id, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'BizDev source not found'
        });
      }

      // Safety check
      if (result.rows[0].tenant_id !== tenant_id) {
        return res.status(404).json({ status: 'error', message: 'BizDev source not found' });
      }

      res.json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error fetching bizdev source:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Create new bizdev source
  router.post('/', async (req, res) => {
    try {
      const {
        tenant_id,
        source_name,
        source_type,
        source_url,
        contact_person,
        contact_email,
        contact_phone,
        status,
        priority,
        leads_generated,
        opportunities_created,
        revenue_generated,
        notes,
        tags,
        metadata,
        is_test_data
      } = req.body;

      if (!tenant_id || !source_name) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id and source_name are required'
        });
      }

      const result = await pgPool.query(
        `INSERT INTO bizdev_sources (
          tenant_id, source_name, source_type, source_url,
          contact_person, contact_email, contact_phone,
          status, priority, leads_generated, opportunities_created,
          revenue_generated, notes, tags, metadata, is_test_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          tenant_id, source_name, source_type, source_url,
          contact_person, contact_email, contact_phone,
          status || 'active', priority || 'medium', leads_generated || 0,
          opportunities_created || 0, revenue_generated || 0,
          notes, JSON.stringify(tags || []), JSON.stringify(metadata || {}),
          is_test_data || false
        ]
      );

      res.status(201).json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error creating bizdev source:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Update bizdev source (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      const {
        source_name,
        source_type,
        source_url,
        contact_person,
        contact_email,
        contact_phone,
        status,
        priority,
        leads_generated,
        opportunities_created,
        revenue_generated,
        notes,
        tags,
        metadata,
        is_test_data
      } = req.body;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const result = await pgPool.query(
        `UPDATE bizdev_sources SET
          source_name = COALESCE($1, source_name),
          source_type = COALESCE($2, source_type),
          source_url = COALESCE($3, source_url),
          contact_person = COALESCE($4, contact_person),
          contact_email = COALESCE($5, contact_email),
          contact_phone = COALESCE($6, contact_phone),
          status = COALESCE($7, status),
          priority = COALESCE($8, priority),
          leads_generated = COALESCE($9, leads_generated),
          opportunities_created = COALESCE($10, opportunities_created),
          revenue_generated = COALESCE($11, revenue_generated),
          notes = COALESCE($12, notes),
          tags = COALESCE($13, tags),
          metadata = COALESCE($14, metadata),
          is_test_data = COALESCE($15, is_test_data),
          updated_at = now()
        WHERE tenant_id = $16 AND id = $17
        RETURNING *`,
        [
          source_name, source_type, source_url, contact_person,
          contact_email, contact_phone, status, priority,
          leads_generated, opportunities_created, revenue_generated,
          notes, tags ? JSON.stringify(tags) : null,
          metadata ? JSON.stringify(metadata) : null,
          is_test_data, tenant_id, id
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'BizDev source not found'
        });
      }

      res.json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error updating bizdev source:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Delete bizdev source (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      
      const result = await pgPool.query(
        'DELETE FROM bizdev_sources WHERE tenant_id = $1 AND id = $2 RETURNING *',
        [tenant_id, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'BizDev source not found'
        });
      }

      res.json({
        status: 'success',
        message: 'BizDev source deleted',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error deleting bizdev source:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
