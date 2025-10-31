/* eslint-disable react-refresh/only-export-components */
import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";

// Loading fallback component
const PageLoadingFallback = ({ pageName }) => (
  <div className="flex items-center justify-center min-h-[400px]">
    <Card className="shadow-lg">
      <CardContent className="flex items-center gap-4 p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <div>
          <p className="font-semibold text-slate-900">Loading {pageName}...</p>
          <p className="text-sm text-slate-500">Optimizing performance...</p>
        </div>
      </CardContent>
    </Card>
  </div>
);

// HOC for lazy loading pages with performance tracking
export const withLazyLoading = (importFn, pageName) => {
  const LazyComponent = React.lazy(() => {
    const startTime = performance.now();
    return importFn().then(module => {
      const loadTime = performance.now() - startTime;
      console.log(`${pageName} loaded in ${loadTime.toFixed(2)}ms`);
      return module;
    });
  });

  const LazyWrapped = React.forwardRef((props, ref) => (
    <Suspense fallback={<PageLoadingFallback pageName={pageName} />}>
      <LazyComponent {...props} ref={ref} />
    </Suspense>
  ));

  // Friendly display name for debugging / dev tools and to satisfy lint rules
  LazyWrapped.displayName = `Lazy(${pageName || 'Component'})`;

  return LazyWrapped;
};

// Preload page on hover (optional optimization)
export const preloadPage = (importFn) => {
  let preloaded = false;
  return () => {
    if (!preloaded) {
      preloaded = true;
      importFn().catch(() => {
        preloaded = false; // Reset on error
      });
    }
  };
};