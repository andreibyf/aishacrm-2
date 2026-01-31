/**
 * Task Queue Processor
 * 
 * Processes tasks enqueued by agent-office endpoints.
 * Tasks are executed by invoking Braid tools with the assigned agent's profile.
 */

import logger from '../lib/logger.js';
import { taskQueue } from './taskQueue.js';
import { getAgentProfile } from '../lib/agents/agentRegistry.js';
import { invokeBraidTool } from '../lib/braidIntegration-v2.js';
import { 
  emitTaskStarted, 
  emitTaskCompleted, 
  emitTaskFailed 
} from '../lib/telemetry/index.js';

/**
 * Process a single task
 * @param {Object} job - Bull job object
 */
async function processTask(job) {
  const { task_id, run_id, tenant_id, assignee, description, context } = job.data;
  
  logger.info(`[TaskProcessor] Processing task ${task_id} for ${assignee}`);
  
  // Extract role from assignee (e.g., "sales_manager:dev" -> "sales_manager")
  const role = assignee.split(':')[0];
  
  try {
    // Get agent profile
    const agent = await getAgentProfile({ tenant_id, role });
    
    // Emit task_started
    emitTaskStarted({
      run_id,
      trace_id: run_id,
      span_id: task_id,
      parent_span_id: run_id,
      tenant_id,
      agent_id: agent.id,
      task_id,
      input_summary: description?.slice(0, 200) || 'Task',
    });
    
    // For now, log the task (actual execution would invoke Braid tools based on agent's tool_allowlist)
    logger.debug(`[TaskProcessor] Agent ${agent.display_name} would process:`, description);
    logger.debug(`[TaskProcessor] Available tools:`, agent.tool_allowlist);
    
    // TODO: Invoke actual Braid tool execution based on task description
    // This would use intent classification to determine which tool(s) to call
    // For example:
    // if (description.includes('create lead')) {
    //   await invokeBraidTool('create_lead', params, tenant_id);
    // }
    
    const result = {
      task_id,
      status: 'completed',
      agent_id: agent.id,
      agent_role: agent.role,
      message: `Task processed by ${agent.display_name}`,
      // In a full implementation, this would contain actual tool execution results
      details: {
        description,
        context,
        tools_available: agent.tool_allowlist.length,
      }
    };
    
    // Emit task_completed
    emitTaskCompleted({
      run_id,
      trace_id: run_id,
      span_id: task_id,
      parent_span_id: run_id,
      tenant_id,
      agent_id: agent.id,
      task_id,
      status: 'success',
      result_summary: 'Task completed successfully',
    });
    
    logger.info(`[TaskProcessor] ✓ Task ${task_id} completed by ${agent.display_name}`);
    
    return result;
    
  } catch (error) {
    logger.error(`[TaskProcessor] ✗ Task ${task_id} failed:`, error.message);
    
    // Emit task_failed
    emitTaskFailed({
      run_id,
      trace_id: run_id,
      span_id: task_id,
      parent_span_id: run_id,
      tenant_id,
      agent_id: `${role}:${process.env.NODE_ENV || 'dev'}`,
      task_id,
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });
    
    throw error;
  }
}

/**
 * Register task processor with Bull queue
 */
export function registerTaskProcessor() {
  logger.info('[TaskProcessor] Registering task queue processor');
  
  taskQueue.process('execute-task', async (job) => {
    return await processTask(job);
  });
  
  logger.info('[TaskProcessor] Task processor registered for "execute-task" jobs');
}

export default registerTaskProcessor;
