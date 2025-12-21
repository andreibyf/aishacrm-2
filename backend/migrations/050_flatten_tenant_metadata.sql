-- Migration: Flatten Tenant Metadata to Dedicated Columns
-- Created: 2025-11-13
-- Purpose: Move critical business fields from JSONB metadata to typed columns for better performance and type safety
-- Reference: docs/TENANT_METADATA_AND_TABLE_FIXES.md

-- Step 1: Add new columns to tenant table
ALTER TABLE tenant
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS major_city TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS business_model TEXT,
  ADD COLUMN IF NOT EXISTS geographic_focus TEXT,
  ADD COLUMN IF NOT EXISTS elevenlabs_agent_id TEXT;

-- Step 2: Migrate existing metadata to new columns
-- This UPDATE is safe to run multiple times (idempotent)
UPDATE tenant
SET
  domain = COALESCE(domain, metadata->>'domain'),
  country = COALESCE(country, metadata->>'country'),
  industry = COALESCE(industry, metadata->>'industry'),
  major_city = COALESCE(major_city, metadata->>'major_city'),
  display_order = COALESCE(display_order, (metadata->>'display_order')::INTEGER, 0),
  business_model = COALESCE(business_model, metadata->>'business_model'),
  geographic_focus = COALESCE(geographic_focus, metadata->>'geographic_focus'),
  elevenlabs_agent_id = COALESCE(elevenlabs_agent_id, metadata->>'elevenlabs_agent_id')
WHERE metadata IS NOT NULL AND metadata != '{}';

-- Step 3: Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenant_industry ON tenant(industry) WHERE industry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_country ON tenant(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_business_model ON tenant(business_model) WHERE business_model IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_geographic_focus ON tenant(geographic_focus) WHERE geographic_focus IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_elevenlabs_agent_id ON tenant(elevenlabs_agent_id) WHERE elevenlabs_agent_id IS NOT NULL;

-- Step 4: Add comments to document the columns
COMMENT ON COLUMN tenant.domain IS 'Tenant domain name for custom branding';
COMMENT ON COLUMN tenant.country IS 'Primary country of operation';
COMMENT ON COLUMN tenant.industry IS 'Business industry classification (e.g., construction_and_engineering)';
COMMENT ON COLUMN tenant.major_city IS 'Primary city of operation';
COMMENT ON COLUMN tenant.display_order IS 'Display order for tenant listings (0 = default)';
COMMENT ON COLUMN tenant.business_model IS 'Business model type (e.g., b2b, b2c, b2b2c)';
COMMENT ON COLUMN tenant.geographic_focus IS 'Geographic focus area (e.g., north_america, europe, global)';
COMMENT ON COLUMN tenant.elevenlabs_agent_id IS 'ElevenLabs AI agent identifier for voice features';

-- Step 5: Optional - Remove migrated keys from metadata JSONB
-- Uncomment the following line if you want to clean up the metadata column
-- WARNING: This is a destructive operation. Ensure all code is updated first.
-- UPDATE tenant SET metadata = metadata - ARRAY['domain', 'country', 'industry', 'major_city', 'display_order', 'business_model', 'geographic_focus', 'elevenlabs_agent_id'];

-- Step 6: Add trigger to keep metadata in sync during transition period
-- This ensures that if old code still writes to metadata, it's copied to the new columns
CREATE OR REPLACE FUNCTION sync_tenant_metadata_to_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- If metadata changes, update columns
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.metadata IS NOT NULL THEN
    NEW.domain := COALESCE(NEW.domain, NEW.metadata->>'domain');
    NEW.country := COALESCE(NEW.country, NEW.metadata->>'country');
    NEW.industry := COALESCE(NEW.industry, NEW.metadata->>'industry');
    NEW.major_city := COALESCE(NEW.major_city, NEW.metadata->>'major_city');
    NEW.display_order := COALESCE(NEW.display_order, (NEW.metadata->>'display_order')::INTEGER, 0);
    NEW.business_model := COALESCE(NEW.business_model, NEW.metadata->>'business_model');
    NEW.geographic_focus := COALESCE(NEW.geographic_focus, NEW.metadata->>'geographic_focus');
    NEW.elevenlabs_agent_id := COALESCE(NEW.elevenlabs_agent_id, NEW.metadata->>'elevenlabs_agent_id');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_tenant_metadata_to_columns ON tenant;
CREATE TRIGGER trigger_sync_tenant_metadata_to_columns
  BEFORE INSERT OR UPDATE ON tenant
  FOR EACH ROW
  EXECUTE FUNCTION sync_tenant_metadata_to_columns();

COMMENT ON FUNCTION sync_tenant_metadata_to_columns() IS 'Backward compatibility: Sync metadata JSONB to dedicated columns during transition period';

-- Migration complete
-- Next steps:
-- 1. Update backend/routes/tenants.js to use direct columns
-- 2. Update backend/routes/ai.js to use direct columns
-- 3. Update frontend components to use direct properties
-- 4. Test thoroughly
-- 5. After confirming all code is updated, run Step 5 to clean up metadata JSONB
