-- Fix tenant table to use only UUID-format tenant_id values
-- This script migrates legacy text tenant IDs to the standard UUID

BEGIN;

-- Step 1: Show current tenant table
SELECT 'Current tenant records:' AS step;
SELECT id, tenant_id, name, status FROM tenant ORDER BY created_at;

-- Step 2: Update legacy tenant IDs to use standard UUID
-- Map: test-tenant-dec9 -> 6cb4c008-4847-426a-9a2e-918ad70e7b69
SELECT 'Updating legacy tenant IDs...' AS step;

-- First, update all child records that reference the old tenant_id
-- This assumes foreign keys use tenant_id (text) not id (uuid)

DO $$
DECLARE
    legacy_tenant_id TEXT := 'test-tenant-dec9';
    standard_uuid TEXT := '6cb4c008-4847-426a-9a2e-918ad70e7b69';
    update_count INTEGER;
BEGIN
    -- Update contacts
    UPDATE contacts SET tenant_id = standard_uuid WHERE tenant_id = legacy_tenant_id;
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Updated % contacts', update_count;
    
    -- Update leads
    UPDATE leads SET tenant_id = standard_uuid WHERE tenant_id = legacy_tenant_id;
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Updated % leads', update_count;
    
    -- Update accounts
    UPDATE accounts SET tenant_id = standard_uuid WHERE tenant_id = legacy_tenant_id;
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Updated % accounts', update_count;
    
    -- Update opportunities
    UPDATE opportunities SET tenant_id = standard_uuid WHERE tenant_id = legacy_tenant_id;
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Updated % opportunities', update_count;
    
    -- Update activities
    UPDATE activities SET tenant_id = standard_uuid WHERE tenant_id = legacy_tenant_id;
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Updated % activities', update_count;
    
    -- Update employees
    UPDATE employees SET tenant_id = standard_uuid WHERE tenant_id = legacy_tenant_id;
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Updated % employees', update_count;
    
    -- Update bizdev_sources
    UPDATE bizdev_sources SET tenant_id = standard_uuid WHERE tenant_id = legacy_tenant_id;
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Updated % bizdev_sources', update_count;
    
    -- Update workflows
    UPDATE workflows SET tenant_id = standard_uuid WHERE tenant_id = legacy_tenant_id;
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Updated % workflows', update_count;
    
    -- Update system_logs
    UPDATE system_logs SET tenant_id = standard_uuid WHERE tenant_id = legacy_tenant_id;
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Updated % system_logs', update_count;
    
    -- Update audit_logs (if exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        UPDATE audit_logs SET tenant_id = standard_uuid WHERE tenant_id = legacy_tenant_id;
        GET DIAGNOSTICS update_count = ROW_COUNT;
        RAISE NOTICE 'Updated % audit_logs', update_count;
    END IF;
    
    -- Now delete or merge the legacy tenant record
    DELETE FROM tenant WHERE tenant_id = legacy_tenant_id;
    RAISE NOTICE 'Deleted legacy tenant record: %', legacy_tenant_id;
    
END $$;

-- Step 3: Ensure the standard UUID tenant exists
INSERT INTO tenant (id, tenant_id, name, status, subscription_tier, branding_settings, metadata)
VALUES (
    '6cb4c008-4847-426a-9a2e-918ad70e7b69'::uuid,
    '6cb4c008-4847-426a-9a2e-918ad70e7b69',
    'Test Tenant',
    'active',
    'tier4',
    '{}'::jsonb,
    '{"purpose": "e2e-testing", "migrated": true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    updated_at = NOW();

-- Step 4: Show final tenant table
SELECT 'Final tenant records:' AS step;
SELECT id, tenant_id, name, status FROM tenant ORDER BY created_at;

COMMIT;

-- Verification
SELECT 'Verification - Tenants with non-UUID tenant_id:' AS step;
SELECT id, tenant_id, name 
FROM tenant 
WHERE tenant_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
