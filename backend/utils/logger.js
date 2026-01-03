/**
 * Backend Logger Utility
 * 
 * DEPRECATED: This is a legacy logger wrapper.
 * New code should use the Pino logger directly from '../lib/logger.js'
 * 
 * This file maintains backward compatibility for existing code.
 * 
 * @module backend/utils/logger
 * @deprecated Use '../lib/logger.js' instead
 */

import logger from '../lib/logger.js';

/**
 * Log levels enum
 */
export const LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
};

/**
 * Check if we're in development mode
 * 
 * @returns {boolean} True if running in development mode
 */
function isDevelopment() {
  return process.env.NODE_ENV === 'development';
}

/**
 * Get current log level from environment
 * Defaults to DEBUG in development, INFO in production
 * 
 * @returns {string} Current log level
 */
function getCurrentLogLevel() {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL.toUpperCase();
  }
  return isDevelopment() ? LogLevel.DEBUG : LogLevel.INFO;
}

/**
 * Check if a log level should be output based on current configuration
 * 
 * @param {string} level - Log level to check
 * @returns {boolean} True if level should be logged
 */
function shouldLog(level) {
  const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
  const currentLevel = getCurrentLogLevel();
  const currentIndex = levels.indexOf(currentLevel);
  const levelIndex = levels.indexOf(level);
  
  return levelIndex <= currentIndex;
}

/**
 * Log an error message
 * 
 * @param {string} message - Error message
 * @param {Error|Object} [error] - Error object or metadata
 */
export function error(message, error = null) {
  if (shouldLog(LogLevel.ERROR)) {
    if (error instanceof Error) {
      logger.error({ err: error }, message);
    } else {
      logger.error(error || {}, message);
    }
  }
}

/**
 * Log a warning message
 * 
 * @param {string} message - Warning message
 * @param {Object} [meta] - Additional metadata
 */
export function warn(message, meta = null) {
  if (shouldLog(LogLevel.WARN)) {
    logger.warn(meta || {}, message);
  }
}

/**
 * Log an info message
 * 
 * @param {string} message - Info message
 * @param {Object} [meta] - Additional metadata
 */
export function info(message, meta = null) {
  if (shouldLog(LogLevel.INFO)) {
    logger.info(meta || {}, message);
  }
}

/**
 * Log a debug message (only in development or when DEBUG level is set)
 * 
 * @param {string} message - Debug message
 * @param {Object} [meta] - Additional metadata
 */
export function debug(message, meta = null) {
  if (shouldLog(LogLevel.DEBUG)) {
    logger.debug(meta || {}, message);
  }
}

/**
 * Create a scoped logger with a module name prefix
 * 
 * @param {string} moduleName - Module name for scoping logs
 * @returns {Object} Scoped logger instance
 */
export function createLogger(moduleName) {
  const childLogger = logger.child({ module: moduleName });
  
  return {
    error: (message, err = null) => {
      if (err instanceof Error) {
        childLogger.error({ err }, message);
      } else {
        childLogger.error(err || {}, message);
      }
    },
    warn: (message, meta = null) => childLogger.warn(meta || {}, message),
    info: (message, meta = null) => childLogger.info(meta || {}, message),
    debug: (message, meta = null) => childLogger.debug(meta || {}, message),
  };
}

/**
 * Log HTTP request details
 * Useful for middleware logging
 * 
 * @param {Object} req - Express request object
 * @param {number} statusCode - Response status code
 * @param {number} duration - Request duration in ms
 */
export function logRequest(req, statusCode, duration) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  const message = `${req.method} ${req.path} ${statusCode} ${duration}ms`;
  const meta = {
    method: req.method,
    path: req.path,
    statusCode,
    duration,
    ip: req.ip,
  };
  
  logger[level](meta, message);
}
