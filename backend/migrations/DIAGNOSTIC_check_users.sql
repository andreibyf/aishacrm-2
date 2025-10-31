-- Diagnostic: Check all users and their status
-- Run this in Supabase SQL Editor to see what's actually in the database

-- 1. Check all users in the users table (superadmins/admins)
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  tenant_id,
  metadata->>'display_name' as metadata_display_name,
  metadata->>'account_status' as account_status,
  metadata->>'live_status' as live_status,
  COALESCE(
    metadata->>'display_name',
    NULLIF(TRIM(first_name || ' ' || last_name), ''),
    'NO NAME SET'
  ) as computed_display_name,
  created_at,
  updated_at
FROM users
ORDER BY created_at DESC;

-- 2. Check if there are ANY employees (should be empty)
SELECT COUNT(*) as employee_count FROM employees;

-- 3. Show first 5 employees if any exist
SELECT 
  id,
  email,
  first_name,
  last_name,
  tenant_id,
  role,
  status
FROM employees
LIMIT 5;

-- 2. Check specifically for the accounts you mentioned
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  COALESCE(metadata->>'display_name', first_name || ' ' || last_name) as display_name,
  metadata
FROM users
WHERE email IN (
  'abyfield@4vdataconsulting.com',
  'admin2025@temp.com',
  'admin@aishacrm.com',
  'test@aishacrm.com',
  'testadmin@temp.com'
)
ORDER BY created_at;

-- 3. Check if there's auth.users data (Supabase Auth table)
-- Note: This might not work if you don't have permissions
SELECT 
  id,
  email,
  raw_user_meta_data->>'first_name' as first_name,
  raw_user_meta_data->>'last_name' as last_name,
  raw_user_meta_data->>'display_name' as display_name,
  raw_user_meta_data
FROM auth.users
WHERE email = 'abyfield@4vdataconsulting.com';

-- 4. Count active vs inactive superadmins
SELECT 
  COUNT(*) FILTER (WHERE metadata->>'account_status' = 'active' OR metadata->>'account_status' IS NULL) as active_count,
  COUNT(*) FILTER (WHERE metadata->>'account_status' = 'inactive') as inactive_count
FROM users
WHERE role = 'superadmin';
