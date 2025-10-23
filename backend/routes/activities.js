import express from 'express';

export default function createActivityRoutes(pgPool) {
  const router = express.Router();

  // GET /api/activities - List activities with filtering
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const query = `
        SELECT * FROM activities 
        WHERE tenant_id = $1 
        ORDER BY created_date DESC 
        LIMIT $2 OFFSET $3
      `;
      
      const result = await pgPool.query(query, [tenant_id, parseInt(limit), parseInt(offset)]);
      
      const countQuery = 'SELECT COUNT(*) FROM activities WHERE tenant_id = $1';
      const countResult = await pgPool.query(countQuery, [tenant_id]);
      
      res.json({
        status: 'success',
        data: {
          activities: result.rows,
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching activities:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/activities/:id - Get single activity
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pgPool.query('SELECT * FROM activities WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Activity not found'
        });
      }
      
      res.json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error fetching activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // POST /api/activities - Create new activity
  router.post('/', async (req, res) => {
    try {
      const activity = req.body;
      
      if (!activity.tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const query = `
        INSERT INTO activities (
          tenant_id, type, subject, description, date, 
          status, related_to, related_id, assigned_to, 
          created_by, created_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
        ) RETURNING *
      `;
      
      const values = [
        activity.tenant_id,
        activity.type || 'task',
        activity.subject,
        activity.description,
        activity.date || new Date().toISOString(),
        activity.status || 'pending',
        activity.related_to,
        activity.related_id,
        activity.assigned_to,
        activity.created_by
      ];
      
      const result = await pgPool.query(query, values);
      
      res.status(201).json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error creating activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // PUT /api/activities/:id - Update activity
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const activity = req.body;
      
      const query = `
        UPDATE activities SET
          type = COALESCE($1, type),
          subject = COALESCE($2, subject),
          description = COALESCE($3, description),
          date = COALESCE($4, date),
          status = COALESCE($5, status),
          related_to = COALESCE($6, related_to),
          related_id = COALESCE($7, related_id),
          assigned_to = COALESCE($8, assigned_to),
          updated_date = NOW()
        WHERE id = $9
        RETURNING *
      `;
      
      const values = [
        activity.type,
        activity.subject,
        activity.description,
        activity.date,
        activity.status,
        activity.related_to,
        activity.related_id,
        activity.assigned_to,
        id
      ];
      
      const result = await pgPool.query(query, values);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Activity not found'
        });
      }
      
      res.json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error updating activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/activities/:id - Delete activity
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pgPool.query('DELETE FROM activities WHERE id = $1 RETURNING *', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Activity not found'
        });
      }
      
      res.json({
        status: 'success',
        message: 'Activity deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
