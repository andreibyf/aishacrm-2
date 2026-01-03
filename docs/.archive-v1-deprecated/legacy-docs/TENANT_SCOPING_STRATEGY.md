# Tenant Scoping Strategy

## Overview

All ID-based API endpoints (GET/PUT/DELETE by ID) in the Aisha CRM backend enforce strict tenant scoping to prevent cross-tenant data leakage. This document describes the strategy, implementation details, and testing requirements.

## Core Principles

1. **Tenant-First Filtering**: All queries filter by `tenant_id` BEFORE filtering by `id`
2. **Mandatory tenant_id**: ID-based operations require `tenant_id` as a query parameter (for GET/DELETE) or in request context (for PUT)
3. **UUID Validation**: All IDs must be valid UUIDv4 format; invalid formats return 400 immediately
4. **Safety Verification**: After database query, returned rows are verified to match the requested tenant_id
5. **LIMIT 1**: All GET-by-id queries use `LIMIT 1` to prevent accidental multi-row returns

## Implementation Pattern

### SQL Pattern
```sql
-- Correct: tenant-first with LIMIT 1
SELECT * FROM table_name 
WHERE tenant_id = $1 AND id = $2 
LIMIT 1

-- Incorrect: id-first (can leak across tenants)
SELECT * FROM table_name 
WHERE id = $1 AND tenant_id = $2
```

### Route Pattern
```javascript
import { validateTenantScopedId } from '../lib/validation.js';

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { tenant_id } = req.query;
  
  // Validates UUID format and tenant_id presence; returns 400 if invalid
  if (!validateTenantScopedId(id, tenant_id, res)) return;
  
  // Query with tenant-first WHERE clause and LIMIT 1
  const result = await pgPool.query(
    'SELECT * FROM table WHERE tenant_id = $1 AND id = $2 LIMIT 1',
    [tenant_id, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ status: 'error', message: 'Not found' });
  }
  
  // Safety check: verify returned row matches tenant
  if (result.rows[0].tenant_id !== tenant_id) {
    return res.status(404).json({ status: 'error', message: 'Not found' });
  }
  
  res.json({ status: 'success', data: result.rows[0] });
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { tenant_id } = req.query;
  const updates = req.body;
  
  if (!validateTenantScopedId(id, tenant_id, res)) return;
  
  // Build UPDATE with tenant-first WHERE
  const result = await pgPool.query(
    'UPDATE table SET field = $1 WHERE tenant_id = $2 AND id = $3 RETURNING *',
    [updates.field, tenant_id, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ status: 'error', message: 'Not found' });
  }
  
  res.json({ status: 'success', data: result.rows[0] });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { tenant_id } = req.query;
  
  if (!validateTenantScopedId(id, tenant_id, res)) return;
  
  const result = await pgPool.query(
    'DELETE FROM table WHERE tenant_id = $1 AND id = $2 RETURNING id',
    [tenant_id, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ status: 'error', message: 'Not found' });
  }
  
  res.json({ status: 'success', message: 'Deleted', data: { id: result.rows[0].id } });
});
```

## Validation Utilities

The `backend/lib/validation.js` module provides:

- **`isValidUUID(value)`**: Returns true if value is a valid UUIDv4
- **`validateUUIDParam(id, res)`**: Validates UUID and sends 400 if invalid; returns false if validation failed
- **`validateTenantId(tenant_id, res)`**: Validates tenant_id presence and sends 400 if missing; returns false if validation failed
- **`validateTenantScopedId(id, tenant_id, res)`**: Combines both validations; returns false if either failed

### UUID Format

The validation enforces strict UUIDv4 format:
- Version nibble must be 4 (character 14 must be 1-5)
- Variant bits must be 8-b (character 19 must be 8, 9, a, or b)
- Example valid UUIDv4: `a11dfb63-4b18-4eb8-872e-747af2e37c46`
- Example invalid (all zeros): `00000000-0000-0000-0000-000000000000` (version/variant bits incorrect)

## Routes Enforcing Tenant Scoping

### Fully Tenant-Scoped (GET/PUT/DELETE require tenant_id)
- `/api/apikeys/:id`
- `/api/webhooks/:id`
- `/api/tenantintegrations/:id`
- `/api/notes/:id`
- `/api/cashflow/:id`
- `/api/bizdevsources/:id`
- `/api/audit-logs/:id`
- `/api/contacts/:id` (via Supabase client)
- `/api/leads/:id` (via Supabase client)
- `/api/opportunities/:id` (via Supabase client)
- `/api/modulesettings/:id` (via Supabase client)
- `/api/employees/:id` (via Supabase client)
- `/api/activities/:id` (via custom pgPool adapter)

### Tenant-Aware (allows tenant_id OR NULL for system-wide records)
- `/api/announcements/:id` - Can be tenant-specific OR system-wide (tenant_id IS NULL)
  - SQL: `WHERE (tenant_id = $1 OR tenant_id IS NULL) AND id = $2`

### System-Level Only (no tenant scoping)
- `/api/systembrandings/:id` - Global branding configuration (no tenant_id column)

## Testing Requirements

### E2E Tests

When writing E2E tests for tenant-scoped endpoints:

1. **Environment Variable**: Set `E2E_TENANT_ID` in `.env` or test environment
   ```bash
   E2E_TENANT_ID=a11dfb63-4b18-4eb8-872e-747af2e37c46
   ```

2. **Test Fixture**: Inject tenant_id into test context
   ```javascript
   test.beforeEach(async ({ page }) => {
     const tenantId = process.env.E2E_TENANT_ID || 'default-tenant-id';
     await page.evaluate((tid) => {
       window.mockUser = { tenant_id: tid, email: 'test@example.com' };
     }, tenantId);
   });
   ```

3. **API Calls**: Include tenant_id in all GET/PUT/DELETE requests
   ```javascript
   // Polling for record
   const response = await fetch(
     `http://localhost:4001/api/activities/${activityId}?tenant_id=${tenantId}`
   );
   
   // Update
   const updateResponse = await fetch(
     `http://localhost:4001/api/activities/${activityId}?tenant_id=${tenantId}`,
     { method: 'PUT', body: JSON.stringify(updates) }
   );
   
   // Delete
   const deleteResponse = await fetch(
     `http://localhost:4001/api/activities/${activityId}?tenant_id=${tenantId}`,
     { method: 'DELETE' }
   );
   ```

### Unit/Integration Tests

1. **Missing tenant_id**: Should return 400 with "tenant_id is required"
2. **Invalid UUID**: Should return 400 with "Invalid UUID format"
3. **Valid UUID + tenant, nonexistent record**: Should return 404
4. **Cross-tenant attempt**: Should return 404 (not 403) to avoid information disclosure
5. **Valid request**: Should return 200/201 with correct data

### Manual Verification

```bash
# Test invalid UUID
curl -i "http://localhost:4001/api/apikeys/invalid-uuid?tenant_id=TENANT_ID"
# Expected: 400 "Invalid UUID format"

# Test missing tenant_id
curl -i "http://localhost:4001/api/apikeys/VALID_UUID_HERE"
# Expected: 400 "tenant_id is required"

# Test nonexistent record
curl -i "http://localhost:4001/api/apikeys/00000000-0000-4000-8000-000000000000?tenant_id=TENANT_ID"
# Expected: 404 "Not found"

# Test valid record
curl -i "http://localhost:4001/api/apikeys/EXISTING_ID?tenant_id=TENANT_ID"
# Expected: 200 with record data
```

## Migration Guide

When adding tenant scoping to an existing route:

1. **Import validation utility**:
   ```javascript
   import { validateTenantScopedId } from '../lib/validation.js';
   ```

2. **Update GET /:id**:
   - Add `const { tenant_id } = req.query;`
   - Replace manual validation with `if (!validateTenantScopedId(id, tenant_id, res)) return;`
   - Change WHERE clause to `tenant_id = $1 AND id = $2`
   - Add `LIMIT 1`
   - Add safety check after query

3. **Update PUT /:id**:
   - Add `const { tenant_id } = req.query;` (or extract from body if appropriate)
   - Add validation
   - Update WHERE clause to include tenant_id first
   - Adjust parameter indices accordingly

4. **Update DELETE /:id**:
   - Same as PUT

5. **Update tests**:
   - Add tenant_id to all test requests
   - Add test cases for missing tenant_id and invalid UUID

## Security Considerations

1. **Information Disclosure**: Always return 404 (not 403) for unauthorized access to avoid leaking record existence
2. **RLS Alignment**: Database RLS policies should align with application-level tenant scoping
3. **Audit Logging**: Consider logging tenant_id mismatches for security monitoring
4. **Rate Limiting**: Apply rate limiting per tenant_id to prevent abuse
5. **Index Performance**: Ensure composite indexes on `(tenant_id, id)` for query performance

## Performance Notes

- **Indexes**: All tenant-scoped tables should have a composite index: `CREATE INDEX idx_table_tenant_id ON table(tenant_id, id);`
- **Query Planning**: Postgres will use the tenant_id filter first if properly indexed, making tenant-first WHERE clauses efficient
- **LIMIT 1**: Prevents unnecessary scanning after first match is found

## Related Documentation

- [DATABASE_UUID_vs_TENANT_ID.md](./DATABASE_UUID_vs_TENANT_ID.md) - Critical distinction between UUID primary keys and tenant_id foreign keys
- [PERMISSION_SIMPLIFICATION_COMPLETE.md](./PERMISSION_SIMPLIFICATION_COMPLETE.md) - Permission system overview
- [API_HEALTH_MONITORING.md](./API_HEALTH_MONITORING.md) - Monitoring and observability
