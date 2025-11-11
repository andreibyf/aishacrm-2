# Database Normalization & Entity Lifecycle - Implementation Summary

## What Was Built

### 1. Foreign Key Normalization (Migration 032)
**File:** `backend/migrations/032_normalize_foreign_keys.sql`

Converts all `tenant_id` columns from TEXT strings to proper UUID foreign keys:
- Affects **37 tables** across the entire database
- Changes `tenant_id TEXT` → `tenant_id UUID REFERENCES tenant(id)`
- Adds referential integrity constraints
- Implements CASCADE deletes for data consistency
- Recreates indexes on UUID columns for performance

**Impact:** Every table that had `tenant_id` now uses proper foreign keys pointing to `tenant.id` instead of storing string names like `'labor-depot'`.

### 2. Entity Lifecycle with ID Preservation (Migration 033)
**File:** `backend/migrations/033_entity_lifecycle_with_id_preservation.sql`

Implements ID-preserving entity transformations:
- **Lead → Contact**: Lead ID becomes Contact ID (no duplication)
- **BizDev Source → Account**: BizDev ID becomes Account ID (no duplication)
- Adds `lifecycle_status` columns to track entity state
- Creates `entity_lifecycle_log` table for complete audit trail
- Implements database functions: `convert_lead_to_contact()` and `promote_bizdev_to_account()`
- Creates views for filtering active entities: `active_leads`, `active_contacts`, etc.
- Adds triggers to prevent deletion of converted entities

**Impact:** No more double-counting. When a lead becomes a contact, they share the same UUID.

### 3. Tenant Resolution Helpers
**File:** `backend/lib/tenantHelpers.js`

Utilities for converting tenant names to UUIDs:
- `getTenantUuid(tenantName)`: Convert 'labor-depot' → UUID
- `getTenantName(tenantUuid)`: Reverse lookup UUID → name
- `getTenantUuidBatch()`: Batch conversion for multiple tenants
- `resolveTenantMiddleware`: Express middleware for automatic conversion
- In-memory caching with 5-minute TTL for performance

**Impact:** Backend routes can continue to receive tenant names from frontend while using UUIDs internally.

### 4. Updated Lead Conversion Route
**File:** `backend/routes/leads.js` (line 328+)

New ID-preserving lead conversion:
```javascript
POST /api/leads/:id/convert
{
  "tenant_id": "labor-depot",
  "account_id": "uuid...",
  "create_opportunity": true,
  "performed_by": "user@example.com"
}
```

**Features:**
- Calls `convert_lead_to_contact()` database function
- Preserves lead ID as contact ID
- Marks lead as `lifecycle_status: 'converted_to_contact'`
- Logs transformation in `entity_lifecycle_log`
- Optionally creates opportunity linked to new contact

### 5. Updated BizDev Promotion Route
**File:** `backend/routes/bizdevsources.js` (line 269+)

New ID-preserving bizdev promotion:
```javascript
POST /api/bizdevsources/:id/promote
{
  "tenant_id": "labor-depot",
  "account_name": "Acme Corp",
  "performed_by": "user@example.com"
}
```

**Features:**
- Calls `promote_bizdev_to_account()` database function
- Preserves bizdev ID as account ID
- Marks bizdev as `lifecycle_status: 'promoted_to_account'`
- Logs transformation in `entity_lifecycle_log`
- Automatically links related opportunities to new account

### 6. Documentation
**Files:**
- `backend/FOREIGN_KEY_MIGRATION_GUIDE.md`: Complete tenant UUID migration guide
- `backend/ENTITY_LIFECYCLE_GUIDE.md`: Entity lifecycle patterns and examples

## How It Works: The Complete Flow

### Example: Lead → Contact Conversion

1. **User converts lead in UI**
   ```javascript
   // Frontend sends tenant name (string)
   POST /api/leads/4ec2bc47.../convert
   { tenant_id: "labor-depot" }
   ```

2. **Backend resolves tenant UUID**
   ```javascript
   const tenantUuid = await getTenantUuid('labor-depot');
   // Returns: 'a1b2c3d4-...' (tenant.id)
   ```

3. **Database function preserves ID**
   ```sql
   SELECT convert_lead_to_contact(
     '4ec2bc47-...', -- lead_id
     'a1b2c3d4-...', -- tenant_uuid
     null,           -- account_id
     'user@...'      -- performed_by
   );
   ```

4. **Function creates contact with same ID**
   ```sql
   INSERT INTO contacts (
     id,          -- SAME as lead_id!
     tenant_id,   -- UUID foreign key
     first_name, 
     ...
   ) VALUES (
     '4ec2bc47-...', -- Lead's ID reused
     'a1b2c3d4-...', -- Tenant UUID
     'John',
     ...
   );
   
   UPDATE leads
   SET lifecycle_status = 'converted_to_contact'
   WHERE id = '4ec2bc47-...';
   ```

5. **Audit trail created**
   ```sql
   INSERT INTO entity_lifecycle_log (
     source_entity_type: 'lead',
     source_entity_id: '4ec2bc47-...',
     target_entity_type: 'contact',
     target_entity_id: '4ec2bc47-...', -- SAME ID!
     transformation_type: 'convert',
     source_data_snapshot: {...}
   );
   ```

6. **Result: No double-counting**
   - Original lead still in database but marked as converted
   - Contact exists with **identical UUID**
   - Queries for "active leads" exclude converted ones
   - Total count = active_leads + contacts (no overlap!)

## Migration Execution Plan

### Prerequisites
1. Backup database
2. Ensure all tenants exist in `tenant` table with proper `tenant_id` strings
3. Stop application to prevent data writes during migration

### Execution Steps

#### Step 1: Apply Foreign Key Migration
```bash
# Via Supabase Dashboard SQL Editor
# Run: backend/migrations/032_normalize_foreign_keys.sql
```

This will:
- Add `tenant_uuid UUID` columns to all tables
- Copy data from `tenant_id TEXT` to `tenant_uuid UUID`
- Drop old `tenant_id TEXT` columns
- Rename `tenant_uuid` → `tenant_id`
- Add foreign key constraints
- Recreate indexes

**Duration:** ~5-10 minutes for medium database  
**Downtime Required:** Yes

#### Step 2: Apply Lifecycle Migration
```bash
# Via Supabase Dashboard SQL Editor
# Run: backend/migrations/033_entity_lifecycle_with_id_preservation.sql
```

This will:
- Add `lifecycle_status` columns
- Create `entity_lifecycle_log` table
- Create conversion functions
- Create filtered views
- Add protective triggers

**Duration:** ~2-3 minutes  
**Downtime Required:** No (but recommended to apply with Step 1)

#### Step 3: Update Backend Code
All route files that query with `tenant_id` need updating. **Priority routes:**

1. **MCP Routes** (CRITICAL - AI agent responses depend on this)
   ```javascript
   // backend/routes/mcp.js
   import { getTenantUuid } from '../lib/tenantHelpers.js';
   
   case 'crm.get_tenant_stats':
     const tenantUuid = await getTenantUuid(parameters.tenant_id);
     // Use tenantUuid in queries...
   ```

2. **Lead Routes** (DONE - already updated)
   - Conversion endpoint uses `convert_lead_to_contact()` function
   
3. **BizDev Routes** (DONE - already updated)
   - Promotion endpoint uses `promote_bizdev_to_account()` function

4. **Remaining 24 route files** (TODO)
   - accounts.js
   - activities.js
   - contacts.js
   - opportunities.js
   - [21 more route files...]

#### Step 4: Test Critical Paths
```bash
# Test tenant resolution
curl http://localhost:4001/api/test-tenant-resolve?tenant_id=labor-depot

# Test lead conversion
curl -X POST http://localhost:4001/api/leads/{id}/convert \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "labor-depot", "account_id": null}'

# Test bizdev promotion
curl -X POST http://localhost:4001/api/bizdevsources/{id}/promote \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "labor-depot"}'

# Test MCP tool
curl -X POST http://localhost:4001/api/mcp/execute-tool \
  -H "Content-Type: application/json" \
  -d '{
    "server_id": "crm",
    "tool_name": "crm.get_tenant_stats",
    "parameters": {"tenant_id": "labor-depot"}
  }'
```

#### Step 5: Deploy & Monitor
- Deploy backend with updated routes
- Monitor logs for "Tenant not found" errors
- Check Sentry/error tracking for UUID conversion issues
- Verify frontend still works (should be transparent)

## What Still Needs to Be Done

### High Priority (Blocks Production)
1. **Update MCP routes** (`backend/routes/mcp.js`)
   - Add `getTenantUuid()` to all CRM tool handlers
   - Critical for AI agent accuracy

2. **Update remaining 24 route files**
   - Each route that queries with `tenant_id` needs UUID conversion
   - Can be done incrementally (routes still work with old schema until migration)

3. **Test comprehensive scenarios**
   - Multi-tenant data isolation
   - Lead→Contact conversion with opportunities
   - BizDev→Account promotion with contact creation
   - Report accuracy (no double-counting)

### Medium Priority (Improvements)
1. **Add lifecycle status to UI**
   - Show "Converted from Lead" badge on contacts
   - Show "Promoted from BizDev" badge on accounts
   - Filter option for "Show only active leads"

2. **Create lifecycle API endpoints**
   - `GET /api/entities/lifecycle/:id` - Get transformation history
   - `GET /api/leads/:id/contact` - Get contact created from lead
   - `GET /api/bizdev/:id/account` - Get account created from bizdev

3. **Add reversal functions** (if needed)
   - Function to "unconvert" contact back to lead
   - Function to "demote" account back to bizdev

### Low Priority (Nice to Have)
1. **Lifecycle dashboard**
   - Conversion rate: leads → contacts
   - Promotion rate: bizdev → accounts
   - Time-to-convert metrics

2. **Automated lifecycle rules**
   - Auto-convert leads after X days
   - Auto-promote bizdev after Y opportunities
   - Workflow triggers on lifecycle changes

## Rollback Plan

If migration fails or causes issues:

```sql
-- Restore from backup
DROP DATABASE your_database;
CREATE DATABASE your_database;
psql -U postgres -d your_database < backup_before_migration.sql

-- Or selective rollback:
-- 1. Drop new constraints
ALTER TABLE leads DROP CONSTRAINT IF EXISTS fk_leads_tenant;
-- 2. Restore TEXT columns
-- 3. Re-populate with tenant names
```

## Benefits Achieved

### Before
- ❌ `tenant_id` as TEXT strings (`'labor-depot'`)
- ❌ No referential integrity
- ❌ Double-counting (lead ID ≠ contact ID)
- ❌ Orphaned records possible
- ❌ No lifecycle tracking

### After
- ✅ `tenant_id` as UUID foreign keys
- ✅ Database-enforced referential integrity
- ✅ No double-counting (lead ID = contact ID)
- ✅ Cascade deletes prevent orphans
- ✅ Complete lifecycle audit trail
- ✅ Better query performance (UUID indexes)
- ✅ Proper relational database design

## Questions & Support

- **Schema Questions:** See `backend/DATABASE_UUID_vs_TENANT_ID.md`
- **Migration Issues:** See `backend/FOREIGN_KEY_MIGRATION_GUIDE.md`
- **Lifecycle Patterns:** See `backend/ENTITY_LIFECYCLE_GUIDE.md`
- **Code Examples:** See updated `backend/routes/leads.js` and `backend/routes/bizdevsources.js`

---

**Status:** ✅ Migrations created, routes updated (leads & bizdev), helpers built, documentation complete
**Next Step:** Apply migrations to database, then update remaining route files
