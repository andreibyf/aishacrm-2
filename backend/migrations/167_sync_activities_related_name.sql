-- 167_sync_activities_related_name.sql
--
-- 4VD-43 polish: when a CRM entity (lead / contact / account / opportunity) is
-- renamed, propagate the new display name + email into every existing
-- activity row that references it. Without this, the Activities timeline
-- shows whatever name was current when the activity was first created —
-- so a "Document sent — Service Agreement" activity for "Test Lead"
-- would still read "Test Lead" after that lead was promoted to "Confirmed
-- Customer (CTO)" in the contacts table.
--
-- Implementation: a single shared trigger function dispatching on
-- TG_ARGV[0] (entity_type), with one AFTER UPDATE trigger per entity table.
-- WHEN clauses filter to no-op when nothing relevant changed, so high-
-- frequency churn columns (lifecycle, scoring, etc.) don't cascade into
-- activity updates.
--
-- Why a Postgres trigger instead of route-level sync:
--   * Catches every update path: REST routes, Braid tools, AI agents,
--     direct SQL, future migrations. One missed call site = stale name
--     forever; trigger is unambiguous.
--   * Engine-side enforcement is cheap on rare events (entity renames are
--     not hot-path); cost is bounded by the (tenant_id, related_id) index
--     already on activities.
--   * Tenant isolation enforced inside the function via WHERE clause.
--
-- Out of scope:
--   * bizdev_sources — its display name lives in `company_name` /
--     `contact_person`, NOT first_name/last_name; the existing
--     resolveRelatedEntityFields.js helper is also miswired for that
--     entity. Address both as a follow-up.
--   * On-DELETE: the entity row going away doesn't null-out related_name;
--     the activity's "View Lead" fallback handles it from the frontend.

-- ─── Trigger function ─────────────────────────────────────────────────────
-- SECURITY DEFINER so the trigger can update activities even when the
-- triggering session is a tenant-scoped user (RLS would otherwise block
-- the cross-row update). Tenant isolation is preserved inside the
-- function via the explicit `tenant_id = NEW.tenant_id` filter.
CREATE OR REPLACE FUNCTION public.sync_activities_related_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entity_type text := TG_ARGV[0];
  v_new_name    text;
  v_new_email   text;
BEGIN
  IF v_entity_type IN ('lead', 'contact') THEN
    v_new_name := NULLIF(
      trim(both ' ' from
        coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, '')
      ),
      ''
    );
    v_new_email := NULLIF(NEW.email, '');

    UPDATE public.activities
    SET
      related_name  = v_new_name,
      related_email = v_new_email
    WHERE
      tenant_id  = NEW.tenant_id
      AND related_to = v_entity_type
      AND related_id = NEW.id;

  ELSIF v_entity_type = 'account' THEN
    v_new_name  := NULLIF(NEW.name, '');
    v_new_email := NULLIF(NEW.email, '');

    UPDATE public.activities
    SET
      related_name  = v_new_name,
      related_email = v_new_email
    WHERE
      tenant_id  = NEW.tenant_id
      AND related_to = v_entity_type
      AND related_id = NEW.id;

  ELSIF v_entity_type = 'opportunity' THEN
    v_new_name := NULLIF(NEW.name, '');
    -- opportunities table has no `email` column — skip related_email.
    UPDATE public.activities
    SET related_name = v_new_name
    WHERE
      tenant_id  = NEW.tenant_id
      AND related_to = v_entity_type
      AND related_id = NEW.id;

  ELSE
    -- Unknown entity_type passed via TG_ARGV — silently no-op so a future
    -- table-add doesn't break existing UPDATEs.
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_activities_related_name() IS
  '4VD-43: keep activities.related_name + related_email in sync with the source entity (lead/contact/account/opportunity) on rename. Dispatches on TG_ARGV[0] = entity_type.';

-- ─── Per-entity triggers ──────────────────────────────────────────────────
-- WHEN clauses ensure we only fire on actual rename / email change. Other
-- column updates (status, dates, scoring, etc.) are no-ops for this sync.
--
-- Each trigger is guarded by an `EXECUTE format(...)` inside a DO block
-- that checks whether the target table exists. The CI ephemeral test DB
-- (api-schema-tests.yml workflow) runs migrations against a fresh
-- Postgres without the baseline Supabase schema, so leads/contacts/
-- accounts/opportunities may not exist there. In dev/staging/prod
-- Supabase those tables exist; the guard short-circuits gracefully in
-- CI without erroring out and breaking the entire migration chain.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS sync_lead_name_to_activities ON public.leads';
    EXECUTE $TRG$
      CREATE TRIGGER sync_lead_name_to_activities
        AFTER UPDATE ON public.leads
        FOR EACH ROW
        WHEN (
          OLD.first_name IS DISTINCT FROM NEW.first_name
          OR OLD.last_name IS DISTINCT FROM NEW.last_name
          OR OLD.email     IS DISTINCT FROM NEW.email
        )
        EXECUTE FUNCTION public.sync_activities_related_name('lead')
    $TRG$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contacts'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS sync_contact_name_to_activities ON public.contacts';
    EXECUTE $TRG$
      CREATE TRIGGER sync_contact_name_to_activities
        AFTER UPDATE ON public.contacts
        FOR EACH ROW
        WHEN (
          OLD.first_name IS DISTINCT FROM NEW.first_name
          OR OLD.last_name IS DISTINCT FROM NEW.last_name
          OR OLD.email     IS DISTINCT FROM NEW.email
        )
        EXECUTE FUNCTION public.sync_activities_related_name('contact')
    $TRG$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS sync_account_name_to_activities ON public.accounts';
    EXECUTE $TRG$
      CREATE TRIGGER sync_account_name_to_activities
        AFTER UPDATE ON public.accounts
        FOR EACH ROW
        WHEN (
          OLD.name  IS DISTINCT FROM NEW.name
          OR OLD.email IS DISTINCT FROM NEW.email
        )
        EXECUTE FUNCTION public.sync_activities_related_name('account')
    $TRG$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'opportunities'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS sync_opportunity_name_to_activities ON public.opportunities';
    EXECUTE $TRG$
      CREATE TRIGGER sync_opportunity_name_to_activities
        AFTER UPDATE ON public.opportunities
        FOR EACH ROW
        WHEN (OLD.name IS DISTINCT FROM NEW.name)
        EXECUTE FUNCTION public.sync_activities_related_name('opportunity')
    $TRG$;
  END IF;
END $$;
