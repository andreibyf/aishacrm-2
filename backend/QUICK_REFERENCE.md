# Quick Reference: Database Normalization & Entity Lifecycle

## TL;DR
- **tenant_id** is now UUID (not TEXT string)
- **Lead → Contact** preserves the same ID (no duplication)
- **BizDev → Account** preserves the same ID (no duplication)
- **Use helper functions** to convert tenant names to UUIDs

## Common Tasks

### Converting Tenant Name to UUID
```javascript
import { getTenantUuid } from './lib/tenantHelpers.js';

// Old way (broken after migration 032)
const result = await pgPool.query(
  'SELECT * FROM leads WHERE tenant_id = $1',
  ['labor-depot']  // ❌ Wrong! tenant_id is now UUID
);

// New way (correct)
const tenantUuid = await getTenantUuid('labor-depot');
const result = await pgPool.query(
  'SELECT * FROM leads WHERE tenant_id = $1',
  [tenantUuid]  // ✅ Correct! Using UUID
);
```

### Converting Lead to Contact
```javascript
// Old way (creates duplicate with new ID)
const contactResult = await pgPool.query(
  `INSERT INTO contacts (...) VALUES (...) RETURNING *`
);
// ❌ Creates new UUID, causes double-counting

// New way (preserves ID)
const result = await pgPool.query(
  'SELECT convert_lead_to_contact($1, $2, $3, $4) as contact_id',
  [leadId, tenantUuid, accountId, performedBy]
);
// ✅ Contact gets same ID as lead
```

### Promoting BizDev to Account
```javascript
// Old way (creates duplicate with new ID)
const accountResult = await pgPool.query(
  `INSERT INTO accounts (...) VALUES (...) RETURNING *`
);
// ❌ Creates new UUID, causes double-counting

// New way (preserves ID)
const result = await pgPool.query(
  'SELECT promote_bizdev_to_account($1, $2, $3, $4) as account_id',
  [bizdevId, tenantUuid, accountName, performedBy]
);
// ✅ Account gets same ID as bizdev source
```

### Querying Active Entities
```sql
-- Wrong: Returns ALL leads including converted ones
SELECT COUNT(*) FROM leads WHERE tenant_id = ?;

-- Correct: Returns only active (unconverted) leads
SELECT COUNT(*) FROM leads 
WHERE tenant_id = ? AND lifecycle_status = 'active';

-- Better: Use view
SELECT COUNT(*) FROM active_leads WHERE tenant_id = ?;
```

### Linking Contacts to Accounts
```sql
-- Wrong: Storing account name in contacts
CREATE TABLE contacts (
  account_name TEXT  -- ❌ Don't do this!
);

-- Correct: Store account ID as foreign key
CREATE TABLE contacts (
  account_id UUID REFERENCES accounts(id)  -- ✅ Proper FK
);

-- Query to get account name:
SELECT 
  c.first_name,
  c.last_name,
  a.name as account_name
FROM contacts c
LEFT JOIN accounts a ON c.account_id = a.id;
```

## Migration Status

### ✅ Completed
- Migration 032: Foreign key normalization SQL
- Migration 033: Entity lifecycle SQL
- Helper module: `backend/lib/tenantHelpers.js`
- Updated: `backend/routes/leads.js` (conversion)
- Updated: `backend/routes/bizdevsources.js` (promotion)
- Documentation: 3 comprehensive guides

### ⚠️ TODO (High Priority)
- [ ] Apply migrations to database (via Supabase SQL Editor)
- [ ] Update `backend/routes/mcp.js` with tenant UUID resolution
- [ ] Update remaining 24 route files
- [ ] Test AI agent responses (should show correct counts)
- [ ] Rebuild backend container

### 📝 TODO (Medium Priority)
- [ ] Add lifecycle status badges to UI
- [ ] Create lifecycle tracking dashboard
- [ ] Add reversal functions (unconvert/demote)

## Files Created

```
backend/
├── migrations/
│   ├── 032_normalize_foreign_keys.sql (tenant_id → UUID)
│   └── 033_entity_lifecycle_with_id_preservation.sql (ID preservation)
├── lib/
│   └── tenantHelpers.js (tenant name ↔ UUID conversion)
├── routes/
│   ├── leads.js (updated with ID-preserving conversion)
│   └── bizdevsources.js (updated with ID-preserving promotion)
└── docs/
    ├── DATABASE_NORMALIZATION_SUMMARY.md (overview)
    ├── FOREIGN_KEY_MIGRATION_GUIDE.md (tenant UUID details)
    └── ENTITY_LIFECYCLE_GUIDE.md (lifecycle patterns)
```

## Quick Test Commands

### Test Tenant Resolution
```javascript
// In Node.js REPL or test script
import { getTenantUuid } from './backend/lib/tenantHelpers.js';
const uuid = await getTenantUuid('labor-depot');
console.log(uuid); // Should print UUID
```

### Test Lead Conversion
```bash
curl -X POST http://localhost:4001/api/leads/4ec2bc47.../convert \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "labor-depot",
    "account_id": null,
    "create_opportunity": false,
    "performed_by": "test@example.com"
  }'

# Check that contact_id === lead_id
```

### Test BizDev Promotion
```bash
curl -X POST http://localhost:4001/api/bizdevsources/789abc12.../promote \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "labor-depot",
    "performed_by": "test@example.com"
  }'

# Check that account_id === bizdev_id
```

## Common Errors & Solutions

### "invalid input syntax for type uuid"
**Cause:** Passing tenant name string where UUID expected  
**Fix:** Use `getTenantUuid()` to convert first

### "Tenant not found: labor-depot"
**Cause:** Tenant doesn't exist in tenant table  
**Fix:** Insert tenant record first:
```sql
INSERT INTO tenant (tenant_id, name) 
VALUES ('labor-depot', 'Labor Depot');
```

### "violates foreign key constraint"
**Cause:** Trying to insert with invalid tenant_id  
**Fix:** Ensure tenant exists and use correct UUID

### AI agent shows "0 leads" when leads exist
**Cause:** MCP routes not updated with tenant UUID resolution  
**Fix:** Update `backend/routes/mcp.js` to use `getTenantUuid()`

## Need Help?

1. **Read the guides:**
   - `DATABASE_NORMALIZATION_SUMMARY.md` - Start here
   - `FOREIGN_KEY_MIGRATION_GUIDE.md` - Tenant UUID details
   - `ENTITY_LIFECYCLE_GUIDE.md` - Lifecycle patterns

2. **Check example code:**
   - `backend/routes/leads.js` - Lead conversion example
   - `backend/routes/bizdevsources.js` - BizDev promotion example
   - `backend/lib/tenantHelpers.js` - Helper functions

3. **Review migrations:**
   - `032_normalize_foreign_keys.sql` - Schema changes
   - `033_entity_lifecycle_with_id_preservation.sql` - Functions & triggers

---

**Remember:** The goal is **no double-counting**. When an entity evolves (Lead→Contact, BizDev→Account), the ID is preserved. This ensures metrics are accurate and relationships are maintained.
