/**
 * Account Routes
 * Full CRUD operations with PostgreSQL database
 */

import express from 'express';

export default function createAccountRoutes(pgPool) {
  const router = express.Router();

  // Helper function to expand metadata fields to top-level properties
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata, // Spread all metadata fields to top level
      metadata, // Keep original for backwards compatibility
    };
  };

  // GET /api/accounts - List accounts
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, type, limit = 50, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      let query = 'SELECT * FROM accounts WHERE tenant_id = $1';
      const params = [tenant_id];
      
      if (type) {
        params.push(type);
        query += ` AND type = $${params.length}`;
      }
      
      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, params);
      
      let countQuery = 'SELECT COUNT(*) FROM accounts WHERE tenant_id = $1';
      const countParams = [tenant_id];
      if (type) {
        countParams.push(type);
        countQuery += ' AND type = $2';
      }
      const countResult = await pgPool.query(countQuery, countParams);

      // Expand metadata for all accounts
      const accounts = result.rows.map(expandMetadata);

      res.json({
        status: 'success',
        data: { accounts, total: parseInt(countResult.rows[0].count), limit: parseInt(limit), offset: parseInt(offset) },
      });
    } catch (error) {
      console.error('Error listing accounts:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/accounts - Create account
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, name, type, industry, website } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      if (!name) {
        return res.status(400).json({ status: 'error', message: 'name is required' });
      }

      const query = `
        INSERT INTO accounts (tenant_id, name, type, industry, website, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING *
      `;
      
      const result = await pgPool.query(query, [
        tenant_id,
        name,
        type,
        industry,
        website
      ]);

      res.json({
        status: 'success',
        message: 'Account created',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error creating account:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/accounts/:id - Get single account
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pgPool.query('SELECT * FROM accounts WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Account not found' });
      }

      // Expand metadata to top-level properties
      const account = expandMetadata(result.rows[0]);

      res.json({
        status: 'success',
        data: account,
      });
    } catch (error) {
      console.error('Error fetching account:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/accounts/:id - Update account
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, type, industry, website } = req.body;

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (type !== undefined) {
        updates.push(`type = $${paramCount++}`);
        values.push(type);
      }
      if (industry !== undefined) {
        updates.push(`industry = $${paramCount++}`);
        values.push(industry);
      }
      if (website !== undefined) {
        updates.push(`website = $${paramCount++}`);
        values.push(website);
      }

      if (updates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const query = `UPDATE accounts SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Account not found' });
      }

      res.json({
        status: 'success',
        message: 'Account updated',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error updating account:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/accounts/:id - Delete account
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pgPool.query('DELETE FROM accounts WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Account not found' });
      }

      res.json({
        status: 'success',
        message: 'Account deleted',
        data: { id: result.rows[0].id },
      });
    } catch (error) {
      console.error('Error deleting account:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
