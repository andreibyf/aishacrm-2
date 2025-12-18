# System Logs tenant_id NULL Fix

## Problem

Production error cascade:
```
tenant_id must not be null for table system_logs
SECURITY: tenant_id is required for POST system-logs
```

Causing 500 errors on `/api/system-logs/bulk` endpoint, breaking system logging across the application.

## Root Causes

1. **Backend route bug**: `system-logs.js` referenced `req.tenant.id` which doesn't exist
   - Auth middleware populates `req.user.tenant_id`, not `req.tenant.id`
   - This caused `effectiveTenantId` to always be `null` when user didn't explicitly pass tenant_id

2. **Database schema constraint**: `system_logs.tenant_id` was NOT NULL
   - Global system events (startup, monitoring, superadmin actions) have no tenant context
   - NULL tenant_id is valid and necessary for system-wide logging

## Solution

### 1. Backend Code Fix
Fixed [backend/routes/system-logs.js](backend/routes/system-logs.js):
```javascript
// BEFORE (broken)
if (!effectiveTenantId && req.tenant?.id) {
  effectiveTenantId = req.tenant.id;
}

// AFTER (fixed)
if (!effectiveTenantId && req.user?.tenant_id) {
  effectiveTenantId = req.user.tenant_id;
}
```

Applied to both `POST /` and `POST /bulk` endpoints.

### 2. Database Migration
Created [supabase/migrations/20251218_system_logs_nullable_tenant.sql](supabase/migrations/20251218_system_logs_nullable_tenant.sql):

- Makes `system_logs.tenant_id` nullable
- Updates RLS policies:
  - Superadmins see all logs (including NULL tenant_id)
  - Regular users see only their tenant's logs
  - All can INSERT with their tenant_id or NULL
- Adds performance indexes for NULL and non-NULL cases

### 3. Migration Application Script
Created [backend/apply-system-logs-nullable-migration.js](backend/apply-system-logs-nullable-migration.js) for immediate deployment.

## Deployment Steps

### Automatic (Preferred)
1. Push changes to main branch
2. Tag with version: `git tag v3.0.5 && git push origin v3.0.5`
3. GitHub Actions deploys automatically

### Manual (Emergency)
If immediate fix needed before automated deployment:

1. **Apply migration to production database:**
   ```bash
   # Via script
   doppler run -- node backend/apply-system-logs-nullable-migration.js
   
   # OR via Supabase Dashboard
   # 1. Go to Supabase Dashboard → SQL Editor
   # 2. Paste contents of supabase/migrations/20251218_system_logs_nullable_tenant.sql
   # 3. Click "Run"
   ```

2. **Deploy backend code fix:**
   - The backend code change is backward compatible
   - Can be deployed independently via normal CI/CD pipeline

## Verification

After deployment, verify:
1. No more 500 errors on `/api/system-logs/bulk`
2. Frontend console shows no "tenant_id must not be null" errors
3. System logs appear in database with proper tenant_id values
4. NULL tenant_id logs visible only to superadmins

```sql
-- Check for NULL tenant_id logs (should work now)
SELECT id, level, message, tenant_id, created_at 
FROM system_logs 
WHERE tenant_id IS NULL 
ORDER BY created_at DESC 
LIMIT 10;
```

## Impact Assessment

**Severity**: CRITICAL - Production logging completely broken  
**Scope**: All users, all tenants  
**Downtime**: None (fix is additive, no breaking changes)  
**Rollback**: Not needed (changes are backward compatible)

## Related Files

- `backend/routes/system-logs.js` - Backend route fix
- `supabase/migrations/20251218_system_logs_nullable_tenant.sql` - DB schema fix
- `backend/apply-system-logs-nullable-migration.js` - Migration script
- `src/utils/systemLogBatcher.js` - Frontend batching (no changes needed)
- `src/components/shared/Logger.jsx` - Logging component (no changes needed)

## Architecture Notes

Per copilot-instructions.md:
- **UUID-First Multi-Tenancy**: Always use `tenant_id` (UUID) for foreign keys
- **tenant(id)** is the correct FK reference (table is singular)
- **NULL tenant_id** is valid for system-wide operations
- **req.user.tenant_id** is populated by auth middleware, not `req.tenant.id`
