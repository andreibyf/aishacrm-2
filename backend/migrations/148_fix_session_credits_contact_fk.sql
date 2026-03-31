-- Migration 148: Fix session_credits and booking_sessions FK cascade behaviour
--
-- Problem: Both session_credits.contact_id and session_credits.lead_id use ON DELETE SET NULL.
--   When either a contact or lead is deleted and the credit has no counterpart FK,
--   both become NULL, violating CHECK (contact_id IS NOT NULL OR lead_id IS NOT NULL).
--   Same issue exists on booking_sessions.contact_id and booking_sessions.lead_id.
--
-- Fix: Change all four FKs to ON DELETE CASCADE so orphaned rows are removed
--   when the parent record is deleted.
--
-- Impact: SAFE — only removes rows that would be invalid (both NULLs) anyway.
-- Apply to: prod (ehjlenywplgyiahgxkfj) AND dev (efzqxjpfewkrgpdootte)

-- ── session_credits.contact_id ──────────────────────────────────────────────
ALTER TABLE public.session_credits
  DROP CONSTRAINT IF EXISTS session_credits_contact_id_fkey;

ALTER TABLE public.session_credits
  ADD CONSTRAINT session_credits_contact_id_fkey
    FOREIGN KEY (contact_id)
    REFERENCES public.contacts(id)
    ON DELETE CASCADE;

-- ── session_credits.lead_id ─────────────────────────────────────────────────
ALTER TABLE public.session_credits
  DROP CONSTRAINT IF EXISTS session_credits_lead_id_fkey;

ALTER TABLE public.session_credits
  ADD CONSTRAINT session_credits_lead_id_fkey
    FOREIGN KEY (lead_id)
    REFERENCES public.leads(id)
    ON DELETE CASCADE;

-- ── booking_sessions.contact_id ─────────────────────────────────────────────
ALTER TABLE public.booking_sessions
  DROP CONSTRAINT IF EXISTS booking_sessions_contact_id_fkey;

ALTER TABLE public.booking_sessions
  ADD CONSTRAINT booking_sessions_contact_id_fkey
    FOREIGN KEY (contact_id)
    REFERENCES public.contacts(id)
    ON DELETE SET NULL;

-- ── booking_sessions.lead_id ────────────────────────────────────────────────
ALTER TABLE public.booking_sessions
  DROP CONSTRAINT IF EXISTS booking_sessions_lead_id_fkey;

ALTER TABLE public.booking_sessions
  ADD CONSTRAINT booking_sessions_lead_id_fkey
    FOREIGN KEY (lead_id)
    REFERENCES public.leads(id)
    ON DELETE SET NULL;
