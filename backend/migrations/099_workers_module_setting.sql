-- Migration 099: Add Workers module to modulesettings
-- Ensures Workers module appears in Settings page for all tenants

-- Add workers module setting for all existing tenants
INSERT INTO modulesettings (tenant_id, module_name, settings, is_enabled)
SELECT 
  t.tenant_id,  -- Use the TEXT tenant_id (slug) for modulesettings
  'workers' as module_name,
  '{"features": ["worker_management", "contractor_management", "temp_labor", "skills_tracking", "certifications", "assignments"]}' as settings,
  true as is_enabled
FROM tenant t
WHERE NOT EXISTS (
  SELECT 1 FROM modulesettings ms 
  WHERE ms.tenant_id = t.tenant_id 
  AND ms.module_name = 'workers'
);

-- Verify
SELECT tenant_id, module_name, is_enabled, settings 
FROM modulesettings 
WHERE module_name = 'workers'
ORDER BY tenant_id;
