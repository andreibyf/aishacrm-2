-- Quick validation queries for PR #19
-- Run these individually to verify all migrations

-- Check 1: Composite index exists
\echo '1. Composite index check:'
SELECT 
  CASE 
    WHEN to_regclass('public.idx_leads_tenant_account') IS NOT NULL 
    THEN 'EXISTS' 
    ELSE 'MISSING' 
  END AS idx_leads_tenant_account;

-- Check 2: RLS policy counts for key tables
\echo '\n2. RLS policy coverage:'
SELECT tablename, COUNT(*) as policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ai_campaigns', 'conversations', 'entity_transitions', 'system_settings')
GROUP BY tablename
ORDER BY tablename;

-- Check 3: Safe trigger function count
\echo '\n3. Safe trigger functions:'
SELECT COUNT(*) as safe_functions
FROM pg_proc
WHERE proname LIKE '%_safe';

-- Check 4: Any RLS without policies?
\echo '\n4. Tables with RLS but no policies:'
SELECT COUNT(*) as tables_with_issue
FROM pg_tables pt
WHERE schemaname = 'public'
  AND rowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies pp 
    WHERE pp.schemaname = pt.schemaname 
    AND pp.tablename = pt.tablename
  );
