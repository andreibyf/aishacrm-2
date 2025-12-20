# Full Scan Request Throttling Fix

## Problem
When running a full endpoint scan in the API Health Dashboard, the frontend would trigger ~43 concurrent HTTP requests to the backend. This overwhelmed the backend container, causing:
- `ERR_CONNECTION_RESET` errors
- Database connection pool exhaustion
- Failed fetch requests for critical endpoints (tenants, users, employees, etc.)
- Backend container becoming unresponsive

## Root Cause
The `/api/testing/full-scan` endpoint was processing all 43 endpoints in a single loop without any throttling or rate limiting. This created a "thundering herd" problem where too many concurrent connections exhausted the backend's available resources.

## Solution
Implemented **batch processing with throttling** in the full-scan endpoint:

### Changes Made
**File:** `backend/routes/testing.js`

1. **Batch Size Limit:** Process only 5 endpoints concurrently
2. **Batch Delay:** 100ms delay between batches to allow connection pool recovery
3. **Request Timeout:** 5-second timeout per request to prevent hanging connections
4. **Graceful Error Handling:** Distinguish between timeouts and network failures

### Implementation Details
```javascript
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 100;

for (let i = 0; i < endpoints.length; i += BATCH_SIZE) {
  const batch = endpoints.slice(i, i + BATCH_SIZE);
  
  // Process batch in parallel
  const batchPromises = batch.map(async (ep) => {
    // ... endpoint testing with 5s timeout ...
  });
  
  const batchResults = await Promise.all(batchPromises);
  results.push(...batchResults);
  
  // Delay before next batch
  if (i + BATCH_SIZE < endpoints.length) {
    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
  }
}
```

## Benefits
- **Prevents Connection Exhaustion:** Max 5 concurrent requests at a time
- **Backend Stability:** Gives time for connection pool to recover between batches
- **Better Error Reporting:** Clear distinction between timeouts and network failures
- **Predictable Performance:** ~1 second total scan time (43 endpoints / 5 per batch * 100ms delay)
- **Resource Efficiency:** Backend remains responsive to regular user requests during scan

## Testing
After applying the fix:
1. Full scan completes without `ERR_CONNECTION_RESET` errors
2. All 43 endpoints tested successfully with proper status codes
3. Backend remains healthy and responsive during scan
4. No connection pool exhaustion or database errors

## Technical Notes
- **AbortSignal.timeout(5000):** Each request has a 5-second timeout
- **Batch Parallelism:** Within each batch, requests still run in parallel for speed
- **Sequential Batches:** Batches run sequentially with 100ms spacing
- **Latency Tracking:** Accurate latency metrics captured per endpoint

## Related Files
- `backend/routes/testing.js` - Full scan endpoint with throttling
- `src/components/settings/ApiHealthDashboard.jsx` - Frontend trigger
- Docker container: `aishacrm-backend` (requires rebuild after changes)

## Deployment
```powershell
# Rebuild backend with throttling fix
docker-compose up -d --build backend

# Verify healthy status
docker ps --filter "name=aishacrm-backend"
```

---
**Date:** November 17, 2024  
**Issue:** Frontend full scan overwhelming backend with concurrent requests  
**Resolution:** Request throttling with batch processing (5 requests per batch, 100ms delay)
