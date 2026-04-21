-- Migration: 106_field_customization
-- Purpose: Create/reconcile field_customization table — metadata registry
--          for tenant-defined custom fields on CRM entities.
--
-- Idempotent: safe to re-run. Handles both fresh installs and environments
-- where an earlier variant of the table already exists (with nullable
-- tenant_id, missing CHECK, legacy USING(true) policy, etc.).
--
-- Design notes:
--   - Supported entities: Opportunity, Activity, Contact, Lead, Account
--   - tenant isolation via current_tenant_id() helper (matches activities/opportunities)
--   - Per-operation RLS policies (select/insert/update/delete) for perf
--   - UNIQUE(tenant_id, entity_type, field_name) prevents duplicate defs
--   - 5-field-per-entity cap enforced by 107_field_customization_cap_trigger.sql
--
-- Date: 2026-04-21

-- 1. Clean up any non-conforming rows that would block NOT NULL constraints
DELETE FROM field_customization WHERE tenant_id IS NULL;

-- 2. Fresh-install path: create table if missing
CREATE TABLE IF NOT EXISTS field_customization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  label TEXT NOT NULL,
  is_visible BOOLEAN DEFAULT true,
  is_required BOOLEAN DEFAULT false,
  options JSONB,
  metadata JSONB DEFAULT '{"is_custom": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Drop legacy column no longer in spec
ALTER TABLE field_customization DROP COLUMN IF EXISTS created_date;

-- 4. Align nullability and defaults with spec
ALTER TABLE field_customization ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE field_customization ALTER COLUMN label SET NOT NULL;
ALTER TABLE field_customization ALTER COLUMN options DROP DEFAULT;
ALTER TABLE field_customization ALTER COLUMN metadata SET DEFAULT '{"is_custom": true}'::jsonb;

-- 5. CHECK constraint on entity_type (5 supported types)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'field_customization_entity_type_check'
      AND conrelid = 'field_customization'::regclass
  ) THEN
    ALTER TABLE field_customization
      ADD CONSTRAINT field_customization_entity_type_check
      CHECK (entity_type IN ('Opportunity','Activity','Contact','Lead','Account'));
  END IF;
END $$;

-- 6. UNIQUE(tenant_id, entity_type, field_name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'field_customization_tenant_entity_field_unique'
      AND conrelid = 'field_customization'::regclass
  ) THEN
    ALTER TABLE field_customization
      ADD CONSTRAINT field_customization_tenant_entity_field_unique
      UNIQUE (tenant_id, entity_type, field_name);
  END IF;
END $$;

-- 7. Index normalization: rename legacy-named indexes, ensure spec indexes exist
ALTER INDEX IF EXISTS idx_field_customization_tenant_id RENAME TO idx_field_customization_tenant;
ALTER INDEX IF EXISTS idx_field_customization_tenant_uuid RENAME TO idx_field_customization_tenant_entity;

CREATE INDEX IF NOT EXISTS idx_field_customization_tenant ON field_customization(tenant_id);
CREATE INDEX IF NOT EXISTS idx_field_customization_entity ON field_customization(entity_type);
CREATE INDEX IF NOT EXISTS idx_field_customization_tenant_entity ON field_customization(tenant_id, entity_type);


-- 8. Enable RLS
ALTER TABLE field_customization ENABLE ROW LEVEL SECURITY;

-- 9. Replace legacy RLS policies with per-operation tenant-scoped pattern
--    (matches activities/opportunities: current_tenant_id() helper, perf-optimized)
DROP POLICY IF EXISTS "Service role full access to field_customization" ON field_customization;
DROP POLICY IF EXISTS field_customization_tenant_isolation ON field_customization;
DROP POLICY IF EXISTS field_customization_tenant_select ON field_customization;
DROP POLICY IF EXISTS field_customization_tenant_insert ON field_customization;
DROP POLICY IF EXISTS field_customization_tenant_update ON field_customization;
DROP POLICY IF EXISTS field_customization_tenant_delete ON field_customization;

CREATE POLICY field_customization_tenant_select ON field_customization
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()));

CREATE POLICY field_customization_tenant_insert ON field_customization
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));

CREATE POLICY field_customization_tenant_update ON field_customization
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()));

CREATE POLICY field_customization_tenant_delete ON field_customization
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()));

-- 10. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON field_customization TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON field_customization TO service_role;


-- 11. Updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_field_customization ON field_customization;
CREATE TRIGGER set_updated_at_field_customization
  BEFORE UPDATE ON field_customization
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 12. Documentation
COMMENT ON TABLE field_customization IS 'Custom field definitions for CRM entities (Opportunity, Activity, Contact, Lead, Account)';
COMMENT ON COLUMN field_customization.entity_type IS 'Entity this custom field belongs to';
COMMENT ON COLUMN field_customization.field_name IS 'Field name (should start with custom_)';
COMMENT ON COLUMN field_customization.label IS 'Display label for the field';
COMMENT ON COLUMN field_customization.is_visible IS 'Whether the field is visible in forms';
COMMENT ON COLUMN field_customization.is_required IS 'Soft flag: rendered as "Recommended" in UI; not enforced as a hard required field';
COMMENT ON COLUMN field_customization.options IS 'JSON array of options for select/multiselect fields (phase 2)';
COMMENT ON COLUMN field_customization.metadata IS 'Additional metadata including field_type (text|number|date|currency)';
