-- Deactivate all test/temporary Super Admin accounts except the real one
-- Run this manually in your Supabase SQL Editor or via psql

-- First, let's see what we have:
SELECT id, email, role, account_status, live_status
FROM users
WHERE role = 'superadmin'
ORDER BY created_at;

-- Deactivate all Super Admins EXCEPT abyfield@4vdataconsulting.com
UPDATE users
SET 
  account_status = 'inactive',
  live_status = 'inactive'
WHERE 
  role = 'superadmin'
  AND email != 'abyfield@4vdataconsulting.com'
  AND (account_status != 'inactive' OR live_status != 'inactive');

-- Verify the change:
SELECT id, email, role, account_status, live_status
FROM users
WHERE role = 'superadmin'
ORDER BY created_at;

-- Expected result: Only abyfield@4vdataconsulting.com should have active/active status
