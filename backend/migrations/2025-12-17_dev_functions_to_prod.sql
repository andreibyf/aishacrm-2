-- DEV to PROD Functions Migration
CREATE OR REPLACE FUNCTION "public"."employee_full_name"("emp" "public"."employees") RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT trim(both ' ' FROM COALESCE(emp.first_name, '') || ' ' || COALESCE(emp.last_name, ''));
$$;

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

CREATE OR REPLACE FUNCTION "public"."uuid_advisory_key"("p" "uuid") RETURNS bigint
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT (42::bigint << 32) + (('x' || replace(p::text,'-',''))::bit(64))::bigint;
$$;

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

