import express from 'express';

export default function createSystemLogRoutes(pgPool) {
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

  // POST /api/system-logs - Create system log entry
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, level, message, source, user_email, metadata, user_agent, url, stack_trace, ...otherFields } = req.body;
      
      // Merge metadata with unknown fields
      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields
      };
      
      // Use created_at instead of created_date for compatibility
      const query = `
        INSERT INTO system_logs (
          tenant_id, level, message, source, user_email, 
          metadata, user_agent, url, stack_trace, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        ) RETURNING *
      `;
      
      const values = [
        tenant_id,
        level || 'INFO',
        message,
        source,
        user_email,
        JSON.stringify(combinedMetadata),  // Ensure metadata is stringified
        user_agent,
        url,
        stack_trace
      ];
      
      const result = await pgPool.query(query, values);
      
      const systemLog = expandMetadata(result.rows[0]);
      
      res.status(201).json({
        status: 'success',
        data: systemLog
      });
    } catch (error) {
      console.error('Error creating system log:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/system-logs - List system logs
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, level, limit = 100, offset = 0 } = req.query;

      let query = 'SELECT * FROM system_logs WHERE 1=1';
      const values = [];
      let valueIndex = 1;

      if (tenant_id) {
        query += ` AND tenant_id = $${valueIndex}`;
        values.push(tenant_id);
        valueIndex++;
      }

      if (level) {
        query += ` AND level = $${valueIndex}`;
        values.push(level);
        valueIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${valueIndex} OFFSET $${valueIndex + 1}`;
      values.push(parseInt(limit), parseInt(offset));
      
      const result = await pgPool.query(query, values);
      
      const systemLogs = result.rows.map(expandMetadata);
      
      res.json({
        status: 'success',
        data: {
          'system-logs': systemLogs,
          total: result.rows.length,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching system logs:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/system-logs/:id - Delete a specific system log
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = 'DELETE FROM system_logs WHERE id = $1 RETURNING *';
      const result = await pgPool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'System log not found'
        });
      }
      
      res.json({
        status: 'success',
        message: 'System log deleted',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error deleting system log:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/system-logs - Clear all system logs (with optional filters)
  router.delete('/', async (req, res) => {
    try {
      const { tenant_id, level, older_than_days } = req.query;

      let query = 'DELETE FROM system_logs WHERE 1=1';
      const values = [];
      let valueIndex = 1;

      if (tenant_id) {
        query += ` AND tenant_id = $${valueIndex}`;
        values.push(tenant_id);
        valueIndex++;
      }

      if (level) {
        query += ` AND level = $${valueIndex}`;
        values.push(level);
        valueIndex++;
      }

      if (older_than_days) {
        query += ` AND created_at < NOW() - INTERVAL '${parseInt(older_than_days)} days'`;
      }

      query += ' RETURNING *';
      
      const result = await pgPool.query(query, values);
      
      res.json({
        status: 'success',
        message: `Deleted ${result.rows.length} system log(s)`,
        data: {
          deleted_count: result.rows.length
        }
      });
    } catch (error) {
      console.error('Error clearing system logs:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
