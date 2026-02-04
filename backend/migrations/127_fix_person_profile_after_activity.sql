-- Migration 127: Fix person_profile_after_activity COALESCE type error
-- Issue: pg_catalog.coalesce(NEW, OLD) tries to coalesce RECORD types which is invalid
-- Solution: Return explicit OLD or NEW based on TG_OP instead of trying to coalesce

CREATE OR REPLACE FUNCTION public.person_profile_after_activity()
RETURNS trigger
LANGUAGE plpgsql
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
    -- FIX: Cannot coalesce RECORD types, return explicit value
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
    -- FIX: Cannot coalesce RECORD types, return explicit value
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public.recompute_last_activity_at(v_person_id);
  
  -- FIX: Cannot coalesce RECORD types, return explicit value
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;
