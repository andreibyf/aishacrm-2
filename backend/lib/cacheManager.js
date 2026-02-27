/**
 * Redis Cache Manager for API responses
 * Handles caching for Accounts, Leads, Contacts, and BizDev Sources
 */

import { createClient } from 'redis';
import crypto from 'crypto';
import logger from './logger.js';

class CacheManager {
  constructor() {
    this.client = null;
    this.connected = false;
    this.defaultTTL = {
      list: 30, // 30 seconds for list data (reduced from 180s - app perf improved)
      detail: 60, // 1 minute for detail views (reduced from 300s)
      count: 120, // 2 minutes for counts (reduced from 600s)
      settings: 1800, // 30 minutes for settings (unchanged - rarely mutated)
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
              logger.error('[CacheManager] Max reconnection attempts reached');
              return new Error('Max reconnection attempts');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.client.on('error', (err) => {
        logger.error({ err }, '[CacheManager] Redis error');
        this.connected = false;
      });

      this.client.on('connect', () => {
        logger.info('[CacheManager] Redis cache connected');
        this.connected = true;
      });

      this.client.on('disconnect', () => {
        logger.info('[CacheManager] Redis cache disconnected');
        this.connected = false;
      });

      await this.client.connect();
    } catch (error) {
      logger.error({ err: error }, '[CacheManager] Failed to connect');
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
      logger.error({ err: error }, '[CacheManager] Get error');
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
        expiresAt: Date.now() + ttlSeconds * 1000,
      };

      await this.client.setEx(key, ttlSeconds, JSON.stringify(cacheData));
      return true;
    } catch (error) {
      logger.error({ err: error }, '[CacheManager] Set error');
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
      logger.error({ err: error }, '[CacheManager] Delete error');
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
        logger.debug(
          { tenantId, module, count: keys.length },
          '[CacheManager] Invalidated keys for tenant module',
        );
      }

      return true;
    } catch (error) {
      logger.error({ err: error, tenantId, module }, '[CacheManager] Invalidate error');
      return false;
    }
  }

  /**
   * Invalidate dashboard bundle cache for a tenant
   * Called when CRM entities are mutated to ensure dashboard reflects changes
   */
  async invalidateDashboard(tenantId) {
    if (!this.connected) return false;

    try {
      // Dashboard bundle keys use pattern: dashboard:bundle:${tenant_id}:*
      const pattern = `dashboard:bundle:${tenantId}:*`;
      const keys = [];

      for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(key);
      }

      if (keys.length > 0) {
        await this.client.del(keys);
        logger.debug(
          { tenantId, count: keys.length },
          '[CacheManager] Invalidated dashboard bundle keys',
        );
      }

      return true;
    } catch (error) {
      logger.error({ err: error, tenantId }, '[CacheManager] Dashboard invalidate error');
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
        logger.debug(
          { tenantId, count: keys.length },
          '[CacheManager] Invalidated keys for tenant',
        );
      }

      return true;
    } catch (error) {
      logger.error({ err: error, tenantId }, '[CacheManager] Invalidate all error');
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
      logger.debug({ key }, '[CacheManager] Cache hit');
      return { data: cached, cached: true };
    }

    // Cache miss - fetch from database
    logger.debug({ key }, '[CacheManager] Cache miss');
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
        memory,
      };
    } catch (error) {
      logger.error({ err: error }, '[CacheManager] Stats error');
      return null;
    }
  }

  /**
   * Increment a numeric value in Redis (for counters)
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<number|null>} New value after increment, or null if error
   */
  async increment(key, ttl = null) {
    if (!this.connected) return null;

    try {
      const newValue = await this.client.incr(key);

      // Set TTL if this is the first increment (value is 1)
      if (ttl && newValue === 1) {
        await this.client.expire(key, ttl);
      }

      return newValue;
    } catch (error) {
      logger.error({ err: error, key }, '[CacheManager] Increment error');
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
      logger.info('[CacheManager] All cache flushed');
      return true;
    } catch (error) {
      logger.error({ err: error }, '[CacheManager] FlushAll error');
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
