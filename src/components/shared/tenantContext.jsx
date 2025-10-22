
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

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

const safeGet = (obj, key, fallback = undefined) => {
  try {
    if (!obj || typeof obj !== "object") return fallback;
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
    return fallback;
  } catch (e) {
    return fallback;
  }
};

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
        if (/^[a-f0-9]{24}$/i.test(sanitized)) {
          setSelectedTenantIdState(sanitized);
          logTenantEvent('INFO', 'Restored tenant from localStorage', {
            tenantId: sanitized
          });
        } else {
          logTenantEvent('WARNING', 'Invalid tenant ID format in localStorage', {
            savedValue: saved
          });
          localStorage.removeItem('selected_tenant_id');
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

export const getTenantFilter = (user, selectedTenantId = null) => {
  if (!user) {
    logTenantEvent('WARNING', 'getTenantFilter called without user', {});
    return {};
  }

  const role = safeGet(user, 'role', null);
  const userTenantId = safeGet(user, 'tenant_id', null);
  
  const isAdminLike = role === 'superadmin' || role === 'admin';
  let effectiveTenantId = null;

  if (isAdminLike) {
    effectiveTenantId = selectedTenantId || userTenantId; // Admins can use selectedTenantId or their own
  } else {
    effectiveTenantId = userTenantId; // Non-admins only use their own
  }
  
  let result = {};
  
  if (effectiveTenantId) {
    result = { tenant_id: effectiveTenantId };
  } else {
    logTenantEvent('WARNING', 'No tenant ID available for filter', {
      userEmail: user?.email, // Safe access
      role,
      selectedTenantId
    });
  }
  
  return result;
};
