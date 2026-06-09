# OSINT Opportunity Intelligence — Implementation Plan (Phase 1)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship Phase 1 of an OSINT-only "Opportunity Intelligence" feature — a manually-scoped, **client-triggered, async, weekly-throttled, persisted** market-insight generator folded into the existing Reports & Analytics "Market Intelligence" surface, surfacing a synthesized report + scored directional growth opportunities.

**Architecture:** One lane. A client kicks off an *insight run* (gated to once / 7 days / tenant; superadmin exempt). The request returns **202 immediately** with an ETA. A poll-worker (`growthInsightWorker`, mirroring `emailWorker`) claims `running` rows, collects public signals (Trends + Autocomplete + web fetch) for the declared scope, runs `opportunityEngine`, writes the persisted report + opportunities, and inserts a completion/failure **notification**. No background daily pipeline; no tenant website; no Google OAuth; no IP tracking.

**Tech Stack:** Node 22 + Express (route-factory `createXRoutes(pgPool)`), PostgreSQL 17 + RLS on Supabase, poll-worker (mirror `backend/workers/emailWorker.js`), Redis cache layer (6380), multi-provider aiEngine → local vLLM for scoring/synthesis, existing `notifications` table, React 18 + Vite + shadcn/ui, Braid DSL, Vitest + Node native runner + Playwright.

**Design reference:** `docs/plans/2026-06-08-osint-opportunity-intelligence-design.md`

---

## Conventions for the executing engineer (read first)

- **Tenant isolation is non-negotiable.** Every query filters `tenant_id = req.tenant.id` (UUID). Never `tenant_id_text`. All routes go through existing auth + tenant middleware.
- **Superadmin check:** `req.user?.role === 'superadmin' || req.user?.is_superadmin === true` (set in `backend/middleware/authenticate.js`).
- **Route pattern:** `export default function createGrowthRoutes(pgPool){ const router = express.Router(); … return router; }`, mounted in `backend/server.js` next to other `/api/v2/*` mounts (see `createSuggestionsRoutes` at `server.js:251`/`:682`).
- **Worker pattern:** mirror `backend/workers/emailWorker.js` — a poll loop that **atomically claims** rows (status transition guard so two workers never process the same run), processes, updates. Export `startGrowthInsightWorker(pgPool)`, gated behind `GROWTH_INSIGHT_WORKER_ENABLED`, started in the `server.js` bootstrap block (~1079, next to `startEmailWorker`).
- **Notifications:** insert into the `notifications` table; shape per `backend/lib/callFlowHandler.js:97` — `{ tenant_id, user_email, title, message, type:'success'|'warning', is_read:false, link, metadata }`.
- **Backend tests:** Node native runner, `backend/__tests__/`. Single file: `node --test backend/__tests__/<file>.test.js`. Assert cross-tenant isolation wherever a tenant_id is involved.
- **Frontend tests:** Vitest, colocated `*.test.jsx`. `npm run test:file <path>`.
- **Migrations:** `backend/migrations/NNN_growth_opportunity_intelligence.sql` (next free number). Apply via `npm run db:exec -- <path>`, then PostgREST reload + REST verify per `docs/developer-docs/COPILOT_PLAYBOOK.md`. Do **not** replay all migrations from zero (known-broken).
- **Honesty guardrail:** never emit invented absolute numbers; Trends is relative → "rising/falling". Enforced in `opportunityEngine` wording + Braid prompt.
- **Commit after every green task** (conventional commits). Update `CHANGELOG.md` under `## [Unreleased]` in the same commit as any code/config change.

---

## Task 1: Migration — 4 tables, RLS, indexes

**Files:** Create `backend/migrations/NNN_growth_opportunity_intelligence.sql`; update `docs/reference/DATABASE_REFERENCE.md` in Task 13.

**Step 1: Write the migration**

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  service_catalog  jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_regions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  tracked_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  competitors      jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings         jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS growth_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running',     -- running | complete | failed
  trigger text NOT NULL DEFAULT 'manual',     -- manual | admin_adhoc
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
  ON growth_insights (tenant_id, created_at DESC);
-- partial index to make the worker's claim query cheap
CREATE INDEX IF NOT EXISTS idx_growth_insights_running
  ON growth_insights (created_at) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  insight_id uuid REFERENCES growth_insights(id) ON DELETE CASCADE,
  signal_type text NOT NULL,                  -- trends | autocomplete | community | web
  subject text NOT NULL,
  region text,
  period_start date, period_end date,
  value numeric, delta_pct numeric,
  source text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demand_signals_tenant_created
  ON demand_signals (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS growth_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  insight_id uuid REFERENCES growth_insights(id) ON DELETE CASCADE,
  type text NOT NULL,                         -- geographic|service|content|reputation
  title text NOT NULL, reason text NOT NULL,
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  expected_impact text, difficulty text,
  recommended_action text NOT NULL,
  action_type text,                           -- create_campaign|create_email|create_sms|create_social|create_workflow|create_task
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signal_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new',          -- new|viewed|actioned|dismissed|expired
  actioned_entity jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_growth_opps_tenant_status_score
  ON growth_opportunities (tenant_id, status, score DESC);

ALTER TABLE business_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_insights      ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_signals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_opportunities ENABLE ROW LEVEL SECURITY;

-- Copy the EXACT tenant-isolation USING/WITH CHECK clause from a recent RLS migration
-- (e.g. suggestions/accounts). Do NOT invent a new isolation expression.

COMMIT;
```

**Step 2:** apply (`npm run db:exec -- …`) → PostgREST reload + REST verify each table returns `[]` not 404.
**Step 3:** commit `feat(growth): add OSINT opportunity intelligence tables + RLS`.

> ⚠️ Open a recent RLS migration and copy its policy expression verbatim before writing policies.

---

## Task 2: `business_profiles` — seed-from-tenant + GET/PUT routes

**Files:** Create `backend/lib/growth/profileService.js`, `backend/routes/growth.js`; Modify `backend/server.js` (mount `/api/v2/growth`); Test `backend/__tests__/growth.profile.test.js`.

TDD: `buildSeedProfile(tenant)` derives defaults from `tenant.industry/geographic_focus/country/major_city`; `getOrSeedProfile`/`saveProfile` whitelist the jsonb columns (drop unknown keys); GET seeds on first read; PUT persists; second tenant can't read the first's profile. Mount:
```js
import createGrowthRoutes from './routes/growth.js';
app.use('/api/v2/growth', defaultLimiter, createGrowthRoutes(measuredPgPool));
```
Commit `feat(growth): business profile seed + routes`.

---

## Task 3: `trendsClient` with circuit breaker

**Files:** Create `backend/lib/growth/trendsClient.js`; Test `backend/__tests__/growth.trendsClient.test.js`.

TDD with injected fetcher: normalizes to directional `{subject,region,value,delta_pct}` (never absolute volume); breaker opens after N failures and serves cached/last-good without calling the fetcher; half-opens after cooldown. Redis cache layer (6380) keyed `keyword:region`. Commit.

---

## Task 4: `autocompleteClient`

**Files:** Create `backend/lib/growth/autocompleteClient.js`; Test `backend/__tests__/growth.autocompleteClient.test.js`.

TDD: expands a seed keyword, dedupes, tags `source:'autocomplete'`, respects cache, polite concurrency. Commit.

---

## Task 5: `opportunityEngine` v1

**Files:** Create `backend/lib/growth/opportunityEngine.js`; Test `backend/__tests__/growth.opportunityEngine.test.js`.

TDD with **fixture** `demand_signals` + injected `scoreFn`:
- `trends` signal with positive `delta_pct` in a target region → `geographic` candidate.
- autocomplete keyword with no matching service → `content` candidate.
- dedupe by `type+subject+region` vs existing open opportunities.
- `expireStale()` flips past-`expires_at` to `expired`.
- **honesty:** generated `reason` contains no digit-percent pattern for Trends-sourced candidates (regex assert).

`generateForInsight(pgPool, { tenantId, insightId, signals, scoreFn, now })` → inserts opportunities tagged with `insight_id`. (In prod, `scoreFn` = aiEngine `brain_plan_actions` → vLLM.) Commit.

---

## Task 6: `etaEstimator`

**Files:** Create `backend/lib/growth/etaEstimator.js`; Test `backend/__tests__/growth.etaEstimator.test.js`.

TDD: `estimate({ serviceCount, regionCount, recentDurations })` → base + per service×region; if ≥3 recent completed durations exist, return their rolling median instead. Returns `{ eta_seconds, low, high }`. Commit.

---

## Task 7: `insightRunner` (collect → engine → persist → notify)

**Files:** Create `backend/lib/growth/insightRunner.js`; Test `backend/__tests__/growth.insightRunner.test.js`.

TDD with injected clients (trends/autocomplete/web fetch stubs, fake `scoreFn`, fake supabase, spy notifier):
- happy path: writes `demand_signals` (tagged `insight_id`), calls `opportunityEngine`, sets `report` + `opportunity_ids` + `signal_summary`, `status='complete'`, `completed_at`; inserts a **success** notification for `generated_by_email` with `link:'/reports?tab=ai-insights'`.
- failure path: a throwing collector → `status='failed'` + `error`; inserts a **warning** notification; does not throw out of the runner.
- fail-soft per source: one broken source still produces a run from the others.

`runInsight(pgPool, insightRow, deps)`. Commit.

---

## Task 8: `growthInsightWorker` (poll + atomic claim)

**Files:** Create `backend/workers/growthInsightWorker.js`; Modify `backend/server.js` bootstrap (~1079); Test `backend/__tests__/growth.insightWorker.test.js`.

TDD the inner `claimAndRunOne(pgPool, deps)`:
- atomically claims exactly one `status='running'` row (transition guard — second concurrent claim gets nothing, **no double-processing**).
- delegates to `insightRunner`.
- fail-soft: a runner throw doesn't kill the loop.

Don't test the `setInterval` wrapper. Register in `server.js` behind `GROWTH_INSIGHT_WORKER_ENABLED` (default off) next to `startEmailWorker(pgPool)`. Commit.

---

## Task 9: Insight + opportunity routes (cooldown + superadmin gate + async)

**Files:** Modify `backend/routes/growth.js`; Test `backend/__tests__/growth.insights.test.js`, `backend/__tests__/growth.opportunities.test.js`.

Endpoints (TDD each, incl. cross-tenant isolation):
- `POST /insights` — **cooldown gate:** if a `growth_insights` row exists for the tenant with `created_at` within 7 days **and** the user is not superadmin → `429 { error, next_available_at }`. Else insert `status='running'`, `trigger` = `admin_adhoc` if superadmin else `manual`, `generated_by`/`_email` from `req.user`, `eta_seconds` from `etaEstimator`; return **`202 { id, status:'running', eta_seconds, eta_range }`**. Must NOT run synchronously.
  - Tests: blocked within 7 days; **superadmin bypasses**; returns correct `next_available_at`; 202 returns immediately (no synthesis in the request path).
- `GET /insights/current` — latest row for tenant (status + persisted report).
- `GET /insights/:id` — specific run (tenant-scoped).
- `GET /opportunities` (from latest complete run; filter type/status/min_score; sort score desc), `GET /opportunities/:id` (provenance via `signal_ids`), `POST /opportunities/:id/dismiss`, `POST /opportunities/:id/action` (dispatch `action_type` to the existing primitive — **reuse** the campaign/activity/workflow creators; stamp `actioned_entity`; status→actioned), `GET /dashboard` (bundle: current insight + top opportunities).

Commit after each endpoint group is green.

---

## Task 10: Real `web-research` handlers + synthesis kernel

**Files:** Create `backend/lib/growth/webResearch.js`, `backend/lib/growth/researchAgent.js`; Modify the `/api/utils/*` route file to expose the 3 handlers; refactor the synthesis logic in `backend/routes/mcp.js` (`/market-insights`, line 1450) into `researchAgent` so the insight runner and any superadmin ad-hoc path share it; Test `backend/__tests__/growth.webResearch.test.js`.

TDD with injected fetch/puppeteer stubs. **Phase 1:** implement `/fetch-page` (puppeteer) + `/company-lookup` (crawl+LLM); back `/api/utils/web-search` with the **existing Wikipedia search only** — **no SearXNG in P1** (general metasearch is P3; host decided per design §9). Keep the report schema backward-compatible with `AIMarketInsights.jsx`. Commit.

---

## Task 11: Braid tools

**Files:** Create `braid-llm-kit/examples/assistant/growth-opportunities.braid`; Modify `getBraidSystemPrompt()` in `backend/lib/braidIntegration-v2.js`; Run `npm run braid:sync` then `npm run braid:check`.

Tools: `getTopGrowthOpportunities`, `getGrowthOpportunityDetail`, `getDemandTrends`, `getLatestInsight`, `requestInsightRun` (honors the gate), `getBusinessProfile`, `actionGrowthOpportunity`, `dismissGrowthOpportunity`. Prompt section: directional phrasing only, never raw counts; if no/stale insight, offer to run one. Verify `braid:check` green. Commit.

---

## Task 12: Frontend — rework Market Intelligence tab (async UX)

**Files:** Modify `src/components/reports/AIMarketInsights.jsx`; Test `src/components/reports/AIMarketInsights.test.jsx`.

Vitest states: **idle** (Generate button), **cooldown-blocked** (button disabled + "next available <date>"; superadmin never blocked), **running** ("Running — about ~N min" from `eta_range`), **complete** (persisted report from `/insights/current`), **failed** (error + retry). Kickoff calls `POST /insights`, handles 202 and 429. Commit.

---

## Task 13: Frontend — Opportunities tab, widget, profile editor

**Files:** Create `src/components/reports/GrowthOpportunities.jsx`, `src/components/dashboard/TopOpportunitiesWidget.jsx`, `src/components/reports/GrowthProfileEditor.jsx`; Modify `src/pages/Reports.jsx` (add Opportunities tab per the `reports` array pattern ~`Reports.jsx:404–462`); Tests colocated.

Vitest: opportunity cards render from mocked API; dismiss/action → optimistic update + `clearCacheByKey('GrowthOpportunities')`; widget shows top 3 or "Generate your first insight" CTA; profile editor loads pre-filled profile, edits, PUTs. Commit per component.

---

## Task 14: Integration, regression, docs

**Files:** Create `tests/e2e/growth-opportunities.spec.js`; Modify `docs/reference/DATABASE_REFERENCE.md` (4 tables + RLS), `CHANGELOG.md`, `docs/user-guides/REPORTS_GUIDE.md`.

- **E2E:** set scope → kick off run (mocked worker advances it to complete) → **notification appears in the bell** → opportunity → one-click action → campaign appears in `aicampaigns`. Assert a second immediate run returns **429**, and a **superadmin** run is not throttled.
- **Regression:** `docker exec aishacrm-backend npm test` green; `npm run test:run` 0-failed.
- Update `DATABASE_REFERENCE.md` + `CHANGELOG.md`. Final commit.

---

## Out of scope for Phase 1 (later plans)

- **P2 — Community:** `communityMiner` (Reddit) folded into the run → `demand_signals(signal_type='community')`.
- **P3 — Competitor depth + web search:** agentic competitor analysis; deploy **SearXNG** (host per design §9 — favor AI server, measure VPS-2, never Hetzner); optional review-theme mining behind `GROWTH_REVIEW_SCRAPING_ENABLED` (default off).
- **P4 — Tiers:** tier gating. **DEFERRED (not scheduled).** Ships ungated; confirm tenant tier column name when revived.

## Known risks carried from design

- Trends brittleness → circuit breaker + cached last-good (Task 3).
- Thin/directional signals → honesty guardrails in engine + Braid prompt (Tasks 5, 11) + "as of" timestamp.
- LLM cost → weekly throttle + cooldown + batching + local vLLM (Tasks 5, 9).
- Double-processing → atomic claim (Task 8).
- Long run blocking UX → async 202 + ETA + notification (Tasks 7–9, 12).
- Web-search infra → not in P1 (Task 10); P3 adds SearXNG (design §9).
