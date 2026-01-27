import Bull from 'bull';
import logger from '../lib/logger.js';

const REDIS_URL = process.env.REDIS_MEMORY_URL || process.env.REDIS_URL || 'redis://redis-memory:6379';

logger.debug('[WorkflowQueue] Initializing workflow execution queue with Redis:', REDIS_URL);

export const workflowQueue = new Bull('workflow-execution', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 200      // Keep last 200 failed jobs
  },
  settings: {
    lockDuration: 30000,      // 30 seconds lock (default is 30s)
    lockRenewTime: 15000,     // Renew lock every 15 seconds
    stalledInterval: 30000,   // Check for stalled jobs every 30s
    maxStalledCount: 1        // Only retry stalled jobs once
  }
});

// Job processor - imports from dedicated execution service
// Process jobs with the 'execute-workflow' name from webhook triggers
// Concurrency: 1 to prevent job overlap and stalling issues
workflowQueue.process('execute-workflow', 1, async (job) => {
  const { workflow_id, trigger_data } = job.data;
  const startTime = Date.now();
  
  logger.info(`[WorkflowQueue] 🚀 START job ${job.id} for workflow ${workflow_id} (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`);
  
  try {
    // Dynamic import to avoid circular dependency at module load time
    const { executeWorkflowById } = await import('./workflowExecutionService.js');
    const result = await executeWorkflowById(workflow_id, trigger_data);
    
    logger.info(`[WorkflowQueue] 📦 Result received for job ${job.id}:`, {
      status: result?.status,
      hasData: !!result?.data,
      resultKeys: Object.keys(result || {}),
      fullResult: result
    });
    
    if (result.status === 'error') {
      logger.error(`[WorkflowQueue] Workflow returned error status:`, {
        workflow_id,
        job_id: job.id,
        message: result.data?.message,
        error_data: result.data,
        full_result: JSON.stringify(result, null, 2)
      });
      throw new Error(result.data?.message || 'Workflow execution failed');
    }
    
    const duration = Date.now() - startTime;
    const returnData = {
      job_id: job.id,
      workflow_id,
      execution_id: result.data?.execution_id,
      duration_ms: duration,
      status: 'completed'
    };
    
    logger.info(`[WorkflowQueue] ✅ COMPLETE job ${job.id} in ${duration}ms - returning data`);
    
    // CRITICAL: Return Promise.resolve() with data to ensure Bull recognizes completion
    return Promise.resolve(returnData);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[WorkflowQueue] ❌ ERROR in job ${job.id} after ${duration}ms:`, {
      workflow_id,
      job_id: job.id,
      attempt: job.attemptsMade + 1,
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      error_string: String(error)
    });
    throw error; // Re-throw for Bull to handle retries
  }
});

// Event listeners for monitoring
workflowQueue.on('completed', (job, result) => {
  logger.debug(`[WorkflowQueue] ✓ Job ${job.id} completed:`, {
    workflow_id: job.data.workflow_id,
    execution_id: result.execution_id,
    duration_ms: result.duration_ms
  });
});

workflowQueue.on('failed', (job, err) => {
  logger.error(`[WorkflowQueue] ✗ Job ${job.id} failed:`, {
    workflow_id: job.data.workflow_id,
    error: err.message,
    attempts: job.attemptsMade,
    maxAttempts: job.opts.attempts
  });
});

workflowQueue.on('stalled', (job) => {
  logger.warn(`[WorkflowQueue] ⚠ Job ${job.id} STALLED (will retry)`, {
    workflow_id: job.data.workflow_id,
    attempt: job.attemptsMade,
    timestamp: new Date().toISOString()
  });
});

logger.debug('[WorkflowQueue] Queue initialized and ready to process jobs');

export default workflowQueue;
