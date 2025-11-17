-- 040_moves_and_views.sql
-- Purpose: Ensure dashboards/reports/calendar can extract required data; preserve relations; and support move semantics with audit trail

-- 1) Audit table to track entity moves (lead -> contact, bizdev_source -> account, contact -> lead)
CREATE TABLE IF NOT EXISTS entity_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  from_table text NOT NULL,
  from_id uuid NOT NULL,
  to_table text NOT NULL,
  to_id uuid NOT NULL,
  action text NOT NULL, -- e.g., 'convert', 'promote'
  performed_by text,    -- user email if available
  performed_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb         -- copy of original row for history
);

CREATE INDEX IF NOT EXISTS idx_entity_transitions_tenant ON entity_transitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_entity_transitions_from ON entity_transitions(from_table, from_id);
CREATE INDEX IF NOT EXISTS idx_entity_transitions_to ON entity_transitions(to_table, to_id);
CREATE INDEX IF NOT EXISTS idx_entity_transitions_time ON entity_transitions(performed_at);

-- 1b) Ensure leads.account_id exists to support linking leads under accounts
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_tenant_account ON leads(tenant_id, account_id);

-- 2) Calendar-friendly view for activities (computes due_at timestamp)
CREATE OR REPLACE VIEW v_calendar_activities AS
SELECT
  a.id,
  a.tenant_id,
  a.type,
  a.subject,
  a.status,
  a.assigned_to,
  a.related_to,
  a.related_id,
  a.due_date,
  a.due_time,
  (
    CASE
      WHEN a.due_date IS NOT NULL AND a.due_time IS NOT NULL AND (a.due_time::text) ~ '^[0-9]{1,2}:[0-9]{2}'
        THEN (a.due_date::timestamp + ((a.due_time::text)::time))
      WHEN a.due_date IS NOT NULL
        THEN (a.due_date::timestamp + time '12:00')
      ELSE NULL
    END
  ) AS due_at,
  a.created_at,
  a.updated_date AS updated_at
FROM activities a;

-- 3) Pipeline/Status rollups for dashboards
CREATE OR REPLACE VIEW v_opportunity_pipeline_by_stage AS
SELECT tenant_id, stage, COUNT(*) AS count
FROM opportunities
GROUP BY tenant_id, stage;

CREATE OR REPLACE VIEW v_lead_counts_by_status AS
SELECT tenant_id, status, COUNT(*) AS count
FROM leads
GROUP BY tenant_id, status;

-- 4) Helpful view to list related people under Accounts (Contacts + Leads)
CREATE OR REPLACE VIEW v_account_related_people AS
SELECT c.tenant_id, c.account_id, c.id AS person_id, 'contact'::text AS person_type,
       c.first_name, c.last_name, c.email, c.phone, c.status, c.created_at
FROM contacts c
UNION ALL
SELECT l.tenant_id, l.account_id, l.id AS person_id, 'lead'::text AS person_type,
       l.first_name, l.last_name, l.email, l.phone, l.status, l.created_at
FROM leads l
WHERE l.account_id IS NOT NULL;

-- 5) Safeguard: indexes to assist reports/relations if not present
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_account ON contacts(tenant_id, account_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_account ON leads(tenant_id, account_id);
CREATE INDEX IF NOT EXISTS idx_activities_tenant_related ON activities(tenant_id, related_to, related_id);
