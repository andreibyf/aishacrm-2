-- Add created_date columns as aliases/copies of created_at
-- The frontend expects 'created_date' but we created tables with 'created_at'

-- For accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
UPDATE accounts SET created_date = created_at WHERE created_date IS NULL;

-- For contacts  
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
UPDATE contacts SET created_date = created_at WHERE created_date IS NULL;

-- For leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
UPDATE leads SET created_date = created_at WHERE created_date IS NULL;

-- For activities
ALTER TABLE activities ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
UPDATE activities SET created_date = created_at WHERE created_date IS NULL;

-- For opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
UPDATE opportunities SET created_date = created_at WHERE created_date IS NULL;

-- For employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
UPDATE employees SET created_date = created_at WHERE created_date IS NULL;

-- For notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
UPDATE notifications SET created_date = created_at WHERE created_date IS NULL;

-- Add triggers to keep created_date in sync with created_at
CREATE OR REPLACE FUNCTION sync_created_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_date = NEW.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables
DROP TRIGGER IF EXISTS sync_accounts_created_date ON accounts;
CREATE TRIGGER sync_accounts_created_date
  BEFORE INSERT OR UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION sync_created_date();

DROP TRIGGER IF EXISTS sync_contacts_created_date ON contacts;
CREATE TRIGGER sync_contacts_created_date
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION sync_created_date();

DROP TRIGGER IF EXISTS sync_leads_created_date ON leads;
CREATE TRIGGER sync_leads_created_date
  BEFORE INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_created_date();

DROP TRIGGER IF EXISTS sync_activities_created_date ON activities;
CREATE TRIGGER sync_activities_created_date
  BEFORE INSERT OR UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION sync_created_date();

DROP TRIGGER IF EXISTS sync_opportunities_created_date ON opportunities;
CREATE TRIGGER sync_opportunities_created_date
  BEFORE INSERT OR UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION sync_created_date();

DROP TRIGGER IF EXISTS sync_employees_created_date ON employees;
CREATE TRIGGER sync_employees_created_date
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION sync_created_date();

DROP TRIGGER IF EXISTS sync_notifications_created_date ON notifications;
CREATE TRIGGER sync_notifications_created_date
  BEFORE INSERT OR UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION sync_created_date();
