/**
 * Standalone task-worker entry point — HP Omen AI Server
 *
 * Starts Bull task workers WITHOUT launching the Express HTTP server.
 * All AI compute (LLM calls via LiteLLM, Braid tool execution against Supabase)
 * runs here; the CRM backend (local / staging / prod) only enqueues jobs.
 *
 * Required env vars (set via Doppler per environment):
 *   APP_ENV                  — dev | staging | prd  (queue name suffix)
 *   TASK_QUEUE_REDIS_URL     — redis://localhost:6381 (HP Omen task Redis)
 *   SUPABASE_URL             — Supabase project URL for this environment
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key
 *   LITELLM_ENABLED          — true
 *   LITELLM_BASE_URL         — http://localhost:4000 (HP Omen LiteLLM)
 *   LITELLM_MASTER_KEY       — LiteLLM master key
 *
 * Usage (direct):
 *   APP_ENV=dev node backend/workers/worker-entry.js
 *
 * Usage (via PM2 ecosystem.config.cjs):
 *   pm2 start ecosystem.config.cjs
 *
 * Usage (via Doppler):
 *   doppler run --config=dev -- node backend/workers/worker-entry.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

// Load per-env file first (.env.dev / .env.staging / .env.prd), then fall back to .env
const appEnv = process.env.APP_ENV || 'dev';
dotenv.config({ path: path.join(repoRoot, `.env.${appEnv}`) });
dotenv.config({ path: path.join(repoRoot, 'backend', `.env.${appEnv}`) });
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'backend', '.env') });

// Import after env is loaded
import logger from '../lib/logger.js';
import { startTaskWorkers } from './taskWorkers.js';
import { taskQueue } from '../services/taskQueue.js';

const ENV = process.env.APP_ENV || 'dev';
const REDIS = process.env.TASK_QUEUE_REDIS_URL || '(fallback)';
const LITELLM = process.env.LITELLM_BASE_URL || '(not set)';
const SUPABASE = process.env.SUPABASE_URL
  ? process.env.SUPABASE_URL.slice(0, 40) + '…'
  : '(not set)';

logger.info('[WorkerEntry] ============================================');
logger.info(`[WorkerEntry]  AiSHA Task Worker — ${ENV.toUpperCase()}`);
logger.info(`[WorkerEntry]  Redis  : ${REDIS}`);
logger.info(`[WorkerEntry]  LiteLLM: ${LITELLM}`);
logger.info(`[WorkerEntry]  Supabase: ${SUPABASE}`);
logger.info('[WorkerEntry] ============================================');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  logger.error('[WorkerEntry] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — aborting');
  process.exit(1);
}

if (!process.env.LITELLM_BASE_URL) {
  logger.warn(
    '[WorkerEntry] LITELLM_BASE_URL not set — task LLM calls will use direct provider fallback',
  );
}

startTaskWorkers();
logger.info('[WorkerEntry] Task workers registered — waiting for jobs');

// Graceful shutdown: let in-flight jobs complete before exiting
async function shutdown(signal) {
  logger.info(`[WorkerEntry] ${signal} received — draining queue`);
  try {
    await taskQueue.close();
    logger.info('[WorkerEntry] Queue drained — exiting');
  } catch (err) {
    logger.error('[WorkerEntry] Error during shutdown:', err.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep process alive (Bull workers are event-driven)
process.on('uncaughtException', (err) => {
  logger.error('[WorkerEntry] Uncaught exception:', err);
  // Don't exit — keep the worker running unless it's a fatal startup error
});

process.on('unhandledRejection', (reason) => {
  logger.error('[WorkerEntry] Unhandled rejection:', reason);
});
