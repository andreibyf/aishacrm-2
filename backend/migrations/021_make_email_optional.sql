-- Migration: Make email optional for employees
-- Purpose: Allow employees without email addresses (e.g., field workers)
-- Email is only required when has_crm_access is enabled

-- Drop the NOT NULL and not-empty constraints on email
ALTER TABLE employees 
  DROP CONSTRAINT IF EXISTS employees_email_not_empty;

ALTER TABLE users 
  DROP CONSTRAINT IF EXISTS users_email_not_empty;

-- Update the uniqueness check function to handle NULL emails
CREATE OR REPLACE FUNCTION check_email_uniqueness()
RETURNS TRIGGER AS $$
DECLARE
  existing_in_users INTEGER;
  existing_in_employees INTEGER;
BEGIN
  -- Skip check if email is NULL or empty (allow multiple NULL emails)
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  -- Check if email exists in users table (excluding current record if updating)
  SELECT COUNT(*) INTO existing_in_users
  FROM users 
  WHERE LOWER(email) = LOWER(NEW.email)
    AND email IS NOT NULL 
    AND email <> ''
    AND (TG_TABLE_NAME <> 'users' OR id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid));

  -- Check if email exists in employees table (excluding current record if updating)
  SELECT COUNT(*) INTO existing_in_employees
  FROM employees 
  WHERE LOWER(email) = LOWER(NEW.email)
    AND email IS NOT NULL 
    AND email <> ''
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

-- Update the unique indexes to be partial (only enforce uniqueness on non-null emails)
DROP INDEX IF EXISTS users_email_unique_idx;
CREATE UNIQUE INDEX users_email_unique_idx 
  ON users (LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

DROP INDEX IF EXISTS employees_email_unique_idx;
CREATE UNIQUE INDEX employees_email_unique_idx 
  ON employees (LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

-- Add comment for documentation
COMMENT ON FUNCTION check_email_uniqueness() IS 
  'Enforces global email uniqueness across users and employees tables for non-null emails. Allows multiple NULL/empty emails (e.g., field workers without email addresses).';

-- Migration complete
-- Test cases:
-- 1. INSERT employees without email: Should succeed
--    INSERT INTO employees (first_name, last_name, tenant_id) VALUES ('John', 'Doe', 'tenant-1');
-- 2. INSERT employees with same NULL email: Should succeed
--    INSERT INTO employees (first_name, last_name, tenant_id, email) VALUES ('Jane', 'Smith', 'tenant-1', NULL);
-- 3. INSERT duplicate non-null email: Should fail
--    INSERT INTO employees (first_name, last_name, tenant_id, email) VALUES ('Bob', 'Jones', 'tenant-1', 'duplicate@test.com');
--    INSERT INTO employees (first_name, last_name, tenant_id, email) VALUES ('Alice', 'Brown', 'tenant-1', 'duplicate@test.com');
