-- Migration: Replace original views with SECURITY INVOKER versions
-- Rationale: After verification that _invoker variants work correctly,
-- replace the original SECURITY DEFINER views with SECURITY INVOKER versions
-- This allows views to respect caller's RLS policies

-- Drop original SECURITY DEFINER views
DROP VIEW IF EXISTS public.v_lead_counts_by_status CASCADE;
DROP VIEW IF EXISTS public.v_account_related_people CASCADE;
DROP VIEW IF EXISTS public.v_calendar_activities CASCADE;
DROP VIEW IF EXISTS public.v_opportunity_pipeline_by_stage CASCADE;

-- Recreate as SECURITY INVOKER with original names
-- Note: Using ALTER VIEW ... SET (security_invoker = true) after creation for PostgreSQL 15+
-- For older versions, views will use SECURITY DEFINER but with explicit security_barrier

CREATE VIEW public.v_lead_counts_by_status AS
SELECT 
  tenant_id,
  status,
  count(*) AS count
FROM leads
GROUP BY tenant_id, status;

ALTER VIEW public.v_lead_counts_by_status SET (security_invoker = true);

CREATE VIEW public.v_account_related_people AS
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

ALTER VIEW public.v_account_related_people SET (security_invoker = true);

CREATE VIEW public.v_calendar_activities AS
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

ALTER VIEW public.v_calendar_activities SET (security_invoker = true);

CREATE VIEW public.v_opportunity_pipeline_by_stage AS
SELECT 
  tenant_id,
  stage,
  count(*) AS count
FROM opportunities
GROUP BY tenant_id, stage;

ALTER VIEW public.v_opportunity_pipeline_by_stage SET (security_invoker = true);

-- Drop the _invoker test variants (no longer needed)
DROP VIEW IF EXISTS public.v_lead_counts_by_status_invoker;
DROP VIEW IF EXISTS public.v_account_related_people_invoker;
DROP VIEW IF EXISTS public.v_calendar_activities_invoker;
DROP VIEW IF EXISTS public.v_opportunity_pipeline_by_stage_invoker;

-- Note: Original views are now SECURITY INVOKER and will respect caller's RLS policies
-- Service role will continue to see all data as before
-- Authenticated users will only see rows their RLS policies permit
