/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useCallback, useRef } from 'react';

const ApiContext = createContext(null);

export const ApiProvider = ({ children }) => {
  const cacheRef = useRef(new Map());
  const pendingRequestsRef = useRef(new Map());

  const cachedRequest = useCallback(async (entityName, methodName, params, fetcher) => {
    const cacheKey = `${entityName}.${methodName}:${JSON.stringify(params)}`;

    // Cache timeout: 1 second in dev, 2 seconds in production (reduced from 2s/5s - app perf improved)
    const CACHE_TIMEOUT = import.meta.env.DEV ? 1000 : 2000;

    if (cacheRef.current.has(cacheKey)) {
      const cached = cacheRef.current.get(cacheKey);
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TIMEOUT) {
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
    <ApiContext.Provider value={{ cachedRequest, clearCache, clearCacheByKey }}>
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
