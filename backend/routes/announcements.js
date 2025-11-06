/**
 * Announcements Routes
 * CRUD operations for system announcements
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';

export default function createAnnouncementRoutes(pgPool) {
  const router = express.Router();

  // GET /api/announcements - List announcements
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, is_active, limit = 50, offset = 0 } = req.query;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      let query = 'SELECT * FROM announcement WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (tenant_id) {
        query += ` AND tenant_id = $${paramCount}`;
        params.push(tenant_id);
        paramCount++;
      }

      if (is_active !== undefined) {
        query += ` AND is_active = $${paramCount}`;
        params.push(is_active === 'true');
        paramCount++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, params);
      
      let countQuery = 'SELECT COUNT(*) FROM announcement WHERE 1=1';
      const countParams = [];
      let countParamCount = 1;
      if (tenant_id) {
        countQuery += ` AND tenant_id = $${countParamCount}`;
        countParams.push(tenant_id);
        countParamCount++;
      }
      if (is_active !== undefined) {
        countQuery += ` AND is_active = $${countParamCount}`;
        countParams.push(is_active === 'true');
      }
      const countResult = await pgPool.query(countQuery, countParams);

      res.json({
        status: 'success',
        data: { announcements: result.rows, total: parseInt(countResult.rows[0].count) },
      });
    } catch (error) {
      console.error('Error fetching announcements:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/announcements/:id - Get single announcement (tenant aware)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!validateTenantScopedId(id, tenant_id, res)) return;
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });
      const result = await pgPool.query(
        'SELECT * FROM announcement WHERE (tenant_id = $1 OR tenant_id IS NULL) AND id = $2 LIMIT 1',
        [tenant_id, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', data: { announcement: result.rows[0] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/announcements - Create announcement
  router.post('/', async (req, res) => {
    try {
      const a = req.body;
      if (!a.title || !a.content) return res.status(400).json({ status: 'error', message: 'title and content required' });
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });

      const query = `INSERT INTO announcement (tenant_id, title, content, type, is_active, start_date, end_date, target_roles, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`;
      const values = [a.tenant_id || null, a.title, a.content, a.type || 'info', a.is_active !== false, a.start_date || null, a.end_date || null, JSON.stringify(a.target_roles || []), JSON.stringify(a.metadata || {})];
      const result = await pgPool.query(query, values);
      res.status(201).json({ status: 'success', message: 'Created', data: { announcement: result.rows[0] } });
    } catch (error) {
      console.error('Error creating announcement:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/announcements/:id - Update announcement (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      const u = req.body;

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });

      const allowed = ['title', 'content', 'type', 'is_active', 'start_date', 'end_date', 'target_roles', 'metadata'];
      const sets = [], vals = [tenant_id];
      let pc = 2;
      Object.entries(u).forEach(([k, v]) => {
        if (allowed.includes(k)) {
          sets.push(`${k} = $${pc}`);
          vals.push((k === 'target_roles' || k === 'metadata') ? JSON.stringify(v) : v);
          pc++;
        }
      });
      if (sets.length === 0) return res.status(400).json({ status: 'error', message: 'No valid fields' });
      sets.push(`updated_at = NOW()`);
      vals.push(id);
      const result = await pgPool.query(`UPDATE announcement SET ${sets.join(', ')} WHERE (tenant_id = $1 OR tenant_id IS NULL) AND id = $${pc} RETURNING *`, vals);
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', message: 'Updated', data: { announcement: result.rows[0] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/announcements/:id - Delete announcement (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });

      const result = await pgPool.query(
        'DELETE FROM announcement WHERE (tenant_id = $1 OR tenant_id IS NULL) AND id = $2 RETURNING id',
        [tenant_id, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', message: 'Deleted', data: { id: result.rows[0].id } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
