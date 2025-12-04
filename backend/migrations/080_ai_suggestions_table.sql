-- Phase 3: Autonomous Operations - AI Suggestions Table
-- This table stores AI-generated suggestions awaiting human approval

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  
  -- Trigger context
  trigger_id TEXT NOT NULL,                    -- e.g., 'lead_stagnant', 'deal_decay', 'account_risk'
  trigger_context JSONB DEFAULT '{}',          -- Context that triggered the suggestion
  record_type TEXT,                            -- 'lead', 'opportunity', 'account', 'contact', 'activity'
  record_id UUID,                              -- The record this suggestion relates to
  
  -- AI-generated action proposal
  action JSONB NOT NULL,                       -- { tool_name, tool_args, ... }
  confidence DECIMAL(3,2) DEFAULT 0.00,        -- 0.00 to 1.00
  reasoning TEXT,                              -- AI's explanation for the suggestion
  
  -- Workflow state
  status TEXT NOT NULL DEFAULT 'pending',      -- pending, approved, rejected, applied, expired
  priority TEXT DEFAULT 'normal',              -- low, normal, high, urgent
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,                      -- Auto-expire old suggestions
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  applied_at TIMESTAMPTZ,
  apply_result JSONB,                          -- Result of applying the action
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'expired')),
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_tenant_status 
  ON ai_suggestions(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_tenant_pending 
  ON ai_suggestions(tenant_id, created_at DESC) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_record 
  ON ai_suggestions(record_type, record_id);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_trigger 
  ON ai_suggestions(trigger_id);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_expires 
  ON ai_suggestions(expires_at) 
  WHERE status = 'pending' AND expires_at IS NOT NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ai_suggestions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ai_suggestions_updated_at ON ai_suggestions;
CREATE TRIGGER trg_ai_suggestions_updated_at
  BEFORE UPDATE ON ai_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_suggestions_updated_at();

-- Enable RLS
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (tenant isolation)
DROP POLICY IF EXISTS ai_suggestions_tenant_isolation ON ai_suggestions;
CREATE POLICY ai_suggestions_tenant_isolation ON ai_suggestions
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Comments
COMMENT ON TABLE ai_suggestions IS 'Phase 3: AI-generated suggestions awaiting human approval';
COMMENT ON COLUMN ai_suggestions.trigger_id IS 'Identifier for the trigger type (e.g., lead_stagnant, deal_decay)';
COMMENT ON COLUMN ai_suggestions.action IS 'Proposed Braid tool call with arguments';
COMMENT ON COLUMN ai_suggestions.confidence IS 'AI confidence score from 0.00 to 1.00';
COMMENT ON COLUMN ai_suggestions.status IS 'Workflow state: pending -> approved/rejected -> applied';
