-- Migration: Optimized partial indexes for dashboard queries
--
-- Problem: NOT IN queries like "status NOT IN ('converted','lost')" don't use
-- standard composite indexes efficiently. Partial indexes for the specific
-- conditions dramatically improve performance.
--
-- Target queries from /api/reports/dashboard-bundle:
--   - openLeads: leads WHERE status NOT IN ('converted','lost')
--   - openOpportunities: opportunities WHERE stage NOT IN ('won','closed_won','lost','closed_lost')
--   - newLeadsLast30: leads WHERE created_date >= 30 days ago AND status NOT IN ('converted','lost')

-- =============================================================================
-- LEADS: Partial index for "open" leads (not converted/lost)
-- =============================================================================
-- Speeds up: openLeads count, newLeadsLast30 count
CREATE INDEX IF NOT EXISTS idx_leads_tenant_open
  ON public.leads(tenant_id, created_date DESC)
  WHERE status NOT IN ('converted', 'lost');

-- =============================================================================
-- OPPORTUNITIES: Partial index for "open" opportunities
-- =============================================================================
-- Speeds up: openOpportunities count, pipeline calculations
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_open
  ON public.opportunities(tenant_id, updated_at DESC)
  WHERE stage NOT IN ('won', 'closed_won', 'lost', 'closed_lost');

-- =============================================================================
-- LEADS: Partial index for source aggregation (non-null sources)
-- =============================================================================
-- Speeds up: leadsBySource aggregation
CREATE INDEX IF NOT EXISTS idx_leads_tenant_source
  ON public.leads(tenant_id, source)
  WHERE source IS NOT NULL;

-- =============================================================================
-- ACTIVITIES: Partial index for recent activities with is_test_data filter
-- =============================================================================
-- Speeds up: recentActivities list, activitiesLast30 count
CREATE INDEX IF NOT EXISTS idx_activities_tenant_real
  ON public.activities(tenant_id, created_date DESC)
  WHERE is_test_data IS NOT TRUE;

-- =============================================================================
-- Analyze tables to update statistics after index creation
-- =============================================================================
ANALYZE leads;
ANALYZE opportunities;
ANALYZE activities;
