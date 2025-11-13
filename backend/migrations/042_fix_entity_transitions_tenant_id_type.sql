-- 042_fix_entity_transitions_tenant_id_type.sql
-- Purpose: Align entity_transitions.tenant_id type with rest of schema (TEXT slug like 'labor-depot')
-- Context: Other tables store tenant_id as TEXT; prior migration 040 created entity_transitions with tenant_id UUID
--          causing runtime failures when logging transitions with slug tenant IDs.

DO $$
BEGIN
  -- Only alter if the column currently uses UUID
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'entity_transitions'
      AND column_name = 'tenant_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE entity_transitions
      ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
  END IF;
END $$;

-- Recreate index to ensure compatibility (no-op if exists already works with text)
DROP INDEX IF EXISTS idx_entity_transitions_tenant;
CREATE INDEX IF NOT EXISTS idx_entity_transitions_tenant ON entity_transitions(tenant_id);
