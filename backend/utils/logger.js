/**
 * Backend Logger Utility
 * 
 * Provides environment-aware logging for backend services.
 * Supports different log levels and structured logging.
 * 
 * @module backend/utils/logger
 */

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
 * Format log message with timestamp and level
 * 
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} [meta] - Additional metadata
 * @returns {string} Formatted log message
 */
function formatMessage(level, message, meta = null) {
  const timestamp = new Date().toISOString();
  let formatted = `[${timestamp}] [${level}] ${message}`;
  
  if (meta && Object.keys(meta).length > 0) {
    formatted += ` ${JSON.stringify(meta)}`;
  }
  
  return formatted;
}

/**
 * Log an error message
 * 
 * @param {string} message - Error message
 * @param {Error|Object} [error] - Error object or metadata
 */
export function error(message, error = null) {
  if (shouldLog(LogLevel.ERROR)) {
    const meta = error instanceof Error ? { stack: error.stack, message: error.message } : error;
    console.error(formatMessage(LogLevel.ERROR, message, meta));
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
    console.warn(formatMessage(LogLevel.WARN, message, meta));
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
    console.log(formatMessage(LogLevel.INFO, message, meta));
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
    console.log(formatMessage(LogLevel.DEBUG, message, meta));
  }
}

/**
 * Create a scoped logger with a module name prefix
 * 
 * @param {string} moduleName - Module name for scoping logs
 * @returns {Object} Scoped logger instance
 */
export function createLogger(moduleName) {
  const prefix = `[${moduleName}]`;
  
  return {
    error: (message, err = null) => error(`${prefix} ${message}`, err),
    warn: (message, meta = null) => warn(`${prefix} ${message}`, meta),
    info: (message, meta = null) => info(`${prefix} ${message}`, meta),
    debug: (message, meta = null) => debug(`${prefix} ${message}`, meta),
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
  const level = statusCode >= 500 ? LogLevel.ERROR : statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
  const message = `${req.method} ${req.path} ${statusCode} ${duration}ms`;
  const meta = {
    method: req.method,
    path: req.path,
    statusCode,
    duration,
    ip: req.ip,
  };
  
  if (level === LogLevel.ERROR) {
    error(message, meta);
  } else if (level === LogLevel.WARN) {
    warn(message, meta);
  } else {
    info(message, meta);
  }
}
