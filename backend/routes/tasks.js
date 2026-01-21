import express from 'express';
import { taskQueue } from '../services/taskQueue.js';
import { emitTaskEnqueued } from '../lib/telemetry/index.js';
import { randomUUID } from 'crypto';

export function createTasksRoutes(pgPool) {
  const router = express.Router();

  router.post('/from-intent', async (req, res) => {
    try {
      const { description, entity_type, entity_id, tenant_id, related_data } = req.body;
      
      // Validate required fields
      if (!tenant_id) {
        return res.status(400).json({ 
          error: 'tenant_id is required for task creation',
          hint: 'Ensure a tenant is selected before creating tasks'
        });
      }
      if (!description) {
        return res.status(400).json({ error: 'description is required' });
      }
      
      const taskId = randomUUID();
      const runId = randomUUID(); // Use run_id for correlation

      // 1. Persist task
      // Note: Using pgPool which might be the Supabase wrapper
      await pgPool.query(
        `INSERT INTO tasks (id, tenant_id, description, status, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        [taskId, tenant_id, description, 'PENDING', entity_type, entity_id]
      );

      // 2. Emit task_enqueued
      emitTaskEnqueued({
        run_id: runId,
        trace_id: runId,
        span_id: randomUUID(),
        tenant_id,
        task_id: taskId,
        input_summary: description,
        agent_name: 'System'
      });

      // 3. Enqueue Ops Dispatch - include related_data from frontend
      await taskQueue.add('ops-dispatch', {
        task_id: taskId,
        run_id: runId,
        tenant_id,
        description,
        entity_type,
        entity_id,
        related_data // opportunities, activities, notes from profile page
      });

      res.json({ ok: true, task_id: taskId, run_id: runId });
    } catch (err) {
      console.error('Error creating task:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pgPool.query(
        `SELECT * FROM tasks WHERE id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching task:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
