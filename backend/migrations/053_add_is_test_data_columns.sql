-- Add is_test_data columns to core entities
-- Records default to false (real data); test records must be explicitly marked

ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

ALTER TABLE opportunities 
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

ALTER TABLE activities 
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

-- Add indexes for filtering performance
CREATE INDEX IF NOT EXISTS idx_leads_is_test_data ON leads(is_test_data);
CREATE INDEX IF NOT EXISTS idx_contacts_is_test_data ON contacts(is_test_data);
CREATE INDEX IF NOT EXISTS idx_accounts_is_test_data ON accounts(is_test_data);
CREATE INDEX IF NOT EXISTS idx_opportunities_is_test_data ON opportunities(is_test_data);
CREATE INDEX IF NOT EXISTS idx_activities_is_test_data ON activities(is_test_data);

COMMENT ON COLUMN leads.is_test_data IS 'Flag to mark test/demo data; false = real data (default)';
COMMENT ON COLUMN contacts.is_test_data IS 'Flag to mark test/demo data; false = real data (default)';
COMMENT ON COLUMN accounts.is_test_data IS 'Flag to mark test/demo data; false = real data (default)';
COMMENT ON COLUMN opportunities.is_test_data IS 'Flag to mark test/demo data; false = real data (default)';
COMMENT ON COLUMN activities.is_test_data IS 'Flag to mark test/demo data; false = real data (default)';
