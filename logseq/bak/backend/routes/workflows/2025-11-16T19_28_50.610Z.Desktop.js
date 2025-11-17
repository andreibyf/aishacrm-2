/**
 * Workflow Routes
 * CRUD operations for workflows and workflow executions
 */

import express from 'express';

export default function createWorkflowRoutes(pgPool) {
  const router = express.Router();

  // GET /api/workflows - List workflows
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0, is_active } = req.query;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      let query = 'SELECT * FROM workflow WHERE 1=1';
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
      let countQuery = 'SELECT COUNT(*) FROM workflow WHERE 1=1';
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
          workflows: result.rows,
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching workflows:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/workflows/:id - Get single workflow
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const result = await pgPool.query('SELECT * FROM workflow WHERE id = $1', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Workflow not found' });
      }

      res.json({ status: 'success', data: { workflow: result.rows[0] } });
    } catch (error) {
      console.error('Error fetching workflow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/workflows - Create workflow
  router.post('/', async (req, res) => {
    try {
      const workflow = req.body;

      if (!workflow.tenant_id || !workflow.name || !workflow.trigger_type) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'tenant_id, name, and trigger_type are required' 
        });
      }

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const query = `
        INSERT INTO workflow (
          tenant_id, name, description, trigger_type, trigger_config, 
          actions, is_active, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [
        workflow.tenant_id,
        workflow.name,
        workflow.description || null,
        workflow.trigger_type,
        JSON.stringify(workflow.trigger_config || {}),
        JSON.stringify(workflow.actions || []),
        workflow.is_active !== undefined ? workflow.is_active : true,
        JSON.stringify(workflow.metadata || {})
      ];

      const result = await pgPool.query(query, values);

      res.status(201).json({
        status: 'success',
        message: 'Workflow created successfully',
        data: { workflow: result.rows[0] }
      });
    } catch (error) {
      console.error('Error creating workflow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/workflows/:id - Update workflow
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const allowedFields = ['name', 'description', 'trigger_type', 'trigger_config', 'actions', 'is_active', 'metadata'];
      const setStatements = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key)) {
          if (key === 'trigger_config' || key === 'actions' || key === 'metadata') {
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
        UPDATE workflow 
        SET ${setStatements.join(', ')} 
        WHERE id = $${paramCount} 
        RETURNING *
      `;

      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Workflow not found' });
      }

      res.json({
        status: 'success',
        message: 'Workflow updated successfully',
        data: { workflow: result.rows[0] }
      });
    } catch (error) {
      console.error('Error updating workflow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/workflows/:id - Delete workflow
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const result = await pgPool.query('DELETE FROM workflow WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Workflow not found' });
      }

      res.json({
        status: 'success',
        message: 'Workflow deleted successfully',
        data: { id: result.rows[0].id }
      });
    } catch (error) {
      console.error('Error deleting workflow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/workflows/execute - Execute workflow
  router.post('/execute', async (req, res) => {
    try {
      const { workflow_id, input_data } = req.body;

      res.json({
        status: 'success',
        message: 'Workflow execution initiated',
        data: { workflow_id, input_data },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
