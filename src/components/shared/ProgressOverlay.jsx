/**
 * ProgressOverlay - Global progress indicator for long-running operations
 * 
 * Usage:
 *   import { useProgress } from '@/components/shared/ProgressOverlay';
 * 
 *   const { startProgress, updateProgress, completeProgress } = useProgress();
 *   
 *   // For indeterminate progress (spinner only)
 *   startProgress({ message: 'Deleting activities...' });
 *   
 *   // For determinate progress (with progress bar)
 *   startProgress({ message: 'Deleting activities...', total: 100 });
 *   updateProgress({ current: 50, message: 'Deleted 50 of 100...' });
 *   
 *   // When done
 *   completeProgress();
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

// Context for global progress state
const ProgressContext = createContext(null);

// Delay before showing overlay (prevents flash for quick operations)
const SHOW_DELAY_MS = 500;

/**
 * Progress state shape:
 * {
 *   isActive: boolean,
 *   message: string,
 *   current: number,
 *   total: number | null,  // null = indeterminate
 *   startTime: number,
 * }
 */

export function ProgressProvider({ children }) {
  const [progress, setProgress] = useState({
    isActive: false,
    isVisible: false,  // Delayed visibility
    message: '',
    current: 0,
    total: null,
    startTime: null,
  });
  
  const showTimeoutRef = useRef(null);
  
  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
      }
    };
  }, []);
  
  const startProgress = useCallback(({ message = 'Processing...', total = null } = {}) => {
    // Clear any pending show timeout
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
    }
    
    setProgress({
      isActive: true,
      isVisible: false,  // Start hidden
      message,
      current: 0,
      total,
      startTime: Date.now(),
    });
    
    // Show after delay (prevents flash for quick operations)
    showTimeoutRef.current = setTimeout(() => {
      setProgress(prev => prev.isActive ? { ...prev, isVisible: true } : prev);
    }, SHOW_DELAY_MS);
  }, []);
  
  const updateProgress = useCallback(({ current, message, total } = {}) => {
    setProgress(prev => ({
      ...prev,
      current: current ?? prev.current,
      message: message ?? prev.message,
      total: total ?? prev.total,
    }));
  }, []);
  
  const completeProgress = useCallback(() => {
    // Clear any pending show timeout
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    
    setProgress({
      isActive: false,
      isVisible: false,
      message: '',
      current: 0,
      total: null,
      startTime: null,
    });
  }, []);
  
  const value = {
    progress,
    startProgress,
    updateProgress,
    completeProgress,
  };
  
  return (
    <ProgressContext.Provider value={value}>
      {children}
      <ProgressOverlayUI />
    </ProgressContext.Provider>
  );
}

/**
 * Hook to access progress functions
 */
export function useProgress() {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
}

/**
 * The actual overlay UI component
 */
function ProgressOverlayUI() {
  const { progress } = useProgress();
  
  if (!progress.isActive || !progress.isVisible) {
    return null;
  }
  
  const percentage = progress.total 
    ? Math.round((progress.current / progress.total) * 100)
    : null;
  
  const elapsed = progress.startTime 
    ? Math.round((Date.now() - progress.startTime) / 1000)
    : 0;
  
  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 min-w-[320px] max-w-[480px] mx-4">
        {/* Spinner */}
        <div className="flex items-center justify-center mb-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
        
        {/* Message */}
        <h2 
          id="progress-title"
          className="text-center text-lg font-medium text-gray-900 dark:text-gray-100 mb-3"
        >
          {progress.message}
        </h2>
        
        {/* Progress bar (only for determinate progress) */}
        {progress.total && (
          <div className="space-y-2">
            <Progress value={percentage} className="h-2" />
            <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>{progress.current} of {progress.total}</span>
              <span>{percentage}%</span>
            </div>
          </div>
        )}
        
        {/* Elapsed time for long operations */}
        {elapsed >= 3 && (
          <p className="text-center text-sm text-gray-400 mt-3">
            Elapsed: {elapsed}s
          </p>
        )}
        
        {/* Note about not closing */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Please wait, do not close this window...
        </p>
      </div>
    </div>
  );
}

/**
 * Utility wrapper for async operations with automatic progress
 * 
 * Usage:
 *   const result = await withProgress(
 *     async (updateFn) => {
 *       for (let i = 0; i < items.length; i++) {
 *         await processItem(items[i]);
 *         updateFn({ current: i + 1 });
 *       }
 *       return 'done';
 *     },
 *     { message: 'Processing items...', total: items.length }
 *   );
 */
export function createProgressRunner(startProgress, updateProgress, completeProgress) {
  return async function withProgress(asyncFn, { message, total } = {}) {
    try {
      startProgress({ message, total });
      const result = await asyncFn(updateProgress);
      return result;
    } finally {
      completeProgress();
    }
  };
}

export default ProgressProvider;
