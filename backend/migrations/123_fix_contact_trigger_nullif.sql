-- Migration 123: Fix contact_person_profile_trigger nullif type error
-- Issue: pg_catalog.nullif(NEW.mobile, '') causes "function pg_catalog.nullif(text, unknown) does not exist"
-- Solution: Cast empty string to TEXT explicitly

-- Drop and recreate the trigger function with proper type casting
CREATE OR REPLACE FUNCTION public.sync_contact_to_person_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.person_profile WHERE person_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.person_profile AS pp (
    person_id, person_type, tenant_id, first_name, last_name, email, phone, job_title, status, account_id, account_name, updated_at
  ) VALUES (
    NEW.id, 'contact', NEW.tenant_id, NEW.first_name, NEW.last_name, NEW.email,
    -- FIX: Use unqualified NULLIF/COALESCE (built-ins don't need pg_catalog prefix)
    COALESCE(NULLIF(NEW.mobile, ''), NEW.phone), 
    NEW.job_title, NEW.status, NEW.account_id, NEW.account_name, now()
  )
  ON CONFLICT (person_id) DO UPDATE SET
    person_type = EXCLUDED.person_type,
    tenant_id = EXCLUDED.tenant_id,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    job_title = EXCLUDED.job_title,
    status = EXCLUDED.status,
    account_id = EXCLUDED.account_id,
    account_name = EXCLUDED.account_name,
    updated_at = now();

  RETURN NEW;
END;
$function$;

-- Verify the trigger is still attached
-- (Should already exist from migration 121, this just updates the function)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'contact_person_profile_trigger' 
    AND tgrelid = 'public.contacts'::regclass
  ) THEN
    CREATE TRIGGER contact_person_profile_trigger
      AFTER INSERT OR UPDATE OR DELETE ON public.contacts
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_contact_to_person_profile();
  END IF;
END$$;
