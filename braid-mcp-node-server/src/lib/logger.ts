/**
 * Structured Logger for Braid MCP Node Server
 * Uses Pino for production-grade structured logging
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
 */
const redactPaths = [
  'password',
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
  'REDIS_URL'
];

/**
 * Create the logger instance
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
      messageFormat: '{levelLabel} - {msg}'
    }
  } : undefined,
  
  // Base context
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'braid-mcp-server'
  },
  
  // Serialize errors properly
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err
  }
});

export default logger;
