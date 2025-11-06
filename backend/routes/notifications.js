import express from 'express';

export default function createNotificationRoutes(pgPool) {
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

  // GET /api/notifications - List notifications
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, user_email, limit = 50, offset = 0 } = req.query;

      let query = 'SELECT * FROM notifications WHERE 1=1';
      const values = [];
      let valueIndex = 1;

      if (tenant_id) {
        query += ` AND tenant_id = $${valueIndex}`;
        values.push(tenant_id);
        valueIndex++;
      }

      if (user_email) {
        query += ` AND user_email = $${valueIndex}`;
        values.push(user_email);
        valueIndex++;
      }

      query += ` ORDER BY created_date DESC LIMIT $${valueIndex} OFFSET $${valueIndex + 1}`;
      values.push(parseInt(limit), parseInt(offset));
      
      const result = await pgPool.query(query, values);
      
      const notifications = result.rows.map(expandMetadata);
      
      res.json({
        status: 'success',
        data: {
          notifications,
          total: result.rows.length,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // POST /api/notifications - Create notification
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, user_email, title, message, type, is_read, metadata, ...otherFields } = req.body;
      
      // Merge metadata with unknown fields
      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields
      };
      
      const query = `
        INSERT INTO notifications (
          tenant_id, user_email, title, message, type, 
          is_read, metadata, created_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW()
        ) RETURNING *
      `;
      
      const values = [
        tenant_id,
        user_email,
        title,
        message,
        type || 'info',
        is_read || false,
        combinedMetadata
      ];
      
      const result = await pgPool.query(query, values);
      
      const notification = expandMetadata(result.rows[0]);
      
      res.status(201).json({
        status: 'success',
        data: notification
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // PUT /api/notifications/:id - Update notification (mark as read)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { is_read, metadata, ...otherFields } = req.body;
      
      // Fetch current metadata
      const currentNotif = await pgPool.query('SELECT metadata FROM notifications WHERE id = $1', [id]);
      
      if (currentNotif.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Notification not found'
        });
      }

      // Merge metadata
      const currentMetadata = currentNotif.rows[0].metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields,
      };
      
      // Keep SET on the same line as fields to satisfy the Supabase SQL parser (expects ' set ' token)
      const query = `
        UPDATE notifications
        SET is_read = COALESCE($1, is_read),
            metadata = $2
        WHERE id = $3
        RETURNING *
      `;
      
      const result = await pgPool.query(query, [is_read, updatedMetadata, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Notification not found'
        });
      }
      
      const updatedNotification = expandMetadata(result.rows[0]);
      
      res.json({
        status: 'success',
        data: updatedNotification
      });
    } catch (error) {
      console.error('Error updating notification:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
