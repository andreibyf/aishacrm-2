-- 091_ai_campaign_execution_hardening.sql
-- Phase 1 hardening tables for campaign target execution and event audit.

CREATE TABLE IF NOT EXISTS ai_campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  channel TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  destination TEXT,
  target_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  started_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  contact_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  event_type TEXT NOT NULL,
  attempt_no INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_campaign_targets_campaign_status
  ON ai_campaign_targets(campaign_id, status);

ALTER TABLE ai_campaign_targets
  ADD COLUMN IF NOT EXISTS channel TEXT;

ALTER TABLE ai_campaign_targets
  ADD COLUMN IF NOT EXISTS destination TEXT;

ALTER TABLE ai_campaign_targets
  ADD COLUMN IF NOT EXISTS target_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ai_campaign_targets
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE ai_campaign_targets
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
