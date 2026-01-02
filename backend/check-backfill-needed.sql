-- Quick check: Count rows needing tenant_id UUID backfill

-- Notifications table
SELECT 
  'notifications' as table_name,
  COUNT(*) as total_rows,
  COUNT(tenant_id) as rows_with_uuid,
  COUNT(tenant_id_text) as rows_with_text,
  COUNT(CASE WHEN tenant_id IS NULL AND tenant_id_text IS NOT NULL THEN 1 END) as needs_backfill
FROM notifications;

-- System logs table
SELECT 
  'system_logs' as table_name,
  COUNT(*) as total_rows,
  COUNT(tenant_id) as rows_with_uuid,
  COUNT(tenant_id_text) as rows_with_text,
  COUNT(CASE WHEN tenant_id IS NULL AND tenant_id_text IS NOT NULL THEN 1 END) as needs_backfill
FROM system_logs;

-- Module settings table
SELECT 
  'modulesettings' as table_name,
  COUNT(*) as total_rows,
  COUNT(tenant_id) as rows_with_uuid,
  COUNT(tenant_id_text) as rows_with_text,
  COUNT(CASE WHEN tenant_id IS NULL AND tenant_id_text IS NOT NULL THEN 1 END) as needs_backfill
FROM modulesettings;

-- Sample rows needing backfill (notifications)
SELECT 
  'SAMPLE NOTIFICATIONS' as info,
  id, 
  tenant_id as uuid_value,
  tenant_id_text as text_value,
  created_at
FROM notifications
WHERE tenant_id IS NULL 
  AND tenant_id_text IS NOT NULL
LIMIT 5;

-- Sample rows needing backfill (system_logs)
SELECT 
  'SAMPLE SYSTEM_LOGS' as info,
  id, 
  tenant_id as uuid_value,
  tenant_id_text as text_value,
  created_at
FROM system_logs
WHERE tenant_id IS NULL 
  AND tenant_id_text IS NOT NULL
LIMIT 5;
