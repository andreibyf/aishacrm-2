-- Migration 096: Make tenant_id_text NULLABLE
-- ============================================
-- Purpose: Allow INSERT operations to work without tenant_id_text
-- Context: tenant_id_text is deprecated per copilot-instructions.md
--          All new code uses tenant_id (UUID) referencing tenant(id)
--          This migration makes tenant_id_text nullable to unblock INSERT operations
-- 
-- Affected tables: leads, accounts, contacts, opportunities, activities, note
-- 
-- Status: Column cleanup complete. See migrations 110-112 for final legacy column removal.
-- Note: Migrations 110-112 contain the DROP COLUMN statements for production deployment.

-- Make tenant_id_text nullable on leads table
ALTER TABLE leads ALTER COLUMN tenant_id_text DROP NOT NULL;

-- Make tenant_id_text nullable on accounts table
ALTER TABLE accounts ALTER COLUMN tenant_id_text DROP NOT NULL;

-- Make tenant_id_text nullable on contacts table
ALTER TABLE contacts ALTER COLUMN tenant_id_text DROP NOT NULL;

-- Make tenant_id_text nullable on opportunities table
ALTER TABLE opportunities ALTER COLUMN tenant_id_text DROP NOT NULL;

-- Make tenant_id_text nullable on activities table
ALTER TABLE activities ALTER COLUMN tenant_id_text DROP NOT NULL;

-- Make tenant_id_text nullable on note table
ALTER TABLE note ALTER COLUMN tenant_id_text DROP NOT NULL;

-- Make tenant_id_text nullable on ai_campaign table
ALTER TABLE ai_campaign ALTER COLUMN tenant_id_text DROP NOT NULL;

-- Make tenant_id_text nullable on workflow table
ALTER TABLE workflow ALTER COLUMN tenant_id_text DROP NOT NULL;

-- Make tenant_id_text nullable on webhook table (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook' AND column_name = 'tenant_id_text'
  ) THEN
    ALTER TABLE webhook ALTER COLUMN tenant_id_text DROP NOT NULL;
  END IF;
END $$;

-- Add comment documenting deprecation status
COMMENT ON COLUMN leads.tenant_id_text IS 'DEPRECATED: Use tenant_id (UUID FK to tenant.id) instead. Kept for legacy compatibility.';
COMMENT ON COLUMN accounts.tenant_id_text IS 'DEPRECATED: Use tenant_id (UUID FK to tenant.id) instead. Kept for legacy compatibility.';
COMMENT ON COLUMN contacts.tenant_id_text IS 'DEPRECATED: Use tenant_id (UUID FK to tenant.id) instead. Kept for legacy compatibility.';
COMMENT ON COLUMN opportunities.tenant_id_text IS 'DEPRECATED: Use tenant_id (UUID FK to tenant.id) instead. Kept for legacy compatibility.';
COMMENT ON COLUMN activities.tenant_id_text IS 'DEPRECATED: Use tenant_id (UUID FK to tenant.id) instead. Kept for legacy compatibility.';
COMMENT ON COLUMN note.tenant_id_text IS 'DEPRECATED: Use tenant_id (UUID FK to tenant.id) instead. Kept for legacy compatibility.';
