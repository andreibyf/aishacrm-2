import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * LazyWidgetLoader - Progressively loads dashboard widgets with intersection observer
 * @param {React.Component} component - The widget component to load
 * @param {number} delay - Delay before loading (ms)
 * @param {object} props - Props to pass to the widget
 */
export default function LazyWidgetLoader({ component: Component, delay = 0, ...props }) {
  const [shouldLoad, setShouldLoad] = useState(delay === 0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  // Delay-based loading
  useEffect(() => {
    if (delay > 0) {
      const timer = setTimeout(() => setShouldLoad(true), delay);
      return () => clearTimeout(timer);
    }
  }, [delay]);

  // Intersection observer for viewport visibility
  useEffect(() => {
    if (!shouldLoad) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' } // Start loading 100px before entering viewport
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [shouldLoad]);

  if (!shouldLoad || !isVisible) {
    return (
      <div ref={ref} className="min-h-[200px]">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="flex items-center justify-center h-[200px]">
            <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Component {...props} />;
}