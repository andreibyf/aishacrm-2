-- Migration 126: Fix person_profile_upsert_from_contact NULLIF type error
-- Issue: pg_catalog.nullif(NEW.mobile, '') causes "function pg_catalog.nullif(text, unknown) does not exist"
-- Solution: Cast both arguments to ::text explicitly and remove pg_catalog qualification

CREATE OR REPLACE FUNCTION public.person_profile_upsert_from_contact()
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
    -- FIX: Cast both arguments explicitly for polymorphic function resolution
    COALESCE(NULLIF(NEW.mobile::text, ''::text), NEW.phone), 
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
