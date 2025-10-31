// Enhanced Performance Cache with Local Storage Persistence
class PerformanceCache {
  constructor() {
    this.memoryCache = new Map();
    this.requestQueue = [];
    this.isProcessing = false;
    this.rateLimitDelay = 150; // Slightly more conservative for production
    this.maxCacheSize = 200;
    
    // Load persisted cache from localStorage on startup
    this.loadPersistedCache();
  }

  // Cache key generation
  getCacheKey(entityName, method, params) {
    return `${entityName}-${method}-${JSON.stringify(params || {})}`;
  }

  // Check if cached data is valid (configurable TTL)
  isCacheValid(timestamp, ttl = 5 * 60 * 1000) { // 5 minutes default
    return Date.now() - timestamp < ttl;
  }

  // Load cache from localStorage
  loadPersistedCache() {
    try {
      const persistedCache = localStorage.getItem('aiShaCrmCache');
      if (persistedCache) {
        const parsed = JSON.parse(persistedCache);
        // Only load items that are still valid
        Object.entries(parsed).forEach(([key, value]) => {
          if (this.isCacheValid(value.timestamp, 10 * 60 * 1000)) { // 10 min for persisted
            this.memoryCache.set(key, value);
          }
        });
        // Removed console.log for production performance
      }
    } catch (error) {
      // Silent fail for cache loading - non-critical error
      if (import.meta.env.DEV) {
        console.warn('Could not load persisted cache:', error);
      }
    }
  }

  // Persist cache to localStorage (async for performance)
  persistCache() {
    // Use requestIdleCallback for non-blocking persistence
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        this._doPersist();
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => this._doPersist(), 0);
    }
  }

  _doPersist() {
    try {
      const cacheObject = {};
      this.memoryCache.forEach((value, key) => {
        if (this.isCacheValid(value.timestamp)) {
          cacheObject[key] = value;
        }
      });
      localStorage.setItem('aiShaCrmCache', JSON.stringify(cacheObject));
    } catch (error) {
      // Silent fail for cache persistence - non-critical error
      if (import.meta.env.DEV) {
        console.warn('Could not persist cache:', error);
      }
    }
  }

  // Get from cache with configurable TTL
  getFromCache(entityName, method, params = {}, ttl) {
    const key = this.getCacheKey(entityName, _method, params);
    const cached = this.memoryCache.get(key);
    
    if (cached && this.isCacheValid(cached.timestamp, ttl)) {
      // Cache hit - only log in dev mode
      if (import.meta.env.DEV) {
        console.log(`Cache hit: ${key}`);
      }
      return cached.data;
    }
    
    return null;
  }

  // Store in cache with automatic cleanup
  setCache(entityName, method, params = {}, data) {
    const key = this.getCacheKey(entityName, _method, params);
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Automatic cache size management
    if (this.memoryCache.size > this.maxCacheSize) {
      this.cleanupCache();
    }
    
    // Persist important data
    if (['User', 'Contact', 'Account', 'Lead'].includes(entityName)) {
      this.persistCache();
    }
  }

  // Intelligent cache cleanup
  cleanupCache() {
    const entries = Array.from(this.memoryCache.entries());
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest 25% of entries
    const toRemove = Math.floor(entries.length * 0.25);
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
    
    // Only log in dev mode
    if (import.meta.env.DEV) {
      console.log(`Cleaned up ${toRemove} cache entries`);
    }
  }

  // Clear specific entity cache
  clearEntityCache(entityName) {
    const keysToDelete = [];
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(entityName)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.memoryCache.delete(key));
    this.persistCache();
    
    // Only log in dev mode
    if (import.meta.env.DEV) {
      console.log(`Cleared ${keysToDelete.length} ${entityName} cache entries`);
    }
  }

  // Enhanced rate-limited request with retry logic
  async throttledRequest(requestFn, priority = 'normal') {
    return new Promise((resolve, reject) => {
      const request = { requestFn, resolve, reject, priority, retries: 0 };
      
      if (priority === 'high') {
        this.requestQueue.unshift(request); // High priority to front
      } else {
        this.requestQueue.push(request);
      }
      
      this.processQueue();
    });
  }

  // Enhanced queue processing with priority and retry logic
  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const { requestFn, resolve, reject, priority, retries } = this.requestQueue.shift();
      
      try {
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        if (error.response?.status === 429 && retries < 3) {
          // Exponential backoff for rate limits
          const delay = Math.min(2000 * Math.pow(2, retries), 10000);
          
          // Only log rate limiting in dev mode
          if (import.meta.env.DEV) {
            console.log(`Rate limited, retrying in ${delay}ms (attempt ${retries + 1})`);
          }
          
          setTimeout(() => {
            this.requestQueue.unshift({ requestFn, resolve, reject, priority, retries: retries + 1 });
            this.processQueue();
          }, delay);
          
          continue;
        } else {
          reject(error);
        }
      }
      
      // Adaptive delay based on queue size
      const delay = this.requestQueue.length > 10 ? this.rateLimitDelay * 2 : this.rateLimitDelay;
      await this.sleep(delay);
    }

    this.isProcessing = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Preload critical data
  async preloadCriticalData(user) {
    if (!user) return;
    
    // Only log in dev mode
    if (import.meta.env.DEV) {
      console.log('Preloading critical data...');
    }
    
    const preloadTasks = [
      // Load user's assigned contacts (high priority)
      () => this.cachedEntityCall('Contact', 'filter', { 
        filter: { assigned_to: user.email }, 
        limit: 50 
      }, 'high'),
      
      // Load recent activities (normal priority)
      () => this.cachedEntityCall('Activity', 'list', { 
        orderBy: '-created_date', 
        limit: 20 
      }),
      
      // Load accounts (normal priority)
      () => this.cachedEntityCall('Account', 'list', { 
        limit: 100 
      }),
    ];
    
    // Execute preload tasks without blocking
    preloadTasks.forEach(task => {
      task().catch(error => {
        // Only log preload failures in dev mode
        if (import.meta.env.DEV) {
          console.warn('Preload task failed:', error);
        }
      });
    });
  }

  // Enhanced cached entity call with TTL options
  async cachedEntityCall(entityName, method, params = {}, priority = 'normal', ttl) {
    // Try cache first with custom TTL for different data types
    const defaultTTL = this.getDefaultTTL(entityName, method);
    const cached = this.getFromCache(entityName, _method, params, ttl || defaultTTL);
    if (cached) {
      return cached;
    }

    // Make rate-limited request
    const data = await this.throttledRequest(async () => {
      const { [entityName]: Entity } = await import('@/api/entities');
      
      switch (method) {
        case 'list':
          return await Entity.list(params.orderBy || '-created_date', params.limit || 50, params.offset || 0);
        case 'filter':
          return await Entity.filter(params.filter || {}, params.orderBy || '-created_date', params.limit || 50);
        case 'get':
          return await Entity.get(params.id);
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    }, priority);

    // Cache the result
    this.setCache(entityName, method, params, data);
    return data;
  }

  // Get appropriate TTL based on data type
  getDefaultTTL(entityName, method) {
    const ttlConfig = {
      'User': 10 * 60 * 1000, // 10 minutes - changes less frequently
      'Contact': 3 * 60 * 1000, // 3 minutes - moderate updates
      'Account': 5 * 60 * 1000, // 5 minutes - changes less frequently
      'Lead': 2 * 60 * 1000, // 2 minutes - frequent updates
      'Activity': 1 * 60 * 1000, // 1 minute - very dynamic
      'Opportunity': 2 * 60 * 1000, // 2 minutes - frequent updates
    };
    
    return ttlConfig[entityName] || 3 * 60 * 1000; // 3 minutes default
  }

  // Get cache statistics
  getCacheStats() {
    const stats = {
      totalItems: this.memoryCache.size,
      queueSize: this.requestQueue.length,
      isProcessing: this.isProcessing,
      memoryUsage: JSON.stringify(Array.from(this.memoryCache.entries())).length
    };
    return stats;
  }
}

// Global performance cache instance
export const performanceCache = new PerformanceCache();