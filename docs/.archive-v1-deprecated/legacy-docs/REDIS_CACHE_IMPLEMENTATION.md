# Redis Cache Implementation Summary

**Date:** December 13, 2024  
**Version:** v2.4.1 (Cache Enhancement)

## Overview

Added Redis caching middleware to all V2 API routes and optimized Opportunities endpoints to significantly improve page load performance after login.

## Problem Identified

After deploying v2.4.0 query optimizations, users reported that pages still loaded slowly after initial login. Investigation revealed:

1. **New optimized endpoints lacked caching** - `/api/v2/opportunities/stats` and `/api/v2/opportunities/count` were not using Redis cache
2. **Other V2 routes also lacked caching** - accounts.v2.js, contacts.v2.js, activities.v2.js, leads.v2.js had no cache middleware
3. **V1 routes had caching** - leads.js, accounts.js, contacts.js already used `cacheList` middleware with 180s TTL

## Solution Implemented

### 1. Added Redis Caching to Opportunities V2 Routes

**File:** `backend/routes/opportunities.v2.js`

| Endpoint | Cache Type | TTL | Purpose |
|----------|-----------|-----|---------|
| `GET /api/v2/opportunities` | `cacheList` | 180s | List view with pagination |
| `GET /api/v2/opportunities/stats` | `cacheList` | 300s | Stage aggregation stats (5 min) |
| `GET /api/v2/opportunities/count` | `cacheList` | 600s | Total count (10 min - most stable) |
| `GET /api/v2/opportunities/:id` | None | - | Single record (low frequency) |
| `POST /api/v2/opportunities` | `invalidateCache` | - | Clears cache on create |
| `PUT /api/v2/opportunities/:id` | `invalidateCache` | - | Clears cache on update |
| `DELETE /api/v2/opportunities/:id` | `invalidateCache` | - | Clears cache on delete |

**Rationale for TTLs:**
- **List (180s):** Balances freshness with performance for frequently accessed data
- **Stats (300s):** Stage counts change less frequently than individual records
- **Count (600s):** Total counts are most stable, can cache longer

### 2. Added Redis Caching to Other V2 Routes

**Files Modified:**
- `backend/routes/accounts.v2.js` - Added caching for GET, invalidation for POST/PUT/DELETE
- `backend/routes/contacts.v2.js` - Added caching for GET, invalidation for POST/PUT/DELETE
- `backend/routes/activities.v2.js` - Added caching for GET, invalidation for POST
- `backend/routes/leads.v2.js` - Added caching for GET, invalidation for POST

**Standard Pattern:**
```javascript
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';

// GET endpoints - cache responses
router.get('/', cacheList('entityName', 180), async (req, res) => { ... });

// POST/PUT/DELETE - invalidate cache after mutations
router.post('/', invalidateCache('entityName'), async (req, res) => { ... });
router.put('/:id', invalidateCache('entityName'), async (req, res) => { ... });
router.delete('/:id', invalidateCache('entityName'), async (req, res) => { ... });
```

## Cache Architecture

### Redis Instances
- **redis-cache:6379** - API response caching (managed by CacheManager)
- **redis-memory:6379** - Workflow queue and session data

### Cache Manager (`backend/lib/cacheManager.js`)
- **TTL Strategy:** Different cache durations for different data types
- **Key Generation:** MD5 hash of (tenant_id, module, operation, params)
- **Automatic Expiration:** Keys include TTL metadata for graceful expiration
- **Tenant Isolation:** Cache keys include tenant_id for multi-tenancy

### Cache Middleware (`backend/lib/cacheMiddleware.js`)
- **cacheList(module, ttl):** Caches GET responses, returns cached data if available
- **invalidateCache(module):** Clears all cache keys for tenant when data mutates
- **Request-level Caching:** Wraps `res.json()` to transparently cache successful responses

## Expected Performance Impact

### Before Cache Implementation
- **Opportunities List:** ~200ms per request (database query every time)
- **Opportunities Stats:** ~150ms per request (aggregation query)
- **Opportunities Count:** ~100ms per request (COUNT(*) query)
- **Dashboard Load:** 4-6 API calls × 100-200ms = 400-1200ms total

### After Cache Implementation
- **Cached Opportunities List:** ~5-10ms (Redis retrieval)
- **Cached Opportunities Stats:** ~5-10ms (Redis retrieval)
- **Cached Opportunities Count:** ~5-10ms (Redis retrieval)
- **Dashboard Load (cached):** 4-6 API calls × 5-10ms = **20-60ms total (95% faster)**

### Cache Hit Rate Expectations
- **First page load after login:** 0% hit rate (cold cache)
- **Subsequent page navigation:** 80-90% hit rate (within TTL window)
- **Dashboard refresh:** 90-95% hit rate (long-lived count data)

## Cache Invalidation Strategy

### Automatic Invalidation
- **POST, PUT, DELETE operations** automatically invalidate tenant cache for that module
- **Tenant-scoped:** Only invalidates cache for the affected tenant, not globally
- **Module-scoped:** Only invalidates cache for the affected entity type (e.g., "opportunities")

### Manual Invalidation (if needed)
```javascript
import cacheManager from '../lib/cacheManager.js';

// Clear specific tenant's opportunities cache
await cacheManager.invalidateTenant(tenantId, 'opportunities');

// Clear specific cache key
const key = cacheManager.generateKey('opportunities', tenantId, 'list', params);
await cacheManager.delete(key);
```

## Monitoring Cache Effectiveness

### Backend Logs
```bash
# Check cache hits
docker logs aishacrm-backend 2>&1 | grep "Cache.*Hit"
# Example output:
# [Cache] Hit: opportunities list for tenant 6cb4c008-4847-426a-9a2e-918ad70e7b69

# Check cache invalidations
docker logs aishacrm-backend 2>&1 | grep "Cache.*Invalidated"
# Example output:
# [Cache] Invalidated: opportunities for tenant 6cb4c008-4847-426a-9a2e-918ad70e7b69
```

### Redis CLI Monitoring
```bash
# Connect to Redis cache container
docker exec -it aishacrm-redis-cache redis-cli

# Monitor all cache operations in real-time
MONITOR

# Check cache keys
KEYS cache:*

# Get cache statistics
INFO stats
```

## Dashboard API Calls (Context)

The Dashboard makes these API calls on load (from `src/pages/Dashboard.jsx`):

1. **getDashBundle()** - Compact bundle with stats (60s server cache)
2. **Lead.filter(filter)** - List of leads (now cached 180s)
3. **Contact.filter(filter)** - List of contacts (now cached 180s)
4. **Opportunity.filter(filter)** - List of opportunities (now cached 180s)
5. **Activity.filter(filter)** - List of activities (now cached 180s)

**Improvement:** With caching, Dashboard refresh within TTL window avoids 4 expensive Supabase queries.

## Related Files

### Modified Routes (Cache Added)
- `backend/routes/opportunities.v2.js` - Opportunities with optimized endpoints
- `backend/routes/accounts.v2.js` - Accounts V2 routes
- `backend/routes/contacts.v2.js` - Contacts V2 routes
- `backend/routes/activities.v2.js` - Activities V2 routes
- `backend/routes/leads.v2.js` - Leads V2 routes

### Core Cache Infrastructure
- `backend/lib/cacheManager.js` - Redis cache manager with TTL strategy
- `backend/lib/cacheMiddleware.js` - Express middleware for cache/invalidate

### Docker Configuration
- `docker-compose.yml` - Redis cache service (redis-cache:6379)

## Rollback Plan

If cache causes issues:

1. **Disable cache middleware** (emergency):
   ```javascript
   // Comment out cacheList middleware temporarily
   router.get('/', /* cacheList('opportunities', 180), */ async (req, res) => { ... });
   ```

2. **Clear all cache** (if stale data):
   ```bash
   docker exec aishacrm-redis-cache redis-cli FLUSHDB
   ```

3. **Reduce TTL** (if data too stale):
   ```javascript
   // Lower TTL from 180s to 60s
   router.get('/', cacheList('opportunities', 60), async (req, res) => { ... });
   ```

## Next Steps

1. **Monitor cache hit rates** in production logs
2. **Tune TTLs** based on real-world usage patterns
3. **Add cache warming** for common queries after login (future enhancement)
4. **Implement cache tags** for more granular invalidation (future enhancement)

## Version History

- **v2.4.0** - Query optimizations (keyset pagination, indexes, aggregation endpoints)
- **v2.4.1** - Redis cache middleware added to all V2 routes ✓

---

**Related Documentation:**
- [Opportunities Performance Optimization](./OPPORTUNITIES_PERFORMANCE_OPTIMIZATION.md)
- [Backend Troubleshooting](../backend/TROUBLESHOOTING_NODE_ESM.md)
