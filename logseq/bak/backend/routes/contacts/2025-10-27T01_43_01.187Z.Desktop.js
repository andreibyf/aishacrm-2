/**
 * Contact Routes
 * Full CRUD operations with PostgreSQL database
 */

import express from 'express';

export default function createContactRoutes(pgPool) {
  const router = express.Router();

  // Helper function to expand metadata fields to top-level properties
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata,
      metadata,
    };
  };

  // GET /api/contacts - List contacts
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0, status } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Build query with optional filters
      let query = 'SELECT * FROM contacts WHERE tenant_id = $1';
      const params = [tenant_id];
      
      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }
      
      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, params);
      
      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM contacts WHERE tenant_id = $1';
      const countParams = [tenant_id];
      if (status) {
        countParams.push(status);
        countQuery += ' AND status = $2';
      }
      const countResult = await pgPool.query(countQuery, countParams);

      // Expand metadata for all contacts
      const contacts = result.rows.map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          contacts,
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
      });
    } catch (error) {
      console.error('Error listing contacts:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/contacts - Create contact
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, first_name, last_name, email, phone, account_id, status = 'active' } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const query = `
        INSERT INTO contacts (tenant_id, first_name, last_name, email, phone, account_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *
      `;
      
      const result = await pgPool.query(query, [
        tenant_id,
        first_name,
        last_name,
        email,
        phone,
        account_id || null,
        status
      ]);

      res.json({
        status: 'success',
        message: 'Contact created',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error creating contact:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/contacts/:id - Get single contact
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pgPool.query('SELECT * FROM contacts WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }

      // Expand metadata to top-level properties
      const contact = expandMetadata(result.rows[0]);

      res.json({
        status: 'success',
        data: contact,
      });
    } catch (error) {
      console.error('Error fetching contact:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/contacts/:id - Update contact
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { first_name, last_name, email, phone, account_id, status } = req.body;

      // Build dynamic update query
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (first_name !== undefined) {
        updates.push(`first_name = $${paramCount++}`);
        values.push(first_name);
      }
      if (last_name !== undefined) {
        updates.push(`last_name = $${paramCount++}`);
        values.push(last_name);
      }
      if (email !== undefined) {
        updates.push(`email = $${paramCount++}`);
        values.push(email);
      }
      if (phone !== undefined) {
        updates.push(`phone = $${paramCount++}`);
        values.push(phone);
      }
      if (account_id !== undefined) {
        updates.push(`account_id = $${paramCount++}`);
        values.push(account_id);
      }
      if (status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(status);
      }

      if (updates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const query = `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }

      res.json({
        status: 'success',
        message: 'Contact updated',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error updating contact:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/contacts/:id - Delete contact
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pgPool.query('DELETE FROM contacts WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }

      res.json({
        status: 'success',
        message: 'Contact deleted',
        data: { id: result.rows[0].id },
      });
    } catch (error) {
      console.error('Error deleting contact:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
