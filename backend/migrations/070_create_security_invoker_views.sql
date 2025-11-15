-- Migration: Create SECURITY INVOKER view variants
-- Rationale: Allow views to respect caller's RLS policies instead of view definer's permissions
-- This creates _invoker suffixed versions for testing before replacing originals

-- v_lead_counts_by_status_invoker
-- Aggregates lead counts by tenant and status
CREATE OR REPLACE VIEW public.v_lead_counts_by_status_invoker 
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  status,
  count(*) AS count
FROM leads
GROUP BY tenant_id, status;

-- v_account_related_people_invoker
-- Combines contacts and leads associated with accounts
CREATE OR REPLACE VIEW public.v_account_related_people_invoker 
WITH (security_invoker = true) AS
SELECT 
  c.tenant_id,
  c.account_id,
  c.id AS person_id,
  'contact'::text AS person_type,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.status,
  c.created_at
FROM contacts c
UNION ALL
SELECT 
  l.tenant_id,
  l.account_id,
  l.id AS person_id,
  'lead'::text AS person_type,
  l.first_name,
  l.last_name,
  l.email,
  l.phone,
  l.status,
  l.created_at
FROM leads l
WHERE l.account_id IS NOT NULL;

-- v_calendar_activities_invoker
-- Flattens activity data for calendar views with computed due_at timestamps
CREATE OR REPLACE VIEW public.v_calendar_activities_invoker 
WITH (security_invoker = true) AS
SELECT 
  id,
  tenant_id,
  type,
  subject,
  status,
  COALESCE(assigned_to, (metadata ->> 'assigned_to'::text)) AS assigned_to,
  COALESCE(related_to, (metadata ->> 'related_to'::text)) AS related_to,
  related_id,
  COALESCE(due_date, to_date((metadata ->> 'due_date'::text), 'YYYY-MM-DD'::text)) AS due_date,
  CASE
    WHEN (COALESCE((due_time)::text, (metadata ->> 'due_time'::text)) ~ '^[0-9]{1,2}:[0-9]{2}'::text) 
    THEN (COALESCE((due_time)::text, (metadata ->> 'due_time'::text)))::time without time zone
    ELSE NULL::time without time zone
  END AS due_time,
  CASE
    WHEN ((COALESCE(due_date, to_date((metadata ->> 'due_date'::text), 'YYYY-MM-DD'::text)) IS NOT NULL) 
          AND (COALESCE((due_time)::text, (metadata ->> 'due_time'::text)) ~ '^[0-9]{1,2}:[0-9]{2}'::text)) 
    THEN ((COALESCE(due_date, to_date((metadata ->> 'due_date'::text), 'YYYY-MM-DD'::text)))::timestamp without time zone 
          + ((COALESCE((due_time)::text, (metadata ->> 'due_time'::text)))::time without time zone)::interval)
    WHEN (COALESCE(due_date, to_date((metadata ->> 'due_date'::text), 'YYYY-MM-DD'::text)) IS NOT NULL) 
    THEN ((COALESCE(due_date, to_date((metadata ->> 'due_date'::text), 'YYYY-MM-DD'::text)))::timestamp without time zone 
          + ('12:00:00'::time without time zone)::interval)
    ELSE NULL::timestamp without time zone
  END AS due_at,
  created_at,
  updated_date AS updated_at
FROM activities a;

-- v_opportunity_pipeline_by_stage_invoker
-- Aggregates opportunity counts by tenant and stage
CREATE OR REPLACE VIEW public.v_opportunity_pipeline_by_stage_invoker 
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  stage,
  count(*) AS count
FROM opportunities
GROUP BY tenant_id, stage;

-- Verification queries (commented out - uncomment to test)
/*
-- Test that invoker views return same data as originals when using same role
SELECT 'v_lead_counts_by_status' as view, count(*) as definer_count FROM v_lead_counts_by_status
UNION ALL
SELECT 'v_lead_counts_by_status_invoker', count(*) FROM v_lead_counts_by_status_invoker;

SELECT 'v_account_related_people' as view, count(*) as definer_count FROM v_account_related_people
UNION ALL
SELECT 'v_account_related_people_invoker', count(*) FROM v_account_related_people_invoker;

SELECT 'v_calendar_activities' as view, count(*) as definer_count FROM v_calendar_activities
UNION ALL
SELECT 'v_calendar_activities_invoker', count(*) FROM v_calendar_activities_invoker;

SELECT 'v_opportunity_pipeline_by_stage' as view, count(*) as definer_count FROM v_opportunity_pipeline_by_stage
UNION ALL
SELECT 'v_opportunity_pipeline_by_stage_invoker', count(*) FROM v_opportunity_pipeline_by_stage_invoker;
*/
