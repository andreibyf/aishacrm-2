/**
 * Structured Logger for AiSHA CRM Backend
 * Uses Pino for production-grade structured logging with configurable levels
 * 
 * Features:
 * - Structured JSON logging in production
 * - Pretty-printed logs in development
 * - Configurable log levels via LOG_LEVEL env var
 * - Automatic redaction of sensitive fields
 * - Request ID tracking support
 */

import pino from 'pino';

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development' || 
                      process.env.NODE_ENV === 'dev' ||
                      !process.env.NODE_ENV;

// Get log level from environment or default to 'info'
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

/**
 * Sensitive field paths to redact from logs
 * Prevents accidental logging of passwords, tokens, API keys, etc.
 */
const redactPaths = [
  'password',
  'req.headers.authorization',
  'req.headers.cookie',
  'apiKey',
  'api_key',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  '*.password',
  '*.apiKey',
  '*.api_key',
  '*.secret',
  '*.token',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ELEVENLABS_API_KEY'
];

/**
 * Create the logger instance with environment-specific configuration
 */
const logger = pino({
  level: logLevel,
  
  // Redact sensitive fields
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]'
  },
  
  // Add timestamp to all logs
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Pretty print in development, JSON in production
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
      messageFormat: '{levelLabel} - {msg}',
      errorLikeObjectKeys: ['err', 'error']
    }
  } : undefined,
  
  // Base context to include in all logs
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'aishacrm-backend'
  },
  
  // Serialize errors properly
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res
  }
});

/**
 * Create a child logger with additional context
 * Useful for adding request IDs, tenant IDs, user IDs, etc.
 * 
 * @param {Object} bindings - Additional context to bind to the logger
 * @returns {pino.Logger} Child logger instance
 * 
 * @example
 * const requestLogger = logger.child({ requestId: req.id, tenantId: req.tenant.id });
 * requestLogger.info('Processing request');
 */
logger.child = function(bindings) {
  return pino({
    ...this.options,
    base: { ...this.bindings(), ...bindings }
  });
};

/**
 * Helper to log with request context
 * Automatically extracts useful information from Express request objects
 * 
 * @param {Object} req - Express request object
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} message - Log message
 * @param {Object} extra - Additional data to log
 */
export function logRequest(req, level = 'info', message, extra = {}) {
  const context = {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    tenantId: req.tenant?.id || req.query?.tenant_id || req.headers?.['x-tenant-id'],
    userId: req.user?.id || req.userId,
    ...extra
  };
  
  logger[level]({ req: context, ...extra }, message);
}

/**
 * Helper to log errors with full context
 * Ensures error objects are properly serialized with stack traces
 * 
 * @param {Error} error - Error object
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 */
export function logError(error, message = 'Error occurred', context = {}) {
  logger.error({
    err: error,
    stack: error.stack,
    ...context
  }, message);
}

/**
 * Helper to log performance metrics
 * Useful for tracking slow operations
 * 
 * @param {string} operation - Operation name
 * @param {number} durationMs - Duration in milliseconds
 * @param {Object} context - Additional context
 */
export function logPerformance(operation, durationMs, context = {}) {
  const level = durationMs > 1000 ? 'warn' : 'debug';
  logger[level]({
    operation,
    durationMs,
    ...context
  }, `Performance: ${operation} took ${durationMs}ms`);
}

/**
 * Express middleware to add logger to request object
 * Makes logger available as req.logger throughout the request lifecycle
 */
export function expressLogger(req, res, next) {
  const requestId = req.id || req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  req.logger = logger.child({
    requestId,
    method: req.method,
    path: req.path,
    tenantId: req.tenant?.id || req.query?.tenant_id || req.headers?.['x-tenant-id']
  });
  
  next();
}

// Export the logger as default and named export
export { logger };
export default logger;
