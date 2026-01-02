# Circuit Breaker Pattern Implementation

## Overview

The AiSHA CRM application uses the **Circuit Breaker pattern** to provide resilient integration with external dependencies (primarily Base44 cloud functions). This pattern prevents cascading failures and provides automatic failover to local implementations when external services are unavailable.

## Architecture

### Components

1. **Circuit Breaker Utility** (`src/lib/circuitBreaker.js`)
   - Core circuit breaker implementation using the `opossum` library
   - Metrics tracking and health status reporting
   - Event-based logging for observability

2. **Fallback Functions** (`src/api/fallbackFunctions.js`)
   - Integration layer that wraps Base44 cloud functions
   - Automatic failover to local backend implementations
   - All critical functions protected by circuit breakers

3. **Health Monitoring** (`src/hooks/useCircuitBreakerHealth.js`)
   - React hook for monitoring circuit breaker status
   - Real-time health updates
   - Integration-ready for UI components

4. **Status UI** (`src/components/system/CircuitBreakerStatus.jsx`)
   - Visual dashboard for circuit breaker health
   - Can be integrated into Settings or System Health pages
   - Real-time status updates

## Configuration

### Circuit Breaker Options

Default configuration in `src/api/fallbackFunctions.js`:

```javascript
const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 5000,                    // 5 second timeout for requests
  errorThresholdPercentage: 50,     // Open circuit at 50% error rate
  resetTimeout: 30000,              // Try to close circuit after 30 seconds
  rollingCountTimeout: 10000,       // 10 second rolling window for errors
  rollingCountBuckets: 10,          // 10 buckets in rolling window
  volumeThreshold: 3,               // Minimum 3 requests before circuit can open
  maxRetries: 2,                    // Retry up to 2 times with backoff
  retryDelay: 1000,                 // Start with 1 second delay for retries
};
```

### Configuring Individual Circuits

To adjust settings for a specific function, pass custom options:

```javascript
export const myCustomFunction = createResilientFunction(
  cloudFunctions.myFunction,
  localFunctions.myFunction,
  'myFunction',
  {
    timeout: 10000,                 // Override: 10 second timeout
    errorThresholdPercentage: 30,   // Override: Open at 30% error rate
    // Other options will use defaults
  }
);
```

## Circuit States

### Closed (Normal Operation)
- Circuit is healthy and requests go to primary function (Base44)
- Success and failure metrics are tracked
- If error rate exceeds threshold, circuit opens

### Open (Failure Mode)
- Too many failures detected
- All requests automatically use fallback function (local backend)
- No requests sent to failing service
- After `resetTimeout`, circuit moves to half-open

### Half-Open (Recovery Testing)
- Circuit attempts to recover
- Limited requests sent to primary function to test health
- If successful, circuit closes
- If failures continue, circuit opens again

## Exponential Backoff

When retries are configured, the circuit breaker uses exponential backoff with jitter:

```javascript
delay = baseDelay * 2^attempt + (random * 0.3 * delay)
```

**Example retry delays:**
- Attempt 1: ~1000ms + jitter (1000-1300ms)
- Attempt 2: ~2000ms + jitter (2000-2600ms)
- Attempt 3: ~4000ms + jitter (4000-5200ms)

The jitter (30% random variation) prevents the **thundering herd problem** where many clients retry simultaneously.

## Metrics and Observability

### Available Metrics

Each circuit breaker tracks:
- **Successes**: Number of successful requests
- **Failures**: Number of failed requests
- **Timeouts**: Number of requests that exceeded timeout
- **Fallbacks**: Number of times fallback was used
- **Circuit Opened**: Number of times circuit opened
- **Last State Change**: Timestamp of last state transition
- **Error Rate**: Percentage of failed requests

### Accessing Metrics

#### In Code

```javascript
import { getCircuitBreakerHealth } from '@/lib/circuitBreaker';

const health = getCircuitBreakerHealth();
console.log(health);
```

**Example output:**
```json
{
  "timestamp": "2026-01-02T18:55:00.000Z",
  "circuitBreakers": {
    "base44_getDashboardStats": {
      "name": "base44_getDashboardStats",
      "state": "closed",
      "stats": {
        "successes": 145,
        "failures": 2,
        "timeouts": 0,
        "fallbacks": 2,
        "circuitOpened": 0,
        "lastStateChange": null
      },
      "health": {
        "errorRate": "1.36",
        "isHealthy": true
      }
    }
  },
  "summary": {
    "total": 6,
    "open": 0,
    "halfOpen": 0,
    "closed": 6,
    "healthy": 6
  }
}
```

#### In React Components

```javascript
import { useCircuitBreakerHealth } from '@/hooks/useCircuitBreakerHealth';

function MyComponent() {
  const { health, isHealthy, hasOpenCircuits } = useCircuitBreakerHealth();
  
  return (
    <div>
      {isHealthy ? '✅ All systems operational' : '⚠️ Some circuits are open'}
    </div>
  );
}
```

## Logging

### Console Output (Development Mode)

Circuit state changes automatically log to console:

```
⚠️  Circuit breaker "base44_getDashboardStats" opened - too many failures
🔄 Circuit breaker "base44_getDashboardStats" half-open - testing recovery  
✅ Circuit breaker "base44_getDashboardStats" closed - service recovered
🔄 Using fallback for base44_getDashboardStats
```

### Production Logging

In production, these logs are suppressed (`import.meta.env.DEV` check). For production monitoring:

1. **Monitor circuit breaker health endpoint** (if implemented)
2. **Integrate with monitoring tools** (Sentry, DataDog, etc.)
3. **Track error rates** in backend logs

## Adding New Protected Functions

To add circuit breaker protection to a new function:

1. **Add the function to `src/api/fallbackFunctions.js`:**

```javascript
export const myNewFunction = createResilientFunction(
  cloudFunctions.myNewFunction,
  localFunctions.myNewFunction,
  'myNewFunction'
);
```

2. **Ensure local fallback exists** in `src/functions/index.js`

3. **Test the function:**
   - Test normal operation (circuit closed)
   - Test failure handling (circuit open)
   - Test fallback execution
   - Test recovery (circuit half-open → closed)

## UI Integration

### Adding Circuit Breaker Status to Settings

```javascript
import { CircuitBreakerStatus } from '@/components/system/CircuitBreakerStatus';

function SettingsPage() {
  return (
    <div>
      <h1>System Settings</h1>
      <CircuitBreakerStatus />
    </div>
  );
}
```

### Custom Status Display

```javascript
import { useCircuitBreakerHealth } from '@/hooks/useCircuitBreakerHealth';

function CustomStatus() {
  const { health, summary } = useCircuitBreakerHealth(10000); // Update every 10s
  
  return (
    <div>
      <p>{summary.healthy}/{summary.total} circuits healthy</p>
      {summary.open > 0 && (
        <p className="text-red-600">⚠️ {summary.open} circuits are open</p>
      )}
    </div>
  );
}
```

## Testing

### Unit Tests

Run circuit breaker tests:

```bash
npm run test:file src/lib/circuitBreaker.test.js
```

### Manual Testing

1. **Test Fallback:**
   - Stop Base44 service (or block network)
   - Trigger protected function
   - Verify fallback is used
   - Check console for fallback log

2. **Test Circuit Opening:**
   - Cause multiple failures
   - Verify circuit opens after threshold
   - Check console for circuit open log

3. **Test Recovery:**
   - Wait for resetTimeout
   - Restore Base44 service
   - Verify circuit closes after successful tests
   - Check console for recovery logs

## Troubleshooting

### Circuit Not Opening

**Symptoms:** Circuit remains closed despite failures

**Solutions:**
- Check `volumeThreshold` - need minimum requests before circuit can open
- Check `errorThresholdPercentage` - may be too high
- Verify failures are being tracked (check metrics)

### Circuit Not Closing

**Symptoms:** Circuit stays open even when service recovers

**Solutions:**
- Check `resetTimeout` - may need to wait longer
- Verify primary service is actually healthy
- Check half-open state is working (logs should show testing)

### High Error Rates

**Symptoms:** Frequent circuit openings

**Solutions:**
- Increase `timeout` if requests are slow
- Decrease `errorThresholdPercentage` to tolerate more errors
- Increase `resetTimeout` to give service more recovery time
- Investigate root cause of failures

### Fallback Not Working

**Symptoms:** Errors even when circuit is open

**Solutions:**
- Verify fallback function exists in `src/functions/index.js`
- Check fallback function signature matches primary
- Ensure fallback function is properly implemented

## Performance Impact

### Overhead

- **Minimal overhead** for successful requests (~1-2ms)
- **No overhead** when circuit is open (immediate fallback)
- **Metrics tracking** uses in-memory Map (negligible impact)

### Benefits

- **Faster failures**: Timeout (5s) instead of hanging indefinitely
- **Reduced load**: Open circuit stops hammering failing service
- **Automatic recovery**: No manual intervention needed
- **Better UX**: Fallback provides degraded but functional experience

## Future Enhancements

Potential improvements:

1. **Persistent Metrics**: Store metrics in Redis or database
2. **Alerting Integration**: Send alerts when circuits open (Sentry, PagerDuty)
3. **Circuit Control UI**: Manual circuit control (open/close/reset)
4. **Historical Data**: Track circuit state changes over time
5. **Adaptive Thresholds**: Auto-tune based on baseline behavior

## References

- [opossum Circuit Breaker Library](https://nodeshift.dev/opossum/)
- [Martin Fowler - Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Release It! - Michael Nygard](https://pragprog.com/titles/mnee2/release-it-second-edition/)
