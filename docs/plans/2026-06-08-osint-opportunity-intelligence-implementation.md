# OSINT Opportunity Intelligence — Implementation Plan (Phase 1)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the Phase 1 foundation of an OSINT-only "Opportunity Intelligence" feature — a manually-scoped, directional growth-recommendation engine folded into the existing Reports & Analytics "Market Intelligence" surface.

**Architecture:** Two lanes. A *proactive* thin pipeline (daily/weekly workers pull Google Trends + Autocomplete → `demand_signals` → `opportunityEngine` → scored `growth_opportunities`) and an *on-demand* agentic lane (upgrade `/api/mcp/market-insights` to do real web research). No tenant website, no Google OAuth, no IP/intent tracking. Scope is declared manually and seeded from existing `tenant` fields.

**Tech Stack:** Node 22 + Express (route-factory pattern `createXRoutes(pgPool)`), PostgreSQL 17 + RLS on Supabase, interval-based pollers (mirror `backend/lib/aiTriggersWorker.js`), Redis cache layer (6380) for source caching, multi-provider aiEngine routed to local vLLM for scoring, React 18 + Vite + shadcn/ui, Braid DSL, Vitest + Node native test runner + Playwright.

**Design reference:** `docs/plans/2026-06-08-osint-opportunity-intelligence-design.md`

---

## Conventions for the executing engineer (read first)

- **Tenant isolation is non-negotiable.** Every query filters `tenant_id = req.tenant.id` (UUID). Never `tenant_id_text`. Every route except none-here goes through the existing auth + tenant middleware.
- **Route pattern:** new route files export `export default function createGrowthRoutes(pgPool) { const router = express.Router(); … return router; }` and are imported + mounted in `backend/server.js` next to the other `/api/v2/*` mounts (see `createSuggestionsRoutes` at `server.js:251`/`:682` for the exact shape, and the `/api/v2/opportunities` mount near `server.js:479` for the v2 mounting idiom).
- **Worker pattern:** mirror `backend/lib/aiTriggersWorker.js` — export `start<Name>Worker(pgPool, intervalMs)` and `runFor Tenant`-style testable inner function; gate startup behind an env flag (e.g. `GROWTH_DEMAND_WORKER_ENABLED`) in the bootstrap block of `backend/server.js` (~line 1051–1085).
- **Backend tests:** Node native runner, files under `backend/__tests__/`. Run a single file with `node --test backend/__tests__/<file>.test.js` (or `cd backend && npm test` for all). Each test must assert cross-tenant isolation where a tenant_id is involved.
- **Frontend tests:** Vitest, colocated `*.test.jsx`. Run one with `npm run test:file <path>`.
- **Migrations:** add `backend/migrations/NNN_growth_opportunity_intelligence.sql` (pick the next free number; check existing files). Apply with `npm run db:exec -- backend/migrations/NNN_growth_opportunity_intelligence.sql`, then run the PostgREST schema reload + REST verify per `docs/developer-docs/COPILOT_PLAYBOOK.md`. **Do not** attempt to replay all migrations from zero (known-broken — see project notes).
- **Honesty guardrail (product rule):** never emit invented absolute numbers. Trends is a relative index → phrase as "rising/falling" / "high/low interest". This is enforced in `opportunityEngine` wording and the Braid system prompt.
- **After every green task: commit.** Conventional-commit messages. Update `CHANGELOG.md` under `## [Unreleased]` in the same commit as any code/config change (house rule).

---

## Task 1: Migration — 3 tables, RLS, indexes

**Files:**
- Create: `backend/migrations/NNN_growth_opportunity_intelligence.sql`
- Verify after apply: `docs/reference/DATABASE_REFERENCE.md` (update in Task 13)

**Step 1: Write the migration SQL**

```sql
-- NNN: OSINT Opportunity Intelligence — business_profiles, demand_signals, growth_opportunities
-- All tables: tenant_id uuid NOT NULL, RLS enabled, tenant isolation.

BEGIN;

CREATE TABLE IF NOT EXISTS business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  signal_type text NOT NULL,            -- trends | autocomplete | community
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
  ON demand_signals (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS growth_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  type text NOT NULL,                   -- geographic | service | content | reputation
  title text NOT NULL,
  reason text NOT NULL,
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  expected_impact text,
  difficulty text,
  recommended_action text NOT NULL,
  action_type text,                     -- create_campaign|create_email|create_sms|create_social|create_workflow|create_task
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signal_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new',   -- new|viewed|actioned|dismissed|expired
  actioned_entity jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_growth_opps_tenant_status_score
  ON growth_opportunities (tenant_id, status, score DESC);

-- RLS
ALTER TABLE business_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_signals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_opportunities ENABLE ROW LEVEL SECURITY;

-- Policies: mirror the tenant-isolation policy used by existing tables in this repo.
-- Copy the exact USING/WITH CHECK clause from a recent migration (e.g. the suggestions or
-- accounts policy) so the auth.jwt()/current_setting expression matches the rest of the schema.
-- DO NOT invent a new isolation expression.

COMMIT;
```

**Step 2: Apply and verify**

Run: `npm run db:exec -- backend/migrations/NNN_growth_opportunity_intelligence.sql`
Then the PostgREST reload + REST verify from the playbook (`NOTIFY pgrst, 'reload schema';` then `curl` each new table via REST).
Expected: three tables exist, REST returns `[]` (empty, not 404) for each under a valid tenant JWT.

**Step 3: Commit**

```bash
git add backend/migrations/NNN_growth_opportunity_intelligence.sql CHANGELOG.md
git commit -m "feat(growth): add OSINT opportunity intelligence tables + RLS"
```

> ⚠️ Before writing the RLS policies, open a recent migration that adds an RLS-protected
> tenant table and copy its policy expression verbatim. The isolation predicate must be
> identical to the rest of the schema.

---

## Task 2: `business_profiles` — seed-from-tenant + GET/PUT routes

**Files:**
- Create: `backend/lib/growth/profileService.js`
- Create: `backend/routes/growth.js`
- Modify: `backend/server.js` (import + mount `/api/v2/growth`)
- Test: `backend/__tests__/growth.profile.test.js`

**Step 1: Write the failing test** (`growth.profile.test.js`)

Cover: (a) GET on a tenant with no profile row returns a profile seeded from `tenant.industry/geographic_focus/country/major_city` with `discovery`-free defaults; (b) PUT persists `service_catalog`/`target_regions`; (c) a second tenant cannot read the first tenant's profile (cross-tenant isolation).

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedProfile } from '../lib/growth/profileService.js';

test('buildSeedProfile derives defaults from tenant fields', () => {
  const tenant = { industry: 'green_energy_and_solar', geographic_focus: 'oceania',
                   country: 'New Zealand', major_city: 'Wellington' };
  const seed = buildSeedProfile(tenant);
  assert.equal(seed.service_catalog.length, 0);
  assert.deepEqual(seed.target_regions, [{ type: 'city', name: 'Wellington, New Zealand' }]);
  assert.equal(seed.settings.industry, 'green_energy_and_solar');
});
```

**Step 2: Run to verify it fails** — `node --test backend/__tests__/growth.profile.test.js` → FAIL (module not found).

**Step 3: Implement `profileService.js`** — pure `buildSeedProfile(tenant)` plus `getOrSeedProfile(pgPool, tenantId)` and `saveProfile(pgPool, tenantId, patch)` (whitelist the four jsonb columns + `settings`; reject unknown keys).

**Step 4: Implement routes in `growth.js`** — `GET /profile`, `PUT /profile` using the route-factory pattern; `req.tenant.id` only.

**Step 5: Mount in `server.js`** next to other v2 mounts:
```js
import createGrowthRoutes from './routes/growth.js';
// …
app.use('/api/v2/growth', defaultLimiter, createGrowthRoutes(measuredPgPool));
```

**Step 6: Run tests** → PASS. **Step 7: Commit** (`feat(growth): business profile seed + profile routes`).

---

## Task 3: `trendsClient` with circuit breaker

**Files:**
- Create: `backend/lib/growth/trendsClient.js`
- Test: `backend/__tests__/growth.trendsClient.test.js`

**Step 1: Failing test** — inject a fake fetcher. Assert: (a) normalizes raw widget data to `{subject, region, value, delta_pct}` directional shape; (b) after N consecutive injected failures the breaker opens and subsequent calls return cached last-good (or `null`) **without** calling the fetcher; (c) breaker half-opens after cooldown.

**Step 2: Run → FAIL.**

**Step 3: Implement** — `createTrendsClient({ fetchImpl, cache, failureThreshold=3, cooldownMs })`. Redis cache layer (6380) keyed by `keyword:region`. Retry/backoff inside a single call; breaker across calls. **Never** return absolute volumes — only relative index + delta.

**Step 4: Run → PASS. Step 5: Commit.**

---

## Task 4: `autocompleteClient`

**Files:** Create `backend/lib/growth/autocompleteClient.js`; Test `backend/__tests__/growth.autocompleteClient.test.js`.

TDD: inject fake fetcher; assert it expands a seed keyword into suggestions, dedupes, tags `source:'autocomplete'`, and respects the cache. Polite rate-limit (small concurrency, cached aggressively). Commit.

---

## Task 5: `opportunityEngine` v1 (the core)

**Files:**
- Create: `backend/lib/growth/opportunityEngine.js`
- Test: `backend/__tests__/growth.opportunityEngine.test.js`

**Step 1: Failing tests** — feed **fixture** `demand_signals` (no network, no real LLM — inject a `scoreFn`):
- Deterministic candidate generation: a `trends` signal with positive `delta_pct` in a target region → a `geographic` candidate; an autocomplete keyword with no matching service page → a `content` candidate.
- **Dedupe:** a candidate equal (by `type`+`subject`+`region`) to an existing open opportunity is not re-inserted.
- **Cooldown:** if generation ran within the cooldown window, `generate()` is a no-op (mirror `aiTriggersWorker`).
- **Expiry:** `expireStale()` flips `status` to `expired` past `expires_at`.
- **Honesty:** generated `reason` strings contain no digit-percent patterns when the source is Trends (assert via regex) — wording uses directional phrasing.

**Step 2: Run → FAIL.**

**Step 3: Implement** — `generateForTenant(pgPool, tenantId, { scoreFn, now, cooldownMs })`:
1. read recent `demand_signals`, 2. deterministic candidate rules per type, 3. dedupe vs open `growth_opportunities`, 4. `scoreFn(candidate)` (in prod: aiEngine `brain_plan_actions` routed to vLLM, producing `score/impact/difficulty/reason/recommended_action`), 5. insert. Plus `expireStale(pgPool, tenantId, now)`.

**Step 4: Run → PASS. Step 5: Commit.**

---

## Task 6: Growth opportunity routes

**Files:** Modify `backend/routes/growth.js`; Test `backend/__tests__/growth.opportunities.test.js`.

Endpoints (all tenant-scoped, TDD per endpoint incl. cross-tenant 404):
- `GET /opportunities` (filter `type`,`status`,`min_score`; sort score desc)
- `GET /opportunities/:id` (joins provenance `demand_signals` via `signal_ids`)
- `POST /opportunities/:id/dismiss` (status→dismissed, store reason)
- `POST /opportunities/:id/action` (dispatch `action_type` to the existing primitive — e.g. create an `ai_campaign`/`activity`/`workflow`; stamp `actioned_entity`; status→actioned). **Reuse existing creators**, do not duplicate campaign logic.
- `GET /demand/summary` and `GET /dashboard` (bundle: top opportunities + demand rollups).

Commit after each endpoint group is green.

---

## Task 7: Workers + server registration

**Files:**
- Create: `backend/workers/growthDemandWorker.js` (daily: Trends + autocomplete → `demand_signals`)
- Create: `backend/workers/growthOpportunityWorker.js` (daily, after demand: `opportunityEngine.generateForTenant` + `expireStale`)
- Modify: `backend/server.js` bootstrap block (~1051–1085) to `start…Worker` behind `GROWTH_DEMAND_WORKER_ENABLED` / `GROWTH_OPPORTUNITY_WORKER_ENABLED`
- Test: `backend/__tests__/growth.workers.test.js`

TDD the **inner per-tenant function** (`runForTenant`) with injected clients — assert: skips tenants with no confirmed profile; **fail-soft** (a throwing source for tenant A still processes tenant B); writes expected `demand_signals`. Don't test the `setInterval` wrapper. Default both flags **off**. Commit.

---

## Task 8: Real `web-research` handlers + `researchAgent` + upgrade `/market-insights`

**Files:**
- Create: `backend/lib/growth/webResearch.js` (implements the 3 currently-dead `web-research.braid` endpoints: `/api/utils/web-search`, `/fetch-page` via `puppeteer`, `/company-lookup`)
- Create: `backend/lib/growth/researchAgent.js`
- Modify: `backend/routes/mcp.js` (`/market-insights` at line 1450) to call `researchAgent` (real web search/fetch, service×region) instead of Wikipedia-only
- Modify: wherever `/api/utils/*` is mounted (find the `utils` route file) to expose the three handlers
- Test: `backend/__tests__/growth.webResearch.test.js`, `backend/__tests__/mcp.marketInsights.test.js`

TDD with injected fetch/puppeteer stubs. For `/web-search`: use self-hosted SearXNG **only if** already zero-cost on VPS-2; otherwise fetch-based fallback (document the choice in code comments). Keep the `/market-insights` response schema backward-compatible (FE `AIMarketInsights.jsx` already consumes it). Commit.

---

## Task 9: Braid tools

**Files:**
- Create: `braid-llm-kit/examples/assistant/growth-opportunities.braid`
- Modify: backend system prompt section via `getBraidSystemPrompt()` (in `backend/lib/braidIntegration-v2.js`)
- Run: `npm run braid:sync` then `npm run braid:check`

Tools: `getTopGrowthOpportunities`, `getGrowthOpportunityDetail`, `getDemandTrends`, `researchMarket`, `getBusinessProfile`, `actionGrowthOpportunity`, `dismissGrowthOpportunity`. System-prompt section: answer "where to advertise / what's trending / which cities / what content / competitor weakness" from these tools, **always directional phrasing, never raw counts**. Verify `npm run braid:check` is green. Commit.

---

## Task 10: Frontend — Opportunities tab in Reports

**Files:**
- Create: `src/components/reports/GrowthOpportunities.jsx`
- Modify: `src/pages/Reports.jsx` (add a tab entry — follow the existing `reports` array pattern around `Reports.jsx:404–462`, and render the component in a `TabsContent`)
- Test: `src/components/reports/GrowthOpportunities.test.jsx`

Vitest: renders scored cards from mocked `/api/v2/growth/opportunities`; dismiss + action call the API, do optimistic update, and call `clearCacheByKey('GrowthOpportunities')`. Commit.

---

## Task 11: Frontend — dashboard widget

**Files:** Create `src/components/dashboard/TopOpportunitiesWidget.jsx`; register it where dashboard widgets are composed; Test `src/components/dashboard/TopOpportunitiesWidget.test.jsx`.

Vitest: renders top 3 by score from mocked `/api/v2/growth/dashboard`; "see all" links to the Reports Opportunities tab; empty-state when none. Commit.

---

## Task 12: Frontend — profile editor

**Files:** Create `src/components/reports/GrowthProfileEditor.jsx` (modal/panel); wire an "Edit market scope" entry from the Market Intelligence tab; Test `src/components/reports/GrowthProfileEditor.test.jsx`.

Vitest: loads `/api/v2/growth/profile` (pre-filled from tenant), edits service catalog / regions / competitors, PUTs, shows saved state. Commit.

---

## Task 13: Integration, regression, docs

**Files:**
- Create: `tests/e2e/growth-opportunities.spec.js`
- Modify: `docs/reference/DATABASE_REFERENCE.md` (3 new tables + RLS), `CHANGELOG.md`, `docs/user-guides/REPORTS_GUIDE.md` (new tab)

- **E2E (Playwright):** set market scope → (seed a fixture opportunity) → one-click action → assert a campaign appears in `aicampaigns`.
- **Regression:** `docker exec aishacrm-backend npm test` green; `npm run test:run` Vitest baseline 0-failed.
- Update `DATABASE_REFERENCE.md` and `CHANGELOG.md`. Final commit.

---

## Out of scope for Phase 1 (later plans, expand after P1 lands)

- **P2 — Community:** `communityMiner.js` (Reddit public JSON) + `growthCommunityWorker` (weekly) → `demand_signals(signal_type='community')`.
- **P3 — Competitor depth:** on-demand agentic competitor analysis via `researchAgent`; optional review-theme mining behind `GROWTH_REVIEW_SCRAPING_ENABLED` (default off, ToS-gray, low frequency, fail-soft).
- **P4 — Tiers:** tier gating. **Blocker:** confirm the tenant tier column name first (`subscription_tier` was not found in code during design).

## Known risks carried from design

- Unofficial Trends API brittleness → circuit breaker + cached last-good (Task 3).
- Thin/directional signals → honesty guardrails enforced in engine + Braid prompt (Tasks 5, 9).
- LLM cost → cooldown + batching + route scoring to local vLLM (Task 5).
- SearXNG infra dependency → fetch-based fallback (Task 8).
