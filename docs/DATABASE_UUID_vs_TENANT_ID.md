# Database Schema: UUID vs tenant_id

## Critical Distinction

Supabase has enforced RLS (Row Level Security) by adding UUID primary keys to all tables. This creates **two different identifier columns**:

### 1. `id` Column (UUID)
- **Type:** `uuid`
- **Purpose:** Database primary key for RLS and referential integrity
- **Auto-generated:** `DEFAULT gen_random_uuid()`
- **Example:** `550e8400-e29b-41d4-a916-446655440000`
- **Used for:** Internal database relationships, RLS policies

### 2. `tenant_id` Column (TEXT)
- **Type:** `text`
- **Purpose:** Business identifier for multi-tenancy
- **User-defined:** Set by application (e.g., `"local-tenant-001"`)
- **Example:** `local-tenant-001`, `prod-tenant-abc123`
- **Used for:** Application-level tenant isolation, API queries

## Impact on API Routes

### ❌ WRONG: Query by UUID when expecting tenant_id
```javascript
// This fails when frontend sends "local-tenant-001"
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const query = 'SELECT * FROM tenant WHERE id = $1'; // Expects UUID!
  const result = await pool.query(query, [id]); // ERROR: invalid UUID
});
```

### ✅ CORRECT: Detect format and query appropriately
```javascript
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  // Check if id is UUID format or tenant_id string
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const query = isUUID 
    ? 'SELECT * FROM tenant WHERE id = $1'
    : 'SELECT * FROM tenant WHERE tenant_id = $1';
  
  const result = await pool.query(query, [id]);
});
```

## Affected Tables

All CRM tables follow this pattern:

| Table | UUID Column (`id`) | Business ID Column (`tenant_id`) |
|-------|-------------------|----------------------------------|
| `tenant` | ✅ uuid | ✅ text (unique business identifier) |
| `accounts` | ✅ uuid | ✅ text (tenant reference) |
| `contacts` | ✅ uuid | ✅ text (tenant reference) |
| `leads` | ✅ uuid | ✅ text (tenant reference) |
| `opportunities` | ✅ uuid | ✅ text (tenant reference) |
| `employees` | ✅ uuid | ✅ text (tenant reference) |
| `users` | ✅ uuid | ✅ text (tenant reference via tenant_id slug) + tenant_uuid (FK) |
| `activities` | ✅ uuid | ✅ text (tenant reference) |
| `notes` | ✅ uuid | ✅ text (tenant reference) |

## Foreign Key References

Foreign keys use **UUIDs**, not tenant_id:

```sql
-- contacts.account_id references accounts.id (UUID)
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  account_id uuid,  -- References accounts.id, not accounts.tenant_id
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

## API Query Patterns

### Pattern 1: List by tenant_id (most common)
```javascript
// GET /api/contacts?tenant_id=local-tenant-001
router.get('/', async (req, res) => {
  const { tenant_id } = req.query;
  const result = await pool.query(
    'SELECT * FROM contacts WHERE tenant_id = $1',
    [tenant_id]
  );
});
```

### Pattern 2: Get single record by UUID
```javascript
// GET /api/contacts/550e8400-e29b-41d4-a916-446655440000
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    'SELECT * FROM contacts WHERE id = $1',
    [id] // UUID
  );
});
```

### Pattern 3: Get by tenant-specific identifier (flexible)
```javascript
// GET /api/tenants/local-tenant-001 (tenant_id)
// OR /api/tenants/550e8400-... (UUID)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  
  const query = isUUID 
    ? 'SELECT * FROM tenant WHERE id = $1'
    : 'SELECT * FROM tenant WHERE tenant_id = $1';
  
  const result = await pool.query(query, [id]);
});
```

## Common Errors

### Error 1: Invalid UUID Syntax
```
ERROR: invalid input syntax for type uuid: "local-tenant-001"
```
**Cause:** Trying to compare TEXT tenant_id with UUID column
**Fix:** Use correct column in WHERE clause

### Error 2: tenant_id Required
```
{"status":"error","message":"tenant_id is required"}
```
**Cause:** Backend expects `tenant_id` in query params but frontend didn't send it
**Fix:** Ensure all list queries include `?tenant_id=...`

### Error 3: Foreign Key Mismatch
```
ERROR: insert or update on table "contacts" violates foreign key constraint
```
**Cause:** Trying to use tenant_id string as account_id (which expects UUID)
**Fix:** Use the UUID from accounts.id, not accounts.tenant_id

## Frontend Considerations

### Entity.js API Calls

When calling the backend, ensure proper parameters:

```javascript
// ✅ CORRECT: Pass tenant_id for filtering
const contacts = await Contact.list({ tenant_id: 'local-tenant-001' });

// ✅ CORRECT: Get by UUID
const contact = await Contact.get('550e8400-e29b-41d4-a916-446655440000', { 
  tenant_id: 'local-tenant-001' 
});

// ❌ WRONG: Missing tenant_id for list query
const employees = await Employee.list({}); // Backend returns 400: tenant_id required
```

### Creating Records with Relationships

```javascript
// When creating a contact linked to an account:
const newContact = await Contact.create({
  tenant_id: 'local-tenant-001',
  first_name: 'John',
  last_name: 'Doe',
  account_id: accountRecord.id,  // ✅ Use UUID from account.id
  // NOT account.tenant_id!
});
```

### Creating Users with Tenant Linkage

When creating admin or tenant-scoped users, populate BOTH the human-readable slug and the canonical UUID:

```sql
-- Ensure both columns are set atomically from the tenant slug
INSERT INTO users (email, first_name, last_name, role, tenant_id, tenant_uuid, metadata, created_at, updated_at)
VALUES (
  $1, $2, $3, 'admin', $4,
  (SELECT id FROM tenant WHERE tenant_id = $4 LIMIT 1),
  $5, NOW(), NOW()
);
```

Notes:
- Superadmins remain global and should have both `tenant_id` and `tenant_uuid` as NULL.
- A backfill migration exists to populate `users.tenant_uuid` from `users.tenant_id` (see migration 038).

## Migration Strategy

If you have existing data with string IDs in foreign keys, you need to:

1. **Audit data** - Check for TEXT values in UUID columns
2. **Fix foreign keys** - Update to reference proper UUIDs
3. **Update queries** - Distinguish between id (UUID) and tenant_id (TEXT)
4. **Test thoroughly** - Verify all CRUD operations work

## Testing Checklist

- [ ] List queries include `tenant_id` parameter
- [ ] GET by ID works with UUID format
- [ ] GET by tenant_id works with string format (where applicable)
- [ ] Creating records with foreign keys uses UUID values
- [ ] Updating records preserves UUID relationships
- [ ] RLS policies allow service role access
- [ ] Frontend passes correct parameter types

## Verification Query

Run this to check your data integrity:

```sql
-- Check if any foreign keys have null values (should reference valid UUIDs)
SELECT 'contacts' as table_name, COUNT(*) as null_account_ids
FROM contacts WHERE account_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.id = contacts.account_id)
UNION ALL
SELECT 'opportunities', COUNT(*)
FROM opportunities WHERE account_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.id = opportunities.account_id);
```

## Summary

- **Always query LIST endpoints with `tenant_id` (TEXT)**: `?tenant_id=local-tenant-001`
- **Always query GET-by-ID endpoints with `id` (UUID)**: `/api/contacts/{uuid}`
- **Foreign keys ALWAYS use UUIDs**, never tenant_id strings
- **Routes should detect UUID vs tenant_id format** for flexibility
- **Backend validation should require tenant_id** for multi-tenant isolation
