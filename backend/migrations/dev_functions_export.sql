


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."activity_priority" AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


ALTER TYPE "public"."activity_priority" OWNER TO "postgres";


CREATE TYPE "public"."bizdev_status" AS ENUM (
    'Active',
    'Promoted',
    'Archived'
);


ALTER TYPE "public"."bizdev_status" OWNER TO "postgres";


CREATE TYPE "public"."license_status" AS ENUM (
    'Active',
    'Suspended',
    'Revoked',
    'Expired',
    'Unknown',
    'Not Required'
);


ALTER TYPE "public"."license_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_tg_refresh_person_on_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.refresh_person_profile(OLD.related_id);
  ELSE
    PERFORM public.refresh_person_profile(NEW.related_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;


ALTER FUNCTION "public"."_tg_refresh_person_on_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_tg_refresh_person_on_document"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.refresh_person_profile(OLD.related_id);
  ELSE
    PERFORM public.refresh_person_profile(NEW.related_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;


ALTER FUNCTION "public"."_tg_refresh_person_on_document"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_tg_refresh_person_on_note"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.refresh_person_profile(OLD.related_id);
  ELSE
    PERFORM public.refresh_person_profile(NEW.related_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;


ALTER FUNCTION "public"."_tg_refresh_person_on_note"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggregate_ai_suggestion_metrics"("p_tenant_id" "uuid", "p_bucket_size" "text" DEFAULT 'day'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_time_bucket TIMESTAMPTZ;
    v_count INTEGER := 0;
BEGIN
    -- Determine time bucket start
    CASE p_bucket_size
        WHEN 'hour' THEN v_time_bucket := date_trunc('hour', NOW());
        WHEN 'day' THEN v_time_bucket := date_trunc('day', NOW());
        WHEN 'week' THEN v_time_bucket := date_trunc('week', NOW());
        WHEN 'month' THEN v_time_bucket := date_trunc('month', NOW());
        ELSE v_time_bucket := date_trunc('day', NOW());
    END CASE;

    -- Aggregate by trigger type
    INSERT INTO ai_suggestion_metrics (
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
        COUNT(*) AS suggestions_generated,
        COUNT(*) FILTER (WHERE status = 'approved' OR status = 'applied') AS suggestions_approved,
        COUNT(*) FILTER (WHERE status = 'rejected') AS suggestions_rejected,
        COUNT(*) FILTER (WHERE status = 'applied') AS suggestions_applied,
        COUNT(*) FILTER (WHERE status = 'expired') AS suggestions_expired,
        AVG(confidence) AS avg_confidence,
        AVG(execution_time_ms) AS avg_execution_time_ms,
        AVG(feedback_rating) AS avg_feedback_rating,
        COUNT(*) FILTER (WHERE outcome_positive = true) AS positive_outcomes,
        COUNT(*) FILTER (WHERE outcome_positive = false) AS negative_outcomes,
        AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 60)::INTEGER AS avg_review_time_minutes
    FROM ai_suggestions
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_time_bucket
      AND created_at < v_time_bucket + (
          CASE p_bucket_size
              WHEN 'hour' THEN INTERVAL '1 hour'
              WHEN 'day' THEN INTERVAL '1 day'
              WHEN 'week' THEN INTERVAL '1 week'
              WHEN 'month' THEN INTERVAL '1 month'
              ELSE INTERVAL '1 day'
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
        updated_at = NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."aggregate_ai_suggestion_metrics"("p_tenant_id" "uuid", "p_bucket_size" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."aggregate_ai_suggestion_metrics"("p_tenant_id" "uuid", "p_bucket_size" "text") IS 'Aggregates suggestion metrics into time buckets for reporting';



CREATE OR REPLACE FUNCTION "public"."current_tenant_id"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN current_setting('app.current_tenant_id', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."current_tenant_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_tenant_id"() IS 'Returns the current tenant_id from session variable';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "role" "text",
    "status" "text" DEFAULT 'active'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_test_data" boolean DEFAULT false,
    "tenant_id" "uuid"
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


COMMENT ON COLUMN "public"."employees"."tenant_id_text" IS 'Tenant identifier. NULL indicates employee has no assigned client/tenant.';



CREATE OR REPLACE FUNCTION "public"."employee_full_name"("emp" "public"."employees") RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT trim(both ' ' FROM COALESCE(emp.first_name, '') || ' ' || COALESCE(emp.last_name, ''));
$$;


ALTER FUNCTION "public"."employee_full_name"("emp" "public"."employees") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."employees_cascade_name_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF (NEW.first_name IS DISTINCT FROM OLD.first_name)
     OR (NEW.last_name IS DISTINCT FROM OLD.last_name) THEN

    PERFORM public.refresh_assigned_to_on_activities(NEW.id);
    PERFORM public.refresh_assigned_to_on_accounts(NEW.id);
    PERFORM public.refresh_assigned_to_on_client_requirement(NEW.id);

  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."employees_cascade_name_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."person_profile_after_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_person_id uuid; v_person_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_person_id := OLD.related_id;
  ELSE
    v_person_id := NEW.related_id;
  END IF;

  IF v_person_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = v_person_id) THEN
    v_person_type := 'contact';
  ELSIF EXISTS (SELECT 1 FROM public.leads l WHERE l.id = v_person_id) THEN
    v_person_type := 'lead';
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.recompute_last_activity_at(v_person_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."person_profile_after_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."person_profile_after_document"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_person_id uuid; v_person_type text; v_related_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_person_id := OLD.related_id;
    v_related_type := OLD.related_type;
  ELSE
    v_person_id := NEW.related_id;
    v_related_type := NEW.related_type;
  END IF;

  IF v_person_id IS NULL OR v_related_type IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_related_type = 'contact' THEN
    v_person_type := 'contact';
  ELSIF v_related_type = 'lead' THEN
    v_person_type := 'lead';
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.recompute_recent_documents(v_person_id, v_person_type);
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."person_profile_after_document"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."person_profile_after_opportunity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."person_profile_after_opportunity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."person_profile_upsert_from_contact"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.person_profile WHERE person_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.person_profile AS pp (
    person_id, person_type, tenant_id, first_name, last_name, email, phone, job_title, status, account_id, account_name, updated_at
  ) VALUES (
    NEW.id, 'contact', NEW.tenant_id, NEW.first_name, NEW.last_name, NEW.email,
    COALESCE(NULLIF(NEW.mobile, ''), NEW.phone), NEW.job_title, NEW.status, NEW.account_id, NEW.account_name, now()
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
$$;


ALTER FUNCTION "public"."person_profile_upsert_from_contact"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."person_profile_upsert_from_lead"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.person_profile WHERE person_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.person_profile AS pp (
    person_id, person_type, tenant_id, first_name, last_name, email, phone, job_title, status, account_id, account_name, updated_at
  ) VALUES (
    NEW.id, 'lead', NEW.tenant_id, NEW.first_name, NEW.last_name, NEW.email, NEW.phone, NEW.job_title, NEW.status, NULL, NEW.company, now()
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
$$;


ALTER FUNCTION "public"."person_profile_upsert_from_lead"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_last_activity_at"("p_person_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE public.person_profile pp
  SET last_activity_at = sub.max_created
  FROM (
    SELECT MAX(a.created_at) AS max_created
    FROM public.activities a
    WHERE a.related_id = p_person_id
  ) sub
  WHERE pp.person_id = p_person_id;
$$;


ALTER FUNCTION "public"."recompute_last_activity_at"("p_person_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_open_opportunity_count"("p_person_id" "uuid", "p_person_type" "text") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE public.person_profile pp
  SET open_opportunity_count = COALESCE(sub.cnt, 0)
  FROM (
    SELECT COUNT(*)::int AS cnt
    FROM public.opportunities o
    WHERE (
      (p_person_type = 'contact' AND o.contact_id = p_person_id) OR
      (p_person_type = 'lead' AND o.lead_id = p_person_id)
    )
    AND (o.stage IS DISTINCT FROM 'closed')
  ) sub
  WHERE pp.person_id = p_person_id;
$$;


ALTER FUNCTION "public"."recompute_open_opportunity_count"("p_person_id" "uuid", "p_person_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_recent_documents"("p_person_id" "uuid", "p_person_type" "text") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE public.person_profile pp
  SET recent_documents = COALESCE(sub.docs, '[]'::jsonb)
  FROM (
    SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC) FILTER (WHERE true) AS docs
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
$$;


ALTER FUNCTION "public"."recompute_recent_documents"("p_person_id" "uuid", "p_person_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_all_person_profiles"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r uuid;
BEGIN
  FOR r IN
    SELECT person_id::uuid FROM public.person_profile
    UNION
    SELECT id::uuid FROM public.leads
    UNION
    SELECT id::uuid FROM public.contacts
  LOOP
    PERFORM public.refresh_person_profile(r);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."refresh_all_person_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_assigned_to_on_accounts"("emp_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.accounts acc
  SET assigned_to = public.employee_full_name(e)
  FROM public.employees e
  WHERE acc.assigned_to_employee_id = emp_id
    AND e.id = emp_id
    AND COALESCE(acc.assigned_to, '') IS DISTINCT FROM public.employee_full_name(e);
END;
$$;


ALTER FUNCTION "public"."refresh_assigned_to_on_accounts"("emp_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_assigned_to_on_activities"("emp_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.activities a
  SET assigned_to = public.employee_full_name(e)
  FROM public.employees e
  WHERE a.assigned_to_employee_id = emp_id
    AND e.id = emp_id
    AND COALESCE(a.assigned_to, '') IS DISTINCT FROM public.employee_full_name(e);
END;
$$;


ALTER FUNCTION "public"."refresh_assigned_to_on_activities"("emp_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_assigned_to_on_client_requirement"("emp_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.client_requirement cr
  SET assigned_to = public.employee_full_name(e)
  FROM public.employees e
  WHERE cr.assigned_to_employee_id = emp_id
    AND e.id = emp_id
    AND COALESCE(cr.assigned_to, '') IS DISTINCT FROM public.employee_full_name(e);
END;
$$;


ALTER FUNCTION "public"."refresh_assigned_to_on_client_requirement"("emp_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_person_profile"("p_person_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$DECLARE
  v_key bigint;
  v_person_type text;
BEGIN
  -- Serialize updates per person (consistent advisory lock key)
  v_key := (42::bigint << 32) + (('x' || replace(p_person_id::text, '-', ''))::bit(64))::bigint;
  PERFORM pg_advisory_xact_lock(v_key);

  -- Determine person type based on existence in leads or contacts
  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM public.leads    l WHERE l.id = p_person_id) THEN 'lead'
           WHEN EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = p_person_id) THEN 'contact'
           ELSE NULL
         END
  INTO v_person_type;

  IF v_person_type IS NULL THEN
    -- Not a recognized person id; no-op
    RETURN;
  END IF;

  WITH src AS (
    SELECT
      p_person_id AS person_id,
      v_person_type AS person_type,
      COALESCE(l.tenant_id, c.tenant_id) AS tenant_id,
      COALESCE(l.first_name, c.first_name) AS first_name,
      COALESCE(l.last_name,  c.last_name)  AS last_name,
      COALESCE(l.email,      c.email)      AS email,
      COALESCE(l.phone,      c.phone)      AS phone,
      COALESCE(l.job_title,  c.job_title)  AS job_title,
      COALESCE(l.status,     c.status)     AS status,
      COALESCE(l.company,    c.account_name)    AS account_name,
      -- Cast to text if person_profile.assigned_to is text; adjust if uuid
      COALESCE(l.assigned_to::text, c.assigned_to::text) AS assigned_to,
      c.account_id
      -- c.account_name
    FROM (SELECT 1) AS _
    LEFT JOIN public.leads    l ON v_person_type = 'lead'    AND l.id = p_person_id
    LEFT JOIN public.contacts c ON v_person_type = 'contact' AND c.id = p_person_id
  ),
  recent_documents AS (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC) FILTER (WHERE d IS NOT NULL),
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
  SELECT COALESCE(
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
    SELECT COALESCE(
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
    SELECT COUNT(*)::int AS cnt
    FROM public.opportunities o
    WHERE (CASE v_person_type
             WHEN 'lead' THEN o.lead_id
             WHEN 'contact' THEN o.contact_id
           END) = p_person_id
      AND COALESCE(o.stage, '') NOT IN ('closed_won','closed_lost','closed')
  ),
  activities AS (
  SELECT
    MAX(a.created_at) AS last_activity_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'type', a.type,
          'subject', a.subject,
          'body', a.body,
          'status', a.status,
          'due_date', a.due_date,
          'priority', a.priority,       
          'updated_at', a.updated_at, -- if you store it; else remove
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
      created_at, updated_at, -- if not present, remove
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
    now(),
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
  SET person_type       = COALESCE(EXCLUDED.person_type, pp.person_type),
      tenant_id         = COALESCE(EXCLUDED.tenant_id, pp.tenant_id),
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
      updated_at        = now();

END;$$;


ALTER FUNCTION "public"."refresh_person_profile"("p_person_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_person_profile_lead"("p_lead_id" "uuid", "p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
           max(a.created_at) AS last_activity_at
    FROM public.activities a
    JOIN base b
      ON a.related_id = b.person_id
     AND a.tenant_id = b.tenant_id
  ),
  opp_agg AS (
    SELECT
      coalesce(count(*) FILTER (WHERE o.stage NOT IN ('closed_won','closed_lost')), 0) AS open_opportunity_count,
      coalesce(array_agg(DISTINCT o.stage) FILTER (WHERE o.stage IS NOT NULL), '{}') AS opportunity_stage
    FROM public.opportunities o
    JOIN base b
      ON o.lead_id = b.person_id
     AND o.tenant_id = b.tenant_id
  ),
  doc_agg AS (
    SELECT coalesce(
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
      coalesce(n.notes, '[]'::jsonb) AS notes,
      coalesce(a.activities, '[]'::jsonb) AS activities
    FROM base b
    LEFT JOIN note_agg n ON true
    LEFT JOIN act_agg a ON true
    LEFT JOIN opp_agg o ON true
    LEFT JOIN doc_agg d ON true
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
        updated_at = now(),
        last_activity_at = EXCLUDED.last_activity_at,
        open_opportunity_count = EXCLUDED.open_opportunity_count,
        recent_documents = EXCLUDED.recent_documents,
        opportunity_stage = EXCLUDED.opportunity_stage,
        notes = EXCLUDED.notes,
        activities = EXCLUDED.activities;
END;
$$;


ALTER FUNCTION "public"."refresh_person_profile_lead"("p_lead_id" "uuid", "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_person_profile_on_demand"("p_person_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.refresh_person_profile(p_person_id);
END;
$$;


ALTER FUNCTION "public"."refresh_person_profile_on_demand"("p_person_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rehydrate_person_profiles"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Bring last_activity_at up to date for all existing profile rows
  UPDATE public.person_profile pp
  SET last_activity_at = sub.max_created
  FROM (
    SELECT a.related_id AS person_id, MAX(a.created_at) AS max_created
    FROM public.activities a
    GROUP BY a.related_id
  ) sub
  WHERE pp.person_id = sub.person_id;

  -- Bring open_opportunity_count up to date
  WITH counts AS (
    SELECT o.contact_id AS person_id, 'contact'::text AS person_type, COUNT(*)::int AS cnt
    FROM public.opportunities o
    WHERE o.contact_id IS NOT NULL AND o.stage IS DISTINCT FROM 'closed'
    GROUP BY o.contact_id
    UNION ALL
    SELECT o.lead_id AS person_id, 'lead'::text AS person_type, COUNT(*)::int AS cnt
    FROM public.opportunities o
    WHERE o.lead_id IS NOT NULL AND o.stage IS DISTINCT FROM 'closed'
    GROUP BY o.lead_id
  )
  UPDATE public.person_profile pp
  SET open_opportunity_count = COALESCE(c.cnt, 0)
  FROM counts c
  WHERE pp.person_id = c.person_id AND pp.person_type = c.person_type;

  -- Rebuild recent_documents with latest 10
  WITH ranked_docs AS (
    SELECT d.id, d.name, d.file_url, d.file_type, d.file_size, d.related_type, d.related_id, d.created_at,
           ROW_NUMBER() OVER (PARTITION BY d.related_type, d.related_id ORDER BY d.created_at DESC) AS rn
    FROM public.documents d
    WHERE d.related_type IN ('contact','lead')
  ),
  agg AS (
    SELECT related_id AS person_id,
           CASE WHEN related_type = 'contact' THEN 'contact' ELSE 'lead' END AS person_type,
           jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) AS docs
    FROM ranked_docs r
    WHERE r.rn <= 10
    GROUP BY related_id, related_type
  )
  UPDATE public.person_profile pp
  SET recent_documents = COALESCE(a.docs, '[]'::jsonb)
  FROM agg a
  WHERE pp.person_id = a.person_id AND pp.person_type = a.person_type;
END;
$$;


ALTER FUNCTION "public"."rehydrate_person_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_assigned_to_text"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.assigned_to_employee_id IS NOT NULL THEN
    SELECT concat_ws(' ', e.first_name, e.last_name)
    INTO NEW.assigned_to
    FROM public.employees e
    WHERE e.id = NEW.assigned_to_employee_id;
  ELSE
    -- If id cleared, also clear display text to avoid stale value
    NEW.assigned_to := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_assigned_to_text"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_bizdev_sources_created_date"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.created_at IS NOT NULL AND NEW.created_date IS NULL THEN
    NEW.created_date = NEW.created_at::date;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_bizdev_sources_created_date"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_bizdev_sources_created_date"() IS 'Trigger function to sync created_date from created_at';



CREATE OR REPLACE FUNCTION "public"."sync_created_date"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.created_at IS NOT NULL AND NEW.created_date IS NULL THEN
    NEW.created_date = NEW.created_at::date;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_created_date"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_created_date"() IS 'Generic trigger function to sync created_date from created_at';



CREATE OR REPLACE FUNCTION "public"."update_activities_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_activities_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ai_suggestions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ai_suggestions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_employees_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_employees_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tenant_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_tenant_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_tenant_updated_at"() IS 'Trigger function to auto-update updated_at timestamp';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_workers_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_person_profile"("p_person_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_person_type text;
  v_tenant_id uuid;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_job_title text;
  v_status text;
  v_account_id uuid;
  v_account_name text;
  v_updated_at timestamptz := now();
  v_last_activity_at timestamptz;
  v_open_opp_count int := 0;
  v_recent_documents jsonb := '[]'::jsonb;
  v_assigned_to text;
  v_idx int;
  v_opportunity_stages text[] := '{}'::text[];
  v_notes jsonb := '[]'::jsonb;
  v_activities jsonb := '[]'::jsonb;
BEGIN
  SELECT *
    INTO v_person_type, v_tenant_id, v_first_name, v_last_name, v_email, v_phone, v_job_title, v_status,
         v_account_id, v_account_name, v_assigned_to
  FROM (
    SELECT 'lead'::text AS person_type, l.tenant_id, l.first_name, l.last_name, l.email, l.phone, l.job_title, l.status,
           NULL::uuid AS account_id, l.company::text AS account_name, l.assigned_to::text AS assigned_to
    FROM public.leads l
    WHERE l.id = p_person_id
    UNION ALL
    SELECT 'contact'::text, c.tenant_id, c.first_name, c.last_name, c.email, COALESCE(c.mobile, c.phone), c.job_title, c.status,
           c.account_id, c.account_name::text, c.assigned_to_name::text
    FROM public.contacts c
    WHERE c.id = p_person_id
    LIMIT 1
  ) s;

  IF v_person_type IS NULL THEN
    RAISE NOTICE 'No lead or contact found for %', p_person_id;
    RETURN;
  END IF;

  SELECT MAX(a.created_date)
    INTO v_last_activity_at
  FROM public.activities a
  WHERE a.related_id = p_person_id;

  WITH opps AS (
    SELECT o.stage, o.updated_at
    FROM public.opportunities o
    WHERE (o.contact_id = p_person_id OR o.lead_id = p_person_id)
      AND COALESCE(o.stage, '') <> ''
      AND o.stage IS DISTINCT FROM 'closed'
  ),
  dedup AS (
    SELECT stage, MAX(updated_at) AS last_updated
    FROM opps
    GROUP BY stage
  )
  SELECT
    COALESCE((SELECT COUNT(*) FROM opps), 0),
    COALESCE(ARRAY(
      SELECT d.stage
      FROM dedup d
      ORDER BY d.last_updated DESC NULLS LAST
    ), '{}'::text[])
  INTO v_open_opp_count, v_opportunity_stages;

  SELECT COALESCE(jsonb_agg(doc ORDER BY doc.created_at DESC) FILTER (WHERE doc IS NOT NULL), '[]'::jsonb)
    INTO v_recent_documents
  FROM (
    SELECT d.id, d.name, d.file_url, d.file_type, d.created_at
    FROM public.documents d
    WHERE d.related_id = p_person_id
    ORDER BY d.created_at DESC
    LIMIT 5
  ) doc;

  SELECT COALESCE(jsonb_agg(nrow ORDER BY nrow.updated_at DESC) FILTER (WHERE nrow IS NOT NULL), '[]'::jsonb)
    INTO v_notes
  FROM (
    SELECT n.id, n.title, n.content, n.related_id, n.created_by, n.metadata, n.updated_at
    FROM public.note n
    WHERE n.related_id = p_person_id
    ORDER BY n.updated_at DESC
    LIMIT 50
  ) nrow;

  -- Activities: use related_id only, order by created_date desc nulls last, cap at 200
  SELECT COALESCE(jsonb_agg(arow ORDER BY arow.created_date DESC NULLS LAST) FILTER (WHERE arow IS NOT NULL), '[]'::jsonb)
    INTO v_activities
  FROM (
    SELECT a.id, a.type, a.subject, a.body, a.related_id, a.created_date, a.created_by, a.location,
           a.priority, a.due_date, a.due_time, a.assigned_to, a.status, a.outcome, a.ai_summary, a.key_points
    FROM public.activities a
    WHERE a.related_id = p_person_id
    ORDER BY a.created_date DESC NULLS LAST
    LIMIT 200
  ) arow;

  SELECT idx INTO v_idx FROM public.person_profile WHERE person_id = p_person_id;

  INSERT INTO public.person_profile AS pp (
    person_id, person_type, tenant_id, first_name, last_name, email, phone, job_title, status,
    account_id, account_name, updated_at, last_activity_at, open_opportunity_count, recent_documents,
    assigned_to, idx, opportunity_stage, notes, activities
  ) VALUES (
    p_person_id, v_person_type, v_tenant_id, v_first_name, v_last_name, v_email, v_phone, v_job_title, v_status,
    v_account_id, v_account_name, now(), v_last_activity_at, v_open_opp_count, v_recent_documents,
    v_assigned_to, v_idx, v_opportunity_stages, v_notes, v_activities
  )
  ON CONFLICT (person_id)
  DO UPDATE SET
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
    updated_at = EXCLUDED.updated_at,
    last_activity_at = EXCLUDED.last_activity_at,
    open_opportunity_count = EXCLUDED.open_opportunity_count,
    recent_documents = EXCLUDED.recent_documents,
    assigned_to = EXCLUDED.assigned_to,
    opportunity_stage = EXCLUDED.opportunity_stage,
    notes = EXCLUDED.notes,
    activities = EXCLUDED.activities;
END
$$;


ALTER FUNCTION "public"."upsert_person_profile"("p_person_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."uuid_advisory_key"("p" "uuid") RETURNS bigint
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT (42::bigint << 32) + (('x' || replace(p::text,'-',''))::bit(64))::bigint;
$$;


ALTER FUNCTION "public"."uuid_advisory_key"("p" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "name" "text" NOT NULL,
    "industry" "text",
    "website" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "annual_revenue" numeric(15,2),
    "is_test_data" boolean DEFAULT false,
    "phone" "text",
    "email" "text",
    "employee_count" integer,
    "street" "text",
    "city" "text",
    "state" "text",
    "zip" "text",
    "country" "text",
    "assigned_to" "text",
    "score" integer,
    "score_reason" "text",
    "ai_action" "text" DEFAULT 'none'::"text",
    "health_status" "text" DEFAULT 'unknown'::"text",
    "last_activity_date" "date",
    "next_action" "text",
    "activity_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "unique_id" "text",
    "processed_by_ai_doc" boolean DEFAULT false,
    "ai_doc_source_type" "text",
    "last_synced" timestamp with time zone,
    "legacy_id" "text",
    "notes" "text",
    "tenant_id" "uuid",
    "assigned_to_employee_id" "uuid",
    "account_type" "text" DEFAULT 'b2b'::"text",
    "is_placeholder" boolean DEFAULT false,
    "normalized_name" "text",
    CONSTRAINT "accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['b2b'::"text", 'b2c'::"text"]))),
    CONSTRAINT "accounts_ai_action_check" CHECK (("ai_action" = ANY (ARRAY['none'::"text", 'follow_up'::"text", 'nurture'::"text", 'upsell'::"text", 'at_risk'::"text", 'renew'::"text"]))),
    CONSTRAINT "accounts_ai_doc_source_type_check" CHECK ((("ai_doc_source_type" IS NULL) OR ("ai_doc_source_type" = ANY (ARRAY['business_card'::"text", 'document_extraction'::"text", 'web_scrape'::"text"])))),
    CONSTRAINT "accounts_health_status_check" CHECK (("health_status" = ANY (ARRAY['unknown'::"text", 'healthy'::"text", 'at_risk'::"text", 'churning'::"text", 'new'::"text"]))),
    CONSTRAINT "accounts_score_check" CHECK ((("score" >= 0) AND ("score" <= 100)))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."accounts"."tenant_id_text" IS 'DEPRECATED: Use tenant_id (UUID) instead';



CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "type" "text" NOT NULL,
    "subject" "text",
    "body" "text",
    "related_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "location" "text",
    "priority" "public"."activity_priority" DEFAULT 'normal'::"public"."activity_priority" NOT NULL,
    "due_date" "date",
    "due_time" time without time zone,
    "assigned_to" "text",
    "related_to" "text",
    "updated_date" timestamp with time zone,
    "is_test_data" boolean DEFAULT false,
    "status" "text" DEFAULT 'pending'::"text",
    "duration_minutes" integer,
    "competitor" "text",
    "lead_source" "text",
    "tags" "text"[],
    "outcome" "text",
    "ai_priority" "text" DEFAULT 'normal'::"text",
    "urgency_score" integer,
    "ai_action" "text" DEFAULT 'none'::"text",
    "sentiment" "text",
    "ai_summary" "text",
    "key_points" "jsonb" DEFAULT '[]'::"jsonb",
    "activity_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "unique_id" "text",
    "processed_by_ai_doc" boolean DEFAULT false,
    "ai_doc_source_type" "text",
    "last_synced" timestamp with time zone,
    "legacy_id" "text",
    "ai_call_config" "jsonb" DEFAULT '{}'::"jsonb",
    "ai_email_config" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "related_email" "text",
    "related_name" "text",
    "tenant_id" "uuid",
    "assigned_to_employee_id" "uuid",
    CONSTRAINT "activities_ai_action_check" CHECK (("ai_action" = ANY (ARRAY['none'::"text", 'complete'::"text", 'reschedule'::"text", 'delegate'::"text", 'escalate'::"text", 'cancel'::"text"]))),
    CONSTRAINT "activities_ai_doc_source_type_check" CHECK ((("ai_doc_source_type" IS NULL) OR ("ai_doc_source_type" = ANY (ARRAY['call_transcript'::"text", 'email'::"text", 'meeting_notes'::"text"])))),
    CONSTRAINT "activities_ai_priority_check" CHECK (("ai_priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text", 'critical'::"text"]))),
    CONSTRAINT "activities_sentiment_check" CHECK ((("sentiment" IS NULL) OR ("sentiment" = ANY (ARRAY['positive'::"text", 'neutral'::"text", 'negative'::"text", 'mixed'::"text"])))),
    CONSTRAINT "activities_urgency_score_check" CHECK ((("urgency_score" >= 0) AND ("urgency_score" <= 100)))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."activities"."tenant_id_text" IS 'DEPRECATED: Use tenant_id (UUID) instead';



COMMENT ON COLUMN "public"."activities"."priority" IS 'Activity priority level: low, normal, high, or urgent';



COMMENT ON COLUMN "public"."activities"."due_time" IS 'Time component of due date in HH:MM:SS format';



COMMENT ON COLUMN "public"."activities"."outcome" IS 'activity disposition';



CREATE TABLE IF NOT EXISTS "public"."ai_campaign" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'email'::"text",
    "status" "text" DEFAULT 'draft'::"text",
    "target_audience" "jsonb" DEFAULT '{}'::"jsonb",
    "content" "jsonb" DEFAULT '{}'::"jsonb",
    "scheduled_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "performance_metrics" "jsonb" DEFAULT '{}'::"jsonb",
    "target_contacts" "jsonb" DEFAULT '[]'::"jsonb",
    "description" "text",
    "tenant_id" "uuid"
);


ALTER TABLE "public"."ai_campaign" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ai_campaign"."performance_metrics" IS 'Aggregated campaign performance metrics: total_calls, successful_calls, failed_calls, appointments_set, leads_qualified, average_duration';



COMMENT ON COLUMN "public"."ai_campaign"."target_contacts" IS 'Array of contact IDs targeted by this campaign';



COMMENT ON COLUMN "public"."ai_campaign"."description" IS 'Campaign description or notes';



CREATE TABLE IF NOT EXISTS "public"."ai_suggestion_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "suggestion_id" "uuid" NOT NULL,
    "feedback_type" "text" NOT NULL,
    "rating" integer,
    "comment" "text",
    "outcome_positive" boolean,
    "correction_data" "jsonb",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_suggestion_feedback_feedback_type_check" CHECK (("feedback_type" = ANY (ARRAY['rating'::"text", 'comment'::"text", 'outcome'::"text", 'correction'::"text"]))),
    CONSTRAINT "ai_suggestion_feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."ai_suggestion_feedback" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_suggestion_feedback" IS 'Individual feedback events for AI suggestions';



CREATE TABLE IF NOT EXISTS "public"."ai_suggestion_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "time_bucket" timestamp with time zone NOT NULL,
    "bucket_size" "text" DEFAULT 'day'::"text" NOT NULL,
    "trigger_type" "text" NOT NULL,
    "suggestions_generated" integer DEFAULT 0,
    "suggestions_approved" integer DEFAULT 0,
    "suggestions_rejected" integer DEFAULT 0,
    "suggestions_applied" integer DEFAULT 0,
    "suggestions_expired" integer DEFAULT 0,
    "avg_confidence" numeric(4,3),
    "avg_execution_time_ms" integer,
    "avg_feedback_rating" numeric(3,2),
    "positive_outcomes" integer DEFAULT 0,
    "negative_outcomes" integer DEFAULT 0,
    "avg_review_time_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_suggestion_metrics" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_suggestion_metrics" IS 'Aggregated metrics for AI suggestion performance tracking';



CREATE TABLE IF NOT EXISTS "public"."ai_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "trigger_id" "text" NOT NULL,
    "trigger_context" "jsonb" DEFAULT '{}'::"jsonb",
    "record_type" "text",
    "record_id" "uuid",
    "action" "jsonb" NOT NULL,
    "confidence" numeric(3,2) DEFAULT 0.00,
    "reasoning" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "applied_at" timestamp with time zone,
    "apply_result" "jsonb",
    "feedback_rating" integer,
    "feedback_comment" "text",
    "outcome_tracked" boolean DEFAULT false,
    "outcome_positive" boolean,
    "outcome_measured_at" timestamp with time zone,
    "execution_time_ms" integer,
    "model_version" "text",
    CONSTRAINT "ai_suggestions_feedback_rating_check" CHECK ((("feedback_rating" >= 1) AND ("feedback_rating" <= 5))),
    CONSTRAINT "valid_confidence" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "valid_priority" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "valid_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'applied'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."ai_suggestions" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_suggestions" IS 'Phase 3: AI-generated suggestions awaiting human approval';



COMMENT ON COLUMN "public"."ai_suggestions"."trigger_id" IS 'Identifier for the trigger type (e.g., lead_stagnant, deal_decay)';



COMMENT ON COLUMN "public"."ai_suggestions"."action" IS 'Proposed Braid tool call with arguments';



COMMENT ON COLUMN "public"."ai_suggestions"."confidence" IS 'AI confidence score from 0.00 to 1.00';



COMMENT ON COLUMN "public"."ai_suggestions"."status" IS 'Workflow state: pending -> approved/rejected -> applied';



CREATE TABLE IF NOT EXISTS "public"."announcement" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "type" "text" DEFAULT 'info'::"text",
    "is_active" boolean DEFAULT true,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "target_roles" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."announcement" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_key" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "scopes" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "last_used" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."api_key" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apikey" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "key_name" "text" NOT NULL,
    "key_value" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "usage_count" integer DEFAULT 0,
    "last_used" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "tenant_id" "uuid"
);


ALTER TABLE "public"."apikey" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archive_index" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "archived_data" "jsonb" NOT NULL,
    "archived_by" "text",
    "archived_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."archive_index" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "user_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "changes" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bizdev_source" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'website'::"text",
    "url" "text",
    "status" "text" DEFAULT 'active'::"text",
    "last_scraped" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."bizdev_source" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bizdev_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "source" "text" NOT NULL,
    "source_type" "text",
    "source_url" "text",
    "contact_person" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "status" "text" DEFAULT 'active'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "leads_generated" integer DEFAULT 0,
    "opportunities_created" integer DEFAULT 0,
    "revenue_generated" numeric(15,2) DEFAULT 0,
    "notes" "text",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_test_data" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "tenant_id" "uuid",
    "company_name" "text",
    "batch_id" "text",
    "dba_name" "text",
    "industry" "text",
    "website" "text",
    "email" "text",
    "phone_number" "text",
    "address_line_1" "text",
    "address_line_2" "text",
    "city" "text",
    "state_province" "text",
    "postal_code" "text",
    "country" "text",
    "lead_ids" "jsonb" DEFAULT '[]'::"jsonb",
    "industry_license" "text",
    "license_status" "public"."license_status",
    "license_expiry_date" "date",
    "archived_at" timestamp with time zone,
    "account_id" "uuid",
    "account_name" "text"
);


ALTER TABLE "public"."bizdev_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cache_key" "text" NOT NULL,
    "cache_value" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_flow" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "transaction_date" "date" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "type" "text" NOT NULL,
    "category" "text",
    "description" "text",
    "account_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."cash_flow" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkpoint" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "checkpoint_data" "jsonb" NOT NULL,
    "version" integer DEFAULT 1,
    "created_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."checkpoint" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_requirement" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "due_date" "date",
    "assigned_to" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid",
    "assigned_to_employee_id" "uuid"
);


ALTER TABLE "public"."client_requirement" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."construction_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "pay_rate" numeric(10,2),
    "bill_rate" numeric(10,2),
    "rate_type" "text" DEFAULT 'hourly'::"text",
    "status" "text" DEFAULT 'Active'::"text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "construction_assignments_rate_type_check" CHECK (("rate_type" = ANY (ARRAY['hourly'::"text", 'daily'::"text", 'weekly'::"text", 'fixed'::"text"]))),
    CONSTRAINT "construction_assignments_status_check" CHECK (("status" = ANY (ARRAY['Pending'::"text", 'Active'::"text", 'Completed'::"text", 'Cancelled'::"text"])))
);


ALTER TABLE "public"."construction_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."construction_assignments" IS 'Worker assignments to construction projects - core staffing piece';



COMMENT ON COLUMN "public"."construction_assignments"."worker_id" IS 'FK to workers table - the assigned worker (replaces contact_id)';



COMMENT ON COLUMN "public"."construction_assignments"."role" IS 'Worker role on this project: Laborer, Carpenter, Electrician, etc.';



COMMENT ON COLUMN "public"."construction_assignments"."pay_rate" IS 'What you pay the worker (rate per rate_type unit)';



COMMENT ON COLUMN "public"."construction_assignments"."bill_rate" IS 'What you bill the client (rate per rate_type unit)';



CREATE TABLE IF NOT EXISTS "public"."construction_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "project_name" "text" NOT NULL,
    "account_id" "uuid",
    "lead_id" "uuid",
    "site_name" "text",
    "site_address" "text",
    "project_manager_contact_id" "uuid",
    "supervisor_contact_id" "uuid",
    "start_date" "date",
    "end_date" "date",
    "project_value" numeric(15,2),
    "status" "text" DEFAULT 'Planned'::"text",
    "description" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "construction_projects_status_check" CHECK (("status" = ANY (ARRAY['Planned'::"text", 'Active'::"text", 'Completed'::"text", 'Cancelled'::"text", 'On Hold'::"text"])))
);


ALTER TABLE "public"."construction_projects" OWNER TO "postgres";


COMMENT ON TABLE "public"."construction_projects" IS 'Construction projects for staffing companies - tracks client projects and site details';



COMMENT ON COLUMN "public"."construction_projects"."account_id" IS 'FK to accounts - the client construction company';



COMMENT ON COLUMN "public"."construction_projects"."project_manager_contact_id" IS 'FK to contacts - primary project manager';



COMMENT ON COLUMN "public"."construction_projects"."supervisor_contact_id" IS 'FK to contacts - on-site supervisor';



COMMENT ON COLUMN "public"."construction_projects"."project_value" IS 'Contract value or expected revenue from this project';



CREATE TABLE IF NOT EXISTS "public"."contact_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid",
    "tenant_id_text" "text",
    "field_name" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "changed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."contact_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "account_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "is_test_data" boolean DEFAULT false,
    "mobile" "text",
    "lead_source" "text",
    "address_1" "text",
    "address_2" "text",
    "city" "text",
    "state" "text",
    "zip" "text",
    "country" "text",
    "tags_jsonb_old" "jsonb" DEFAULT '[]'::"jsonb",
    "unique_id" "text",
    "assigned_to_name" "text",
    "account_name" "text",
    "account_industry" "text",
    "notes" "text",
    "score" integer,
    "score_reason" "text",
    "ai_action" "text" DEFAULT 'none'::"text",
    "last_contacted" "date",
    "next_action" "text",
    "activity_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "legacy_id" "text",
    "processed_by_ai_doc" boolean DEFAULT false,
    "ai_doc_source_type" "text",
    "last_synced" timestamp with time zone,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "job_title" "text",
    "department" "text",
    "assigned_to" "uuid",
    "tenant_id" "uuid",
    "worker_role" "text",
    "source_id" "uuid",
    CONSTRAINT "contacts_ai_action_check" CHECK (("ai_action" = ANY (ARRAY['none'::"text", 'follow_up'::"text", 'nurture'::"text", 'qualify'::"text", 'disqualify'::"text"]))),
    CONSTRAINT "contacts_ai_doc_source_type_check" CHECK ((("ai_doc_source_type" IS NULL) OR ("ai_doc_source_type" = ANY (ARRAY['business_card'::"text", 'document_extraction'::"text"])))),
    CONSTRAINT "contacts_score_check" CHECK ((("score" >= 0) AND ("score" <= 100)))
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."contacts"."tenant_id_text" IS 'DEPRECATED: Use tenant_id (UUID) instead';



COMMENT ON COLUMN "public"."contacts"."worker_role" IS 'Optional role tag: Worker, ProjectManager, Supervisor, ClientContact';



CREATE TABLE IF NOT EXISTS "public"."conversation_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" character varying(50) NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."conversation_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_name" character varying(255) DEFAULT 'crm_assistant'::character varying NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "status" character varying(50) DEFAULT 'active'::character varying
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cron_job" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "name" "text" NOT NULL,
    "schedule" "text" NOT NULL,
    "function_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "last_run" timestamp with time zone,
    "next_run" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."cron_job" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_sales_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "metric_date" "date" NOT NULL,
    "total_revenue" numeric(15,2) DEFAULT 0,
    "new_deals" integer DEFAULT 0,
    "closed_deals" integer DEFAULT 0,
    "pipeline_value" numeric(15,2) DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."daily_sales_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documentation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "is_published" boolean DEFAULT false,
    "author" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."documentation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" character varying(500) NOT NULL,
    "description" "text",
    "file_url" "text",
    "file_type" character varying(100),
    "file_size" bigint,
    "storage_path" "text",
    "related_type" character varying(50),
    "related_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."documents" IS 'Stores document metadata with AI classification. File content stored in Supabase Storage.';



COMMENT ON COLUMN "public"."documents"."related_type" IS 'Entity type this document is attached to (opportunity, account, contact, lead)';



COMMENT ON COLUMN "public"."documents"."metadata" IS 'JSONB field for AI classification, tags, and custom attributes';



CREATE TABLE IF NOT EXISTS "public"."email_template" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "type" "text" DEFAULT 'marketing'::"text",
    "variables" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."email_template" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_labels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "entity_key" "text" NOT NULL,
    "custom_label" "text" NOT NULL,
    "custom_label_singular" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."entity_labels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."field_customization" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "entity_type" "text" NOT NULL,
    "field_name" "text" NOT NULL,
    "label" "text",
    "is_visible" boolean DEFAULT true,
    "is_required" boolean DEFAULT false,
    "options" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."field_customization" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."file" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "filename" "text" NOT NULL,
    "filepath" "text" NOT NULL,
    "filesize" bigint,
    "mimetype" "text",
    "related_type" "text",
    "related_id" "uuid",
    "uploaded_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."file" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guide_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text",
    "order_index" integer DEFAULT 0,
    "is_published" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."guide_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "entity_type" "text" NOT NULL,
    "filename" "text",
    "status" "text" DEFAULT 'processing'::"text",
    "total_records" integer DEFAULT 0,
    "success_count" integer DEFAULT 0,
    "error_count" integer DEFAULT 0,
    "errors" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "tenant_id" "uuid"
);


ALTER TABLE "public"."import_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "company" "text",
    "status" "text" DEFAULT 'new'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "phone" "text",
    "source" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "job_title" "text",
    "is_test_data" boolean DEFAULT false,
    "score" integer,
    "score_reason" "text",
    "ai_action" "text" DEFAULT 'none'::"text",
    "qualification_status" "text" DEFAULT 'unqualified'::"text",
    "conversion_probability" numeric(5,4),
    "last_contacted" "date",
    "next_action" "text",
    "activity_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "address_1" "text",
    "address_2" "text",
    "city" "text",
    "state" "text",
    "zip" "text",
    "country" "text",
    "tags_jsonb_old" "jsonb" DEFAULT '[]'::"jsonb",
    "unique_id" "text",
    "processed_by_ai_doc" boolean DEFAULT false,
    "ai_doc_source_type" "text",
    "last_synced" timestamp with time zone,
    "legacy_id" "text",
    "estimated_value" numeric(15,2),
    "do_not_call" boolean DEFAULT false,
    "do_not_text" boolean DEFAULT false,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "assigned_to" "uuid",
    "tenant_id" "uuid" NOT NULL,
    "source_id" "uuid",
    "lead_type" "text" DEFAULT 'b2b'::"text",
    "person_id" "uuid",
    CONSTRAINT "leads_ai_action_check" CHECK (("ai_action" = ANY (ARRAY['none'::"text", 'qualify'::"text", 'nurture'::"text", 'disqualify'::"text", 'convert'::"text", 'follow_up'::"text"]))),
    CONSTRAINT "leads_ai_doc_source_type_check" CHECK ((("ai_doc_source_type" IS NULL) OR ("ai_doc_source_type" = ANY (ARRAY['business_card'::"text", 'document_extraction'::"text", 'web_form'::"text", 'import'::"text"])))),
    CONSTRAINT "leads_b2c_requires_person" CHECK ((("lead_type" <> 'b2c'::"text") OR ("person_id" IS NOT NULL))),
    CONSTRAINT "leads_conversion_probability_check" CHECK ((("conversion_probability" >= (0)::numeric) AND ("conversion_probability" <= (1)::numeric))),
    CONSTRAINT "leads_lead_type_check" CHECK (("lead_type" = ANY (ARRAY['b2b'::"text", 'b2c'::"text"]))),
    CONSTRAINT "leads_qualification_status_check" CHECK (("qualification_status" = ANY (ARRAY['unqualified'::"text", 'mql'::"text", 'sql'::"text", 'sal'::"text", 'disqualified'::"text"]))),
    CONSTRAINT "leads_score_check" CHECK ((("score" >= 0) AND ("score" <= 100)))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."leads"."tenant_id_text" IS 'DEPRECATED: Use tenant_id (UUID) instead';



CREATE TABLE IF NOT EXISTS "public"."note" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "title" "text",
    "content" "text",
    "related_type" "text",
    "related_id" "uuid",
    "created_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."note" OWNER TO "postgres";


COMMENT ON COLUMN "public"."note"."tenant_id_text" IS 'DEPRECATED: Use tenant_id (UUID) instead';



CREATE OR REPLACE VIEW "public"."lead_detail_full" AS
 WITH "last_act" AS (
         SELECT "a_1"."related_id" AS "lead_id",
            "a_1"."id" AS "activity_id",
            "a_1"."type" AS "activity_type",
            "a_1"."subject",
            "a_1"."status" AS "activity_status",
            "a_1"."created_at" AS "activity_created_at",
            "row_number"() OVER (PARTITION BY "a_1"."related_id" ORDER BY "a_1"."created_at" DESC) AS "rn"
           FROM "public"."activities" "a_1"
          WHERE ("a_1"."related_id" IS NOT NULL)
        ), "notes_count" AS (
         SELECT "n"."related_id" AS "lead_id",
            "count"(*) AS "notes_count"
           FROM "public"."note" "n"
          WHERE ("n"."related_type" = 'lead'::"text")
          GROUP BY "n"."related_id"
        ), "activities_count" AS (
         SELECT "a_1"."related_id" AS "lead_id",
            "count"(*) AS "activities_count"
           FROM "public"."activities" "a_1"
          GROUP BY "a_1"."related_id"
        )
 SELECT "l"."id" AS "lead_id",
    "l"."tenant_id",
    "l"."first_name",
    "l"."last_name",
    "l"."email",
    "l"."phone",
    "l"."company",
    "l"."status",
    "l"."score",
    "l"."ai_action",
    "l"."qualification_status",
    "l"."conversion_probability",
    "l"."last_contacted",
    "l"."next_action",
    "l"."created_at",
    "l"."updated_at",
    "la"."activity_id",
    "la"."activity_type",
    "la"."subject" AS "last_activity_subject",
    "la"."activity_status",
    "la"."activity_created_at",
    "ac"."activities_count",
    "nc"."notes_count",
    "c"."account_id",
    "a"."name" AS "account_name"
   FROM ((((("public"."leads" "l"
     LEFT JOIN "last_act" "la" ON ((("la"."lead_id" = "l"."id") AND ("la"."rn" = 1))))
     LEFT JOIN "activities_count" "ac" ON (("ac"."lead_id" = "l"."id")))
     LEFT JOIN "notes_count" "nc" ON (("nc"."lead_id" = "l"."id")))
     LEFT JOIN "public"."contacts" "c" ON (("c"."id" = ( SELECT "c2"."id"
           FROM "public"."contacts" "c2"
          WHERE (("c2"."email" = "l"."email") OR ("c2"."phone" = "l"."phone"))
          ORDER BY "c2"."created_at" DESC NULLS LAST
         LIMIT 1))))
     LEFT JOIN "public"."accounts" "a" ON (("a"."id" = "c"."account_id")));


ALTER VIEW "public"."lead_detail_full" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."name_to_employee" (
    "id" bigint NOT NULL,
    "tenant_id" "uuid",
    "employee_name" "text" NOT NULL,
    "employee_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."name_to_employee" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."lead_detail_light" AS
 SELECT "l"."id" AS "lead_id",
    "l"."tenant_id",
    "l"."first_name",
    "l"."last_name",
    "l"."email",
    "l"."phone",
    "l"."company",
    "l"."status",
    "l"."score",
    "l"."ai_action",
    "l"."qualification_status",
    "l"."conversion_probability",
    "l"."last_contacted",
    "l"."next_action",
    "l"."created_at",
    "l"."updated_at",
    "ne"."employee_id" AS "assigned_to_employee_id",
    "e"."first_name" AS "assigned_employee_first_name",
    "e"."last_name" AS "assigned_employee_last_name",
    "c"."account_id",
    "a"."name" AS "account_name"
   FROM (((("public"."leads" "l"
     LEFT JOIN "public"."contacts" "c" ON (("c"."id" = ( SELECT "c2"."id"
           FROM "public"."contacts" "c2"
          WHERE (("c2"."email" = "l"."email") OR ("c2"."phone" = "l"."phone"))
          ORDER BY "c2"."created_at" DESC NULLS LAST
         LIMIT 1))))
     LEFT JOIN "public"."accounts" "a" ON (("a"."id" = "c"."account_id")))
     LEFT JOIN "public"."name_to_employee" "ne" ON (("ne"."employee_name" = "l"."next_action")))
     LEFT JOIN "public"."employees" "e" ON (("e"."id" = "ne"."employee_id")));


ALTER VIEW "public"."lead_detail_light" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "tenant_id_text" "text",
    "field_name" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "changed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."lead_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modulesettings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "module_name" "text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "is_enabled" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."modulesettings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."name_to_employee_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."name_to_employee_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."name_to_employee_id_seq" OWNED BY "public"."name_to_employee"."id";



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "user_email" "text" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text",
    "message" "text",
    "is_read" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "tenant_id" "uuid"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "name" "text" NOT NULL,
    "stage" "text" DEFAULT 'qualification'::"text",
    "amount" numeric(15,2),
    "probability" integer DEFAULT 0,
    "close_date" "date",
    "account_id" "uuid",
    "contact_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone DEFAULT "now"(),
    "is_test_data" boolean DEFAULT false,
    "description" "text",
    "expected_revenue" numeric,
    "next_step" "text",
    "lead_source" "text",
    "tags" "text"[],
    "ai_health" "text" DEFAULT 'unknown'::"text",
    "win_probability" numeric(5,4),
    "risk_factors" "jsonb" DEFAULT '[]'::"jsonb",
    "ai_action" "text" DEFAULT 'none'::"text",
    "score" integer,
    "score_reason" "text",
    "last_activity_date" "date",
    "next_action" "text",
    "days_in_stage" integer DEFAULT 0,
    "activity_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "competitors" "jsonb" DEFAULT '[]'::"jsonb",
    "unique_id" "text",
    "processed_by_ai_doc" boolean DEFAULT false,
    "ai_doc_source_type" "text",
    "last_synced" timestamp with time zone,
    "legacy_id" "text",
    "lead_id" "uuid",
    "type" "text",
    "competitor" "text",
    "source" "text",
    "notes" "text",
    "tenant_id" "uuid",
    "assigned_to" "uuid",
    CONSTRAINT "opportunities_ai_action_check" CHECK (("ai_action" = ANY (ARRAY['none'::"text", 'follow_up'::"text", 'negotiate'::"text", 'close'::"text", 'nurture'::"text", 'escalate'::"text", 'rescue'::"text"]))),
    CONSTRAINT "opportunities_ai_doc_source_type_check" CHECK ((("ai_doc_source_type" IS NULL) OR ("ai_doc_source_type" = ANY (ARRAY['proposal'::"text", 'contract'::"text", 'email_thread'::"text"])))),
    CONSTRAINT "opportunities_ai_health_check" CHECK (("ai_health" = ANY (ARRAY['unknown'::"text", 'healthy'::"text", 'at_risk'::"text", 'stalled'::"text", 'closing'::"text"]))),
    CONSTRAINT "opportunities_score_check" CHECK ((("score" >= 0) AND ("score" <= 100))),
    CONSTRAINT "opportunities_win_probability_check" CHECK ((("win_probability" >= (0)::numeric) AND ("win_probability" <= (1)::numeric)))
);


ALTER TABLE "public"."opportunities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."opportunities"."tenant_id_text" IS 'DEPRECATED: Use tenant_id (UUID) instead';



CREATE TABLE IF NOT EXISTS "public"."performance_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "operation" "text" NOT NULL,
    "duration" integer NOT NULL,
    "status" "text" DEFAULT 'success'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."performance_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "method" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "status_code" integer,
    "duration_ms" integer NOT NULL,
    "response_time_ms" integer,
    "db_query_time_ms" integer DEFAULT 0,
    "user_email" "text",
    "ip_address" "text",
    "user_agent" "text",
    "error_message" "text",
    "error_stack" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."performance_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."performance_logs" IS 'API performance metrics and request tracking';



COMMENT ON COLUMN "public"."performance_logs"."duration_ms" IS 'Total request duration in milliseconds';



COMMENT ON COLUMN "public"."performance_logs"."response_time_ms" IS 'Time to first byte in milliseconds';



COMMENT ON COLUMN "public"."performance_logs"."db_query_time_ms" IS 'Database query execution time';



CREATE TABLE IF NOT EXISTS "public"."person_profile" (
    "person_id" "uuid" NOT NULL,
    "person_type" "text" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "job_title" "text",
    "status" "text",
    "account_id" "uuid",
    "account_name" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_activity_at" timestamp with time zone,
    "open_opportunity_count" integer DEFAULT 0 NOT NULL,
    "recent_documents" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "assigned_to" "text",
    "idx" integer,
    "opportunity_stage" "text"[] DEFAULT '{}'::"text"[],
    "notes" "jsonb" DEFAULT '[]'::"jsonb",
    "activities" "jsonb" DEFAULT '[]'::"jsonb",
    "ai_summary" "text"[],
    "ai_summary_updated_at" timestamp with time zone,
    "opportunity_name" "text",
    "opportunity_last_activity_date" timestamp with time zone,
    CONSTRAINT "person_profile_person_type_check" CHECK (("person_type" = ANY (ARRAY['lead'::"text", 'contact'::"text"])))
);


ALTER TABLE "public"."person_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "plan_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "start_date" "date",
    "end_date" "date",
    "stripe_subscription_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."subscription" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plan" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(15,2) NOT NULL,
    "billing_cycle" "text" DEFAULT 'monthly'::"text",
    "features" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription_plan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."synchealth" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "status" "text" DEFAULT 'unknown'::"text",
    "last_sync" timestamp with time zone,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."synchealth" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "level" "text" NOT NULL,
    "message" "text" NOT NULL,
    "source" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "stack_trace" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_email" "text",
    "user_agent" "text",
    "url" "text",
    "created_date" timestamp with time zone,
    "tenant_id" "uuid"
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" integer NOT NULL,
    "settings" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."systembranding" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "name" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "tenant_id" "uuid"
);


ALTER TABLE "public"."systembranding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "branding_settings" "jsonb" DEFAULT '{}'::"jsonb",
    "subscription_tier" "text" DEFAULT 'free'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "domain" "text",
    "country" "text",
    "industry" "text",
    "major_city" "text",
    "display_order" integer DEFAULT 0,
    "business_model" "text",
    "geographic_focus" "text",
    "elevenlabs_agent_id" "text"
);


ALTER TABLE "public"."tenant" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_integration" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "integration_type" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "last_sync" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."tenant_integration" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "integration_type" "text" NOT NULL,
    "integration_name" "text",
    "is_active" boolean DEFAULT true,
    "api_credentials" "jsonb" DEFAULT '{}'::"jsonb",
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "tenant_id" "uuid"
);


ALTER TABLE "public"."tenant_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_report" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "test_suite" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "results" "jsonb" DEFAULT '{}'::"jsonb",
    "duration" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."test_report" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_invitation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'user'::"text",
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "invited_by" "text",
    "expires_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."user_invitation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "password_hash" "text",
    "first_name" "text",
    "last_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role" character varying(50) DEFAULT 'employee'::character varying,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id_text" "text",
    "status" "text" DEFAULT 'active'::"text",
    "tenant_id" "uuid"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."tenant_id_text" IS 'NULL for superadmins (global access), specific tenant_id for tenant-scoped admins';



CREATE OR REPLACE VIEW "public"."v_activity_stream" AS
 SELECT "tenant_id",
    "unique_id",
    "id" AS "activity_id",
    "type",
    "subject",
    "status",
    "created_at",
    "updated_at",
    "assigned_to_employee_id" AS "assigned_to"
   FROM "public"."activities" "a"
  WHERE ("unique_id" IS NOT NULL);


ALTER VIEW "public"."v_activity_stream" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_crm_records" AS
 WITH "lead_base" AS (
         SELECT "leads"."tenant_id",
            "leads"."unique_id",
            "leads"."id" AS "record_id",
            'lead'::"text" AS "record_type",
            COALESCE((("leads"."first_name" || ' '::"text") || "leads"."last_name"), "leads"."company", "leads"."email") AS "title",
            "leads"."email",
            "leads"."phone",
            "leads"."status",
            "leads"."updated_at",
            "leads"."assigned_to"
           FROM "public"."leads"
          WHERE ("leads"."unique_id" IS NOT NULL)
        ), "contact_base" AS (
         SELECT "contacts"."tenant_id",
            "contacts"."unique_id",
            "contacts"."id" AS "record_id",
            'contact'::"text" AS "record_type",
            COALESCE((("contacts"."first_name" || ' '::"text") || "contacts"."last_name"), "contacts"."email", "contacts"."phone") AS "title",
            "contacts"."email",
            "contacts"."phone",
            "contacts"."status",
            "contacts"."updated_at",
            "contacts"."assigned_to"
           FROM "public"."contacts"
          WHERE ("contacts"."unique_id" IS NOT NULL)
        ), "opportunity_base" AS (
         SELECT "opportunities"."tenant_id",
            "opportunities"."unique_id",
            "opportunities"."id" AS "record_id",
            'opportunity'::"text" AS "record_type",
            "opportunities"."name" AS "title",
            NULL::"text" AS "email",
            NULL::"text" AS "phone",
            "opportunities"."stage" AS "status",
            "opportunities"."updated_at",
            "opportunities"."assigned_to"
           FROM "public"."opportunities"
          WHERE ("opportunities"."unique_id" IS NOT NULL)
        ), "account_base" AS (
         SELECT "accounts"."tenant_id",
            "accounts"."unique_id",
            "accounts"."id" AS "record_id",
            'account'::"text" AS "record_type",
            "accounts"."name" AS "title",
            "accounts"."email",
            "accounts"."phone",
            "accounts"."type" AS "status",
            "accounts"."updated_at",
            "accounts"."assigned_to_employee_id" AS "assigned_to"
           FROM "public"."accounts"
          WHERE ("accounts"."unique_id" IS NOT NULL)
        )
 SELECT "lead_base"."tenant_id",
    "lead_base"."unique_id",
    "lead_base"."record_id",
    "lead_base"."record_type",
    "lead_base"."title",
    "lead_base"."email",
    "lead_base"."phone",
    "lead_base"."status",
    "lead_base"."updated_at",
    "lead_base"."assigned_to"
   FROM "lead_base"
UNION ALL
 SELECT "contact_base"."tenant_id",
    "contact_base"."unique_id",
    "contact_base"."record_id",
    "contact_base"."record_type",
    "contact_base"."title",
    "contact_base"."email",
    "contact_base"."phone",
    "contact_base"."status",
    "contact_base"."updated_at",
    "contact_base"."assigned_to"
   FROM "contact_base"
UNION ALL
 SELECT "opportunity_base"."tenant_id",
    "opportunity_base"."unique_id",
    "opportunity_base"."record_id",
    "opportunity_base"."record_type",
    "opportunity_base"."title",
    "opportunity_base"."email",
    "opportunity_base"."phone",
    "opportunity_base"."status",
    "opportunity_base"."updated_at",
    "opportunity_base"."assigned_to"
   FROM "opportunity_base"
UNION ALL
 SELECT "account_base"."tenant_id",
    "account_base"."unique_id",
    "account_base"."record_id",
    "account_base"."record_type",
    "account_base"."title",
    "account_base"."email",
    "account_base"."phone",
    "account_base"."status",
    "account_base"."updated_at",
    "account_base"."assigned_to"
   FROM "account_base";


ALTER VIEW "public"."v_crm_records" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_my_queue" AS
 WITH "lead_q" AS (
         SELECT "leads"."tenant_id",
            "leads"."unique_id",
            "leads"."id" AS "record_id",
            'lead'::"text" AS "record_type",
            COALESCE((("leads"."first_name" || ' '::"text") || "leads"."last_name"), "leads"."company", "leads"."email") AS "title",
            "leads"."status",
            "leads"."updated_at",
            "leads"."assigned_to"
           FROM "public"."leads"
          WHERE (("leads"."assigned_to" IS NOT NULL) AND ("leads"."unique_id" IS NOT NULL))
        ), "contact_q" AS (
         SELECT "contacts"."tenant_id",
            "contacts"."unique_id",
            "contacts"."id" AS "record_id",
            'contact'::"text" AS "record_type",
            COALESCE((("contacts"."first_name" || ' '::"text") || "contacts"."last_name"), "contacts"."email", "contacts"."phone") AS "title",
            "contacts"."status",
            "contacts"."updated_at",
            "contacts"."assigned_to"
           FROM "public"."contacts"
          WHERE (("contacts"."assigned_to" IS NOT NULL) AND ("contacts"."unique_id" IS NOT NULL))
        ), "opp_q" AS (
         SELECT "opportunities"."tenant_id",
            "opportunities"."unique_id",
            "opportunities"."id" AS "record_id",
            'opportunity'::"text" AS "record_type",
            "opportunities"."name" AS "title",
            "opportunities"."stage" AS "status",
            "opportunities"."updated_at",
            "opportunities"."assigned_to"
           FROM "public"."opportunities"
          WHERE (("opportunities"."assigned_to" IS NOT NULL) AND ("opportunities"."unique_id" IS NOT NULL))
        ), "account_q" AS (
         SELECT "accounts"."tenant_id",
            "accounts"."unique_id",
            "accounts"."id" AS "record_id",
            'account'::"text" AS "record_type",
            "accounts"."name" AS "title",
            "accounts"."type" AS "status",
            "accounts"."updated_at",
            "accounts"."assigned_to_employee_id" AS "assigned_to"
           FROM "public"."accounts"
          WHERE (("accounts"."assigned_to_employee_id" IS NOT NULL) AND ("accounts"."unique_id" IS NOT NULL))
        )
 SELECT "lead_q"."tenant_id",
    "lead_q"."unique_id",
    "lead_q"."record_id",
    "lead_q"."record_type",
    "lead_q"."title",
    "lead_q"."status",
    "lead_q"."updated_at",
    "lead_q"."assigned_to"
   FROM "lead_q"
UNION ALL
 SELECT "contact_q"."tenant_id",
    "contact_q"."unique_id",
    "contact_q"."record_id",
    "contact_q"."record_type",
    "contact_q"."title",
    "contact_q"."status",
    "contact_q"."updated_at",
    "contact_q"."assigned_to"
   FROM "contact_q"
UNION ALL
 SELECT "opp_q"."tenant_id",
    "opp_q"."unique_id",
    "opp_q"."record_id",
    "opp_q"."record_type",
    "opp_q"."title",
    "opp_q"."status",
    "opp_q"."updated_at",
    "opp_q"."assigned_to"
   FROM "opp_q"
UNION ALL
 SELECT "account_q"."tenant_id",
    "account_q"."unique_id",
    "account_q"."record_id",
    "account_q"."record_type",
    "account_q"."title",
    "account_q"."status",
    "account_q"."updated_at",
    "account_q"."assigned_to"
   FROM "account_q";


ALTER VIEW "public"."v_my_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "url" "text" NOT NULL,
    "event_types" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "secret" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."webhook" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "first_name" character varying(255) NOT NULL,
    "last_name" character varying(255) NOT NULL,
    "email" character varying(255),
    "phone" character varying(50),
    "worker_type" character varying(50) DEFAULT 'Contractor'::character varying,
    "status" character varying(20) DEFAULT 'Active'::character varying,
    "primary_skill" character varying(100),
    "skills" "text"[] DEFAULT '{}'::"text"[],
    "certifications" "text"[] DEFAULT '{}'::"text"[],
    "default_pay_rate" numeric(10,2),
    "default_rate_type" character varying(20) DEFAULT 'hourly'::character varying,
    "available_from" "date",
    "available_until" "date",
    "emergency_contact_name" character varying(255),
    "emergency_contact_phone" character varying(50),
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "workers_default_rate_type_check" CHECK ((("default_rate_type")::"text" = ANY ((ARRAY['hourly'::character varying, 'daily'::character varying, 'weekly'::character varying, 'fixed'::character varying])::"text"[]))),
    CONSTRAINT "workers_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['Active'::character varying, 'Inactive'::character varying, 'Blacklisted'::character varying])::"text"[]))),
    CONSTRAINT "workers_worker_type_check" CHECK ((("worker_type")::"text" = ANY ((ARRAY['Contractor'::character varying, 'Temp Labor'::character varying, 'Subcontractor'::character varying])::"text"[])))
);


ALTER TABLE "public"."workers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id_text" "text",
    "name" "text" NOT NULL,
    "description" "text",
    "trigger_type" "text" NOT NULL,
    "trigger_config" "jsonb" DEFAULT '{}'::"jsonb",
    "actions" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."workflow" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_execution" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid",
    "tenant_id_text" "text",
    "status" "text" DEFAULT 'running'::"text",
    "trigger_data" "jsonb" DEFAULT '{}'::"jsonb",
    "execution_log" "jsonb" DEFAULT '[]'::"jsonb",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."workflow_execution" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_template" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "category" character varying(100) DEFAULT 'general'::character varying,
    "tenant_id" "uuid",
    "template_nodes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "template_connections" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "trigger_type" character varying(50) DEFAULT 'webhook'::character varying,
    "trigger_config" "jsonb" DEFAULT '{}'::"jsonb",
    "parameters" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "use_cases" "text"[] DEFAULT '{}'::"text"[],
    "is_active" boolean DEFAULT true,
    "is_system" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow_template" OWNER TO "postgres";


ALTER TABLE ONLY "public"."name_to_employee" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."name_to_employee_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_campaign"
    ADD CONSTRAINT "ai_campaign_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_suggestion_feedback"
    ADD CONSTRAINT "ai_suggestion_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_suggestion_metrics"
    ADD CONSTRAINT "ai_suggestion_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_suggestion_metrics"
    ADD CONSTRAINT "ai_suggestion_metrics_tenant_id_time_bucket_bucket_size_tri_key" UNIQUE ("tenant_id", "time_bucket", "bucket_size", "trigger_type");



ALTER TABLE ONLY "public"."ai_suggestions"
    ADD CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement"
    ADD CONSTRAINT "announcement_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_key"
    ADD CONSTRAINT "api_key_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apikey"
    ADD CONSTRAINT "apikey_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archive_index"
    ADD CONSTRAINT "archive_index_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bizdev_source"
    ADD CONSTRAINT "bizdev_source_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bizdev_sources"
    ADD CONSTRAINT "bizdev_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cache"
    ADD CONSTRAINT "cache_cache_key_key" UNIQUE ("cache_key");



ALTER TABLE ONLY "public"."cache"
    ADD CONSTRAINT "cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_flow"
    ADD CONSTRAINT "cash_flow_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkpoint"
    ADD CONSTRAINT "checkpoint_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_requirement"
    ADD CONSTRAINT "client_requirement_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."construction_assignments"
    ADD CONSTRAINT "construction_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."construction_assignments"
    ADD CONSTRAINT "construction_assignments_project_id_worker_id_role_key" UNIQUE ("project_id", "worker_id", "role");



ALTER TABLE ONLY "public"."construction_projects"
    ADD CONSTRAINT "construction_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_history"
    ADD CONSTRAINT "contact_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_job"
    ADD CONSTRAINT "cron_job_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_sales_metrics"
    ADD CONSTRAINT "daily_sales_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_sales_metrics"
    ADD CONSTRAINT "daily_sales_metrics_tenant_id_metric_date_key" UNIQUE ("tenant_id_text", "metric_date");



ALTER TABLE ONLY "public"."documentation"
    ADD CONSTRAINT "documentation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_template"
    ADD CONSTRAINT "email_template_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_labels"
    ADD CONSTRAINT "entity_labels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_labels"
    ADD CONSTRAINT "entity_labels_tenant_id_entity_key_key" UNIQUE ("tenant_id", "entity_key");



ALTER TABLE ONLY "public"."field_customization"
    ADD CONSTRAINT "field_customization_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_customization"
    ADD CONSTRAINT "field_customization_tenant_id_entity_type_field_name_key" UNIQUE ("tenant_id_text", "entity_type", "field_name");



ALTER TABLE ONLY "public"."file"
    ADD CONSTRAINT "file_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guide_content"
    ADD CONSTRAINT "guide_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_log"
    ADD CONSTRAINT "import_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_history"
    ADD CONSTRAINT "lead_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modulesettings"
    ADD CONSTRAINT "modulesettings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modulesettings"
    ADD CONSTRAINT "modulesettings_tenant_module_unique" UNIQUE ("tenant_id", "module_name");



ALTER TABLE ONLY "public"."name_to_employee"
    ADD CONSTRAINT "name_to_employee_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."note"
    ADD CONSTRAINT "note_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_log"
    ADD CONSTRAINT "performance_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_logs"
    ADD CONSTRAINT "performance_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."person_profile"
    ADD CONSTRAINT "person_profile_pkey" PRIMARY KEY ("person_id");



ALTER TABLE ONLY "public"."subscription"
    ADD CONSTRAINT "subscription_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plan"
    ADD CONSTRAINT "subscription_plan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."synchealth"
    ADD CONSTRAINT "synchealth_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."systembranding"
    ADD CONSTRAINT "systembranding_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_integration"
    ADD CONSTRAINT "tenant_integration_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_integration"
    ADD CONSTRAINT "tenant_integration_tenant_id_integration_type_key" UNIQUE ("tenant_id_text", "integration_type");



ALTER TABLE ONLY "public"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant"
    ADD CONSTRAINT "tenant_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant"
    ADD CONSTRAINT "tenant_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."test_report"
    ADD CONSTRAINT "test_report_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_invitation"
    ADD CONSTRAINT "user_invitation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_invitation"
    ADD CONSTRAINT "user_invitation_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook"
    ADD CONSTRAINT "webhook_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_execution"
    ADD CONSTRAINT "workflow_execution_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow"
    ADD CONSTRAINT "workflow_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_template"
    ADD CONSTRAINT "workflow_template_pkey" PRIMARY KEY ("id");



CREATE INDEX "accounts_tenant_id_idx" ON "public"."accounts" USING "btree" ("tenant_id");



CREATE INDEX "activities_created_at_idx" ON "public"."activities" USING "btree" ("created_at");



CREATE INDEX "apikey_tenant_id_idx" ON "public"."apikey" USING "btree" ("tenant_id");



CREATE INDEX "bizdev_sources_account_id_idx" ON "public"."bizdev_sources" USING "btree" ("account_id");



CREATE INDEX "bizdev_sources_lead_ids_gin" ON "public"."bizdev_sources" USING "gin" ("lead_ids");



CREATE INDEX "bizdev_sources_tenant_id_idx" ON "public"."bizdev_sources" USING "btree" ("tenant_id");



CREATE INDEX "contacts_created_at_idx" ON "public"."contacts" USING "btree" ("created_at");



CREATE INDEX "employees_email_idx" ON "public"."employees" USING "btree" ("email");



CREATE INDEX "idx_accounts_ai_action" ON "public"."accounts" USING "btree" ("ai_action") WHERE ("ai_action" <> 'none'::"text");



CREATE INDEX "idx_accounts_assigned_to" ON "public"."accounts" USING "btree" ("tenant_id_text", "assigned_to");



CREATE INDEX "idx_accounts_assigned_to_employee_id" ON "public"."accounts" USING "btree" ("assigned_to_employee_id");



CREATE INDEX "idx_accounts_city" ON "public"."accounts" USING "btree" ("city") WHERE ("city" IS NOT NULL);



CREATE INDEX "idx_accounts_email" ON "public"."accounts" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_accounts_health_status" ON "public"."accounts" USING "btree" ("health_status") WHERE ("health_status" <> 'unknown'::"text");



CREATE INDEX "idx_accounts_is_test_data" ON "public"."accounts" USING "btree" ("is_test_data");



CREATE INDEX "idx_accounts_last_activity_date" ON "public"."accounts" USING "btree" ("last_activity_date") WHERE ("last_activity_date" IS NOT NULL);



CREATE INDEX "idx_accounts_normalized_name" ON "public"."accounts" USING "btree" ("tenant_id", "normalized_name");



CREATE INDEX "idx_accounts_phone" ON "public"."accounts" USING "btree" ("phone") WHERE ("phone" IS NOT NULL);



CREATE INDEX "idx_accounts_revenue" ON "public"."accounts" USING "btree" ("annual_revenue" DESC) WHERE ("annual_revenue" IS NOT NULL);



CREATE INDEX "idx_accounts_score" ON "public"."accounts" USING "btree" ("score") WHERE ("score" IS NOT NULL);



CREATE INDEX "idx_accounts_state" ON "public"."accounts" USING "btree" ("state") WHERE ("state" IS NOT NULL);



CREATE INDEX "idx_accounts_tags" ON "public"."accounts" USING "gin" ("tags");



CREATE INDEX "idx_accounts_tenant" ON "public"."accounts" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_accounts_tenant_id" ON "public"."accounts" USING "btree" ("tenant_id");



CREATE INDEX "idx_accounts_tenant_type" ON "public"."accounts" USING "btree" ("tenant_id", "account_type");



CREATE INDEX "idx_accounts_type" ON "public"."accounts" USING "btree" ("tenant_id_text", "type");



CREATE INDEX "idx_accounts_unique_id" ON "public"."accounts" USING "btree" ("unique_id") WHERE ("unique_id" IS NOT NULL);



CREATE INDEX "idx_activities_ai_action" ON "public"."activities" USING "btree" ("ai_action") WHERE ("ai_action" <> 'none'::"text");



CREATE INDEX "idx_activities_ai_priority" ON "public"."activities" USING "btree" ("ai_priority") WHERE ("ai_priority" <> 'normal'::"text");



CREATE INDEX "idx_activities_assigned_to" ON "public"."activities" USING "btree" ("tenant_id_text", "assigned_to");



CREATE INDEX "idx_activities_assigned_to_employee_id" ON "public"."activities" USING "btree" ("assigned_to_employee_id");



CREATE INDEX "idx_activities_created_by" ON "public"."activities" USING "btree" ("tenant_id_text", "created_by");



CREATE INDEX "idx_activities_created_date" ON "public"."activities" USING "btree" ("tenant_id_text", "created_date" DESC);



CREATE INDEX "idx_activities_due_date" ON "public"."activities" USING "btree" ("tenant_id_text", "due_date") WHERE ("due_date" IS NOT NULL);



CREATE INDEX "idx_activities_duration" ON "public"."activities" USING "btree" ("tenant_id_text", "duration_minutes") WHERE ("duration_minutes" IS NOT NULL);



CREATE INDEX "idx_activities_is_test_data" ON "public"."activities" USING "btree" ("is_test_data");



CREATE INDEX "idx_activities_outcome" ON "public"."activities" USING "btree" ("outcome") WHERE ("outcome" IS NOT NULL);



CREATE INDEX "idx_activities_priority" ON "public"."activities" USING "btree" ("tenant_id_text", "priority") WHERE ("priority" = ANY (ARRAY['high'::"public"."activity_priority", 'urgent'::"public"."activity_priority"]));



CREATE INDEX "idx_activities_related_email" ON "public"."activities" USING "btree" ("tenant_id_text", "related_email") WHERE ("related_email" IS NOT NULL);



CREATE INDEX "idx_activities_related_id" ON "public"."activities" USING "btree" ("related_id");



CREATE INDEX "idx_activities_related_name" ON "public"."activities" USING "btree" ("tenant_id_text", "related_name") WHERE ("related_name" IS NOT NULL);



CREATE INDEX "idx_activities_sentiment" ON "public"."activities" USING "btree" ("sentiment") WHERE ("sentiment" IS NOT NULL);



CREATE INDEX "idx_activities_status" ON "public"."activities" USING "btree" ("status") WHERE ("status" IS NOT NULL);



CREATE INDEX "idx_activities_tags" ON "public"."activities" USING "gin" ("tags");



CREATE INDEX "idx_activities_tenant" ON "public"."activities" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_activities_tenant_created_at" ON "public"."activities" USING "btree" ("tenant_id_text", "created_at" DESC);



CREATE INDEX "idx_activities_tenant_created_date" ON "public"."activities" USING "btree" ("tenant_id_text", "created_date");



CREATE INDEX "idx_activities_tenant_id" ON "public"."activities" USING "btree" ("tenant_id");



CREATE INDEX "idx_activities_unique_id" ON "public"."activities" USING "btree" ("unique_id") WHERE ("unique_id" IS NOT NULL);



CREATE INDEX "idx_activities_updated_date" ON "public"."activities" USING "btree" ("tenant_id_text", "updated_date" DESC);



CREATE INDEX "idx_activities_urgency_score" ON "public"."activities" USING "btree" ("urgency_score") WHERE ("urgency_score" IS NOT NULL);



CREATE INDEX "idx_ai_campaign_tenant" ON "public"."ai_campaign" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_ai_campaign_tenant_id" ON "public"."ai_campaign" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_suggestion_feedback_lookup" ON "public"."ai_suggestion_feedback" USING "btree" ("tenant_id", "suggestion_id", "created_at");



CREATE INDEX "idx_ai_suggestion_metrics_lookup" ON "public"."ai_suggestion_metrics" USING "btree" ("tenant_id", "time_bucket", "trigger_type");



CREATE INDEX "idx_ai_suggestions_expires" ON "public"."ai_suggestions" USING "btree" ("expires_at") WHERE (("status" = 'pending'::"text") AND ("expires_at" IS NOT NULL));



CREATE INDEX "idx_ai_suggestions_record" ON "public"."ai_suggestions" USING "btree" ("record_type", "record_id");



CREATE INDEX "idx_ai_suggestions_telemetry" ON "public"."ai_suggestions" USING "btree" ("tenant_id", "trigger_id", "status", "created_at");



CREATE INDEX "idx_ai_suggestions_tenant_pending" ON "public"."ai_suggestions" USING "btree" ("tenant_id", "created_at" DESC) WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_ai_suggestions_tenant_status" ON "public"."ai_suggestions" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_ai_suggestions_trigger" ON "public"."ai_suggestions" USING "btree" ("trigger_id");



CREATE INDEX "idx_announcement_active" ON "public"."announcement" USING "btree" ("is_active", "start_date", "end_date");



CREATE INDEX "idx_announcement_tenant_id" ON "public"."announcement" USING "btree" ("tenant_id");



CREATE INDEX "idx_api_key_tenant" ON "public"."api_key" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_api_key_tenant_id" ON "public"."api_key" USING "btree" ("tenant_id");



CREATE INDEX "idx_apikey_tenant" ON "public"."apikey" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_apikey_tenant_id" ON "public"."apikey" USING "btree" ("tenant_id");



CREATE INDEX "idx_archive_index_tenant" ON "public"."archive_index" USING "btree" ("tenant_id_text", "entity_type");



CREATE INDEX "idx_archive_index_tenant_id" ON "public"."archive_index" USING "btree" ("tenant_id");



CREATE INDEX "idx_audit_log_tenant" ON "public"."audit_log" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_audit_log_tenant_id" ON "public"."audit_log" USING "btree" ("tenant_id");



CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("tenant_id_text", "user_email");



CREATE INDEX "idx_bizdev_source_tenant" ON "public"."bizdev_source" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_bizdev_source_tenant_id" ON "public"."bizdev_source" USING "btree" ("tenant_id");



CREATE INDEX "idx_bizdev_sources_priority" ON "public"."bizdev_sources" USING "btree" ("priority");



CREATE INDEX "idx_bizdev_sources_status" ON "public"."bizdev_sources" USING "btree" ("status");



CREATE INDEX "idx_bizdev_sources_tenant" ON "public"."bizdev_sources" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_bizdev_sources_tenant_id" ON "public"."bizdev_sources" USING "btree" ("tenant_id");



CREATE INDEX "idx_bizdev_sources_type" ON "public"."bizdev_sources" USING "btree" ("source_type");



CREATE INDEX "idx_cache_expires" ON "public"."cache" USING "btree" ("expires_at");



CREATE INDEX "idx_cash_flow_account_id" ON "public"."cash_flow" USING "btree" ("account_id");



COMMENT ON INDEX "public"."idx_cash_flow_account_id" IS 'Performance index for cash_flow.account_id foreign key (joins with accounts table)';



CREATE INDEX "idx_cash_flow_date" ON "public"."cash_flow" USING "btree" ("tenant_id_text", "transaction_date");



CREATE INDEX "idx_cash_flow_tenant" ON "public"."cash_flow" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_cash_flow_tenant_id" ON "public"."cash_flow" USING "btree" ("tenant_id");



CREATE INDEX "idx_checkpoint_tenant" ON "public"."checkpoint" USING "btree" ("tenant_id_text", "entity_type", "entity_id");



CREATE INDEX "idx_checkpoint_tenant_id" ON "public"."checkpoint" USING "btree" ("tenant_id");



CREATE INDEX "idx_client_requirement_assigned_to_employee_id" ON "public"."client_requirement" USING "btree" ("assigned_to_employee_id");



CREATE INDEX "idx_client_requirement_tenant" ON "public"."client_requirement" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_client_requirement_tenant_id" ON "public"."client_requirement" USING "btree" ("tenant_id");



CREATE INDEX "idx_construction_assignments_contact_id" ON "public"."construction_assignments" USING "btree" ("worker_id");



CREATE INDEX "idx_construction_assignments_project_id" ON "public"."construction_assignments" USING "btree" ("project_id");



CREATE INDEX "idx_construction_assignments_role" ON "public"."construction_assignments" USING "btree" ("role");



CREATE INDEX "idx_construction_assignments_status" ON "public"."construction_assignments" USING "btree" ("status");



CREATE INDEX "idx_construction_assignments_tenant_id" ON "public"."construction_assignments" USING "btree" ("tenant_id");



CREATE INDEX "idx_construction_projects_account_id" ON "public"."construction_projects" USING "btree" ("account_id");



CREATE INDEX "idx_construction_projects_end_date" ON "public"."construction_projects" USING "btree" ("end_date");



CREATE INDEX "idx_construction_projects_start_date" ON "public"."construction_projects" USING "btree" ("start_date");



CREATE INDEX "idx_construction_projects_status" ON "public"."construction_projects" USING "btree" ("status");



CREATE INDEX "idx_construction_projects_tenant_id" ON "public"."construction_projects" USING "btree" ("tenant_id");



CREATE INDEX "idx_contact_history_contact" ON "public"."contact_history" USING "btree" ("contact_id");



CREATE INDEX "idx_contact_history_tenant_id" ON "public"."contact_history" USING "btree" ("tenant_id");



CREATE INDEX "idx_contacts_account_id" ON "public"."contacts" USING "btree" ("account_id");



COMMENT ON INDEX "public"."idx_contacts_account_id" IS 'Performance index for contacts.account_id foreign key (joins with accounts table)';



CREATE INDEX "idx_contacts_ai_action" ON "public"."contacts" USING "btree" ("ai_action") WHERE ("ai_action" <> 'none'::"text");



CREATE INDEX "idx_contacts_assigned_to" ON "public"."contacts" USING "btree" ("tenant_id_text", "assigned_to") WHERE ("assigned_to" IS NOT NULL);



CREATE INDEX "idx_contacts_assigned_updated" ON "public"."contacts" USING "btree" ("assigned_to", "updated_at" DESC);



CREATE INDEX "idx_contacts_city" ON "public"."contacts" USING "btree" ("city") WHERE ("city" IS NOT NULL);



CREATE INDEX "idx_contacts_is_test_data" ON "public"."contacts" USING "btree" ("is_test_data");



CREATE INDEX "idx_contacts_job_title" ON "public"."contacts" USING "btree" ("tenant_id_text", "job_title") WHERE ("job_title" IS NOT NULL);



CREATE INDEX "idx_contacts_last_contacted" ON "public"."contacts" USING "btree" ("last_contacted") WHERE ("last_contacted" IS NOT NULL);



CREATE INDEX "idx_contacts_lead_source" ON "public"."contacts" USING "btree" ("lead_source") WHERE ("lead_source" IS NOT NULL);



CREATE INDEX "idx_contacts_score" ON "public"."contacts" USING "btree" ("score") WHERE ("score" IS NOT NULL);



CREATE INDEX "idx_contacts_state" ON "public"."contacts" USING "btree" ("state") WHERE ("state" IS NOT NULL);



CREATE INDEX "idx_contacts_status" ON "public"."contacts" USING "btree" ("tenant_id_text", "status");



CREATE INDEX "idx_contacts_tags" ON "public"."contacts" USING "gin" ("tags_jsonb_old");



CREATE INDEX "idx_contacts_tenant" ON "public"."contacts" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_contacts_tenant_id" ON "public"."contacts" USING "btree" ("tenant_id");



CREATE INDEX "idx_contacts_unique_id" ON "public"."contacts" USING "btree" ("unique_id") WHERE ("unique_id" IS NOT NULL);



CREATE INDEX "idx_contacts_worker_role" ON "public"."contacts" USING "btree" ("worker_role") WHERE ("worker_role" IS NOT NULL);



CREATE INDEX "idx_conversations_agent_name" ON "public"."conversations" USING "btree" ("agent_name");



CREATE INDEX "idx_conversations_created_date" ON "public"."conversations" USING "btree" ("created_date" DESC);



CREATE INDEX "idx_conversations_status" ON "public"."conversations" USING "btree" ("status");



CREATE INDEX "idx_conversations_tenant_id" ON "public"."conversations" USING "btree" ("tenant_id");



CREATE INDEX "idx_cron_job_active" ON "public"."cron_job" USING "btree" ("is_active", "next_run");



CREATE INDEX "idx_cron_job_tenant_id" ON "public"."cron_job" USING "btree" ("tenant_id");



CREATE INDEX "idx_daily_sales_metrics_tenant" ON "public"."daily_sales_metrics" USING "btree" ("tenant_id_text", "metric_date");



CREATE INDEX "idx_daily_sales_metrics_tenant_id" ON "public"."daily_sales_metrics" USING "btree" ("tenant_id");



CREATE INDEX "idx_documents_created_at" ON "public"."documents" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_documents_file_type" ON "public"."documents" USING "btree" ("file_type");



CREATE INDEX "idx_documents_related" ON "public"."documents" USING "btree" ("related_type", "related_id");



CREATE INDEX "idx_documents_tenant_id" ON "public"."documents" USING "btree" ("tenant_id");



CREATE INDEX "idx_email_template_tenant" ON "public"."email_template" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_email_template_tenant_id" ON "public"."email_template" USING "btree" ("tenant_id");



CREATE INDEX "idx_employees_is_test_data" ON "public"."employees" USING "btree" ("tenant_id_text", "is_test_data") WHERE ("is_test_data" = true);



CREATE INDEX "idx_employees_tenant" ON "public"."employees" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_employees_tenant_id" ON "public"."employees" USING "btree" ("tenant_id");



CREATE INDEX "idx_entity_labels_tenant_id" ON "public"."entity_labels" USING "btree" ("tenant_id");



CREATE INDEX "idx_field_customization_tenant" ON "public"."field_customization" USING "btree" ("tenant_id_text", "entity_type");



CREATE INDEX "idx_field_customization_tenant_id" ON "public"."field_customization" USING "btree" ("tenant_id");



CREATE INDEX "idx_file_related" ON "public"."file" USING "btree" ("tenant_id_text", "related_type", "related_id");



CREATE INDEX "idx_file_tenant" ON "public"."file" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_file_tenant_id" ON "public"."file" USING "btree" ("tenant_id");



CREATE INDEX "idx_import_log_tenant" ON "public"."import_log" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_import_log_tenant_id" ON "public"."import_log" USING "btree" ("tenant_id");



CREATE INDEX "idx_lead_history_lead" ON "public"."lead_history" USING "btree" ("lead_id");



CREATE INDEX "idx_lead_history_tenant_id" ON "public"."lead_history" USING "btree" ("tenant_id");



CREATE INDEX "idx_leads_ai_action" ON "public"."leads" USING "btree" ("ai_action") WHERE ("ai_action" <> 'none'::"text");



CREATE INDEX "idx_leads_assigned_to" ON "public"."leads" USING "btree" ("tenant_id_text", "assigned_to") WHERE ("assigned_to" IS NOT NULL);



CREATE INDEX "idx_leads_assigned_updated" ON "public"."leads" USING "btree" ("assigned_to", "updated_at" DESC);



CREATE INDEX "idx_leads_city" ON "public"."leads" USING "btree" ("city") WHERE ("city" IS NOT NULL);



CREATE INDEX "idx_leads_do_not_call" ON "public"."leads" USING "btree" ("tenant_id_text", "do_not_call") WHERE ("do_not_call" = true);



CREATE INDEX "idx_leads_do_not_text" ON "public"."leads" USING "btree" ("tenant_id_text", "do_not_text") WHERE ("do_not_text" = true);



CREATE INDEX "idx_leads_is_test_data" ON "public"."leads" USING "btree" ("is_test_data");



CREATE INDEX "idx_leads_job_title" ON "public"."leads" USING "btree" ("tenant_id_text", "job_title");



CREATE INDEX "idx_leads_last_contacted" ON "public"."leads" USING "btree" ("last_contacted") WHERE ("last_contacted" IS NOT NULL);



CREATE INDEX "idx_leads_person" ON "public"."leads" USING "btree" ("person_id");



CREATE INDEX "idx_leads_qualification_status" ON "public"."leads" USING "btree" ("qualification_status") WHERE ("qualification_status" <> 'unqualified'::"text");



CREATE INDEX "idx_leads_score" ON "public"."leads" USING "btree" ("score") WHERE ("score" IS NOT NULL);



CREATE INDEX "idx_leads_source_id" ON "public"."leads" USING "btree" ("source_id");



CREATE INDEX "idx_leads_state" ON "public"."leads" USING "btree" ("state") WHERE ("state" IS NOT NULL);



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("tenant_id_text", "status");



CREATE INDEX "idx_leads_tags" ON "public"."leads" USING "gin" ("tags_jsonb_old");



CREATE INDEX "idx_leads_tenant" ON "public"."leads" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_leads_tenant_created_date" ON "public"."leads" USING "btree" ("tenant_id_text", "created_date");



CREATE INDEX "idx_leads_tenant_id" ON "public"."leads" USING "btree" ("tenant_id");



CREATE INDEX "idx_leads_tenant_status" ON "public"."leads" USING "btree" ("tenant_id_text", "status");



CREATE INDEX "idx_leads_tenant_updated" ON "public"."leads" USING "btree" ("tenant_id", "updated_at" DESC);



CREATE INDEX "idx_leads_unique_id" ON "public"."leads" USING "btree" ("unique_id") WHERE ("unique_id" IS NOT NULL);



CREATE INDEX "idx_messages_conversation_id" ON "public"."conversation_messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_created_date" ON "public"."conversation_messages" USING "btree" ("created_date");



CREATE INDEX "idx_modulesettings_tenant" ON "public"."modulesettings" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_modulesettings_tenant_id" ON "public"."modulesettings" USING "btree" ("tenant_id");



CREATE INDEX "idx_note_related" ON "public"."note" USING "btree" ("tenant_id_text", "related_type", "related_id");



CREATE INDEX "idx_note_related_id" ON "public"."note" USING "btree" ("related_id");



CREATE INDEX "idx_note_tenant" ON "public"."note" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_note_tenant_id" ON "public"."note" USING "btree" ("tenant_id");



CREATE INDEX "idx_notifications_tenant" ON "public"."notifications" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_notifications_tenant_id" ON "public"."notifications" USING "btree" ("tenant_id");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("tenant_id_text", "user_email");



CREATE INDEX "idx_opportunities_account_id" ON "public"."opportunities" USING "btree" ("account_id");



COMMENT ON INDEX "public"."idx_opportunities_account_id" IS 'Performance index for opportunities.account_id foreign key (joins with accounts table)';



CREATE INDEX "idx_opportunities_ai_action" ON "public"."opportunities" USING "btree" ("ai_action") WHERE ("ai_action" <> 'none'::"text");



CREATE INDEX "idx_opportunities_ai_health" ON "public"."opportunities" USING "btree" ("ai_health") WHERE ("ai_health" <> 'unknown'::"text");



CREATE INDEX "idx_opportunities_assigned_to" ON "public"."opportunities" USING "btree" ("assigned_to");



CREATE INDEX "idx_opportunities_contact" ON "public"."opportunities" USING "btree" ("contact_id");



CREATE INDEX "idx_opportunities_contact_id" ON "public"."opportunities" USING "btree" ("contact_id");



COMMENT ON INDEX "public"."idx_opportunities_contact_id" IS 'Performance index for opportunities.contact_id foreign key (joins with contacts table)';



CREATE INDEX "idx_opportunities_is_test_data" ON "public"."opportunities" USING "btree" ("is_test_data");



CREATE INDEX "idx_opportunities_last_activity_date" ON "public"."opportunities" USING "btree" ("last_activity_date") WHERE ("last_activity_date" IS NOT NULL);



CREATE INDEX "idx_opportunities_lead" ON "public"."opportunities" USING "btree" ("lead_id");



CREATE INDEX "idx_opportunities_lead_id" ON "public"."opportunities" USING "btree" ("tenant_id_text", "lead_id");



CREATE INDEX "idx_opportunities_score" ON "public"."opportunities" USING "btree" ("score") WHERE ("score" IS NOT NULL);



CREATE INDEX "idx_opportunities_source" ON "public"."opportunities" USING "btree" ("tenant_id_text", "source") WHERE ("source" IS NOT NULL);



CREATE INDEX "idx_opportunities_stage" ON "public"."opportunities" USING "btree" ("stage");



CREATE INDEX "idx_opportunities_tags" ON "public"."opportunities" USING "gin" ("tags");



CREATE INDEX "idx_opportunities_tenant" ON "public"."opportunities" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_opportunities_tenant_id" ON "public"."opportunities" USING "btree" ("tenant_id");



CREATE INDEX "idx_opportunities_tenant_stage" ON "public"."opportunities" USING "btree" ("tenant_id_text", "stage");



CREATE INDEX "idx_opportunities_tenant_stage_won" ON "public"."opportunities" USING "btree" ("tenant_id_text") WHERE ("stage" = ANY (ARRAY['won'::"text", 'closed_won'::"text"]));



CREATE INDEX "idx_opportunities_tenant_updated_at" ON "public"."opportunities" USING "btree" ("tenant_id_text", "updated_at" DESC);



CREATE INDEX "idx_opportunities_type" ON "public"."opportunities" USING "btree" ("tenant_id_text", "type") WHERE ("type" IS NOT NULL);



CREATE INDEX "idx_opportunities_unique_id" ON "public"."opportunities" USING "btree" ("unique_id") WHERE ("unique_id" IS NOT NULL);



CREATE INDEX "idx_opportunities_win_probability" ON "public"."opportunities" USING "btree" ("win_probability") WHERE ("win_probability" IS NOT NULL);



CREATE INDEX "idx_perflogs_tenant_id" ON "public"."performance_logs" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_performance_log_tenant" ON "public"."performance_log" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_performance_log_tenant_id" ON "public"."performance_log" USING "btree" ("tenant_id");



CREATE INDEX "idx_performance_logs_created_at" ON "public"."performance_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_performance_logs_duration" ON "public"."performance_logs" USING "btree" ("duration_ms");



CREATE INDEX "idx_performance_logs_endpoint" ON "public"."performance_logs" USING "btree" ("endpoint");



CREATE INDEX "idx_performance_logs_status" ON "public"."performance_logs" USING "btree" ("status_code");



CREATE INDEX "idx_performance_logs_tenant" ON "public"."performance_logs" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_performance_logs_tenant_created" ON "public"."performance_logs" USING "btree" ("tenant_id_text", "created_at" DESC);



CREATE INDEX "idx_performance_logs_tenant_id" ON "public"."performance_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_person_profile_ai_summary_updated_at" ON "public"."person_profile" USING "btree" ("ai_summary_updated_at" DESC NULLS LAST);



CREATE INDEX "idx_person_profile_person" ON "public"."person_profile" USING "btree" ("person_id");



CREATE INDEX "idx_person_profile_tenant" ON "public"."person_profile" USING "btree" ("tenant_id");



CREATE INDEX "idx_person_profile_tenant_updated" ON "public"."person_profile" USING "btree" ("tenant_id", "updated_at" DESC);



CREATE INDEX "idx_subscription_plan_id" ON "public"."subscription" USING "btree" ("plan_id");



COMMENT ON INDEX "public"."idx_subscription_plan_id" IS 'Performance index for subscription.plan_id foreign key (joins with subscription_plan table)';



CREATE INDEX "idx_subscription_tenant_id" ON "public"."subscription" USING "btree" ("tenant_id");



CREATE INDEX "idx_synchealth_last_sync" ON "public"."synchealth" USING "btree" ("last_sync" DESC);



CREATE INDEX "idx_synchealth_status" ON "public"."synchealth" USING "btree" ("status");



CREATE INDEX "idx_synchealth_tenant" ON "public"."synchealth" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_synchealth_tenant_id" ON "public"."synchealth" USING "btree" ("tenant_id");



CREATE INDEX "idx_system_logs_level" ON "public"."system_logs" USING "btree" ("tenant_id_text", "level");



CREATE INDEX "idx_system_logs_tenant" ON "public"."system_logs" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_system_logs_tenant_id" ON "public"."system_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_system_logs_user" ON "public"."system_logs" USING "btree" ("tenant_id_text", "user_email");



CREATE INDEX "idx_systembranding_tenant" ON "public"."systembranding" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_systembranding_tenant_id" ON "public"."systembranding" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_integration_tenant" ON "public"."tenant_integration" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_tenant_integration_tenant_id" ON "public"."tenant_integration" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_integrations_active" ON "public"."tenant_integrations" USING "btree" ("tenant_id_text", "is_active");



CREATE INDEX "idx_tenant_integrations_tenant" ON "public"."tenant_integrations" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_tenant_integrations_tenant_id" ON "public"."tenant_integrations" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_integrations_type" ON "public"."tenant_integrations" USING "btree" ("tenant_id_text", "integration_type");



CREATE INDEX "idx_tenant_status" ON "public"."tenant" USING "btree" ("status");



CREATE INDEX "idx_tenant_tenant_id" ON "public"."tenant" USING "btree" ("tenant_id");



CREATE INDEX "idx_test_report_tenant" ON "public"."test_report" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_test_report_tenant_id" ON "public"."test_report" USING "btree" ("tenant_id");



CREATE INDEX "idx_user_invitation_tenant" ON "public"."user_invitation" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_user_invitation_tenant_id" ON "public"."user_invitation" USING "btree" ("tenant_id");



CREATE INDEX "idx_user_invitation_token" ON "public"."user_invitation" USING "btree" ("token");



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE INDEX "idx_users_tenant_id" ON "public"."users" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_webhook_tenant" ON "public"."webhook" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_webhook_tenant_id" ON "public"."webhook" USING "btree" ("tenant_id");



CREATE INDEX "idx_workers_name_search" ON "public"."workers" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((("first_name")::"text" || ' '::"text") || ("last_name")::"text")));



CREATE INDEX "idx_workers_primary_skill" ON "public"."workers" USING "btree" ("primary_skill");



CREATE INDEX "idx_workers_skills" ON "public"."workers" USING "gin" ("skills");



CREATE INDEX "idx_workers_status" ON "public"."workers" USING "btree" ("status");



CREATE INDEX "idx_workers_tenant_id" ON "public"."workers" USING "btree" ("tenant_id");



CREATE INDEX "idx_workers_worker_type" ON "public"."workers" USING "btree" ("worker_type");



CREATE INDEX "idx_workflow_execution_tenant" ON "public"."workflow_execution" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_workflow_execution_tenant_id" ON "public"."workflow_execution" USING "btree" ("tenant_id");



CREATE INDEX "idx_workflow_execution_workflow" ON "public"."workflow_execution" USING "btree" ("workflow_id");



CREATE INDEX "idx_workflow_template_active" ON "public"."workflow_template" USING "btree" ("is_active");



CREATE INDEX "idx_workflow_template_category" ON "public"."workflow_template" USING "btree" ("category");



CREATE INDEX "idx_workflow_template_system" ON "public"."workflow_template" USING "btree" ("is_system");



CREATE INDEX "idx_workflow_template_tenant" ON "public"."workflow_template" USING "btree" ("tenant_id");



CREATE INDEX "idx_workflow_tenant" ON "public"."workflow" USING "btree" ("tenant_id_text");



CREATE INDEX "idx_workflow_tenant_id" ON "public"."workflow" USING "btree" ("tenant_id");



CREATE INDEX "leads_created_at_idx" ON "public"."leads" USING "btree" ("created_at");



CREATE INDEX "leads_created_at_idx1" ON "public"."leads" USING "btree" ("created_at");



CREATE INDEX "opportunities_created_date_idx" ON "public"."opportunities" USING "btree" ("created_date");



CREATE UNIQUE INDEX "uq_name_to_employee_tenant_name" ON "public"."name_to_employee" USING "btree" ("tenant_id", "employee_name");



CREATE INDEX "users_tenant_id_idx" ON "public"."users" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "ux_person_profile_person_id" ON "public"."person_profile" USING "btree" ("person_id");



CREATE OR REPLACE TRIGGER "accounts_sync_assigned_to" BEFORE INSERT OR UPDATE OF "assigned_to_employee_id" ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."sync_assigned_to_text"();



CREATE OR REPLACE TRIGGER "activities_sync_assigned_to" BEFORE INSERT OR UPDATE OF "assigned_to_employee_id" ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."sync_assigned_to_text"();



CREATE OR REPLACE TRIGGER "activities_updated_at_trigger" BEFORE UPDATE ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."update_activities_updated_at"();



CREATE OR REPLACE TRIGGER "client_req_sync_assigned_to" BEFORE INSERT OR UPDATE OF "assigned_to_employee_id" ON "public"."client_requirement" FOR EACH ROW EXECUTE FUNCTION "public"."sync_assigned_to_text"();



CREATE OR REPLACE TRIGGER "employees_updated_at_trigger" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."update_employees_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_updated_at_trigger" BEFORE UPDATE ON "public"."tenant" FOR EACH ROW EXECUTE FUNCTION "public"."update_tenant_updated_at"();



CREATE OR REPLACE TRIGGER "trg_activity_refresh_person" AFTER INSERT OR DELETE OR UPDATE ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."_tg_refresh_person_on_activity"();



CREATE OR REPLACE TRIGGER "trg_ai_suggestions_updated_at" BEFORE UPDATE ON "public"."ai_suggestions" FOR EACH ROW EXECUTE FUNCTION "public"."update_ai_suggestions_updated_at"();



CREATE OR REPLACE TRIGGER "trg_document_refresh_person" AFTER INSERT OR DELETE OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."_tg_refresh_person_on_document"();



CREATE OR REPLACE TRIGGER "trg_employees_cascade_name_update" AFTER UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."employees_cascade_name_update"();



CREATE OR REPLACE TRIGGER "trg_name_to_employee_updated_at" BEFORE UPDATE ON "public"."name_to_employee" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_note_refresh_person" AFTER INSERT OR DELETE OR UPDATE ON "public"."note" FOR EACH ROW EXECUTE FUNCTION "public"."_tg_refresh_person_on_note"();



CREATE OR REPLACE TRIGGER "trg_person_profile_activities" AFTER INSERT OR DELETE OR UPDATE ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."person_profile_after_activity"();



CREATE OR REPLACE TRIGGER "trg_person_profile_contacts" AFTER INSERT OR DELETE OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."person_profile_upsert_from_contact"();



CREATE OR REPLACE TRIGGER "trg_person_profile_documents" AFTER INSERT OR DELETE OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."person_profile_after_document"();



CREATE OR REPLACE TRIGGER "trg_person_profile_leads" AFTER INSERT OR DELETE OR UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."person_profile_upsert_from_lead"();



CREATE OR REPLACE TRIGGER "trg_person_profile_opportunities" AFTER INSERT OR DELETE OR UPDATE ON "public"."opportunities" FOR EACH ROW EXECUTE FUNCTION "public"."person_profile_after_opportunity"();



CREATE OR REPLACE TRIGGER "trigger_sync_bizdev_sources_created_date" BEFORE INSERT OR UPDATE ON "public"."bizdev_sources" FOR EACH ROW EXECUTE FUNCTION "public"."sync_bizdev_sources_created_date"();



CREATE OR REPLACE TRIGGER "update_construction_assignments_updated_at" BEFORE UPDATE ON "public"."construction_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_construction_projects_updated_at" BEFORE UPDATE ON "public"."construction_projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "workers_updated_at" BEFORE UPDATE ON "public"."workers" FOR EACH ROW EXECUTE FUNCTION "public"."update_workers_updated_at"();



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_assigned_to_fk" FOREIGN KEY ("assigned_to_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_assigned_to_fk" FOREIGN KEY ("assigned_to_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_campaign"
    ADD CONSTRAINT "ai_campaign_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_suggestion_feedback"
    ADD CONSTRAINT "ai_suggestion_feedback_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "public"."ai_suggestions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_suggestion_feedback"
    ADD CONSTRAINT "ai_suggestion_feedback_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_suggestion_metrics"
    ADD CONSTRAINT "ai_suggestion_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_suggestions"
    ADD CONSTRAINT "ai_suggestions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."ai_suggestions"
    ADD CONSTRAINT "ai_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement"
    ADD CONSTRAINT "announcement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_key"
    ADD CONSTRAINT "api_key_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."apikey"
    ADD CONSTRAINT "apikey_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."archive_index"
    ADD CONSTRAINT "archive_index_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bizdev_source"
    ADD CONSTRAINT "bizdev_source_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bizdev_sources"
    ADD CONSTRAINT "bizdev_sources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_flow"
    ADD CONSTRAINT "cash_flow_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkpoint"
    ADD CONSTRAINT "checkpoint_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_requirement"
    ADD CONSTRAINT "client_requirement_assigned_to_fk" FOREIGN KEY ("assigned_to_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."client_requirement"
    ADD CONSTRAINT "client_requirement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."construction_assignments"
    ADD CONSTRAINT "construction_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."construction_assignments"
    ADD CONSTRAINT "construction_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."construction_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."construction_assignments"
    ADD CONSTRAINT "construction_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."construction_assignments"
    ADD CONSTRAINT "construction_assignments_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."construction_projects"
    ADD CONSTRAINT "construction_projects_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."construction_projects"
    ADD CONSTRAINT "construction_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."construction_projects"
    ADD CONSTRAINT "construction_projects_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."construction_projects"
    ADD CONSTRAINT "construction_projects_project_manager_contact_id_fkey" FOREIGN KEY ("project_manager_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."construction_projects"
    ADD CONSTRAINT "construction_projects_supervisor_contact_id_fkey" FOREIGN KEY ("supervisor_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."construction_projects"
    ADD CONSTRAINT "construction_projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_history"
    ADD CONSTRAINT "contact_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cron_job"
    ADD CONSTRAINT "cron_job_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_sales_metrics"
    ADD CONSTRAINT "daily_sales_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."email_template"
    ADD CONSTRAINT "email_template_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entity_labels"
    ADD CONSTRAINT "entity_labels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_customization"
    ADD CONSTRAINT "field_customization_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file"
    ADD CONSTRAINT "file_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "fk_conversations_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "fk_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_log"
    ADD CONSTRAINT "import_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_history"
    ADD CONSTRAINT "lead_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."modulesettings"
    ADD CONSTRAINT "modulesettings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."name_to_employee"
    ADD CONSTRAINT "name_to_employee_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."note"
    ADD CONSTRAINT "note_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_log"
    ADD CONSTRAINT "performance_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_logs"
    ADD CONSTRAINT "performance_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription"
    ADD CONSTRAINT "subscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."synchealth"
    ADD CONSTRAINT "synchealth_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."systembranding"
    ADD CONSTRAINT "systembranding_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_integration"
    ADD CONSTRAINT "tenant_integration_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_report"
    ADD CONSTRAINT "test_report_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_invitation"
    ADD CONSTRAINT "user_invitation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."webhook"
    ADD CONSTRAINT "webhook_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_execution"
    ADD CONSTRAINT "workflow_execution_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow"
    ADD CONSTRAINT "workflow_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



CREATE POLICY "Backend service has full access to accounts" ON "public"."accounts" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to activities" ON "public"."activities" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to apikey" ON "public"."apikey" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to contacts" ON "public"."contacts" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to employees" ON "public"."employees" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to leads" ON "public"."leads" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to modulesettings" ON "public"."modulesettings" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to notifications" ON "public"."notifications" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to opportunities" ON "public"."opportunities" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to system_logs" ON "public"."system_logs" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to users" ON "public"."users" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to accounts" ON "public"."accounts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to activities" ON "public"."activities" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to ai_campaign" ON "public"."ai_campaign" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to announcement" ON "public"."announcement" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to api_key" ON "public"."api_key" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to apikey" ON "public"."apikey" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to archive_index" ON "public"."archive_index" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to audit_log" ON "public"."audit_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to bizdev_source" ON "public"."bizdev_source" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to bizdev_sources" ON "public"."bizdev_sources" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to cache" ON "public"."cache" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to cash_flow" ON "public"."cash_flow" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to checkpoint" ON "public"."checkpoint" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to client_requirement" ON "public"."client_requirement" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to contact_history" ON "public"."contact_history" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to contacts" ON "public"."contacts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to cron_job" ON "public"."cron_job" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to daily_sales_metrics" ON "public"."daily_sales_metrics" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to documentation" ON "public"."documentation" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to email_template" ON "public"."email_template" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to employees" ON "public"."employees" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to field_customization" ON "public"."field_customization" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to file" ON "public"."file" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to guide_content" ON "public"."guide_content" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to import_log" ON "public"."import_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to lead_history" ON "public"."lead_history" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to leads" ON "public"."leads" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to modulesettings" ON "public"."modulesettings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to note" ON "public"."note" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to notifications" ON "public"."notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to opportunities" ON "public"."opportunities" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to performance_log" ON "public"."performance_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to subscription" ON "public"."subscription" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to subscription_plan" ON "public"."subscription_plan" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to system_logs" ON "public"."system_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to tenant" ON "public"."tenant" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to tenant_integration" ON "public"."tenant_integration" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to tenant_integrations" ON "public"."tenant_integrations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to test_report" ON "public"."test_report" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to user_invitation" ON "public"."user_invitation" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to users" ON "public"."users" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to webhook" ON "public"."webhook" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to workflow" ON "public"."workflow" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to workflow_execution" ON "public"."workflow_execution" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounts_tenant_select" ON "public"."accounts" FOR SELECT TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_campaign" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_suggestion_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_suggestion_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_suggestions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_suggestions_tenant_isolation" ON "public"."ai_suggestions" USING (("tenant_id" = ("current_setting"('app.current_tenant_id'::"text", true))::"uuid"));



ALTER TABLE "public"."announcement" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_key" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apikey" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."archive_index" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_insert_only" ON "public"."performance_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."bizdev_source" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bizdev_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_flow" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkpoint" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_requirement" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."construction_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "construction_assignments_delete_policy" ON "public"."construction_assignments" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "construction_assignments_insert_policy" ON "public"."construction_assignments" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "construction_assignments_select_policy" ON "public"."construction_assignments" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "construction_assignments_service_policy" ON "public"."construction_assignments" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "construction_assignments_update_policy" ON "public"."construction_assignments" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."construction_projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "construction_projects_delete_policy" ON "public"."construction_projects" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "construction_projects_insert_policy" ON "public"."construction_projects" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "construction_projects_select_policy" ON "public"."construction_projects" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "construction_projects_service_policy" ON "public"."construction_projects" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "construction_projects_update_policy" ON "public"."construction_projects" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."contact_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_tenant_isolation" ON "public"."conversations" USING ((("tenant_id")::"text" = "current_setting"('app.current_tenant_id'::"text", true)));



ALTER TABLE "public"."cron_job" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_sales_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documentation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_tenant_isolation" ON "public"."documents" USING (("tenant_id" = ("current_setting"('app.current_tenant_id'::"text", true))::"uuid"));



ALTER TABLE "public"."email_template" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entity_labels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entity_labels_select_policy" ON "public"."entity_labels" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "u"."tenant_id"
   FROM "public"."users" "u"
  WHERE ("u"."id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "entity_labels_service_policy" ON "public"."entity_labels" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."field_customization" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."file" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guide_content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."import_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_tenant_delete" ON "public"."leads" FOR DELETE TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "leads_tenant_insert" ON "public"."leads" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "leads_tenant_select" ON "public"."leads" FOR SELECT TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "leads_tenant_update" ON "public"."leads" FOR UPDATE TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid")) WITH CHECK (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "messages_tenant_isolation" ON "public"."conversation_messages" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "conversation_messages"."conversation_id") AND (("conversations"."tenant_id")::"text" = "current_setting"('app.current_tenant_id'::"text", true))))));



ALTER TABLE "public"."modulesettings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."note" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."performance_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."performance_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."person_profile" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "person_profile_select" ON "public"."person_profile" FOR SELECT TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "person_profile_tenant_select" ON "public"."person_profile" FOR SELECT TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "read_activities_by_related_id" ON "public"."activities" FOR SELECT TO "authenticated" USING (("related_id" IS NOT NULL));



CREATE POLICY "service_role_ai_suggestion_feedback" ON "public"."ai_suggestion_feedback" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_ai_suggestion_metrics" ON "public"."ai_suggestion_metrics" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_only_modulesettings" ON "public"."modulesettings" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "service_role_only_tenants" ON "public"."tenant" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."subscription" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."synchealth" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "synchealth_tenant_isolation" ON "public"."synchealth" USING ((("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)) OR ("current_setting"('app.bypass_rls'::"text", true) = 'true'::"text")));



ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."systembranding" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_insert_person_profile" ON "public"."person_profile" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."tenant_integration" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_isolation_accounts" ON "public"."accounts" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_activities" ON "public"."activities" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_ai_suggestion_feedback" ON "public"."ai_suggestion_feedback" USING (("tenant_id" = ("current_setting"('app.current_tenant_id'::"text"))::"uuid"));



CREATE POLICY "tenant_isolation_ai_suggestion_metrics" ON "public"."ai_suggestion_metrics" USING (("tenant_id" = ("current_setting"('app.current_tenant_id'::"text"))::"uuid"));



CREATE POLICY "tenant_isolation_bizdev_source" ON "public"."bizdev_source" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_cash_flow" ON "public"."cash_flow" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_client_requirement" ON "public"."client_requirement" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_contacts" ON "public"."contacts" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_leads" ON "public"."leads" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_note" ON "public"."note" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_notifications" ON "public"."notifications" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_opportunities" ON "public"."opportunities" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_workflow" ON "public"."workflow" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_workflow_execution" ON "public"."workflow_execution" TO "authenticated" USING (("tenant_id_text" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_select_person_profile" ON "public"."person_profile" FOR SELECT TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "tenant_update_person_profile" ON "public"."person_profile" FOR UPDATE TO "authenticated" USING (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid")) WITH CHECK (("tenant_id" = (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."test_report" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_invitation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workers_delete_policy" ON "public"."workers" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "workers_insert_policy" ON "public"."workers" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "workers_select_policy" ON "public"."workers" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "workers_service_policy" ON "public"."workers" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "workers_update_policy" ON "public"."workers" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."workflow" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_execution" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_template" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_template_tenant_isolation" ON "public"."workflow_template" USING ((("is_system" = true) OR ("tenant_id" IS NULL) OR ("tenant_id" = ("current_setting"('app.current_tenant_id'::"text", true))::"uuid")));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_tg_refresh_person_on_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."_tg_refresh_person_on_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_tg_refresh_person_on_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_tg_refresh_person_on_document"() TO "anon";
GRANT ALL ON FUNCTION "public"."_tg_refresh_person_on_document"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_tg_refresh_person_on_document"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_tg_refresh_person_on_note"() TO "anon";
GRANT ALL ON FUNCTION "public"."_tg_refresh_person_on_note"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_tg_refresh_person_on_note"() TO "service_role";



GRANT ALL ON FUNCTION "public"."aggregate_ai_suggestion_metrics"("p_tenant_id" "uuid", "p_bucket_size" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."aggregate_ai_suggestion_metrics"("p_tenant_id" "uuid", "p_bucket_size" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aggregate_ai_suggestion_metrics"("p_tenant_id" "uuid", "p_bucket_size" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



REVOKE ALL ON FUNCTION "public"."employee_full_name"("emp" "public"."employees") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."employee_full_name"("emp" "public"."employees") TO "service_role";



GRANT ALL ON FUNCTION "public"."employees_cascade_name_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."employees_cascade_name_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."employees_cascade_name_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."person_profile_after_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."person_profile_after_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."person_profile_after_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."person_profile_after_document"() TO "anon";
GRANT ALL ON FUNCTION "public"."person_profile_after_document"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."person_profile_after_document"() TO "service_role";



GRANT ALL ON FUNCTION "public"."person_profile_after_opportunity"() TO "anon";
GRANT ALL ON FUNCTION "public"."person_profile_after_opportunity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."person_profile_after_opportunity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."person_profile_upsert_from_contact"() TO "anon";
GRANT ALL ON FUNCTION "public"."person_profile_upsert_from_contact"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."person_profile_upsert_from_contact"() TO "service_role";



GRANT ALL ON FUNCTION "public"."person_profile_upsert_from_lead"() TO "anon";
GRANT ALL ON FUNCTION "public"."person_profile_upsert_from_lead"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."person_profile_upsert_from_lead"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_last_activity_at"("p_person_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_last_activity_at"("p_person_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_last_activity_at"("p_person_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_open_opportunity_count"("p_person_id" "uuid", "p_person_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_open_opportunity_count"("p_person_id" "uuid", "p_person_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_open_opportunity_count"("p_person_id" "uuid", "p_person_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_recent_documents"("p_person_id" "uuid", "p_person_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_recent_documents"("p_person_id" "uuid", "p_person_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_recent_documents"("p_person_id" "uuid", "p_person_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_all_person_profiles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_all_person_profiles"() TO "service_role";
GRANT ALL ON FUNCTION "public"."refresh_all_person_profiles"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."refresh_assigned_to_on_accounts"("emp_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_assigned_to_on_accounts"("emp_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_assigned_to_on_activities"("emp_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_assigned_to_on_activities"("emp_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_assigned_to_on_client_requirement"("emp_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_assigned_to_on_client_requirement"("emp_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_person_profile"("p_person_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_person_profile"("p_person_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."refresh_person_profile"("p_person_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."refresh_person_profile_lead"("p_lead_id" "uuid", "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_person_profile_lead"("p_lead_id" "uuid", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_person_profile_lead"("p_lead_id" "uuid", "p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_person_profile_on_demand"("p_person_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_person_profile_on_demand"("p_person_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_person_profile_on_demand"("p_person_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_person_profile_on_demand"("p_person_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rehydrate_person_profiles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rehydrate_person_profiles"() TO "anon";
GRANT ALL ON FUNCTION "public"."rehydrate_person_profiles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rehydrate_person_profiles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_assigned_to_text"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_assigned_to_text"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_assigned_to_text"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_bizdev_sources_created_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_bizdev_sources_created_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_bizdev_sources_created_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_created_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_created_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_created_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_activities_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_activities_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_activities_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ai_suggestions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ai_suggestions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ai_suggestions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_employees_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_employees_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_employees_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tenant_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenant_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_workers_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_workers_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_workers_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_person_profile"("p_person_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_person_profile"("p_person_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_person_profile"("p_person_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."uuid_advisory_key"("p" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."uuid_advisory_key"("p" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."uuid_advisory_key"("p" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."ai_campaign" TO "anon";
GRANT ALL ON TABLE "public"."ai_campaign" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_campaign" TO "service_role";



GRANT ALL ON TABLE "public"."ai_suggestion_feedback" TO "anon";
GRANT ALL ON TABLE "public"."ai_suggestion_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_suggestion_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."ai_suggestion_metrics" TO "anon";
GRANT ALL ON TABLE "public"."ai_suggestion_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_suggestion_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."ai_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."ai_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."announcement" TO "anon";
GRANT ALL ON TABLE "public"."announcement" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."api_key" TO "anon";
GRANT MAINTAIN ON TABLE "public"."api_key" TO "authenticated";
GRANT ALL ON TABLE "public"."api_key" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."apikey" TO "anon";
GRANT MAINTAIN ON TABLE "public"."apikey" TO "authenticated";
GRANT ALL ON TABLE "public"."apikey" TO "service_role";



GRANT ALL ON TABLE "public"."archive_index" TO "anon";
GRANT ALL ON TABLE "public"."archive_index" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_index" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."audit_log" TO "anon";
GRANT MAINTAIN ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."bizdev_source" TO "anon";
GRANT ALL ON TABLE "public"."bizdev_source" TO "authenticated";
GRANT ALL ON TABLE "public"."bizdev_source" TO "service_role";



GRANT ALL ON TABLE "public"."bizdev_sources" TO "anon";
GRANT ALL ON TABLE "public"."bizdev_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."bizdev_sources" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."cache" TO "anon";
GRANT MAINTAIN ON TABLE "public"."cache" TO "authenticated";
GRANT ALL ON TABLE "public"."cache" TO "service_role";



GRANT ALL ON TABLE "public"."cash_flow" TO "anon";
GRANT ALL ON TABLE "public"."cash_flow" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_flow" TO "service_role";



GRANT ALL ON TABLE "public"."checkpoint" TO "anon";
GRANT ALL ON TABLE "public"."checkpoint" TO "authenticated";
GRANT ALL ON TABLE "public"."checkpoint" TO "service_role";



GRANT ALL ON TABLE "public"."client_requirement" TO "anon";
GRANT ALL ON TABLE "public"."client_requirement" TO "authenticated";
GRANT ALL ON TABLE "public"."client_requirement" TO "service_role";



GRANT ALL ON TABLE "public"."construction_assignments" TO "anon";
GRANT ALL ON TABLE "public"."construction_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."construction_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."construction_projects" TO "anon";
GRANT ALL ON TABLE "public"."construction_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."construction_projects" TO "service_role";



GRANT ALL ON TABLE "public"."contact_history" TO "anon";
GRANT ALL ON TABLE "public"."contact_history" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_history" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_messages" TO "anon";
GRANT ALL ON TABLE "public"."conversation_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_messages" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."cron_job" TO "anon";
GRANT MAINTAIN ON TABLE "public"."cron_job" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_job" TO "service_role";



GRANT ALL ON TABLE "public"."daily_sales_metrics" TO "anon";
GRANT ALL ON TABLE "public"."daily_sales_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_sales_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."documentation" TO "anon";
GRANT ALL ON TABLE "public"."documentation" TO "authenticated";
GRANT ALL ON TABLE "public"."documentation" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."email_template" TO "anon";
GRANT ALL ON TABLE "public"."email_template" TO "authenticated";
GRANT ALL ON TABLE "public"."email_template" TO "service_role";



GRANT ALL ON TABLE "public"."entity_labels" TO "anon";
GRANT ALL ON TABLE "public"."entity_labels" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_labels" TO "service_role";



GRANT ALL ON TABLE "public"."field_customization" TO "anon";
GRANT ALL ON TABLE "public"."field_customization" TO "authenticated";
GRANT ALL ON TABLE "public"."field_customization" TO "service_role";



GRANT ALL ON TABLE "public"."file" TO "anon";
GRANT ALL ON TABLE "public"."file" TO "authenticated";
GRANT ALL ON TABLE "public"."file" TO "service_role";



GRANT ALL ON TABLE "public"."guide_content" TO "anon";
GRANT ALL ON TABLE "public"."guide_content" TO "authenticated";
GRANT ALL ON TABLE "public"."guide_content" TO "service_role";



GRANT ALL ON TABLE "public"."import_log" TO "anon";
GRANT ALL ON TABLE "public"."import_log" TO "authenticated";
GRANT ALL ON TABLE "public"."import_log" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."note" TO "anon";
GRANT ALL ON TABLE "public"."note" TO "authenticated";
GRANT ALL ON TABLE "public"."note" TO "service_role";



GRANT ALL ON TABLE "public"."lead_detail_full" TO "anon";
GRANT ALL ON TABLE "public"."lead_detail_full" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_detail_full" TO "service_role";



GRANT ALL ON TABLE "public"."name_to_employee" TO "anon";
GRANT ALL ON TABLE "public"."name_to_employee" TO "authenticated";
GRANT ALL ON TABLE "public"."name_to_employee" TO "service_role";



GRANT ALL ON TABLE "public"."lead_detail_light" TO "anon";
GRANT ALL ON TABLE "public"."lead_detail_light" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_detail_light" TO "service_role";



GRANT ALL ON TABLE "public"."lead_history" TO "anon";
GRANT ALL ON TABLE "public"."lead_history" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_history" TO "service_role";



GRANT ALL ON TABLE "public"."modulesettings" TO "anon";
GRANT ALL ON TABLE "public"."modulesettings" TO "authenticated";
GRANT ALL ON TABLE "public"."modulesettings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."name_to_employee_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."name_to_employee_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."name_to_employee_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."opportunities" TO "anon";
GRANT ALL ON TABLE "public"."opportunities" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunities" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."performance_log" TO "anon";
GRANT MAINTAIN ON TABLE "public"."performance_log" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_log" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."performance_logs" TO "anon";
GRANT INSERT,MAINTAIN ON TABLE "public"."performance_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_logs" TO "service_role";



GRANT ALL ON TABLE "public"."person_profile" TO "anon";
GRANT ALL ON TABLE "public"."person_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."person_profile" TO "service_role";



GRANT ALL ON TABLE "public"."subscription" TO "anon";
GRANT ALL ON TABLE "public"."subscription" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plan" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plan" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plan" TO "service_role";



GRANT ALL ON TABLE "public"."synchealth" TO "anon";
GRANT ALL ON TABLE "public"."synchealth" TO "authenticated";
GRANT ALL ON TABLE "public"."synchealth" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."system_logs" TO "anon";
GRANT INSERT,MAINTAIN ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."systembranding" TO "anon";
GRANT ALL ON TABLE "public"."systembranding" TO "authenticated";
GRANT ALL ON TABLE "public"."systembranding" TO "service_role";



GRANT ALL ON TABLE "public"."tenant" TO "anon";
GRANT ALL ON TABLE "public"."tenant" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_integration" TO "anon";
GRANT ALL ON TABLE "public"."tenant_integration" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_integration" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_integrations" TO "anon";
GRANT ALL ON TABLE "public"."tenant_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."test_report" TO "anon";
GRANT ALL ON TABLE "public"."test_report" TO "authenticated";
GRANT ALL ON TABLE "public"."test_report" TO "service_role";



GRANT ALL ON TABLE "public"."user_invitation" TO "anon";
GRANT ALL ON TABLE "public"."user_invitation" TO "authenticated";
GRANT ALL ON TABLE "public"."user_invitation" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."v_activity_stream" TO "anon";
GRANT ALL ON TABLE "public"."v_activity_stream" TO "authenticated";
GRANT ALL ON TABLE "public"."v_activity_stream" TO "service_role";



GRANT ALL ON TABLE "public"."v_crm_records" TO "anon";
GRANT ALL ON TABLE "public"."v_crm_records" TO "authenticated";
GRANT ALL ON TABLE "public"."v_crm_records" TO "service_role";



GRANT ALL ON TABLE "public"."v_my_queue" TO "anon";
GRANT ALL ON TABLE "public"."v_my_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."v_my_queue" TO "service_role";



GRANT ALL ON TABLE "public"."webhook" TO "anon";
GRANT ALL ON TABLE "public"."webhook" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook" TO "service_role";



GRANT ALL ON TABLE "public"."workers" TO "anon";
GRANT ALL ON TABLE "public"."workers" TO "authenticated";
GRANT ALL ON TABLE "public"."workers" TO "service_role";



GRANT ALL ON TABLE "public"."workflow" TO "anon";
GRANT ALL ON TABLE "public"."workflow" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_execution" TO "anon";
GRANT ALL ON TABLE "public"."workflow_execution" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_execution" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_template" TO "anon";
GRANT ALL ON TABLE "public"."workflow_template" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_template" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







