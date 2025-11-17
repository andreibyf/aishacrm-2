-- Final validation query for PR #19 merge
-- Checks all critical security improvements

-- 1. Verify composite index on leads
SELECT 
  CASE 
    WHEN to_regclass('public.idx_leads_tenant_account') IS NOT NULL 
    THEN '✓ Composite index exists'
    ELSE '✗ Composite index MISSING'
  END AS index_check;

-- 2. Count RLS policies by table (should have at least 1 policy each)
SELECT 
  schemaname,
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'accounts', 'activities', 'ai_campaigns', 'cash_flow', 'client_requirement',
    'contacts', 'conversations', 'conversation_messages', 'entity_transitions',
    'leads', 'note', 'notifications', 'opportunities', 'synchealth',
    'system_settings', 'workflow', 'workflow_execution'
  )
GROUP BY schemaname, tablename
ORDER BY policy_count ASC, tablename;

-- 3. Verify all triggers use _safe functions
SELECT 
  t.tgname as trigger_name,
  c.relname as table_name,
  p.proname as function_name,
  CASE 
    WHEN p.proname LIKE '%_safe' THEN '✓ Safe'
    ELSE '✗ NOT SAFE'
  END as safety_status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname IN (
  'accounts', 'activities', 'contacts', 'employees', 'leads', 
  'notifications', 'opportunities', 'system_logs', 'tenant_integrations',
  'users', 'ai_campaigns', 'system_settings'
)
AND t.tgname NOT LIKE 'RI_%'  -- Exclude foreign key triggers
ORDER BY table_name, trigger_name;

-- 4. Check for any tables with RLS enabled but zero policies
SELECT 
  schemaname,
  tablename,
  'RLS ENABLED BUT NO POLICIES!' as issue
FROM pg_tables pt
WHERE schemaname = 'public'
  AND rowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies pp 
    WHERE pp.schemaname = pt.schemaname 
    AND pp.tablename = pt.tablename
  );

-- 5. Summary counts
SELECT 
  'Total RLS-enabled tables' as metric,
  COUNT(*) as value
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true
UNION ALL
SELECT 
  'Total RLS policies' as metric,
  COUNT(*) as value
FROM pg_policies
WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Safe trigger functions' as metric,
  COUNT(*) as value
FROM pg_proc
WHERE proname LIKE '%_safe';
