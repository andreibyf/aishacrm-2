-- =============================================================
-- Migration 034: Consolidate tenant integration tables
-- Option A selected: Preserve last_sync as a dedicated column
--
-- Goals:
--   1. Add last_sync column to tenant_integrations (plural table)
--   2. Ensure UNIQUE(tenant_id, integration_type) constraint for upserts
--   3. Merge data from legacy tenant_integration (singular) into tenant_integrations
--   4. Preserve existing rows; merge config + metadata; keep activity flags
--   5. Drop legacy tenant_integration table and its index
--
-- Safety Notes:
--   • Run during a maintenance window (writes + structure changes)
--   • Backup recommended: pg_dump before execution
--   • Idempotent guards included (IF EXISTS / IF NOT EXISTS)
-- =============================================================

-- 1. Add last_sync column if missing (NO TRANSACTION for ALTER)
ALTER TABLE tenant_integrations
  ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ;

-- Now start transaction for data operations
BEGIN;

-- 2. Remove potential duplicates in tenant_integrations before adding UNIQUE constraint
--    Strategy: Keep the most recently updated row per (tenant_id, integration_type)
WITH ranked AS (
  SELECT id,
         tenant_id,
         integration_type,
         updated_at,
         ROW_NUMBER() OVER (PARTITION BY tenant_id, integration_type ORDER BY updated_at DESC NULLS LAST, created_at DESC) AS rn
  FROM tenant_integrations
)
DELETE FROM tenant_integrations ti
USING ranked r
WHERE ti.id = r.id AND r.rn > 1;

-- 3. Add UNIQUE constraint (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_integrations_tenant_type_key'
  ) THEN
    ALTER TABLE tenant_integrations
      ADD CONSTRAINT tenant_integrations_tenant_type_key
      UNIQUE (tenant_id, integration_type);
  END IF;
END$$;

-- 4. Merge data from legacy tenant_integration (singular) table, if it exists
DO $$
DECLARE
  _exists BOOLEAN;
  _rec RECORD;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'tenant_integration'
  ) INTO _exists;
  
  IF _exists THEN
    -- Simple row-by-row upsert to avoid complex subqueries
    FOR _rec IN SELECT * FROM tenant_integration LOOP
      INSERT INTO tenant_integrations (
        tenant_id, 
        integration_type, 
        integration_name, 
        is_active, 
        api_credentials, 
        config, 
        metadata, 
        last_sync, 
        created_at, 
        updated_at
      )
      VALUES (
        _rec.tenant_id,
        _rec.integration_type,
        NULL, -- legacy table has no integration_name field
        COALESCE(_rec.is_active, true),
        '{}'::jsonb, -- legacy table does not store separate api_credentials
        _rec.config,
        _rec.metadata,
        _rec.last_sync,
        COALESCE(_rec.created_at, NOW()),
        NOW()
      )
      ON CONFLICT (tenant_id, integration_type)
      DO UPDATE SET
        is_active    = COALESCE(EXCLUDED.is_active, tenant_integrations.is_active),
        config       = COALESCE(tenant_integrations.config, '{}'::jsonb) || COALESCE(EXCLUDED.config, '{}'::jsonb),
        metadata     = COALESCE(tenant_integrations.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
        last_sync    = COALESCE(GREATEST(tenant_integrations.last_sync, EXCLUDED.last_sync), tenant_integrations.last_sync, EXCLUDED.last_sync),
        updated_at   = NOW();
    END LOOP;
  END IF;
END$$;

-- 5. Drop legacy index and table if they exist
DROP INDEX IF EXISTS idx_tenant_integration_tenant;
DROP TABLE IF EXISTS tenant_integration;

COMMIT;

-- =============================================================
-- Verification queries (optional run manually after migration):
-- SELECT tenant_id, integration_type, last_sync, is_active FROM tenant_integrations ORDER BY tenant_id, integration_type;
-- SELECT COUNT(*) FROM tenant_integrations;
-- =============================================================
