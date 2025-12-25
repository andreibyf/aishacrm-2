import { useRef, useMemo, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Custom hook for showing funny loading toasts
 * @returns {Object} Functions to show and dismiss loading toasts
 */
export function useLoadingToast() {
  const toastIdRef = useRef(null);
  const showTimeRef = useRef(null);

  const funnyMessages = [
    "🧙‍♂️ Summoning your data from the cloud...",
    "🚀 Launching metrics into orbit...",
    "🎰 Crunching numbers faster than a casino...",
    "🔮 Consulting the data crystal ball...",
    "📊 Polishing those charts to a shine...",
    "🎯 Aiming for your perfect data...",
    "⚡ Supercharging your insights...",
    "🎨 Painting your data picture...",
    "🧮 Calculating your success metrics...",
    "🎪 Setting up the data circus...",
    "🎭 Rehearsing your data performance...",
    "🎬 Rolling the data cameras...",
    "🎸 Tuning up the data orchestra...",
    "🎲 Rolling the data dice...",
    "🎺 Trumpeting your data arrival...",
    "🎻 Stringing together your records...",
    "🎹 Playing the data symphony...",
    "🎤 Mic check, data check...",
    "🎧 Mixing your data tracks...",
    "🎵 Composing your data melody..."
  ];

  const showLoading = useCallback((customMessage) => {
    const message = customMessage || funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
    showTimeRef.current = Date.now();
    toastIdRef.current = toast.loading(
      message,
      { 
        duration: Infinity,
        style: {
          background: 'rgba(30, 41, 59, 0.75)',
          color: '#a5b4fc',
          fontWeight: '600',
        }
      }
    );
    return toastIdRef.current;
  }, []);

  const showSuccess = useCallback((message = "Data loaded! ✨", options = {}) => {
    // Calculate minimum display time (500ms) for loading toast
    const minDisplayTime = 500;
    const elapsed = showTimeRef.current ? Date.now() - showTimeRef.current : minDisplayTime;
    const remainingTime = Math.max(0, minDisplayTime - elapsed);

    // Wait for minimum display time, then dismiss and show success
    setTimeout(() => {
    // CRITICAL: Dismiss ALL toasts first to prevent stacking
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
      // Dismiss any other loading toasts that might exist
      toast.dismiss();
      toastIdRef.current = null;
      showTimeRef.current = null;

      // Delay to ensure dismiss animations complete
      setTimeout(() => {
        toast.success(message, {
          duration: 1500,
          style: {
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#86efac',
            fontWeight: '600',
            border: '1px solid rgba(34, 197, 94, 0.3)',
          },
          ...options
        });
      }, 100);
    }, remainingTime);
  }, []);

  const showError = useCallback((message = "Failed to load data", options = {}) => {
    // Calculate minimum display time (500ms) for loading toast
    const minDisplayTime = 500;
    const elapsed = showTimeRef.current ? Date.now() - showTimeRef.current : minDisplayTime;
    const remainingTime = Math.max(0, minDisplayTime - elapsed);

    // Wait for minimum display time, then dismiss and show error
    setTimeout(() => {
    // CRITICAL: Dismiss ALL toasts first to prevent stacking
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
      // Dismiss any other loading toasts that might exist
      toast.dismiss();
      toastIdRef.current = null;
      showTimeRef.current = null;

      // Delay to ensure dismiss animations complete
      setTimeout(() => {
        toast.error(message, {
          style: {
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#fca5a5',
            fontWeight: '600',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          },
          ...options
        });
      }, 100);
    }, remainingTime);
  }, []);

  const dismiss = useCallback(() => {
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
      showTimeRef.current = null;
    }
  }, []);

  return useMemo(() => ({
    showLoading,
    showSuccess,
    showError,
    dismiss
  }), [showLoading, showSuccess, showError, dismiss]);
}
