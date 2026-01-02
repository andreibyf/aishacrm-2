import { initMemoryClient as initMemory } from '../lib/memoryClient.js';
import cacheManager from '../lib/cacheManager.js';
import { initializePerformanceLogBatcher } from '../lib/perfLogBatcher.js';
import { pool as perfLogPool } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

export async function initServices(app, pgPool) {
  // Initialize Redis/Valkey memory client (non-blocking for app startup)
  try {
    const memClient = await initMemory(process.env.REDIS_MEMORY_URL || process.env.REDIS_URL);
    // Attach to app.locals immediately after initialization
    if (memClient) {
      app.locals.memoryClient = memClient;
      logger.info({ redisUrl: process.env.REDIS_MEMORY_URL || process.env.REDIS_URL }, 'Memory layer available');
    } else {
      logger.info({ redisUrl: process.env.REDIS_MEMORY_URL || process.env.REDIS_URL }, 'Memory layer unavailable');
    }
  } catch (e) {
    logger.warn({ err: e }, 'Memory client init skipped/failed');
  }

  // Initialize Redis cache for API responses (non-blocking)
  try {
    await cacheManager.connect();
    logger.info({ redisUrl: process.env.REDIS_CACHE_URL || 'redis://localhost:6380' }, 'API cache layer connected');
    app.locals.cacheManager = cacheManager;

    // In development mode, flush cache on startup to avoid stale data after code changes
    if (process.env.NODE_ENV === 'development' || process.env.FLUSH_CACHE_ON_STARTUP === 'true') {
      try {
        await cacheManager.flushAll();
        logger.info('API cache flushed on startup (dev mode)');
      } catch (flushErr) {
        logger.warn({ err: flushErr }, 'Failed to flush cache on startup');
      }
    }
  } catch (e) {
    logger.warn({ err: e }, 'API cache init skipped/failed');
  }

  // Use Supabase client wrapper for performance logging (replaces direct pg.Pool)
  // This ensures consistency with ESLint policy while maintaining performance logging capability
  if (pgPool) {
    logger.info('Performance logging enabled via Supabase pool wrapper');
    // Initialize batching layer (uses Supabase client via supabase-db)
    try {
      initializePerformanceLogBatcher(pgPool);
    } catch (e) {
      logger.error({ err: e }, 'Failed to init performance log batcher');
    }
    // Test connection
    const testPerfPool = async () => {
      try {
        await perfLogPool.query('SELECT 1');
        logger.info('Performance logging pool connection verified');
      } catch (err) {
        logger.error({ err }, 'Performance logging pool connection failed');
      }
    };
    testPerfPool();
  }
}
