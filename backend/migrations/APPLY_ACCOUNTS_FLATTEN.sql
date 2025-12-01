-- Combined migration to flatten accounts table for dev database
-- Run this in Supabase SQL Editor

-- Part 1: Add core structured fields (excluding annual_revenue which already exists, and description which is unstructured)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS employee_count INTEGER,
  ADD COLUMN IF NOT EXISTS street TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS zip TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_accounts_phone ON accounts(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_city ON accounts(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_state ON accounts(state) WHERE state IS NOT NULL;

-- Part 2: Add assigned_to column
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS assigned_to TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_assigned_to ON accounts(tenant_id, assigned_to);

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'accounts'
  AND column_name IN ('phone', 'email', 'assigned_to', 'city', 'state', 'employee_count', 'street', 'zip', 'country')
ORDER BY column_name;
