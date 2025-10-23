import express from 'express';

export default function createNotificationRoutes(pgPool) {
  const router = express.Router();

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
      
      res.json({
        status: 'success',
        data: {
          notifications: result.rows,
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
      const notif = req.body;
      
      const query = `
        INSERT INTO notifications (
          tenant_id, user_email, title, message, type, 
          is_read, created_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NOW()
        ) RETURNING *
      `;
      
      const values = [
        notif.tenant_id,
        notif.user_email,
        notif.title,
        notif.message,
        notif.type || 'info',
        notif.is_read || false
      ];
      
      const result = await pgPool.query(query, values);
      
      res.status(201).json({
        status: 'success',
        data: result.rows[0]
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
      const { is_read } = req.body;
      
      const query = `
        UPDATE notifications SET
          is_read = $1,
          updated_date = NOW()
        WHERE id = $2
        RETURNING *
      `;
      
      const result = await pgPool.query(query, [is_read, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Notification not found'
        });
      }
      
      res.json({
        status: 'success',
        data: result.rows[0]
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
