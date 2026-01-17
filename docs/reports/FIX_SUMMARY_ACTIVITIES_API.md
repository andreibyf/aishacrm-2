# Activities API Network Error Fix - Summary

## Problem
Network error when searching activities from the frontend with MongoDB-style `$or` and `$regex` operators.

**Error URL from issue:**
```
https://api.aishacrm.com/api/v2/activities?tenant_id=6cb4c008-4847-426a-9a2e-918ad70e7b69&include_stats=false&$or=[{"subject":{"$regex":"Initial+contact:+ABC+Inc","$options":"i"}},{"description":{"$regex":"Initial+contact:+ABC+Inc","$options":"i"}},{"related_name":{"$regex":"Initial+contact:+ABC+Inc","$options":"i"}}]
```

## Root Cause
The frontend was appending MongoDB operators (`$or`, `$regex`, etc.) as individual URL query parameters instead of wrapping them in a `filter` parameter as the backend expects.

## Solution
Modified `src/api/entities.js` to detect MongoDB operators and wrap them in a `filter` parameter:

**Before (broken):**
```javascript
// URL: ?tenant_id=xxx&$or=[{"subject":{"$regex":"..."}}]
Object.entries(data).forEach(([key, value]) => {
  params.append(key, typeof value === "object" ? JSON.stringify(value) : value);
});
```

**After (fixed):**
```javascript
// URL: ?tenant_id=xxx&filter={"$or":[{"subject":{"$regex":"..."}}]}
const MONGO_OPERATORS = ['$or', '$and', '$nor', '$not', '$in', '$nin', '$all', '$regex', '$options'];

if (hasMongoOperators) {
  params.append('filter', JSON.stringify(filterObj));
}
```

## Changes
1. **Added constant:** `MONGO_OPERATORS` - list of MongoDB operators to detect
2. **Added helper:** `containsMongoOperators(value)` - detects nested MongoDB operators
3. **Updated logic:** Separate MongoDB operators from simple parameters
4. **Maintained compatibility:** Simple filters still work as direct query params

## Testing
✅ **Frontend Unit Tests:** 4/4 passing
- Module import test
- MongoDB filters wrapped in `filter` parameter
- Simple filters remain as direct parameters
- Mixed filters properly separated

✅ **Backend Integration Tests:** Already exist and pass
- `backend/__tests__/routes/activities.filters.test.js`
- Tests confirm backend expects `filter` parameter format

✅ **Build & Lint:** Pass with no errors

## Files Changed
- `src/api/entities.js` - Core fix (added MongoDB operator detection)
- `src/api/entities.test.js` - Comprehensive unit tests

## Backend Compatibility
The backend was already configured to handle this format correctly:
- `backend/routes/activities.v2.js` (line 228-309)
- Parses `filter` query parameter as JSON
- Converts MongoDB `$regex` to PostgreSQL ILIKE
- Existing tests use this format

## Impact
✅ Fixes network error when searching activities
✅ No breaking changes - simple filters continue to work
✅ All MongoDB-style operators now properly encoded
✅ Improves code maintainability with helper functions

## Next Steps
1. ✅ Code committed and pushed
2. ⏳ Manual testing on production environment
3. ⏳ Monitor for any edge cases
4. ⏳ Consider applying same pattern to other entities (Leads, Contacts, etc.) if they use similar search

## Rollback
If issues occur:
```bash
git revert e31ff8d 18ee7bb
```
