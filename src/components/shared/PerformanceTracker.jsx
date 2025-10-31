/* eslint-disable react-refresh/only-export-components */
import { useRef } from 'react'
import { PerformanceLog } from '@/api/entities';

// Track performance of function calls
export function usePerformanceTracker(functionName, enabled = true) {
  const startTimeRef = useRef(null);

  const start = () => {
    if (!enabled) return;
    startTimeRef.current = Date.now();
  };

  const end = async (status = 'success', errorMessage = null, additionalData = {}) => {
    if (!enabled || !startTimeRef.current) return;

    const responseTime = Date.now() - startTimeRef.current;
    startTimeRef.current = null;

    // Only log if significant time or error
    if (responseTime < 100 && status === 'success') {
      return;
    }

  try {
      // Silently create performance log - don't throw if it fails
      await PerformanceLog.create({
        function_name: functionName,
        response_time_ms: responseTime,
        status,
        error_message: errorMessage,
        payload: additionalData.payload || {},
        response: additionalData.response || {}
      }).catch(() => {
        // Silently ignore performance logging failures
      });
    } catch {
      // Silently ignore - performance logging shouldn't break the app
    }
  };

  return { start, end };
}

// Higher-order function to wrap async functions with performance tracking
export function withPerformanceTracking(fn, functionName, enabled = true) {
  return async (...args) => {
    if (!enabled) {
      return fn(...args);
    }

    const startTime = Date.now();
    
    try {
      const result = await fn(...args);
      const responseTime = Date.now() - startTime;
      
      // Only log slow operations (>1s) or errors
      if (responseTime > 1000) {
        try {
          await PerformanceLog.create({
            function_name: functionName,
            response_time_ms: responseTime,
            status: 'success'
          }).catch(() => {});
        } catch {
          // Silently ignore
        }
      }
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      try {
        await PerformanceLog.create({
          function_name: functionName,
          response_time_ms: responseTime,
          status: 'error',
          error_message: error?.message || 'Unknown error'
        }).catch(() => {});
      } catch {
        // Silently ignore
      }
      
      throw error;
    }
  };
}

export default function PerformanceTracker() {
  // This component doesn't render anything, just provides the hooks
  return null;
}