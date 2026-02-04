-- Force PostgreSQL to recompile triggers by dropping and recreating them
DROP TRIGGER IF EXISTS contact_person_profile_trigger ON public.contacts;

CREATE TRIGGER contact_person_profile_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_contact_to_person_profile();

DROP TRIGGER IF EXISTS activity_person_profile_trigger ON public.activities;

CREATE TRIGGER activity_person_profile_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public._tg_refresh_person_on_activity();
