# Entity Lifecycle Management with ID Preservation

## Overview
This document explains how the CRM system handles entity lifecycle management with **ID preservation** to prevent double-counting and maintain data continuity.

## Core Principle: ID Preservation Through Lifecycle

When entities evolve through their lifecycle (e.g., Lead → Contact, BizDev Source → Account), they **preserve their ID**. This means:
- The original ID is reused in the new entity type
- No duplication occurs
- History is maintained through lifecycle status tracking
- Counting and reporting remain accurate

## Entity Lifecycle Flows

### 1. Lead → Contact Conversion

**Before Conversion:**
```
Lead Table:
- id: 4ec2bc47-a0a9-46ea-be80-6f3f801f1871
- first_name: John
- last_name: Doe
- email: john@example.com
- lifecycle_status: 'active'
```

**After Conversion:**
```
Lead Table:
- id: 4ec2bc47-a0a9-46ea-be80-6f3f801f1871
- lifecycle_status: 'converted_to_contact'
- metadata: {"converted_to_contact_id": "4ec2bc47..."}

Contact Table:
- id: 4ec2bc47-a0a9-46ea-be80-6f3f801f1871  ← SAME ID!
- first_name: John
- last_name: Doe  
- email: john@example.com
- lifecycle_status: 'converted_from_lead'
- converted_from_lead_id: 4ec2bc47-a0a9-46ea-be80-6f3f801f1871

Entity Lifecycle Log:
- source_entity_type: 'lead'
- source_entity_id: 4ec2bc47-a0a9-46ea-be80-6f3f801f1871
- target_entity_type: 'contact'
- target_entity_id: 4ec2bc47-a0a9-46ea-be80-6f3f801f1871  ← SAME ID!
- transformation_type: 'convert'
- source_data_snapshot: {full lead data}
```

**Key Points:**
- Lead still exists in database but marked as `lifecycle_status: 'converted_to_contact'`
- Contact uses the **exact same UUID** as the lead
- No double-counting: queries for "active leads" exclude converted ones
- Complete history preserved in `entity_lifecycle_log`

### 2. BizDev Source → Account Promotion

**Before Promotion:**
```
BizDev Sources Table:
- id: 789abc12-3456-7890-abcd-ef1234567890
- company_name: "Acme Corp"
- source_type: "partnership"
- lifecycle_status: 'active'
```

**After Promotion:**
```
BizDev Sources Table:
- id: 789abc12-3456-7890-abcd-ef1234567890
- lifecycle_status: 'promoted_to_account'
- metadata: {"promoted_to_account_id": "789abc12..."}

Accounts Table:
- id: 789abc12-3456-7890-abcd-ef1234567890  ← SAME ID!
- name: "Acme Corp"
- lifecycle_status: 'promoted_from_bizdev'
- promoted_from_bizdev_id: 789abc12-3456-7890-abcd-ef1234567890

Entity Lifecycle Log:
- source_entity_type: 'bizdev_source'
- source_entity_id: 789abc12-3456-7890-abcd-ef1234567890
- target_entity_type: 'account'
- target_entity_id: 789abc12-3456-7890-abcd-ef1234567890  ← SAME ID!
- transformation_type: 'promote'
```

**Key Points:**
- BizDev Source still exists but marked as `lifecycle_status: 'promoted_to_account'`
- Account uses the **exact same UUID** as the bizdev source
- All opportunities linked to the bizdev source automatically link to the account (same ID!)
- No double-counting in metrics

### 3. Account Relationships (Contacts Linked by account_id)

**Proper Relational Design:**
```
Accounts Table:
- id: 123e4567-e89b-12d3-a456-426614174000
- name: "Tech Solutions Inc"

Contacts Table:
- id: 456e7890-e89b-12d3-a456-426614174111
- first_name: "Alice"
- account_id: 123e4567-e89b-12d3-a456-426614174000  ← UUID FK
- 
- id: 789e0123-e89b-12d3-a456-426614174222
- first_name: "Bob"
- account_id: 123e4567-e89b-12d3-a456-426614174000  ← Same account!
```

**Key Points:**
- Contacts store `account_id` as UUID foreign key
- Account name is **displayed** in UI but **not stored** in contacts table
- Changing account name updates once, reflects everywhere
- Referential integrity enforced by database

## Database Schema Changes

### Migration 032: Foreign Key Normalization
Converts all `tenant_id` columns from TEXT to UUID foreign keys:

```sql
-- Before (incorrect)
CREATE TABLE leads (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,  -- String like 'labor-depot'
  ...
);

-- After (correct)
CREATE TABLE leads (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  ...
);
```

### Migration 033: Entity Lifecycle with ID Preservation
Adds lifecycle tracking and ID-preserving conversion functions:

```sql
-- Lifecycle status columns
ALTER TABLE leads ADD COLUMN lifecycle_status TEXT DEFAULT 'active';
ALTER TABLE contacts ADD COLUMN converted_from_lead_id UUID;

-- ID-preserving conversion function
CREATE FUNCTION convert_lead_to_contact(
  p_lead_id UUID,
  p_tenant_id UUID,
  p_account_id UUID DEFAULT NULL,
  p_performed_by TEXT DEFAULT NULL
) RETURNS UUID AS $$
  -- Creates contact with SAME ID as lead
  -- Marks lead as converted
  -- Logs transformation
$$;
```

## API Changes

### Lead Conversion Endpoint

**Old (creates duplicate):**
```javascript
POST /api/leads/:id/convert
{
  "tenant_id": "labor-depot",
  "create_opportunity": true
}

// Would create NEW UUID for contact (double-counting!)
```

**New (preserves ID):**
```javascript
POST /api/leads/:id/convert
{
  "tenant_id": "labor-depot",
  "account_id": "123e4567...",
  "create_opportunity": true,
  "performed_by": "user@example.com"
}

Response:
{
  "status": "success",
  "message": "Lead converted to contact (ID preserved)",
  "data": {
    "lead_id": "4ec2bc47-a0a9-46ea-be80-6f3f801f1871",
    "contact_id": "4ec2bc47-a0a9-46ea-be80-6f3f801f1871",  // SAME ID!
    "contact": {...},
    "opportunity": {...},
    "note": "Lead ID and Contact ID are identical - no duplication"
  }
}
```

### BizDev Promotion Endpoint

**Old (creates duplicate):**
```javascript
POST /api/bizdevsources/:id/promote
{
  "tenant_id": "labor-depot"
}

// Would create NEW UUID for account (double-counting!)
```

**New (preserves ID):**
```javascript
POST /api/bizdevsources/:id/promote
{
  "tenant_id": "labor-depot",
  "account_name": "Acme Corp",  // Optional override
  "performed_by": "user@example.com"
}

Response:
{
  "status": "success",
  "message": "BizDev source promoted to account (ID preserved)",
  "data": {
    "bizdev_source_id": "789abc12-3456-7890-abcd-ef1234567890",
    "account_id": "789abc12-3456-7890-abcd-ef1234567890",  // SAME ID!
    "account": {...},
    "contact": {...},
    "note": "BizDev ID and Account ID are identical - no duplication"
  }
}
```

## Querying Active Entities

### Use Views for Active Entities
Views automatically filter out converted/promoted entities:

```sql
-- Query active leads (excludes converted)
SELECT * FROM active_leads WHERE tenant_id = '...';

-- Query active bizdev sources (excludes promoted)
SELECT * FROM active_bizdev_sources WHERE tenant_id = '...';

-- Query all contacts (includes converted leads)
SELECT * FROM active_contacts WHERE tenant_id = '...';
```

### Manual Filtering
```sql
-- Get only unconverted leads
SELECT * FROM leads 
WHERE tenant_id = '...' 
AND lifecycle_status = 'active';

-- Get leads that were converted
SELECT * FROM leads 
WHERE tenant_id = '...' 
AND lifecycle_status = 'converted_to_contact';

-- Get contacts that came from leads
SELECT * FROM contacts 
WHERE tenant_id = '...' 
AND lifecycle_status = 'converted_from_lead';
```

## Reporting Without Double-Counting

### Total People Count (Correct)
```sql
-- Count unique people across leads and contacts
SELECT 
  (SELECT COUNT(*) FROM active_leads WHERE tenant_id = ?) +
  (SELECT COUNT(*) FROM contacts WHERE tenant_id = ?)
AS total_people;

-- This is correct because:
-- 1. active_leads excludes converted leads
-- 2. Converted leads exist as contacts with SAME ID
-- 3. No duplication occurs
```

### Revenue Attribution (Correct)
```sql
-- Bizdev sources promoted to accounts preserve metrics
SELECT 
  a.id,
  a.name,
  (a.metadata->>'leads_generated')::int as leads_generated,
  (a.metadata->>'revenue_generated')::numeric as revenue_generated
FROM accounts a
WHERE a.lifecycle_status = 'promoted_from_bizdev'
AND a.tenant_id = ?;

-- Metrics are preserved in account metadata from original bizdev source
-- No double-counting of revenue
```

## Backend Code Patterns

### Tenant UUID Resolution
```javascript
import { getTenantUuid } from './lib/tenantHelpers.js';

// Convert tenant name to UUID
const tenantUuid = await getTenantUuid('labor-depot');

// Use in queries
const result = await pgPool.query(
  'SELECT * FROM leads WHERE tenant_id = $1',
  [tenantUuid]  // UUID, not string
);
```

### ID-Preserving Conversion
```javascript
// Call database function
const result = await pgPool.query(
  'SELECT convert_lead_to_contact($1, $2, $3, $4) as contact_id',
  [leadId, tenantUuid, accountId, performedBy]
);

const contactId = result.rows[0].contact_id;
// contactId === leadId (same UUID!)
```

## Migration Checklist

- [ ] **Step 1:** Backup database
- [ ] **Step 2:** Apply `032_normalize_foreign_keys.sql` (tenant_id → UUID FK)
- [ ] **Step 3:** Apply `033_entity_lifecycle_with_id_preservation.sql` (lifecycle tracking)
- [ ] **Step 4:** Update backend routes to use `getTenantUuid()` helper
- [ ] **Step 5:** Test lead conversion with ID preservation
- [ ] **Step 6:** Test bizdev promotion with ID preservation
- [ ] **Step 7:** Verify no double-counting in reports
- [ ] **Step 8:** Update frontend to handle lifecycle status display

## Benefits

1. **No Double-Counting**: Same ID means same entity, no duplicates in metrics
2. **Data Continuity**: Complete history preserved through lifecycle log
3. **Referential Integrity**: Foreign keys prevent orphaned records
4. **Audit Trail**: Every transformation logged with timestamps and user
5. **Reversibility**: Can track back from contact to original lead
6. **Performance**: UUID foreign keys are faster than TEXT comparisons
7. **Standards Compliance**: Proper relational database design

## Questions?

- See `backend/FOREIGN_KEY_MIGRATION_GUIDE.md` for tenant UUID migration details
- See `backend/migrations/033_entity_lifecycle_with_id_preservation.sql` for SQL functions
- See `backend/lib/tenantHelpers.js` for UUID resolution utilities
