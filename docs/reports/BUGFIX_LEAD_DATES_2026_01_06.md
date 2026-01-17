# Lead Date Issues Fix Summary

## Problem
Leads were showing dates from 1970 (Unix epoch) instead of their actual creation dates. This happened because some code paths were creating leads without setting the `created_date` column, which the frontend uses for age calculations.

## Root Causes

### 1. **callFlowHandler.js** - Inbound Call Lead Creation
- Location: `backend/lib/callFlowHandler.js:537`
- Issue: Raw SQL INSERT only set `created_at`, not `created_date`
- Impact: Leads created from inbound calls had NULL `created_date`, defaulting to epoch

### 2. **workflows.js** - Workflow-Based Lead Creation  
- Location: `backend/routes/workflows.js:347`
- Issue: Dynamic field mapping didn't include timestamp columns
- Impact: Leads created via workflows had NULL `created_date`

### 3. **Database Trigger Not Sufficient**
- Migration 010 added a trigger to sync `created_date` from `created_at`
- However, some INSERT queries may have bypassed the trigger or had NULL values

## Fixes Applied

### Code Changes

#### 1. Fixed callFlowHandler.js
```javascript
// BEFORE
INSERT INTO leads (tenant_id, phone, first_name, last_name, email, source, status, metadata, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())

// AFTER
INSERT INTO leads (tenant_id, phone, first_name, last_name, email, source, status, metadata, created_at, created_date)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
```

#### 2. Fixed workflows.js
```javascript
// BEFORE
const cols = ['tenant_id'];
const vals = [workflow.tenant_id];

// AFTER
const cols = ['tenant_id', 'created_at', 'created_date'];
const vals = [workflow.tenant_id];
vals.push(new Date().toISOString());
vals.push(new Date().toISOString());
```

### Database Migration

Created `backend/migrations/096_fix_lead_created_date_backfill.sql`:

1. **Backfill existing bad dates:**
   ```sql
   UPDATE leads 
   SET created_date = COALESCE(created_at, NOW()) 
   WHERE created_date IS NULL OR created_date < '2000-01-01'::timestamptz;
   ```

2. **Strengthen trigger function:**
   - Now uses `COALESCE(NEW.created_at, NOW())` as fallback
   - Ensures `created_date` is never NULL even if `created_at` is missing

3. **Recreate trigger:**
   - Ensures trigger is active and using latest function

## Verification

### Routes Already Correct ✅
- `backend/routes/leads.js` - Uses Supabase insert with explicit `created_date`
- `backend/routes/leads.v2.js` - Uses Supabase insert with explicit `created_date`
- `backend/routes/bizdevsources.js` - Raw SQL includes `created_date` parameter

### Schema Consistency
According to Copilot instructions (`.github/copilot-instructions.md`):
- **Standard tables** (accounts, leads, contacts, etc.) use `created_at`, `updated_at`
- **Leads table** also has `created_date` for frontend compatibility
- Migration 010 documents this dual-column pattern

## Testing

To apply the migration and fix existing data:

```bash
# Run migration
docker exec aishacrm-backend sh -c "cd /app/backend && node run-migrations.js"

# Or run SQL directly via Supabase/psql
psql $DATABASE_URL < backend/migrations/096_fix_lead_created_date_backfill.sql
```

## Impact

- ✅ New leads from inbound calls will have correct `created_date`
- ✅ New leads from workflows will have correct `created_date`  
- ✅ Existing leads with bad dates will be fixed by migration
- ✅ Database trigger strengthened to prevent future issues
- ✅ Lead age calculations will now show correct values
- ✅ Lead Age Report dashboard will display accurate data

## Related Files

- Fixed: `backend/lib/callFlowHandler.js`
- Fixed: `backend/routes/workflows.js`
- Migration: `backend/migrations/096_fix_lead_created_date_backfill.sql`
- Original: `backend/migrations/010_add_leads_created_date.sql`
- Utility: `backend/fix-lead-dates.js` (standalone script)
- Utility: `backend/check-bad-lead-dates.js` (diagnostic script)

## Prevention

The combination of:
1. Explicit column inclusion in all INSERT queries
2. Strengthened database trigger with COALESCE fallback
3. Index on `(tenant_id, created_date DESC)` for query performance

...ensures this issue won't recur.
