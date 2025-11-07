/**
 * Production Safety Guard Middleware
 * 
 * Prevents write operations (POST/PUT/PATCH/DELETE) against production/cloud 
 * databases unless explicitly allowed via environment variable or special header.
 * 
 * This protects production Supabase Cloud data from accidental mutations during 
 * E2E tests or development activities.
 * 
 * Usage:
 *   import { productionSafetyGuard } from '../middleware/productionSafetyGuard.js';
 *   
 *   // Apply globally in server.js (before routes):
 *   app.use(productionSafetyGuard());
 *   
 *   // Or per-route:
 *   router.post('/api/users', productionSafetyGuard(), async (req, res) => {...});
 * 
 * Configuration:
 *   - Set ALLOW_PRODUCTION_WRITES=true in .env to disable guard
 *   - Or send header: X-Allow-Production-Write: <secret-token>
 *   - Configure PRODUCTION_WRITE_TOKEN for header-based bypass
 */

/**
 * Helper to log security events to system_logs table
 * @param {Object} pgPool - PostgreSQL connection pool
 * @param {Object} details - Log details
 */
async function logSecurityEvent(pgPool, details) {
  if (!pgPool) return; // Skip if no database connection
  
  try {
    const query = `
      INSERT INTO system_logs (
        tenant_id, level, message, source, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, NOW()
      )
    `;
    
    const values = [
      'system', // Security events are system-level
      details.level || 'WARN',
      details.message,
      'productionSafetyGuard',
      JSON.stringify({
        method: details.method,
        path: details.path,
        bypass_method: details.bypass_method,
        ip: details.ip,
        user_agent: details.user_agent,
      }),
    ];
    
    await pgPool.query(query, values);
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('Failed to log security event:', error.message);
  }
}

/**
 * Detects if the current database is a production/cloud instance
 * @returns {boolean} True if connected to a production database
 */
function isProductionDatabase() {
  const dbUrl = process.env.DATABASE_URL || '';
  
  // Check for Supabase Cloud patterns
  const isSupabaseCloud = 
    dbUrl.includes('.supabase.co') || 
    dbUrl.includes('supabase.com') ||
    dbUrl.includes('db.supabase.io');
  
  // Check for explicit production flag
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Check for Render.com or other cloud platforms
  const isRenderCloud = 
    process.env.RENDER === 'true' || 
    process.env.RENDER_EXTERNAL_HOSTNAME;
  
  return isSupabaseCloud || isRenderCloud || (isProduction && !dbUrl.includes('localhost'));
}

/**
 * Middleware that blocks write operations on production databases
 * 
 * @param {Object} [opts] - Configuration options
 * @param {boolean} [opts.enabled=true] - Whether guard is active
 * @param {string[]} [opts.allowedMethods=['GET','HEAD','OPTIONS']] - Safe methods
 * @param {string[]} [opts.exemptPaths=[]] - Paths that bypass the guard
 * @param {boolean} [opts.checkHeader=true] - Allow bypass via X-Allow-Production-Write header
 * @param {Object} [opts.pgPool] - PostgreSQL pool for logging security events
 * @returns {import('express').RequestHandler}
 */
export function productionSafetyGuard(opts = {}) {
  const {
    enabled = true,
    allowedMethods = ['GET', 'HEAD', 'OPTIONS'],
    exemptPaths = [],
    checkHeader = true,
    pgPool = null,
  } = opts;

  return function productionSafetyGuardMiddleware(req, res, next) {
    // Skip if guard is disabled
    if (!enabled) {
      return next();
    }

    // Skip safe read-only methods
    const method = req.method?.toUpperCase();
    if (allowedMethods.includes(method)) {
      return next();
    }

    // Skip exempt paths
    const path = req.path || req.url;
    if (exemptPaths.some(exempt => path.startsWith(exempt))) {
      return next();
    }

    // Check if we're connected to production
    if (!isProductionDatabase()) {
      // Local dev or test database - allow all operations
      return next();
    }

    // PRODUCTION DATABASE DETECTED - enforce safety checks

    // Check 1: Global environment bypass
    if (process.env.ALLOW_PRODUCTION_WRITES === 'true') {
      const message = `⚠️  Production write allowed via ALLOW_PRODUCTION_WRITES: ${method} ${path}`;
      console.warn(message);
      
      // Log to system_logs table
      logSecurityEvent(pgPool, {
        level: 'WARN',
        message,
        method,
        path,
        bypass_method: 'ALLOW_PRODUCTION_WRITES',
        ip: req.ip || req.connection?.remoteAddress,
        user_agent: req.headers['user-agent'],
      });
      
      return next();
    }

    // Check 2: Per-request header bypass
    if (checkHeader) {
      const writeToken = req.headers['x-allow-production-write'];
      const expectedToken = process.env.PRODUCTION_WRITE_TOKEN;
      
      if (expectedToken && writeToken === expectedToken) {
        const message = `⚠️  Production write allowed via header token: ${method} ${path}`;
        console.warn(message);
        
        // Log to system_logs table
        logSecurityEvent(pgPool, {
          level: 'WARN',
          message,
          method,
          path,
          bypass_method: 'X-Allow-Production-Write header',
          ip: req.ip || req.connection?.remoteAddress,
          user_agent: req.headers['user-agent'],
        });
        
        return next();
      }
    }

    // Check 3: E2E test mode (requires both flags)
    if (process.env.E2E_TEST_MODE === 'true' && process.env.ALLOW_E2E_MUTATIONS === 'true') {
      const message = `⚠️  Production write allowed via E2E_TEST_MODE + ALLOW_E2E_MUTATIONS: ${method} ${path}`;
      console.warn(message);
      
      // Log to system_logs table
      logSecurityEvent(pgPool, {
        level: 'WARN',
        message,
        method,
        path,
        bypass_method: 'E2E_TEST_MODE',
        ip: req.ip || req.connection?.remoteAddress,
        user_agent: req.headers['user-agent'],
      });
      
      return next();
    }

    // BLOCKED: No bypass mechanism provided
    const blockMessage = `🚫 Blocked production write: ${method} ${path}`;
    console.error(blockMessage);
    
    // Log blocked attempt to system_logs table
    logSecurityEvent(pgPool, {
      level: 'ERROR',
      message: blockMessage,
      method,
      path,
      bypass_method: 'BLOCKED',
      ip: req.ip || req.connection?.remoteAddress,
      user_agent: req.headers['user-agent'],
    });
    return res.status(403).json({
      status: 'error',
      message: 'Write operations are disabled on production database',
      code: 'PRODUCTION_SAFETY_GUARD',
      details: {
        method,
        path,
        hint: 'To enable writes, set ALLOW_PRODUCTION_WRITES=true or provide X-Allow-Production-Write header',
        database: 'production/cloud',
      }
    });
  };
}

/**
 * Express error handler for production safety violations
 * Use after all routes to catch any guard failures
 */
export function productionSafetyErrorHandler(err, req, res, next) {
  if (err.code === 'PRODUCTION_SAFETY_GUARD') {
    return res.status(403).json({
      status: 'error',
      message: err.message,
      code: err.code,
    });
  }
  next(err);
}

export default {
  productionSafetyGuard,
  productionSafetyErrorHandler,
  isProductionDatabase,
};
