import { initMemoryClient as initMemory, isMemoryAvailable, getMemoryClient } from '../lib/memoryClient.js';
import cacheManager from '../lib/cacheManager.js';
import { initializePerformanceLogBatcher } from '../lib/perfLogBatcher.js';
import { pool as perfLogPool } from '../lib/supabase-db.js';

export async function initServices(app, pgPool) {
  // Initialize Redis/Valkey memory client (non-blocking for app startup)
  try {
    const memClient = await initMemory(process.env.REDIS_URL);
    // Attach to app.locals immediately after initialization
    if (memClient) {
      app.locals.memoryClient = memClient;
      console.log(`✓ Memory layer available (${process.env.REDIS_URL})`);
    } else {
      console.log(`✓ Memory layer unavailable (${process.env.REDIS_URL ? 'configured but failed to connect' : 'no REDIS_URL'})`);
    }
  } catch (e) {
    console.warn('⚠ Memory client init skipped/failed:', e?.message || e);
  }

  // Initialize Redis cache for API responses (non-blocking)
  try {
    await cacheManager.connect();
    console.log(`✓ API cache layer connected (${process.env.REDIS_CACHE_URL || 'redis://localhost:6380'})`);
    app.locals.cacheManager = cacheManager;
  } catch (e) {
    console.warn('⚠ API cache init skipped/failed:', e?.message || e);
  }

  // Use Supabase client wrapper for performance logging (replaces direct pg.Pool)
  // This ensures consistency with ESLint policy while maintaining performance logging capability
  if (pgPool) {
    console.log("✓ Performance logging enabled via Supabase pool wrapper");
    // Initialize batching layer (uses Supabase client via supabase-db)
    try {
      initializePerformanceLogBatcher(pgPool);
    } catch (e) {
      console.error('[Server] Failed to init performance log batcher:', e.message);
    }
    // Test connection
    const testPerfPool = async () => {
      try {
        await perfLogPool.query('SELECT 1');
        console.log("✓ Performance logging pool connection verified");
      } catch (err) {
        console.error("✗ Performance logging pool connection failed:", err.message);
      }
    };
    testPerfPool();
  }
}
