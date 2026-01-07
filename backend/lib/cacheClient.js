/**
 * Cache Client Wrapper
 * Provides a unified interface to the Redis cache for backwards compatibility
 * Wraps cacheManager.js to provide getCacheClient() function
 */

import cacheManager from './cacheManager.js';
import logger from './logger.js';

/**
 * Initialize cache client (connects if not already connected)
 * @returns {Promise<object>} Redis client instance
 */
export async function getCacheClient() {
  try {
    // Ensure cache manager is connected
    if (!cacheManager.connected) {
      await cacheManager.connect();
    }
    
    // Return the underlying Redis client
    if (!cacheManager.client) {
      throw new Error('Cache manager client not initialized');
    }
    
    return cacheManager.client;
  } catch (error) {
    logger.error('[CacheClient] Failed to get cache client:', error.message);
    throw error;
  }
}

export default { getCacheClient };
