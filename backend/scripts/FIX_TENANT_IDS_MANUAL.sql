-- ============================================================================
-- TENANT TABLE SCHEMA MIGRATION
-- ============================================================================
-- Purpose: Convert tenant.tenant_id from TEXT to UUID to match child tables
-- Strategy:
--   1. Rename tenant_id (text) -> tenant_id_text (preserve legacy data)
--   2. Create new tenant_id (uuid) column
--   3. Populate tenant_id (uuid) from id (uuid)
--   4. This matches how other tables have tenant_id as UUID
-- ============================================================================

BEGIN;

-- Step 1: Show current state
SELECT '=== BEFORE MIGRATION ===' AS status;
SELECT id, tenant_id, name, status FROM tenant ORDER BY created_at;

-- Step 2: Rename existing tenant_id (text) column to tenant_id_text
ALTER TABLE tenant RENAME COLUMN tenant_id TO tenant_id_text;

-- Step 3: Add new tenant_id column as UUID
ALTER TABLE tenant ADD COLUMN tenant_id uuid;

-- Step 4: Populate tenant_id (uuid) from id (uuid)
-- This ensures tenant_id matches the tenant's primary key
UPDATE tenant SET tenant_id = id;

-- Step 5: Make tenant_id NOT NULL
ALTER TABLE tenant ALTER COLUMN tenant_id SET NOT NULL;

-- Step 6: Add index on tenant_id for performance
CREATE INDEX IF NOT EXISTS idx_tenant_tenant_id ON tenant(tenant_id);

-- Step 7: Show updated schema
SELECT '=== AFTER MIGRATION ===' AS status;
SELECT 
    id,
    tenant_id,           -- NEW: uuid column
    tenant_id_text,      -- OLD: text column (preserved for reference)
    name,
    status 
FROM tenant 
ORDER BY created_at;

-- Step 8: Verification
SELECT '=== VERIFICATION: tenant_id should match id ===' AS status;
SELECT 
    id::text as id_uuid,
    tenant_id::text as tenant_id_uuid,
    tenant_id_text as tenant_id_legacy,
    CASE WHEN id = tenant_id THEN '✓ MATCH' ELSE '✗ MISMATCH' END as id_match,
    name
FROM tenant;

-- Step 9: Show column types
SELECT '=== COLUMN TYPES ===' AS status;
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'tenant'
  AND column_name IN ('id', 'tenant_id', 'tenant_id_text')
ORDER BY 
    CASE column_name 
        WHEN 'id' THEN 1
        WHEN 'tenant_id' THEN 2
        WHEN 'tenant_id_text' THEN 3
    END;

COMMIT;

-- Final summary
SELECT '=== MIGRATION COMPLETE ===' AS status;
SELECT 
    'tenant table now has tenant_id as UUID, matching child tables' as result;
