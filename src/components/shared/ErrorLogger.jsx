/* eslint-disable react-refresh/only-export-components */
import { useState, createContext, useContext } from 'react';
import { SystemLog } from '@/api/entities';
import { useUser } from '@/components/shared/useUser.js';

// Client-side error log storage
const errorLog = [];
const MAX_ERRORS = 100;

const ErrorLogContext = createContext();

export function useErrorLog() {
  return useContext(ErrorLogContext);
}

export function ErrorLogProvider({ children }) {
  const [errors, setErrors] = useState([]);
  const { user } = useUser();

  const logError = (error) => {
    const errorEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      message: error.message || 'Unknown error',
      component: error.component || 'Unknown',
      status: error.status,
      userEmail: user?.email,
      severity: error.severity || 'error',
      actionable: error.actionable || null,
      details: error.details || null
    };

    errorLog.unshift(errorEntry);
    if (errorLog.length > MAX_ERRORS) {
      errorLog.pop();
    }

    setErrors([...errorLog]);

    // Also log to console for developers
    console.error(`[${errorEntry.component}]`, errorEntry.message, errorEntry.details);

    // CRITICAL: Persist errors to system_logs table (only if user is authenticated)
    // Skip logging "Auth session missing" errors to avoid 403s on login page
    const isAuthError = errorEntry.message?.includes('Auth session missing');
    
    if (user && !isAuthError) {
      // Map severity to log level: critical/error → ERROR, warning → WARNING
      const logLevel = errorEntry.severity === 'critical' || errorEntry.severity === 'error' ? 'ERROR' : 'WARNING';
      
      SystemLog.create({
        level: logLevel,
        message: `[${errorEntry.component}] ${errorEntry.message}`,
        source: errorEntry.component,
        user_email: errorEntry.userEmail || 'anonymous',
        tenant_id: user?.tenant_id || null,
        metadata: {
          status: errorEntry.status,
          severity: errorEntry.severity,
          actionable: errorEntry.actionable,
          details: errorEntry.details,
          timestamp: errorEntry.timestamp
        },
        user_agent: navigator.userAgent,
        url: window.location.href
      }).catch((logErr) => {
        // Don't fail the app if logging fails
        console.warn('Failed to persist error to system_logs:', logErr);
      });
    }
  };

  const clearErrors = () => {
    errorLog.length = 0;
    setErrors([]);
  };

  const getRecentErrors = (count = 10) => {
    return errorLog.slice(0, count);
  };

  const getCriticalErrors = () => {
    return errorLog.filter(e => e.severity === 'critical');
  };

  return (
    <ErrorLogContext.Provider value={{ 
      errors, 
      logError, 
      clearErrors, 
      getRecentErrors,
      getCriticalErrors
    }}>
      {children}
    </ErrorLogContext.Provider>
  );
}

// Helper to create structured errors
export function createError(component, message, options = {}) {
  return {
    component,
    message,
    status: options.status,
    severity: options.severity || 'error',
    actionable: options.actionable,
    details: options.details
  };
}

// HTTP status code helpers
export function handleApiError(component, error) {
  const status = error?.response?.status || error?.status;
  
  const errorMap = {
    403: {
      message: 'Permission denied',
      severity: 'warning',
      actionable: 'Check user permissions in Settings → User Management'
    },
    429: {
      message: 'Rate limit exceeded',
      severity: 'warning',
      actionable: 'System is busy. Wait a moment and try again.'
    },
    500: {
      message: 'Server error',
      severity: 'critical',
      actionable: 'System error occurred. Contact support if this persists.'
    },
    502: {
      message: 'Backend unavailable',
      severity: 'critical',
      actionable: 'Backend service is down. Try again in a few minutes.'
    },
    504: {
      message: 'Request timeout',
      severity: 'warning',
      actionable: 'Operation took too long. Try again or contact support.'
    }
  };

  const errorInfo = errorMap[status] || {
    message: error?.message || 'Operation failed',
    severity: 'error',
    actionable: 'An unexpected error occurred. Please try again.'
  };

  return createError(component, errorInfo.message, {
    status,
    severity: errorInfo.severity,
    actionable: errorInfo.actionable,
    details: error?.message
  });
}