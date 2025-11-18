-- Flatten accounts table: move commonly used fields from metadata to direct columns
-- This enables direct SQL queries, indexes, and better performance

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS annual_revenue DECIMAL(15,2),
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
