-- Migration 099: Make tenant_id_legacy NULLABLE on additional tables
-- ==================================================================
-- Purpose: Allow INSERT operations to work without tenant_id_legacy
-- Context: Some tables use tenant_id_legacy instead of tenant_id_text
--          Both are deprecated per copilot-instructions.md
--          All new code uses tenant_id (UUID) referencing tenant(id)
-- 
-- Affected tables: bizdev_sources, system_logs
-- 
-- Status: Column cleanup complete. See migrations 110-112 for final legacy column removal.
-- Note: Migrations 110-112 contain the DROP COLUMN statements for production deployment.

-- Make tenant_id_legacy nullable on bizdev_sources table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bizdev_sources' AND column_name = 'tenant_id_legacy'
  ) THEN
    ALTER TABLE bizdev_sources ALTER COLUMN tenant_id_legacy DROP NOT NULL;
  END IF;
END $$;

-- Make tenant_id_legacy nullable on system_logs table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_logs' AND column_name = 'tenant_id_legacy'
  ) THEN
    ALTER TABLE system_logs ALTER COLUMN tenant_id_legacy DROP NOT NULL;
  END IF;
END $$;

-- Also check for tenant_id_text on these tables (in case column is named differently)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bizdev_sources' AND column_name = 'tenant_id_text'
  ) THEN
    ALTER TABLE bizdev_sources ALTER COLUMN tenant_id_text DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_logs' AND column_name = 'tenant_id_text'
  ) THEN
    ALTER TABLE system_logs ALTER COLUMN tenant_id_text DROP NOT NULL;
  END IF;
END $$;

-- Add deprecation comments
COMMENT ON TABLE bizdev_sources IS 'BizDev Sources - tenant_id_legacy is DEPRECATED. Use tenant_id (UUID).';
COMMENT ON TABLE system_logs IS 'System Logs - tenant_id_legacy is DEPRECATED. Use tenant_id (UUID).';
