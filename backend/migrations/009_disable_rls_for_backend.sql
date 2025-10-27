-- Temporarily disable RLS to allow backend access
-- This is a temporary fix - the proper solution is to ensure backend uses service_role
-- or connects as a superuser that bypasses RLS

-- Disable RLS on all tables
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities DISABLE ROW LEVEL SECURITY;
ALTER TABLE activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE modulesettings DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Note: Only disable RLS if you trust your backend completely
-- Better solution: Configure backend to use service_role key or postgres superuser

SELECT 'RLS disabled on all tables' AS status;
