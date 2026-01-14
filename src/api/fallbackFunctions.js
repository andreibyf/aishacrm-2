/**
 * Fallback Functions - Resilient API Layer with Circuit Breaker
 * 
 * This module provides automatic fallback from Base44 cloud functions
 * to local implementations when Base44 is unavailable, using a
 * circuit breaker pattern for better resilience and observability.
 * 
 * Features:
 * - Circuit breaker pattern prevents cascading failures
 * - Automatic failover to local implementations
 * - Comprehensive metrics and state tracking
 * - Exponential backoff for retries
 * - Event-based logging for observability
 * 
 * Usage:
 *   import { getDashboardStats } from '@/api/fallbackFunctions';
 *   const stats = await getDashboardStats({ tenant_id: 'abc' });
 */

import { createCircuitBreakerWithFallback, getCircuitBreakerHealth } from '@/lib/circuitBreaker';
import * as cloudFunctions from '@/api/functions';
import * as localFunctions from '@/functions';

/**
 * Circuit breaker configuration for Base44 cloud functions
 */
const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 5000,                    // 5 second timeout
  errorThresholdPercentage: 50,     // Open circuit at 50% error rate
  resetTimeout: 30000,              // Try to close circuit after 30s
  rollingCountTimeout: 10000,       // 10 second rolling window
  rollingCountBuckets: 10,          // 10 buckets in window
  volumeThreshold: 3,               // Minimum 3 requests before opening
  maxRetries: 2,                    // Retry up to 2 times
  retryDelay: 1000,                 // Start with 1s delay
};

/**
 * Create a resilient function with circuit breaker and fallback
 * 
 * @param {Function} cloudFn - Cloud function (Base44)
 * @param {Function} localFn - Local fallback function
 * @param {string} fnName - Function name for logging and metrics
 * @returns {Function} Wrapped function with circuit breaker
 */
function createResilientFunction(cloudFn, localFn, fnName) {
  // If no cloud function, just return local
  if (!cloudFn) {
    return localFn || (() => {
      throw new Error(`${fnName} is not available`);
    });
  }

  // Create circuit breaker with fallback
  return createCircuitBreakerWithFallback(
    cloudFn,
    localFn,
    `base44_${fnName}`,
    CIRCUIT_BREAKER_OPTIONS
  );
}

/**
 * Export resilient versions of critical functions
 * These use circuit breaker pattern and automatically fallback when Base44 is down
 */

// System functions
export const checkBackendStatus = createResilientFunction(
  cloudFunctions.checkBackendStatus,
  localFunctions.checkBackendStatus,
  'checkBackendStatus'
);

export const runFullSystemDiagnostics = createResilientFunction(
  cloudFunctions.runFullSystemDiagnostics,
  localFunctions.runFullSystemDiagnostics,
  'runFullSystemDiagnostics'
);

// Reports
export const getDashboardStats = createResilientFunction(
  cloudFunctions.getDashboardStats,
  localFunctions.getDashboardStats,
  'getDashboardStats'
);

export const getDashboardBundle = createResilientFunction(
  cloudFunctions.getDashboardBundle,
  localFunctions.getDashboardBundle,
  'getDashboardBundle'
);

// Validation
export const findDuplicates = createResilientFunction(
  cloudFunctions.findDuplicates,
  localFunctions.findDuplicates,
  'findDuplicates'
);

export const analyzeDataQuality = createResilientFunction(
  cloudFunctions.analyzeDataQuality,
  localFunctions.analyzeDataQuality,
  'analyzeDataQuality'
);

// Note: syncDatabase removed - not exported by localFunctions
// Add more critical functions as needed
// export const yourFunction = createResilientFunction(
//   cloudFunctions.yourFunction,
//   localFunctions.yourFunction,
//   'yourFunction'
// );

/**
 * Get circuit breaker health status
 * Replaces the manual health check with circuit breaker metrics
 */
export function getCircuitBreakerStatus() {
  return getCircuitBreakerHealth();
}

/**
 * Manual health check trigger (kept for backward compatibility)
 * Now returns circuit breaker status instead of simple health check
 */
export async function checkHealth() {
  return getCircuitBreakerHealth();
}

/**
 * Get current health status without triggering a check
 * Now returns circuit breaker status for all Base44 functions
 */
export function getCurrentHealthStatus() {
  const cbHealth = getCircuitBreakerHealth();
  
  return {
    isHealthy: cbHealth.summary.healthy === cbHealth.summary.total,
    circuitBreakers: cbHealth.circuitBreakers,
    summary: cbHealth.summary,
    timestamp: cbHealth.timestamp,
  };
}

/**
 * Get pre-computed dashboard funnel and pipeline counts
 * @param {Object} options - Query options
 * @param {string} options.tenant_id - Tenant ID for filtering
 * @param {boolean} options.include_test_data - Include test data (default: true)
 * @param {boolean} options.bust_cache - Force fresh data bypassing cache (default: false)
 * @returns {Promise<{funnel: Object, pipeline: Array}>}
 */
export async function getDashboardFunnelCounts({ tenant_id, include_test_data = true, bust_cache = false } = {}) {
  const params = new URLSearchParams({ include_test_data: String(include_test_data) });
  if (tenant_id) {
    params.append('tenant_id', tenant_id);
  }
  if (bust_cache) {
    params.append('_t', Date.now()); // Cache busting timestamp
  }
  const response = await fetch(`${localFunctions.getBaseUrl()}/api/dashboard/funnel-counts?${params}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Dashboard funnel counts failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Refresh materialized views for dashboard funnel counts
 * Forces immediate recalculation of pre-computed dashboard data
 * @param {Object} options - Options object
 * @param {string} options.tenant_id - Tenant ID (required for superadmins)
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function refreshDashboardFunnelCounts({ tenant_id } = {}) {
  const response = await fetch(`${localFunctions.getBaseUrl()}/api/dashboard/funnel-counts/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id })
  });

  if (!response.ok) {
    throw new Error(`Dashboard funnel refresh failed: ${response.statusText}`);
  }

  return response.json();
}

export default {
  checkHealth,
  getCurrentHealthStatus,
  getCircuitBreakerStatus,
  getDashboardFunnelCounts,
  refreshDashboardFunnelCounts,
};
