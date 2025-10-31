-- Fix User Management Issues
-- This script addresses:
-- 1. Multiple active Super Admin accounts (should only be abyfield@4vdataconsulting.com)
-- 2. Missing name data (showing "Unknown User")
-- 3. Incorrect account_status and live_status values

-- Step 1: Check current state
SELECT 
  email,
  first_name,
  last_name,
  role,
  metadata->>'account_status' as account_status,
  metadata->>'live_status' as live_status,
  metadata->>'display_name' as display_name,
  COALESCE(
    metadata->>'display_name',
    NULLIF(TRIM(first_name || ' ' || last_name), ''),
    'NO NAME'
  ) as computed_name
FROM users
WHERE role = 'superadmin'
ORDER BY created_at;

-- Step 2: Update abyfield@4vdataconsulting.com with correct name and active status
UPDATE users
SET 
  first_name = 'Andrei',
  last_name = 'Byfield',
  metadata = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{display_name}', 
        '"Andrei Byfield"'
      ),
      '{account_status}',
      '"active"'
    ),
    '{live_status}',
    '"active"'
  ),
  updated_at = NOW()
WHERE email = 'abyfield@4vdataconsulting.com';

-- Step 3: Set readable names for test accounts (for identification)
-- This makes them easier to identify even when inactive
UPDATE users
SET 
  first_name = CASE email
    WHEN 'admin@aishacrm.com' THEN 'Test'
    WHEN 'test@aishacrm.com' THEN 'Test'
    WHEN 'admin2025@temp.com' THEN 'Temporary'
    WHEN 'testadmin@temp.com' THEN 'Test'
    WHEN 'temp@admin.com' THEN 'Temp'
    ELSE 'Unknown'
  END,
  last_name = CASE email
    WHEN 'admin@aishacrm.com' THEN 'Admin Account'
    WHEN 'test@aishacrm.com' THEN 'User Account'
    WHEN 'admin2025@temp.com' THEN 'Admin (2025)'
    WHEN 'testadmin@temp.com' THEN 'Admin Account'
    WHEN 'temp@admin.com' THEN 'Admin Account'
    ELSE 'Test Account'
  END,
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{display_name}',
    to_jsonb(
      CASE email
        WHEN 'admin@aishacrm.com' THEN 'Test Admin Account'
        WHEN 'test@aishacrm.com' THEN 'Test User Account'
        WHEN 'admin2025@temp.com' THEN 'Temporary Admin (2025)'
        WHEN 'testadmin@temp.com' THEN 'Test Admin Account'
        WHEN 'temp@admin.com' THEN 'Temp Admin Account'
        ELSE 'Unknown Test Account'
      END
    )
  )
WHERE 
  role = 'superadmin'
  AND email != 'abyfield@4vdataconsulting.com'
  AND (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '');

-- Step 4: Deactivate ALL other Super Admin accounts (test accounts)
UPDATE users
SET 
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{account_status}',
      '"inactive"'
    ),
    '{live_status}',
    '"inactive"'
  ),
  updated_at = NOW()
WHERE 
  role = 'superadmin'
  AND email != 'abyfield@4vdataconsulting.com';

-- Step 5: Verify the changes
SELECT 
  email,
  first_name,
  last_name,
  role,
  metadata->>'account_status' as account_status,
  metadata->>'live_status' as live_status,
  metadata->>'display_name' as display_name,
  COALESCE(
    metadata->>'display_name',
    NULLIF(TRIM(first_name || ' ' || last_name), ''),
    'NO NAME'
  ) as computed_name,
  updated_at
FROM users
WHERE role = 'superadmin'
ORDER BY 
  CASE WHEN email = 'abyfield@4vdataconsulting.com' THEN 0 ELSE 1 END,
  created_at;

-- Expected result: 
-- - abyfield@4vdataconsulting.com: Andrei Byfield, active/active
-- - All others: Named appropriately, inactive/inactive
