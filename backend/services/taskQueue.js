import Bull from 'bull';
import logger from '../lib/logger.js';

const REDIS_URL = process.env.REDIS_MEMORY_URL || process.env.REDIS_URL || 'redis://redis-memory:6379';

logger.debug('[TaskQueue] Initializing task execution queue with Redis:', REDIS_URL);

export const taskQueue = new Bull('task-execution', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 200
  }
});

// Event listeners
taskQueue.on('completed', (job, result) => {
  logger.debug(`[TaskQueue] ✓ Job ${job.id} completed:`, result);
});

taskQueue.on('failed', (job, err) => {
  logger.error(`[TaskQueue] ✗ Job ${job.id} failed:`, err.message);
});

export default taskQueue;
