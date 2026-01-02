-- Migration 026: Create test user employee record with full access
-- This creates an employee record for test@aishacrm.com with CRM and Developer access

-- Insert test employee for 6cb4c008-4847-426a-9a2e-918ad70e7b69
INSERT INTO employees (
  id,
  tenant_id,
  first_name,
  last_name,
  email,
  role,
  status,
  metadata,
  created_at
) VALUES (
  gen_random_uuid(),
  '6cb4c008-4847-426a-9a2e-918ad70e7b69',
  'Test',
  'User',
  'test@aishacrm.com',
  'Admin',
  'active',
  jsonb_build_object(
    'permissions', jsonb_build_array('crm_access', 'developer_access', 'admin_access'),
    'access_level', 'full',
    'can_manage_users', true,
    'can_manage_settings', true,
    'can_view_analytics', true,
    'can_export_data', true
  ),
  now()
)
ON CONFLICT DO NOTHING;

-- Ensure CRM module is enabled for the tenant
INSERT INTO modulesettings (
  tenant_id,
  module_name,
  settings,
  is_enabled
) VALUES (
  '6cb4c008-4847-426a-9a2e-918ad70e7b69',
  'crm',
  jsonb_build_object(
    'features', jsonb_build_array('contacts', 'accounts', 'leads', 'opportunities', 'activities'),
    'default_view', 'dashboard'
  ),
  true
)
ON CONFLICT (tenant_id, module_name) 
DO UPDATE SET 
  is_enabled = true,
  updated_at = now();

-- Ensure Developer module is enabled for the tenant
INSERT INTO modulesettings (
  tenant_id,
  module_name,
  settings,
  is_enabled
) VALUES (
  '6cb4c008-4847-426a-9a2e-918ad70e7b69',
  'developer',
  jsonb_build_object(
    'api_access', true,
    'debug_mode', true,
    'console_access', true
  ),
  true
)
ON CONFLICT (tenant_id, module_name) 
DO UPDATE SET 
  is_enabled = true,
  updated_at = now();

-- Verify the insert
SELECT 
  id,
  tenant_id,
  first_name,
  last_name,
  email,
  role,
  status,
  metadata
FROM employees 
WHERE email = 'test@aishacrm.com' 
  AND tenant_id = '6cb4c008-4847-426a-9a2e-918ad70e7b69';
