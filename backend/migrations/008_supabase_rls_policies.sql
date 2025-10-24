-- Supabase Production Database - RLS Policies Setup
-- Run this in Supabase SQL Editor after creating tables

-- ============================================================================
-- Enable Row Level Security on All Tables
-- ============================================================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulesettings ENABLE ROW LEVEL SECURITY;
ALTER TABLE apikey ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Service Role Policies (Backend Access)
-- The service_role bypasses RLS by default, but we add explicit policies
-- for documentation and future-proofing
-- ============================================================================

-- Contacts
CREATE POLICY "Backend service has full access to contacts" ON contacts
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Leads  
CREATE POLICY "Backend service has full access to leads" ON leads
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Accounts
CREATE POLICY "Backend service has full access to accounts" ON accounts
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Opportunities
CREATE POLICY "Backend service has full access to opportunities" ON opportunities
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Activities
CREATE POLICY "Backend service has full access to activities" ON activities
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Users
CREATE POLICY "Backend service has full access to users" ON users
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Employees
CREATE POLICY "Backend service has full access to employees" ON employees
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Notifications
CREATE POLICY "Backend service has full access to notifications" ON notifications
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- System Logs
CREATE POLICY "Backend service has full access to system_logs" ON system_logs
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Module Settings
CREATE POLICY "Backend service has full access to modulesettings" ON modulesettings
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- API Keys
CREATE POLICY "Backend service has full access to apikey" ON apikey
  FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Optional: User-Level Policies (If using Supabase Auth + Direct Client Access)
-- Uncomment and customize these if you want to allow direct database access
-- from the frontend using Supabase client
-- ============================================================================

/*
-- Example: Users can only see their own tenant's data
CREATE POLICY "Users can view their tenant's contacts" ON contacts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert contacts in their tenant" ON contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can update their tenant's contacts" ON contacts
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Repeat similar patterns for other tables as needed
*/

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Check policies created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================================
-- Notes
-- ============================================================================

-- 1. Service Role Key: Backend should use the service_role key which bypasses RLS
-- 2. Anon Key: Only use for public endpoints (if any)
-- 3. Security: Never expose service_role key to frontend
-- 4. Testing: After applying policies, test CRUD operations from backend
-- 5. Monitoring: Check Supabase Dashboard → Database → Logs for policy violations
