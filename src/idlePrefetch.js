// Schedules idle-time prefetching of heavy vendor chunks to improve
// subsequent interaction performance without delaying initial paint.
// Uses requestIdleCallback when available, falling back to a timed delay.

export function scheduleIdlePrefetch() {
  const idle = window.requestIdleCallback || function (cb) {
    setTimeout(() => cb({ timeRemaining: () => 50 }), 150);
  };

  idle(() => {
    // Grouped imports mapped to the manualChunks configuration in vite.config.js
    const tasks = [
      () => import('recharts'), // vendor-charts (largest)
      () => import('@tanstack/react-query'), // vendor-query
      () => import('react-hook-form'), // vendor-forms
      () => import('zod'), // vendor-forms (schema)
      () => import('framer-motion'), // vendor-motion
      () => import('date-fns'), // vendor-utils (common date utils)
      () => import('clsx'), // vendor-utils (lightweight)
      () => import('tailwind-merge'), // vendor-utils
    ];

    let i = 0;
    const next = () => {
      if (i >= tasks.length) return;
      try {
        tasks[i++]();
      } catch (e) {
        if (import.meta?.env?.DEV) console.warn('[prefetch] failed', e);
      }
      if (i < tasks.length) setTimeout(next, 50);
    };
    next();
  });
}
