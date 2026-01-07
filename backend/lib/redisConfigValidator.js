/**
 * Redis Configuration Validator
 * Validates Redis eviction policies and provides recommendations
 */

import logger from './logger.js';

/**
 * Recommended Redis eviction policies by use case
 */
export const REDIS_POLICIES = {
  // For cache that can tolerate data loss (API responses, temporary data)
  CACHE: 'allkeys-lru',
  
  // For memory/session storage that should never evict (critical data)
  MEMORY: 'noeviction',
  
  // For volatile keys only (TTL-based eviction)
  VOLATILE: 'volatile-lru'
};

/**
 * Check and log Redis configuration
 * @param {object} redisClient - Connected Redis client
 * @param {string} purpose - Purpose of this Redis instance ('cache', 'memory', 'queue')
 * @returns {Promise<object>} Configuration details
 */
export async function validateRedisConfig(redisClient, purpose = 'cache') {
  if (!redisClient || typeof redisClient.configGet !== 'function') {
    logger.warn(`[RedisConfig] Cannot validate ${purpose} Redis - client not available`);
    return { validated: false, reason: 'client_unavailable' };
  }

  try {
    // Get current eviction policy
    const policyResult = await redisClient.configGet('maxmemory-policy');
    const currentPolicy = policyResult?.['maxmemory-policy'] || 'unknown';

    // Get max memory setting
    const maxMemResult = await redisClient.configGet('maxmemory');
    const maxMemory = maxMemResult?.['maxmemory'] || '0';

    // Determine recommended policy based on purpose
    let recommendedPolicy;
    let severity = 'info';

    switch (purpose) {
      case 'cache':
        recommendedPolicy = REDIS_POLICIES.CACHE;
        // Cache can use LRU policies - this is expected
        if (currentPolicy.includes('lru')) {
          severity = 'info';
        }
        break;

      case 'memory':
      case 'session':
        recommendedPolicy = REDIS_POLICIES.MEMORY;
        // Memory storage should use noeviction to prevent data loss
        if (currentPolicy !== 'noeviction') {
          severity = 'warn';
        }
        break;

      case 'queue':
        recommendedPolicy = REDIS_POLICIES.VOLATILE;
        break;

      default:
        recommendedPolicy = REDIS_POLICIES.CACHE;
    }

    const result = {
      validated: true,
      purpose,
      currentPolicy,
      recommendedPolicy,
      maxMemory: parseInt(maxMemory, 10),
      matches: currentPolicy === recommendedPolicy,
      severity
    };

    // Log based on severity
    if (severity === 'warn' && !result.matches) {
      logger.warn({
        purpose,
        currentPolicy,
        recommendedPolicy,
        maxMemory: result.maxMemory
      }, `[RedisConfig] ${purpose} Redis using ${currentPolicy} policy (recommended: ${recommendedPolicy})`);
    } else {
      logger.info({
        purpose,
        currentPolicy,
        maxMemory: result.maxMemory
      }, `[RedisConfig] ${purpose} Redis configuration validated`);
    }

    return result;
  } catch (error) {
    logger.error({ err: error, purpose }, '[RedisConfig] Failed to validate configuration');
    return { validated: false, error: error.message };
  }
}

/**
 * Set Redis eviction policy (use with caution in production)
 * @param {object} redisClient - Connected Redis client
 * @param {string} policy - Policy to set
 * @returns {Promise<boolean>} Success status
 */
export async function setRedisPolicy(redisClient, policy) {
  try {
    await redisClient.configSet('maxmemory-policy', policy);
    logger.info({ policy }, '[RedisConfig] Eviction policy updated');
    return true;
  } catch (error) {
    logger.error({ err: error, policy }, '[RedisConfig] Failed to set policy');
    return false;
  }
}

/**
 * Get Redis info for diagnostics
 * @param {object} redisClient - Connected Redis client
 * @returns {Promise<object>} Redis server info
 */
export async function getRedisInfo(redisClient) {
  try {
    const info = await redisClient.info('server');
    const memory = await redisClient.info('memory');
    const stats = await redisClient.info('stats');

    return {
      info: parseRedisInfo(info),
      memory: parseRedisInfo(memory),
      stats: parseRedisInfo(stats)
    };
  } catch (error) {
    logger.error({ err: error }, '[RedisConfig] Failed to get Redis info');
    return null;
  }
}

/**
 * Parse Redis INFO command output into object
 * @param {string} infoString - Raw INFO output
 * @returns {object} Parsed info
 */
function parseRedisInfo(infoString) {
  const lines = infoString.split('\r\n');
  const result = {};

  for (const line of lines) {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split(':');
      if (key && value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result;
}
