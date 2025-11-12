/**
 * Performance Logging Middleware
 * Tracks API request performance metrics
 */
import { getRequestDbTime } from '../lib/requestContext.js';

export function performanceLogger(pgPool) {
  console.log('[Performance Logger] Middleware initialized with pgPool:', !!pgPool);
  return async (req, res, next) => {
    const startTime = Date.now();
    // Time to first byte (TTFB) tracking
    let headersSentAt = null;
    const markHeadersSent = () => { if (!headersSentAt) headersSentAt = Date.now(); };
    const originalWriteHead = res.writeHead;
    res.writeHead = function (...args) {
      markHeadersSent();
      return originalWriteHead.apply(this, args);
    };
    const originalWrite = res.write;
    res.write = function (chunk, encoding, cb) {
      markHeadersSent();
      return originalWrite.call(this, chunk, encoding, cb);
    };
    // DB query time is accumulated per request via AsyncLocalStorage in requestContext
    const originalSend = res.send;
    const originalJson = res.json;

    // Capture response
    let responseBody;
    res.send = function (body) {
      responseBody = body;
      return originalSend.call(this, body);
    };
    res.json = function (body) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Wait for response to complete
    res.on('finish', async () => {
      console.log(`[Performance Logger] Finish event for ${req.method} ${req.originalUrl || req.url}`);
      try {
        const duration = Date.now() - startTime;
        
        // Skip logging for health checks and static assets
        if (req.path === '/health' || req.path.startsWith('/assets/')) {
          return;
        }

        // Extract tenant_id from query, body, or user context
        const tenant_id =
          req.headers?.['x-tenant-id'] ||
          req.query?.tenant_id ||
          req.body?.tenant_id ||
          req.user?.tenant_id ||
          'unknown';

        // Extract error info if present
        let error_message = null;
        let error_stack = null;
        if (res.statusCode >= 400 && responseBody) {
          try {
            const body = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
            error_message = body.error || body.message || `HTTP ${res.statusCode}`;
            error_stack = body.stack;
          } catch {
            // Ignore parse errors
          }
        }

        // Log to database (non-blocking)
        setImmediate(async () => {
          try {
            const dbTime = getRequestDbTime(req);
            const ttfb = headersSentAt ? Math.max(0, headersSentAt - startTime) : duration; // fallback to total if headers never explicitly sent
            await pgPool.query(
              `INSERT INTO performance_logs 
                (tenant_id, method, endpoint, status_code, duration_ms, response_time_ms, db_query_time_ms, user_email, ip_address, user_agent, error_message, error_stack)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                tenant_id,
                req.method,
                req.originalUrl || req.url || req.path,
                res.statusCode,
                duration,
                ttfb, // true time to first byte (headers sent)
                dbTime,
                req.user?.email || null,
                req.ip || req.connection?.remoteAddress,
                req.get('user-agent'),
                error_message,
                error_stack
              ]
            );
          } catch (dbError) {
            // Don't throw - logging failure shouldn't break the app
            // Always log errors so we can debug
            console.error('[Performance Logger] Failed to log:', dbError.message);
            console.error('[Performance Logger] Stack:', dbError.stack);
          }
        });
      } catch (error) {
        // Swallow errors - performance logging is non-critical
        if (process.env.NODE_ENV !== 'production') {
          console.error('[Performance Logger] Error:', error.message);
        }
      }
    });

    next();
  };
}
