/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useCallback, useRef } from 'react';

const ApiContext = createContext(null);

export const ApiProvider = ({ children }) => {
  const cacheRef = useRef(new Map());
  const pendingRequestsRef = useRef(new Map());

  const cachedRequest = useCallback(
    async (entityName, methodName, params, fetcher, options = {}) => {
      const cacheKey = `${entityName}.${methodName}:${JSON.stringify(params)}`;

      // Default cache timeout: 1s dev / 2s prod. Callers can override via
      // options.ttlMs for data that changes rarely (tenant list, module
      // settings) to avoid navigation-triggered refetches.
      const defaultTimeout = import.meta.env.DEV ? 1000 : 2000;
      // Use Number.isFinite so NaN / Infinity fall back to the default.
      // Otherwise NaN would silently disable caching and Infinity would never
      // expire — both easy foot-guns for callers passing a computed ttlMs.
      const ttl = Number.isFinite(options.ttlMs) ? options.ttlMs : defaultTimeout;

      if (cacheRef.current.has(cacheKey)) {
        const cached = cacheRef.current.get(cacheKey);
        const age = Date.now() - cached.timestamp;
        if (age < ttl) {
          return cached.data;
        }
      }

      if (pendingRequestsRef.current.has(cacheKey)) {
        return pendingRequestsRef.current.get(cacheKey);
      }

      const promise = fetcher()
        .then((data) => {
          cacheRef.current.set(cacheKey, { data, timestamp: Date.now() });
          pendingRequestsRef.current.delete(cacheKey);
          return data;
        })
        .catch((error) => {
          pendingRequestsRef.current.delete(cacheKey);
          throw error;
        });

      pendingRequestsRef.current.set(cacheKey, promise);
      return promise;
    },
    [],
  );

  // Synchronous cache peek. Lets callers (e.g., EntityLabelsContext) know
  // whether a subsequent cachedRequest will resolve from cache so they can
  // skip UI loading-state flicker on tenant-switch-back within the TTL window.
  const peek = useCallback((entityName, methodName, params, options = {}) => {
    const cacheKey = `${entityName}.${methodName}:${JSON.stringify(params)}`;
    if (!cacheRef.current.has(cacheKey)) return false;
    const cached = cacheRef.current.get(cacheKey);
    const defaultTimeout = import.meta.env.DEV ? 1000 : 2000;
    const ttl = Number.isFinite(options.ttlMs) ? options.ttlMs : defaultTimeout;
    return Date.now() - cached.timestamp < ttl;
  }, []);

  const clearCache = useCallback((pattern) => {
    if (!pattern) {
      cacheRef.current.clear();
      pendingRequestsRef.current.clear();
      return;
    }

    const keysToDelete = [];
    for (const key of cacheRef.current.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => {
      cacheRef.current.delete(key);
      pendingRequestsRef.current.delete(key); // Also clear pending requests
    });
  }, []);

  // Backward-compatible alias expected by some pages (e.g., Accounts.jsx)
  const clearCacheByKey = useCallback(
    (pattern) => {
      return clearCache(pattern);
    },
    [clearCache],
  );

  return (
    <ApiContext.Provider value={{ cachedRequest, peek, clearCache, clearCacheByKey }}>
      {children}
    </ApiContext.Provider>
  );
};

export const useApiManager = () => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApiManager must be used within ApiProvider');
  }
  return context;
};
