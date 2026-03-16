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
import { redactSecrets, redactSecretsFromObject } from './devaiSecurity.js';

// Determine if we're in development mode
const isDevelopment =
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || !process.env.NODE_ENV;

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
  'ELEVENLABS_API_KEY',
];

const EMAIL_PATTERN = /\b([A-Za-z0-9._%+-]{1,64})@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

export function redactEmail(email) {
  if (!email || typeof email !== 'string') return '***';
  const [localPart, domain] = email.split('@');
  if (!domain) return `${email.slice(0, 2)}***`;
  return `${localPart.slice(0, Math.min(2, localPart.length))}***@${domain}`;
}

function redactEmailsInString(value) {
  if (typeof value !== 'string') return value;
  return value.replace(EMAIL_PATTERN, (match) => redactEmail(match));
}

function redactInlineSecrets(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\bsk-[A-Za-z0-9]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{20,}\b/gi, 'Bearer [REDACTED_TOKEN]');
}

function truncateString(value, maxLength = 200) {
  if (typeof value !== 'string' || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

export function sanitizeLogValue(value, options = {}) {
  const { maxDepth = 4, maxStringLength = 200, maxArrayLength = 10 } = options;

  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(
      redactEmailsInString(redactInlineSecrets(redactSecrets(value))),
      maxStringLength,
    );
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogValue(value.message, options),
      code: value.code,
      status: value.status,
      statusCode: value.statusCode,
    };
  }

  if (maxDepth <= 0) {
    if (Array.isArray(value)) {
      return `[Array(${value.length})]`;
    }
    return '[Object]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, maxArrayLength).map((item) =>
      sanitizeLogValue(item, {
        maxDepth: maxDepth - 1,
        maxStringLength,
        maxArrayLength,
      }),
    );
  }

  if (typeof value === 'object') {
    const redactedObject = redactSecretsFromObject(value);
    return Object.fromEntries(
      Object.entries(redactedObject).map(([key, entryValue]) => [
        key,
        sanitizeLogValue(entryValue, {
          maxDepth: maxDepth - 1,
          maxStringLength,
          maxArrayLength,
        }),
      ]),
    );
  }

  return value;
}

export function summarizeMessagesForLog(messages = []) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  return {
    count: safeMessages.length,
    roles: [...new Set(safeMessages.map((message) => message?.role).filter(Boolean))],
    contentChars: safeMessages.reduce(
      (sum, message) => sum + (typeof message?.content === 'string' ? message.content.length : 0),
      0,
    ),
    hasAttachments: safeMessages.some(
      (message) => Array.isArray(message?.attachments) && message.attachments.length > 0,
    ),
  };
}

export function summarizeToolArgsForLog(args = {}) {
  const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  return {
    keys: Object.keys(safeArgs),
    preview: sanitizeLogValue(safeArgs, { maxDepth: 2, maxStringLength: 120, maxArrayLength: 5 }),
  };
}

export function summarizeRowsForLog(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.slice(0, 3).map((row) => ({
    id: row?.id || null,
    email: row?.email ? redactEmail(row.email) : undefined,
    tenant_id: row?.tenant_id || undefined,
    role: row?.role || undefined,
  }));
}

export function toSafeErrorMeta(error) {
  return sanitizeLogValue(error instanceof Error ? error : { message: error }, { maxDepth: 3 });
}

/**
 * Create the logger instance with environment-specific configuration
 */
const logger = pino({
  level: logLevel,

  // Redact sensitive fields
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },

  // Add timestamp to all logs
  timestamp: pino.stdTimeFunctions.isoTime,

  // Pretty print in development, JSON in production
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: false,
          messageFormat: '{levelLabel} - {msg}',
          errorLikeObjectKeys: ['err', 'error'],
        },
      }
    : undefined,

  // Base context to include in all logs
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'aishacrm-backend',
  },

  // Serialize errors properly
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
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
logger.child = function (bindings) {
  return pino({
    ...this.options,
    base: { ...this.bindings(), ...bindings },
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
    ...extra,
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
  logger.error(
    {
      err: error,
      stack: error.stack,
      ...context,
    },
    message,
  );
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
  logger[level](
    {
      operation,
      durationMs,
      ...context,
    },
    `Performance: ${operation} took ${durationMs}ms`,
  );
}

/**
 * Express middleware to add logger to request object
 * Makes logger available as req.logger throughout the request lifecycle
 */
export function expressLogger(req, res, next) {
  const requestId =
    req.id ||
    req.headers['x-request-id'] ||
    `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  req.logger = logger.child({
    requestId,
    method: req.method,
    path: req.path,
    tenantId: req.tenant?.id || req.query?.tenant_id || req.headers?.['x-tenant-id'],
  });

  next();
}

// Export the logger as default and named export
export { logger };
export default logger;
