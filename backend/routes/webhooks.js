/**
 * Webhook Routes
 * CRUD operations for webhooks
 */

import express from 'express';

export default function createWebhookRoutes(pgPool) {
  const router = express.Router();

  // GET /api/webhooks - List webhooks
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0, is_active } = req.query;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      let query = 'SELECT * FROM webhook WHERE 1=1';
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

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM webhook WHERE 1=1';
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
        data: {
          webhooks: result.rows,
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/webhooks/:id - Get single webhook (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const result = await pgPool.query(
        'SELECT * FROM webhook WHERE tenant_id = $1 AND id = $2 LIMIT 1',
        [tenant_id, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Webhook not found' });
      }

      // Safety check
      if (result.rows[0].tenant_id !== tenant_id) {
        return res.status(404).json({ status: 'error', message: 'Webhook not found' });
      }

      res.json({ status: 'success', data: { webhook: result.rows[0] } });
    } catch (error) {
      console.error('Error fetching webhook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/webhooks - Create webhook
  router.post('/', async (req, res) => {
    try {
      const webhook = req.body;

      if (!webhook.tenant_id || !webhook.url) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and url are required' });
      }

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const query = `
        INSERT INTO webhook (tenant_id, url, event_types, is_active, secret, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        webhook.tenant_id,
        webhook.url,
        JSON.stringify(webhook.event_types || []),
        webhook.is_active !== undefined ? webhook.is_active : true,
        webhook.secret || null,
        JSON.stringify(webhook.metadata || {})
      ];

      const result = await pgPool.query(query, values);

      res.status(201).json({
        status: 'success',
        message: 'Webhook created successfully',
        data: { webhook: result.rows[0] }
      });
    } catch (error) {
      console.error('Error creating webhook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/webhooks/:id - Update webhook
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const allowedFields = ['url', 'event_types', 'is_active', 'secret', 'metadata'];
      const setStatements = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key)) {
          if (key === 'event_types' || key === 'metadata') {
            setStatements.push(`${key} = $${paramCount}`);
            values.push(JSON.stringify(value));
          } else {
            setStatements.push(`${key} = $${paramCount}`);
            values.push(value);
          }
          paramCount++;
        }
      });

      if (setStatements.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
      }

      setStatements.push(`updated_at = NOW()`);
      values.push(id);

      const query = `
        UPDATE webhook 
        SET ${setStatements.join(', ')} 
        WHERE id = $${paramCount} 
        RETURNING *
      `;

      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Webhook not found' });
      }

      res.json({
        status: 'success',
        message: 'Webhook updated successfully',
        data: { webhook: result.rows[0] }
      });
    } catch (error) {
      console.error('Error updating webhook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/webhooks/:id - Delete webhook
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const result = await pgPool.query('DELETE FROM webhook WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Webhook not found' });
      }

      res.json({
        status: 'success',
        message: 'Webhook deleted successfully',
        data: { id: result.rows[0].id }
      });
    } catch (error) {
      console.error('Error deleting webhook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
