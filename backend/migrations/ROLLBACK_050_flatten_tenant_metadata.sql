-- Rollback Migration: Flatten Tenant Metadata to Dedicated Columns
-- Created: 2025-11-13
-- Purpose: Rollback the tenant metadata flattening if issues are encountered
-- Reference: docs/TENANT_METADATA_AND_TABLE_FIXES.md

-- WARNING: This rollback script will:
-- 1. Copy data from dedicated columns back to metadata JSONB
-- 2. Drop the dedicated columns
-- 3. Remove indexes and triggers
-- Run this ONLY if you need to revert the migration

-- Step 1: Copy data back to metadata JSONB
-- This preserves any data that was in the dedicated columns
UPDATE tenant
SET metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{domain}', 
                to_jsonb(COALESCE(domain, ''))
              ),
              '{country}', 
              to_jsonb(COALESCE(country, ''))
            ),
            '{industry}', 
            to_jsonb(COALESCE(industry, ''))
          ),
          '{major_city}', 
          to_jsonb(COALESCE(major_city, ''))
        ),
        '{display_order}', 
        to_jsonb(COALESCE(display_order, 0))
      ),
      '{business_model}', 
      to_jsonb(COALESCE(business_model, ''))
    ),
    '{geographic_focus}', 
    to_jsonb(COALESCE(geographic_focus, ''))
  ),
  '{elevenlabs_agent_id}', 
  to_jsonb(COALESCE(elevenlabs_agent_id, ''))
)
WHERE 
  domain IS NOT NULL OR
  country IS NOT NULL OR
  industry IS NOT NULL OR
  major_city IS NOT NULL OR
  business_model IS NOT NULL OR
  geographic_focus IS NOT NULL OR
  elevenlabs_agent_id IS NOT NULL;

-- Step 2: Drop the trigger
DROP TRIGGER IF EXISTS trigger_sync_tenant_metadata_to_columns ON tenant;
DROP FUNCTION IF EXISTS sync_tenant_metadata_to_columns();

-- Step 3: Drop the indexes
DROP INDEX IF EXISTS idx_tenant_industry;
DROP INDEX IF EXISTS idx_tenant_country;
DROP INDEX IF EXISTS idx_tenant_business_model;
DROP INDEX IF EXISTS idx_tenant_geographic_focus;
DROP INDEX IF EXISTS idx_tenant_elevenlabs_agent_id;

-- Step 4: Drop the dedicated columns
ALTER TABLE tenant
  DROP COLUMN IF EXISTS domain,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS industry,
  DROP COLUMN IF EXISTS major_city,
  DROP COLUMN IF EXISTS display_order,
  DROP COLUMN IF EXISTS business_model,
  DROP COLUMN IF EXISTS geographic_focus,
  DROP COLUMN IF EXISTS elevenlabs_agent_id;

-- Rollback complete
-- All tenant data should now be back in the metadata JSONB column
-- Verify by running: SELECT metadata FROM tenant LIMIT 5;
