import Bull from 'bull';
import logger from '../lib/logger.js';

// TASK_QUEUE_REDIS_URL: points at the shared HP Omen Redis when workers run
// on the AI server. Falls back to local redis-memory for standalone dev.
const REDIS_URL =
  process.env.TASK_QUEUE_REDIS_URL ||
  process.env.REDIS_MEMORY_URL ||
  process.env.REDIS_URL ||
  'redis://redis-memory:6379';

// APP_ENV suffixes the queue name so all three CRM environments (dev / staging / prd)
// can share one Redis on the HP Omen without cross-contaminating each other's jobs.
const APP_ENV = process.env.APP_ENV || 'dev';
const QUEUE_NAME = `task-execution:${APP_ENV}`;

// INFO (not debug) so the queue's Redis target is visible in staging/prod deploy
// logs — confirms whether tasks are queued on the backend's own Redis vs elsewhere.
logger.info(`[TaskQueue] Initializing ${QUEUE_NAME} with Redis: ${REDIS_URL}`);

export const taskQueue = new Bull(QUEUE_NAME, REDIS_URL, {
  defaultJobOptions: {
    attempts: 1, // No retries — prevents task repetition on failure
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// Event listeners
taskQueue.on('completed', (job, result) => {
  logger.debug(`[TaskQueue] ✓ Job ${job.id} completed:`, result);
});

taskQueue.on('failed', (job, err) => {
  logger.error(`[TaskQueue] ✗ Job ${job.id} failed:`, err.message);
});

export default taskQueue;
