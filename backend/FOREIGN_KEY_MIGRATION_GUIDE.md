# Foreign Key Normalization Migration Guide

## Overview
This guide documents the migration from TEXT-based tenant_id columns to proper UUID foreign keys, aligning with relational database best practices.

## What Changed

### Before (Incorrect)
```sql
-- tenant_id stored as TEXT string
CREATE TABLE leads (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,  -- Stored 'labor-depot'
  first_name TEXT,
  ...
);
```

### After (Correct)
```sql
-- tenant_id is now UUID foreign key
CREATE TABLE leads (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  first_name TEXT,
  ...
);
```

## Impact on Backend Code

### 1. MCP Routes (`backend/routes/mcp.js`)
**CRITICAL CHANGE NEEDED:**

```javascript
// OLD CODE - Used tenant_id string directly
case 'crm.get_tenant_stats':
  const { tenant_id } = parameters;
  const stats = await Promise.all([
    pgPool.query('SELECT COUNT(*)::int AS c FROM leads WHERE tenant_id = $1', [tenant_id]),
    // ...
  ]);

// NEW CODE - Must convert tenant name to UUID first
case 'crm.get_tenant_stats':
  const { tenant_id } = parameters; // Still receives 'labor-depot' as string
  
  // Look up the tenant UUID from the tenant name
  const tenantResult = await pgPool.query(
    'SELECT id FROM tenant WHERE tenant_id = $1', 
    [tenant_id]
  );
  
  if (!tenantResult.rows[0]) {
    throw new Error(`Tenant not found: ${tenant_id}`);
  }
  
  const tenantUuid = tenantResult.rows[0].id;
  
  // Now use the UUID in queries
  const stats = await Promise.all([
    pgPool.query('SELECT COUNT(*)::int AS c FROM leads WHERE tenant_id = $1', [tenantUuid]),
    // ...
  ]);
```

### 2. All Route Files
Every route file that uses `tenant_id` needs updating:
- `backend/routes/accounts.js`
- `backend/routes/leads.js`
- `backend/routes/contacts.js`
- `backend/routes/opportunities.js`
- `backend/routes/activities.js`
- And all other 26 route files...

### 3. Standard Pattern for All Routes

```javascript
// Add this helper function to backend/lib/tenantHelpers.js
async function getTenantUuid(tenantIdString) {
  const result = await pgPool.query(
    'SELECT id FROM tenant WHERE tenant_id = $1',
    [tenantIdString]
  );
  
  if (!result.rows[0]) {
    throw new Error(`Tenant not found: ${tenantIdString}`);
  }
  
  return result.rows[0].id;
}

// Use in routes like this:
router.get('/api/leads', async (req, res) => {
  const { tenant_id } = req.query;
  
  // Convert tenant name string to UUID
  const tenantUuid = await getTenantUuid(tenant_id);
  
  // Use UUID in query
  const result = await pgPool.query(
    'SELECT * FROM leads WHERE tenant_id = $1',
    [tenantUuid]
  );
  
  res.json(result.rows);
});
```

### 4. Supabase Client Queries
If using Supabase client directly, you also need to convert:

```javascript
// OLD
const { data, error } = await supabase
  .from('leads')
  .select('*')
  .eq('tenant_id', 'labor-depot');

// NEW
const tenantUuid = await getTenantUuid('labor-depot');
const { data, error } = await supabase
  .from('leads')
  .select('*')
  .eq('tenant_id', tenantUuid);
```

### 5. Frontend Context
The frontend context in `src/pages/Layout.jsx` provides tenant names as strings. This is correct - the conversion happens in the backend.

```javascript
// Frontend still uses tenant names (strings)
const [selectedTenantId, setSelectedTenantId] = useState('labor-depot');

// Backend receives string and converts to UUID
```

## Migration Steps

### 1. Backup Database
```bash
# Backup before running migration
pg_dump your_database > backup_before_fk_migration.sql
```

### 2. Apply Migration
```bash
# Run migration via Supabase Dashboard SQL Editor
# Or using psql:
psql -U postgres -d your_database -f backend/migrations/032_normalize_foreign_keys.sql
```

### 3. Update Backend Code

#### Option A: Minimal Changes (Quick Fix)
Add tenant name → UUID resolution to existing routes:

```bash
# Create helper module
node backend/add-tenant-uuid-resolver.js
```

#### Option B: Comprehensive Refactor (Recommended)
- Create `backend/lib/tenantHelpers.js` with conversion utilities
- Update all 26 route files to use UUID lookups
- Add caching for tenant UUID lookups to avoid repeated queries
- Update error handling for missing tenants

### 4. Test Critical Endpoints

```bash
# Test MCP tools
curl http://localhost:4001/api/mcp/execute-tool \
  -H "Content-Type: application/json" \
  -d '{
    "server_id": "crm",
    "tool_name": "crm.get_tenant_stats",
    "parameters": {"tenant_id": "labor-depot"}
  }'

# Test leads endpoint
curl http://localhost:4001/api/leads?tenant_id=labor-depot

# Test accounts endpoint
curl http://localhost:4001/api/accounts?tenant_id=labor-depot
```

### 5. Verify Data Integrity

```sql
-- Check that all tenant_id foreign keys are valid
SELECT 
  'leads' as table_name,
  COUNT(*) as orphaned_records
FROM leads l
LEFT JOIN tenant t ON l.tenant_id = t.id
WHERE t.id IS NULL

UNION ALL

SELECT 
  'accounts',
  COUNT(*)
FROM accounts a
LEFT JOIN tenant t ON a.tenant_id = t.id
WHERE t.id IS NULL;

-- Should return 0 orphaned records
```

## Benefits of This Migration

1. **Referential Integrity**: Database enforces valid tenant references
2. **Cascading Deletes**: Deleting a tenant automatically removes all related data
3. **Performance**: UUID indexes are faster than TEXT indexes
4. **Standards Compliance**: Proper relational database design
5. **Data Consistency**: Impossible to have invalid tenant references
6. **Query Optimization**: Foreign keys enable better query planning

## Rollback Plan

If you need to rollback:

```sql
-- This is destructive - use backup to restore
DROP DATABASE your_database;
CREATE DATABASE your_database;
psql -U postgres -d your_database < backup_before_fk_migration.sql
```

## Performance Considerations

### UUID Lookup Caching
Add caching to avoid repeated tenant UUID lookups:

```javascript
// In-memory cache with TTL
const tenantUuidCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTenantUuidCached(tenantIdString) {
  const cached = tenantUuidCache.get(tenantIdString);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.uuid;
  }
  
  const uuid = await getTenantUuid(tenantIdString);
  tenantUuidCache.set(tenantIdString, { uuid, timestamp: Date.now() });
  
  return uuid;
}
```

### Query Optimization
The foreign key constraints enable PostgreSQL to optimize joins:

```sql
-- This query is now optimized by the database
SELECT 
  t.name as tenant_name,
  COUNT(l.id) as lead_count
FROM tenant t
LEFT JOIN leads l ON l.tenant_id = t.id
GROUP BY t.id, t.name;
```

## Common Errors After Migration

### 1. "invalid input syntax for type uuid"
**Cause**: Passing string tenant name where UUID expected  
**Fix**: Add tenant name → UUID conversion

### 2. "insert or update on table violates foreign key constraint"
**Cause**: Trying to insert with non-existent tenant_id  
**Fix**: Ensure tenant exists in tenant table first

### 3. "null value in column tenant_id violates not-null constraint"
**Cause**: Missing tenant_id in INSERT/UPDATE  
**Fix**: Always provide valid tenant_id UUID

## Questions?

See `backend/DATABASE_UUID_vs_TENANT_ID.md` for related documentation about the tenant table structure.
