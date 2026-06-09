-- 182_growth_opportunity_intelligence.sql
--
-- OSINT Opportunity Intelligence (Phase 1) — market & demand intelligence that
-- synthesizes free public signals (no tenant website, no Google OAuth, no IP/
-- intent tracking) into persisted, client-triggered "insight runs": a synthesized
-- report plus scored, directional growth opportunities.
--
-- Tables:
--   business_profiles    — one per tenant; manually declared scope (services × regions),
--                          seeded from tenant fields. UNIQUE(tenant_id).
--   growth_insights      — one row per run (client-triggered, async, 7-day throttled,
--                          superadmin-exempt). The latest row IS the current insight;
--                          it persists until the next run replaces it.
--   demand_signals       — provenance written during a run (trends/autocomplete/community/web).
--   growth_opportunities — scored, directional opportunities produced per run.
--
-- Design: docs/plans/2026-06-08-osint-opportunity-intelligence-design.md
--
-- RLS pattern mirrors 163_signing_sessions.sql:
--   tenant_id = (SELECT public.current_tenant_id()), per-operation policies TO authenticated.
--   The background worker runs as service_role, which bypasses RLS.
--
-- Apply order (via Supabase MCP apply_migration):
--   dev (nrtrjsatmsosslxwlmoj) → verify → staging (bjedfowimuwbcnruwcdj) → prod (ehjlenywplgyiahgxkfj).
-- After apply: NOTIFY pgrst, 'reload schema'; then REST-verify each table returns [] (not 404).

-- =========================================================================
-- business_profiles
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  service_catalog  jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name, slug, keywords[]}]
  target_regions   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{type, name}]
  tracked_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{keyword, source, services[]}]
  competitors      jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name, website?}]
  settings         jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE TRIGGER trg_business_profiles_updated_at
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_profiles_tenant_select ON public.business_profiles
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY business_profiles_tenant_insert ON public.business_profiles
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY business_profiles_tenant_update ON public.business_profiles
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY business_profiles_tenant_delete ON public.business_profiles
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

-- =========================================================================
-- growth_insights
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.growth_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','complete','failed')),
  trigger text NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('manual','admin_adhoc')),
  generated_by uuid,
  generated_by_email text,
  report jsonb,
  opportunity_ids uuid[] NOT NULL DEFAULT '{}',
  signal_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  eta_seconds int,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_insights_tenant_created
  ON public.growth_insights (tenant_id, created_at DESC);
-- Cheap claim query for the worker (only ever a handful of running rows).
CREATE INDEX IF NOT EXISTS idx_growth_insights_running
  ON public.growth_insights (created_at) WHERE status = 'running';

ALTER TABLE public.growth_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY growth_insights_tenant_select ON public.growth_insights
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY growth_insights_tenant_insert ON public.growth_insights
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY growth_insights_tenant_update ON public.growth_insights
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY growth_insights_tenant_delete ON public.growth_insights
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

-- =========================================================================
-- demand_signals
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  insight_id uuid REFERENCES public.growth_insights(id) ON DELETE CASCADE,
  signal_type text NOT NULL,            -- trends | autocomplete | community | web
  subject text NOT NULL,
  region text,
  period_start date,
  period_end date,
  value numeric,
  delta_pct numeric,
  source text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demand_signals_tenant_created
  ON public.demand_signals (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_signals_insight
  ON public.demand_signals (insight_id);

ALTER TABLE public.demand_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY demand_signals_tenant_select ON public.demand_signals
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY demand_signals_tenant_insert ON public.demand_signals
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY demand_signals_tenant_update ON public.demand_signals
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY demand_signals_tenant_delete ON public.demand_signals
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

-- =========================================================================
-- growth_opportunities
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.growth_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  insight_id uuid REFERENCES public.growth_insights(id) ON DELETE CASCADE,
  type text NOT NULL
    CHECK (type IN ('geographic','service','content','reputation')),
  title text NOT NULL,
  reason text NOT NULL,
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  expected_impact text,
  difficulty text,
  recommended_action text NOT NULL,
  action_type text
    CHECK (action_type IS NULL OR action_type IN
      ('create_campaign','create_email','create_sms','create_social',
       'create_workflow','create_task')),
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signal_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','viewed','actioned','dismissed','expired')),
  actioned_entity jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_growth_opps_tenant_status_score
  ON public.growth_opportunities (tenant_id, status, score DESC);
CREATE INDEX IF NOT EXISTS idx_growth_opps_insight
  ON public.growth_opportunities (insight_id);

ALTER TABLE public.growth_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY growth_opportunities_tenant_select ON public.growth_opportunities
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY growth_opportunities_tenant_insert ON public.growth_opportunities
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY growth_opportunities_tenant_update ON public.growth_opportunities
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY growth_opportunities_tenant_delete ON public.growth_opportunities
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

COMMENT ON TABLE public.growth_insights IS
  'OSINT Opportunity Intelligence: one row per client-triggered insight run (async, 7-day throttled, superadmin-exempt). Latest row per tenant is the current persisted insight.';
