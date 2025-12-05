# Tenant Metadata Flattening - Code Update Checklist

**Created:** November 13, 2025  
**Related:** [TENANT_METADATA_AND_TABLE_FIXES.md](./TENANT_METADATA_AND_TABLE_FIXES.md)

## Quick Reference: Before → After

### Accessing Tenant Metadata

**❌ BEFORE (JSONB metadata):**
```javascript
const industry = tenant.metadata?.industry;
const country = tenant.metadata?.country;
const elevenlabsAgentId = tenant.metadata?.elevenlabs_agent_id;
```

**✅ AFTER (Flattened columns):**
```javascript
const industry = tenant.industry;
const country = tenant.country;
const elevenlabsAgentId = tenant.elevenlabs_agent_id;
```

### Setting Tenant Metadata

**❌ BEFORE:**
```javascript
await supabase
  .from('tenant')
  .update({
    metadata: {
      ...existingTenant.metadata,
      industry: 'construction_and_engineering',
      country: 'United States'
    }
  })
  .eq('tenant_id', tenantId);
```

**✅ AFTER:**
```javascript
await supabase
  .from('tenant')
  .update({
    industry: 'construction_and_engineering',
    country: 'United States'
  })
  .eq('tenant_id', tenantId);
```

### Querying by Tenant Metadata

**❌ BEFORE (Slower JSONB query):**
```sql
SELECT * FROM tenant 
WHERE metadata->>'industry' = 'construction_and_engineering';
```

**✅ AFTER (Faster indexed query):**
```sql
SELECT * FROM tenant 
WHERE industry = 'construction_and_engineering';
```

---

## Backend Files to Update

### Priority 1: Critical Routes

#### 1. `backend/routes/tenants.js`

**Location:** Line ~101, Line ~408

**Search for:**
```javascript
metadata?.industry
metadata?.country
metadata?.elevenlabs_agent_id
metadata->>'industry'
selMeta = supabase.from('tenant').select('metadata')
```

**Replace with:**
```javascript
// Direct property access
industry
country
elevenlabs_agent_id

// SQL queries
SELECT industry, country, ... FROM tenant

// Supabase select
supabase.from('tenant').select('industry, country, elevenlabs_agent_id, ...')
```

**Specific Changes:**

```javascript
// BEFORE
const normalizeTenant = (raw) => ({
  ...raw,
  industry: raw.metadata?.industry || raw.branding_settings?.industry,
  country: raw.metadata?.country || raw.branding_settings?.country,
});

// AFTER
const normalizeTenant = (raw) => ({
  ...raw,
  // Direct properties now, fallback to metadata for backward compat during transition
  industry: raw.industry || raw.metadata?.industry || raw.branding_settings?.industry,
  country: raw.country || raw.metadata?.country || raw.branding_settings?.country,
});
```

#### 2. `backend/routes/ai.js`

**Location:** Lines 305, 792-794

**Search for:**
```javascript
metadata?.tenant_slug
metadata?.tenant_uuid
metadata?.tenant_name
```

**Note:** These are NOT tenant table metadata - these are conversation metadata.  
✅ **No changes needed** - this is different metadata context.

#### 3. Any route creating/updating tenants

**Search Pattern:**
```bash
grep -r "metadata.*industry" backend/routes/
grep -r "metadata.*country" backend/routes/
grep -r "metadata.*elevenlabs" backend/routes/
```

---

## Frontend Files to Update

### Search Patterns

Run these searches to find all locations:

```bash
# VS Code search or grep
tenant.*metadata.*industry
tenant.*metadata.*country
tenant.*metadata.*elevenlabs
tenant.*metadata.*business_model
tenant.*metadata.*geographic_focus
```

### Common Locations

1. **Tenant Settings Pages**
   - `src/pages/Settings.jsx` or similar
   - `src/components/settings/TenantSettings.jsx`

2. **Admin/Tenant Management**
   - `src/pages/Admin/Tenants.jsx`
   - `src/components/admin/TenantList.jsx`
   - `src/components/admin/TenantForm.jsx`

3. **Dashboard/Overview**
   - Any component displaying tenant info
   - Profile dropdowns showing tenant details

### Example Component Update

**BEFORE:**
```jsx
// src/components/TenantProfile.jsx
function TenantProfile({ tenant }) {
  const industry = tenant?.metadata?.industry || 'N/A';
  const country = tenant?.metadata?.country || 'Unknown';
  
  return (
    <div>
      <p>Industry: {industry}</p>
      <p>Location: {country}</p>
    </div>
  );
}
```

**AFTER:**
```jsx
// src/components/TenantProfile.jsx
function TenantProfile({ tenant }) {
  // Use direct properties, fallback to metadata for backward compat
  const industry = tenant?.industry || tenant?.metadata?.industry || 'N/A';
  const country = tenant?.country || tenant?.metadata?.country || 'Unknown';
  
  return (
    <div>
      <p>Industry: {industry}</p>
      <p>Location: {country}</p>
    </div>
  );
}
```

---

## Testing Checklist

### Backend API Tests

- [ ] Test tenant creation with new flattened fields
  ```bash
  POST /api/tenants
  {
    "tenant_id": "test-tenant",
    "name": "Test Tenant",
    "industry": "construction_and_engineering",
    "country": "United States",
    "business_model": "b2b"
  }
  ```

- [ ] Test tenant update with flattened fields
  ```bash
  PUT /api/tenants/:id
  { "industry": "manufacturing" }
  ```

- [ ] Test tenant query by industry
  ```bash
  GET /api/tenants?industry=construction_and_engineering
  ```

- [ ] Verify backward compatibility: old metadata still works
  ```bash
  PUT /api/tenants/:id
  { "metadata": { "industry": "retail" } }
  # Should update both metadata AND the industry column (via trigger)
  ```

### Frontend UI Tests

- [ ] Tenant settings page loads and displays correct industry
- [ ] Tenant profile shows correct country and city
- [ ] Admin tenant list displays industries correctly
- [ ] Creating new tenant via UI saves to flattened columns
- [ ] Editing tenant via UI updates flattened columns

### Database Tests

Run these SQL queries after migration:

```sql
-- Verify all data migrated
SELECT 
  COUNT(*) as total_tenants,
  COUNT(industry) as has_industry,
  COUNT(country) as has_country,
  COUNT(elevenlabs_agent_id) as has_elevenlabs
FROM tenant;

-- Check for any orphaned metadata
SELECT tenant_id, metadata 
FROM tenant 
WHERE 
  metadata ? 'industry' OR 
  metadata ? 'country' OR 
  metadata ? 'elevenlabs_agent_id'
LIMIT 10;

-- Verify indexes exist
SELECT indexname FROM pg_indexes 
WHERE tablename = 'tenant' 
AND indexname LIKE 'idx_tenant_%';

-- Test query performance
EXPLAIN ANALYZE 
SELECT * FROM tenant WHERE industry = 'construction_and_engineering';
```

---

## Migration Execution Order

1. **Run table name fixes first** (lower risk):
   ```bash
   psql -f backend/migrations/051_fix_table_name_consistency.sql
   ```

2. **Deploy code changes for table renames**:
   - Verify backend routes use `bizdev_sources` and `performance_logs`
   - Test thoroughly

3. **Run tenant metadata flattening** (after code is ready):
   ```bash
   psql -f backend/migrations/050_flatten_tenant_metadata.sql
   ```

4. **Deploy backend code updates**:
   - Update routes to use flattened columns
   - Keep fallback to metadata for backward compat

5. **Deploy frontend code updates**:
   - Update components to use direct properties
   - Keep fallback to metadata for transition period

6. **Monitor for 1-2 weeks**, then:
   - Remove metadata fallbacks from code
   - Optionally clean up metadata JSONB (uncomment Step 5 in migration)
   - Remove the sync trigger once confident

---

## Rollback Procedure

If issues are encountered:

1. **DO NOT PANIC** - data is preserved in both places during transition
2. **Revert code changes** via git
3. **Run rollback migration** (if needed):
   ```bash
   psql -f backend/migrations/ROLLBACK_050_flatten_tenant_metadata.sql
   ```
4. **Verify data integrity**:
   ```sql
   SELECT tenant_id, metadata FROM tenant LIMIT 5;
   ```

---

## Performance Monitoring

### Queries to Monitor

Track these queries before/after migration:

```sql
-- Query by industry
SELECT * FROM tenant WHERE industry = 'construction_and_engineering';

-- Query by country
SELECT * FROM tenant WHERE country = 'United States';

-- Join tenants with accounts
SELECT t.name, COUNT(a.id) 
FROM tenant t 
LEFT JOIN accounts a ON a.tenant_id = t.tenant_id
WHERE t.industry = 'construction_and_engineering'
GROUP BY t.name;
```

### Expected Improvements

- **Query execution time**: 30-50% faster
- **Index scans**: B-tree instead of GIN
- **Query planner estimates**: More accurate row counts

---

## Common Pitfalls

❌ **Don't do this:**
```javascript
// Writing to metadata without also updating columns
tenant.metadata.industry = 'new_industry';
// ⚠️ The trigger handles this, but direct updates are better
```

✅ **Do this instead:**
```javascript
// Update the flattened column directly
tenant.industry = 'new_industry';
```

---

❌ **Don't do this:**
```sql
-- Querying metadata after migration
WHERE metadata->>'industry' = 'construction'
```

✅ **Do this instead:**
```sql
-- Query the indexed column
WHERE industry = 'construction'
```

---

## Questions?

- **Issue Tracker:** Create issue with label `database-migration`
- **Slack:** #backend-team or #database-team
- **Documentation:** [TENANT_METADATA_AND_TABLE_FIXES.md](./TENANT_METADATA_AND_TABLE_FIXES.md)
