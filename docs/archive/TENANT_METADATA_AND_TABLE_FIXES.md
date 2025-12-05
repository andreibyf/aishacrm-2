# Tenant Metadata Flattening & Replicated Table Cleanup

**Created:** November 13, 2025  
**Status:** 🔴 Needs Implementation

## Overview

This document identifies two critical database schema issues that need resolution:
1. **Tenant metadata should be flattened** into dedicated columns for better query performance and type safety
2. **Duplicate table names** exist (`performance_logs` vs `performance_log`, `bizdev_sources` vs `bizdev_source`)

---

## Issue 1: Tenant Metadata Flattening

### Current State

The `tenant` table stores business-critical information in a JSONB `metadata` column:

```json
{
  "domain": "",
  "country": "United States",
  "industry": "construction_and_engineering",
  "major_city": "Denver",
  "display_order": 0,
  "business_model": "b2b",
  "geographic_focus": "north_america",
  "elevenlabs_agent_id": "agent_3401k77e6wche0rtzc288n5k34z1"
}
```

### Current Tenant Table Schema

**From:** `backend/migrations/006_tenant_table.sql` and `backend/migrations/009_complete_schema.sql`

```sql
CREATE TABLE IF NOT EXISTS tenant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL UNIQUE,
  name TEXT,
  settings JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',  -- ⚠️ This should be flattened
  created_at TIMESTAMPTZ DEFAULT now(),
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Problems with Current Approach

1. **No Type Safety**: JSONB fields lack schema validation
2. **Poor Query Performance**: Cannot create efficient indexes on JSONB keys
3. **Difficult Joins**: Cannot easily join on metadata fields
4. **No Referential Integrity**: Cannot enforce foreign keys to other tables
5. **Migration Complexity**: Changing metadata structure requires application-level logic

### Proposed Flattened Schema

```sql
CREATE TABLE IF NOT EXISTS tenant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL UNIQUE,
  name TEXT,
  
  -- Flattened metadata fields
  domain TEXT,
  country TEXT,
  industry TEXT,
  major_city TEXT,
  display_order INTEGER DEFAULT 0,
  business_model TEXT,
  geographic_focus TEXT,
  elevenlabs_agent_id TEXT,
  
  -- Existing fields
  settings JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',  -- Keep for backward compatibility/extra fields
  created_at TIMESTAMPTZ DEFAULT now(),
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenant_industry ON tenant(industry);
CREATE INDEX IF NOT EXISTS idx_tenant_country ON tenant(country);
CREATE INDEX IF NOT EXISTS idx_tenant_business_model ON tenant(business_model);
CREATE INDEX IF NOT EXISTS idx_tenant_geographic_focus ON tenant(geographic_focus);
```

### Migration Strategy

**Step 1: Create Migration File**

```sql
-- backend/migrations/050_flatten_tenant_metadata.sql

-- Add new columns
ALTER TABLE tenant
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS major_city TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS business_model TEXT,
  ADD COLUMN IF NOT EXISTS geographic_focus TEXT,
  ADD COLUMN IF NOT EXISTS elevenlabs_agent_id TEXT;

-- Migrate existing metadata to new columns
UPDATE tenant
SET
  domain = metadata->>'domain',
  country = metadata->>'country',
  industry = metadata->>'industry',
  major_city = metadata->>'major_city',
  display_order = COALESCE((metadata->>'display_order')::INTEGER, 0),
  business_model = metadata->>'business_model',
  geographic_focus = metadata->>'geographic_focus',
  elevenlabs_agent_id = metadata->>'elevenlabs_agent_id'
WHERE metadata IS NOT NULL AND metadata != '{}';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tenant_industry ON tenant(industry);
CREATE INDEX IF NOT EXISTS idx_tenant_country ON tenant(country);
CREATE INDEX IF NOT EXISTS idx_tenant_business_model ON tenant(business_model);
CREATE INDEX IF NOT EXISTS idx_tenant_geographic_focus ON tenant(geographic_focus);

-- Optional: Remove migrated keys from metadata JSONB
-- UPDATE tenant SET metadata = metadata - ARRAY['domain', 'country', 'industry', 'major_city', 'display_order', 'business_model', 'geographic_focus', 'elevenlabs_agent_id'];
```

### Backend Code Changes Required

#### Files to Update:

1. **backend/routes/tenants.js**
   - Line ~101: "Normalize tenant rows to expose common branding fields from branding_settings/metadata"
   - Line ~408: `const selMeta = supabase.from('tenant').select('metadata');`
   - **Action**: Update to read/write flattened columns instead of metadata JSONB

2. **backend/routes/ai.js**
   - Line 305: `const tenantName = conversationMetadata?.tenant_name || tenantRecord?.name || tenantSlug || 'CRM Tenant';`
   - Line 792-794: References to `metadata?.tenant_slug`, `metadata?.tenant_uuid`, `metadata?.tenant_name`
   - **Action**: Update to use direct columns where applicable

3. **backend/lib/braidIntegration.js**
   - Documentation lines reference metadata structure
   - **Action**: Update documentation to reflect flattened schema

#### Example Code Changes:

**Before:**
```javascript
// backend/routes/tenants.js
const tenant = await supabase
  .from('tenant')
  .select('*')
  .eq('tenant_id', tenantId)
  .single();

const industry = tenant.metadata?.industry;
const elevenlabsAgentId = tenant.metadata?.elevenlabs_agent_id;
```

**After:**
```javascript
// backend/routes/tenants.js
const tenant = await supabase
  .from('tenant')
  .select('*')
  .eq('tenant_id', tenantId)
  .single();

const industry = tenant.industry;  // Direct column access
const elevenlabsAgentId = tenant.elevenlabs_agent_id;  // Direct column access
```

### Frontend Code Changes Required

#### Files to Check:

1. **src/api/entities.js**
   - Lines 1317, 1430, 1480, 1490, 1505, 1545: References to `user_metadata?.tenant_id`
   - **Action**: Verify if any UI reads tenant metadata; update to use direct properties

2. **src/components/** (various)
   - Search for any components that display tenant information
   - **Action**: Update to use flattened properties instead of metadata object

#### Example Code Changes:

**Before:**
```javascript
// Display tenant industry from metadata
const industry = tenant?.metadata?.industry || 'N/A';
const country = tenant?.metadata?.country || 'Unknown';
```

**After:**
```javascript
// Display tenant industry from direct column
const industry = tenant?.industry || 'N/A';
const country = tenant?.country || 'Unknown';
```

### Testing Requirements

- [ ] Unit tests for tenant creation with flattened fields
- [ ] Integration tests for tenant queries
- [ ] Backend API tests for `/api/tenants` routes
- [ ] Frontend tests for tenant display components
- [ ] Migration script test on sample data
- [ ] Rollback script in case of issues

---

## Issue 2: Replicated Table Names

### Problem: `performance_logs` vs `performance_log`

**Conflicting Definitions:**

1. **`performance_log`** (singular) - Defined in:
   - `backend/migrations/009_complete_schema.sql` (line 260)
   - `supabase/migrations/20251029233356_remote_schema.sql` (line 764)

2. **`performance_logs`** (plural) - Referenced in:
   - `backend/migrations/022_secure_performance_logs.sql` (line 4, 14, 17, 20, 25)
   - `backend/migrations/023_comprehensive_rls_security.sql` (line 33, 92, 102)

**Current Schema:**
```sql
CREATE TABLE IF NOT EXISTS performance_log (  -- ⚠️ Singular
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  duration INTEGER NOT NULL,
  status TEXT DEFAULT 'success',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**RLS Policies Reference Non-existent Table:**
```sql
-- backend/migrations/022_secure_performance_logs.sql
ALTER TABLE public.performance_logs ENABLE ROW LEVEL SECURITY;  -- ⚠️ Plural (doesn't exist)
```

### Problem: `bizdev_sources` vs `bizdev_source`

**Conflicting Definitions:**

1. **`bizdev_source`** (singular) - Defined in:
   - `backend/migrations/009_complete_schema.sql` (line 361)
   - `supabase/migrations/20251029233356_remote_schema.sql` (line 331)

2. **`bizdev_sources`** (plural) - Referenced in:
   - `backend/migrations/011_enable_rls.sql` (line 15)
   - `backend/migrations/023_comprehensive_rls_security.sql` (line 49)
   - `backend/migrations/024_fix_function_search_path.sql` (lines 32, 34, 36, 50, 53-57, 123)
   - `backend/routes/bizdevsources.js` (lines 72, 300, 301)

**Current Schema:**
```sql
CREATE TABLE IF NOT EXISTS bizdev_source (  -- ⚠️ Singular
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_url TEXT,
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Backend Routes Reference Different Table:**
```javascript
// backend/routes/bizdevsources.js
const result = await pgPool.query(
  'SELECT * FROM bizdev_sources WHERE tenant_id = $1 AND id = $2 LIMIT 1',  // ⚠️ Plural
  [tenant_id, id]
);
```

### Resolution Strategy

**Option A: Standardize to Plural (Recommended)**

Pros:
- Matches REST API convention (`/api/bizdev-sources`)
- Matches backend route file names (`bizdevsources.js`)
- More intuitive for developers

**Migration Steps:**

```sql
-- backend/migrations/051_fix_table_name_consistency.sql

-- Fix performance_log → performance_logs
ALTER TABLE IF EXISTS performance_log RENAME TO performance_logs;

-- Fix bizdev_source → bizdev_sources
ALTER TABLE IF EXISTS bizdev_source RENAME TO bizdev_sources;

-- Update any indexes
ALTER INDEX IF EXISTS idx_performance_log_tenant_id RENAME TO idx_performance_logs_tenant_id;
ALTER INDEX IF EXISTS idx_bizdev_source_tenant_id RENAME TO idx_bizdev_sources_tenant_id;

-- Update any triggers
-- (Check for triggers and rename them accordingly)
```

### Files Requiring Updates After Table Rename

#### Performance Logs:

**Already Correct (using plural):**
- ✅ `backend/migrations/022_secure_performance_logs.sql`
- ✅ `backend/migrations/023_comprehensive_rls_security.sql`

**Needs Update (currently using singular):**
- ❌ `backend/migrations/009_complete_schema.sql` (line 260) - Change CREATE TABLE
- ❌ `supabase/migrations/20251029233356_remote_schema.sql` (line 764) - Change CREATE TABLE

#### BizDev Sources:

**Already Correct (using plural):**
- ✅ `backend/routes/bizdevsources.js` (all queries)
- ✅ `backend/migrations/024_fix_function_search_path.sql` (triggers and functions)

**Needs Update (currently using singular):**
- ❌ `backend/migrations/009_complete_schema.sql` (line 361) - Change CREATE TABLE
- ❌ `supabase/migrations/20251029233356_remote_schema.sql` (line 331) - Change CREATE TABLE

### Backend Code Impact Analysis

**Backend Routes Using Tables:**

1. **bizdevsources.js** - Already uses `bizdev_sources` (plural) ✅
   - Line 72: SELECT query
   - Line 300-301: SELECT FOR UPDATE query
   - **No changes needed**

2. **Performance logs** - Need to verify if any backend routes exist
   - No routes found using `performance_log` directly
   - **Likely no code changes needed**

### Testing Requirements

- [ ] Verify table renames work without data loss
- [ ] Test all bizdev_sources CRUD operations
- [ ] Verify RLS policies apply correctly after rename
- [ ] Check for any foreign key constraints
- [ ] Test triggers and functions still work
- [ ] Verify indexes are properly renamed

---

## Implementation Checklist

### Phase 1: Analysis & Planning
- [x] Document current state
- [x] Identify all affected code locations
- [ ] Create detailed migration scripts
- [ ] Review with team
- [ ] Set up test environment

### Phase 2: Table Name Fixes (Lower Risk)
- [ ] Create migration: `051_fix_table_name_consistency.sql`
- [ ] Test migration on dev database
- [ ] Update schema documentation
- [ ] Deploy to staging
- [ ] Run automated tests
- [ ] Deploy to production

### Phase 3: Tenant Metadata Flattening (Higher Risk)
- [ ] Create migration: `050_flatten_tenant_metadata.sql`
- [ ] Create rollback script
- [ ] Update backend routes (`tenants.js`, `ai.js`)
- [ ] Update frontend components
- [ ] Write comprehensive tests
- [ ] Test migration on dev database with real data
- [ ] Deploy to staging
- [ ] Monitor performance improvements
- [ ] Deploy to production with monitoring

### Phase 4: Documentation & Cleanup
- [ ] Update API documentation
- [ ] Update developer guide
- [ ] Remove deprecated metadata accessors
- [ ] Archive old migration files
- [ ] Update TypeScript types (if applicable)

---

## Risk Assessment

### Tenant Metadata Flattening

**Risk Level:** 🟡 Medium-High

**Risks:**
- Existing code may break if not all metadata accessors are updated
- Data loss if migration script has bugs
- Performance regression if indexes not properly created

**Mitigation:**
- Comprehensive code search for all metadata accessors
- Test migration on production-like dataset
- Keep metadata JSONB column for backward compatibility during transition period
- Deploy with feature flag to quickly rollback if needed

### Table Name Fixes

**Risk Level:** 🟢 Low-Medium

**Risks:**
- Existing queries may fail if table names not updated
- RLS policies may not apply if table names mismatch
- Foreign key constraints may break

**Mitigation:**
- Table renames are atomic operations
- Most code already uses correct (plural) names
- Test thoroughly on staging before production
- Have rollback script ready

---

## Performance Improvements Expected

### Tenant Metadata Flattening

1. **Query Performance:** 30-50% faster queries on tenant properties
2. **Index Efficiency:** Native B-tree indexes vs JSONB GIN indexes
3. **Query Planner:** Better selectivity estimates for WHERE clauses
4. **Join Performance:** Can use hash/merge joins instead of nested loops

### Example Query Improvement:

**Before (JSONB):**
```sql
SELECT * FROM tenant WHERE metadata->>'industry' = 'construction_and_engineering';
-- Uses: Seq Scan or GIN index (slower)
```

**After (Flattened):**
```sql
SELECT * FROM tenant WHERE industry = 'construction_and_engineering';
-- Uses: B-tree index (faster)
```

---

## Related Documentation

- [DATABASE_UUID_vs_TENANT_ID.md](./DATABASE_UUID_vs_TENANT_ID.md)
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)
- [DATABASE SCHEMA DOCUMENTATION](../backend/migrations/README.md) *(if exists)*

---

## Questions & Answers

**Q: Why keep the metadata JSONB column?**  
A: For backward compatibility during transition and to store non-standard fields that don't warrant dedicated columns.

**Q: Should we do both fixes in one migration?**  
A: No. Table renames are low-risk and should be done first. Metadata flattening requires more code changes and should be separate.

**Q: What about other tables with metadata columns?**  
A: This document focuses on `tenant` table. Other tables (contacts, leads, accounts) use metadata for truly flexible data and don't need flattening.

**Q: How long will migration take on production?**  
A: Table renames: < 1 second (metadata operation). Metadata flattening: depends on tenant count (estimate 1ms per tenant).

---

## Contacts

For questions or concerns about this refactoring, contact:
- **Backend Lead:** [Your Name]
- **Database Admin:** [DBA Name]
- **DevOps:** [DevOps Contact]
