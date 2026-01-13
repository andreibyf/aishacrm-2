# Fix: Account GET by ID Tenant Validation

## Problem
When accessing an account by ID through the API, the v1 endpoint (`/api/accounts/:id`) did not enforce `tenant_id` validation, creating a security vulnerability where accounts could potentially be accessed across tenant boundaries.

## Error Observed
```
GET https://api.aishacrm.com/api/v2/accounts/0ef7c9c2-8820-451d-9b55-1915d341107f 400 (Bad Request)
Error: Backend API error:  - {"status":"error","message":"tenant_id is required"}
```

## Root Cause
The v1 accounts route (`backend/routes/accounts.js`) used the `tenantScopedId()` middleware but only conditionally applied the tenant filter:

```javascript
// BEFORE (vulnerable code)
let q = supabase.from('accounts').select('*').eq('id', req.idScope.id);
if (req.idScope.tenant_id) q = q.eq('tenant_id', req.idScope.tenant_id);
```

This meant:
- ✓ If `tenant_id` was provided, it filtered by tenant
- ✗ If `tenant_id` was NOT provided, it skipped filtering entirely (security issue!)

## Solution
Added explicit validation to require `tenant_id` and always apply tenant filtering:

```javascript
// AFTER (fixed code)
// Validate tenant_id is present for security
if (!req.idScope.tenant_id) {
  return res.status(400).json({
    status: 'error',
    message: 'tenant_id is required'
  });
}

const supabase = getSupabaseClient();
let q = supabase.from('accounts').select('*')
  .eq('id', req.idScope.id)
  .eq('tenant_id', req.idScope.tenant_id);  // ALWAYS applied
```

## Changes Made

### Backend
1. **`backend/routes/accounts.js` (v1 route)** - Lines 497-515
   - Added explicit `tenant_id` validation at the start of the handler
   - Returns 400 error if `tenant_id` is missing
   - Always applies tenant filter (no longer conditional)

2. **`backend/routes/accounts.v2.js` (v2 route)** - Already had proper validation
   - No changes needed
   - Lines 416-418 already validate `tenant_id` is required

### Frontend
- **`src/api/entities.js`** - Already correct
  - No changes needed
  - Lines 272-278 already append `tenant_id` for all GET by ID requests

### Tests
1. **`backend/__tests__/routes/accounts.v2.tenant-validation.test.js`** - New test suite
   - Tests GET with tenant_id (should succeed)
   - Tests GET without tenant_id (should return 400)
   - Tests GET with wrong tenant_id (should return 404)
   - Tests GET with empty tenant_id (should return 400)

2. **`backend/__tests__/routes/accounts.route.test.js`** - Existing tests
   - Already includes tenant_id in all requests
   - No changes needed

## Verification

### Manual Testing
```bash
# Start backend
npm run dev

# Test with tenant_id (should work)
curl "http://localhost:4001/api/v2/accounts/{id}?tenant_id={tenant-uuid}"

# Test without tenant_id (should return 400)
curl "http://localhost:4001/api/v2/accounts/{id}"
```

### Automated Testing
```bash
# Run verification script
node verify-account-fix.js

# Run test suite (requires backend running)
cd backend && node --test __tests__/routes/accounts.v2.tenant-validation.test.js
```

## Security Impact
- **Before**: Accounts could potentially be accessed without tenant validation
- **After**: All account GET by ID requests require valid `tenant_id`
- **Scope**: Affects both v1 (`/api/accounts/:id`) and v2 (`/api/v2/accounts/:id`) routes

## API Behavior

| Endpoint | tenant_id | Status | Response |
|----------|-----------|--------|----------|
| `/api/accounts/:id` | ✓ Provided | 200/404 | Account data or not found |
| `/api/accounts/:id` | ✗ Missing | 400 | `{"status":"error","message":"tenant_id is required"}` |
| `/api/v2/accounts/:id` | ✓ Provided | 200/404 | Account data or not found |
| `/api/v2/accounts/:id` | ✗ Missing | 400 | `{"status":"error","message":"tenant_id is required"}` |

## Related
- Similar pattern used in all v2 entity routes (leads, contacts, opportunities)
- Follows the same security model as other tenant-isolated endpoints
- Consistent with PR #157 fixes for other entities

## Files Changed
- `backend/routes/accounts.js` - Added validation
- `backend/__tests__/routes/accounts.v2.tenant-validation.test.js` - New test suite
- `verify-account-fix.js` - Verification script

## Migration Notes
Existing clients MUST include `tenant_id` query parameter when calling GET by ID:
```javascript
// Before (may have worked without tenant_id - security issue!)
GET /api/accounts/{id}

// After (tenant_id required)
GET /api/accounts/{id}?tenant_id={uuid}
```

Frontend code (`src/api/entities.js`) already implements this correctly, so no frontend changes are needed.

## Future Improvements
- Consider extracting tenant_id validation into a reusable middleware function to reduce code duplication across v1 and v2 routes
- This would ensure consistent error responses and make it easier to maintain
