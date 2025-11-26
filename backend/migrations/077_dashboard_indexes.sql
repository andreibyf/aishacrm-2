-- Dashboard performance indexes
-- Composite and partial indexes to speed up counts and recent lists

-- Leads: tenant + status (for open/closed counts)
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, status);
-- Leads: tenant + created_date (for last-30-days counts)
CREATE INDEX IF NOT EXISTS idx_leads_tenant_created_date ON leads(tenant_id, created_date);

-- Opportunities: tenant + stage (for won/open counts)
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_stage ON opportunities(tenant_id, stage);
-- Opportunities: partial index for won stage lookups
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_stage_won ON opportunities(tenant_id) WHERE stage IN ('won','closed_won');
-- Opportunities: tenant + updated_at (for recent lists)
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_updated_at ON opportunities(tenant_id, updated_at DESC);

-- Activities: tenant + created_date (for last-30-days counts)
CREATE INDEX IF NOT EXISTS idx_activities_tenant_created_date ON activities(tenant_id, created_date);
-- Activities: tenant + created_at (for recent lists)
CREATE INDEX IF NOT EXISTS idx_activities_tenant_created_at ON activities(tenant_id, created_at DESC);

-- Contacts: tenant only (general filtering)
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
-- Accounts: tenant only (general filtering)
CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id);
