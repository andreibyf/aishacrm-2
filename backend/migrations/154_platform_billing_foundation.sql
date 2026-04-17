-- Migration 154: Platform Billing Foundation (Phase 1)
--
-- Purpose: Establish the durable billing foundation that lets AiSHA charge
--          tenant organizations, accept payments, display invoices in the tenant
--          portal, and support billing exemptions.
--
-- Impact: ADDITIVE ONLY -- no existing tables modified except a new nullable
--         column added to `tenant` (billing_state).
--
-- Apply to: dev (efzqxjpfewkrgpdootte) FIRST, then prod (ehjlenywplgyiahgxkfj)
--
-- Domain scope: PLATFORM BILLING ONLY (AiSHA <-> tenant). Does NOT touch the
--               Cal.com tenant<->client flow (session_packages, session_credits,
--               booking_sessions, stripe-webhook.js at /api/webhooks/stripe).
--
-- Tables created:
--   - billing_plans               (catalog of plans offered by AiSHA)
--   - billing_accounts            (one per tenant -- contact/company/tax/exemption)
--   - tenant_subscriptions        (active plan assignment per tenant)
--   - invoices                    (platform-issued invoices)
--   - invoice_line_items          (line items per invoice)
--   - payments                    (payment attempts and captures)
--   - billing_events              (immutable audit log of all billing actions)
--
-- Column added:
--   - tenant.billing_state TEXT   (derived/cached state label; source of truth
--                                  lives in tenant_subscriptions + billing_accounts)
--
-- Decisions locked:
--   - Exemption scope: boolean flag (billing_accounts.billing_exempt + reason).
--   - Platform Stripe credentials: NOT stored here -- read from Doppler
--     (STRIPE_PLATFORM_SECRET_KEY, STRIPE_PLATFORM_WEBHOOK_SECRET).
--     tenant_integrations remains Cal.com-only.

BEGIN;

-- =============================================================================
-- tenant.billing_state column
-- =============================================================================
-- Derived cache only. Authoritative state is computed from tenant_subscriptions
-- + billing_accounts.billing_exempt. Held here for cheap read access and for
-- suspension middleware to gate non-billing routes without a join.

ALTER TABLE public.tenant
    ADD COLUMN IF NOT EXISTS billing_state TEXT
    DEFAULT 'active'
    CHECK (billing_state IN (
        'active',
        'past_due',
        'grace_period',
        'suspended',
        'billing_exempt',
        'canceled'
    ));

CREATE INDEX IF NOT EXISTS idx_tenant_billing_state
    ON public.tenant (billing_state)
    WHERE billing_state <> 'active';

COMMENT ON COLUMN public.tenant.billing_state IS
    'Derived/cached platform billing state. Source of truth: tenant_subscriptions.status + billing_accounts.billing_exempt. Updated by billingStateMachine service.';

-- =============================================================================
-- billing_plans (platform-wide catalog)
-- =============================================================================
-- Not tenant-scoped: one catalog for the whole platform.

CREATE TABLE IF NOT EXISTS public.billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    billing_interval TEXT NOT NULL
        CHECK (billing_interval IN ('month', 'year', 'one_time')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'usd',
    is_active BOOLEAN NOT NULL DEFAULT true,
    features_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    module_entitlements_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    seat_limit INTEGER,
    usage_rules_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_plans_active
    ON public.billing_plans (is_active) WHERE is_active = true;

COMMENT ON TABLE public.billing_plans IS
    'Platform-wide catalog of plans AiSHA offers to tenants. Not tenant-scoped.';

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_plans_read_all ON public.billing_plans;
CREATE POLICY billing_plans_read_all ON public.billing_plans
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS billing_plans_service_role ON public.billing_plans;
CREATE POLICY billing_plans_service_role ON public.billing_plans
    TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- billing_accounts
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.billing_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE
        REFERENCES public.tenant(id) ON DELETE CASCADE,

    -- Billing contact
    billing_contact_name TEXT,
    billing_email TEXT,
    company_name TEXT,
    billing_address JSONB NOT NULL DEFAULT '{}'::JSONB,
    tax_id TEXT,
    currency TEXT NOT NULL DEFAULT 'usd',

    -- Provider binding
    payment_provider TEXT NOT NULL DEFAULT 'stripe'
        CHECK (payment_provider IN ('stripe', 'manual')),
    provider_customer_id TEXT,

    -- Billing mode
    -- MVP: boolean exemption only. `billing_mode` retained for forward
    -- compatibility but constrained to two values for now.
    billing_mode TEXT NOT NULL DEFAULT 'standard_billing'
        CHECK (billing_mode IN ('standard_billing', 'manual_billing')),

    -- Exemption (boolean flag + audit trail)
    billing_exempt BOOLEAN NOT NULL DEFAULT false,
    exempt_reason TEXT,
    exempt_set_by UUID,  -- references users(id), not enforced here to avoid migration order coupling
    exempt_set_at TIMESTAMPTZ,

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- If exempt, we require a reason and an actor for audit safety
    CONSTRAINT billing_accounts_exempt_audit_required
        CHECK (
            billing_exempt = false
            OR (exempt_reason IS NOT NULL AND exempt_set_by IS NOT NULL AND exempt_set_at IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_billing_accounts_tenant
    ON public.billing_accounts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_exempt
    ON public.billing_accounts (billing_exempt) WHERE billing_exempt = true;
CREATE INDEX IF NOT EXISTS idx_billing_accounts_provider_customer
    ON public.billing_accounts (provider_customer_id)
    WHERE provider_customer_id IS NOT NULL;

COMMENT ON TABLE public.billing_accounts IS
    'One per tenant. Billing profile + exemption state.';
COMMENT ON COLUMN public.billing_accounts.billing_exempt IS
    'If true, tenant is indefinitely exempt from platform billing. No invoices generated, no dunning, no suspension. Requires reason + actor + timestamp.';

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_accounts_tenant_read ON public.billing_accounts;
CREATE POLICY billing_accounts_tenant_read ON public.billing_accounts
    FOR SELECT USING (
        tenant_id = (current_setting('app.current_tenant_id', true))::uuid
    );

DROP POLICY IF EXISTS billing_accounts_service_role ON public.billing_accounts;
CREATE POLICY billing_accounts_service_role ON public.billing_accounts
    TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- tenant_subscriptions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL
        REFERENCES public.tenant(id) ON DELETE CASCADE,
    billing_plan_id UUID NOT NULL
        REFERENCES public.billing_plans(id) ON DELETE RESTRICT,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN (
            'draft',
            'active',
            'past_due',
            'grace_period',
            'suspended',
            'canceled'
        )),

    provider_subscription_id TEXT,
    start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    renewal_date TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    grace_period_ends_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one non-canceled subscription per tenant at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_subscriptions_one_active
    ON public.tenant_subscriptions (tenant_id)
    WHERE status <> 'canceled';

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant
    ON public.tenant_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status
    ON public.tenant_subscriptions (status) WHERE status <> 'canceled';
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_renewal
    ON public.tenant_subscriptions (renewal_date)
    WHERE status IN ('active', 'past_due', 'grace_period');
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_provider
    ON public.tenant_subscriptions (provider_subscription_id)
    WHERE provider_subscription_id IS NOT NULL;

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_subscriptions_tenant_read ON public.tenant_subscriptions;
CREATE POLICY tenant_subscriptions_tenant_read ON public.tenant_subscriptions
    FOR SELECT USING (
        tenant_id = (current_setting('app.current_tenant_id', true))::uuid
    );

DROP POLICY IF EXISTS tenant_subscriptions_service_role ON public.tenant_subscriptions;
CREATE POLICY tenant_subscriptions_service_role ON public.tenant_subscriptions
    TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- invoices
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL
        REFERENCES public.tenant(id) ON DELETE CASCADE,
    subscription_id UUID
        REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,

    invoice_number TEXT NOT NULL,
    issue_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_date TIMESTAMPTZ NOT NULL,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft',
            'open',
            'paid',
            'void',
            'uncollectible'
        )),

    subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
    tax_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_total_cents >= 0),
    total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
    amount_paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
    balance_due_cents INTEGER NOT NULL DEFAULT 0,

    currency TEXT NOT NULL DEFAULT 'usd',

    external_invoice_id TEXT,
    hosted_invoice_url TEXT,
    pdf_url TEXT,
    memo TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT invoices_unique_number_per_tenant UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant
    ON public.invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status
    ON public.invoices (status) WHERE status IN ('open', 'draft');
CREATE INDEX IF NOT EXISTS idx_invoices_due_date
    ON public.invoices (due_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_invoices_subscription
    ON public.invoices (subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_external
    ON public.invoices (external_invoice_id) WHERE external_invoice_id IS NOT NULL;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_tenant_read ON public.invoices;
CREATE POLICY invoices_tenant_read ON public.invoices
    FOR SELECT USING (
        tenant_id = (current_setting('app.current_tenant_id', true))::uuid
    );

DROP POLICY IF EXISTS invoices_service_role ON public.invoices;
CREATE POLICY invoices_service_role ON public.invoices
    TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- invoice_line_items
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL
        REFERENCES public.invoices(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL
        CHECK (item_type IN ('subscription', 'setup_fee', 'usage', 'adjustment', 'credit', 'discount')),
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice
    ON public.invoice_line_items (invoice_id);

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_line_items_tenant_read ON public.invoice_line_items;
CREATE POLICY invoice_line_items_tenant_read ON public.invoice_line_items
    FOR SELECT USING (
        invoice_id IN (
            SELECT id FROM public.invoices
            WHERE tenant_id = (current_setting('app.current_tenant_id', true))::uuid
        )
    );

DROP POLICY IF EXISTS invoice_line_items_service_role ON public.invoice_line_items;
CREATE POLICY invoice_line_items_service_role ON public.invoice_line_items
    TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- payments
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL
        REFERENCES public.tenant(id) ON DELETE CASCADE,
    invoice_id UUID
        REFERENCES public.invoices(id) ON DELETE SET NULL,

    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL
        CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),

    provider_payment_intent_id TEXT,
    provider_charge_id TEXT,
    payment_method_type TEXT,
    paid_at TIMESTAMPTZ,
    receipt_url TEXT,
    failure_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: a given Stripe payment_intent produces exactly one payment row
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_payment_intent
    ON public.payments (provider_payment_intent_id)
    WHERE provider_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_tenant
    ON public.payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice
    ON public.payments (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status
    ON public.payments (status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_tenant_read ON public.payments;
CREATE POLICY payments_tenant_read ON public.payments
    FOR SELECT USING (
        tenant_id = (current_setting('app.current_tenant_id', true))::uuid
    );

DROP POLICY IF EXISTS payments_service_role ON public.payments;
CREATE POLICY payments_service_role ON public.payments
    TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- billing_events (immutable audit log)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID
        REFERENCES public.tenant(id) ON DELETE CASCADE,

    event_type TEXT NOT NULL,
    -- Canonical event types (enforced at app layer):
    --   invoice.created, invoice.sent, invoice.past_due, invoice.paid, invoice.voided
    --   payment.received, payment.failed, payment.refunded
    --   subscription.created, subscription.canceled, subscription.renewed
    --   tenant.suspension_warning, tenant.suspended, tenant.unsuspended
    --   tenant.billing_exempt_set, tenant.billing_exempt_removed
    --   plan.assigned, plan.changed

    source TEXT NOT NULL
        CHECK (source IN ('system', 'admin', 'webhook', 'api')),
    actor_id UUID,
    payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    request_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_tenant
    ON public.billing_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_events_type
    ON public.billing_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_events_actor
    ON public.billing_events (actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;

-- Immutable: no UPDATE, no DELETE. Enforce with trigger.
CREATE OR REPLACE FUNCTION public.billing_events_prevent_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'billing_events is append-only -- % not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_events_no_update ON public.billing_events;
CREATE TRIGGER trg_billing_events_no_update
    BEFORE UPDATE OR DELETE ON public.billing_events
    FOR EACH ROW EXECUTE FUNCTION public.billing_events_prevent_modification();

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_events_tenant_read ON public.billing_events;
CREATE POLICY billing_events_tenant_read ON public.billing_events
    FOR SELECT USING (
        tenant_id = (current_setting('app.current_tenant_id', true))::uuid
    );

DROP POLICY IF EXISTS billing_events_service_role ON public.billing_events;
CREATE POLICY billing_events_service_role ON public.billing_events
    TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- updated_at triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.billing_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'billing_plans',
        'billing_accounts',
        'tenant_subscriptions',
        'invoices',
        'payments'
    ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%I_set_updated_at ON public.%I;
             CREATE TRIGGER trg_%I_set_updated_at
                BEFORE UPDATE ON public.%I
                FOR EACH ROW EXECUTE FUNCTION public.billing_set_updated_at();',
            t, t, t, t
        );
    END LOOP;
END $$;

-- =============================================================================
-- Seed default plans (idempotent)
-- =============================================================================

INSERT INTO public.billing_plans (code, name, description, billing_interval, amount_cents, currency, is_active)
VALUES
    ('starter_monthly',    'Starter',    'Entry tier -- CRM core + AI assistant', 'month', 4900,  'usd', true),
    ('growth_monthly',     'Growth',     'Starter + workflows + campaigns',       'month', 14900, 'usd', true),
    ('pro_monthly',        'Pro',        'Growth + CARE + multi-team',            'month', 29900, 'usd', true)
ON CONFLICT (code) DO NOTHING;

COMMIT;
