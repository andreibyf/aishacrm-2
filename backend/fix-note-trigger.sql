-- Fix for note trigger that has broken COALESCE syntax
-- Issue: Function has "RETURN COALESCE(note, note)" instead of "RETURN COALESCE(NEW, OLD)"

-- Drop and recreate the trigger function with correct syntax
DROP TRIGGER IF EXISTS trg_note_refresh_person ON public.note;
DROP FUNCTION IF EXISTS public._tg_refresh_person_on_note();

CREATE OR REPLACE FUNCTION public._tg_refresh_person_on_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.refresh_person_profile(OLD.related_id);
  ELSE
    PERFORM public.refresh_person_profile(NEW.related_id);
  END IF;
  RETURN COALESCE(NEW, OLD);  -- Correct: NEW/OLD variables, not table names
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER trg_note_refresh_person
  AFTER INSERT OR UPDATE OR DELETE
  ON public.note
  FOR EACH ROW
  EXECUTE FUNCTION public._tg_refresh_person_on_note();

-- Verify
SELECT proname, pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = '_tg_refresh_person_on_note';
