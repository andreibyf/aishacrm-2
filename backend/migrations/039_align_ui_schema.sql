-- Align core tables with UI usage by promoting structured fields out of metadata
-- Idempotent: guarded with IF NOT EXISTS; safe on repeated runs

-- 1) Accounts: add direct fields and assignment
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_assigned_to ON accounts(tenant_id, assigned_to);

-- 2) Contacts: add job_title and assignment
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(tenant_id, assigned_to);

-- 3) Leads: add assignment
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_to TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(tenant_id, assigned_to);

-- 4) Opportunities: add description and assignment
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to TEXT;

CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to ON opportunities(tenant_id, assigned_to);

-- Note: activities table was extended in 012_extend_activities_fields.sql
--       and already includes assigned_to and helpful indexes.
