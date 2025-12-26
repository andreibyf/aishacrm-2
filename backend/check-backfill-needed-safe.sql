-- Check if backfill is needed for utility tables (SAFE - no column name assumptions)
-- ==================================================================================
-- Context: Production uses either tenant_id_text OR tenant_id_legacy
-- This query only checks tenant_id (UUID) column which is guaranteed to exist

-- Check notifications table
SELECT 
  'notifications' as table_name,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE tenant_id IS NULL) as null_uuid_count,
  COUNT(*) FILTER (WHERE tenant_id IS NOT NULL) as has_uuid_count,
  CASE 
    WHEN COUNT(*) FILTER (WHERE tenant_id IS NULL) > 0 THEN '⚠️ NEEDS BACKFILL'
    ELSE '✅ OK'
  END as status
FROM public.notifications

UNION ALL

-- Check system_logs table
SELECT 
  'system_logs' as table_name,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE tenant_id IS NULL) as null_uuid_count,
  COUNT(*) FILTER (WHERE tenant_id IS NOT NULL) as has_uuid_count,
  CASE 
    WHEN COUNT(*) FILTER (WHERE tenant_id IS NULL) > 0 THEN '⚠️ NEEDS BACKFILL'
    ELSE '✅ OK'
  END as status
FROM public.system_logs

UNION ALL

-- Check modulesettings table
SELECT 
  'modulesettings' as table_name,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE tenant_id IS NULL) as null_uuid_count,
  COUNT(*) FILTER (WHERE tenant_id IS NOT NULL) as has_uuid_count,
  CASE 
    WHEN COUNT(*) FILTER (WHERE tenant_id IS NULL) > 0 THEN '⚠️ NEEDS BACKFILL'
    ELSE '✅ OK'
  END as status
FROM public.modulesettings

ORDER BY table_name;
