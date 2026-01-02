/**
 * CircuitBreakerStatus Component
 * 
 * Displays the health status of all circuit breakers
 * Can be added to Settings page or System Health dashboard
 */

import React from 'react';
import { Shield, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useCircuitBreakerHealth } from '@/hooks/useCircuitBreakerHealth';

export function CircuitBreakerStatus() {
  const { health, loading, isHealthy, hasOpenCircuits } = useCircuitBreakerHealth();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 animate-spin" />
        <span>Loading circuit breaker status...</span>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        <span>Circuit breaker status unavailable</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className={`h-5 w-5 ${isHealthy ? 'text-green-500' : 'text-yellow-500'}`} />
          <h3 className="font-semibold">Circuit Breaker Status</h3>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {isHealthy ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-green-600">All systems operational</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <span className="text-yellow-600">{health.summary.open} circuit(s) open</span>
            </>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border p-3">
          <div className="text-2xl font-bold">{health.summary.total}</div>
          <div className="text-sm text-muted-foreground">Total Circuits</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-2xl font-bold text-green-600">{health.summary.closed}</div>
          <div className="text-sm text-muted-foreground">Closed (Healthy)</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-2xl font-bold text-yellow-600">{health.summary.open}</div>
          <div className="text-sm text-muted-foreground">Open (Failing)</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-2xl font-bold text-blue-600">{health.summary.halfOpen}</div>
          <div className="text-sm text-muted-foreground">Half-Open (Testing)</div>
        </div>
      </div>

      {/* Individual Circuit Breakers */}
      {hasOpenCircuits && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Active Issues</h4>
          {Object.entries(health.circuitBreakers || {}).map(([name, breaker]) => {
            if (breaker.state === 'closed') return null;
            
            return (
              <div key={name} className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <span className="font-medium">{name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      breaker.state === 'open' 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {breaker.state}
                    </span>
                    <span className="text-muted-foreground">
                      Error Rate: {breaker.health.errorRate}%
                    </span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <div>Successes: {breaker.stats.successes}</div>
                  <div>Failures: {breaker.stats.failures}</div>
                  <div>Timeouts: {breaker.stats.timeouts}</div>
                  <div>Fallbacks: {breaker.stats.fallbacks}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* All Circuits Details */}
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium text-sm">
          View All Circuit Breakers
        </summary>
        <div className="mt-3 space-y-2">
          {Object.entries(health.circuitBreakers || {}).map(([name, breaker]) => (
            <div key={name} className="rounded border p-2 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{name}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  breaker.state === 'closed'
                    ? 'bg-green-100 text-green-700'
                    : breaker.state === 'open'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {breaker.state}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground">
                <div>✓ {breaker.stats.successes}</div>
                <div>✗ {breaker.stats.failures}</div>
                <div>⏱ {breaker.stats.timeouts}</div>
                <div>🔄 {breaker.stats.fallbacks}</div>
                <div>📊 {breaker.health.errorRate}%</div>
              </div>
            </div>
          ))}
        </div>
      </details>

      <div className="text-xs text-muted-foreground">
        Last updated: {new Date(health.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}

export default CircuitBreakerStatus;
