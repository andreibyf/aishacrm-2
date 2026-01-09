# Bundle Endpoints Testing Guide

This document provides instructions for testing the new bundle endpoints that eliminate N+1 query problems.

## Overview

Bundle endpoints return all data needed for a page in a single request:

- `/api/bundles/leads` - Returns leads + users + employees + accounts + stats
- `/api/bundles/contacts` - Returns contacts + users + employees + accounts + stats
- `/api/bundles/opportunities` - Returns opportunities + users + employees + accounts + contacts + leads + stats

## Prerequisites

1. Backend server running (Docker or local):
   ```bash
   # Docker mode
   docker compose up -d

   # OR local mode
   cd backend && npm run dev
   ```

2. Test user credentials and tenant ID

## Running Tests

### 1. Automated Backend Tests

Run the Node.js test suite:

```bash
cd backend

# Run all bundle tests
npm run test:bundles

# OR run with verbose output
BACKEND_URL=http://localhost:3001 node --test --test-reporter spec __tests__/bundles.test.js
```

**What these tests verify:**
- ✓ Authentication is required
- ✓ tenant_id parameter is required
- ✓ Response structure is correct
- ✓ All expected fields are present
- ✓ Pagination works
- ✓ Filters work (search, status, assigned_to)
- ✓ Cache improves performance on second request
- ✓ Response time is under 2 seconds

### 2. Manual Verification Script

Run the interactive test script to see detailed output:

```bash
# Set environment variables
export TEST_TENANT_ID="your-tenant-uuid"
export TEST_USER_EMAIL="test@example.com"
export TEST_USER_PASSWORD="yourpassword"
export BACKEND_URL="http://localhost:4001"  # Optional, defaults to this

# Run the script
node scripts/test-bundle-endpoints.js
```

**Example output:**
```
================================================================================
Step 2: Testing Leads Bundle Endpoint
================================================================================

ℹ Fetching: Leads bundle
✓ Leads bundle fetched in 245ms
✓ Structure validation passed
  Leads: 10
  Users: 5
  Employees: 3
  Accounts: 8
  Total items: 127
  Stats: {"total":127,"new":45,"contacted":32,"qualified":18,...}
```

### 3. Manual cURL Testing

Test endpoints directly with cURL:

```bash
# Get auth cookie first
curl -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"yourpassword"}' \
  -c cookies.txt

# Test leads bundle
curl http://localhost:4001/api/bundles/leads?tenant_id=YOUR_UUID \
  -b cookies.txt | jq

# Test with filters
curl "http://localhost:4001/api/bundles/leads?tenant_id=YOUR_UUID&status=new&page_size=5" \
  -b cookies.txt | jq '.data.stats'

# Test cache (run twice, second should be faster)
time curl http://localhost:4001/api/bundles/leads?tenant_id=YOUR_UUID \
  -b cookies.txt -o /dev/null -s
```

## Verifying Data Structure Compatibility

The bundle endpoints must return data structures that match the existing sequential API calls. Here's how to verify:

### Expected Response Structure

**Leads Bundle:**
```json
{
  "status": "success",
  "data": {
    "leads": [...],           // Array of lead objects
    "stats": {                // Status counts
      "total": 127,
      "new": 45,
      "contacted": 32,
      "qualified": 18,
      "unqualified": 5,
      "converted": 10,
      "lost": 17
    },
    "users": [...],          // Array of user objects
    "employees": [...],      // Array of employee objects
    "accounts": [...],       // Array of account objects
    "pagination": {
      "page": 1,
      "page_size": 25,
      "total_items": 127,
      "total_pages": 6
    },
    "meta": {
      "tenant_id": "uuid",
      "generated_at": "ISO timestamp",
      "ttl_seconds": 60,
      "source": "manual_aggregation",
      "elapsed_ms": 245
    }
  },
  "cached": false
}
```

**Contacts Bundle:** Similar structure with `contacts` array and stats keys: `total`, `active`, `prospect`, `customer`, `inactive`

**Opportunities Bundle:** Similar structure with `opportunities` array, plus `contacts` and `leads` arrays, and stats keys: `total`, `prospecting`, `qualification`, `proposal`, `negotiation`, `closed_won`, `closed_lost`

### Comparing with Sequential Calls

To verify compatibility, compare bundle response with sequential calls:

```javascript
// OLD WAY (multiple requests)
const leads = await Lead.filter({ tenant_id });
const users = await User.filter({ tenant_id });
const employees = await Employee.filter({ tenant_id });
const accounts = await Account.filter({ tenant_id });
// + separate stats calculation

// NEW WAY (single request)
const bundle = await getLeadsBundle({ tenant_id });
// bundle.leads === leads
// bundle.users === users
// bundle.employees === employees
// bundle.accounts === accounts
// bundle.stats === calculated stats
```

## Performance Benchmarks

Expected performance improvements:

| Metric | Before (Sequential) | After (Bundle) | Improvement |
|--------|---------------------|----------------|-------------|
| API Requests | 4-5 requests | 1 request | **75-80% reduction** |
| Total Time (uncached) | 800-1200ms | 200-400ms | **50-75% faster** |
| Total Time (cached) | 800-1200ms | 20-50ms | **95% faster** |

To measure performance:

```bash
# Run the manual test script - it includes performance tests
node scripts/test-bundle-endpoints.js

# OR use curl with timing
for i in {1..5}; do
  echo "Request $i:"
  curl -w "\nTime: %{time_total}s\n" \
    "http://localhost:4001/api/bundles/leads?tenant_id=YOUR_UUID" \
    -b cookies.txt -o /dev/null -s
done
```

## Troubleshooting

### Authentication Fails

**Error:** `401 Unauthorized` or `403 Forbidden`

**Solutions:**
- Verify `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` are correct
- Check that user exists in the database
- Verify cookies are being sent with requests

### Missing tenant_id

**Error:** `400 Bad Request: tenant_id is required`

**Solutions:**
- Ensure `TEST_TENANT_ID` environment variable is set
- Verify the UUID format is correct (lowercase, with hyphens)
- Check that the tenant exists in the database

### Empty Arrays in Response

**Issue:** Bundle returns empty arrays for users, employees, or accounts

**Possible causes:**
- Tenant has no data yet (expected for new tenants)
- RLS policies blocking access (check user role and tenant_id match)
- Database connection issues

**Verification:**
```sql
-- Check if tenant has data
SELECT COUNT(*) FROM leads WHERE tenant_id = 'your-uuid';
SELECT COUNT(*) FROM users WHERE tenant_id = 'your-uuid';
```

### Slow Response Times

**Issue:** Bundle takes > 2 seconds to respond

**Troubleshooting:**
1. Check if database is under load
2. Verify indexes exist on `tenant_id` columns
3. Check if you have large datasets (> 10,000 records)
4. Look for slow queries in backend logs
5. Verify Redis cache is working

**Check backend logs:**
```bash
docker compose logs backend | grep "bundles/"
# Look for elapsed_ms values
```

### Cache Not Working

**Issue:** Second request is not faster than first

**Verification:**
```bash
# Check Redis is running
docker compose ps redis-cache

# Check backend logs for cache hits/misses
docker compose logs backend | grep "Cache HIT\|Cache MISS"
```

## Next Steps

Once all tests pass:

1. ✅ Verify bundle endpoints work correctly
2. ✅ Confirm data structures match existing API
3. ✅ Performance is improved
4. → **Proceed to update frontend pages** (Leads, Contacts, Opportunities)
5. → Test AI/Braid integration after frontend updates
6. → Run full regression test suite

## Questions or Issues?

If you encounter problems:

1. Check backend logs: `docker compose logs -f backend`
2. Verify environment variables are set correctly
3. Ensure you're using the correct BACKEND_URL (4001 for Docker, 3001 for local)
4. Review test output for specific error messages

## Additional Resources

- [Backend Bundle Routes](../backend/routes/bundles.js)
- [Frontend Bundle API](../src/api/bundles.js)
- [Bundle Tests](../backend/__tests__/bundles.test.js)
- [Manual Test Script](../scripts/test-bundle-endpoints.js)
