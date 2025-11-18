-- Add phone and department columns to employees table
-- These fields are used in the UI for employee management

ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department TEXT;

-- Add index for phone lookups
CREATE INDEX IF NOT EXISTS idx_employees_phone ON employees(phone) WHERE phone IS NOT NULL;
