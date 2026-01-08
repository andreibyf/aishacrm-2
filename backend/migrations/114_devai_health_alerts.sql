-- =====================================================
-- Migration 114: Developer AI Health Monitoring System
-- =====================================================
-- Purpose: Create health alerts table for autonomous issue detection
-- Created: 2026-01-07
-- =====================================================

-- Create health alerts table
CREATE TABLE IF NOT EXISTS devai_health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category TEXT NOT NULL CHECK (category IN ('error_spike', 'resource', 'api', 'database', 'docker', 'security', 'performance')),
  
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  
  affected_endpoints TEXT[],
  error_count INTEGER DEFAULT 0,
  recommendation TEXT,
  
  auto_detected BOOLEAN DEFAULT true,
  false_positive BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_devai_health_alerts_severity ON devai_health_alerts(severity) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_devai_health_alerts_category ON devai_health_alerts(category);
CREATE INDEX IF NOT EXISTS idx_devai_health_alerts_detected_at ON devai_health_alerts(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_devai_health_alerts_unresolved ON devai_health_alerts(detected_at DESC) WHERE resolved_at IS NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_devai_health_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_devai_health_alerts_updated_at ON devai_health_alerts;
CREATE TRIGGER trigger_update_devai_health_alerts_updated_at
  BEFORE UPDATE ON devai_health_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_devai_health_alerts_updated_at();

-- Create health monitoring stats view for quick dashboard queries
CREATE OR REPLACE VIEW devai_health_stats AS
SELECT
  COUNT(*) FILTER (WHERE resolved_at IS NULL) AS active_alerts,
  COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'critical') AS critical_alerts,
  COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'high') AS high_alerts,
  COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'medium') AS medium_alerts,
  COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'low') AS low_alerts,
  COUNT(*) FILTER (WHERE detected_at > NOW() - INTERVAL '24 hours') AS alerts_24h,
  COUNT(*) FILTER (WHERE detected_at > NOW() - INTERVAL '1 hour') AS alerts_1h,
  MAX(detected_at) FILTER (WHERE resolved_at IS NULL) AS last_alert_time
FROM devai_health_alerts;

-- Create alert deduplication function (prevent duplicate alerts for same issue)
CREATE OR REPLACE FUNCTION devai_check_duplicate_alert(
  p_category TEXT,
  p_title TEXT,
  p_time_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
  v_existing_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_existing_count
  FROM devai_health_alerts
  WHERE category = p_category
    AND title = p_title
    AND resolved_at IS NULL
    AND detected_at > NOW() - (p_time_window_minutes || ' minutes')::INTERVAL;
  
  RETURN v_existing_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (public for now, can restrict to superadmin role later)
GRANT SELECT, INSERT, UPDATE ON devai_health_alerts TO authenticated;
GRANT SELECT ON devai_health_stats TO authenticated;
GRANT EXECUTE ON FUNCTION devai_check_duplicate_alert TO authenticated;

COMMENT ON TABLE devai_health_alerts IS 'Autonomous health monitoring alerts for Developer AI system';
COMMENT ON VIEW devai_health_stats IS 'Real-time aggregated health monitoring statistics';
COMMENT ON FUNCTION devai_check_duplicate_alert IS 'Check if similar alert exists to prevent duplicates';
