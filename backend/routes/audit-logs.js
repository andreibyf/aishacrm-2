import express from 'express';

export default function createAuditLogRoutes(pgPool) {
  const router = express.Router();

  // POST /api/audit-logs - Create audit log entry
  router.post('/', async (req, res) => {
    try {
      const log = req.body;
      
      const query = `
        INSERT INTO audit_log (
          tenant_id, user_email, action, entity_type, entity_id,
          changes, ip_address, user_agent, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW()
        ) RETURNING *
      `;
      
      const values = [
        log.tenant_id,
        log.user_email,
        log.action,
        log.entity_type,
        log.entity_id,
        JSON.stringify(log.changes || {}),
        log.ip_address,
        log.user_agent
      ];
      
      const result = await pgPool.query(query, values);
      
      res.status(201).json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error creating audit log:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/audit-logs - List audit logs
  router.get('/', async (req, res) => {
    try {
      const { 
        tenant_id, 
        user_email, 
        action, 
        entity_type, 
        entity_id,
        limit = 100, 
        offset = 0 
      } = req.query;

      let query = 'SELECT * FROM audit_log WHERE 1=1';
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

      if (action) {
        query += ` AND action = $${valueIndex}`;
        values.push(action);
        valueIndex++;
      }

      if (entity_type) {
        query += ` AND entity_type = $${valueIndex}`;
        values.push(entity_type);
        valueIndex++;
      }

      if (entity_id) {
        query += ` AND entity_id = $${valueIndex}`;
        values.push(entity_id);
        valueIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${valueIndex} OFFSET $${valueIndex + 1}`;
      values.push(parseInt(limit), parseInt(offset));
      
      const result = await pgPool.query(query, values);
      
      res.json({
        status: 'success',
        data: {
          'audit-logs': result.rows,
          total: result.rows.length,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/audit-logs/:id - Get specific audit log (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const query = 'SELECT * FROM audit_log WHERE tenant_id = $1 AND id = $2 LIMIT 1';
      const values = [tenant_id, id];

      const result = await pgPool.query(query, values);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Audit log not found'
        });
      }
      
      // Safety check
      if (result.rows[0].tenant_id !== tenant_id) {
        return res.status(404).json({ status: 'error', message: 'Audit log not found' });
      }

      res.json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error fetching audit log:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/audit-logs/:id - Delete a specific audit log
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;
      
      let query = 'DELETE FROM audit_log WHERE id = $1';
      const values = [id];

      if (tenant_id) {
        query += ' AND tenant_id = $2';
        values.push(tenant_id);
      }

      query += ' RETURNING *';
      const result = await pgPool.query(query, values);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Audit log not found'
        });
      }
      
      res.json({
        status: 'success',
        message: 'Audit log deleted',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error deleting audit log:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/audit-logs - Clear audit logs (with filters)
  router.delete('/', async (req, res) => {
    try {
      const { tenant_id, user_email, entity_type, older_than_days } = req.query;

      let query = 'DELETE FROM audit_log WHERE 1=1';
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

      if (entity_type) {
        query += ` AND entity_type = $${valueIndex}`;
        values.push(entity_type);
        valueIndex++;
      }

      if (older_than_days) {
        query += ` AND created_at < NOW() - INTERVAL '${parseInt(older_than_days)} days'`;
      }

      query += ' RETURNING *';
      
      const result = await pgPool.query(query, values);
      
      res.json({
        status: 'success',
        message: `Deleted ${result.rows.length} audit log(s)`,
        data: {
          deleted_count: result.rows.length
        }
      });
    } catch (error) {
      console.error('Error clearing audit logs:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
