-- 184_growth_opportunities_subject_region.sql
--
-- OSINT Opportunity Intelligence — fix: opportunityEngine dedupes against existing
-- OPEN opportunities by `${type}|${subject}|${region}`, and its existing-open
-- SELECT asks for `subject` + `region`. Migration 182 created growth_opportunities
-- with neither column (only `title`/`type`), so against real PostgREST the dedupe
-- SELECT errors and EVERY worker-processed run is marked failed. Add the columns so
-- the dedupe key is persisted and selectable. They are independently useful (an
-- opportunity is "about" a subject in a region).
--
-- Apply order (Supabase MCP apply_migration): dev branch (nrtrjsatmsosslxwlmoj at
-- apply time) → staging → prod.

ALTER TABLE public.growth_opportunities
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS region text;
