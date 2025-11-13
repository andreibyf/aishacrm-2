/**
 * Contact Routes
 * Full CRUD operations with PostgreSQL database
 */

import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';

export default function createContactRoutes(pgPool) {
  const router = express.Router();

  // Apply tenant validation and employee data scope to all routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

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
      const { tenant_id, limit = 50, offset = 0, status, account_id } = req.query;

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
      if (account_id) {
        params.push(account_id);
        query += ` AND account_id = $${params.length}`;
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
      if (account_id) {
        countParams.push(account_id);
        countQuery += ` AND account_id = $${countParams.length}`;
      }
      const countResult = await pgPool.query(countQuery, countParams);

      // Expand metadata for all contacts
      const contacts = result.rows.map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          contacts,
            total: parseInt(countResult.rows?.[0]?.count || 0),
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
      });
    } catch (error) {
      console.error('Error listing contacts:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/contacts/search - Search contacts by name/email/phone
  router.get('/search', async (req, res) => {
    try {
      const { tenant_id, q = '', limit = 25, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      if (!q || !q.trim()) {
        return res.status(400).json({ status: 'error', message: 'q is required' });
      }

      const like = `%${q}%`;

      const searchQuery = `
        SELECT *
        FROM contacts
        WHERE tenant_id = $1
          AND (
            first_name ILIKE $2 OR
            last_name ILIKE $2 OR
            email ILIKE $2 OR
            phone ILIKE $2
          )
        ORDER BY updated_at DESC
        LIMIT $3 OFFSET $4
      `;
      const searchParams = [tenant_id, like, parseInt(limit), parseInt(offset)];
      const result = await pgPool.query(searchQuery, searchParams);

      const countQuery = `
        SELECT COUNT(*)
        FROM contacts
        WHERE tenant_id = $1
          AND (
            first_name ILIKE $2 OR
            last_name ILIKE $2 OR
            email ILIKE $2 OR
            phone ILIKE $2
          )
      `;
      const countResult = await pgPool.query(countQuery, [tenant_id, like]);

      const contacts = result.rows.map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          contacts,
          total: parseInt(countResult.rows?.[0]?.count || 0),
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      console.error('Error searching contacts:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/contacts - Create contact
  router.post('/', async (req, res) => {
    try {
      const {
        tenant_id,
        first_name,
        last_name,
        email,
        phone,
        account_id,
        status = 'active',
        metadata: incomingMetadata,
        ...otherFields
      } = req.body || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Validate required name fields
      if (!first_name || !first_name.trim()) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'first_name is required and cannot be empty',
          field: 'first_name'
        });
      }

      if (!last_name || !last_name.trim()) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'last_name is required and cannot be empty',
          field: 'last_name'
        });
      }

      // Merge all extra fields (including is_test_data, tags, etc.) into metadata JSON
      const mergedMetadata = {
        ...(incomingMetadata || {}),
        ...otherFields,
      };

      const query = `
        INSERT INTO contacts (
          tenant_id, first_name, last_name, email, phone, account_id, status, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
        )
        RETURNING *
      `;
      
      const result = await pgPool.query(query, [
        tenant_id,
        first_name,
        last_name,
        email,
        phone,
        account_id || null,
        status,
        mergedMetadata,
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

  // GET /api/contacts/:id - Get single contact (tenant required)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await pgPool.query(
        'SELECT * FROM contacts WHERE tenant_id = $1 AND id = $2 LIMIT 1',
        [tenant_id, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }

      const row = result.rows[0];
      if (row.id !== id || row.tenant_id !== tenant_id) {
        console.error('[Contacts GET /:id] Mismatched row returned', { expected: { id, tenant_id }, got: { id: row.id, tenant_id: row.tenant_id } });
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }

      // Expand metadata to top-level properties
      const contact = expandMetadata(row);

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
      const { first_name, last_name, email, phone, account_id, status, metadata, ...otherFields } = req.body;

      // Validate required name fields if provided
      if (first_name !== undefined && (!first_name || !first_name.trim())) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'first_name cannot be empty',
          field: 'first_name'
        });
      }

      if (last_name !== undefined && (!last_name || !last_name.trim())) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'last_name cannot be empty',
          field: 'last_name'
        });
      }

      // First, get current contact to merge metadata
      const currentContact = await pgPool.query('SELECT metadata FROM contacts WHERE id = $1', [id]);
      
      if (currentContact.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }

      // Merge metadata
      const currentMetadata = currentContact.rows[0].metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields,
      };

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

      // Always update metadata
      updates.push(`metadata = $${paramCount++}`);
      values.push(updatedMetadata);

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const query = `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }

      // Expand metadata in response
      // Expand metadata in response
      const updatedContact = expandMetadata(result.rows[0]);

      res.json({
        status: 'success',
        message: 'Contact updated',
        data: updatedContact,
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
