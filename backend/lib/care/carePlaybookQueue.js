/**
 * C.A.R.E. Playbook Executor Queue
 *
 * Bull queue for processing playbook execution steps.
 * Handles immediate steps and delayed steps (re-queued with delay).
 *
 * Two job types:
 *   'execute-playbook'   — Start a new playbook execution (all immediate steps)
 *   'execute-step'       — Resume a delayed step
 *
 * @module carePlaybookQueue
 */

import Bull from 'bull';
import logger from '../logger.js';

const REDIS_URL =
  process.env.REDIS_MEMORY_URL || process.env.REDIS_URL || 'redis://redis-memory:6379';

logger.debug('[PlaybookQueue] Initializing playbook execution queue with Redis:', REDIS_URL);

export const playbookQueue = new Bull('care-playbook-execution', REDIS_URL, {
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
  settings: {
    lockDuration: 60000, // 60s lock (steps may involve external API calls)
    lockRenewTime: 30000,
    stalledInterval: 60000,
    maxStalledCount: 1,
  },
});

// Processor: wired in carePlaybookExecutor.js via dynamic import to avoid circular deps
// See initPlaybookQueueProcessor() in carePlaybookExecutor.js

// Event listeners
playbookQueue.on('completed', (job, result) => {
  logger.debug(
    {
      jobId: job.id,
      jobName: job.name,
      executionId: result?.executionId,
    },
    '[PlaybookQueue] Job completed',
  );
});

playbookQueue.on('failed', (job, err) => {
  logger.error(
    {
      jobId: job.id,
      jobName: job.name,
      executionId: job.data?.executionId,
      error: err.message,
      attempts: job.attemptsMade,
    },
    '[PlaybookQueue] Job failed',
  );
});

playbookQueue.on('stalled', (job) => {
  logger.warn(
    {
      jobId: job.id,
      jobName: job.name,
      executionId: job.data?.executionId,
    },
    '[PlaybookQueue] Job stalled',
  );
});

logger.debug('[PlaybookQueue] Queue initialized');

export default playbookQueue;
