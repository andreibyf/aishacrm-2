-- Migration: Enforce global email uniqueness across users and employees tables
-- This prevents duplicate accounts with the same email address
-- Note: This is a constraint validation migration, not a schema change

-- Step 1: Check for existing duplicates before enforcing uniqueness
-- This query will show any problematic duplicates that need manual resolution
DO $$
DECLARE
  duplicate_count INTEGER;
  duplicate_emails TEXT;
BEGIN
  -- Find emails that exist in both tables or multiple times in employees
  WITH all_emails AS (
    SELECT email, 'users' as source FROM users
    UNION ALL
    SELECT email, 'employees' as source FROM employees
  ),
  email_counts AS (
    SELECT 
      email,
      COUNT(*) as occurrence_count,
      array_agg(DISTINCT source) as sources
    FROM all_emails
    WHERE email IS NOT NULL AND email <> ''
    GROUP BY email
    HAVING COUNT(*) > 1
  )
  SELECT 
    COUNT(*),
    string_agg(email, ', ')
  INTO duplicate_count, duplicate_emails
  FROM email_counts;

  IF duplicate_count > 0 THEN
    RAISE WARNING 'Found % duplicate email(s): %', duplicate_count, duplicate_emails;
    RAISE NOTICE 'Please resolve duplicate emails before enforcing uniqueness constraint';
    RAISE NOTICE 'Run: SELECT email, COUNT(*) FROM (SELECT email FROM users UNION ALL SELECT email FROM employees) t GROUP BY email HAVING COUNT(*) > 1';
  ELSE
    RAISE NOTICE 'No duplicate emails found - ready to enforce uniqueness';
  END IF;
END $$;

-- Step 2: Create unique indexes on each table (if they don't exist)
-- Case-insensitive uniqueness using LOWER()
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx 
  ON users (LOWER(email));

-- For employees, we want global email uniqueness (not per-tenant)
-- This prevents the same person from having multiple employee accounts across tenants
CREATE UNIQUE INDEX IF NOT EXISTS employees_email_unique_idx 
  ON employees (LOWER(email));

-- Step 3: Add check constraint to prevent empty emails
ALTER TABLE users 
  ADD CONSTRAINT users_email_not_empty 
  CHECK (email IS NOT NULL AND email <> '')
  NOT VALID;

ALTER TABLE employees 
  ADD CONSTRAINT employees_email_not_empty 
  CHECK (email IS NOT NULL AND email <> '')
  NOT VALID;

-- Validate constraints (this checks existing data)
ALTER TABLE users VALIDATE CONSTRAINT users_email_not_empty;
ALTER TABLE employees VALIDATE CONSTRAINT employees_email_not_empty;

-- Step 4: Create a function to prevent cross-table duplicates
-- This trigger function ensures email uniqueness across both tables
CREATE OR REPLACE FUNCTION check_email_uniqueness()
RETURNS TRIGGER AS $$
DECLARE
  existing_in_users INTEGER;
  existing_in_employees INTEGER;
BEGIN
  -- Check if email exists in users table (excluding current record if updating)
  SELECT COUNT(*) INTO existing_in_users
  FROM users 
  WHERE LOWER(email) = LOWER(NEW.email)
    AND (TG_TABLE_NAME <> 'users' OR id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid));

  -- Check if email exists in employees table (excluding current record if updating)
  SELECT COUNT(*) INTO existing_in_employees
  FROM employees 
  WHERE LOWER(email) = LOWER(NEW.email)
    AND (TG_TABLE_NAME <> 'employees' OR id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid));

  IF existing_in_users > 0 OR existing_in_employees > 0 THEN
    RAISE EXCEPTION 'Email % already exists in % table', 
      NEW.email,
      CASE WHEN existing_in_users > 0 THEN 'users' ELSE 'employees' END
    USING ERRCODE = '23505', -- Unique violation error code
          HINT = 'Email addresses must be unique across all users and employees';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create triggers on both tables
DROP TRIGGER IF EXISTS users_email_uniqueness_check ON users;
CREATE TRIGGER users_email_uniqueness_check
  BEFORE INSERT OR UPDATE OF email ON users
  FOR EACH ROW
  EXECUTE FUNCTION check_email_uniqueness();

DROP TRIGGER IF EXISTS employees_email_uniqueness_check ON employees;
CREATE TRIGGER employees_email_uniqueness_check
  BEFORE INSERT OR UPDATE OF email ON employees
  FOR EACH ROW
  EXECUTE FUNCTION check_email_uniqueness();

-- Step 6: Add comment for documentation
COMMENT ON FUNCTION check_email_uniqueness() IS 
  'Enforces global email uniqueness across users and employees tables. Prevents duplicate accounts with the same email address.';

-- Migration complete
-- Test with: INSERT INTO users (email, first_name, role) VALUES ('test@duplicate.com', 'Test', 'admin');
--           INSERT INTO employees (email, first_name, tenant_id, role) VALUES ('test@duplicate.com', 'Test', 'tenant-1', 'employee');
-- Expected: Second insert should fail with unique violation error
