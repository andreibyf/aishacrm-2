-- Migration 121: Supabase AI Security Fixes
-- Date: 2026-02-03
-- Purpose: Apply Supabase AI-generated fixes for remaining security issues
-- Pattern: Functions rewritten with SET search_path = public, pg_catalog
--          All object references schema-qualified
-- 
-- Instructions:
-- 1. Run Supabase AI with the hardening template
-- 2. Export the generated SQL from Supabase
-- 3. Paste the CREATE OR REPLACE FUNCTION statements below
-- 4. Run verification query to confirm 0 linter errors

-- ============================================
-- PART 1: Hardened Functions (Supabase AI Generated)
-- ============================================
-- Template used:
-- CREATE OR REPLACE FUNCTION public.<name>(<args>)
-- RETURNS <return_type>
-- LANGUAGE plpgsql
-- SET search_path = public, pg_catalog
-- AS $function$
-- BEGIN
--   -- All objects schema-qualified, e.g. public.users, public.now()
-- END;
-- $function$;

-- Regular Functions (No SECURITY DEFINER)

-- Function: block_tenant_id_desync
CREATE OR REPLACE FUNCTION public.block_tenant_id_desync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF (NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    IF NEW.tenant_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'tenant_id must always equal id on public.tenant (attempted id=% and tenant_id=%)', NEW.id, NEW.tenant_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Function: devai_check_duplicate_alert
CREATE OR REPLACE FUNCTION public.devai_check_duplicate_alert(p_category text, p_title text, p_time_window_minutes integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_existing_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_existing_count
  FROM public.devai_health_alerts
  WHERE category = p_category
    AND title = p_title
    AND resolved_at IS NULL
    AND detected_at > pg_catalog.now() - (p_time_window_minutes || ' minutes')::interval;
  
  RETURN v_existing_count > 0;
END;
$function$;

-- Function: employee_full_name (SQL language)
CREATE OR REPLACE FUNCTION public.employee_full_name(emp public.employees)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $function$
  SELECT pg_catalog.trim(both ' ' FROM pg_catalog.coalesce(emp.first_name, '') || ' ' || pg_catalog.coalesce(emp.last_name, ''));
$function$;

-- Function: exec (DANGEROUS - dynamic SQL)
CREATE OR REPLACE FUNCTION public.exec(text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
DECLARE
  cmd ALIAS FOR $1;
BEGIN
  EXECUTE cmd;
END;
$function$;

-- Function: mirror_tenant_id_from_id
CREATE OR REPLACE FUNCTION public.mirror_tenant_id_from_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  NEW.tenant_id := NEW.id::uuid;
  RETURN NEW;
END;
$function$;

-- Function: person_profile_after_activity
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
    RETURN pg_catalog.coalesce(NEW, OLD);
  END IF;

  IF EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = v_person_id) THEN
    v_person_type := 'contact';
  ELSIF EXISTS (SELECT 1 FROM public.leads l WHERE l.id = v_person_id) THEN
    v_person_type := 'lead';
  ELSE
    RETURN pg_catalog.coalesce(NEW, OLD);
  END IF;

  PERFORM public.recompute_last_activity_at(v_person_id);
  RETURN pg_catalog.coalesce(NEW, OLD);
END;
$function$;

-- Function: person_profile_after_document
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
    RETURN pg_catalog.coalesce(NEW, OLD);
  END IF;

  IF v_related_type = 'contact' THEN
    v_person_type := 'contact';
  ELSIF v_related_type = 'lead' THEN
    v_person_type := 'lead';
  ELSE
    RETURN pg_catalog.coalesce(NEW, OLD);
  END IF;

  PERFORM public.recompute_recent_documents(v_person_id, v_person_type);
  RETURN pg_catalog.coalesce(NEW, OLD);
END;
$function$;

-- Function: person_profile_after_opportunity
CREATE OR REPLACE FUNCTION public.person_profile_after_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.contact_id IS NOT NULL THEN
      PERFORM public.recompute_open_opportunity_count(OLD.contact_id, 'contact');
    END IF;
    IF OLD.lead_id IS NOT NULL THEN
      PERFORM public.recompute_open_opportunity_count(OLD.lead_id, 'lead');
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.contact_id IS NOT NULL THEN
    PERFORM public.recompute_open_opportunity_count(NEW.contact_id, 'contact');
  END IF;
  IF NEW.lead_id IS NOT NULL THEN
    PERFORM public.recompute_open_opportunity_count(NEW.lead_id, 'lead');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.contact_id IS DISTINCT FROM NEW.contact_id AND OLD.contact_id IS NOT NULL THEN
      PERFORM public.recompute_open_opportunity_count(OLD.contact_id, 'contact');
    END IF;
    IF OLD.lead_id IS DISTINCT FROM NEW.lead_id AND OLD.lead_id IS NOT NULL THEN
      PERFORM public.recompute_open_opportunity_count(OLD.lead_id, 'lead');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Function: person_profile_upsert_from_contact
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
    COALESCE(NULLIF(NEW.mobile::text, ''::text), NEW.phone), NEW.job_title, NEW.status, NEW.account_id, NEW.account_name, now()
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
    updated_at = pg_catalog.now();

  RETURN NEW;
END;
$function$;

-- Function: person_profile_upsert_from_lead
CREATE OR REPLACE FUNCTION public.person_profile_upsert_from_lead()
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
    NEW.id, 'lead', NEW.tenant_id, NEW.first_name, NEW.last_name, NEW.email, NEW.phone, NEW.job_title, NEW.status, NULL, NEW.company, pg_catalog.now()
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
    updated_at = pg_catalog.now();

  RETURN NEW;
END;
$function$;

-- Function: recompute_last_activity_at (SQL language)
CREATE OR REPLACE FUNCTION public.recompute_last_activity_at(p_person_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public, pg_catalog
AS $function$
  UPDATE public.person_profile pp
  SET last_activity_at = sub.max_created
  FROM (
    SELECT pg_catalog.max(a.created_at) AS max_created
    FROM public.activities a
    WHERE a.related_id = p_person_id
  ) sub
  WHERE pp.person_id = p_person_id;
$function$;

-- Function: recompute_open_opportunity_count (SQL language)
CREATE OR REPLACE FUNCTION public.recompute_open_opportunity_count(p_person_id uuid, p_person_type text)
RETURNS void
LANGUAGE sql
SET search_path = public, pg_catalog
AS $function$
  UPDATE public.person_profile pp
  SET open_opportunity_count = pg_catalog.coalesce(sub.cnt, 0)
  FROM (
    SELECT pg_catalog.count(*)::int AS cnt
    FROM public.opportunities o
    WHERE (
      (p_person_type = 'contact' AND o.contact_id = p_person_id) OR
      (p_person_type = 'lead' AND o.lead_id = p_person_id)
    )
    AND (o.stage IS DISTINCT FROM 'closed')
  ) sub
  WHERE pp.person_id = p_person_id;
$function$;

-- Function: recompute_recent_documents (SQL language)
CREATE OR REPLACE FUNCTION public.recompute_recent_documents(p_person_id uuid, p_person_type text)
RETURNS void
LANGUAGE sql
SET search_path = public, pg_catalog
AS $function$
  UPDATE public.person_profile pp
  SET recent_documents = pg_catalog.coalesce(sub.docs, '[]'::jsonb)
  FROM (
    SELECT jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.created_at DESC) FILTER (WHERE pg_catalog.true) AS docs
    FROM (
      SELECT 
        d.id,
        d.name,
        d.file_url,
        d.file_type,
        d.file_size,
        d.related_type,
        d.related_id,
        d.created_at
      FROM public.documents d
      WHERE d.related_type = CASE WHEN p_person_type = 'contact' THEN 'contact' ELSE 'lead' END
        AND d.related_id = p_person_id
      ORDER BY d.created_at DESC
      LIMIT 10
    ) d
  ) sub
  WHERE pp.person_id = p_person_id;
$function$;

-- Function: set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

-- Function: tenant_keep_ids_in_sync
CREATE OR REPLACE FUNCTION public.tenant_keep_ids_in_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    NEW.tenant_id := NEW.id;
    NEW.tenant_id_text := NEW.id::text;
  END IF;
  RETURN NEW;
END;
$function$;

-- Function: tenant_propagate_ids
CREATE OR REPLACE FUNCTION public.tenant_propagate_ids()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := pg_catalog.gen_random_uuid();
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := NEW.id;
  END IF;

  IF NEW.tenant_id_text IS NULL THEN
    NEW.tenant_id_text := NEW.id::text;
  END IF;

  RETURN NEW;
END;
$function$;

-- Function: tenant_sync_tenant_id
CREATE OR REPLACE FUNCTION public.tenant_sync_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := pg_catalog.gen_random_uuid();
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Function: update_devai_health_alerts_updated_at
CREATE OR REPLACE FUNCTION public.update_devai_health_alerts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$function$;

-- Function: update_project_assignments_updated_at
CREATE OR REPLACE FUNCTION public.update_project_assignments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$function$;

-- Function: update_project_milestones_updated_at
CREATE OR REPLACE FUNCTION public.update_project_milestones_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$function$;

-- Function: update_projects_updated_at
CREATE OR REPLACE FUNCTION public.update_projects_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$function$;

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$function$;

-- Function: uuid_advisory_key (SQL language, IMMUTABLE)
CREATE OR REPLACE FUNCTION public.uuid_advisory_key(p uuid)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $function$
  SELECT (42::bigint << 32) + (('x' || pg_catalog.replace(p::text,'-',''))::bit(64))::bigint;
$function$;

-- ============================================
-- PART 2: SECURITY DEFINER Hardening (If Needed)
-- ============================================
-- Template used for functions that MUST be SECURITY DEFINER:
-- CREATE OR REPLACE FUNCTION public.<name>(<args>)
-- RETURNS <return_type>
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_catalog
-- AS $function$
-- BEGIN
--   -- schema-qualified references only
--   -- no dependency on current_user or session GUCs
-- END;
-- $function$;
--
-- REVOKE ALL ON FUNCTION public.<name>(<arg_types>) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.<name>(<arg_types>) TO authenticated;

-- SECURITY DEFINER Functions (Need Hardening + Grants)

-- Function: _tg_refresh_person_on_activity (SECURITY DEFINER trigger)
CREATE OR REPLACE FUNCTION public._tg_refresh_person_on_activity()
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
  RETURN pg_catalog.coalesce(NEW, OLD);
END;
$function$;

-- Function: _tg_refresh_person_on_document (SECURITY DEFINER trigger)
CREATE OR REPLACE FUNCTION public._tg_refresh_person_on_document()
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
  RETURN pg_catalog.coalesce(NEW, OLD);
END;
$function$;

-- Function: _tg_refresh_person_on_note (SECURITY DEFINER trigger)
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
  RETURN pg_catalog.coalesce(NEW, OLD);
END;
$function$;

-- Function: aggregate_ai_suggestion_metrics (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.aggregate_ai_suggestion_metrics(p_tenant_id uuid, p_bucket_size text DEFAULT 'day'::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_time_bucket pg_catalog.timestamptz;
    v_count INTEGER := 0;
BEGIN
    CASE p_bucket_size
        WHEN 'hour' THEN v_time_bucket := pg_catalog.date_trunc('hour', pg_catalog.now());
        WHEN 'day' THEN v_time_bucket := pg_catalog.date_trunc('day', pg_catalog.now());
        WHEN 'week' THEN v_time_bucket := pg_catalog.date_trunc('week', pg_catalog.now());
        WHEN 'month' THEN v_time_bucket := pg_catalog.date_trunc('month', pg_catalog.now());
        ELSE v_time_bucket := pg_catalog.date_trunc('day', pg_catalog.now());
    END CASE;

    INSERT INTO public.ai_suggestion_metrics (
        tenant_id, time_bucket, bucket_size, trigger_type,
        suggestions_generated, suggestions_approved, suggestions_rejected,
        suggestions_applied, suggestions_expired,
        avg_confidence, avg_execution_time_ms, avg_feedback_rating,
        positive_outcomes, negative_outcomes, avg_review_time_minutes
    )
    SELECT 
        p_tenant_id,
        v_time_bucket,
        p_bucket_size,
        trigger_type,
        pg_catalog.count(*) AS suggestions_generated,
        pg_catalog.count(*) FILTER (WHERE status = 'approved' OR status = 'applied') AS suggestions_approved,
        pg_catalog.count(*) FILTER (WHERE status = 'rejected') AS suggestions_rejected,
        pg_catalog.count(*) FILTER (WHERE status = 'applied') AS suggestions_applied,
        pg_catalog.count(*) FILTER (WHERE status = 'expired') AS suggestions_expired,
        pg_catalog.avg(confidence) AS avg_confidence,
        pg_catalog.avg(execution_time_ms) AS avg_execution_time_ms,
        pg_catalog.avg(feedback_rating) AS avg_feedback_rating,
        pg_catalog.count(*) FILTER (WHERE outcome_positive = pg_catalog.true) AS positive_outcomes,
        pg_catalog.count(*) FILTER (WHERE outcome_positive = pg_catalog.false) AS negative_outcomes,
        pg_catalog.avg(pg_catalog.extract(EPOCH FROM (reviewed_at - created_at)) / 60)::INTEGER AS avg_review_time_minutes
    FROM public.ai_suggestions
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_time_bucket
      AND created_at < v_time_bucket + (
          CASE p_bucket_size
              WHEN 'hour' THEN pg_catalog.interval '1 hour'
              WHEN 'day' THEN pg_catalog.interval '1 day'
              WHEN 'week' THEN pg_catalog.interval '1 week'
              WHEN 'month' THEN pg_catalog.interval '1 month'
              ELSE pg_catalog.interval '1 day'
          END
      )
    GROUP BY trigger_type
    ON CONFLICT (tenant_id, time_bucket, bucket_size, trigger_type)
    DO UPDATE SET
        suggestions_generated = EXCLUDED.suggestions_generated,
        suggestions_approved = EXCLUDED.suggestions_approved,
        suggestions_rejected = EXCLUDED.suggestions_rejected,
        suggestions_applied = EXCLUDED.suggestions_applied,
        suggestions_expired = EXCLUDED.suggestions_expired,
        avg_confidence = EXCLUDED.avg_confidence,
        avg_execution_time_ms = EXCLUDED.avg_execution_time_ms,
        avg_feedback_rating = EXCLUDED.avg_feedback_rating,
        positive_outcomes = EXCLUDED.positive_outcomes,
        negative_outcomes = EXCLUDED.negative_outcomes,
        avg_review_time_minutes = EXCLUDED.avg_review_time_minutes,
        updated_at = pg_catalog.now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;

-- Function: employees_cascade_name_update (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.employees_cascade_name_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF (NEW.first_name IS DISTINCT FROM OLD.first_name)
     OR (NEW.last_name IS DISTINCT FROM OLD.last_name) THEN

    PERFORM public.refresh_assigned_to_on_activities(NEW.id);
    PERFORM public.refresh_assigned_to_on_accounts(NEW.id);
    PERFORM public.refresh_assigned_to_on_client_requirement(NEW.id);

  END IF;
  RETURN NEW;
END;
$function$;

-- Function: ensure_refresh_dashboard_job (SECURITY DEFINER, uses cron extension)
CREATE OR REPLACE FUNCTION public.ensure_refresh_dashboard_job()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_job    cron.job%ROWTYPE;
  v_db     text := pg_catalog.current_database();
  v_name   text := 'refresh_dashboard_funnel_counts_nightly';
  v_sched  text := '0 2 * * *';
  v_cmd    text := 'select public.refresh_dashboard_funnel_counts();';
BEGIN
  SELECT * INTO v_job FROM cron.job WHERE jobname = v_name;

  IF NOT FOUND THEN
    BEGIN
      PERFORM cron.schedule_in(v_db, v_name, v_sched, v_cmd);
    EXCEPTION WHEN undefined_function THEN
      PERFORM cron.schedule(v_name, v_sched, v_cmd);
    END;
  ELSE
    IF v_job.schedule IS DISTINCT FROM v_sched THEN
      PERFORM cron.alter(v_name, v_sched);
    END IF;

    IF v_job.command IS DISTINCT FROM v_cmd THEN
      PERFORM cron.alter(v_name, v_cmd);
    END IF;
  END IF;

  BEGIN
    PERFORM cron.resume(v_name);
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;
END;
$function$;

-- Function: ensure_refresh_dashboard_job_main (SECURITY DEFINER, uses cron extension)
CREATE OR REPLACE FUNCTION public.ensure_refresh_dashboard_job_main()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_job    cron.job%ROWTYPE;
  v_db     text := pg_catalog.current_database();
  v_name   text := 'refresh_dashboard_funnel_counts_main_nightly';
  v_sched  text := '0 2 * * *';
  v_cmd    text := 'select public.refresh_dashboard_funnel_counts();';
BEGIN
  SELECT * INTO v_job FROM cron.job WHERE jobname = v_name;

  IF NOT FOUND THEN
    BEGIN
      PERFORM cron.schedule_in(v_db, v_name, v_sched, v_cmd);
    EXCEPTION WHEN undefined_function THEN
      PERFORM cron.schedule(v_name, v_sched, v_cmd);
    END;
  ELSE
    IF v_job.schedule IS DISTINCT FROM v_sched THEN
      PERFORM cron.alter(v_name, v_sched);
    END IF;
    IF v_job.command IS DISTINCT FROM v_cmd THEN
      PERFORM cron.alter(v_name, v_cmd);
    END IF;
  END IF;

  BEGIN
    PERFORM cron.resume(v_name);
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;
END;
$function$;

-- Function: refresh_assigned_to_on_accounts (SECURITY DEFINER)
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

-- Function: refresh_assigned_to_on_activities (SECURITY DEFINER)
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

-- Function: refresh_assigned_to_on_client_requirement (SECURITY DEFINER)
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

-- Function: refresh_dashboard_funnel_counts (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.refresh_dashboard_funnel_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.dashboard_funnel_counts;
END;
$function$;

-- Function: refresh_dashboard_stats (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.dashboard_stats_mv;
END;
$function$;

-- Function: refresh_funnel_on_change (SECURITY DEFINER trigger)
CREATE OR REPLACE FUNCTION public.refresh_funnel_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  PERFORM public.refresh_dashboard_funnel_counts();
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM 1;
    RETURN NULL;
END;
$function$;

-- Function: refresh_person_profile (Complex profile refresh)
CREATE OR REPLACE FUNCTION public.refresh_person_profile(p_person_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_key bigint;
  v_person_type text;
BEGIN
  v_key := (42::bigint << 32) + (('x' || pg_catalog.replace(p_person_id::text, '-', ''))::bit(64))::bigint;
  PERFORM pg_catalog.pg_advisory_xact_lock(v_key);

  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM public.leads l WHERE l.id = p_person_id) THEN 'lead'
           WHEN EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = p_person_id) THEN 'contact'
           ELSE NULL
         END
  INTO v_person_type;

  IF v_person_type IS NULL THEN
    RETURN;
  END IF;

  WITH src AS (
    SELECT
      p_person_id AS person_id,
      v_person_type AS person_type,
      pg_catalog.coalesce(l.tenant_id, c.tenant_id) AS tenant_id,
      pg_catalog.coalesce(l.first_name, c.first_name) AS first_name,
      pg_catalog.coalesce(l.last_name,  c.last_name)  AS last_name,
      pg_catalog.coalesce(l.email,      c.email)      AS email,
      pg_catalog.coalesce(l.phone,      c.phone)      AS phone,
      pg_catalog.coalesce(l.job_title,  c.job_title)  AS job_title,
      pg_catalog.coalesce(l.status,     c.status)     AS status,
      pg_catalog.coalesce(l.company,    c.account_name)    AS account_name,
      pg_catalog.coalesce(l.assigned_to::text, c.assigned_to::text) AS assigned_to,
      c.account_id
    FROM (SELECT 1) AS _
    LEFT JOIN public.leads l ON v_person_type = 'lead' AND l.id = p_person_id
    LEFT JOIN public.contacts c ON v_person_type = 'contact' AND c.id = p_person_id
  ),
  recent_documents AS (
    SELECT pg_catalog.coalesce(
      jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.created_at DESC) FILTER (WHERE d IS NOT NULL),
      '[]'::jsonb
    ) AS items
    FROM (
      SELECT *
      FROM public.documents d
      WHERE d.related_id = p_person_id
      ORDER BY d.created_at DESC
      LIMIT 20
    ) d
  ),
  notes AS (
    SELECT pg_catalog.coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'title', n.title,
          'content', n.content,
          'metadata', n.metadata,
          'created_by', n.created_by,
          'related_id', n.related_id,
          'updated_at', n.updated_at
        )
        ORDER BY n.updated_at DESC
      ) FILTER (WHERE n.id IS NOT NULL),
      '[]'::jsonb
    ) AS items
    FROM public.note n
    WHERE n.related_id = p_person_id
  ),
  opportunity_stage AS (
    SELECT pg_catalog.coalesce(
      ARRAY[
        (
          SELECT o.stage
          FROM public.opportunities o
          WHERE (CASE v_person_type
                   WHEN 'lead' THEN o.lead_id
                   WHEN 'contact' THEN o.contact_id
                 END) = p_person_id
          ORDER BY o.updated_at DESC
          LIMIT 1
        )
      ],
      '{}'::text[]
    ) AS items
  ),
  open_opportunity_count AS (
    SELECT pg_catalog.count(*)::int AS cnt
    FROM public.opportunities o
    WHERE (CASE v_person_type
             WHEN 'lead' THEN o.lead_id
             WHEN 'contact' THEN o.contact_id
           END) = p_person_id
      AND pg_catalog.coalesce(o.stage, '') NOT IN ('closed_won','closed_lost','closed')
  ),
  activities AS (
    SELECT
      pg_catalog.max(a.created_at) AS last_activity_at,
      pg_catalog.coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'type', a.type,
            'subject', a.subject,
            'body', a.body,
            'status', a.status,
            'due_date', a.due_date,
            'priority', a.priority,       
            'updated_at', a.updated_at,
            'assigned_to', a.assigned_to,
            'related_to', a.related_to,
            'related_id', a.related_id,          
            'activity_metadata', a.activity_metadata
          )
          ORDER BY a.created_at DESC
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'::jsonb
      ) AS items
    FROM (
      SELECT
        id, type, subject, body, status, due_date, priority,
        created_at, updated_at,
        assigned_to, related_to, related_id,
        metadata, activity_metadata
      FROM public.activities a
      WHERE a.related_id = p_person_id
      ORDER BY a.created_at DESC
      LIMIT 50
    ) a
  )
  INSERT INTO public.person_profile AS pp
    (person_id, person_type, tenant_id,
     first_name, last_name, email, phone, job_title, status,
     account_id, account_name,
     updated_at, last_activity_at, open_opportunity_count,
     recent_documents, notes, activities, opportunity_stage, assigned_to)
  SELECT
    s.person_id,
    s.person_type,
    s.tenant_id,
    s.first_name, s.last_name, s.email, s.phone, s.job_title, s.status,
    s.account_id, s.account_name,
    pg_catalog.now(),
    a.last_activity_at,
    o.cnt,
    rd.items,
    n.items,
    a.items,
    os.items,
    s.assigned_to
  FROM src s
  CROSS JOIN recent_documents rd
  CROSS JOIN notes n
  CROSS JOIN activities a
  CROSS JOIN opportunity_stage os
  CROSS JOIN open_opportunity_count o
  WHERE s.person_type IS NOT NULL
  ON CONFLICT (person_id) DO UPDATE
  SET person_type       = pg_catalog.coalesce(EXCLUDED.person_type, pp.person_type),
      tenant_id         = pg_catalog.coalesce(EXCLUDED.tenant_id, pp.tenant_id),
      first_name        = EXCLUDED.first_name,
      last_name         = EXCLUDED.last_name,
      email             = EXCLUDED.email,
      phone             = EXCLUDED.phone,
      job_title         = EXCLUDED.job_title,
      status            = EXCLUDED.status,
      account_id        = EXCLUDED.account_id,
      account_name      = EXCLUDED.account_name,
      last_activity_at  = EXCLUDED.last_activity_at,
      open_opportunity_count = EXCLUDED.open_opportunity_count,
      recent_documents  = EXCLUDED.recent_documents,
      notes             = EXCLUDED.notes,
      activities        = EXCLUDED.activities,
      opportunity_stage = EXCLUDED.opportunity_stage,
      assigned_to       = EXCLUDED.assigned_to,
      updated_at        = pg_catalog.now();

END;
$function$;

-- Function: refresh_person_profile_lead (SECURITY DEFINER, very complex)
CREATE OR REPLACE FUNCTION public.refresh_person_profile_lead(p_lead_id uuid, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  WITH base AS (
    SELECT l.id AS person_id,
           'lead'::text AS person_type,
           l.tenant_id,
           l.first_name, l.last_name, l.email, l.phone, l.job_title, l.status,
           l.updated_at
    FROM public.leads l
    WHERE l.id = p_lead_id
      AND l.tenant_id = p_tenant_id
  ),
  note_agg AS (
    SELECT jsonb_agg(
             jsonb_build_object('id', n.id, 'title', n.title, 'content', n.content,
                                'created_at', n.created_at, 'created_by', n.created_by)
             ORDER BY n.created_at DESC
           ) FILTER (WHERE n.id IS NOT NULL) AS notes
    FROM public.note n
    JOIN base b
      ON n.related_id = b.person_id
     AND n.tenant_id = b.tenant_id
     AND n.related_type IN ('lead','leads')
  ),
  act_agg AS (
    SELECT jsonb_agg(
             jsonb_build_object('id', a.id, 'type', a.type, 'subject', a.subject,
                                'body', a.body, 'created_at', a.created_at,
                                'assigned_to', a.assigned_to, 'status', a.status)
             ORDER BY a.created_at DESC
           ) FILTER (WHERE a.id IS NOT NULL) AS activities,
           pg_catalog.max(a.created_at) AS last_activity_at
    FROM public.activities a
    JOIN base b
      ON a.related_id = b.person_id
     AND a.tenant_id = b.tenant_id
  ),
  opp_agg AS (
    SELECT
      pg_catalog.coalesce(pg_catalog.count(*) FILTER (WHERE o.stage NOT IN ('closed_won','closed_lost')), 0) AS open_opportunity_count,
      pg_catalog.coalesce(pg_catalog.array_agg(DISTINCT o.stage) FILTER (WHERE o.stage IS NOT NULL), '{}') AS opportunity_stage
    FROM public.opportunities o
    JOIN base b
      ON o.lead_id = b.person_id
     AND o.tenant_id = b.tenant_id
  ),
  doc_agg AS (
    SELECT pg_catalog.coalesce(
             jsonb_agg(
               jsonb_build_object('id', d.id, 'name', d.name, 'file_url', d.file_url, 'created_at', d.created_at)
               ORDER BY d.created_at DESC
             ) FILTER (WHERE d.id IS NOT NULL),
             '[]'::jsonb
           ) AS recent_documents
    FROM public.documents d
    JOIN base b
      ON d.related_id = b.person_id
     AND d.tenant_id = b.tenant_id
  ),
  data AS (
    SELECT
      b.person_id, 'lead'::text AS person_type, b.tenant_id,
      b.first_name, b.last_name, b.email, b.phone, b.job_title, b.status,
      b.updated_at,
      a.last_activity_at,
      o.open_opportunity_count,
      d.recent_documents,
      o.opportunity_stage,
      pg_catalog.coalesce(n.notes, '[]'::jsonb) AS notes,
      pg_catalog.coalesce(a.activities, '[]'::jsonb) AS activities
    FROM base b
    LEFT JOIN note_agg n ON pg_catalog.true
    LEFT JOIN act_agg a ON pg_catalog.true
    LEFT JOIN opp_agg o ON pg_catalog.true
    LEFT JOIN doc_agg d ON pg_catalog.true
  )
  INSERT INTO public.person_profile AS pp (
    person_id, person_type, tenant_id,
    first_name, last_name, email, phone, job_title, status,
    updated_at, last_activity_at,
    open_opportunity_count, recent_documents,
    opportunity_stage, notes, activities
  )
  SELECT
    person_id, person_type, tenant_id,
    first_name, last_name, email, phone, job_title, status,
    updated_at, last_activity_at,
    open_opportunity_count, recent_documents,
    opportunity_stage, notes, activities
  FROM data
  ON CONFLICT (person_id) DO UPDATE
    SET person_type = EXCLUDED.person_type,
        tenant_id = EXCLUDED.tenant_id,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        job_title = EXCLUDED.job_title,
        status = EXCLUDED.status,
        updated_at = pg_catalog.now(),
        last_activity_at = EXCLUDED.last_activity_at,
        open_opportunity_count = EXCLUDED.open_opportunity_count,
        recent_documents = EXCLUDED.recent_documents,
        opportunity_stage = EXCLUDED.opportunity_stage,
        notes = EXCLUDED.notes,
        activities = EXCLUDED.activities;
END;
$function$;

-- Function: rehydrate_person_profiles (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.rehydrate_person_profiles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  UPDATE public.person_profile pp
  SET last_activity_at = sub.max_created
  FROM (
    SELECT a.related_id AS person_id, pg_catalog.max(a.created_at) AS max_created
    FROM public.activities a
    GROUP BY a.related_id
  ) sub
  WHERE pp.person_id = sub.person_id;

  WITH counts AS (
    SELECT o.contact_id AS person_id, 'contact'::text AS person_type, pg_catalog.count(*)::int AS cnt
    FROM public.opportunities o
    WHERE o.contact_id IS NOT NULL AND o.stage IS DISTINCT FROM 'closed'
    GROUP BY o.contact_id
    UNION ALL
    SELECT o.lead_id AS person_id, 'lead'::text AS person_type, pg_catalog.count(*)::int AS cnt
    FROM public.opportunities o
    WHERE o.lead_id IS NOT NULL AND o.stage IS DISTINCT FROM 'closed'
    GROUP BY o.lead_id
  )
  UPDATE public.person_profile pp
  SET open_opportunity_count = pg_catalog.coalesce(c.cnt, 0)
  FROM counts c
  WHERE pp.person_id = c.person_id AND pp.person_type = c.person_type;

  WITH ranked_docs AS (
    SELECT d.id, d.name, d.file_url, d.file_type, d.file_size, d.related_type, d.related_id, d.created_at,
           pg_catalog.row_number() OVER (PARTITION BY d.related_type, d.related_id ORDER BY d.created_at DESC) AS rn
    FROM public.documents d
    WHERE d.related_type IN ('contact','lead')
  ),
  agg AS (
    SELECT related_id AS person_id,
           CASE WHEN related_type = 'contact' THEN 'contact' ELSE 'lead' END AS person_type,
           jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.created_at DESC) AS docs
    FROM ranked_docs r
    WHERE r.rn <= 10
    GROUP BY related_id, related_type
  )
  UPDATE public.person_profile pp
  SET recent_documents = pg_catalog.coalesce(a.docs, '[]'::jsonb)
  FROM agg a
  WHERE pp.person_id = a.person_id AND pp.person_type = a.person_type;
END;
$function$;

-- Function: sync_tenant_mirrors (SECURITY DEFINER trigger)
CREATE OR REPLACE FUNCTION public.sync_tenant_mirrors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.tenant_id := pg_catalog.coalesce(NEW.tenant_id, NEW.id::uuid);
    NEW.tenant_id_text := pg_catalog.coalesce(NEW.tenant_id_text, NEW.id::text);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id IS DISTINCT FROM OLD.id)
       OR NEW.tenant_id IS NULL
       OR NEW.tenant_id_text IS NULL
       OR NEW.tenant_id IS DISTINCT FROM NEW.id::uuid
       OR NEW.tenant_id_text IS DISTINCT FROM NEW.id::text
    THEN
      NEW.tenant_id := NEW.id::uuid;
      NEW.tenant_id_text := NEW.id::text;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;


-- ============================================
-- Verification Queries
-- ============================================
-- Run these after applying migration to verify:

-- 1. Check all functions have fixed search_path:
SELECT 
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  CASE 
    WHEN p.proconfig IS NOT NULL THEN 
      (SELECT string_agg(setting, ', ') 
       FROM unnest(p.proconfig) AS setting 
       WHERE setting LIKE 'search_path%')
    ELSE 'NOT SET'
  END AS search_path_setting
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- 2. Check Database Linter (should show 0 errors):
-- Navigate to: Database → Linter in Supabase Dashboard
-- Verify all security warnings are resolved
