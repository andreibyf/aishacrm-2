-- 081_complete_field_parity.sql
-- Complete all remaining field gaps between frontend forms and database schema
-- Safe to run repeatedly (guarded with IF NOT EXISTS and conditional updates)

BEGIN;

-- ---------------------------------------------------------------------------
-- Leads - Add assigned_to (FK to employees/users)
-- ---------------------------------------------------------------------------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(tenant_id, assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_is_test_data ON leads(tenant_id, is_test_data) WHERE is_test_data = true;

-- Backfill assigned_to from metadata (UUID format)
UPDATE leads
SET assigned_to = (metadata ->> 'assigned_to')::UUID
WHERE assigned_to IS NULL
  AND metadata ? 'assigned_to'
  AND (metadata ->> 'assigned_to') IS NOT NULL
  AND (metadata ->> 'assigned_to') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Backfill is_test_data from metadata
UPDATE leads
SET is_test_data = CASE
    WHEN lower(metadata ->> 'is_test_data') = 'true' THEN true
    WHEN lower(metadata ->> 'is_test_data') = 'false' THEN false
    ELSE is_test_data
  END
WHERE metadata ? 'is_test_data'
  AND lower(metadata ->> 'is_test_data') IN ('true','false');

-- ---------------------------------------------------------------------------
-- Contacts - Add job_title, department, assigned_to, lead_source, is_test_data
-- ---------------------------------------------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_source TEXT,
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(tenant_id, assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_job_title ON contacts(tenant_id, job_title) WHERE job_title IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_is_test_data ON contacts(tenant_id, is_test_data) WHERE is_test_data = true;

-- Backfill from metadata
UPDATE contacts
SET job_title = COALESCE(job_title, metadata ->> 'job_title')
WHERE metadata ? 'job_title'
  AND (metadata ->> 'job_title') IS NOT NULL
  AND (metadata ->> 'job_title') <> '';

UPDATE contacts
SET department = COALESCE(department, metadata ->> 'department')
WHERE metadata ? 'department'
  AND (metadata ->> 'department') IS NOT NULL
  AND (metadata ->> 'department') <> '';

UPDATE contacts
SET lead_source = COALESCE(lead_source, metadata ->> 'lead_source')
WHERE metadata ? 'lead_source'
  AND (metadata ->> 'lead_source') IS NOT NULL
  AND (metadata ->> 'lead_source') <> '';

UPDATE contacts
SET assigned_to = (metadata ->> 'assigned_to')::UUID
WHERE assigned_to IS NULL
  AND metadata ? 'assigned_to'
  AND (metadata ->> 'assigned_to') IS NOT NULL
  AND (metadata ->> 'assigned_to') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE contacts
SET is_test_data = CASE
    WHEN lower(metadata ->> 'is_test_data') = 'true' THEN true
    WHEN lower(metadata ->> 'is_test_data') = 'false' THEN false
    ELSE is_test_data
  END
WHERE metadata ? 'is_test_data'
  AND lower(metadata ->> 'is_test_data') IN ('true','false');

-- ---------------------------------------------------------------------------
-- Accounts - Add assigned_to, tags, notes, is_test_data
-- ---------------------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_accounts_assigned_to ON accounts(tenant_id, assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_is_test_data ON accounts(tenant_id, is_test_data) WHERE is_test_data = true;

-- Backfill from metadata
UPDATE accounts
SET assigned_to = (metadata ->> 'assigned_to')::UUID
WHERE assigned_to IS NULL
  AND metadata ? 'assigned_to'
  AND (metadata ->> 'assigned_to') IS NOT NULL
  AND (metadata ->> 'assigned_to') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE accounts
SET notes = COALESCE(notes, metadata ->> 'notes')
WHERE metadata ? 'notes'
  AND (metadata ->> 'notes') IS NOT NULL
  AND (metadata ->> 'notes') <> '';

UPDATE accounts
SET is_test_data = CASE
    WHEN lower(metadata ->> 'is_test_data') = 'true' THEN true
    WHEN lower(metadata ->> 'is_test_data') = 'false' THEN false
    ELSE is_test_data
  END
WHERE metadata ? 'is_test_data'
  AND lower(metadata ->> 'is_test_data') IN ('true','false');

-- ---------------------------------------------------------------------------
-- Opportunities - Add assigned_to, source, notes, tags, is_test_data
-- ---------------------------------------------------------------------------
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to ON opportunities(tenant_id, assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_source ON opportunities(tenant_id, source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_is_test_data ON opportunities(tenant_id, is_test_data) WHERE is_test_data = true;

-- Backfill from metadata
UPDATE opportunities
SET assigned_to = (metadata ->> 'assigned_to')::UUID
WHERE assigned_to IS NULL
  AND metadata ? 'assigned_to'
  AND (metadata ->> 'assigned_to') IS NOT NULL
  AND (metadata ->> 'assigned_to') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE opportunities
SET source = COALESCE(source, metadata ->> 'source')
WHERE metadata ? 'source'
  AND (metadata ->> 'source') IS NOT NULL
  AND (metadata ->> 'source') <> '';

UPDATE opportunities
SET notes = COALESCE(notes, metadata ->> 'notes')
WHERE metadata ? 'notes'
  AND (metadata ->> 'notes') IS NOT NULL
  AND (metadata ->> 'notes') <> '';

UPDATE opportunities
SET is_test_data = CASE
    WHEN lower(metadata ->> 'is_test_data') = 'true' THEN true
    WHEN lower(metadata ->> 'is_test_data') = 'false' THEN false
    ELSE is_test_data
  END
WHERE metadata ? 'is_test_data'
  AND lower(metadata ->> 'is_test_data') IN ('true','false');

-- ---------------------------------------------------------------------------
-- Activities - Add assigned_to, is_test_data, updated_at
-- ---------------------------------------------------------------------------
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON activities(tenant_id, assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_is_test_data ON activities(tenant_id, is_test_data) WHERE is_test_data = true;

-- Set updated_at trigger for activities if not exists
CREATE OR REPLACE FUNCTION update_activities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activities_updated_at_trigger ON activities;
CREATE TRIGGER activities_updated_at_trigger
  BEFORE UPDATE ON activities
  FOR EACH ROW
  EXECUTE FUNCTION update_activities_updated_at();

-- Backfill from metadata
UPDATE activities
SET assigned_to = (metadata ->> 'assigned_to')::UUID
WHERE assigned_to IS NULL
  AND metadata ? 'assigned_to'
  AND (metadata ->> 'assigned_to') IS NOT NULL
  AND (metadata ->> 'assigned_to') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE activities
SET is_test_data = CASE
    WHEN lower(metadata ->> 'is_test_data') = 'true' THEN true
    WHEN lower(metadata ->> 'is_test_data') = 'false' THEN false
    ELSE is_test_data
  END
WHERE metadata ? 'is_test_data'
  AND lower(metadata ->> 'is_test_data') IN ('true','false');

-- ---------------------------------------------------------------------------
-- Employees - Add is_test_data (employees have most fields already)
-- ---------------------------------------------------------------------------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_employees_is_test_data ON employees(tenant_id, is_test_data) WHERE is_test_data = true;

UPDATE employees
SET is_test_data = CASE
    WHEN lower(metadata ->> 'is_test_data') = 'true' THEN true
    WHEN lower(metadata ->> 'is_test_data') = 'false' THEN false
    ELSE is_test_data
  END
WHERE metadata ? 'is_test_data'
  AND lower(metadata ->> 'is_test_data') IN ('true','false');

-- ---------------------------------------------------------------------------
-- Cleanup: Remove migrated fields from metadata JSONB to avoid drift
-- ---------------------------------------------------------------------------
UPDATE leads
SET metadata = metadata 
  - 'assigned_to' - 'is_test_data'
WHERE metadata ?| ARRAY['assigned_to','is_test_data'];

UPDATE contacts
SET metadata = metadata 
  - 'job_title' - 'department' - 'assigned_to' - 'lead_source' - 'is_test_data'
WHERE metadata ?| ARRAY['job_title','department','assigned_to','lead_source','is_test_data'];

UPDATE accounts
SET metadata = metadata 
  - 'assigned_to' - 'notes' - 'is_test_data'
WHERE metadata ?| ARRAY['assigned_to','notes','is_test_data'];

UPDATE opportunities
SET metadata = metadata 
  - 'assigned_to' - 'source' - 'notes' - 'is_test_data'
WHERE metadata ?| ARRAY['assigned_to','source','notes','is_test_data'];

UPDATE activities
SET metadata = metadata 
  - 'assigned_to' - 'is_test_data'
WHERE metadata ?| ARRAY['assigned_to','is_test_data'];

UPDATE employees
SET metadata = metadata 
  - 'is_test_data'
WHERE metadata ? 'is_test_data';

COMMIT;
