-- 185_growth_insights_one_running_per_tenant.sql
--
-- OSINT Opportunity Intelligence — make the insight cooldown atomic.
--
-- createInsightRun checks for a recent run then inserts a `running` row, but the
-- check-and-insert is not atomic: two concurrent POST /api/v2/growth/insights
-- requests can both pass the check and both insert `running` rows, bypassing the
-- once-per-7-days gate and queueing duplicate worker runs. This partial unique
-- index guarantees AT MOST ONE `running` insight per tenant at the database
-- level; the second concurrent insert fails with a unique violation (23505),
-- which the route maps to 409 "a run is already in progress".
--
-- Apply order (Supabase MCP apply_migration): dev branch → staging → prod.

CREATE UNIQUE INDEX IF NOT EXISTS uq_growth_insights_one_running_per_tenant
  ON public.growth_insights (tenant_id)
  WHERE status = 'running';
