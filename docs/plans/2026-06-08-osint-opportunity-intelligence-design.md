# AiSHA Opportunity Intelligence (OSINT edition) — Design

**Status:** Approved design — no code yet
**Date:** 2026-06-08
**Supersedes the input premise of:** `docs/architecture/GROWTH_OPPORTUNITY_INTELLIGENCE.md` (the original spec assumed a tenant website + tenant-owned Google properties; this design removes both)
**Approach:** C — Hybrid (thin proactive signal pipeline + on-demand agentic depth)

---

## 1. Why this differs from the original spec

The original spec was built on three data tiers, two of which assumed the tenant owns a
website and Google properties:

- **Tier 1 (Google Search Console + Business Profile)** — requires the tenant to own/verify a
  site and listing. **Cut.**
- **Tier 3 (first-party tracking snippet → `intent_events`)** — requires a tenant website to
  paste the script on. **Cut.**

This product is **OSINT-only**: it synthesizes *free, public* information for a market the
tenant **declares manually**. There is **no IP tracking, no first-party telemetry, no tenant
Google accounts**. "IP address activity" was an early framing that was dropped — there is no
legal, free source for observed IP activity without an owned property, and an IP is PII under
GDPR. None of that is in scope.

### Value contract (what it is / is not)

- **Is:** an AI research-analyst layer that watches free public signals for the tenant's
  declared market (services × target regions) and surfaces **scored, directional** growth
  opportunities, each linking to an action in AiSHA's existing campaign/content tools.
- **Is NOT:** analytics or absolute numbers. With Search Console removed there is no source of
  verifiable demand volume. **Every demand statement is directional by construction**
  ("interest in AC repair appears to be rising in Wellington"), never "2,400 searches".
- The value is **synthesis and vigilance**, not metrics.

---

## 2. Architecture — two deliberate lanes

### Proactive lane (thin pipeline, cheap/stable sources)

```
manual business_profile (services × target_regions)
   → growthDemandWorker (daily):    Google Trends + Google Autocomplete
   → growthCommunityWorker (weekly): Reddit public JSON
        → demand_signals  (relative index, deltas, mention counts)
   → growthOpportunityWorker (daily): opportunityEngine
        → growth_opportunities (scored, deduped, directional)
             → dashboard widget + "Opportunities" tab + Braid
```

This is what makes it feel like a *product*: opportunities appear without being asked, with
week-over-week movement.

### On-demand lane (agentic depth, expensive/one-off sources)

```
user clicks "dig into this" on a card, or asks AiSHA via Braid, or hits "Generate Insights"
   → researchAgent: live web search + page fetch, scoped to the declared profile
   → LLM synthesis (routed to local vLLM): the "why", competitor angle, content gaps
   → returned inline (NOT persisted as a tracked signal)
```

Absorbs everything heavy/uncertain (competitor analysis, "explain this trend", content gaps)
**without** a competitor-crawler worker or a pretense of structured competitor data.

The split is the point of Approach C: **proactive where signals are cheap and stable, agentic
where they're expensive or one-off.**

---

## 3. Placement — fold into the existing feature (no new top-level nav)

A "Market Intelligence" feature already exists and is a primitive version of the on-demand lane:

- **Frontend:** `src/components/reports/AIMarketInsights.jsx` (614 lines) — the **"AI Insights"
  tab** in `src/pages/Reports.jsx`.
- **Backend:** `POST /api/mcp/market-insights` (`backend/routes/mcp.js:1450`) — loads the tenant
  profile, pulls CRM stats, fetches web context (Wikipedia only), and has an LLM summarize into
  a JSON report with market overview / competitive landscape / growth opportunities. On-demand
  button, industry-level, not persisted, no scoring, no trends.

**Decisions:**

- **Enhance in place**, do not build a parallel feature. The on-demand `researchAgent` is the
  *upgrade* of `/api/mcp/market-insights` (real web search/fetch beyond Wikipedia,
  service×region granularity, competitor angle).
- Everything lives under **Reports & Analytics + the dashboard widget + Braid**. This
  **deletes the original spec's biggest footgun** — the new top-level page and its 4 nav
  registrations (navigationConfig, permissions moduleMapping, ModuleManager defaultModules,
  UserFormWizard NAV_MODULES).
- The `tenant` table already carries `industry`, `business_model`, `geographic_focus`,
  `country`, `major_city`. **`business_profiles` seeds its defaults from these** — scope
  declaration is not greenfield; the tenant only refines the finer-grained bits.

---

## 4. Data model (3 new tables; `intent_events` dropped)

Naming discipline retained from the original spec: tables/routes/Braid use the **`growth_`**
prefix; never reuse `opportunities` (the sales pipeline owns it). UI copy says "Opportunities".

### `business_profiles` (one per tenant — manual scope)

- `id uuid pk`, `tenant_id uuid NOT NULL REFERENCES tenant(id)`, `UNIQUE(tenant_id)`
- `service_catalog jsonb`  — `[{name, slug, keywords[]}]`
- `target_regions jsonb`   — `[{type: city|county|state|country|custom, name}]`
- `tracked_keywords jsonb` — `[{keyword, source: manual|autocomplete, services[]}]`
- `competitors jsonb`      — `[{name, website?}]` (optional, manual)
- `settings jsonb`, `last_refreshed_at timestamptz`, `created_at`, `updated_at`
- **No** `gbp_location_name`, **no** `integrations`, **no** crawl/discovery columns.
- Defaults seeded from `tenant` (`industry`/`geographic_focus`/`country`/`major_city`).

### `demand_signals` (proactive-lane output)

- `id uuid pk`, `tenant_id uuid NOT NULL`
- `signal_type text` — `trends | autocomplete | community`
- `subject text`, `region text`, `period_start date`, `period_end date`
- `value numeric` (relative index / mention count), `delta_pct numeric` (vs prior period)
- `source text`, `payload jsonb`, `created_at timestamptz`
- Index `(tenant_id, created_at)`. **Real `CREATE INDEX`, not a comment.**

### `growth_opportunities`

- `id uuid pk`, `tenant_id uuid NOT NULL`
- `type text` — `geographic | service | content | reputation`
- `title text`, `reason text`, `score int CHECK (0..100)`
- `expected_impact text`, `difficulty text`, `recommended_action text`
- `action_type text` — **trimmed to existing primitives only:**
  `create_campaign | create_email | create_sms | create_social | create_workflow | create_task`
  (**no** `generate_blog` / `generate_seo_page`)
- `action_payload jsonb` (prefill for the one-click action)
- `signal_ids uuid[]` (provenance → `demand_signals`)
- `status text` — `new | viewed | actioned | dismissed | expired`
- `actioned_entity jsonb`, `created_at`, `expires_at`

All tables: RLS, `tenant_id uuid NOT NULL`, tenant isolation via `req.tenant.id`.

---

## 5. Backend

### Enhance in place

- `POST /api/mcp/market-insights` → real `researchAgent`: web search + page fetch (not just
  Wikipedia), service×region granularity, competitor angle. `AIMarketInsights.jsx` already
  calls this endpoint, so the FE contract is preserved while the engine is upgraded.

### New routes — `backend/routes/growth.js`, mounted `/api/v2/growth` (V2-only)

```
GET    /profile                 → business profile (seeded from tenant on first read)
PUT    /profile                 → save service catalog / regions / competitors / keywords
GET    /opportunities           → list (filter: type, status, min_score; sort: score desc)
GET    /opportunities/:id       → detail incl. provenance signals
POST   /opportunities/:id/dismiss
POST   /opportunities/:id/action → executes action_type via existing primitives; stamps actioned_entity
GET    /demand/summary          → rollups for the tab/widget (trends by service/region)
GET    /dashboard               → single bundle (dashboard-bundle RPC pattern)
```

All routes go through standard auth + tenant middleware. `req.tenant.id` (uuid) everywhere.

### Libraries — `backend/lib/growth/`

| Module | Responsibility |
|---|---|
| `trendsClient.js` | Unofficial Google Trends wrapper: retry/backoff, **circuit breaker**, Redis-cached (cache layer, 6380), normalized directional output |
| `autocompleteClient.js` | Public suggest endpoint → keyword-universe expansion; rate-limit politely, cache aggressively |
| `communityMiner.js` | Reddit public-JSON pulls for configured subs/queries → local-LLM embedding + clustering → `demand_signals(signal_type='community')` |
| `opportunityEngine.js` | Reads recent `demand_signals` → deterministic candidate generation per type → LLM scoring/wording pass (`brain_plan_actions`, routed to local vLLM) → dedupe against open opportunities → insert. **Generation cooldown mirrors `aiTriggersWorker`** to prevent runaway LLM calls |
| `researchAgent.js` | On-demand agentic depth (powers the upgraded `/market-insights`): live web search + fetch + LLM synthesis |
| `webResearch.js` | Real implementations for the **three dead `web-research.braid` endpoints** (`/api/utils/web-search`, `/fetch-page` via puppeteer, `/company-lookup`). `web-search` uses self-hosted SearXNG only if already zero-cost-deployable on VPS-2; otherwise fetch-based fallback |

### Workers (Bull + `cron_job` registration; pattern: existing `backend/workers/*`)

| Worker | Cadence | Job |
|---|---|---|
| `growthDemandWorker` | daily | Trends pull (per tracked keyword/region, batched + cached), autocomplete refresh |
| `growthCommunityWorker` | weekly | Reddit community mining → `demand_signals` |
| `growthOpportunityWorker` | daily (after demand) | run `opportunityEngine`; expire stale opportunities |

All workers: per-tenant iteration, **skip tenants without a confirmed profile**, **fail-soft per
tenant** (one broken source must not kill the batch), structured logs.
**No intent rollup worker** (no `intent_events`).

> Note: existing Bull queues live in `backend/services/` (`taskQueue.js`, `workflowQueue.js`) —
> the original spec mislabeled the path. New workers follow the existing `backend/workers/*`
> registration pattern.

---

## 6. Braid tools — `braid-llm-kit/examples/assistant/growth-opportunities.braid`

```
getTopGrowthOpportunities(limit, type?)   → ranked open opportunities
getGrowthOpportunityDetail(id)            → full reason + provenance
getDemandTrends(service?, region?)        → humanized directional statements
researchMarket(query)                     → on-demand researchAgent (agentic depth)
getBusinessProfile()                      → profile summary for agent context
actionGrowthOpportunity(id, overrides?)   → executes the one-click action
dismissGrowthOpportunity(id, reason?)
```

Run `npm run braid:sync` after adding. The "Opportunity Agent" is **not a separate agent** — it
is these tools + a system-prompt section injected via `getBraidSystemPrompt()` instructing the
assistant to answer "where should I advertise / what's trending / which cities / what content /
where are competitors weak" from growth tools, **always phrasing output as directional
recommendations** (never raw keyword counts).

Also fixes the long-standing **vaporware**: `web-research.braid`'s handlers (`/api/utils/web-search`,
`/fetch-page`, `/company-lookup`) do not currently exist; `webResearch.js` implements them.

---

## 7. Frontend (all inside Reports & Analytics + dashboard)

- **Enhance** `src/components/reports/AIMarketInsights.jsx` — the on-demand Market Intelligence
  tab (richer research, service×region, provenance).
- **New** "Opportunities" tab in `src/pages/Reports.jsx` — scored cards, filter/sort, dismiss +
  one-click action with optimistic update + `clearCacheByKey`.
- **New** `src/components/dashboard/TopOpportunitiesWidget.jsx` — top 3 by score → links to tab.
- **Profile editor** — small modal/panel to set service catalog / target regions / competitors,
  pre-filled from tenant fields.
- **Tier gating:** read the tenant tier field. **Action item: verify the exact column name**
  (`subscription_tier` was not found in code during design; confirm before building gating).
- **No new top-level nav, no 4-registration dance.**
- Testing per house rule: containerized FE (`docker compose up -d --build frontend`, port 4000).

---

## 8. Honesty guardrails (by construction)

- Directional language only ("rising/falling", "high/low interest"); **never invented
  percentages or volumes**.
- Trends relative-index never presented as absolute volume.
- Every opportunity card shows **provenance** (which `demand_signals` produced it).
- On-demand research clearly labeled as AI synthesis of public sources.

---

## 9. Phasing

- **P1 — Foundation:** migration (3 tables + RLS + indexes + PostgREST schema reload + REST
  verify) · `business_profiles` routes + profile editor (seeded from tenant) · Opportunities tab
  + dashboard widget · `opportunityEngine` v1 (Trends + autocomplete inputs) · `growthDemandWorker`
  + `growthOpportunityWorker` · `growth-opportunities.braid` + system-prompt section + `braid:sync`
  · real `web-research.braid` handlers · upgrade `/api/mcp/market-insights` to use the new web
  research.
- **P2 — Community:** `communityMiner` (Reddit) + `growthCommunityWorker` → community signals.
- **P3 — Competitor depth:** on-demand agentic competitor analysis (no scheduled crawler) ·
  optional review-theme mining behind `GROWTH_REVIEW_SCRAPING_ENABLED` (default off, ToS-gray).
- **P4 — Tiers:** tier gating (after confirming the tenant tier field name).

---

## 10. Test plan (house rule)

- **Backend (native runner):** route tests per endpoint group (auth / tenant-isolation /
  validation / happy-path, incl. cross-tenant isolation against both active test tenants);
  `opportunityEngine` unit tests with fixture signals (deterministic candidates, dedupe,
  cooldown, expiry); `trendsClient` circuit-breaker behavior (mocked failures).
- **Frontend (Vitest):** profile editor states, opportunity card actions (action/dismiss +
  optimistic update + `clearCacheByKey`), widget render, tier gating.
- **E2E (Playwright):** profile setup → opportunity → one-click campaign creation → campaign
  appears in `aicampaigns`.
- **Regression:** `docker exec aishacrm-backend npm test` green before every merge; Vitest
  baseline 0-failed holds.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Unofficial Trends API breaks | Circuit breaker + cached last-good; engine degrades gracefully (works without Trends) |
| Thin/directional signals overpromise | Directional language by construction; provenance on every card; no invented numbers |
| LLM cost of scoring + on-demand research | Cooldowns + batching + route to local vLLM (`brain_plan_actions`) |
| Reddit/autocomplete rate limits | Polite rate-limiting + aggressive caching (cache layer 6380) |
| Review scraping ToS exposure | Default-off flag, low frequency, fail-soft, documented optional (P3) |
| Tenant tier field name unverified | Confirm column name before P4 gating |
| SearXNG infra dependency for web-search | Use fetch-based fallback if SearXNG isn't already zero-cost on VPS-2 |
