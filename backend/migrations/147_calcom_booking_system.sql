-- Migration 147: Cal.com Booking System
--
-- Purpose: Add tables for session packages, session credits, and booking sessions
--          to support Cal.com self-hosted scheduling integration.
-- Impact: ADDITIVE ONLY — no existing tables modified
-- Apply to: prod (ehjlenywplgyiahgxkfj) AND dev (efzqxjpfewkrgpdootte)
--
-- Tables:
--   - session_packages: Tenant-defined service packages (e.g., "6-Session Training Package")
--   - session_credits: Per-contact/lead credit balances linked to a purchased package
--   - booking_sessions: Individual bookings linked to Cal.com UIDs and CRM entities

-- =============================================================================
-- Table: session_packages
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.session_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    session_count INTEGER NOT NULL CHECK (session_count > 0),
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    validity_days INTEGER NOT NULL DEFAULT 365 CHECK (validity_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_packages_tenant
    ON public.session_packages (tenant_id, is_active);

-- RLS: tenant isolation
ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_packages_tenant_isolation ON public.session_packages
    USING (tenant_id = (SELECT id FROM public.tenant WHERE id = tenant_id));

-- Service role bypass (backend uses service role key — needs unrestricted access)
CREATE POLICY session_packages_service_role ON public.session_packages
    TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- Table: session_credits
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.session_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    package_id UUID NOT NULL REFERENCES public.session_packages(id) ON DELETE RESTRICT,
    credits_purchased INTEGER NOT NULL CHECK (credits_purchased > 0),
    credits_remaining INTEGER NOT NULL CHECK (credits_remaining >= 0),
    purchase_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiry_date TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT session_credits_entity_check
        CHECK (contact_id IS NOT NULL OR lead_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_session_credits_tenant_contact
    ON public.session_credits (tenant_id, contact_id, expiry_date DESC);

CREATE INDEX IF NOT EXISTS idx_session_credits_tenant_lead
    ON public.session_credits (tenant_id, lead_id, expiry_date DESC);

CREATE INDEX IF NOT EXISTS idx_session_credits_package
    ON public.session_credits (package_id);

ALTER TABLE public.session_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_credits_tenant_isolation ON public.session_credits
    USING (tenant_id = (SELECT id FROM public.tenant WHERE id = tenant_id));

CREATE POLICY session_credits_service_role ON public.session_credits
    TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- Table: booking_sessions
-- =============================================================================

CREATE TYPE IF NOT EXISTS public.booking_status AS ENUM (
    'pending', 'confirmed', 'cancelled', 'completed', 'no_show'
);

CREATE TABLE IF NOT EXISTS public.booking_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    credit_id UUID REFERENCES public.session_credits(id) ON DELETE SET NULL,
    calcom_booking_id TEXT NOT NULL,
    calcom_event_type_id INTEGER,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    status public.booking_status NOT NULL DEFAULT 'pending',
    activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_booking_sessions_calcom_id
    ON public.booking_sessions (tenant_id, calcom_booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_sessions_tenant_contact
    ON public.booking_sessions (tenant_id, contact_id, scheduled_start DESC);

CREATE INDEX IF NOT EXISTS idx_booking_sessions_tenant_lead
    ON public.booking_sessions (tenant_id, lead_id, scheduled_start DESC);

CREATE INDEX IF NOT EXISTS idx_booking_sessions_status
    ON public.booking_sessions (tenant_id, status, scheduled_start DESC);

CREATE INDEX IF NOT EXISTS idx_booking_sessions_credit
    ON public.booking_sessions (credit_id);

ALTER TABLE public.booking_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_sessions_tenant_isolation ON public.booking_sessions
    USING (tenant_id = (SELECT id FROM public.tenant WHERE id = tenant_id));

CREATE POLICY booking_sessions_service_role ON public.booking_sessions
    TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- updated_at auto-update triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_packages_updated_at ON public.session_packages;
CREATE TRIGGER trg_session_packages_updated_at
    BEFORE UPDATE ON public.session_packages
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_session_credits_updated_at ON public.session_credits;
CREATE TRIGGER trg_session_credits_updated_at
    BEFORE UPDATE ON public.session_credits
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_booking_sessions_updated_at ON public.booking_sessions;
CREATE TRIGGER trg_booking_sessions_updated_at
    BEFORE UPDATE ON public.booking_sessions
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
