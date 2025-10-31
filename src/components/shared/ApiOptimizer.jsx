import { createContext, useRef, useCallback } from 'react'

const ApiOptimizerContext = createContext(null);

export const ApiOptimizerProvider = ({ children }) => {
  const requestQueueRef = useRef([]);
  const processingRef = useRef(false);
  const batchTimeoutRef = useRef(null);

  const processQueue = useCallback(async () => {
    if (processingRef.current || requestQueueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;
    const batch = requestQueueRef.current.splice(0, 5); // Process up to 5 requests at a time
    
    const processItem = async (item) => {
      try {
        const { request, resolve } = item;
        const result = await request();
        resolve(result);
      } catch (error) {
        item.reject(error);
      }
    };

    await Promise.all(batch.map(processItem));

    processingRef.current = false;
  }, []);

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
  }, [processQueue]);

  return (
    <ApiOptimizerContext.Provider value={{ queueRequest }}>
      {children}
    </ApiOptimizerContext.Provider>
  );
};
