-- Migration 116: Customer C.A.R.E. State Tables
--
-- Purpose: Add database tables for Customer Cognitive Autonomous Relationship Execution (C.A.R.E.)
-- Impact: ADDITIVE ONLY - no existing tables modified, no runtime behavior change
-- Phase: PR1 of Customer C.A.R.E. v1 rollout
--
-- Tables:
--   - customer_care_state: Current C.A.R.E. state per entity (lead/contact/account)
--   - customer_care_state_history: Audit trail of all state transitions and decisions
--
-- Safety:
--   - hands_off_enabled defaults to FALSE (opt-in only)
--   - No triggers, no hooks, no automated state changes
--   - No RLS changes to existing tables
--
-- References:
--   - docs/product/customer-care-v1.md (behavioral contract)
--   - docs/build/customer-care-v1.tasks.md (Phase 1, PR1)
--   - docs/audits/customer-care-PR1-checklist.md

-- =============================================================================
-- Table: customer_care_state
-- =============================================================================
-- One row per (tenant, entity_type, entity_id) representing current C.A.R.E. state

CREATE TABLE IF NOT EXISTS public.customer_care_state (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant scoping (UUID for consistency with v3.0 schema)
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    
    -- Entity reference (polymorphic: lead, contact, or account)
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    
    -- C.A.R.E. state (canonical states from behavioral contract)
    care_state TEXT NOT NULL,
    
    -- Autonomy control (opt-in flag, default FALSE for safety)
    hands_off_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Escalation tracking
    escalation_status TEXT NULL,
    
    -- Signal tracking
    last_signal_at TIMESTAMPTZ NULL,
    
    -- Audit timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT customer_care_state_entity_type_check 
        CHECK (entity_type IN ('lead', 'contact', 'account')),
    
    CONSTRAINT customer_care_state_care_state_check
        CHECK (care_state IN (
            'unaware',
            'aware',
            'engaged',
            'evaluating',
            'committed',
            'active',
            'at_risk',
            'dormant',
            'reactivated',
            'lost'
        )),
    
    CONSTRAINT customer_care_state_escalation_status_check
        CHECK (escalation_status IS NULL OR escalation_status IN ('open', 'closed')),
    
    -- Unique constraint: one state per entity
    CONSTRAINT customer_care_state_unique_entity
        UNIQUE (tenant_id, entity_type, entity_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_customer_care_state_tenant_state 
    ON public.customer_care_state(tenant_id, care_state);

CREATE INDEX IF NOT EXISTS idx_customer_care_state_tenant_entity 
    ON public.customer_care_state(tenant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_customer_care_state_hands_off 
    ON public.customer_care_state(tenant_id, hands_off_enabled) 
    WHERE hands_off_enabled = true;

CREATE INDEX IF NOT EXISTS idx_customer_care_state_escalation 
    ON public.customer_care_state(tenant_id, escalation_status) 
    WHERE escalation_status IS NOT NULL;

-- =============================================================================
-- Table: customer_care_state_history
-- =============================================================================
-- Audit trail of all state transitions, decisions, and autonomous actions

CREATE TABLE IF NOT EXISTS public.customer_care_state_history (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant scoping
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    
    -- Entity reference
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    
    -- State transition
    from_state TEXT NULL,  -- NULL for initial state creation
    to_state TEXT NULL,    -- NULL for non-transition events
    
    -- Event classification
    event_type TEXT NOT NULL,
    
    -- Explainability
    reason TEXT NOT NULL,
    
    -- Additional context (flexible JSON for future extensibility)
    meta JSONB NULL,
    
    -- Actor tracking
    actor_type TEXT NOT NULL DEFAULT 'system',
    actor_id TEXT NULL,
    
    -- Audit timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT customer_care_state_history_entity_type_check 
        CHECK (entity_type IN ('lead', 'contact', 'account')),
    
    CONSTRAINT customer_care_state_history_actor_type_check
        CHECK (actor_type IN ('system', 'user', 'agent'))
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_customer_care_history_tenant_entity_time 
    ON public.customer_care_state_history(tenant_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_care_history_tenant_time 
    ON public.customer_care_state_history(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_care_history_event_type 
    ON public.customer_care_state_history(tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_care_history_actor 
    ON public.customer_care_state_history(actor_type, actor_id, created_at DESC) 
    WHERE actor_id IS NOT NULL;

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================
-- Basic RLS policies for tenant isolation and service role access

-- Enable RLS on customer_care_state
ALTER TABLE public.customer_care_state ENABLE ROW LEVEL SECURITY;

-- Service role full access (backend operations)
CREATE POLICY "customer_care_state_service_role_all" ON public.customer_care_state
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Tenant isolation for authenticated users (read-only for now)
-- Users can only see C.A.R.E. state for their own tenant
CREATE POLICY "customer_care_state_tenant_select" ON public.customer_care_state
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid
    );

-- Enable RLS on customer_care_state_history
ALTER TABLE public.customer_care_state_history ENABLE ROW LEVEL SECURITY;

-- Service role full access (backend operations)
CREATE POLICY "customer_care_state_history_service_role_all" ON public.customer_care_state_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Tenant isolation for authenticated users (read-only audit trail)
CREATE POLICY "customer_care_state_history_tenant_select" ON public.customer_care_state_history
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid
    );

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE public.customer_care_state IS 
    'Customer C.A.R.E. state: Current relationship state per entity (PR1 - Phase 1)';

COMMENT ON TABLE public.customer_care_state_history IS 
    'Customer C.A.R.E. history: Audit trail of all state transitions and autonomous decisions';

COMMENT ON COLUMN public.customer_care_state.hands_off_enabled IS 
    'Opt-in flag for autonomous actions. Default FALSE for safety. Set TRUE only after explicit customer consent.';

COMMENT ON COLUMN public.customer_care_state.care_state IS 
    'Canonical C.A.R.E. state from behavioral contract: unaware, aware, engaged, evaluating, committed, active, at_risk, dormant, reactivated, lost';

COMMENT ON COLUMN public.customer_care_state_history.event_type IS 
    'Event classification: state_proposed, state_applied, escalation_opened, escalation_closed, action_candidate, etc.';

-- =============================================================================
-- Verification
-- =============================================================================
-- Analyze tables for query planner statistics

ANALYZE public.customer_care_state;
ANALYZE public.customer_care_state_history;

-- End of migration
