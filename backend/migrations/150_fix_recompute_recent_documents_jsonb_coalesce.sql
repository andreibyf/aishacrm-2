-- Migration 150: Fix recompute_recent_documents JSONB COALESCE call
--
-- Problem: recompute_recent_documents() uses pg_catalog.coalesce(sub.docs, '[]'::jsonb).
-- COALESCE is SQL syntax, not a normal pg_catalog function, so qualifying it causes:
--   function pg_catalog.coalesce(jsonb, jsonb) does not exist
--
-- Impact: document inserts can fail after the row is written when the documents trigger
-- calls person_profile_after_document() -> recompute_recent_documents(...).
--
-- Fix: replace pg_catalog.coalesce(...) with plain COALESCE(...).

CREATE OR REPLACE FUNCTION public.recompute_recent_documents(p_person_id uuid, p_person_type text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  UPDATE public.person_profile pp
  SET recent_documents = COALESCE(sub.docs, '[]'::jsonb)
  FROM (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'created_at', d.created_at
      )
      ORDER BY d.created_at DESC
    ) AS docs
    FROM (
      SELECT d.id, d.name, d.created_at
      FROM public.documents d
      WHERE d.related_type = p_person_type
        AND d.related_id = p_person_id
      ORDER BY d.created_at DESC
      LIMIT 10
    ) d
  ) sub
  WHERE pp.person_id = p_person_id;
END;
$function$;
