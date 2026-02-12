-- Migration 138: Remove duplicate/redundant triggers & FK constraint
-- =====================================================================
-- PROBLEM: Multiple tables have duplicate triggers calling the same or
-- overlapping functions, causing unnecessary work on every DML operation.
--
-- ACTIVITIES table has 3 person-profile triggers (should be 1):
--   1. activity_person_profile_trigger  → _tg_refresh_person_on_activity()  [KEEP - full refresh]
--   2. trg_activity_refresh_person      → _tg_refresh_person_on_activity()  [DROP - exact duplicate of #1]
--   3. trg_person_profile_activities    → person_profile_after_activity()   [DROP - recompute_last_activity_at
--                                         is already computed inside refresh_person_profile()]
--
-- CONTACTS table has 2 person-profile triggers (should be 1):
--   1. contact_person_profile_trigger   → sync_contact_to_person_profile()        [DROP - duplicate]
--   2. trg_person_profile_contacts      → person_profile_upsert_from_contact()    [KEEP - same work, better name]
--
-- LEADS table has a redundant FK constraint:
--   leads_tenant_id_fk  (NO ACTION)  is redundant alongside  leads_tenant_id_fkey (CASCADE)
-- =====================================================================

BEGIN;

-- ── Activities: drop exact duplicate trigger (same function as activity_person_profile_trigger) ──
DROP TRIGGER IF EXISTS trg_activity_refresh_person ON public.activities;

-- ── Activities: drop redundant last_activity_at trigger ──
-- refresh_person_profile() already computes last_activity_at in its activities CTE,
-- so the separate recompute_last_activity_at() call is wasted work.
DROP TRIGGER IF EXISTS trg_person_profile_activities ON public.activities;

-- ── Contacts: drop duplicate person-profile trigger ──
-- sync_contact_to_person_profile() and person_profile_upsert_from_contact() are
-- functionally identical (both INSERT/ON CONFLICT UPDATE the same columns).
-- Keep trg_person_profile_contacts (matches naming convention trg_person_profile_*).
DROP TRIGGER IF EXISTS contact_person_profile_trigger ON public.contacts;

-- ── Leads: drop redundant FK constraint ──
-- leads_tenant_id_fk (NO ACTION on DELETE) is redundant alongside
-- leads_tenant_id_fkey (CASCADE on DELETE). Both reference tenant(id).
-- The NO ACTION constraint adds overhead without providing value.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_tenant_id_fk;

COMMIT;
