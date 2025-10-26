/**
 * SystemBranding Routes
 * CRUD operations for global system branding
 */

import express from 'express';

export default function createSystemBrandingRoutes(pgPool) {
  const router = express.Router();

  // GET /api/systembrandings - List systembranding records
  router.get('/', async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      const query = 'SELECT * FROM systembranding ORDER BY created_at DESC LIMIT $1 OFFSET $2';
      const params = [parseInt(limit), parseInt(offset)];

      const result = await pgPool.query(query, params);

      // Get total count
      const countResult = await pgPool.query('SELECT COUNT(*) FROM systembranding');
      const total = parseInt(countResult.rows[0].count);

      res.json({
        status: 'success',
        data: { 
          systembrandings: result.rows, 
          total, 
          limit: parseInt(limit), 
          offset: parseInt(offset) 
        },
      });
    } catch (error) {
      console.error('Error listing systembranding:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/systembrandings/:id - Get single systembranding by ID
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      const query = 'SELECT * FROM systembranding WHERE id = $1';
      const result = await pgPool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'SystemBranding record not found',
        });
      }

      res.json({
        status: 'success',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error getting systembranding:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/systembrandings - Create new systembranding
  router.post('/', async (req, res) => {
    try {
      const { footer_logo_url, footer_legal_html, is_active = true } = req.body;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      const query = `
        INSERT INTO systembranding (footer_logo_url, footer_legal_html, is_active, created_at, created_date)
        VALUES ($1, $2, $3, NOW(), NOW())
        RETURNING *
      `;
      const params = [footer_logo_url || null, footer_legal_html || null, is_active];

      const result = await pgPool.query(query, params);

      res.status(201).json({
        status: 'success',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error creating systembranding:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/systembrandings/:id - Update systembranding
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { footer_logo_url, footer_legal_html, is_active } = req.body;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      const updates = [];
      const params = [];
      let paramCount = 1;

      if (footer_logo_url !== undefined) {
        updates.push(`footer_logo_url = $${paramCount}`);
        params.push(footer_logo_url);
        paramCount++;
      }

      if (footer_legal_html !== undefined) {
        updates.push(`footer_legal_html = $${paramCount}`);
        params.push(footer_legal_html);
        paramCount++;
      }

      if (is_active !== undefined) {
        updates.push(`is_active = $${paramCount}`);
        params.push(is_active);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No fields to update',
        });
      }

      params.push(id);
      const query = `UPDATE systembranding SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

      const result = await pgPool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'SystemBranding record not found',
        });
      }

      res.json({
        status: 'success',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error updating systembranding:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/systembrandings/:id - Delete systembranding
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      const query = 'DELETE FROM systembranding WHERE id = $1 RETURNING *';
      const result = await pgPool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'SystemBranding record not found',
        });
      }

      res.json({
        status: 'success',
        message: 'SystemBranding deleted successfully',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error deleting systembranding:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
