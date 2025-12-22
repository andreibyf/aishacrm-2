-- Migration: Create braid_audit_log table for AI tool execution audit trail
-- Purpose: Enterprise compliance, debugging, and governance for Braid SDK tool calls

-- Create braid_audit_log table
CREATE TABLE IF NOT EXISTS public.braid_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Context
    tenant_id UUID NOT NULL REFERENCES public.tenant(id),
    user_id UUID REFERENCES auth.users(id),
    user_email TEXT,
    user_role TEXT,
    
    -- Tool execution details
    tool_name TEXT NOT NULL,
    braid_function TEXT NOT NULL,
    braid_file TEXT,
    policy TEXT NOT NULL,
    tool_class TEXT,
    
    -- Request/Response
    input_args JSONB DEFAULT '{}'::jsonb,
    result_tag TEXT, -- 'Ok' or 'Err'
    result_value JSONB,
    error_type TEXT,
    error_message TEXT,
    
    -- Performance
    execution_time_ms INTEGER,
    cache_hit BOOLEAN DEFAULT false,
    
    -- Rate limiting context
    rate_limit_remaining INTEGER,
    rate_limit_window TEXT,
    
    -- Security context
    ip_address TEXT,
    user_agent TEXT,
    request_id TEXT,
    
    -- Flags
    is_dry_run BOOLEAN DEFAULT false,
    requires_confirmation BOOLEAN DEFAULT false,
    confirmation_provided BOOLEAN DEFAULT false,
    
    -- Entity context (for CRM operations)
    entity_type TEXT,
    entity_id UUID,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_braid_audit_tenant_id ON public.braid_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_braid_audit_user_id ON public.braid_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_braid_audit_tool_name ON public.braid_audit_log(tool_name);
CREATE INDEX IF NOT EXISTS idx_braid_audit_created_at ON public.braid_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_braid_audit_policy ON public.braid_audit_log(policy);
CREATE INDEX IF NOT EXISTS idx_braid_audit_result_tag ON public.braid_audit_log(result_tag);
CREATE INDEX IF NOT EXISTS idx_braid_audit_entity ON public.braid_audit_log(entity_type, entity_id);

-- Composite index for tenant + time range queries (common for audit reports)
CREATE INDEX IF NOT EXISTS idx_braid_audit_tenant_time ON public.braid_audit_log(tenant_id, created_at DESC);

-- Composite index for user activity queries
CREATE INDEX IF NOT EXISTS idx_braid_audit_user_time ON public.braid_audit_log(user_id, created_at DESC);

-- RLS Policy: Only service role and superadmins can read audit logs
ALTER TABLE public.braid_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role full access (backend operations)
CREATE POLICY "braid_audit_log_service_role_all" ON public.braid_audit_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Superadmin read access within their tenant
CREATE POLICY "braid_audit_log_superadmin_select" ON public.braid_audit_log
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_uuid FROM public.users 
            WHERE id = auth.uid() AND role = 'superadmin'
        )
    );

-- Admin read access within their tenant (limited)
CREATE POLICY "braid_audit_log_admin_select" ON public.braid_audit_log
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_uuid FROM public.users 
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
        AND created_at > now() - INTERVAL '30 days' -- Admins only see last 30 days
    );

-- Grant permissions
GRANT SELECT ON public.braid_audit_log TO authenticated;
GRANT ALL ON public.braid_audit_log TO service_role;

-- Comment for documentation
COMMENT ON TABLE public.braid_audit_log IS 'Audit log for Braid SDK AI tool executions. Tracks all tool calls with timing, results, and security context for compliance and debugging.';
COMMENT ON COLUMN public.braid_audit_log.tool_name IS 'Snake_case tool name (e.g., create_lead, get_account_details)';
COMMENT ON COLUMN public.braid_audit_log.braid_function IS 'PascalCase Braid function name (e.g., createLead, getAccountDetails)';
COMMENT ON COLUMN public.braid_audit_log.policy IS 'Policy applied: READ_ONLY, WRITE_OPERATIONS, DELETE_OPERATIONS, ADMIN_ONLY, ADMIN_ALL';
COMMENT ON COLUMN public.braid_audit_log.result_tag IS 'Braid result tag: Ok for success, Err for error';
COMMENT ON COLUMN public.braid_audit_log.execution_time_ms IS 'Tool execution time in milliseconds';
