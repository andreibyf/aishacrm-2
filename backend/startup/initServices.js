import { initMemoryClient as initMemory, isMemoryAvailable, getMemoryClient } from '../lib/memoryClient.js';
import cacheManager from '../lib/cacheManager.js';
import { initializePerformanceLogBatcher } from '../lib/perfLogBatcher.js';
import { pool as perfLogPool } from '../lib/supabase-db.js';

export async function initServices(app, pgPool) {
  // Initialize Redis/Valkey memory client (non-blocking for app startup)
  try {
    await initMemory(process.env.REDIS_URL);
    console.log(`✓ Memory layer ${isMemoryAvailable() ? 'available' : 'unavailable'} (${process.env.REDIS_URL ? 'configured' : 'no REDIS_URL'})`);
    // Expose memory client for diagnostics/probes (e.g., containers-status)
    try {
      const client = getMemoryClient();
      if (client) {
        // Attach to app.locals for lightweight reachability checks
        app.locals.memoryClient = client;
      }
    } catch {
      // getMemoryClient throws when unavailable; leave unset
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
