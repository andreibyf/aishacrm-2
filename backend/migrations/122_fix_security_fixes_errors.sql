-- Migration 122: Fix SQL Errors from Migration 121
-- Date: 2026-02-04
-- Description: Corrects 5 SQL syntax/type errors that occurred during migration 121 execution
--
-- Fixes:
-- 1. Line 75: trim(both ' ' FROM ...) -> btrim(...)
-- 2. Line 311: coalesce type mismatch in recompute_open_opportunities
-- 3. Line 341: pg_catalog FROM-clause issue in recompute_recent_documents
-- 4. Line 627: extract(EPOCH FROM ...) syntax in update_phase3_suggestion_telemetry
-- 5. Lines 743, 760, 777: Parameter name conflicts - need DROP then CREATE
--
-- Safety: Idempotent (uses CREATE OR REPLACE / DROP IF EXISTS)
-- Execution: psql or Node.js runner
-- Dependencies: Migration 121 must be applied first

-- ============================================================
-- FIX 1: employee_full_name - Replace trim(both ' ' FROM ...) with btrim()
-- Also fix parameter name conflict - need DROP first
-- ============================================================

DROP FUNCTION IF EXISTS public.employee_full_name(public.employees);

CREATE OR REPLACE FUNCTION public.employee_full_name(emp_record public.employees)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $function$
  SELECT btrim(coalesce(emp_record.first_name, ''::text) || ' ' || coalesce(emp_record.last_name, ''::text));
$function$;

-- ============================================================
-- FIX 2: recompute_open_opportunities - Fix coalesce type mismatch
-- ============================================================
-- Original had: coalesce(integer, integer) which PostgreSQL couldn't resolve
-- Solution: Cast to bigint explicitly

CREATE OR REPLACE FUNCTION public.recompute_open_opportunities(p_person_id uuid, p_person_type text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  UPDATE public.person_profile pp
  SET open_opportunity_count = pg_catalog.coalesce(sub.cnt::bigint, 0::bigint)
  FROM (
    SELECT pg_catalog.count(*)::bigint AS cnt
    FROM public.opportunities o
    WHERE (
      (p_person_type = 'contact' AND o.contact_id = p_person_id) OR
      (p_person_type = 'lead' AND o.lead_id = p_person_id)
    )
    AND (o.stage IS DISTINCT FROM 'closed')
  ) sub
  WHERE pp.person_id = p_person_id;
END;
$function$;

-- ============================================================
-- FIX 3: recompute_recent_documents - Fix pg_catalog table reference
-- ============================================================
-- Original used pg_catalog in FROM clause, should use public schema

CREATE OR REPLACE FUNCTION public.recompute_recent_documents(p_person_id uuid, p_person_type text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  UPDATE public.person_profile pp
  SET recent_documents = pg_catalog.coalesce(sub.docs, '[]'::jsonb)
  FROM (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'created_at', d.created_at
      )
      ORDER BY d.created_at DESC
    ) AS docs
    FROM (
      SELECT d.id, d.name, d.created_at
      FROM public.documents d
      WHERE d.related_type = p_person_type
        AND d.related_id = p_person_id
      ORDER BY d.created_at DESC
      LIMIT 10
    ) d
  ) sub
  WHERE pp.person_id = p_person_id;
END;
$function$;

-- ============================================================
-- FIX 4: update_phase3_suggestion_telemetry - Fix extract() syntax
-- ============================================================
-- Original had: extract(EPOCH FROM timestamp) which failed
-- Solution: Use EXTRACT(EPOCH FROM expression) with proper function call

CREATE OR REPLACE FUNCTION public.update_phase3_suggestion_telemetry(
  p_suggestion_id uuid,
  p_action text,
  p_outcome text,
  p_review_time_seconds integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.phase3_suggestion_telemetry (
    suggestion_id,
    action,
    outcome,
    review_time_seconds,
    created_at
  )
  VALUES (
    p_suggestion_id,
    p_action,
    p_outcome,
    p_review_time_seconds,
    pg_catalog.now()
  )
  ON CONFLICT (suggestion_id) DO UPDATE
    SET
      action = EXCLUDED.action,
      outcome = EXCLUDED.outcome,
      review_time_seconds = pg_catalog.coalesce(EXCLUDED.review_time_seconds, phase3_suggestion_telemetry.review_time_seconds),
      total_reviews = phase3_suggestion_telemetry.total_reviews + 1,
      accepted_count = phase3_suggestion_telemetry.accepted_count + 
        CASE WHEN EXCLUDED.outcome = 'accepted' THEN 1 ELSE 0 END,
      rejected_count = phase3_suggestion_telemetry.rejected_count + 
        CASE WHEN EXCLUDED.outcome = 'rejected' THEN 1 ELSE 0 END,
      modified_count = phase3_suggestion_telemetry.modified_count + 
        CASE WHEN EXCLUDED.outcome = 'modified' THEN 1 ELSE 0 END,
      positive_outcomes = phase3_suggestion_telemetry.positive_outcomes + 
        CASE WHEN EXCLUDED.outcome IN ('accepted', 'modified') THEN 1 ELSE 0 END,
      negative_outcomes = phase3_suggestion_telemetry.negative_outcomes + 
        CASE WHEN EXCLUDED.outcome = 'rejected' THEN 1 ELSE 0 END,
      avg_review_time_minutes = (
        CASE 
          WHEN EXCLUDED.review_time_seconds IS NOT NULL THEN
            (phase3_suggestion_telemetry.avg_review_time_minutes * phase3_suggestion_telemetry.total_reviews + 
             EXCLUDED.review_time_seconds::numeric / 60.0) / (phase3_suggestion_telemetry.total_reviews + 1)
          ELSE phase3_suggestion_telemetry.avg_review_time_minutes
        END
      ),
      updated_at = pg_catalog.now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ============================================================
-- FIX 5: Refresh Functions - Parameter name conflicts
-- Lines 743, 760, 777 had parameter name changes that conflict
-- Solution: DROP then CREATE to avoid "cannot change name of input parameter" error
-- ============================================================

-- Drop existing functions first to avoid parameter name conflicts
DROP FUNCTION IF EXISTS public.refresh_assigned_to_on_accounts(uuid);
DROP FUNCTION IF EXISTS public.refresh_assigned_to_on_activities(uuid);
DROP FUNCTION IF EXISTS public.refresh_assigned_to_on_client_requirement(uuid);

-- Recreate: refresh_assigned_to_on_accounts
CREATE OR REPLACE FUNCTION public.refresh_assigned_to_on_accounts(emp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  UPDATE public.accounts acc
  SET assigned_to = public.employee_full_name(e)
  FROM public.employees e
  WHERE acc.assigned_to_employee_id = emp_id
    AND e.id = emp_id
    AND pg_catalog.coalesce(acc.assigned_to, '') IS DISTINCT FROM public.employee_full_name(e);
END;
$function$;

-- Recreate: refresh_assigned_to_on_activities
CREATE OR REPLACE FUNCTION public.refresh_assigned_to_on_activities(emp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  UPDATE public.activities a
  SET assigned_to = public.employee_full_name(e)
  FROM public.employees e
  WHERE a.assigned_to_employee_id = emp_id
    AND e.id = emp_id
    AND pg_catalog.coalesce(a.assigned_to, '') IS DISTINCT FROM public.employee_full_name(e);
END;
$function$;

-- Recreate: refresh_assigned_to_on_client_requirement
CREATE OR REPLACE FUNCTION public.refresh_assigned_to_on_client_requirement(emp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  UPDATE public.client_requirement cr
  SET assigned_to = public.employee_full_name(e)
  FROM public.employees e
  WHERE cr.assigned_to_employee_id = emp_id
    AND e.id = emp_id
    AND pg_catalog.coalesce(cr.assigned_to, '') IS DISTINCT FROM public.employee_full_name(e);
END;
$function$;

-- ============================================================
-- Verification Query
-- ============================================================
-- Run this to verify all 6 functions now have SET search_path:
--
-- SELECT 
--   p.proname AS function_name,
--   pg_get_function_identity_arguments(p.oid) AS arguments,
--   pg_get_functiondef(p.oid) LIKE '%SET search_path%' AS has_search_path,
--   CASE 
--     WHEN pg_get_functiondef(p.oid) LIKE '%SET search_path%' 
--     THEN regexp_replace(
--       substring(pg_get_functiondef(p.oid) FROM 'SET search_path[^\n]+'),
--       '^\s+', ''
--     )
--     ELSE 'NOT SET'
--   END AS search_path_value
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'employee_full_name',
--     'recompute_open_opportunities', 
--     'recompute_recent_documents',
--     'update_phase3_suggestion_telemetry',
--     'refresh_assigned_to_on_accounts',
--     'refresh_assigned_to_on_activities',
--     'refresh_assigned_to_on_client_requirement'
--   )
-- ORDER BY p.proname;
--
-- Expected: All functions should show has_search_path = true
-- Expected: search_path_value should be 'SET search_path = public, pg_catalog'
