-- Migration 144: Fix employees_cascade_name_update trigger chain
-- Date: 2026-02-25
--
-- Problem: Updating employee first_name/last_name fails with:
--   "function pg_catalog.coalesce(uuid, unknown) does not exist"
--
-- Root Cause: Migration 121 rewrote refresh_assigned_to_on_* functions with
--   SET search_path = public, pg_catalog
-- This causes COALESCE (a SQL keyword) to resolve as pg_catalog.coalesce()
-- (a function) which has strict type matching. Untyped string literals like ''
-- remain as 'unknown' type and cannot implicitly cast to uuid/text in the
-- function form.
--
-- Additional issue: refresh_assigned_to_on_accounts references
-- acc.assigned_to_employee_id which does not exist on the accounts table.
--
-- Fix: Recreate functions without pg_catalog in search_path, use explicit
-- type casts, and guard against missing columns.

-- ============================================================
-- 1. Fix employee_full_name - remove pg_catalog resolution
-- ============================================================
DROP FUNCTION IF EXISTS public.employee_full_name(public.employees);

CREATE OR REPLACE FUNCTION public.employee_full_name(emp_record public.employees)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT btrim(COALESCE(emp_record.first_name, ''::text) || ' ' || COALESCE(emp_record.last_name, ''::text));
$function$;

-- ============================================================
-- 2. Fix refresh_assigned_to_on_activities
-- ============================================================
DROP FUNCTION IF EXISTS public.refresh_assigned_to_on_activities(uuid);

CREATE OR REPLACE FUNCTION public.refresh_assigned_to_on_activities(emp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.activities a
  SET assigned_to = public.employee_full_name(e)
  FROM public.employees e
  WHERE a.assigned_to_employee_id = emp_id
    AND e.id = emp_id
    AND COALESCE(a.assigned_to, ''::text) IS DISTINCT FROM public.employee_full_name(e);
END;
$function$;

-- ============================================================
-- 3. Fix refresh_assigned_to_on_accounts
-- Guard: accounts table may not have assigned_to_employee_id column
-- ============================================================
DROP FUNCTION IF EXISTS public.refresh_assigned_to_on_accounts(uuid);

CREATE OR REPLACE FUNCTION public.refresh_assigned_to_on_accounts(emp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Only run if the column exists (it may not be present in all environments)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accounts'
      AND column_name = 'assigned_to_employee_id'
  ) THEN
    EXECUTE format(
      'UPDATE public.accounts acc
       SET assigned_to = public.employee_full_name(e)
       FROM public.employees e
       WHERE acc.assigned_to_employee_id = %L::uuid
         AND e.id = %L::uuid
         AND COALESCE(acc.assigned_to, ''''::text) IS DISTINCT FROM public.employee_full_name(e)',
      emp_id, emp_id
    );
  END IF;
END;
$function$;

-- ============================================================
-- 4. Fix refresh_assigned_to_on_client_requirement
-- ============================================================
DROP FUNCTION IF EXISTS public.refresh_assigned_to_on_client_requirement(uuid);

CREATE OR REPLACE FUNCTION public.refresh_assigned_to_on_client_requirement(emp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.client_requirement cr
  SET assigned_to = public.employee_full_name(e)
  FROM public.employees e
  WHERE cr.assigned_to_employee_id = emp_id
    AND e.id = emp_id
    AND COALESCE(cr.assigned_to, ''::text) IS DISTINCT FROM public.employee_full_name(e);
END;
$function$;

-- ============================================================
-- 5. Fix employees_cascade_name_update - add error resilience
-- ============================================================
CREATE OR REPLACE FUNCTION public.employees_cascade_name_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF (NEW.first_name IS DISTINCT FROM OLD.first_name)
     OR (NEW.last_name IS DISTINCT FROM OLD.last_name) THEN

    -- Each cascade is independent; don't let one failure block others
    BEGIN
      PERFORM public.refresh_assigned_to_on_activities(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'refresh_assigned_to_on_activities failed for %: %', NEW.id, SQLERRM;
    END;

    BEGIN
      PERFORM public.refresh_assigned_to_on_accounts(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'refresh_assigned_to_on_accounts failed for %: %', NEW.id, SQLERRM;
    END;

    BEGIN
      PERFORM public.refresh_assigned_to_on_client_requirement(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'refresh_assigned_to_on_client_requirement failed for %: %', NEW.id, SQLERRM;
    END;

  END IF;
  RETURN NEW;
END;
$function$;
