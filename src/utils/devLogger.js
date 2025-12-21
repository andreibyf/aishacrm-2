/**
 * Development Logger Utility
 * 
 * Provides environment-aware logging with configurable log levels.
 * Set log level via localStorage: localStorage.setItem('LOG_LEVEL', 'debug')
 * 
 * Log Levels:
 * - 'none'  - No logs (production default)
 * - 'error' - Only errors
 * - 'warn'  - Errors and warnings
 * - 'info'  - Errors, warnings, and info
 * - 'debug' - All logs (development default)
 * 
 * @module utils/devLogger
 */

// Log level hierarchy
const LOG_LEVELS = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/**
 * Get the current log level from localStorage or environment
 */
function getLogLevel() {
  // Check localStorage first (allows runtime override)
  if (typeof localStorage !== 'undefined') {
    const storedLevel = localStorage.getItem('LOG_LEVEL');
    if (storedLevel && LOG_LEVELS[storedLevel] !== undefined) {
      return LOG_LEVELS[storedLevel];
    }
  }

  // Default: debug in dev, error in production
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.DEV ? LOG_LEVELS.info : LOG_LEVELS.error;
  }
  return LOG_LEVELS.error;
}

/**
 * Check if we're in development mode
 */
export function isDevelopment() {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.DEV === true || import.meta.env.MODE === 'development';
  }
  return false;
}

/**
 * Log a debug message (only at debug level)
 */
export function logDev(...args) {
  if (getLogLevel() >= LOG_LEVELS.debug) {
    console.log(...args);
  }
}

/**
 * Log a warning message (at warn level or higher)
 */
export function warnDev(...args) {
  if (getLogLevel() >= LOG_LEVELS.warn) {
    console.warn(...args);
  }
}

/**
 * Log an error message (always logged except at 'none' level)
 */
export function logError(...args) {
  if (getLogLevel() >= LOG_LEVELS.error) {
    console.error(...args);
  }
}

/**
 * Log an info message (at info level or higher)
 */
export function logInfo(...args) {
  if (getLogLevel() >= LOG_LEVELS.info) {
    console.info(...args);
  }
}

/**
 * Log a table (only at debug level)
 */
export function logTable(data) {
  if (getLogLevel() >= LOG_LEVELS.debug && console.table) {
    console.table(data);
  }
}

/**
 * Create a scoped logger with a prefix
 */
export function createScopedLogger(scope) {
  const prefix = `[${scope}]`;
  
  return {
    log: (...args) => logDev(prefix, ...args),
    warn: (...args) => warnDev(prefix, ...args),
    error: (...args) => logError(prefix, ...args),
    info: (...args) => logInfo(prefix, ...args),
    table: (data) => {
      if (getLogLevel() >= LOG_LEVELS.debug) {
        console.log(prefix);
        logTable(data);
      }
    },
  };
}

/**
 * Set log level at runtime
 * @param {'none'|'error'|'warn'|'info'|'debug'} level
 */
export function setLogLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    localStorage.setItem('LOG_LEVEL', level);
    console.log(`[DevLogger] Log level set to: ${level}`);
  }
}

/**
 * Get current log level name
 */
export function getCurrentLogLevel() {
  const level = getLogLevel();
  return Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === level) || 'unknown';
}
