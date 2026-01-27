import express from 'express';
import logger from '../lib/logger.js';

export default function createWorkflowExecutionRoutes(pgPool) {
  const router = express.Router();

  // GET /api/workflowexecutions - List executions with optional filters
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, workflow_id, action_origin, limit = 50, offset = 0, order = '-created_at' } = req.query;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const params = [];
      let where = 'WHERE 1=1';

      if (tenant_id) { params.push(tenant_id); where += ` AND tenant_id = $${params.length}`; }
      if (workflow_id) { params.push(workflow_id); where += ` AND workflow_id = $${params.length}`; }
      if (action_origin) { params.push(action_origin); where += ` AND trigger_data->>'action_origin' = $${params.length}`; }

      const orderClause = String(order).startsWith('-') ? `${String(order).slice(1)} DESC` : `${order} ASC`;

      params.push(parseInt(limit));
      params.push(parseInt(offset));
      const query = `SELECT * FROM workflow_execution ${where} ORDER BY ${orderClause} LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const result = await pgPool.query(query, params);

      // Count
      const countRes = await pgPool.query(`SELECT COUNT(*) FROM workflow_execution ${where}`, params.slice(0, params.length - 2));

      res.json({
        status: 'success',
        data: {
          workflowexecutions: result.rows,
          total: parseInt(countRes.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      logger.error('Error listing workflow executions:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
