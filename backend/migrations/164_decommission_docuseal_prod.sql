-- 164_decommission_docuseal_prod.sql
--
-- 4VD-28 pivot follow-up (2026-05-09): drop the DocuSeal-specific schema in
-- prod since there is no prod implementation using it (0 rows in
-- docuseal_submissions and 0 rows in tenant_integrations[type=docuseal] at
-- the time of drop). The 4VD-43 in-house eSign engine replaces this; v1 ships
-- with its own signing_templates + signing_sessions tables that don't depend
-- on these.
--
-- Dropping CASCADE: docuseal_submissions has only outbound FK
-- (docuseal_submissions.tenant_id -> public.tenant.id); nothing else
-- references it. The trigger trg_docuseal_set_updated_at on this table is the
-- only consumer of docuseal_set_updated_at() so the function becomes dead
-- code post-drop.
--
-- Applied to prod (ehjlenywplgyiahgxkfj) on 2026-05-09 via apply_migration MCP.
--
-- DELIBERATELY NOT applied to dev/staging: the Send Document flow on those
-- environments still uses the existing docuseal_submissions table for status
-- mirroring while the in-house engine (4VD-43) is being built. When v1 ships
-- and the Send Document UI migrates to /api/submissions (4VD-43 day 2), this
-- migration will be replayed on dev → staging → and the schema goes away
-- across all environments.
--
-- Companion: DOCUSEAL_PLATFORM_API_KEY, DOCUSEAL_PLATFORM_BASE_URL, and
-- DOCUSEAL_PLATFORM_WEBHOOK_SECRET were removed from Doppler aishacrm/prd
-- and aishacrm/prd_prd in the same change (no code in prod read them anyway,
-- but consistency matters for drift detection).

DROP TABLE IF EXISTS public.docuseal_submissions CASCADE;
DROP FUNCTION IF EXISTS public.docuseal_set_updated_at() CASCADE;

-- Defensive: any orphan tenant_integrations rows of type='docuseal' (none
-- exist in prod today; verified pre-drop) get cleared so a future replay
-- of this migration after data has somehow been inserted is still safe.
DELETE FROM public.tenant_integrations WHERE integration_type = 'docuseal';
