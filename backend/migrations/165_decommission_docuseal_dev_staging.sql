-- 165_decommission_docuseal_dev_staging.sql
--
-- 4VD-28 follow-up (2026-05-09): drop the DocuSeal-specific schema on dev and
-- staging now that the full DocuSeal removal has landed in code (Send Document
-- dialogs, /api/docuseal/* routes, SignPage iframe shell, braid tools, and
-- patched-image dir all deleted). Migration 164 already dropped this in prod;
-- this is the same DDL, applied to:
--   * dev branch  : nrtrjsatmsosslxwlmoj (preview branch off staging)
--   * staging     : bjedfowimuwbcnruwcdj
--
-- Pre-drop verification on both targets (2026-05-09):
--   docuseal_submissions          exists: yes
--   tenant_integrations[docuseal] count : 1 (each)
-- These rows belong to the dev-playground tenant only and were stamped during
-- earlier DocuSeal MVP testing; per Dre, "there are no users. everything was
-- still being tested." so it is safe to drop.
--
-- The 4VD-43 in-house eSign engine replaces the dropped surface and runs
-- entirely off the new signing_templates (162) + signing_sessions (163) tables
-- that were created in the same wave.
--
-- Companion Doppler cleanup (same change): DOCUSEAL_PLATFORM_API_KEY,
-- DOCUSEAL_PLATFORM_BASE_URL, DOCUSEAL_PLATFORM_WEBHOOK_SECRET removed from
-- aishacrm/dev, aishacrm/dev_personal, aishacrm/stg, aishacrm/stg_stg.

DROP TABLE IF EXISTS public.docuseal_submissions CASCADE;
DROP FUNCTION IF EXISTS public.docuseal_set_updated_at() CASCADE;

-- Defensive: clear any orphan tenant_integrations rows of type='docuseal' so
-- the migration is idempotent if replayed after rows somehow re-appear.
DELETE FROM public.tenant_integrations WHERE integration_type = 'docuseal';
