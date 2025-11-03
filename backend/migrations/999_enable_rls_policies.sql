-- Enable Row Level Security (RLS) for production data isolation
-- This migration enables RLS and creates tenant-based policies for all multi-tenant tables

-- ========================================
-- ENABLE RLS ON ALL TENANT-SCOPED TABLES
-- ========================================

ALTER TABLE IF EXISTS employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bizdev_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS modulesettings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS system_logs ENABLE ROW LEVEL SECURITY;

-- ========================================
-- DROP EXISTING POLICIES (if re-running)
-- ========================================

DROP POLICY IF EXISTS "tenant_isolation_select" ON employees;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON employees;
DROP POLICY IF EXISTS "tenant_isolation_update" ON employees;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON employees;

DROP POLICY IF EXISTS "tenant_isolation_select" ON contacts;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON contacts;
DROP POLICY IF EXISTS "tenant_isolation_update" ON contacts;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON contacts;

DROP POLICY IF EXISTS "tenant_isolation_select" ON leads;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON leads;
DROP POLICY IF EXISTS "tenant_isolation_update" ON leads;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON leads;

DROP POLICY IF EXISTS "tenant_isolation_select" ON accounts;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON accounts;
DROP POLICY IF EXISTS "tenant_isolation_update" ON accounts;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON accounts;

DROP POLICY IF EXISTS "tenant_isolation_select" ON opportunities;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON opportunities;
DROP POLICY IF EXISTS "tenant_isolation_update" ON opportunities;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON opportunities;

DROP POLICY IF EXISTS "tenant_isolation_select" ON activities;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON activities;
DROP POLICY IF EXISTS "tenant_isolation_update" ON activities;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON activities;

DROP POLICY IF EXISTS "tenant_isolation_select" ON notes;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON notes;
DROP POLICY IF EXISTS "tenant_isolation_update" ON notes;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON notes;

DROP POLICY IF EXISTS "tenant_isolation_select" ON documents;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON documents;
DROP POLICY IF EXISTS "tenant_isolation_update" ON documents;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON documents;

DROP POLICY IF EXISTS "tenant_isolation_select" ON audit_log;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON audit_log;

DROP POLICY IF EXISTS "tenant_isolation_select" ON workflows;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON workflows;
DROP POLICY IF EXISTS "tenant_isolation_update" ON workflows;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON workflows;

DROP POLICY IF EXISTS "tenant_isolation_select" ON workflow_executions;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON workflow_executions;

DROP POLICY IF EXISTS "tenant_isolation_select" ON bizdev_sources;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON bizdev_sources;
DROP POLICY IF EXISTS "tenant_isolation_update" ON bizdev_sources;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON bizdev_sources;

DROP POLICY IF EXISTS "tenant_isolation_select" ON modulesettings;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON modulesettings;
DROP POLICY IF EXISTS "tenant_isolation_update" ON modulesettings;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON modulesettings;

DROP POLICY IF EXISTS "tenant_isolation_select" ON tenant_integrations;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON tenant_integrations;
DROP POLICY IF EXISTS "tenant_isolation_update" ON tenant_integrations;
DROP POLICY IF EXISTS "tenant_isolation_delete" ON tenant_integrations;

DROP POLICY IF EXISTS "service_role_bypass" ON employees;
DROP POLICY IF EXISTS "service_role_bypass" ON contacts;
DROP POLICY IF EXISTS "service_role_bypass" ON leads;
DROP POLICY IF EXISTS "service_role_bypass" ON accounts;
DROP POLICY IF EXISTS "service_role_bypass" ON opportunities;
DROP POLICY IF EXISTS "service_role_bypass" ON activities;
DROP POLICY IF EXISTS "service_role_bypass" ON notes;
DROP POLICY IF EXISTS "service_role_bypass" ON documents;
DROP POLICY IF EXISTS "service_role_bypass" ON audit_log;
DROP POLICY IF EXISTS "service_role_bypass" ON workflows;
DROP POLICY IF EXISTS "service_role_bypass" ON workflow_executions;
DROP POLICY IF EXISTS "service_role_bypass" ON bizdev_sources;
DROP POLICY IF EXISTS "service_role_bypass" ON modulesettings;
DROP POLICY IF EXISTS "service_role_bypass" ON tenant_integrations;
DROP POLICY IF EXISTS "service_role_bypass" ON system_logs;

-- ========================================
-- SERVICE ROLE BYPASS (for backend API using service_role key)
-- ========================================
-- The backend uses the service_role key, so we need a bypass policy

CREATE POLICY "service_role_bypass" ON employees
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON contacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON opportunities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON activities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON notes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON workflows
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON workflow_executions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON bizdev_sources
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON modulesettings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON tenant_integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_bypass" ON system_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ========================================
-- TENANT TABLE - Superadmin/Admin Access
-- ========================================
-- Tenant table doesn't have tenant_id column; use service_role bypass

CREATE POLICY "service_role_bypass" ON tenant
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ========================================
-- USERS TABLE - Global users (no tenant_id)
-- ========================================
-- The public.users table contains superadmins and admins (global)
-- Since backend uses service_role, it bypasses RLS automatically

ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bypass" ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ========================================
-- NOTES
-- ========================================
-- RLS is now enabled. Your backend uses the service_role key which bypasses RLS.
-- This ensures:
-- 1. Direct database access from clients is blocked (if someone gets the anon key)
-- 2. Backend API retains full access via service_role
-- 3. Tenant isolation is enforced at the application layer (your backend code)
-- 4. Future: You can add authenticated user policies if you switch to direct client access

-- To test RLS is working:
-- 1. Try to query with anon key → should return no rows
-- 2. Backend API should work normally (uses service_role)

-- ========================================
-- VERIFICATION
-- ========================================
-- Run these queries to verify RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('employees', 'contacts', 'leads', 'accounts', 'opportunities');
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
