# 📊 Performance Diagnostic Report

## Summary

**Cache is working effectively** ✅ but **Redis server is not running** ⚠️

The cache is still functioning (responses show dramatic speedup on second load), which means it's using in-memory caching instead of Redis. However, this could cause issues in production or multi-instance deployments.

---

## Performance Metrics

### Load Times (First vs Second Request)

| Endpoint | First Load (DB) | Second Load (Cache) | Speedup |
|---|---|---|---|
| **Leads** | 306ms | 33ms | **9.3x faster** ✅ |
| **Contacts** | 170ms | 31ms | **5.5x faster** ✅ |
| **Opportunities** | 182ms | 39ms | **4.7x faster** ✅ |
| **Accounts** | 127ms | 35ms | **3.6x faster** ✅ |
| **Detail (Lead)** | 278ms | 31ms | **9.0x faster** ✅ |

### Current Performance Baseline

✅ **List endpoints are performing well:**
- Leads: 170-306ms (first), 31-33ms (cached)
- Contacts: 170ms (first), 31ms (cached)
- Opportunities: 182ms (first), 39ms (cached)
- Accounts: 127ms (first), 35ms (cached)

**This is GOOD performance.** Most requests are sub-300ms uncached, sub-50ms cached.

---

## Issues Found

### 1. ⚠️ Redis Disconnected
- **Status**: Cache Redis (port 6380) not responding
- **Status**: Session Redis (port 6379) not responding
- **Impact**: Cache is working via in-memory store (good for dev, risky for production)
- **Action**: Check Docker Redis containers

### 2. ⚠️ Cache Key Collision Risk (Potential Issue)
The cache key includes query params but might not properly distinguish between different filters. Verify cache behavior with filtered queries:

```bash
# These should have DIFFERENT cache keys:
/v2/leads?tenant_id=UUID&status=new
/v2/leads?tenant_id=UUID&status=qualified
```

### 3. ✅ Metadata Expansion Overhead (Acceptable)
- Detail endpoints (278ms) are ~2x slower than list endpoints
- But still sub-300ms, which is acceptable
- Metadata expansion via `expandMetadata()` function is reasonable cost

---

## Slowness Investigation

**Why might things feel slow?**

### Possible Causes:

1. **Redis Not Running** (HIGH PROBABILITY)
   - Should have been started with Docker
   - Check: `docker compose ps | grep redis`

2. **First-Time Response Delay**
   - Expected: 100-300ms (network + DB query)
   - This is normal for a Supabase remote database

3. **Frontend Not Caching**
   - Check if browser cache headers are being set
   - Check if frontend is making duplicate requests

4. **Multiple Queries Per Page Load**
   - Dashboard may load: Leads + Contacts + Opportunities + Accounts simultaneously
   - 4 requests × 300ms = 1.2 seconds total (feels slow)

5. **Metadata Processing**
   - `expandMetadata()` on 50+ records might add overhead
   - Currently seems negligible but check if data volume increased

---

## Recommendations

### Immediate Actions

**1. Restart Redis Servers**
```bash
docker-compose restart redis
```

**2. Verify Cache Persistence**
```bash
# Test with redis-cli
redis-cli -p 6380 keys "tenant:*" | head -20
```

**3. Check Docker Containers**
```bash
docker compose ps
# Should show:
# - aishacrm-redis (6379) - Session store
# - aishacrm-cache (6380) - Cache store
```

### Performance Optimizations (If Still Slow)

**1. Check Response Size**
```bash
# See how much data is returned
curl -s "http://localhost:4001/api/v2/leads?tenant_id=..." | jq '.data | length'
```

**2. Reduce Default Limit**
Currently: `limit=50`
Consider: Paginate to 25-30 records default

**3. Index Check**
Make sure database has indexes on:
- `tenant_id` ✅
- `created_at`
- `status`
- `assigned_to`

**4. Frontend Caching**
Add response headers:
```javascript
res.set('Cache-Control', 'private, max-age=180');
```

**5. Parallel Query Optimization**
If dashboard loads multiple entities, fetch them in parallel instead of sequential.

---

## Cache Key Strategy Review

### Current Implementation
```
Format: tenant:{tenantId}:{module}:{operation}:{paramsHash}
Example: tenant:6cb4c008-4847-426a-9a2e-918ad70e7b69:leads:list:a1b2c3d4
```

### Verification Needed
- ✓ Different filters create different keys?
- ✓ Different limits create different keys?
- ✓ Cache invalidation works on mutation?

**Test this:**
```bash
# Load with status filter
curl "http://localhost:4001/api/v2/leads?tenant_id=...&status=new"
# Load with different status
curl "http://localhost:4001/api/v2/leads?tenant_id=...&status=qualified"
# Should NOT use same cache (verify with backend logs)
```

---

## Backend Query Performance

### Current Query Pattern (Leads)

```javascript
supabase
  .from('leads')
  .select('*', { count: 'exact' })  // Gets full row + count
  .eq('tenant_id', tenant_id)       // Filtered query
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1)  // Pagination
```

### ✅ This is Good
- Single query (no N+1)
- Proper pagination
- Tenant scoped

### Potential Optimization
If you have 10,000+ leads:
- Select specific columns instead of `*`
- Could reduce bandwidth 20-30%

---

## Next Steps

1. **Start Redis**: `docker compose restart redis`
2. **Re-run diagnostic**: `bash perf-diagnostic.sh`
3. **Monitor real usage**: Check browser network tab for slow endpoints
4. **Identify bottleneck**: Is it DB query or frontend rendering?

---

**Generated**: December 16, 2025
**Test Date**: Dec 16, 2025 02:50 UTC
**Finding**: Cache working, but needs Redis confirmation
