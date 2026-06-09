# AiSHA Opportunity Intelligence™ — Technical Specification

**Status:** Draft for approval — design only, no code
**Date:** 2026-06-07
**Source:** Product vision doc "AiSHA Opportunity Intelligence™" (Dre, June 2026)
**Constraint (hard):** Zero new paid subscriptions. All data sources are free: official Google APIs the *tenant* OAuth-connects (their own data), unofficial/public APIs, first-party tracking, and self-hosted scraping/LLM analysis. No DataForSEO, no SEMrush, no Places API billing, no intent-data vendors.

---

## 1. Naming decision

The product name is **Opportunity Intelligence**, but the internal entity is **`growth_opportunities`** — never `opportunities`. The sales pipeline already owns `opportunities` (table, routes, `opportunities.braid`). Reusing the word in schema, routes, or Braid tool names would cause constant tool-selection confusion for the AI agent and human ambiguity in code. Convention throughout: tables/routes/braid use the `growth_` prefix; UI copy uses "Opportunities".

## 2. What already exists (verified 2026-06-07)

| Spec requirement | Existing primitive | Gap |
|---|---|---|
| Recommendation engine | `ai_suggestions` table + `backend/routes/suggestions.js` (list/approve/reject/apply) + `aiTriggersWorker.js` polling pattern | Pattern reusable; needs its own entity (different lifecycle, scoring, dashboard) |
| One-click actions | `aicampaigns.js` (email/sms/linkedin/whatsapp/social_post/sequence), workflow engine (send_email/create_task/webhook/…), audience resolution libs | Landing page / SEO page / blog generation are net-new |
| Background jobs | `cron_job` table + routes, Bull queues (`workflowQueue.js`, `taskQueue.js`), 4 workers | None — new workers slot in |
| Web research | `web-research.braid` | **Vaporware** — its `/api/utils/web-search`, `/fetch-page`, `/company-lookup` handlers do not exist. This spec implements real handlers |
| Website tracking | Nothing (booking-analytics is Cal.com only) | Build first-party script + ingestion |
| Business profile | `tenant` (name/branding/tier), `accounts` (industry/website) | New `business_profiles` model |
| Crawling capability | `puppeteer` ^24 already in backend deps | Wire it |
| AI analysis | Multi-provider aiEngine + local vLLM (Qwen2.5-14B) — embeddings/clustering/scoring run at zero marginal cost | None |

## 3. Data source architecture (all free)

### 3.1 Tier 1 — Tenant-OAuth official Google APIs (highest quality, free, first-party)

The key unlock: a tenant connecting **their own** Google properties gives AiSHA official, free, ToS-clean data. No scraping needed for the tenant's own visibility.

| Source | API | What it provides | Quota |
|---|---|---|---|
| **Google Search Console** | Search Analytics API (free) | Real queries, impressions, clicks, position — per page, per country/region, per device, daily granularity | Generous (1,200 QPM) |
| **Google Business Profile** | Business Profile APIs + Performance API (free to listing owner) | Verified name/address/categories/hours/**service areas**, own reviews, profile views, search keywords that surfaced the listing, direction/call requests | Free; needs one-time Google API access approval for the AiSHA GCP project |

GSC answers "what does my market actually search for and where" with absolute numbers — this is what paid SEO tools approximate. GBP answers the entire spec "Initial Setup" auto-discovery section (name, address, categories, hours, service areas) with zero scraping.

Implementation: one Google OAuth consent flow (offline access, scopes `webmasters.readonly` + `business.manage`), tokens stored per-tenant (encrypted, Doppler-managed encryption key), refresh handled centrally. Reuses the existing OAuth callback pattern if one exists for other integrations; otherwise a new `backend/routes/integrations-google.js`.

### 3.2 Tier 2 — Public/unofficial free sources (directional signals)

| Source | Method | Signal | Caveats |
|---|---|---|---|
| **Google Trends** | unofficial API (`google-trends-api` npm or direct widget endpoints) | Relative regional demand + rising queries for service keywords | Brittle (retry/backoff + circuit breaker mandatory); relative index not volume; metro-level geo. Phrase output as "demand rising/falling", never absolute counts |
| **Google Autocomplete** | public suggest endpoint | "near me", city-qualified, and emerging service phrasings → keyword universe expansion | Rate-limit politely; cache aggressively |
| **Reddit** | public `.json` endpoints / free OAuth API | Local subreddits + service-vertical subs: "looking for a plumber in X", complaint themes | 60 req/min free; topic-cluster with local LLM embeddings |
| **Competitor websites** | Puppeteer crawl (already a dep) | Service/content coverage → content-gap detection | Respect robots.txt; cache pages; weekly cadence |
| **Review pages** (Google Maps, Yelp) | Puppeteer scrape, low frequency | Competitor review velocity + complaint themes (slow response, scheduling…) | ToS-gray. Ship behind env flag `GROWTH_REVIEW_SCRAPING_ENABLED=false` default; per-competitor weekly, randomized timing, fail-soft |

### 3.3 Tier 3 — First-party intent (build it, own it)

A ~2 KB vanilla-JS tracking snippet tenants paste on their site (or auto-injected on AiSHA-hosted pages later):

- **Collected:** landing page path, page category, referrer, UTM params, session depth, session duration, region (server-side from Cloudflare `cf-ipcountry`/`cf-region`/`cf-ipcity` headers — CF already fronts traffic), traffic source classification.
- **Never collected (enforced server-side, not just policy):** no cookies beyond a session-scoped random ID, no fingerprinting, no IP storage (region extracted then IP discarded), no PII fields accepted by the ingest schema (strict allowlist; unknown keys dropped), no cross-site anything.
- Ingest endpoint is public, authenticated by a per-tenant write-only site key, rate-limited per key + IP.

This implements the spec's "Anonymous Intent Intelligence" section exactly, including its Not-Allowed list, by construction.

## 4. Data model

```sql
-- Migration NNN: growth opportunity intelligence (all tables: RLS, tenant_id uuid NOT NULL)

CREATE TABLE business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  business_name text,
  website_url text,
  gbp_location_name text,            -- GBP resource name once connected
  industry text,
  service_catalog jsonb DEFAULT '[]'::jsonb,   -- [{name, slug, keywords[], page_url}]
  service_areas jsonb DEFAULT '[]'::jsonb,     -- [{type: city|county|state|custom, name, geo}]
  keyword_universe jsonb DEFAULT '[]'::jsonb,  -- [{keyword, source: crawl|gsc|autocomplete|manual, services[]}]
  competitors jsonb DEFAULT '[]'::jsonb,       -- [{name, website, gbp_url, source, confirmed}]
  discovery_status text DEFAULT 'pending',     -- pending|discovered|confirmed
  integrations jsonb DEFAULT '{}'::jsonb,      -- {gsc: {connected, site_url, last_sync}, gbp: {...}}
  last_refreshed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id)                            -- one profile per tenant in v1; relax for Agency tier
);

CREATE TABLE intent_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,          -- random, session-scoped, no identity
  page_path text,
  page_category text,                -- service|pricing|contact|blog|location|other (classified at ingest)
  referrer_host text,
  utm jsonb,
  session_depth int,
  duration_seconds int,
  region text,                       -- from CF headers; IP never stored
  traffic_source text                -- organic|paid|social|direct|referral
);
-- 90-day retention (pruned by worker); index (tenant_id, occurred_at)

CREATE TABLE demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  signal_type text NOT NULL,         -- gsc_query|trends|autocomplete|community|review_theme|intent_rollup|content_gap
  subject text NOT NULL,             -- keyword / topic / competitor / page-category
  region text,
  period_start date,
  period_end date,
  value numeric,                     -- impressions, relative index, mention count, sessions…
  delta_pct numeric,                 -- vs prior comparable period
  source text NOT NULL,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE growth_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  type text NOT NULL,                -- geographic|service|content|advertising|reputation
  title text NOT NULL,               -- "Target Wellington AC Repair"
  reason text NOT NULL,              -- "Demand increased 21% while competition remains low."
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  expected_impact text,              -- high|medium|low
  difficulty text,                   -- high|medium|low
  recommended_action text NOT NULL,  -- human sentence
  action_type text,                  -- create_campaign|create_landing_page|create_social|create_email|create_sms|create_workflow|create_task|generate_blog|generate_seo_page
  action_payload jsonb,              -- prefill for the one-click action
  signal_ids uuid[],                 -- provenance → demand_signals
  status text DEFAULT 'new',         -- new|viewed|actioned|dismissed|expired
  actioned_entity jsonb,             -- {type, id} of created campaign/task/etc
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
```

Why not reuse `ai_suggestions`: different lifecycle (score/expiry/market provenance vs CRM-record triggers), different consumer (growth dashboard vs suggestion inbox), and `ai_suggestions` is coupled to `record_type/record_id` CRM rows. The **worker pattern** is reused; the table is not.

## 5. Backend

### 5.1 Routes — `backend/routes/growth.js`, mounted at `/api/v2/growth` (V2-only; no V1)

```
POST   /profile/discover            { website_url | business_name | gbp }  → kicks discovery job, returns job id
GET    /profile                     → business profile (incl. discovery_status)
PUT    /profile                     → user confirmation/edits of discovered profile
POST   /profile/refresh             → re-run discovery/crawl

GET    /integrations/google/auth-url    → OAuth consent URL (GSC+GBP scopes)
GET    /integrations/google/callback    → token exchange, store encrypted per-tenant
DELETE /integrations/google             → disconnect + token revoke

POST   /intent/ingest               → PUBLIC (site-key auth, rate-limited): tracking events
GET    /intent/summary              → rollups for dashboard (sessions by category/region/source, trends)

GET    /opportunities               → list (filter: type, status, min_score; sort: score desc)
GET    /opportunities/:id           → detail incl. provenance signals
POST   /opportunities/:id/dismiss
POST   /opportunities/:id/action    → executes action_type via existing primitives (creates ai_campaign / activity / workflow …), stamps actioned_entity
GET    /dashboard                   → single bundle: top opportunities, demand trends, intent summary (dashboard-bundle RPC pattern)
```

All routes except `/intent/ingest` and the OAuth callback go through standard auth + tenant middleware. `req.tenant.id` (uuid) everywhere.

### 5.2 Libraries — `backend/lib/growth/`

| Module | Responsibility |
|---|---|
| `profileDiscovery.js` | Orchestrates: crawl website (puppeteer) → LLM extraction (services, areas, keywords — `json_strict` capability) → autocomplete expansion → candidate competitor identification (LLM + crawl of "best <service> in <city>" SERP-free heuristics: GBP categories, sitemap/footer analysis) → writes `business_profiles` as `discovered` |
| `googleIntegration.js` | OAuth token lifecycle, GSC Search Analytics pulls, GBP profile + performance pulls |
| `trendsClient.js` | Unofficial Trends wrapper: retry/backoff, circuit breaker, Redis-cached (cache layer, 6380), normalized output |
| `intentClassifier.js` | Page-category classification at ingest (rules first, LLM fallback, cached per path) |
| `communityMiner.js` | Reddit public-JSON pulls for configured subs/queries → local-LLM embedding + clustering → `demand_signals(signal_type='community')` |
| `competitorCrawler.js` | Weekly puppeteer crawl of confirmed competitor sites → service/content coverage map → content-gap signals. Review scraping lives here behind `GROWTH_REVIEW_SCRAPING_ENABLED` |
| `opportunityEngine.js` | The core: reads recent `demand_signals` + intent rollups + content gaps → deterministic candidate generation per opportunity type → LLM scoring/wording pass (reason, impact, difficulty, recommended action — `brain_plan_actions` capability) → dedupe against open opportunities → insert `growth_opportunities`. Generation cooldown mirrors `aiTriggersWorker` (prevents runaway LLM calls) |
| `webResearch.js` | Real implementations for the three dead `web-research.braid` endpoints (`/api/utils/web-search` via self-hosted SearXNG **only if** already deployable on VPS-2 at zero cost, else fetch-based page search; `/fetch-page` via puppeteer; `/company-lookup` via crawl+LLM) |

### 5.3 Workers (Bull + `cron_job` registration)

| Worker | Cadence | Job |
|---|---|---|
| `growthDemandWorker` | daily | GSC pull (per connected tenant), Trends pull (per tracked keyword/region, batched + cached), autocomplete refresh weekly |
| `growthIntentRollupWorker` | hourly | aggregate `intent_events` → `demand_signals(signal_type='intent_rollup')`; prune events > 90 days |
| `growthCompetitorWorker` | weekly | competitor crawls, content-gap diff, community mining |
| `growthOpportunityWorker` | daily (after demand worker) | run `opportunityEngine`; expire stale opportunities |

All workers: per-tenant iteration, skip tenants without confirmed profiles, fail-soft per tenant (one tenant's broken site must not kill the batch), structured logs.

## 6. Braid tools — `braid-llm-kit/examples/assistant/growth-opportunities.braid`

```
getTopGrowthOpportunities(limit, type?)      → ranked open opportunities
getGrowthOpportunityDetail(id)               → full reason + provenance
getDemandTrends(service?, region?)           → humanized trend statements ("AC repair demand up this month in Wellington")
getCompetitorWeaknesses()                    → content gaps + review themes (flag-gated)
getBusinessProfile()                         → profile summary for agent context
actionGrowthOpportunity(id, overrides?)      → executes the one-click action
dismissGrowthOpportunity(id, reason?)
```

Run `npm run braid:sync` after adding. The "AiSHA Opportunity Agent" from the spec is **not a separate agent**: it's these tools + a system-prompt section injected via `getBraidSystemPrompt()` instructing the assistant to answer "where should I advertise / what's trending / which cities / what content / where are competitors weak" from growth tools, always phrasing output as recommendations (never raw keyword counts — per spec's Demand Intelligence section).

## 7. Frontend

- **New page** `src/pages/GrowthOpportunities.jsx` — "growth command center": Top Opportunities (scored cards with one-click action buttons), Demand Trends, Market/Intent summary, Competitor Weaknesses (flag-gated). Explicitly not a GA-style analytics layout.
- **Onboarding wizard** (modal from the page when `discovery_status != confirmed`): one input (website / GBP / name) → discovery progress → confirm screen (editable services, areas, competitors, keywords) → optional "Connect Google" step (GSC/GBP OAuth). Target < 60s; everything pre-filled.
- **Dashboard widget** `src/components/dashboard/TopOpportunitiesWidget.jsx` — top 3 by score, links to page.
- **Nav registration — all four required** (navigationConfig, `permissions.js` moduleMapping, ModuleManager defaultModules, UserFormWizard NAV_MODULES) + role permission templates, or the page/toggle silently won't appear.
- **Tier gating:** read `tenant.subscription_tier`. Included: profile + intent + service/content opportunities. Professional: Trends + competitor intelligence + forecasting. Agency: multi-location (post-v1; needs the `UNIQUE(tenant_id)` relaxation).
- Testing per house rule: containerized FE (`docker compose up -d --build frontend`, port 4000).

## 8. Phasing (Linear epic: "AiSHA Opportunity Intelligence" — cards map 1:1)

**Phase 1 — Foundation (no external dependencies beyond own crawling):**
1. Migration: 4 tables + RLS + indexes (+ PostgREST `NOTIFY pgrst, 'reload schema'` + REST verify, per runbook)
2. `profileDiscovery` + `/profile/*` routes + onboarding wizard
3. Intent tracking snippet + `/intent/ingest` + rollup worker + intent summary
4. `opportunityEngine` v1 (intent rollups + content-gap inputs) + `/opportunities/*` routes
5. Growth page + dashboard widget + nav (4 registrations)
6. `growth-opportunities.braid` + system-prompt section + `braid:sync`
7. Real handlers for the three dead `web-research.braid` endpoints

**Phase 2 — Official Google data:**
8. Google OAuth (GSC + GBP scopes) + token storage + `googleIntegration`
9. `growthDemandWorker`: GSC ingestion → geographic/service opportunity types with real numbers
10. GBP sync: auto-discovery upgrade (verified profile, service areas) + own-review signals

**Phase 3 — Market & competitor (free/unofficial):**
11. Trends + autocomplete ingestion (circuit-breakered)
12. `competitorCrawler` content-gap detection → content opportunities
13. `communityMiner` (Reddit) → service/reputation signals
14. Review scraping behind `GROWTH_REVIEW_SCRAPING_ENABLED` (default off) → reputation opportunities

**Phase 4 — Actions completion + tiers:**
15. `generate_blog` / `generate_seo_page` / landing-page content generation actions (LLM → hosted page or export; design decision pending on hosting target)
16. Tier gating + Agency multi-location model

## 9. Test plan (per development, house rule)

- **Backend (native runner):** route tests per endpoint group (auth/tenant-isolation/validation/happy-path — including cross-tenant isolation against both active test tenants); `opportunityEngine` unit tests with fixture signals (deterministic candidates, dedupe, cooldown, expiry); `intentClassifier` rules; ingest schema strictness (**PII-allowlist test: unknown/PII-looking keys must be dropped**); `trendsClient` circuit-breaker behavior (mocked failures); token encryption round-trip.
- **Frontend (Vitest):** onboarding wizard states (pending/discovered/confirm/edit), opportunity card actions (action/dismiss/optimistic update + `clearCacheByKey`), widget render, tier gating.
- **E2E (Playwright):** onboarding flow with mocked discovery; opportunity → one-click campaign creation → campaign appears in `aicampaigns`.
- **Regression:** `docker exec aishacrm-backend npm test` green before every merge; Vitest baseline 0-failed holds.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Unofficial Trends API breaks | Circuit breaker + cached last-good data; opportunities degrade gracefully (engine works without Trends) |
| GBP API access approval lag (Google reviews the GCP project) | Phase 1 doesn't need it; apply at Phase 2 start |
| Review scraping ToS exposure | Default-off flag, low frequency, fail-soft, documented as optional |
| Tenant sites unscrapeable (JS-heavy, blocked) | Puppeteer headless; manual profile entry always available in wizard |
| LLM cost of scoring | Cooldowns + batching + route scoring to local vLLM (`brain_plan_actions` capability already supports provider routing) |
| Marketing copy promises absolute volumes pre-Phase-2 | Until GSC connected, all demand statements are directional ("rising", "high interest"), never invented percentages |
