-- ============================================
-- CRITICAL SECURITY FIX: Performance Logs RLS
-- ============================================
-- This migration secures the performance_logs table by:
-- 1. Enabling Row Level Security (RLS)
-- 2. Revoking public access
-- 3. Adding write-only policy for authenticated users
-- 4. Restricting reads to service_role only
--
-- Security Model: Performance logs are write-only from clients,
-- readable only by backend services via service_role

-- Step 1: Enable RLS on performance_logs
ALTER TABLE public.performance_logs ENABLE ROW LEVEL SECURITY;

-- Step 2: Revoke all public access
REVOKE ALL ON public.performance_logs FROM PUBLIC, anon, authenticated;

-- Step 3: Grant INSERT only to authenticated users (for client-side logging)
GRANT INSERT ON public.performance_logs TO authenticated;

-- Step 4: Create write-only policy for authenticated users
-- Clients can log performance metrics but cannot read them back
CREATE POLICY "authenticated_insert_only"
ON public.performance_logs
FOR INSERT
TO authenticated
WITH CHECK (true);  -- Allow any authenticated user to insert logs

-- Step 5: Create index for potential user_id filtering (if column exists)
-- Note: Only create this if you have a user_id column
-- CREATE INDEX IF NOT EXISTS idx_perflogs_user_id ON public.performance_logs(user_id);

-- Step 6: Create index for tenant_id filtering (standard pattern)
CREATE INDEX IF NOT EXISTS idx_perflogs_tenant_id ON public.performance_logs(tenant_id);

-- Step 7: Grant SELECT to service_role for backend analysis (bypasses RLS)
-- Service role can read all logs for analytics/debugging
-- No explicit policy needed - service_role bypasses RLS

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify RLS is enabled
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'performance_logs';

-- Verify policies exist
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'performance_logs';

-- Verify grants (should show only INSERT for authenticated)
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'performance_logs';

-- ============================================
-- NOTES
-- ============================================
--
-- Security Model Explanation:
-- - Authenticated users can INSERT performance logs (write-only)
-- - Clients cannot SELECT (read) logs - prevents data exposure
-- - Backend via service_role can SELECT for analytics (bypasses RLS)
-- - Anon (unauthenticated) users have NO access
--
-- This pattern is ideal for telemetry/logging tables where:
-- - Clients send metrics but don't need to read them
-- - Only backend services analyze the data
-- - Prevents potential data leaks via PostgREST
--
