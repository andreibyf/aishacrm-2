-- Row Level Security (RLS) Setup for Supabase Cloud
-- Run this after applying the core migrations (001_init.sql and 007_crud_enhancements.sql)

-- ============================================
-- STEP 1: Enable RLS on All Tables
-- ============================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulesettings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on API keys table if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'apikey') THEN
    ALTER TABLE apikey ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ============================================
-- STEP 2: Create Service Role Policies
-- ============================================
-- These policies allow the backend (using service role key) full access
-- The backend handles all access control logic via tenant_id filtering

-- Accounts
CREATE POLICY "Service role full access to accounts" 
  ON accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Contacts
CREATE POLICY "Service role full access to contacts" 
  ON contacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Leads
CREATE POLICY "Service role full access to leads" 
  ON leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Opportunities
CREATE POLICY "Service role full access to opportunities" 
  ON opportunities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Activities
CREATE POLICY "Service role full access to activities" 
  ON activities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Employees
CREATE POLICY "Service role full access to employees" 
  ON employees
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Notifications
CREATE POLICY "Service role full access to notifications" 
  ON notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- System Logs
CREATE POLICY "Service role full access to system_logs" 
  ON system_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Module Settings
CREATE POLICY "Service role full access to modulesettings" 
  ON modulesettings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users
CREATE POLICY "Service role full access to users" 
  ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- API Keys (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'apikey') THEN
    EXECUTE 'CREATE POLICY "Service role full access to apikey" 
      ON apikey
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)';
  END IF;
END $$;

-- ============================================
-- STEP 3: Optional - Authenticated User Policies
-- ============================================
-- Uncomment these if you want to allow direct Supabase client access
-- Currently, all access goes through the backend, so these are not needed

/*
-- Accounts - users can only see accounts in their tenant
CREATE POLICY "Users can view own tenant accounts" 
  ON accounts
  FOR SELECT
  TO authenticated
  USING (tenant_id = auth.jwt()->>'tenant_id');

-- Contacts - users can only see contacts in their tenant
CREATE POLICY "Users can view own tenant contacts" 
  ON contacts
  FOR SELECT
  TO authenticated
  USING (tenant_id = auth.jwt()->>'tenant_id');

-- Leads - users can only see leads in their tenant
CREATE POLICY "Users can view own tenant leads" 
  ON leads
  FOR SELECT
  TO authenticated
  USING (tenant_id = auth.jwt()->>'tenant_id');

-- Add similar policies for other tables as needed
*/

-- ============================================
-- STEP 4: Verify RLS is Enabled
-- ============================================

-- Check which tables have RLS enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- View all policies
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
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================
-- Notes
-- ============================================
-- 1. RLS is now enabled on all tables
-- 2. Only the service role (backend) has access
-- 3. Direct client access is blocked (secure by default)
-- 4. Backend handles all authentication and authorization
-- 5. Backend filters by tenant_id to ensure data isolation

-- For Production:
-- Consider more granular policies based on:
-- - User roles (admin, user, viewer)
-- - Specific permissions per user
-- - Read-only access for certain roles
-- - Audit logging of sensitive operations
