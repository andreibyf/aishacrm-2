-- Check if utility tables exist and their schema
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('notifications', 'system_logs', 'modulesettings')
  AND column_name LIKE '%tenant%'
ORDER BY table_name, ordinal_position;
