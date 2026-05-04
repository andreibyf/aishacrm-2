-- Migration 160: DocuSeal — record Supabase Storage mirror path
--
-- Purpose: Closes the durability gap where signed PDFs live ONLY in
--          DocuSeal's Docker volume on VPS-2. After a submission completes,
--          the webhook handler will mirror the signed PDF into the
--          tenant-assets Supabase Storage bucket. This column records the
--          storage key so we can re-serve / verify / re-mirror later.
--
-- Impact: ADDITIVE ONLY. One nullable TEXT column on docuseal_submissions.
--         No data loss, no RLS changes, no index needed (column is referenced
--         per-row via primary key path during webhook handling, never used
--         as a query predicate).
--
-- Apply order: dev (nrtrjsatmsosslxwlmoj) → staging (bjedfowimuwbcnruwcdj)
--              → prod when DocuSeal goes live there. Safe to apply to live
--              traffic — column is nullable, no defaults, no triggers fire.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS so re-application is a no-op.

BEGIN;

ALTER TABLE public.docuseal_submissions
    ADD COLUMN IF NOT EXISTS supabase_storage_path TEXT;

COMMENT ON COLUMN public.docuseal_submissions.supabase_storage_path IS
    'Object key in the tenant-assets bucket for the mirrored signed PDF. '
    'Populated by the docuseal webhook on submission.completed. NULL until '
    'the mirror succeeds. Format: uploads/{tenant_id}/docuseal/{submission_id}_{template}.pdf';

COMMIT;

-- =============================================================================
-- ROLLBACK (manual)
-- =============================================================================
-- BEGIN;
-- ALTER TABLE public.docuseal_submissions DROP COLUMN IF EXISTS supabase_storage_path;
-- COMMIT;
