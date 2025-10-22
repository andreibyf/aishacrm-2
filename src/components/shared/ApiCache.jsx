// API Cache and Rate Limiting Utility
class ApiCache {
  constructor() {
    this.cache = new Map();
    this.requestQueue = [];
    this.isProcessing = false;
    this.rateLimitDelay = 100; // 100ms between requests
  }

  // Generate cache key
  getCacheKey(entityName, method, params) {
    return `${entityName}-${method}-${JSON.stringify(params || {})}`;
  }

  // Check if cached data is valid (5 minutes cache)
  isCacheValid(timestamp) {
    return Date.now() - timestamp < 5 * 60 * 1000; // 5 minutes
  }

  // Get from cache if valid
  getFromCache(entityName, method, params = {}) {
    const key = this.getCacheKey(entityName, method, params);
    const cached = this.cache.get(key);
    
    if (cached && this.isCacheValid(cached.timestamp)) {
      console.log(`Cache hit for ${key}`);
      return cached.data;
    }
    
    return null;
  }

  // Store in cache
  setCache(entityName, method, params = {}, data) {
    const key = this.getCacheKey(entityName, method, params);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  // Clear cache for specific entity
  clearCache(entityName) {
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(entityName)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Rate limited API call
  async throttledRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  // Process request queue with rate limiting
  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const { requestFn, resolve, reject } = this.requestQueue.shift();
      
      try {
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        if (error.response?.status === 429) {
          console.warn('Rate limit hit, waiting longer...');
          await this.sleep(2000); // Wait 2 seconds on rate limit
          // Re-queue the request
          this.requestQueue.unshift({ requestFn, resolve, reject });
        } else {
          reject(error);
        }
      }
      
      // Always wait between requests
      await this.sleep(this.rateLimitDelay);
    }

    this.isProcessing = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cached entity call with rate limiting
  async cachedEntityCall(entity, method, params = {}) {
    const entityName = entity.constructor.name || 'Unknown';
    
    // Try cache first
    const cached = this.getFromCache(entityName, method, params);
    if (cached) {
      return cached;
    }

    // Make rate-limited request
    const data = await this.throttledRequest(async () => {
      switch (method) {
        case 'list':
          return await entity.list(params.orderBy || '-created_date', params.limit || 50);
        case 'filter':
          return await entity.filter(params.filter || {}, params.orderBy || '-created_date', params.limit || 50);
        case 'get':
          return await entity.get(params.id);
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    });

    // Cache the result
    this.setCache(entityName, method, params, data);
    return data;
  }
}

// Global cache instance
export const apiCache = new ApiCache();