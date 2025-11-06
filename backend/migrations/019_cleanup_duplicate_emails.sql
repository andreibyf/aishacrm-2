-- Pre-migration cleanup: Remove duplicate emails before enforcing uniqueness
-- This script identifies and removes duplicate email accounts while preserving the newest/primary record

-- Step 1: Display all duplicate emails for review
DO $$
DECLARE
  duplicate_report TEXT;
BEGIN
  WITH all_emails AS (
    SELECT 
      id, 
      email, 
      'users' as source_table,
      role,
      tenant_id,
      created_at
    FROM users
    WHERE email IS NOT NULL AND email <> ''
    
    UNION ALL
    
    SELECT 
      id,
      email,
      'employees' as source_table,
      role,
      tenant_id::text,
      created_at
    FROM employees
    WHERE email IS NOT NULL AND email <> ''
  ),
  duplicates AS (
    SELECT 
      email,
      COUNT(*) as count,
      array_agg(
        source_table || ':' || id::text || ' (' || COALESCE(role, 'no-role') || ', ' || COALESCE(tenant_id, 'no-tenant') || ')'
        ORDER BY created_at DESC
      ) as records
    FROM all_emails
    GROUP BY email
    HAVING COUNT(*) > 1
  )
  SELECT string_agg(
    email || ' (' || count || ' copies): ' || array_to_string(records, ', '),
    E'\n'
  ) INTO duplicate_report
  FROM duplicates;

  IF duplicate_report IS NOT NULL THEN
    RAISE NOTICE E'Duplicate emails found:\n%', duplicate_report;
  ELSE
    RAISE NOTICE 'No duplicate emails found';
  END IF;
END $$;

-- Step 2: Remove duplicate admin@aishacrm.com seed users from employees table
-- These are test/seed accounts that shouldn't exist
DELETE FROM employees 
WHERE LOWER(email) = 'admin@aishacrm.com'
  AND role IN ('Admin', 'SuperAdmin')
RETURNING id, email, role, tenant_id, created_at;

-- Step 3: In users table, keep only the OLDEST admin@aishacrm.com (most likely the real one)
-- Remove newer duplicates
WITH ranked_users AS (
  SELECT 
    id,
    email,
    ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY created_at ASC) as rn
  FROM users
  WHERE LOWER(email) = 'admin@aishacrm.com'
)
DELETE FROM users
WHERE id IN (
  SELECT id FROM ranked_users WHERE rn > 1
)
RETURNING id, email, role, tenant_id, created_at;

-- Step 4: General cleanup - for any other duplicates, keep the oldest record in each table
-- This is a safety net for any other duplicate emails

-- Remove duplicate users (keep oldest per email)
WITH ranked AS (
  SELECT 
    id,
    email,
    ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY created_at ASC, id ASC) as rn
  FROM users
  WHERE email IS NOT NULL AND email <> ''
)
DELETE FROM users
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
RETURNING id, email, 'users' as table, 'removed duplicate';

-- Remove duplicate employees (keep oldest per email)
WITH ranked AS (
  SELECT 
    id,
    email,
    ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY created_at ASC, id ASC) as rn
  FROM employees
  WHERE email IS NOT NULL AND email <> ''
)
DELETE FROM employees
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
RETURNING id, email, 'employees' as table, 'removed duplicate';

-- Step 5: Final verification - show remaining potential cross-table duplicates
SELECT 
  u.email,
  'CROSS-TABLE DUPLICATE' as issue,
  'users: ' || u.id::text || ' (role: ' || u.role || ')' as in_users,
  'employees: ' || e.id::text || ' (tenant: ' || e.tenant_id || ')' as in_employees
FROM users u
INNER JOIN employees e ON LOWER(u.email) = LOWER(e.email)
ORDER BY u.email;

-- Cleanup complete - ready to run 020_enforce_email_uniqueness.sql
