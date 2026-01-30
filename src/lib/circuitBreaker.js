/**
 * Circuit Breaker Utility
 * 
 * Provides resilient integration patterns with automatic failover,
 * metrics tracking, and observability for external dependencies.
 * 
 * Features:
 * - Automatic circuit breaking on repeated failures
 * - Exponential backoff for retries
 * - Comprehensive metrics and state tracking
 * - Event-based logging for observability
 * - Configurable thresholds and timeouts
 */

import CircuitBreaker from 'opossum';

/**
 * Circuit breaker metrics store
 * Tracks all circuit breaker instances and their states
 */
class CircuitBreakerMetrics {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Register a circuit breaker for metrics tracking
   */
  register(name, breaker) {
    this.breakers.set(name, {
      breaker,
      stats: {
        failures: 0,
        successes: 0,
        timeouts: 0,
        fallbacks: 0,
        circuitOpened: 0,
        lastStateChange: null,
      }
    });

    // Attach event listeners for metrics
    this.attachMetricsListeners(name, breaker);
  }

  /**
   * Attach event listeners to track metrics
   */
  attachMetricsListeners(name, breaker) {
    const stats = this.breakers.get(name).stats;

    breaker.on('success', () => {
      stats.successes++;
    });

    breaker.on('failure', () => {
      stats.failures++;
    });

    breaker.on('timeout', () => {
      stats.timeouts++;
    });

    breaker.on('fallback', () => {
      stats.fallbacks++;
    });

    breaker.on('open', () => {
      stats.circuitOpened++;
      stats.lastStateChange = new Date().toISOString();
      if (import.meta.env.DEV) {
        console.warn(`⚠️  Circuit breaker "${name}" opened - too many failures`);
      }
    });

    breaker.on('halfOpen', () => {
      stats.lastStateChange = new Date().toISOString();
      if (import.meta.env.DEV) {
        console.info(`🔄 Circuit breaker "${name}" half-open - testing recovery`);
      }
    });

    breaker.on('close', () => {
      stats.lastStateChange = new Date().toISOString();
      if (import.meta.env.DEV) {
        console.log(`✅ Circuit breaker "${name}" closed - service recovered`);
      }
    });
  }

  /**
   * Get metrics for a specific circuit breaker
   */
  getMetrics(name) {
    const entry = this.breakers.get(name);
    if (!entry) return null;

    return {
      name,
      state: entry.breaker.opened ? 'open' : entry.breaker.halfOpen ? 'half-open' : 'closed',
      stats: { ...entry.stats },
      health: {
        errorRate: this.calculateErrorRate(entry.stats),
        isHealthy: !entry.breaker.opened,
      }
    };
  }

  /**
   * Get metrics for all circuit breakers
   */
  getAllMetrics() {
    const metrics = {};
    for (const [name] of this.breakers) {
      metrics[name] = this.getMetrics(name);
    }
    return metrics;
  }

  /**
   * Calculate error rate percentage
   */
  calculateErrorRate(stats) {
    const total = stats.successes + stats.failures + stats.timeouts;
    if (total === 0) return '0';
    return ((stats.failures + stats.timeouts) / total * 100).toFixed(2);
  }

  /**
   * Reset metrics for a specific circuit breaker
   */
  resetMetrics(name) {
    const entry = this.breakers.get(name);
    if (entry) {
      entry.stats = {
        failures: 0,
        successes: 0,
        timeouts: 0,
        fallbacks: 0,
        circuitOpened: 0,
        lastStateChange: null,
      };
    }
  }
}

// Global metrics instance
export const metrics = new CircuitBreakerMetrics();

/**
 * Default circuit breaker options
 * These can be overridden per-breaker
 */
const DEFAULT_OPTIONS = {
  timeout: 5000,                    // Request timeout in ms
  errorThresholdPercentage: 50,     // % of failures to open circuit
  resetTimeout: 30000,              // Time before attempting to close circuit (ms)
  rollingCountTimeout: 10000,       // Time window for failure counting (ms)
  rollingCountBuckets: 10,          // Number of buckets in rolling window
  volumeThreshold: 5,               // Minimum requests before circuit can open
  name: 'default',                  // Circuit breaker name for logging
};

/**
 * Exponential backoff calculator with jitter
 * Prevents thundering herd problem
 */
export function calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Create a circuit breaker with retry logic and exponential backoff
 * 
 * @param {Function} primaryFn - Primary function to execute
 * @param {Object} options - Circuit breaker configuration
 * @param {string} options.name - Name for this circuit breaker
 * @param {number} options.timeout - Request timeout in ms
 * @param {number} options.errorThresholdPercentage - Failure % to open circuit
 * @param {number} options.resetTimeout - Time before retry (ms)
 * @returns {CircuitBreaker} Configured circuit breaker instance
 */
export function createCircuitBreaker(primaryFn, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  // Wrap primary function with retry logic if configured
  const wrappedFn = config.maxRetries > 0 
    ? createRetryWrapper(primaryFn, config)
    : primaryFn;
  
  // Create the circuit breaker
  const breaker = new CircuitBreaker(wrappedFn, {
    timeout: config.timeout,
    errorThresholdPercentage: config.errorThresholdPercentage,
    resetTimeout: config.resetTimeout,
    rollingCountTimeout: config.rollingCountTimeout,
    rollingCountBuckets: config.rollingCountBuckets,
    volumeThreshold: config.volumeThreshold,
    name: config.name,
  });

  // Register for metrics tracking
  metrics.register(config.name, breaker);

  return breaker;
}

/**
 * Create a retry wrapper for a function
 * @private
 */
function createRetryWrapper(fn, config) {
  return async function(...args) {
    let lastError;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        
        // Don't retry on last attempt
        if (attempt < config.maxRetries) {
          const delay = calculateBackoff(attempt, config.retryDelay);
          if (import.meta.env.DEV) {
            console.log(`Retry attempt ${attempt + 1}/${config.maxRetries} for ${config.name} after ${delay}ms`);
          }
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  };
}

/**
 * Create a circuit breaker with fallback function
 * 
 * @param {Function} primaryFn - Primary function to try first
 * @param {Function} fallbackFn - Fallback function if primary fails
 * @param {string} name - Name for this circuit breaker
 * @param {Object} options - Additional circuit breaker options
 * @returns {Function} Wrapped function with circuit breaker and fallback
 */
export function createCircuitBreakerWithFallback(primaryFn, fallbackFn, name, options = {}) {
  const breaker = createCircuitBreaker(primaryFn, {
    name,
    ...options,
  });

  // Set up fallback
  if (fallbackFn) {
    breaker.fallback(fallbackFn);
    
    breaker.on('fallback', (_result) => {
      if (import.meta.env.DEV) {
        console.log(`🔄 Using fallback for ${name}`);
      }
    });
  }

  // Return a wrapped function
  return async function(...args) {
    try {
      return await breaker.fire(...args);
    } catch (error) {
      if (!fallbackFn) {
        console.error(`❌ ${name} failed and no fallback available:`, error.message);
        throw error;
      }
      throw error; // Fallback already executed by opossum
    }
  };
}

/**
 * Get health status for all circuit breakers
 * Suitable for /health endpoint exposure
 */
export function getCircuitBreakerHealth() {
  const allMetrics = metrics.getAllMetrics();
  
  const health = {
    timestamp: new Date().toISOString(),
    circuitBreakers: allMetrics,
    summary: {
      total: Object.keys(allMetrics).length,
      open: 0,
      halfOpen: 0,
      closed: 0,
      healthy: 0,
    }
  };

  // Calculate summary
  for (const metric of Object.values(allMetrics)) {
    if (metric.state === 'open') health.summary.open++;
    else if (metric.state === 'half-open') health.summary.halfOpen++;
    else health.summary.closed++;
    
    if (metric.health.isHealthy) health.summary.healthy++;
  }

  return health;
}

/**
 * Manually reset a circuit breaker
 * Useful for administrative controls
 */
export function resetCircuitBreaker(name) {
  const entry = metrics.breakers.get(name);
  if (entry) {
    entry.breaker.close();
    metrics.resetMetrics(name);
    if (import.meta.env.DEV) {
      console.log(`🔧 Circuit breaker "${name}" manually reset`);
    }
    return true;
  }
  return false;
}

export default {
  createCircuitBreaker,
  createCircuitBreakerWithFallback,
  getCircuitBreakerHealth,
  resetCircuitBreaker,
  metrics,
  calculateBackoff,
};
