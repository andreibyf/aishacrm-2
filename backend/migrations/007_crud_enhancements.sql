-- Add missing columns for full CRUD support
-- This migration adds fields expected by the frontend entity models

-- Add missing columns to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add missing columns to leads  
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add missing columns to accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add missing columns to opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT now();

-- Create indexes on status fields for better query performance
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(tenant_id, type);

-- Update existing records to have updated_at = created_at
UPDATE contacts SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE leads SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE accounts SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE opportunities SET updated_at = created_at WHERE updated_at IS NULL;
