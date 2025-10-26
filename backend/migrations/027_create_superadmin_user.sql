-- Migration 027: Create superadmin user with full system access
-- This creates a superadmin employee record with unrestricted access to all features

-- Insert superadmin employee for local-tenant-001
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
  'local-tenant-001',
  'Super',
  'Admin',
  'admin@aishacrm.com',
  'SuperAdmin',
  'active',
  jsonb_build_object(
    'permissions', jsonb_build_array(
      'crm_access',
      'developer_access', 
      'admin_access',
      'superadmin_access',
      'full_system_access',
      'manage_all_tenants',
      'manage_all_users',
      'manage_all_settings',
      'view_all_data',
      'export_all_data',
      'delete_data',
      'manage_billing',
      'manage_integrations',
      'manage_api_keys',
      'view_system_logs',
      'manage_security'
    ),
    'access_level', 'superadmin',
    'can_manage_users', true,
    'can_manage_settings', true,
    'can_view_analytics', true,
    'can_export_data', true,
    'can_delete_data', true,
    'can_manage_all_tenants', true,
    'bypass_restrictions', true,
    'is_superadmin', true
  ),
  now()
)
ON CONFLICT DO NOTHING;

-- Ensure all modules are enabled for the tenant
INSERT INTO modulesettings (tenant_id, module_name, settings, is_enabled) VALUES
  ('local-tenant-001', 'crm', '{"features": ["contacts", "accounts", "leads", "opportunities", "activities", "reports", "analytics"]}', true),
  ('local-tenant-001', 'developer', '{"api_access": true, "debug_mode": true, "console_access": true, "full_logs": true}', true),
  ('local-tenant-001', 'admin', '{"full_access": true}', true),
  ('local-tenant-001', 'billing', '{"manage_subscriptions": true, "view_invoices": true}', true),
  ('local-tenant-001', 'analytics', '{"view_all_metrics": true}', true),
  ('local-tenant-001', 'settings', '{"manage_system": true}', true)
ON CONFLICT (tenant_id, module_name) 
DO UPDATE SET 
  is_enabled = true,
  updated_at = now();

-- Verify the superadmin insert
SELECT 
  id,
  tenant_id,
  first_name,
  last_name,
  email,
  role,
  status,
  metadata->'permissions' as permissions,
  metadata->'access_level' as access_level
FROM employees 
WHERE email = 'admin@aishacrm.com' 
  AND tenant_id = 'local-tenant-001';
