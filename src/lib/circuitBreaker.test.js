/**
 * Tests for Circuit Breaker Utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCircuitBreaker,
  createCircuitBreakerWithFallback,
  getCircuitBreakerHealth,
  resetCircuitBreaker,
  calculateBackoff,
  metrics,
} from './circuitBreaker';

describe('Circuit Breaker Utility', () => {
  beforeEach(() => {
    // Clear all metrics before each test
    metrics.breakers.clear();
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      expect(calculateBackoff(0, 1000)).toBeGreaterThanOrEqual(1000);
      expect(calculateBackoff(0, 1000)).toBeLessThanOrEqual(1300); // 1000 + 30% jitter
      
      expect(calculateBackoff(1, 1000)).toBeGreaterThanOrEqual(2000);
      expect(calculateBackoff(1, 1000)).toBeLessThanOrEqual(2600); // 2000 + 30% jitter
      
      expect(calculateBackoff(2, 1000)).toBeGreaterThanOrEqual(4000);
      expect(calculateBackoff(2, 1000)).toBeLessThanOrEqual(5200); // 4000 + 30% jitter
    });

    it('should respect max delay', () => {
      const maxDelay = 5000;
      expect(calculateBackoff(10, 1000, maxDelay)).toBeLessThanOrEqual(maxDelay * 1.3); // max + jitter
    });
  });

  describe('createCircuitBreaker', () => {
    it('should create a circuit breaker', () => {
      const fn = vi.fn().mockResolvedValue('success');
      const breaker = createCircuitBreaker(fn, { name: 'test-breaker' });
      
      expect(breaker).toBeDefined();
      expect(metrics.breakers.has('test-breaker')).toBe(true);
    });

    it('should execute function successfully', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const breaker = createCircuitBreaker(fn, { name: 'test-success' });
      
      const result = await breaker.fire();
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      
      const metric = metrics.getMetrics('test-success');
      expect(metric.stats.successes).toBe(1);
      expect(metric.stats.failures).toBe(0);
    });

    it('should track failures', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('test error'));
      const breaker = createCircuitBreaker(fn, {
        name: 'test-failure',
        volumeThreshold: 1,
      });
      
      try {
        await breaker.fire();
      } catch (error) {
        expect(error.message).toBe('test error');
      }
      
      const metric = metrics.getMetrics('test-failure');
      expect(metric.stats.failures).toBeGreaterThan(0);
    });

    it('should handle timeouts', async () => {
      const slowFn = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 10000))
      );
      
      const breaker = createCircuitBreaker(slowFn, {
        name: 'test-timeout',
        timeout: 100,
        volumeThreshold: 1,
      });
      
      try {
        await breaker.fire();
      } catch (error) {
        expect(error.message).toContain('Timed out');
      }
      
      const metric = metrics.getMetrics('test-timeout');
      expect(metric.stats.timeouts).toBeGreaterThan(0);
    }, 15000);
  });

  describe('createCircuitBreakerWithFallback', () => {
    it('should use fallback on failure', async () => {
      const primaryFn = vi.fn().mockRejectedValue(new Error('primary failed'));
      const fallbackFn = vi.fn().mockResolvedValue('fallback success');
      
      const resilientFn = createCircuitBreakerWithFallback(
        primaryFn,
        fallbackFn,
        'test-fallback',
        { volumeThreshold: 1 }
      );
      
      const result = await resilientFn();
      
      expect(result).toBe('fallback success');
      expect(fallbackFn).toHaveBeenCalled();
      
      const metric = metrics.getMetrics('test-fallback');
      expect(metric.stats.fallbacks).toBeGreaterThan(0);
    });

    it('should use primary when available', async () => {
      const primaryFn = vi.fn().mockResolvedValue('primary success');
      const fallbackFn = vi.fn().mockResolvedValue('fallback success');
      
      const resilientFn = createCircuitBreakerWithFallback(
        primaryFn,
        fallbackFn,
        'test-primary'
      );
      
      const result = await resilientFn();
      
      expect(result).toBe('primary success');
      expect(primaryFn).toHaveBeenCalled();
      expect(fallbackFn).not.toHaveBeenCalled();
    });

    it('should throw if no fallback and primary fails', async () => {
      const primaryFn = vi.fn().mockRejectedValue(new Error('primary failed'));
      
      const resilientFn = createCircuitBreakerWithFallback(
        primaryFn,
        null,
        'test-no-fallback',
        { volumeThreshold: 1 }
      );
      
      await expect(resilientFn()).rejects.toThrow('primary failed');
    });
  });

  describe('getCircuitBreakerHealth', () => {
    it('should return health status', () => {
      const fn = vi.fn().mockResolvedValue('success');
      createCircuitBreaker(fn, { name: 'health-test-1' });
      createCircuitBreaker(fn, { name: 'health-test-2' });
      
      const health = getCircuitBreakerHealth();
      
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('circuitBreakers');
      expect(health).toHaveProperty('summary');
      expect(health.summary.total).toBe(2);
      expect(health.circuitBreakers).toHaveProperty('health-test-1');
      expect(health.circuitBreakers).toHaveProperty('health-test-2');
    });

    it('should track circuit states in summary', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('fail'));
      const successFn = vi.fn().mockResolvedValue('success');
      
      createCircuitBreaker(successFn, { name: 'healthy-circuit' });
      const failingBreaker = createCircuitBreaker(failingFn, {
        name: 'unhealthy-circuit',
        volumeThreshold: 1,
        errorThresholdPercentage: 1,
      });
      
      // Trigger failures to open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await failingBreaker.fire();
        } catch (e) {
          // Expected to fail
        }
      }
      
      const health = getCircuitBreakerHealth();
      expect(health.summary.total).toBe(2);
      // At least one should be healthy
      expect(health.summary.closed).toBeGreaterThan(0);
    });
  });

  describe('resetCircuitBreaker', () => {
    it('should reset circuit breaker metrics', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const breaker = createCircuitBreaker(fn, { name: 'reset-test' });
      
      await breaker.fire();
      
      let metric = metrics.getMetrics('reset-test');
      expect(metric.stats.successes).toBe(1);
      
      resetCircuitBreaker('reset-test');
      
      metric = metrics.getMetrics('reset-test');
      expect(metric.stats.successes).toBe(0);
      expect(metric.state).toBe('closed');
    });

    it('should return false for unknown circuit breaker', () => {
      const result = resetCircuitBreaker('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('CircuitBreakerMetrics', () => {
    it('should calculate error rate correctly', () => {
      const stats = {
        successes: 7,
        failures: 2,
        timeouts: 1,
        fallbacks: 0,
        circuitOpened: 0,
        lastStateChange: null,
      };
      
      const errorRate = metrics.calculateErrorRate(stats);
      expect(errorRate).toBe('30.00'); // (2 + 1) / 10 * 100
    });

    it('should handle zero total requests', () => {
      const stats = {
        successes: 0,
        failures: 0,
        timeouts: 0,
        fallbacks: 0,
        circuitOpened: 0,
        lastStateChange: null,
      };
      
      const errorRate = metrics.calculateErrorRate(stats);
      expect(errorRate).toBe('0');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const retryFn = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('retry me'));
        }
        return Promise.resolve('success after retries');
      });
      
      const breaker = createCircuitBreaker(retryFn, {
        name: 'retry-test',
        maxRetries: 3,
        retryDelay: 10,
        volumeThreshold: 1,
      });
      
      const result = await breaker.fire();
      
      expect(result).toBe('success after retries');
      expect(attempts).toBe(3);
    }, 10000);

    it('should stop retrying when circuit opens', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('always fail'));
      
      const breaker = createCircuitBreaker(failFn, {
        name: 'no-retry-open',
        maxRetries: 5,
        retryDelay: 10,
        volumeThreshold: 1,
        errorThresholdPercentage: 1,
      });
      
      // First call should try retries
      try {
        await breaker.fire();
      } catch (e) {
        // Expected
      }
      
      const callCount = failFn.mock.calls.length;
      
      // Circuit should be open now, so next call should fail immediately
      try {
        await breaker.fire();
      } catch (e) {
        expect(e.message).toContain('Breaker is open');
      }
      
      // Should not have retried since circuit was open
      expect(failFn.mock.calls.length).toBe(callCount);
    }, 15000);
  });
});
