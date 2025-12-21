-- ============================================================
-- Add Foreign Key Constraints for V2 API Denormalized Fields
-- ============================================================
-- This migration adds FK constraints to enable automatic 
-- denormalized field joins in V2 API routes
--
-- IMPORTANT NOTES:
-- 1. This must be run via Supabase SQL Editor (not psql)
-- 2. All database access uses Supabase API (backend/lib/supabase-db.js)
-- 3. Constraints enable automatic PostgREST joins for fields like:
--    - assigned_to_name (from employees table)
--    - account_name (from accounts table)
--    - contact_name (from contacts table)
--
-- Run this file:
-- - Via Supabase Dashboard → SQL Editor → Run
-- - Or: node backend/apply-migration-fk-constraints.js
-- ============================================================

-- ============================================================
-- LEADS TABLE - assigned_to foreign key
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
ALTER TABLE leads 
ADD CONSTRAINT leads_assigned_to_fkey 
FOREIGN KEY (assigned_to) REFERENCES employees(id) 
ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);

-- ============================================================
-- CONTACTS TABLE - assigned_to foreign key
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_assigned_to_fkey;
ALTER TABLE contacts 
ADD CONSTRAINT contacts_assigned_to_fkey 
FOREIGN KEY (assigned_to) REFERENCES employees(id) 
ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(assigned_to);

-- ============================================================
-- CONTACTS TABLE - account_id foreign key
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS account_id UUID;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_account_id_fkey;
ALTER TABLE contacts 
ADD CONSTRAINT contacts_account_id_fkey 
FOREIGN KEY (account_id) REFERENCES accounts(id) 
ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id);

-- ============================================================
-- OPPORTUNITIES TABLE - assigned_to foreign key
-- ============================================================
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_assigned_to_fkey;
ALTER TABLE opportunities 
ADD CONSTRAINT opportunities_assigned_to_fkey 
FOREIGN KEY (assigned_to) REFERENCES employees(id) 
ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to ON opportunities(assigned_to);

-- ============================================================
-- OPPORTUNITIES TABLE - account_id foreign key
-- ============================================================
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS account_id UUID;
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_account_id_fkey;
ALTER TABLE opportunities 
ADD CONSTRAINT opportunities_account_id_fkey 
FOREIGN KEY (account_id) REFERENCES accounts(id) 
ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities(account_id);

-- ============================================================
-- OPPORTUNITIES TABLE - contact_id foreign key
-- ============================================================
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_contact_id_fkey;
ALTER TABLE opportunities 
ADD CONSTRAINT opportunities_contact_id_fkey 
FOREIGN KEY (contact_id) REFERENCES contacts(id) 
ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_contact_id ON opportunities(contact_id);

-- ============================================================
-- ACTIVITIES TABLE - assigned_to foreign key
-- ============================================================
ALTER TABLE activities ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_assigned_to_fkey;
ALTER TABLE activities 
ADD CONSTRAINT activities_assigned_to_fkey 
FOREIGN KEY (assigned_to) REFERENCES employees(id) 
ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON activities(assigned_to);

-- ============================================================
-- ACCOUNTS TABLE - assigned_to foreign key
-- ============================================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_assigned_to_fkey;
ALTER TABLE accounts 
ADD CONSTRAINT accounts_assigned_to_fkey 
FOREIGN KEY (assigned_to) REFERENCES employees(id) 
ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_assigned_to ON accounts(assigned_to);

-- ============================================================
-- Summary of Foreign Key Constraints
-- ============================================================
-- leads.assigned_to → employees.id
-- contacts.assigned_to → employees.id
-- contacts.account_id → accounts.id
-- opportunities.assigned_to → employees.id
-- opportunities.account_id → accounts.id
-- opportunities.contact_id → contacts.id
-- activities.assigned_to → employees.id
-- accounts.assigned_to → employees.id
-- ============================================================
