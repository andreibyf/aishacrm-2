-- Migration 124: Fix activity trigger coalesce type error
-- Issue: pg_catalog.coalesce(activities, activities) - trying to coalesce RECORD types
-- Solution: Return NEW or OLD explicitly based on operation

-- Drop and recreate trigger function with correct RETURN logic
CREATE OR REPLACE FUNCTION public._tg_refresh_person_on_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.refresh_person_profile(OLD.related_id);
    RETURN OLD;
  ELSE
    PERFORM public.refresh_person_profile(NEW.related_id);
    RETURN NEW;
  END IF;
END;
$function$;

-- Also fix related triggers that may have the same issue
CREATE OR REPLACE FUNCTION public._tg_refresh_person_on_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.refresh_person_profile(OLD.related_id);
    RETURN OLD;
  ELSE
    PERFORM public.refresh_person_profile(NEW.related_id);
    RETURN NEW;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public._tg_update_last_activity_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_person_id uuid;
  v_person_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_person_id := OLD.related_id;
  ELSE
    v_person_id := NEW.related_id;
  END IF;

  IF v_person_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = v_person_id) THEN
    v_person_type := 'contact';
  ELSIF EXISTS (SELECT 1 FROM public.leads l WHERE l.id = v_person_id) THEN
    v_person_type := 'lead';
  ELSE
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public.recompute_last_activity_at(v_person_id);
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;
