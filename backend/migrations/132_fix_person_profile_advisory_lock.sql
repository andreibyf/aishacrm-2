-- Migration 129: Fix statement timeout on lead delete caused by advisory lock blocking
--
-- Problem: refresh_person_profile() uses pg_advisory_xact_lock() which BLOCKS until it
-- can acquire the lock. When a lead is deleted and a concurrent request is already
-- running refresh_person_profile() for the same person, the delete transaction waits
-- indefinitely and hits Supabase's statement timeout.
--
-- Root cause chain:
--   DELETE leads → trg_person_profile_leads fires → deletes person_profile row (fast)
--   But if another concurrent session called refresh_person_profile() for the same
--   person ID (e.g., triggered by an activity update), it holds pg_advisory_xact_lock.
--   The delete transaction then tries to acquire the same lock (e.g., via the trigger
--   on person_profile) and BLOCKS until Supabase cancels with statement timeout.
--
-- Fix: Replace pg_advisory_xact_lock (blocking) with pg_try_advisory_xact_lock (non-blocking).
-- If the lock cannot be acquired, skip this refresh — the concurrent holder will complete
-- the refresh, so no data consistency is lost.
--
-- Bonus fix: when v_person_type IS NULL (person deleted), clean up the orphaned
-- person_profile row instead of silently returning.

CREATE OR REPLACE FUNCTION public.refresh_person_profile(p_person_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_key bigint;
  v_person_type text;
  v_locked boolean;
BEGIN
  -- Compute advisory lock key (consistent with prior implementation)
  v_key := (42::bigint << 32) + (('x' || replace(p_person_id::text, '-', ''))::bit(64))::bigint;

  -- NON-BLOCKING: if another session holds the lock, skip — they will complete the refresh.
  v_locked := pg_try_advisory_xact_lock(v_key);
  IF NOT v_locked THEN
    RETURN;
  END IF;

  -- Determine person type
  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM public.leads    l WHERE l.id = p_person_id) THEN 'lead'
           WHEN EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = p_person_id) THEN 'contact'
           ELSE NULL
         END
  INTO v_person_type;

  -- Person was deleted: clean up orphaned profile row and return
  IF v_person_type IS NULL THEN
    DELETE FROM public.person_profile WHERE person_id = p_person_id;
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
      COALESCE(l.assigned_to::text, c.assigned_to::text) AS assigned_to,
      c.account_id
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
  SET person_type            = COALESCE(EXCLUDED.person_type, pp.person_type),
      tenant_id              = COALESCE(EXCLUDED.tenant_id, pp.tenant_id),
      first_name             = EXCLUDED.first_name,
      last_name              = EXCLUDED.last_name,
      email                  = EXCLUDED.email,
      phone                  = EXCLUDED.phone,
      job_title              = EXCLUDED.job_title,
      status                 = EXCLUDED.status,
      account_id             = EXCLUDED.account_id,
      account_name           = EXCLUDED.account_name,
      last_activity_at       = EXCLUDED.last_activity_at,
      open_opportunity_count = EXCLUDED.open_opportunity_count,
      recent_documents       = EXCLUDED.recent_documents,
      notes                  = EXCLUDED.notes,
      activities             = EXCLUDED.activities,
      opportunity_stage      = EXCLUDED.opportunity_stage,
      assigned_to            = EXCLUDED.assigned_to,
      updated_at             = now();
END;
$$;
