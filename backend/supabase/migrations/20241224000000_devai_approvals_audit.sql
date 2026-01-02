-- ============================================================
-- DEVELOPER AI APPROVALS & AUDIT TRAIL
-- Phase 6: Safety, Approvals, Audit, Export (APP-WIDE)
-- ============================================================
-- This migration creates app-wide tables for Developer AI approval workflow.
-- NO tenant_id logic - this is superadmin-only, app-wide functionality.

-- ============================================================
-- 1. APPROVALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.devai_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Who requested this action
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Approval status with constraint
  status text NOT NULL DEFAULT 'pending',
  CONSTRAINT devai_approvals_status_check 
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  
  -- What tool was called
  tool_name text NOT NULL,
  
  -- Redacted tool arguments (MUST be redacted before storage)
  tool_args jsonb,
  
  -- Preview of what will happen (diff or command summary)
  preview jsonb,
  
  -- Approval metadata
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  
  -- Execution metadata
  executed_at timestamptz,
  error text,
  
  -- Change tracking
  changed_files jsonb, -- Array of file paths that were modified
  diff text, -- Unified diff of changes
  before_snapshot jsonb, -- State before execution
  after_snapshot jsonb, -- State after execution
  
  -- Human-readable notes
  note text,
  rejected_reason text
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_devai_approvals_status ON public.devai_approvals(status);
CREATE INDEX IF NOT EXISTS idx_devai_approvals_created_at ON public.devai_approvals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_devai_approvals_requested_by ON public.devai_approvals(requested_by);

-- ============================================================
-- 2. AUDIT TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.devai_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Who performed the action
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- What action was performed
  action text NOT NULL,
  
  -- Link to approval if applicable
  approval_id uuid REFERENCES public.devai_approvals(id) ON DELETE SET NULL,
  
  -- Redacted details about the action
  details jsonb
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_devai_audit_created_at ON public.devai_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_devai_audit_actor ON public.devai_audit(actor);
CREATE INDEX IF NOT EXISTS idx_devai_audit_approval_id ON public.devai_audit(approval_id);

-- ============================================================
-- 3. RLS POLICIES (DENY ALL - SERVICE ROLE ONLY)
-- ============================================================
-- Enable RLS on both tables
ALTER TABLE public.devai_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devai_audit ENABLE ROW LEVEL SECURITY;

-- NO POLICIES - All access must go through backend with service role
-- This ensures approvals can only be created/modified via controlled API endpoints
-- Direct client access is completely blocked

-- ============================================================
-- 4. UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_devai_approvals_updated_at
  BEFORE UPDATE ON public.devai_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VERIFICATION QUERIES (for manual testing)
-- ============================================================
-- To verify the migration:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'devai_%';
-- SELECT * FROM pg_policies WHERE tablename IN ('devai_approvals', 'devai_audit');
-- (Should return 0 rows - no policies = deny all)
