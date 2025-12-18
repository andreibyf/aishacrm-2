-- ============================================================
-- Dashboard Bundle RPC - Single call for all dashboard data
-- ============================================================
-- This function returns stats + recent lists in one database call,
-- reducing 4 round-trips to 1.
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_bundle(
  p_tenant_id UUID,
  p_include_test_data BOOLEAN DEFAULT TRUE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSON;
  v_recent_activities JSON;
  v_recent_leads JSON;
  v_recent_opportunities JSON;
  v_result JSON;
BEGIN
  -- Get pre-aggregated stats from materialized view (if available)
  -- Falls back to live counts if MV doesn't exist or has no data
  BEGIN
    SELECT json_build_object(
      'total_contacts', COALESCE(total_contacts, 0),
      'total_accounts', COALESCE(total_accounts, 0),
      'total_leads', COALESCE(total_leads, 0),
      'total_opportunities', COALESCE(total_opportunities, 0),
      'open_leads', COALESCE(open_leads, 0),
      'won_opportunities', COALESCE(won_opportunities, 0),
      'open_opportunities', COALESCE(open_opportunities, 0),
      'leads_last_30_days', COALESCE(leads_last_30_days, 0),
      'activities_last_30_days', COALESCE(activities_last_30_days, 0),
      'pipeline_value', COALESCE(pipeline_value, 0),
      'won_value', COALESCE(won_value, 0)
    ) INTO v_stats
    FROM dashboard_stats_mv
    WHERE tenant_id = p_tenant_id;
  EXCEPTION WHEN undefined_table THEN
    -- MV doesn't exist, will compute live below
    v_stats := NULL;
  END;

  -- If MV stats not found, compute live (slower but accurate)
  IF v_stats IS NULL THEN
    SELECT json_build_object(
      'total_contacts', (SELECT COUNT(*) FROM contacts WHERE tenant_id = p_tenant_id AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'total_accounts', (SELECT COUNT(*) FROM accounts WHERE tenant_id = p_tenant_id AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'total_leads', (SELECT COUNT(*) FROM leads WHERE tenant_id = p_tenant_id AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'total_opportunities', (SELECT COUNT(*) FROM opportunities WHERE tenant_id = p_tenant_id AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'open_leads', (SELECT COUNT(*) FROM leads WHERE tenant_id = p_tenant_id AND status NOT IN ('converted', 'disqualified', 'closed') AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'won_opportunities', (SELECT COUNT(*) FROM opportunities WHERE tenant_id = p_tenant_id AND stage = 'closed_won' AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'open_opportunities', (SELECT COUNT(*) FROM opportunities WHERE tenant_id = p_tenant_id AND stage NOT IN ('closed_won', 'closed_lost') AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'leads_last_30_days', (SELECT COUNT(*) FROM leads WHERE tenant_id = p_tenant_id AND created_date >= NOW() - INTERVAL '30 days' AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'activities_last_30_days', (SELECT COUNT(*) FROM activities WHERE tenant_id = p_tenant_id AND created_at >= NOW() - INTERVAL '30 days' AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'pipeline_value', (SELECT COALESCE(SUM(amount), 0) FROM opportunities WHERE tenant_id = p_tenant_id AND stage NOT IN ('closed_won', 'closed_lost') AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'won_value', (SELECT COALESCE(SUM(amount), 0) FROM opportunities WHERE tenant_id = p_tenant_id AND stage = 'closed_won' AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)),
      'source', 'live'
    ) INTO v_stats;
  END IF;

  -- Get recent activities (limit 10)
  SELECT COALESCE(json_agg(a ORDER BY a.created_at DESC), '[]'::json)
  INTO v_recent_activities
  FROM (
    SELECT id, type, subject, status, created_at, created_date, assigned_to
    FROM activities
    WHERE tenant_id = p_tenant_id
      AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)
    ORDER BY created_at DESC
    LIMIT 10
  ) a;

  -- Get recent leads (limit 5)
  SELECT COALESCE(json_agg(l ORDER BY l.created_date DESC), '[]'::json)
  INTO v_recent_leads
  FROM (
    SELECT id, first_name, last_name, company, created_date, status
    FROM leads
    WHERE tenant_id = p_tenant_id
      AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)
    ORDER BY created_date DESC
    LIMIT 5
  ) l;

  -- Get recent opportunities (limit 5)
  SELECT COALESCE(json_agg(o ORDER BY o.updated_at DESC), '[]'::json)
  INTO v_recent_opportunities
  FROM (
    SELECT id, name, amount, stage, updated_at
    FROM opportunities
    WHERE tenant_id = p_tenant_id
      AND (p_include_test_data OR COALESCE(is_test_data, FALSE) = FALSE)
    ORDER BY updated_at DESC
    LIMIT 5
  ) o;

  -- Build final result
  v_result := json_build_object(
    'stats', v_stats,
    'lists', json_build_object(
      'recentActivities', v_recent_activities,
      'recentLeads', v_recent_leads,
      'recentOpportunities', v_recent_opportunities
    ),
    'meta', json_build_object(
      'tenant_id', p_tenant_id,
      'generated_at', NOW(),
      'source', CASE WHEN v_stats->>'source' = 'live' THEN 'live' ELSE 'materialized_view' END
    )
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_dashboard_bundle(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_bundle(UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION get_dashboard_bundle IS 'Returns complete dashboard data (stats + recent lists) in a single call. Uses materialized view for stats when available, falls back to live queries.';
