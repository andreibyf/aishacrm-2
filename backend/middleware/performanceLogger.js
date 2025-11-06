/**
 * Performance Logging Middleware
 * Tracks API request performance metrics
 */

export function performanceLogger(pgPool) {
  console.log('[Performance Logger] Middleware initialized with pgPool:', !!pgPool);
  return async (req, res, next) => {
    const startTime = Date.now();
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
            await pgPool.query(
              `INSERT INTO performance_logs 
                (tenant_id, method, endpoint, status_code, duration_ms, user_email, ip_address, user_agent, error_message, error_stack)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                tenant_id,
                req.method,
                req.originalUrl || req.url || req.path,
                res.statusCode,
                duration,
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
