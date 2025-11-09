# Database Column Naming Standards & Migration Plan

## Current State: Inconsistent Naming Conventions

### Problems Identified

1. **Timestamp Ambiguity**: 
   - `created_at` vs `created_date` vs `created_on` - inconsistent across tables
   - Should be: `created_on` (date/time of creation) and `created_by` (user who created)

2. **Generic Column Names**:
   - `name` used across multiple entity types without context
   - Should be: `account_name`, `contact_name`, `opportunity_name`, etc.

3. **Inconsistent Conventions**:
   - Some tables use `type`, others use `[entity]_type`
   - Some use `date` suffix, others use `on` or `at`

## Proposed Naming Standards

### 1. Timestamp Columns

**Standard Format:**
- `created_on` - TIMESTAMPTZ - When record was created
- `created_by` - TEXT/UUID - Who created the record (email or user_id)
- `updated_on` - TIMESTAMPTZ - When record was last updated
- `updated_by` - TEXT/UUID - Who last updated the record
- `deleted_on` - TIMESTAMPTZ - When record was soft-deleted (if using soft deletes)
- `deleted_by` - TEXT/UUID - Who deleted the record

**Current Issues:**
```sql
-- INCONSISTENT ❌
created_at      -- Some tables
created_date    -- Other tables
updated_at      -- Some tables
last_modified   -- Other tables

-- SHOULD BE ✅
created_on
created_by
updated_on
updated_by
```

### 2. Entity-Specific Name Columns

**Standard Format:** `[entity]_name`

| Table | Current | Should Be |
|-------|---------|-----------|
| accounts | `name` | `account_name` |
| contacts | `first_name`, `last_name` | Keep (but add `contact_name` computed?) |
| leads | `first_name`, `last_name` | Keep (but add `lead_name` computed?) |
| opportunities | `name` | `opportunity_name` |
| activities | `subject` | `activity_name` OR keep `subject` |
| bizdev_sources | `name` | `source_name` |
| employees | `first_name`, `last_name` | Keep (but add `employee_name` computed?) |
| cash_flow | N/A | N/A (uses `description`) |

### 3. Type Columns

**Standard Format:** `[entity]_type`

| Table | Current | Should Be |
|-------|---------|-----------|
| accounts | `type` | `account_type` |
| opportunities | `type` | `opportunity_type` |
| activities | `activity_type` | ✅ Already correct |
| cash_flow | `type` → `transaction_type` | ✅ Just fixed |
| contacts | N/A | N/A |
| leads | N/A | N/A |

### 4. Date Columns (Not Timestamps)

**Standard Format:** `[description]_date`

Examples:
- `birth_date` (not `birthdate`)
- `hire_date` ✅ Already good
- `close_date` ✅ Already good
- `due_date` ✅ Already good
- `start_date` ✅ Already good
- `end_date` ✅ Already good
- `transaction_date` ✅ Already good

### 5. Boolean Columns

**Standard Format:** `is_[state]` or `has_[feature]`

Examples:
- `is_active` ✅ Already good
- `is_published` ✅ Already good
- `is_closed` ✅ Already good
- `is_won` ✅ Already good
- `is_test_data` ✅ Already good
- `has_crm_access` ✅ Already good

### 6. Foreign Key Columns

**Standard Format:** `[referenced_entity]_id`

Examples:
- `account_id` ✅ Already good
- `contact_id` ✅ Already good
- `opportunity_id` ✅ Already good
- `user_id` ✅ Already good
- `tenant_id` ✅ Already good

### 7. Metadata/JSONB Columns

**Standard Format:** Singular `metadata`

- `metadata` ✅ Already good (consistent across tables)
- `custom_fields` ✅ Good alternative for user-customizable fields

## Migration Priority

### Phase 1: Critical Timestamp Standardization (HIGH PRIORITY)

**Affected Tables:** ALL tables

**Changes:**
```sql
-- Standard pattern for all tables
ALTER TABLE [table_name] RENAME COLUMN created_at TO created_on;
ALTER TABLE [table_name] RENAME COLUMN updated_at TO updated_on;

-- Add created_by and updated_by if missing
ALTER TABLE [table_name] ADD COLUMN created_by TEXT;
ALTER TABLE [table_name] ADD COLUMN updated_by TEXT;

-- Add comments
COMMENT ON COLUMN [table_name].created_on IS 'Timestamp when record was created';
COMMENT ON COLUMN [table_name].created_by IS 'Email or user_id of creator';
COMMENT ON COLUMN [table_name].updated_on IS 'Timestamp when record was last updated';
COMMENT ON COLUMN [table_name].updated_by IS 'Email or user_id of last updater';
```

**Tables to Update:**
1. accounts - `created_at` → `created_on`, `updated_at` → `updated_on`
2. contacts - `created_at` → `created_on`, add `created_by`, `updated_by`
3. leads - `created_at` → `created_on`, `created_date` cleanup
4. opportunities - `created_at` → `created_on`, `updated_at` → `updated_on`
5. activities - `created_at` → `created_on`, add `created_by`, `updated_by`
6. cash_flow - `created_at` → `created_on`, add `created_by`, `updated_by`
7. employees - `created_at` → `created_on`, `updated_at` → `updated_on`
8. bizdev_sources - `created_at` → `created_on`, add `created_by`, `updated_by`
9. file - `created_at` → `created_on`, `uploaded_by` → `created_by` (or keep both)
10. users - `created_at` → `created_on`, add `updated_on`
11. tenant - `created_at` → `created_on`, `updated_at` → `updated_on`
12. [All other tables...]

### Phase 2: Entity Name Columns (MEDIUM PRIORITY)

**Changes:**
```sql
-- Accounts
ALTER TABLE accounts RENAME COLUMN name TO account_name;

-- Opportunities
ALTER TABLE opportunities RENAME COLUMN name TO opportunity_name;

-- BizDev Sources
ALTER TABLE bizdev_sources RENAME COLUMN name TO source_name;
```

**Note:** For contacts, leads, and employees, keep `first_name` and `last_name` but consider adding computed full name columns or views.

### Phase 3: Type Columns (MEDIUM PRIORITY)

**Changes:**
```sql
-- Accounts
ALTER TABLE accounts RENAME COLUMN type TO account_type;

-- Opportunities
ALTER TABLE opportunities RENAME COLUMN type TO opportunity_type;
```

### Phase 4: Backend & Frontend Code Updates (REQUIRED AFTER MIGRATIONS)

For each renamed column, update:

1. **Backend Routes:**
   - SQL queries in `backend/routes/*.js`
   - Field names in INSERT, UPDATE, SELECT statements
   - Field names in WHERE clauses and ORDER BY

2. **Frontend Components:**
   - API entity mapping in `src/api/entities.js`
   - Form components using old field names
   - Display components rendering old field names
   - Filter/sort logic using old field names

3. **Database Migrations:**
   - Create new migration files (032, 033, etc.)
   - Include both column renames and comments
   - Test on dev/QA before production

## Implementation Strategy

### Recommended Approach: Gradual Migration

**Step 1: Add New Columns (No Breaking Changes)**
```sql
-- Add new columns alongside old ones
ALTER TABLE accounts ADD COLUMN account_name TEXT;
ALTER TABLE accounts ADD COLUMN created_on TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN created_by TEXT;

-- Copy data from old to new
UPDATE accounts SET account_name = name;
UPDATE accounts SET created_on = created_at;

-- Update triggers to populate both columns
```

**Step 2: Update Backend to Use New Columns**
- Modify routes to read/write both old and new columns
- Update all queries to prefer new columns but fall back to old

**Step 3: Update Frontend to Use New Columns**
- Modify forms and displays to use new field names
- Update API entity mappings

**Step 4: Verify All Code Uses New Columns**
- Test all CRUD operations
- Check all reports and exports

**Step 5: Drop Old Columns**
```sql
-- Only after verification
ALTER TABLE accounts DROP COLUMN name;
ALTER TABLE accounts DROP COLUMN created_at;
```

## Benefits of Standardization

1. **Self-Documenting Schema**: Field names clearly indicate what they contain
2. **Reduced Ambiguity**: No confusion about `name` in different contexts
3. **Better Queries**: Easy to understand JOIN conditions and WHERE clauses
4. **Audit Trail**: `created_by` and `updated_by` provide accountability
5. **Consistency**: Developers can predict field names across tables
6. **Maintenance**: Easier to write and maintain queries
7. **Onboarding**: New developers understand schema faster

## Example: Before vs After

### Before (Current) ❌
```sql
-- Ambiguous and inconsistent
SELECT name, type, created_at 
FROM accounts 
WHERE created_at > '2025-01-01';

SELECT name, type, created_at
FROM opportunities
WHERE created_at > '2025-01-01';
```

### After (Standardized) ✅
```sql
-- Clear and consistent
SELECT account_name, account_type, created_on, created_by
FROM accounts 
WHERE created_on > '2025-01-01';

SELECT opportunity_name, opportunity_type, created_on, created_by
FROM opportunities
WHERE created_on > '2025-01-01';
```

## Migration Checklist

- [ ] Phase 1: Create migration scripts for timestamp standardization
- [ ] Phase 1: Test migrations on local dev database
- [ ] Phase 1: Update backend routes for timestamp fields
- [ ] Phase 1: Update frontend components for timestamp fields
- [ ] Phase 1: Apply to dev/QA environment
- [ ] Phase 1: Verify all functionality works
- [ ] Phase 2: Create migration scripts for name columns
- [ ] Phase 2: Update backend routes for name fields
- [ ] Phase 2: Update frontend components for name fields
- [ ] Phase 2: Apply to dev/QA environment
- [ ] Phase 3: Create migration scripts for type columns
- [ ] Phase 3: Update backend routes for type fields
- [ ] Phase 3: Update frontend components for type fields
- [ ] Phase 4: Full regression testing
- [ ] Phase 5: Production deployment plan
- [ ] Phase 6: Rollback plan documentation

## Risk Mitigation

1. **Gradual Rollout**: One phase at a time
2. **Dual Columns**: Keep old columns during transition
3. **Comprehensive Testing**: Test all CRUD operations
4. **Rollback Plan**: Document how to revert each phase
5. **Stakeholder Communication**: Notify team of changes
6. **Documentation**: Update all API docs and schema docs

## Notes

- This is a significant refactoring effort
- Requires coordination between database, backend, and frontend changes
- Should be done during low-traffic periods
- Consider feature flags to toggle between old/new field names
- Automated tests will help ensure nothing breaks
