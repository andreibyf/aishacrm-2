-- Check if trigger functions have the fixes
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('sync_contact_to_person_profile', '_tg_refresh_person_on_activity')
ORDER BY p.proname;
