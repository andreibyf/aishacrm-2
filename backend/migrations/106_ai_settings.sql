-- Migration: 106_ai_settings.sql
-- Description: Create ai_settings table for configurable AI parameters
-- This table supports global defaults and per-tenant/per-agent overrides

-- Create the ai_settings table
CREATE TABLE IF NOT EXISTS ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope: NULL = global default, or specific tenant/agent
  tenant_id UUID REFERENCES tenant(id) ON DELETE CASCADE,
  agent_role TEXT DEFAULT 'aisha',  -- 'aisha', 'developer', 'sales_coach', etc.
  
  -- Setting identification
  category TEXT NOT NULL,           -- 'context', 'tools', 'memory', 'model', 'behavior'
  setting_key TEXT NOT NULL,
  
  -- Value with metadata
  setting_value JSONB NOT NULL,     -- { "value": 0.2, "min": 0, "max": 1, "type": "number" }
  display_name TEXT,                -- "Default Temperature"
  description TEXT,                 -- "Lower = deterministic, Higher = creative"
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  -- Uniqueness: one setting per scope
  UNIQUE(tenant_id, agent_role, setting_key)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_settings_lookup ON ai_settings(agent_role, setting_key);
CREATE INDEX IF NOT EXISTS idx_ai_settings_tenant ON ai_settings(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_settings_category ON ai_settings(category);

-- Add comment
COMMENT ON TABLE ai_settings IS 'Configurable AI parameters for AiSHA and other AI agents. Supports global defaults and per-tenant overrides.';

-- Seed global default settings (tenant_id = NULL means global)
INSERT INTO ai_settings (tenant_id, agent_role, category, setting_key, setting_value, display_name, description)
VALUES
  -- Context Management
  (NULL, 'aisha', 'context', 'max_messages', 
   '{"value": 8, "min": 2, "max": 20, "type": "number"}',
   'Max Messages per Request',
   'Limits conversation history sent to AI. Lower values save tokens but reduce context. Recommended: 6-10.'),
  
  (NULL, 'aisha', 'context', 'max_chars_per_message',
   '{"value": 1500, "min": 500, "max": 5000, "type": "number"}',
   'Max Characters per Message',
   'Truncates long messages to reduce token usage. Very long messages get cut off at this limit.'),
  
  -- Tool Execution
  (NULL, 'aisha', 'tools', 'max_iterations',
   '{"value": 3, "min": 1, "max": 10, "type": "number"}',
   'Max Tool Iterations',
   'How many tool calls AI can chain in one request. Higher allows complex multi-step tasks but uses more tokens.'),
  
  (NULL, 'aisha', 'tools', 'max_tools',
   '{"value": 12, "min": 5, "max": 30, "type": "number"}',
   'Max Tools per Request',
   'Limits tool schemas sent to AI. More tools = more capabilities but higher token cost per request.'),
  
  -- Memory/RAG
  (NULL, 'aisha', 'memory', 'top_k',
   '{"value": 3, "min": 0, "max": 10, "type": "number"}',
   'Memory Chunks to Retrieve',
   'Number of past notes/activities injected as context. Set to 0 to disable memory retrieval.'),
  
  (NULL, 'aisha', 'memory', 'max_chunk_chars',
   '{"value": 300, "min": 100, "max": 1000, "type": "number"}',
   'Max Chunk Size (chars)',
   'Truncates each memory chunk. Longer chunks provide more context but use more tokens.'),
  
  -- Model Behavior
  (NULL, 'aisha', 'model', 'temperature',
   '{"value": 0.4, "min": 0, "max": 1, "step": 0.1, "type": "number"}',
   'Temperature',
   'Controls randomness. 0 = very deterministic/factual, 1 = creative/varied. For CRM data, keep low (0.2-0.4).'),
  
  (NULL, 'aisha', 'model', 'top_p',
   '{"value": 1.0, "min": 0.1, "max": 1, "step": 0.1, "type": "number"}',
   'Top P (Nucleus Sampling)',
   'Alternative to temperature. 1.0 = consider all tokens, lower = focus on most likely tokens.'),
  
  -- Behavior
  (NULL, 'aisha', 'behavior', 'intent_confidence_threshold',
   '{"value": 0.7, "min": 0.3, "max": 1, "step": 0.1, "type": "number"}',
   'Intent Confidence Threshold',
   'When to use focused tool routing vs full tool set. Higher = more conservative intent matching.'),
  
  (NULL, 'aisha', 'behavior', 'enable_memory',
   '{"value": true, "type": "boolean"}',
   'Enable Memory/RAG',
   'When enabled, AI retrieves relevant past notes and activities as context for responses.'),
  
  (NULL, 'aisha', 'behavior', 'enable_follow_up_suggestions',
   '{"value": true, "type": "boolean"}',
   'Enable Follow-up Suggestions',
   'When enabled, AI provides 2-4 suggested follow-up actions after each response.')

ON CONFLICT (tenant_id, agent_role, setting_key) 
DO UPDATE SET 
  setting_value = EXCLUDED.setting_value,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Add Developer AI defaults
INSERT INTO ai_settings (tenant_id, agent_role, category, setting_key, setting_value, display_name, description)
VALUES
  (NULL, 'developer', 'model', 'temperature',
   '{"value": 0.2, "min": 0, "max": 1, "step": 0.1, "type": "number"}',
   'Temperature',
   'Developer AI uses lower temperature for more precise, deterministic responses.'),
  
  (NULL, 'developer', 'tools', 'max_iterations',
   '{"value": 5, "min": 1, "max": 15, "type": "number"}',
   'Max Tool Iterations',
   'Developer AI may need more iterations for complex debugging tasks.'),
  
  (NULL, 'developer', 'behavior', 'require_approval_for_destructive',
   '{"value": true, "type": "boolean"}',
   'Require Approval for Destructive Ops',
   'When enabled, destructive operations (delete, drop) require explicit user confirmation.')

ON CONFLICT (tenant_id, agent_role, setting_key) DO NOTHING;
