-- Migration 128: Fix person_profile_after_document COALESCE type error
-- Issue: pg_catalog.coalesce(documents, documents) does not exist
-- Solution: Return explicit OLD or NEW based on TG_OP instead of trying to coalesce RECORD types
-- Same pattern as migration 127 for activities

CREATE OR REPLACE FUNCTION public.person_profile_after_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
DECLARE 
  v_person_id uuid;
  v_person_type text;
  v_related_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_person_id := OLD.related_id;
    v_related_type := OLD.related_type;
  ELSE
    v_person_id := NEW.related_id;
    v_related_type := NEW.related_type;
  END IF;

  IF v_person_id IS NULL OR v_related_type IS NULL THEN
    -- FIX: Cannot coalesce RECORD types, return explicit value
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF v_related_type = 'contact' THEN
    v_person_type := 'contact';
  ELSIF v_related_type = 'lead' THEN
    v_person_type := 'lead';
  ELSE
    -- FIX: Cannot coalesce RECORD types, return explicit value
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public.recompute_recent_documents(v_person_id, v_person_type);

  -- FIX: Cannot coalesce RECORD types, return explicit value
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

-- Verify trigger is still attached (should already exist)
-- If not, create it:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_person_profile_documents' 
    AND tgrelid = 'public.documents'::regclass
  ) THEN
    CREATE TRIGGER trg_person_profile_documents
      AFTER INSERT OR UPDATE OR DELETE ON public.documents
      FOR EACH ROW
      EXECUTE FUNCTION public.person_profile_after_document();
  END IF;
END $$;
