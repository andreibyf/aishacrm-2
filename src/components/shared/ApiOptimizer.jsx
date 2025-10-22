import React, { createContext, useContext, useRef, useCallback } from 'react';

const ApiOptimizerContext = createContext(null);

export const ApiOptimizerProvider = ({ children }) => {
  const requestQueueRef = useRef([]);
  const processingRef = useRef(false);
  const batchTimeoutRef = useRef(null);

  const queueRequest = useCallback((request) => {
    return new Promise((resolve, reject) => {
      requestQueueRef.current.push({ request, resolve, reject });
      
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }

      batchTimeoutRef.current = setTimeout(() => {
        processQueue();
      }, 50);
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || requestQueueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;
    const batch = requestQueueRef.current.splice(0, 5);

    for (const { request, resolve, reject } of batch) {
      try {
        const result = await request();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    processingRef.current = false;

    if (requestQueueRef.current.length > 0) {
      setTimeout(processQueue, 100);
    }
  }, []);

  return (
    <ApiOptimizerContext.Provider value={{ queueRequest }}>
      {children}
    </ApiOptimizerContext.Provider>
  );
};

export const useApiOptimizer = () => {
  const context = useContext(ApiOptimizerContext);
  if (!context) {
    return { queueRequest: (req) => req() };
  }
  return context;
};