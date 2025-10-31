
import { useEffect } from 'react';
import { performanceCache } from './PerformanceCache';
import { User } from '@/api/entities';

// UI Imports (assuming Shadcn/ui and lucide-react)
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, X } from 'lucide-react';

// Performance monitoring component
export const PerformanceMonitor = ({ children }) => {
  useEffect(() => {
    let observer; // Declare observer outside the if block so it's accessible in the cleanup function
    
    // Performance observer for Core Web Vitals
    if ('PerformanceObserver' in window) {
      observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'navigation') {
            console.log('Navigation timing:', {
              domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
              loadComplete: entry.loadEventEnd - entry.loadEventStart,
              totalTime: entry.loadEventEnd - entry.navigationStart
            });
          }
        });
      });
      
      try {
        observer.observe({ entryTypes: ['navigation', 'paint'] });
      } catch (_e) {
        console.warn('Performance observer not fully supported');
      }
    }

    return () => {
      // Disconnect observer only if it was successfully initialized
      if (observer) { 
        try {
          observer.disconnect();
        } catch (e) {
          // Observer already disconnected or other error during cleanup
          console.warn('Error disconnecting PerformanceObserver:', e);
        }
      }
    };
  }, []);

  return children;
};

// Data prefetching hook
export const useDataPrefetch = (user) => {
  useEffect(() => {
    if (user && user.tenant_id) {
      // Prefetch critical data in the background
      setTimeout(() => {
        performanceCache.preloadCriticalData(user);
      }, 1000); // Delay to avoid blocking initial render
    }
  }, [user?.tenant_id, user?.email, user]); // Added 'user' to dependency array for robustness
};

// Memoized user getter to avoid repeated API calls
export const useOptimizedUser = () => {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        // Try cache first
        const cachedUser = performanceCache.getFromCache('User', 'me', {}, 10 * 60 * 1000); // 10 min cache
        if (cachedUser) {
          setUser(cachedUser);
          setLoading(false);
          return;
        }

        // Load from API
        const userData = await performanceCache.throttledRequest(async () => {
          return await User.me();
        }, 'high');

        performanceCache.setCache('User', 'me', {}, userData);
        setUser(userData);
      } catch (error) {
        console.error('Failed to load user:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  return { user, loading };
};

// Component for displaying cache stats (admin only) - now inline instead of floating
export const CacheStats = ({ user }) => {
  const [stats, setStats] = React.useState({ hitRate: 0, totalRequests: 0, memoryUsage: 0, cacheSize: 0 });
  const [showDetails, setShowDetails] = React.useState(false);

  React.useEffect(() => {
    if (user?.role === 'admin') {
      // Immediately get stats on mount to avoid initial empty state
      setStats(performanceCache.getCacheStats());

      const interval = setInterval(() => {
        setStats(performanceCache.getCacheStats());
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [user?.role]);

  if (user?.role !== 'admin') {
    return null;
  }

  // Render as inline badge
  if (!showDetails) {
    return (
      <Badge 
        variant="outline"
        className="cursor-pointer hover:bg-slate-100 text-xs"
        onClick={() => setShowDetails(true)}
      >
        <Database className="w-3 h-3 mr-1" />
        Cache {stats.hitRate}%
      </Badge>
    );
  }

  // Expanded details
  return (
    <div className="fixed top-20 right-[150px] z-40 w-72"> {/* Changed right-150 to right-[150px] for explicit CSS */}
      <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4" />
              Cache Performance
            </CardTitle>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowDetails(false)}
              className="h-6 w-6"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-600">Hit Rate</p>
              <p className="font-bold text-green-600">{stats.hitRate}%</p>
            </div>
            <div>
              <p className="text-slate-600">Total Requests</p>
              <p className="font-bold">{stats.totalRequests}</p>
            </div>
            <div>
              <p className="text-slate-600">Memory Usage</p>
              <p className="font-bold text-blue-600">{stats.memoryUsage}%</p>
            </div>
            <div>
              <p className="text-slate-600">Cache Size</p>
              <p className="font-bold">{stats.cacheSize || 0}</p>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              performanceCache.clearCache(); // Assuming performanceCache has a clearCache method
              setStats(performanceCache.getCacheStats());
            }}
            className="w-full text-xs"
          >
            Clear Cache
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

// Emergency cache clear function
export const clearAllCache = () => {
  performanceCache.memoryCache.clear();
  localStorage.removeItem('aiShaCrmCache');
  console.log('All cache cleared');
};
