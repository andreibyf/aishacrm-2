import Bull from 'bull';

const REDIS_URL = process.env.REDIS_MEMORY_URL || process.env.REDIS_URL || 'redis://redis-memory:6379';

console.log('[WorkflowQueue] Initializing workflow execution queue with Redis:', REDIS_URL);

export const workflowQueue = new Bull('workflow-execution', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 200      // Keep last 200 failed jobs
  }
});

// Job processor - imports from dedicated execution service
workflowQueue.process(async (job) => {
  const { workflow_id, trigger_data } = job.data;
  
  console.log(`[WorkflowQueue] Processing job ${job.id} for workflow ${workflow_id}`);
  
  // Import the execution function from dedicated service (avoids circular deps)
  const { executeWorkflowById } = await import('./workflowExecutionService.js');
  
  const result = await executeWorkflowById(workflow_id, trigger_data);
  
  if (result.status === 'error') {
    throw new Error(result.data?.message || 'Workflow execution failed');
  }
  
  console.log(`[WorkflowQueue] Job ${job.id} completed successfully:`, {
    execution_id: result.data?.execution_id,
    duration_ms: result.data?.duration_ms
  });
  
  return result.data;
});

// Event listeners for monitoring
workflowQueue.on('completed', (job, result) => {
  console.log(`[WorkflowQueue] ✓ Job ${job.id} completed:`, {
    workflow_id: job.data.workflow_id,
    execution_id: result.execution_id,
    duration_ms: result.duration_ms
  });
});

workflowQueue.on('failed', (job, err) => {
  console.error(`[WorkflowQueue] ✗ Job ${job.id} failed:`, {
    workflow_id: job.data.workflow_id,
    error: err.message,
    attempts: job.attemptsMade,
    maxAttempts: job.opts.attempts
  });
});

workflowQueue.on('stalled', (job) => {
  console.warn(`[WorkflowQueue] ⚠ Job ${job.id} stalled (may be retried)`);
});

console.log('[WorkflowQueue] Queue initialized and ready to process jobs');

export default workflowQueue;
