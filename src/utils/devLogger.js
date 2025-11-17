/**
 * Development Logger Utility
 * 
 * Provides environment-aware logging that only outputs in development mode.
 * This helps keep production logs clean while maintaining debugging capability in development.
 * 
 * @module utils/devLogger
 */

/**
 * Check if we're in development mode
 * 
 * @returns {boolean} True if running in development mode
 */
export function isDevelopment() {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.DEV === true || import.meta.env.MODE === 'development';
  }
  return false;
}

/**
 * Log a debug message (only in development mode)
 * 
 * @param {...any} args - Arguments to log
 */
export function logDev(...args) {
  if (isDevelopment()) {
    console.log(...args);
  }
}

/**
 * Log a warning message (only in development mode)
 * 
 * @param {...any} args - Arguments to log
 */
export function warnDev(...args) {
  if (isDevelopment()) {
    console.warn(...args);
  }
}

/**
 * Log an error message (always logged, regardless of environment)
 * Errors should always be visible for debugging production issues
 * 
 * @param {...any} args - Arguments to log
 */
export function logError(...args) {
  console.error(...args);
}

/**
 * Log an info message (only in development mode)
 * 
 * @param {...any} args - Arguments to log
 */
export function logInfo(...args) {
  if (isDevelopment()) {
    console.info(...args);
  }
}

/**
 * Log a table (only in development mode)
 * Useful for displaying structured data
 * 
 * @param {any} data - Data to display in table format
 */
export function logTable(data) {
  if (isDevelopment() && console.table) {
    console.table(data);
  }
}

/**
 * Create a scoped logger with a prefix
 * Useful for identifying log sources
 * 
 * @param {string} scope - The scope/module name to prefix logs with
 * @returns {Object} Logger object with scoped methods
 */
export function createScopedLogger(scope) {
  const prefix = `[${scope}]`;
  
  return {
    log: (...args) => logDev(prefix, ...args),
    warn: (...args) => warnDev(prefix, ...args),
    error: (...args) => logError(prefix, ...args),
    info: (...args) => logInfo(prefix, ...args),
    table: (data) => {
      if (isDevelopment()) {
        console.log(prefix);
        logTable(data);
      }
    },
  };
}
