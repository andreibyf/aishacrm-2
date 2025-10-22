import { useState, useEffect, useRef } from 'react';
import { useApiOptimizer } from './ApiOptimizer';

/**
 * Hook for lazy loading data with intersection observer
 */
export function useLazyLoad(queryFn, options = {}) {
  const {
    enabled = true,
    threshold = 0.1,
    rootMargin = '50px',
    delay = 0,
  } = options;

  const { lazyLoad } = useApiOptimizer();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  // Intersection Observer
  useEffect(() => {
    if (!enabled || !ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [enabled, threshold, rootMargin]);

  // Load data when visible
  useEffect(() => {
    if (!isVisible || !enabled || loading || data) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await lazyLoad(queryFn, delay);
        setData(result);
      } catch (err) {
        setError(err);
        console.error('Lazy load failed:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isVisible, enabled, loading, data, queryFn, delay, lazyLoad]);

  return { ref, data, loading, error, isVisible };
}