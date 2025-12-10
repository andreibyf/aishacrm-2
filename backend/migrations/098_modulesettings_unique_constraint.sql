-- Migration 098: Ensure unique constraint on modulesettings for upsert operations
-- The ON CONFLICT clause requires this constraint to exist
-- Note: tenant_id may be TEXT (legacy) or needs to work with UUID values

-- First, check for and remove duplicate records to allow unique constraint
-- Keep the most recently updated record for each tenant_id + module_name combo
DELETE FROM modulesettings a
USING modulesettings b
WHERE a.id < b.id 
  AND a.tenant_id = b.tenant_id 
  AND a.module_name = b.module_name;

-- Drop existing constraint if it exists (may have wrong name)
ALTER TABLE modulesettings DROP CONSTRAINT IF EXISTS modulesettings_tenant_id_module_name_key;
ALTER TABLE modulesettings DROP CONSTRAINT IF EXISTS modulesettings_unique_tenant_module;
ALTER TABLE modulesettings DROP CONSTRAINT IF EXISTS modulesettings_tenant_module_unique;

-- Add the unique constraint
ALTER TABLE modulesettings 
ADD CONSTRAINT modulesettings_tenant_module_unique UNIQUE (tenant_id, module_name);
