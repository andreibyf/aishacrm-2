import React, { createContext, useContext, useCallback } from 'react';
import { SystemLog } from '@/api/entities';
import { User } from '@/api/entities';

const LoggerContext = createContext(null);

const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR'
};

// In-memory buffer to batch logs
let logBuffer = [];
let flushTimeout = null;
const FLUSH_INTERVAL = 5000; // Flush every 5 seconds
const MAX_BUFFER_SIZE = 50;

async function flushLogs() {
  if (logBuffer.length === 0) return;
  
  const logsToSend = [...logBuffer];
  logBuffer = [];
  
  try {
    // Bulk create logs
    await SystemLog.bulkCreate(logsToSend);
  } catch (error) {
    console.error('Failed to flush logs to database:', error);
  }
}

function scheduleFlush() {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  flushTimeout = setTimeout(flushLogs, FLUSH_INTERVAL);
}

// Raw logger that does not depend on React context/hooks.
// Used by non-React modules (e.g., TenantContext) via dynamic import.
async function rawLog(level, message, source, metadata = {}) {
  try {
    const user = await User.me().catch(() => null);

    const logEntry = {
      level,
      message: String(message),
      source,
      user_email: user?.email || 'anonymous',
      tenant_id: user?.tenant_id || null,
      metadata: metadata || {},
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      stack_trace: level === 'ERROR' && metadata?.error ? metadata.error.stack : null
    };

    // Buffer and schedule flush
    logBuffer.push(logEntry);
    if (logBuffer.length >= MAX_BUFFER_SIZE) {
      await flushLogs();
    } else {
      scheduleFlush();
    }

    // Console echo in dev
    const consoleMethodMap = { DEBUG: 'debug', INFO: 'info', WARNING: 'warn', ERROR: 'error' };
    const methodName = consoleMethodMap[level] || 'log';
    const consoleMethod = console[methodName];
    if (typeof consoleMethod === 'function') {
      consoleMethod.call(console, `[${level}] [${source}]`, message, metadata);
    } else {
      console.log(`[${level}] [${source}]`, message, metadata);
    }
  } catch (e) {
    // As a last resort, try to store a single log entry without buffering
    try {
      await SystemLog.create({
        level,
        message: String(message),
        source,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        stack_trace: level === 'ERROR' && metadata?.error ? metadata.error.stack : null
      });
    } catch {
      // Secondary persistence failed; nothing else to do.
      void 0;
    }
  }
}

export const LoggerProvider = ({ children }) => {
  const log = useCallback(async (level, message, source, metadata = {}) => {
    try {
      const user = await User.me().catch(() => null);
      
      const logEntry = {
        level,
        message: String(message),
        source,
        user_email: user?.email || 'anonymous',
        tenant_id: user?.tenant_id || null,
        metadata: metadata || {},
        user_agent: navigator.userAgent,
        url: window.location.href,
        stack_trace: level === 'ERROR' && metadata?.error ? metadata.error.stack : null
      };

      // Add to buffer
      logBuffer.push(logEntry);

      // Also log to console in development - FIX: ensure method exists
      const consoleMethodMap = {
        DEBUG: 'debug',
        INFO: 'info',
        WARNING: 'warn',
        ERROR: 'error'
      };
      
      const methodName = consoleMethodMap[level] || 'log';
      const consoleMethod = console[methodName];
      
      // Only call if the method exists and is a function
      if (typeof consoleMethod === 'function') {
        consoleMethod.call(console, `[${level}] [${source}]`, message, metadata);
      } else {
        // Fallback to console.log
        console.log(`[${level}] [${source}]`, message, metadata);
      }

      // Flush if buffer is full
      if (logBuffer.length >= MAX_BUFFER_SIZE) {
        await flushLogs();
      } else {
        scheduleFlush();
      }
    } catch (error) {
      console.error('Logging failed:', error);
    }
  }, []);

  const debug = useCallback((message, source, metadata) => {
    return log(LOG_LEVELS.DEBUG, message, source, metadata);
  }, [log]);

  const info = useCallback((message, source, metadata) => {
    return log(LOG_LEVELS.INFO, message, source, metadata);
  }, [log]);

  const warning = useCallback((message, source, metadata) => {
    return log(LOG_LEVELS.WARNING, message, source, metadata);
  }, [log]);

  const error = useCallback((message, source, metadata) => {
    return log(LOG_LEVELS.ERROR, message, source, metadata);
  }, [log]);

  return (
    <LoggerContext.Provider value={{ debug, info, warning, error, log }}>
      {children}
    </LoggerContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useLogger = () => {
  const context = useContext(LoggerContext);
  if (!context) {
    // Return no-op functions if used outside provider
    return {
      debug: () => {},
      info: () => {},
      warning: () => {},
      error: () => {},
      log: () => {}
    };
  }
  return context;
};

// Export a non-hook facade for non-React consumers
// eslint-disable-next-line react-refresh/only-export-components
export const loggerFacade = {
  debug: (message, source = 'App', metadata) => rawLog(LOG_LEVELS.DEBUG, message, source, metadata),
  info: (message, source = 'App', metadata) => rawLog(LOG_LEVELS.INFO, message, source, metadata),
  warn: (message, source = 'App', metadata) => rawLog(LOG_LEVELS.WARNING, message, source, metadata),
  error: (message, source = 'App', metadata) => rawLog(LOG_LEVELS.ERROR, message, source, metadata)
};

// Auto-capture console errors and warnings
if (typeof window !== 'undefined') {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = function(...args) {
    originalError.apply(console, args);
    
    // Extract meaningful message
    const message = args.map(arg => {
      if (arg instanceof Error) return arg.message;
      if (typeof arg === 'object') return JSON.stringify(arg);
      return String(arg);
    }).join(' ');

    // Don't log if it's our own logging system
    if (!message.includes('[ERROR]') && !message.includes('Logging failed')) {
      SystemLog.create({
        level: 'ERROR',
        message,
        source: 'console.error',
        user_agent: navigator.userAgent,
        url: window.location.href,
        stack_trace: args.find(arg => arg instanceof Error)?.stack
      }).catch(() => {});
    }
  };

  console.warn = function(...args) {
    originalWarn.apply(console, args);
    
    const message = args.map(arg => {
      if (typeof arg === 'object') return JSON.stringify(arg);
      return String(arg);
    }).join(' ');

    // Don't log if it's our own logging system or known noise
    if (!message.includes('[WARNING]') && 
        !message.includes('Storage access failed') &&
        !message.includes('Failed to save')) {
      SystemLog.create({
        level: 'WARNING',
        message,
        source: 'console.warn',
        user_agent: navigator.userAgent,
        url: window.location.href
      }).catch(() => {});
    }
  };
}