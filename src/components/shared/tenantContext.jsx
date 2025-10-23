import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { isValidId } from './tenantUtils';

window.__fixPrototype = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (typeof obj.hasOwnProperty !== 'function') {
    return JSON.parse(JSON.stringify(obj));
  }
  return obj;
};

if (typeof Object.prototype.hasOwnProperty !== 'function') {
  const goodProto = {}.__proto__;
  Object.setPrototypeOf(Object.prototype, goodProto);
}

const sanitizeObject = (obj) => {
  if (!obj) return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.error("Sanitization failed:", e);
    return null;
  }
};

// Removed unused `safeGet` function to resolve the lint error.

const TenantContext = createContext(null);

// Import logger functionality
let loggerInstance = null;

// Helper to log without causing circular dependencies
function logTenantEvent(level, message, metadata) {
  if (!loggerInstance) {
    // Lazy load logger to avoid circular deps
    import('./Logger').then(module => {
      // Assuming module.useLogger is the actual logger instance/object
      // that has info, warn, error methods.
      if (module && typeof module.useLogger === 'object' &&
          typeof module.useLogger.info === 'function' &&
          typeof module.useLogger.warn === 'function' &&
          typeof module.useLogger.error === 'function') {
        loggerInstance = module.useLogger;
      } else {
        console.warn('[TenantContext] Logger module did not export expected methods via `useLogger`. Falling back to console only.');
      }
    }).catch(e => {
      console.error('[TenantContext] Failed to load logger module:', e);
    });
  }
  
  // Also keep console logging - FIX: ensure we always have a valid method
  const consoleMethodMap = {
    'INFO': 'info',
    'WARNING': 'warn',
    'ERROR': 'error',
    'DEBUG': 'debug'
  };
  
  const methodName = consoleMethodMap[level] || 'log';
  const consoleMethod = console[methodName];
  
  // Only call if the method exists
  if (typeof consoleMethod === 'function') {
    consoleMethod.call(console, `[TenantContext] ${message}`, metadata);
  } else {
    // Fallback to console.log
    console.log(`[TenantContext] [${level}] ${message}`, metadata);
  }

  // If external logger methods are loaded and available, use them too.
  // Note: This might not run on the very first log if loggerInstance is still loading.
  if (loggerInstance && typeof loggerInstance[level.toLowerCase()] === 'function') {
    // Ensure metadata is stringifiable if the logger expects it.
    const logMetadata = sanitizeObject(metadata); 
    loggerInstance[level.toLowerCase()](`[TenantContext] ${message}`, logMetadata);
  }
}

export const TenantProvider = ({ children }) => {
  const [selectedTenantId, setSelectedTenantIdState] = useState(null);
  const [lastSyncedTenantId, setLastSyncedTenantId] = useState(null);
  const persistenceAttempted = useRef(false);

  const setSelectedTenantId = useCallback((newTenantId) => {
    const sanitized = newTenantId === null || newTenantId === undefined || newTenantId === '' 
      ? null 
      : String(newTenantId);

    if (sanitized === selectedTenantId) {
      return;
    }

    logTenantEvent('INFO', 'Tenant selection changed', {
      from: selectedTenantId,
      to: sanitized
    });

    setSelectedTenantIdState(sanitized);

    try {
      if (sanitized === null) {
        localStorage.removeItem('selected_tenant_id');
      } else {
        localStorage.setItem('selected_tenant_id', sanitized);
      }
    } catch (error) {
      logTenantEvent('ERROR', 'Failed to persist tenant selection', {
        error: error.message
      });
    }
  }, [selectedTenantId]); // Dependency on selectedTenantId ensures we compare against the *current* state

  useEffect(() => {
    if (persistenceAttempted.current) return;
    persistenceAttempted.current = true;

    try {
      const saved = localStorage.getItem('selected_tenant_id');
      if (saved && saved !== 'null' && saved !== 'undefined') {
        const sanitized = String(saved);
        // Use shared validation function
        if (isValidId(sanitized)) {
          setSelectedTenantIdState(sanitized);
          logTenantEvent('INFO', 'Restored tenant from localStorage', {
            tenantId: sanitized
          });
        } else {
          logTenantEvent('WARNING', 'Invalid tenant ID format in localStorage', {
            savedValue: saved
          });
          // Reset to a default tenant ID
          const defaultTenantId = '68f84f58558dd2a4d4bdd545';
          setSelectedTenantIdState(defaultTenantId);
          localStorage.setItem('selected_tenant_id', defaultTenantId);
          logTenantEvent('INFO', 'Reset tenant ID to default', {
            tenantId: defaultTenantId
          });
        }
      }
    } catch (error) {
      logTenantEvent('ERROR', 'Failed to load tenant from storage', {
        error: error.message
      });
    }
  }, []); // Empty dependency array means this runs once on mount

  useEffect(() => {
    if (selectedTenantId && selectedTenantId !== lastSyncedTenantId) {
      setLastSyncedTenantId(selectedTenantId);
      
      logTenantEvent('INFO', 'Tenant context synchronized', {
        tenantId: selectedTenantId
      });

      window.dispatchEvent(
        new CustomEvent('tenant-changed', {
          detail: { tenantId: selectedTenantId }
        })
      );
    }
  }, [selectedTenantId, lastSyncedTenantId]); // Dependencies: selectedTenantId and lastSyncedTenantId

  return (
    <TenantContext.Provider value={{ selectedTenantId, setSelectedTenantId }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    logTenantEvent('WARNING', 'useTenant called outside TenantProvider', {});
    // Return a default, non-functional object to prevent crashes
    return { selectedTenantId: null, setSelectedTenantId: () => {} };
  }
  return context;
};
