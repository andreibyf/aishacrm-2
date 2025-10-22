/**
 * Fallback Functions - Resilient API Layer
 * 
 * This module provides automatic fallback from Base44 cloud functions
 * to local implementations when Base44 is unavailable.
 * 
 * Usage:
 *   import { mcpServer } from '@/api/fallbackFunctions';
 *   // Will try Base44 first, then fall back to local
 */

import { checkBackendStatus } from '@/api/functions';
import * as cloudFunctions from '@/api/functions';
import * as localFunctions from '@/functions';

// Cache health check for 30 seconds to avoid hammering the API
let lastHealthCheck = null;
let lastHealthStatus = false;
let healthCheckPromise = null;

/**
 * Check if Base44 is healthy (with caching)
 */
async function isBase44Healthy() {
  const now = Date.now();
  
  // Return cached result if less than 30 seconds old
  if (lastHealthCheck && (now - lastHealthCheck) < 30000) {
    return lastHealthStatus;
  }
  
  // If a check is already in progress, wait for it
  if (healthCheckPromise) {
    return healthCheckPromise;
  }
  
  healthCheckPromise = (async () => {
    try {
      const result = await Promise.race([
        checkBackendStatus(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        )
      ]);
      
      lastHealthStatus = result?.success === true || result?.status === 'ok';
      lastHealthCheck = now;
      
      if (import.meta.env.DEV) {
        console.log('Base44 health check:', lastHealthStatus ? '✅ Healthy' : '❌ Down');
      }
      
      return lastHealthStatus;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Base44 health check failed:', error.message);
      }
      lastHealthStatus = false;
      lastHealthCheck = now;
      return false;
    } finally {
      healthCheckPromise = null;
    }
  })();
  
  return healthCheckPromise;
}

/**
 * Create a fallback wrapper for a function
 */
function createFallbackFunction(cloudFn, localFn, fnName) {
  return async function(...args) {
    // Try cloud first if healthy
    const isHealthy = await isBase44Healthy();
    
    if (isHealthy && cloudFn) {
      try {
        const result = await cloudFn(...args);
        return result;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(`Base44 ${fnName} failed, trying local fallback:`, error.message);
        }
        
        // Mark as unhealthy to use local for next calls
        lastHealthStatus = false;
        lastHealthCheck = Date.now();
      }
    }
    
    // Use local fallback
    if (localFn) {
      if (import.meta.env.DEV) {
        console.log(`Using local fallback for ${fnName}`);
      }
      return localFn(...args);
    }
    
    throw new Error(`${fnName} is unavailable: Base44 is down and no local fallback exists`);
  };
}

/**
 * Export fallback versions of functions
 * Add your functions here as you create local implementations
 */

// Example: MCP Server with fallback
// Uncomment when you create src/functions/mcpServer.js
// export const mcpServer = createFallbackFunction(
//   cloudFunctions.mcpServer,
//   localFunctions.mcpServer,
//   'mcpServer'
// );

/**
 * Manual health check trigger (useful for UI)
 */
export async function checkHealth() {
  lastHealthCheck = null; // Force fresh check
  return isBase44Healthy();
}

/**
 * Get current health status without triggering a check
 */
export function getCurrentHealthStatus() {
  return {
    isHealthy: lastHealthStatus,
    lastChecked: lastHealthCheck ? new Date(lastHealthCheck).toISOString() : null,
    cacheAge: lastHealthCheck ? Date.now() - lastHealthCheck : null
  };
}

export default {
  checkHealth,
  getCurrentHealthStatus,
  isBase44Healthy
};
