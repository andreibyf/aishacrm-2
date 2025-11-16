import express from 'express';

export default function createActivityRoutes(pgPool) {
  const router = express.Router();

  // Helper to merge metadata and expose UI-friendly fields
  function normalizeActivity(row) {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    // Map body -> description for the UI and spread metadata back to top-level (non-destructive)
    return {
      ...row,
      description: row.body ?? meta.description ?? null,
      ...meta,
    };
  }

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
          activities: result.rows.map(normalizeActivity),
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
        data: normalizeActivity(result.rows[0])
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

      // Map to schema + new columns; keep remaining fields in metadata for forward compatibility
      const bodyText = activity.description ?? activity.body ?? null;
      const {
        tenant_id,
        type,
        subject,
        status,
        related_id,
        created_by,
        location,
        priority,
        due_date,
        due_time,
        assigned_to,
        related_to,
        // everything else to metadata
        ...rest
      } = activity || {};

      const meta = { ...rest, description: bodyText };

      const query = `
        INSERT INTO activities (
          tenant_id, type, subject, body, status, related_id,
          created_by, location, priority, due_date, due_time,
          assigned_to, related_to, metadata, created_date, updated_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, NOW(), NOW()
        ) RETURNING *
      `;

      const values = [
        tenant_id,
        (type || 'task'),
        subject || null,
        bodyText,
        (status || 'pending'),
        related_id || null,
        created_by || null,
        location || null,
        priority || null,
        due_date || null,
        due_time || null,
        assigned_to || null,
        related_to || null,
        JSON.stringify(meta)
      ];
      
      const result = await pgPool.query(query, values);
      
      res.status(201).json({
        status: 'success',
        data: normalizeActivity(result.rows[0])
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
  const payload = req.body || {};

      // Separate known columns and extra metadata
      const bodyText = payload.description ?? payload.body ?? null;
      const known = {
        type: payload.type,
        subject: payload.subject,
        body: bodyText,
        status: payload.status,
        related_id: payload.related_id ?? null,
        created_by: payload.created_by ?? null,
        location: payload.location ?? null,
        priority: payload.priority ?? null,
        due_date: payload.due_date ?? null,
        due_time: payload.due_time ?? null,
        assigned_to: payload.assigned_to ?? null,
        related_to: payload.related_to ?? null,
      };
      const { type, subject, body, status, related_id, created_by, location, priority, due_date, due_time, assigned_to, related_to } = known;

      // Merge metadata: load current row's metadata and shallow-merge with incoming extras
      const current = await pgPool.query('SELECT metadata FROM activities WHERE id = $1', [id]);
      const currentMeta = current.rows[0]?.metadata && typeof current.rows[0].metadata === 'object' ? current.rows[0].metadata : {};
      const { tenant_id: _t, description: _d, body: _b, ...extras } = payload; // do not allow tenant change; description/body handled explicitly
      const newMeta = { ...currentMeta, ...extras, description: bodyText };

      const query = `
        UPDATE activities SET
          type = COALESCE($1, type),
          subject = COALESCE($2, subject),
          body = COALESCE($3, body),
          status = COALESCE($4, status),
          related_id = COALESCE($5, related_id),
          created_by = COALESCE($6, created_by),
          location = COALESCE($7, location),
          priority = COALESCE($8, priority),
          due_date = COALESCE($9, due_date),
          due_time = COALESCE($10, due_time),
          assigned_to = COALESCE($11, assigned_to),
          related_to = COALESCE($12, related_to),
          metadata = COALESCE($13, metadata),
          updated_date = NOW()
        WHERE id = $14
        RETURNING *
      `;

      const values = [
        type,
        subject,
        body,
        status,
        related_id,
        created_by,
        location,
        priority,
        due_date,
        due_time,
        assigned_to,
        related_to,
        JSON.stringify(newMeta),
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
        data: normalizeActivity(result.rows[0])
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
