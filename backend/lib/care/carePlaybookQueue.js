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

// Rate limiter configuration - prevents CPU overload when many workflows trigger at once
// Default: max 10 concurrent executions per 60 seconds (adjustable via env vars)
const RATE_LIMIT_MAX = parseInt(process.env.CARE_RATE_LIMIT_MAX || '10', 10);
const RATE_LIMIT_DURATION = parseInt(process.env.CARE_RATE_LIMIT_DURATION || '60000', 10);

logger.debug('[PlaybookQueue] Initializing playbook execution queue with Redis:', REDIS_URL);
logger.debug(`[PlaybookQueue] Rate limit: max ${RATE_LIMIT_MAX} jobs per ${RATE_LIMIT_DURATION}ms`);

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
  limiter: {
    max: RATE_LIMIT_MAX, // Max concurrent jobs
    duration: RATE_LIMIT_DURATION, // Time window in ms
    bounceBack: false, // Don't retry immediately if rate limited
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

// Prevent unhandled 'error' events (e.g. Redis connection failures) from
// crashing the process. The Bull queue will reconnect automatically.
playbookQueue.on('error', (err) => {
  logger.error({ err: err.message }, '[PlaybookQueue] Queue error (Redis connection)');
});

logger.debug('[PlaybookQueue] Queue initialized');

export default playbookQueue;
