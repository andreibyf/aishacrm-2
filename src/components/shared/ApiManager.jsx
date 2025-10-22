import React, { createContext, useContext, useCallback, useRef } from 'react';

const ApiContext = createContext(null);

export const ApiProvider = ({ children }) => {
  const cacheRef = useRef(new Map());
  const pendingRequestsRef = useRef(new Map());

  const cachedRequest = useCallback(async (entityName, methodName, params, fetcher) => {
    const cacheKey = `${entityName}.${methodName}:${JSON.stringify(params)}`;
    
    if (cacheRef.current.has(cacheKey)) {
      const cached = cacheRef.current.get(cacheKey);
      const age = Date.now() - cached.timestamp;
      if (age < 30000) {
        return cached.data;
      }
    }

    if (pendingRequestsRef.current.has(cacheKey)) {
      return pendingRequestsRef.current.get(cacheKey);
    }

    const promise = fetcher()
      .then(data => {
        cacheRef.current.set(cacheKey, { data, timestamp: Date.now() });
        pendingRequestsRef.current.delete(cacheKey);
        return data;
      })
      .catch(error => {
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
    keysToDelete.forEach(key => cacheRef.current.delete(key));
  }, []);

  return (
    <ApiContext.Provider value={{ cachedRequest, clearCache }}>
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