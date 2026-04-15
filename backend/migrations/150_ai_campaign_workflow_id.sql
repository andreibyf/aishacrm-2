-- Migration 150: Add workflow_id to ai_campaign for workflow webhook dispatch
ALTER TABLE ai_campaign
  ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES workflow(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_campaign_workflow_id
  ON ai_campaign(workflow_id) WHERE workflow_id IS NOT NULL;
