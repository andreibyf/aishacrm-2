# Console Errors Fix - November 13, 2025

## Issues Fixed

### 1. getOrCreateUserApiKey Production Warning ✅
**Problem:**
- Console warning: `[Production Mode] Function 'getOrCreateUserApiKey' not available. Use backend routes.`
- Function was being called on every page load in production mode
- This function is only available in development mode for local testing

**Solution:**
- Modified `src/pages/Layout.jsx` to only call `getOrCreateUserApiKey()` in development mode
- Wrapped the call in `if (import.meta.env.DEV)` check
- Production users no longer see this warning

**Files Changed:**
- `src/pages/Layout.jsx` - Lines ~887-902

---

### 2. tenant_id Validation Error ✅
**Problem:**
- Console errors: `tenant_id is required` 
- 400 Bad Request on `/api/contacts` endpoint
- Warning: `No explicit tenant_id in scopedFilter for non-superadmin user`
- User record had invalid `tenant_id: 'labor-depot'` (string) instead of UUID

**Root Cause:**
The user record in the database had a string tenant_id (`'labor-depot'`) instead of the actual tenant UUID. This was likely from older migration data.

**Solution:**
1. Created script `backend/fix-user-tenant-id.js` to identify and fix invalid tenant_id values
2. Updated user record for `andrei.byfield@gmail.com`:
   - **Before:** `tenant_id: 'labor-depot'` (invalid string)
   - **After:** `tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69'` (valid UUID)
3. Script automatically matches string tenant names to actual UUID from tenant table

**Database Query Used:**
```sql
UPDATE users 
SET tenant_id = '6cb4c008-4847-426a-9a2e-918ad70e7b69' 
WHERE id = '9b0febfd-2c52-48f9-8774-5df57bda7568'
```

**Files Created:**
- `backend/check-user-tenants.js` - Diagnostic script to view user/tenant data
- `backend/fix-user-tenant-id.js` - Repair script for invalid tenant_id values

---

## Verification

### Test Steps:
1. Clear browser cache and reload the app
2. Navigate to Contacts page
3. Check browser console - should see no errors
4. Verify contacts load successfully

### Expected Results:
- ✅ No `getOrCreateUserApiKey` warnings in production
- ✅ No `tenant_id is required` errors
- ✅ Contacts page loads without 400 errors
- ✅ Contact stats display correctly

---

## Technical Details

### User Record Structure
```javascript
{
  id: '9b0febfd-2c52-48f9-8774-5df57bda7568',
  email: 'andrei.byfield@gmail.com',
  role: 'admin',
  tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69', // ✅ Now UUID
}
```

### Tenant Record
```javascript
{
  id: '6cb4c008-4847-426a-9a2e-918ad70e7b69',
  name: 'Labor Depot',
  status: 'active',
  industry: 'construction_and_engineering'
}
```

### API Call Flow
```
Frontend (ContactsPage)
  → getTenantFilter() includes user.tenant_id
  → Contact.filter({ tenant_id: '6cb4c008-...' })
  → Backend /api/contacts validates tenant_id
  → Returns contacts for Labor Depot tenant ✅
```

---

## Prevention

To prevent similar issues in the future:

1. **Schema Validation:** Consider adding database constraints to ensure tenant_id is always UUID format
2. **Migration Scripts:** Add validation when importing legacy data
3. **User Creation:** Ensure all user creation flows use proper UUID tenant_id
4. **Diagnostic Scripts:** The `check-user-tenants.js` and `fix-user-tenant-id.js` scripts can be run periodically to catch data quality issues

---

## Related Files

### Modified:
- `src/pages/Layout.jsx` - Added DEV mode check for getOrCreateUserApiKey

### Created:
- `backend/check-user-tenants.js` - Diagnostic tool
- `backend/fix-user-tenant-id.js` - Repair tool
- `docs/CONSOLE_ERRORS_FIX.md` - This documentation

### Database:
- `users` table - Updated tenant_id for andrei.byfield@gmail.com

---

## Status: ✅ RESOLVED

All console errors have been fixed. The application now:
- Runs cleanly without warnings in production
- Properly validates tenant_id on all API requests
- Loads contacts and other tenant-scoped data correctly

**Deployment:** Both frontend and backend containers rebuilt and running healthy.
