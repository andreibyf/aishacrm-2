-- Migration 076: Add uniqueness constraint for agent_sessions_archive
-- Ensures a single archived row per (tenant_id, user_id, session_id)
-- Safe dedupe: retain earliest row, remove later duplicates before adding constraint

WITH ranked AS (
  SELECT id, tenant_id, user_id, session_id, created_at,
         ROW_NUMBER() OVER (PARTITION BY tenant_id, user_id, session_id ORDER BY created_at ASC) AS rn
  FROM public.agent_sessions_archive
)
DELETE FROM public.agent_sessions_archive
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.agent_sessions_archive
  ADD CONSTRAINT agent_sessions_archive_unique UNIQUE (tenant_id, user_id, session_id);

COMMENT ON CONSTRAINT agent_sessions_archive_unique ON public.agent_sessions_archive IS 'Prevents duplicate archived sessions for same tenant/user/session combination.';
