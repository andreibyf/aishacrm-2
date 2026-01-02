/**
 * useCircuitBreakerHealth Hook
 * 
 * React hook to monitor circuit breaker health status
 * Usage in components that need to display integration health
 */

import { useState, useEffect } from 'react';
import { getCircuitBreakerHealth } from '@/lib/circuitBreaker';

/**
 * Hook to get circuit breaker health status
 * @param {number} refreshInterval - How often to refresh (ms), default 5000
 * @returns {Object} Circuit breaker health status
 */
export function useCircuitBreakerHealth(refreshInterval = 5000) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const updateHealth = () => {
      try {
        const status = getCircuitBreakerHealth();
        setHealth(status);
        setLoading(false);
      } catch (error) {
        console.error('Failed to get circuit breaker health:', error);
        setLoading(false);
      }
    };

    // Initial load
    updateHealth();

    // Set up polling if refresh interval is provided
    let intervalId;
    if (refreshInterval > 0) {
      intervalId = setInterval(updateHealth, refreshInterval);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [refreshInterval]);

  return {
    health,
    loading,
    isHealthy: health?.summary.healthy === health?.summary.total,
    hasOpenCircuits: (health?.summary.open || 0) > 0,
    summary: health?.summary,
    circuitBreakers: health?.circuitBreakers,
  };
}

export default useCircuitBreakerHealth;
