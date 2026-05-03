-- Migration 159: DocuSeal eSigning integration — submission tracking table
--
-- Purpose: Track documents sent for signature via DocuSeal, mapped to CRM
--          entities (contact / lead / account / opportunity). Webhook events
--          from DocuSeal mutate status; UI reads to show signature progress
--          on entity detail panels.
--
-- Impact: ADDITIVE ONLY. One new table + 4 RLS policies + 3 indexes.
--         No schema changes to tenant, tenant_integrations, or activities.
--         DocuSeal API key + webhook secret stored in tenant_integrations
--         under integration_type='docuseal' (existing table, no schema
--         change needed there either).
--
-- Scope: SHARED DocuSeal instance for all CRM tenants. One DocuSeal install
--        on VPS-2 (Coolify-managed); each tenant gets its own DocuSeal
--        account / API key, stored in tenant_integrations.
--
-- Apply to: dev (nrtrjsatmsosslxwlmoj) FIRST, then staging
--           (bjedfowimuwbcnruwcdj), then prod when DocuSeal goes live there.
--
-- Foreign keys: NO FK from related_id to entity tables. Polymorphic pointer
--               via (related_to, related_id) — same pattern as activities
--               table. Avoids 4-way polymorphic FK headaches and matches
--               existing Cal.com booking_sessions pattern.
--
-- RLS: tenant isolation only. Webhook handler uses service role to bypass
--      RLS (same pattern as calcom-webhook.js).

BEGIN;

-- =============================================================================
-- docuseal_submissions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.docuseal_submissions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,

    -- DocuSeal-side identifiers
    docuseal_submission_id   TEXT NOT NULL,
    docuseal_template_id     TEXT NOT NULL,
    template_name            TEXT,                       -- snapshot at send time

    -- CRM entity link (polymorphic, matches activities pattern)
    related_to               TEXT NOT NULL CHECK (related_to IN ('contact','lead','account','opportunity')),
    related_id               UUID NOT NULL,

    -- Recipient
    recipient_name           TEXT,
    recipient_email          TEXT NOT NULL,

    -- Lifecycle status
    status                   TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sent','viewed','signed','completed','declined','expired','failed')),

    sent_at                  TIMESTAMPTZ DEFAULT now(),
    viewed_at                TIMESTAMPTZ,
    completed_at             TIMESTAMPTZ,

    -- Document URLs (returned by DocuSeal on completion)
    signed_document_url      TEXT,
    audit_log_url            TEXT,

    -- Idempotency for webhook replays
    last_event_id            TEXT,
    last_event_at            TIMESTAMPTZ,

    error_message            TEXT,
    metadata                 JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_by               UUID,                       -- public.users.id (no FK to avoid coupling)
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT docuseal_submissions_unique_per_tenant
        UNIQUE (tenant_id, docuseal_submission_id)
);

-- Indexes for the two query paths the UI uses
CREATE INDEX IF NOT EXISTS idx_docuseal_submissions_entity
    ON public.docuseal_submissions (tenant_id, related_to, related_id);

CREATE INDEX IF NOT EXISTS idx_docuseal_submissions_status
    ON public.docuseal_submissions (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_docuseal_submissions_created
    ON public.docuseal_submissions (tenant_id, created_at DESC);

-- updated_at maintenance trigger (reuse billing_set_updated_at if present,
-- else create a generic one)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'docuseal_set_updated_at'
    ) THEN
        EXECUTE $func$
            CREATE OR REPLACE FUNCTION public.docuseal_set_updated_at()
            RETURNS TRIGGER LANGUAGE plpgsql AS $body$
            BEGIN NEW.updated_at = now(); RETURN NEW; END;
            $body$;
        $func$;
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_docuseal_submissions_set_updated_at
    ON public.docuseal_submissions;
CREATE TRIGGER trg_docuseal_submissions_set_updated_at
    BEFORE UPDATE ON public.docuseal_submissions
    FOR EACH ROW EXECUTE FUNCTION public.docuseal_set_updated_at();

-- =============================================================================
-- RLS — tenant isolation. Pattern matches 156_rls_initplan_fixes_part1.sql:
-- wrap auth.uid() in (SELECT ...) for plan stability, join public.users to
-- derive tenant_id.
-- =============================================================================

ALTER TABLE public.docuseal_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_docuseal_submissions_select ON public.docuseal_submissions;
CREATE POLICY tenant_isolation_docuseal_submissions_select ON public.docuseal_submissions
    FOR SELECT TO public
    USING (
        ((SELECT auth.uid()) IS NOT NULL)
        AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_isolation_docuseal_submissions_insert ON public.docuseal_submissions;
CREATE POLICY tenant_isolation_docuseal_submissions_insert ON public.docuseal_submissions
    FOR INSERT TO public
    WITH CHECK (
        ((SELECT auth.uid()) IS NOT NULL)
        AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_isolation_docuseal_submissions_update ON public.docuseal_submissions;
CREATE POLICY tenant_isolation_docuseal_submissions_update ON public.docuseal_submissions
    FOR UPDATE TO public
    USING (
        ((SELECT auth.uid()) IS NOT NULL)
        AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_isolation_docuseal_submissions_delete ON public.docuseal_submissions;
CREATE POLICY tenant_isolation_docuseal_submissions_delete ON public.docuseal_submissions
    FOR DELETE TO public
    USING (
        ((SELECT auth.uid()) IS NOT NULL)
        AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid()))
    );

-- Service role bypasses RLS for webhook writes (no policy needed; service_role
-- has implicit bypass via Supabase's role hierarchy).

COMMIT;

-- =============================================================================
-- ROLLBACK (manual; uncomment only if reverting)
-- =============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_docuseal_submissions_set_updated_at ON public.docuseal_submissions;
-- DROP TABLE IF EXISTS public.docuseal_submissions CASCADE;
-- DROP FUNCTION IF EXISTS public.docuseal_set_updated_at();
-- COMMIT;
