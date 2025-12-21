/**
 * Redis Cache Manager for API responses
 * Handles caching for Accounts, Leads, Contacts, and BizDev Sources
 */

import { createClient } from 'redis';
import crypto from 'crypto';

class CacheManager {
  constructor() {
    this.client = null;
    this.connected = false;
    this.defaultTTL = {
      list: 180,        // 3 minutes for list data
      detail: 300,      // 5 minutes for detail views
      count: 600,       // 10 minutes for counts
      settings: 1800,   // 30 minutes for settings
    };
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    if (this.connected) return;

    const redisUrl = process.env.REDIS_CACHE_URL || 'redis://localhost:6380';
    
    try {
      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('[CacheManager] Max reconnection attempts reached');
              return new Error('Max reconnection attempts');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => {
        console.error('[CacheManager] Redis error:', err);
        this.connected = false;
      });

      this.client.on('connect', () => {
        console.log('[CacheManager] Redis cache connected');
        this.connected = true;
      });

      this.client.on('disconnect', () => {
        console.log('[CacheManager] Redis cache disconnected');
        this.connected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.error('[CacheManager] Failed to connect:', error);
      this.connected = false;
    }
  }

  /**
   * Generate cache key from parameters
   */
  generateKey(module, tenantId, operation, params = {}) {
    const paramsHash = crypto
      .createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex')
      .substring(0, 8);
    
    return `tenant:${tenantId}:${module}:${operation}:${paramsHash}`;
  }

  /**
   * Get cached data
   */
  async get(key) {
    if (!this.connected) return null;

    try {
      const data = await this.client.get(key);
      if (!data) return null;

      const parsed = JSON.parse(data);
      
      // Check if expired
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        await this.client.del(key);
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error('[CacheManager] Get error:', error);
      return null;
    }
  }

  /**
   * Set cached data with TTL
   */
  async set(key, data, ttl = null) {
    if (!this.connected) return false;

    try {
      const ttlSeconds = ttl || this.defaultTTL.list;
      const cacheData = {
        data,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (ttlSeconds * 1000)
      };

      await this.client.setEx(key, ttlSeconds, JSON.stringify(cacheData));
      return true;
    } catch (error) {
      console.error('[CacheManager] Set error:', error);
      return false;
    }
  }

  /**
   * Delete specific cache key
   */
  async del(key) {
    if (!this.connected) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('[CacheManager] Delete error:', error);
      return false;
    }
  }

  /**
   * Invalidate all cache for a tenant's module
   */
  async invalidateTenant(tenantId, module) {
    if (!this.connected) return false;

    try {
      const pattern = `tenant:${tenantId}:${module}:*`;
      const keys = [];
      
      // Scan for matching keys
      for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(key);
      }

      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`[CacheManager] Invalidated ${keys.length} keys for tenant ${tenantId} module ${module}`);
      }

      return true;
    } catch (error) {
      console.error('[CacheManager] Invalidate error:', error);
      return false;
    }
  }

  /**
   * Invalidate all cache for a tenant (all modules)
   */
  async invalidateAllTenant(tenantId) {
    if (!this.connected) return false;

    try {
      const pattern = `tenant:${tenantId}:*`;
      const keys = [];
      
      for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(key);
      }

      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`[CacheManager] Invalidated ${keys.length} keys for tenant ${tenantId}`);
      }

      return true;
    } catch (error) {
      console.error('[CacheManager] Invalidate all error:', error);
      return false;
    }
  }

  /**
   * Cache wrapper for list queries (accounts, leads, contacts, bizdev)
   */
  async getOrFetch(module, tenantId, operation, params, fetchFn, ttl = null) {
    const key = this.generateKey(module, tenantId, operation, params);
    
    // Try cache first
    const cached = await this.get(key);
    if (cached !== null) {
      console.log(`[CacheManager] Cache hit: ${key}`);
      return { data: cached, cached: true };
    }

    // Cache miss - fetch from database
    console.log(`[CacheManager] Cache miss: ${key}`);
    const data = await fetchFn();
    
    // Cache the result
    await this.set(key, data, ttl);
    
    return { data, cached: false };
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.connected) return null;

    try {
      const info = await this.client.info('stats');
      const memory = await this.client.info('memory');
      
      return {
        connected: this.connected,
        info,
        memory
      };
    } catch (error) {
      console.error('[CacheManager] Stats error:', error);
      return null;
    }
  }

  /**
   * Flush all cache (for dev mode startup or manual cache clear)
   */
  async flushAll() {
    if (!this.connected) return false;

    try {
      await this.client.flushAll();
      console.log('[CacheManager] All cache flushed');
      return true;
    } catch (error) {
      console.error('[CacheManager] FlushAll error:', error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

// Singleton instance
const cacheManager = new CacheManager();

export default cacheManager;
