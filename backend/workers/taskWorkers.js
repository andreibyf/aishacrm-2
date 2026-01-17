import { taskQueue } from '../services/taskQueue.js';
import { emitTaskAssigned, emitRunStarted, emitRunFinished, emitTaskCompleted } from '../lib/telemetry/index.js';
import { randomUUID } from 'crypto';
import logger from '../lib/logger.js';

export function startTaskWorkers(pgPool) {
  logger.info('[TaskWorkers] Starting Ops Dispatch and Execute workers');

  // Ops Dispatch Worker
  taskQueue.process('ops-dispatch', 1, async (job) => {
    const { task_id, run_id, tenant_id, description, entity_type, entity_id } = job.data;
    logger.info(`[OpsDispatch] Processing task ${task_id}`);

    try {
      // 1. Determine Assignee
      let assignee = 'ops_manager:dev'; // Default
      if (description.toLowerCase().includes('sales')) assignee = 'sales_manager:dev';
      if (description.toLowerCase().includes('marketing')) assignee = 'marketing_manager:dev';
      if (description.toLowerCase().includes('support')) assignee = 'customer_service_manager:dev';
      if (description.toLowerCase().includes('project')) assignee = 'project_manager:dev';

      // 2. Update Task
      await pgPool.query(
        `UPDATE tasks SET status = 'ASSIGNED', assigned_to = $1, updated_at = NOW() WHERE id = $2`,
        [assignee, task_id]
      );

      // 3. Emit task_assigned
      emitTaskAssigned({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id,
        task_id,
        to_agent_id: assignee,
        agent_id: 'ops_manager:dev', // Dispatcher
        queue: 'primary',
        reason: 'Intent routing'
      });

      // 4. Enqueue Execute
      await taskQueue.add('execute-task', {
        task_id,
        run_id,
        tenant_id,
        assignee,
        description,
        entity_type,
        entity_id
      });

      return { status: 'assigned', assignee };
    } catch (err) {
      logger.error(`[OpsDispatch] Error: ${err.message}`);
      throw err;
    }
  });

  // Execute Worker
  taskQueue.process('execute-task', 1, async (job) => {
    const { task_id, run_id, tenant_id, assignee, description, entity_type, entity_id } = job.data;
    logger.info(`[ExecuteTask] Agent ${assignee} executing task ${task_id}`);

    try {
      // 1. Emit run_started
      emitRunStarted({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id,
        agent_id: assignee,
        entrypoint: 'worker',
        input_summary: description
      });

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. Create Artifact (Note)
      if (entity_type && entity_id) {
        try {
           // Attempt to insert note. Table schema assumed standard.
           // If fails, we log and continue.
           await pgPool.query(
             `INSERT INTO notes (tenant_id, entity_type, entity_id, content, created_by) VALUES ($1, $2, $3, $4, $5)`,
             [tenant_id, entity_type, entity_id, `[AiSHA] Executed: ${description}`, assignee]
           );
        } catch (e) {
           logger.warn(`[ExecuteTask] Failed to create note: ${e.message}`);
        }
      }

      // 3. Emit run_completed / task_completed
      emitRunFinished({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id,
        agent_id: assignee,
        status: 'success',
        output_summary: 'Task completed successfully'
      });

      emitTaskCompleted({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id,
        agent_id: assignee,
        task_id,
        summary: 'Done'
      });

      // 4. Update Task
      await pgPool.query(
        `UPDATE tasks SET status = 'COMPLETED', result = 'Success', updated_at = NOW() WHERE id = $1`,
        [task_id]
      );

      return { status: 'completed' };
    } catch (err) {
      logger.error(`[ExecuteTask] Error: ${err.message}`);
      throw err;
    }
  });
}
