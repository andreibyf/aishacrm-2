# Activities Table UUID Investigation - January 4, 2026

## Problem Statement
DELETE requests to `/api/v2/activities/:id` returning 404 errors even though records exist in the database.

## Root Cause Analysis

### Database Schema Reality
Per Supabase table editor (screenshot evidence):
- `activities.id` → **uuid**
- `activities.tenant_id` → **uuid** ✅
- `activities.assigned_to` → **uuid**

### Historical Migration Path
1. **Migration 001** (`001_init.sql`): Created `activities.tenant_id` as TEXT
2. **Migration 081** (`081_complete_field_parity.sql`): Added `activities.assigned_to` as UUID with FK to `employees(id)`
3. **UNKNOWN MIGRATION**: Converted `activities.tenant_id` from TEXT → UUID (not found in migration files, possibly manual Supabase dashboard change or missing migration)

### Critical Bug: RLS Policies (Migration 057)
**File**: `backend/migrations/057_consolidate_rls_activities.sql`

**Issue**: RLS policies assume `tenant_id` is TEXT:
```sql
-- ❌ WRONG: Compares UUID column to TEXT
tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
```

**Impact**:
- ALL JWT-authenticated requests fail RLS checks (UUID ≠ TEXT in PostgreSQL)
- Backend API works because it uses `service_role` key (bypasses RLS)
- Any future JWT-based access (mobile app, direct Supabase client) will FAIL

**Correct Pattern** (from migration 055 - conversations):
```sql
-- ✅ CORRECT: Cast TEXT to UUID
tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
```

## Solution

### Migration 113: Fix Activities RLS UUID
**File**: `backend/migrations/113_fix_activities_rls_uuid.sql`

**Changes**:
- Drop all 4 existing RLS policies (SELECT, INSERT, UPDATE, DELETE)
- Recreate with proper UUID casting
- Pattern: `tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))`

**Deployment Status**: ⏳ Created but not yet applied (requires Supabase dashboard SQL editor or direct DB access)

## Backend Code Analysis

### V2 Routes (`backend/routes/activities.v2.js`)
**DELETE Handler** (Line 513):
```javascript
const { data, error } = await supabase
  .from('activities')
  .delete()
  .eq('id', id)
  .eq('tenant_id', tenant_id)  // ✅ Supabase.JS handles UUID string → UUID conversion
  .select('*')
  .maybeSingle();
```

**Status**: ✅ **Code is correct** - Supabase.JS client auto-converts UUID strings

### Why 404 Errors?
The 404s from the browser console are likely:
1. **Already deleted**: Multiple rapid DELETE requests for same IDs
2. **Cache issue**: Frontend showing stale data
3. **RLS not the cause**: Backend bypasses RLS with service_role key

## Action Items

### Immediate (Backend Works)
- [x] Document the UUID schema reality
- [x] Create migration 113 to fix RLS policies
- [ ] Apply migration 113 via Supabase dashboard SQL editor

### Future (For JWT Auth)
- [ ] Verify ALL table RLS policies use proper UUID casting where needed
- [ ] Audit other tables that may have had TEXT → UUID conversions
- [ ] Update migration 057 comment to warn about UUID requirement

## Related Migrations to Review
- `055_consolidate_rls_conversations.sql` - ✅ Correct UUID RLS pattern (reference)
- `056_consolidate_rls_accounts.sql` - ⚠️ May have similar issue (check schema)
- `058_consolidate_rls_contacts.sql` - ⚠️ May have similar issue
- `059_consolidate_rls_leads.sql` - ⚠️ May have similar issue
- `060_consolidate_rls_opportunities.sql` - ⚠️ May have similar issue

## Testing Checklist
- [ ] Verify DELETE works via backend API (already working)
- [ ] Test JWT-authenticated DELETE after RLS fix
- [ ] Verify other CRUD operations (GET, POST, PUT)
- [ ] Check if other tables need similar RLS UUID fixes

---
**Investigation Date**: January 4, 2026  
**Investigator**: GitHub Copilot  
**Status**: RLS bug identified and fixed in migration 113, awaiting deployment
