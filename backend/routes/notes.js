/**
 * Notes Routes
 * CRUD operations for notes attached to entities
 */

import express from 'express';

export default function createNoteRoutes(pgPool) {
  const router = express.Router();

  // GET /api/notes - List notes
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, related_type, related_id, limit = 50, offset = 0 } = req.query;
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });

      let query = 'SELECT * FROM note WHERE 1=1';
      const params = [];
      let pc = 1;
      if (tenant_id) { query += ` AND tenant_id = $${pc}`; params.push(tenant_id); pc++; }
      if (related_type) { query += ` AND related_type = $${pc}`; params.push(related_type); pc++; }
      if (related_id) { query += ` AND related_id = $${pc}`; params.push(related_id); pc++; }
      query += ` ORDER BY created_at DESC LIMIT $${pc} OFFSET $${pc + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, params);
      
      let countQuery = 'SELECT COUNT(*) FROM note WHERE 1=1';
      const countParams = [];
      let cpc = 1;
      if (tenant_id) { countQuery += ` AND tenant_id = $${cpc}`; countParams.push(tenant_id); cpc++; }
      if (related_type) { countQuery += ` AND related_type = $${cpc}`; countParams.push(related_type); cpc++; }
      if (related_id) { countQuery += ` AND related_id = $${cpc}`; countParams.push(related_id); }
      const countResult = await pgPool.query(countQuery, countParams);

      res.json({ status: 'success', data: { notes: result.rows, total: parseInt(countResult.rows[0].count) } });
    } catch (error) {
      console.error('Error fetching notes:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/notes/:id - Get single note (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!tenant_id) return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });
      const result = await pgPool.query('SELECT * FROM note WHERE tenant_id = $1 AND id = $2 LIMIT 1', [tenant_id, id]);
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      // Safety check
      if (result.rows[0].tenant_id !== tenant_id) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', data: { note: result.rows[0] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/notes - Create note
  router.post('/', async (req, res) => {
    try {
      const n = req.body;
      if (!n.tenant_id || !n.content) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and content required' });
      }
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });

      const query = `INSERT INTO note (tenant_id, title, content, related_type, related_id, created_by, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
      const vals = [n.tenant_id, n.title || null, n.content, n.related_type || null, n.related_id || null, n.created_by || null, JSON.stringify(n.metadata || {})];
      const result = await pgPool.query(query, vals);
      res.status(201).json({ status: 'success', message: 'Created', data: { note: result.rows[0] } });
    } catch (error) {
      console.error('Error creating note:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/notes/:id - Update note
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const u = req.body;
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });

      const allowed = ['title', 'content', 'related_type', 'related_id', 'metadata'];
      const sets = [], vals = [];
      let pc = 1;
      Object.entries(u).forEach(([k, v]) => {
        if (allowed.includes(k)) {
          sets.push(`${k} = $${pc}`);
          vals.push(k === 'metadata' ? JSON.stringify(v) : v);
          pc++;
        }
      });
      if (sets.length === 0) return res.status(400).json({ status: 'error', message: 'No valid fields' });
      sets.push(`updated_at = NOW()`);
      vals.push(id);
      const result = await pgPool.query(`UPDATE note SET ${sets.join(', ')} WHERE id = $${pc} RETURNING *`, vals);
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', message: 'Updated', data: { note: result.rows[0] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/notes/:id - Delete note
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });
      const result = await pgPool.query('DELETE FROM note WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', message: 'Deleted', data: { id: result.rows[0].id } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
