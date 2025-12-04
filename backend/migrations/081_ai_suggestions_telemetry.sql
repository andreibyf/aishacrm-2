-- Migration 081: AI Suggestions Telemetry
-- Adds telemetry columns for tracking suggestion outcomes and feedback
-- PREREQUISITE: Migration 080_ai_suggestions_table.sql must be run first

-- Add telemetry columns to ai_suggestions (skip trigger_context - already in 080)
ALTER TABLE ai_suggestions ADD COLUMN IF NOT EXISTS feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5);
ALTER TABLE ai_suggestions ADD COLUMN IF NOT EXISTS feedback_comment TEXT;
ALTER TABLE ai_suggestions ADD COLUMN IF NOT EXISTS outcome_tracked BOOLEAN DEFAULT FALSE;
ALTER TABLE ai_suggestions ADD COLUMN IF NOT EXISTS outcome_positive BOOLEAN;
ALTER TABLE ai_suggestions ADD COLUMN IF NOT EXISTS outcome_measured_at TIMESTAMPTZ;
ALTER TABLE ai_suggestions ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER;
ALTER TABLE ai_suggestions ADD COLUMN IF NOT EXISTS model_version TEXT;
-- Note: trigger_context already exists in migration 080

-- Create telemetry aggregation table for performance metrics
CREATE TABLE IF NOT EXISTS ai_suggestion_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    
    -- Time bucket for aggregation
    time_bucket TIMESTAMPTZ NOT NULL,
    bucket_size TEXT NOT NULL DEFAULT 'day', -- 'hour', 'day', 'week', 'month'
    
    -- Trigger type metrics
    trigger_type TEXT NOT NULL,
    
    -- Counts
    suggestions_generated INTEGER DEFAULT 0,
    suggestions_approved INTEGER DEFAULT 0,
    suggestions_rejected INTEGER DEFAULT 0,
    suggestions_applied INTEGER DEFAULT 0,
    suggestions_expired INTEGER DEFAULT 0,
    
    -- Quality metrics
    avg_confidence NUMERIC(4,3),
    avg_execution_time_ms INTEGER,
    avg_feedback_rating NUMERIC(3,2),
    positive_outcomes INTEGER DEFAULT 0,
    negative_outcomes INTEGER DEFAULT 0,
    
    -- Timing metrics
    avg_review_time_minutes INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, time_bucket, bucket_size, trigger_type)
);

-- Create feedback events table for detailed tracking
CREATE TABLE IF NOT EXISTS ai_suggestion_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    suggestion_id UUID NOT NULL REFERENCES ai_suggestions(id) ON DELETE CASCADE,
    
    -- Feedback details
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('rating', 'comment', 'outcome', 'correction')),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    outcome_positive BOOLEAN,
    correction_data JSONB, -- What the user actually did vs what was suggested
    
    -- Meta
    user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for telemetry queries
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_telemetry 
    ON ai_suggestions(tenant_id, trigger_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_suggestion_metrics_lookup 
    ON ai_suggestion_metrics(tenant_id, time_bucket, trigger_type);

CREATE INDEX IF NOT EXISTS idx_ai_suggestion_feedback_lookup 
    ON ai_suggestion_feedback(tenant_id, suggestion_id, created_at);

-- RLS for new tables
ALTER TABLE ai_suggestion_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestion_feedback ENABLE ROW LEVEL SECURITY;

-- Metrics policies
DROP POLICY IF EXISTS "tenant_isolation_ai_suggestion_metrics" ON ai_suggestion_metrics;
CREATE POLICY "tenant_isolation_ai_suggestion_metrics" ON ai_suggestion_metrics
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS "service_role_ai_suggestion_metrics" ON ai_suggestion_metrics;
CREATE POLICY "service_role_ai_suggestion_metrics" ON ai_suggestion_metrics
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Feedback policies
DROP POLICY IF EXISTS "tenant_isolation_ai_suggestion_feedback" ON ai_suggestion_feedback;
CREATE POLICY "tenant_isolation_ai_suggestion_feedback" ON ai_suggestion_feedback
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS "service_role_ai_suggestion_feedback" ON ai_suggestion_feedback;
CREATE POLICY "service_role_ai_suggestion_feedback" ON ai_suggestion_feedback
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Function to aggregate metrics (called by cron or trigger)
CREATE OR REPLACE FUNCTION aggregate_ai_suggestion_metrics(
    p_tenant_id UUID,
    p_bucket_size TEXT DEFAULT 'day'
) RETURNS INTEGER AS $$
DECLARE
    v_time_bucket TIMESTAMPTZ;
    v_count INTEGER := 0;
BEGIN
    -- Determine time bucket start
    CASE p_bucket_size
        WHEN 'hour' THEN v_time_bucket := date_trunc('hour', NOW());
        WHEN 'day' THEN v_time_bucket := date_trunc('day', NOW());
        WHEN 'week' THEN v_time_bucket := date_trunc('week', NOW());
        WHEN 'month' THEN v_time_bucket := date_trunc('month', NOW());
        ELSE v_time_bucket := date_trunc('day', NOW());
    END CASE;

    -- Aggregate by trigger type
    INSERT INTO ai_suggestion_metrics (
        tenant_id, time_bucket, bucket_size, trigger_type,
        suggestions_generated, suggestions_approved, suggestions_rejected,
        suggestions_applied, suggestions_expired,
        avg_confidence, avg_execution_time_ms, avg_feedback_rating,
        positive_outcomes, negative_outcomes, avg_review_time_minutes
    )
    SELECT 
        p_tenant_id,
        v_time_bucket,
        p_bucket_size,
        trigger_type,
        COUNT(*) AS suggestions_generated,
        COUNT(*) FILTER (WHERE status = 'approved' OR status = 'applied') AS suggestions_approved,
        COUNT(*) FILTER (WHERE status = 'rejected') AS suggestions_rejected,
        COUNT(*) FILTER (WHERE status = 'applied') AS suggestions_applied,
        COUNT(*) FILTER (WHERE status = 'expired') AS suggestions_expired,
        AVG(confidence) AS avg_confidence,
        AVG(execution_time_ms) AS avg_execution_time_ms,
        AVG(feedback_rating) AS avg_feedback_rating,
        COUNT(*) FILTER (WHERE outcome_positive = true) AS positive_outcomes,
        COUNT(*) FILTER (WHERE outcome_positive = false) AS negative_outcomes,
        AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 60)::INTEGER AS avg_review_time_minutes
    FROM ai_suggestions
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_time_bucket
      AND created_at < v_time_bucket + (
          CASE p_bucket_size
              WHEN 'hour' THEN INTERVAL '1 hour'
              WHEN 'day' THEN INTERVAL '1 day'
              WHEN 'week' THEN INTERVAL '1 week'
              WHEN 'month' THEN INTERVAL '1 month'
              ELSE INTERVAL '1 day'
          END
      )
    GROUP BY trigger_type
    ON CONFLICT (tenant_id, time_bucket, bucket_size, trigger_type)
    DO UPDATE SET
        suggestions_generated = EXCLUDED.suggestions_generated,
        suggestions_approved = EXCLUDED.suggestions_approved,
        suggestions_rejected = EXCLUDED.suggestions_rejected,
        suggestions_applied = EXCLUDED.suggestions_applied,
        suggestions_expired = EXCLUDED.suggestions_expired,
        avg_confidence = EXCLUDED.avg_confidence,
        avg_execution_time_ms = EXCLUDED.avg_execution_time_ms,
        avg_feedback_rating = EXCLUDED.avg_feedback_rating,
        positive_outcomes = EXCLUDED.positive_outcomes,
        negative_outcomes = EXCLUDED.negative_outcomes,
        avg_review_time_minutes = EXCLUDED.avg_review_time_minutes,
        updated_at = NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE ai_suggestion_metrics IS 'Aggregated metrics for AI suggestion performance tracking';
COMMENT ON TABLE ai_suggestion_feedback IS 'Individual feedback events for AI suggestions';
COMMENT ON FUNCTION aggregate_ai_suggestion_metrics IS 'Aggregates suggestion metrics into time buckets for reporting';
