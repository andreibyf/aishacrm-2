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
-- Flatten contacts table: move commonly used fields from metadata to direct columns

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_contacts_title ON contacts(title) WHERE title IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_department ON contacts(department) WHERE department IS NOT NULL;
-- Flatten leads table: move commonly used fields from metadata to direct columns

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source) WHERE source IS NOT NULL;
-- Flatten opportunities table: move commonly used fields from metadata to direct columns

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS expected_revenue DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS next_step TEXT;
-- Flatten activities table: move commonly used fields from metadata to direct columns

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_activities_due_date ON activities(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_priority ON activities(priority) WHERE priority IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON activities(assigned_to) WHERE assigned_to IS NOT NULL;
