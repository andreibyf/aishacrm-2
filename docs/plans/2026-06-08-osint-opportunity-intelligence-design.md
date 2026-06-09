# AiSHA Opportunity Intelligence (OSINT edition) — Design

**Status:** Approved design — no code yet
**Date:** 2026-06-08 (rev. 2026-06-09)
**Supersedes the input premise of:** `docs/architecture/GROWTH_OPPORTUNITY_INTELLIGENCE.md` (the original spec assumed a tenant website + tenant-owned Google properties; this design removes both)
**Model:** Client-triggered, async, weekly-throttled, persisted **insight runs**

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
GDPR.

### Value contract (what it is / is not)

- **Is:** an AI research-analyst that, when a tenant asks, scans free public signals for their
  declared market (services × target regions) and produces a **persisted insight**: a synthesized
  market report plus **scored, directional** growth opportunities, each linking to an action in
  AiSHA's existing campaign/content tools.
- **Is NOT:** analytics or absolute numbers. With Search Console removed there is no source of
  verifiable demand volume. **Every demand statement is directional by construction**
  ("interest in AC repair appears to be rising in Wellington"), never "2,400 searches".
- The value is **synthesis and vigilance**, not metrics.

---

## 2. Execution model — client-triggered, async, throttled, persisted

There is **one lane**, not a background pipeline. Insights are generated only when a client
asks, and generation is asynchronous:

```
client clicks "Generate Insight"
   → cooldown gate: latest run < 7 days old AND not superadmin?  → blocked (show next-available date)
   → else: create growth_insights row status='running' + ETA, return 202 immediately (no blocking)

[background] growthInsightWorker (poll loop, mirrors emailWorker)
   → claim a 'running' insight
   → collect signals for the declared scope:
        Google Trends + Google Autocomplete + Reddit public JSON + web page fetch (puppeteer)
   → write demand_signals (provenance)
   → opportunityEngine: deterministic candidates → LLM scoring/wording (vLLM via aiEngine)
        → write growth_opportunities (scored, directional)
   → write the synthesized report onto the growth_insights row
   → status='complete' (or 'failed' + error)
   → insert a notifications row for the triggering user (success/warning, link → MI tab)

client: bell badge lights up on completion/failure; or they revisit and GET /insights/current
        → sees the persisted report + opportunities until the next run replaces them
```

### Throttle & roles

- **One insight per tenant per 7 days.** Enforced at the generate endpoint by checking the
  tenant's most recent `growth_insights.created_at`.
- **Superadmin bypass.** `req.user.role === 'superadmin' || req.user.is_superadmin === true`
  (set by `backend/middleware/authenticate.js`; `normalizeRole()` folds `super_admin`/
  `super-admin`). Used by Dre for testing, ad-hoc requests, and own research. Bypasses the gate
  entirely.
- **No scheduled auto-run.** Passive tenants get nothing until they ask — by design (saves LLM +
  scraping spend, honors "each client can *run* one insight per 7 days").

### Async UX

- Response is **not immediate.** Kickoff returns a job id + an **approximate completion time**;
  the UI shows "Running — about ~N minutes" and the client may navigate away.
- **ETA** = heuristic at first (base + per service×region pair), refined to the rolling median of
  the last few completed runs; displayed as a range.
- Completion/failure is surfaced via the **existing notification system** (bell badge +
  `NotificationPanel.jsx`); the client can also just check back.

---

## 3. Placement — fold into the existing feature (no new top-level nav)

A "Market Intelligence" feature already exists and is a primitive, synchronous version of this:

- **Frontend:** `src/components/reports/AIMarketInsights.jsx` (614 lines) — the **"AI Insights"
  tab** in `src/pages/Reports.jsx`.
- **Backend:** `POST /api/mcp/market-insights` (`backend/routes/mcp.js:1450`) — loads the tenant
  profile, pulls CRM stats, fetches web context (Wikipedia only), LLM-summarizes into a JSON
  report (market overview / competitive landscape / growth opportunities). On-demand button,
  industry-level, **not persisted, not throttled, synchronous.**

**Decisions:**

- **Enhance in place.** The new flow reworks this tab into the async, persisted, throttled model.
  The synthesis logic is the kernel of the insight processor; the tab becomes "kick off / show
  running / show persisted result". Keep the response *schema* of the report backward-compatible
  where practical so the existing renderer is reused.
- Everything lives under **Reports & Analytics + a dashboard widget + Braid**. This **deletes the
  original spec's biggest footgun** — the new top-level page and its 4 nav registrations.
- The `tenant` table already carries `industry`, `business_model`, `geographic_focus`,
  `country`, `major_city`. **`business_profiles` seeds its defaults from these** — scope
  declaration is not greenfield.

---

## 4. Data model (4 new tables; `intent_events` dropped)

Naming discipline retained: tables/routes/Braid use the **`growth_`** prefix; never reuse
`opportunities` (the sales pipeline owns it). UI copy says "Opportunities".

### `business_profiles` (one per tenant — manual scope)

- `id uuid pk`, `tenant_id uuid NOT NULL REFERENCES tenant(id)`, `UNIQUE(tenant_id)`
- `service_catalog jsonb` `[{name, slug, keywords[]}]`
- `target_regions jsonb` `[{type, name}]`
- `tracked_keywords jsonb` `[{keyword, source, services[]}]`
- `competitors jsonb` `[{name, website?}]` (optional, manual)
- `settings jsonb`, `last_refreshed_at`, `created_at`, `updated_at`
- Defaults seeded from `tenant`. No Google/crawl/discovery columns.

### `growth_insights` (one row per run; the persisted unit)

- `id uuid pk`, `tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE`
- `status text NOT NULL DEFAULT 'running'` — `running | complete | failed`
- `trigger text NOT NULL DEFAULT 'manual'` — `manual | admin_adhoc` (superadmin)
- `generated_by uuid`, `generated_by_email text` (for notification targeting)
- `report jsonb` — synthesized market report (backward-compatible with the existing renderer)
- `opportunity_ids uuid[] DEFAULT '{}'` — snapshot produced this run
- `signal_summary jsonb` — what fed the run (counts by source)
- `eta_seconds int` — estimate shown at kickoff
- `error text`, `started_at timestamptz DEFAULT now()`, `completed_at timestamptz`,
  `created_at timestamptz DEFAULT now()`
- Index `(tenant_id, created_at DESC)`. The latest row per tenant **is** the current insight; it
  persists until the next run.

### `demand_signals` (provenance, written during a run)

- `id`, `tenant_id`, `signal_type` (`trends|autocomplete|community|web`), `subject`, `region`,
  `period_start/end`, `value numeric`, `delta_pct numeric`, `source`, `payload jsonb`,
  `insight_id uuid` (which run produced it), `created_at`. Index `(tenant_id, created_at DESC)`.

### `growth_opportunities` (produced per run)

- `id`, `tenant_id`, `type` (`geographic|service|content|reputation`), `title`, `reason`,
  `score int CHECK (0..100)`, `expected_impact`, `difficulty`, `recommended_action`
- `action_type` — existing primitives only:
  `create_campaign | create_email | create_sms | create_social | create_workflow | create_task`
  (**no** `generate_blog`/`generate_seo_page`)
- `action_payload jsonb`, `signal_ids uuid[]` (provenance), `insight_id uuid` (the run)
- `status` (`new|viewed|actioned|dismissed|expired`), `actioned_entity jsonb`, `created_at`,
  `expires_at`. Index `(tenant_id, status, score DESC)`.

All tables: RLS, `tenant_id uuid NOT NULL`, tenant isolation via `req.tenant.id`.

---

## 5. Backend

### Enhance in place

- The synthesis kernel currently in `POST /api/mcp/market-insights` becomes the core of the
  insight processor (real web search/fetch beyond Wikipedia, service×region granularity,
  competitor angle). The endpoint itself is superseded by the async `/insights` flow; superadmin
  may still invoke a synchronous path for ad-hoc research.

### Routes — `backend/routes/growth.js`, mounted `/api/v2/growth` (V2-only)

```
GET    /profile                 → business profile (seeded from tenant on first read)
PUT    /profile                 → save service catalog / regions / competitors / keywords

POST   /insights                → kick off a run. Cooldown + superadmin gate. Returns 202
                                   { id, status:'running', eta_seconds } OR 429
                                   { error, next_available_at } if throttled.
GET    /insights/current        → latest insight for tenant (status + persisted report)
GET    /insights/:id            → a specific run

GET    /opportunities           → list from latest complete run (filter type/status/min_score)
GET    /opportunities/:id       → detail incl. provenance signals
POST   /opportunities/:id/dismiss
POST   /opportunities/:id/action → execute action_type via existing primitives; stamp actioned_entity
GET    /dashboard               → bundle: current insight summary + top opportunities
```

All routes go through standard auth + tenant middleware. `req.tenant.id` (uuid) everywhere.

### Libraries — `backend/lib/growth/`

| Module | Responsibility |
|---|---|
| `profileService.js` | Seed-from-tenant + profile read/save (whitelist columns) |
| `trendsClient.js` | Unofficial Google Trends wrapper: retry/backoff, **circuit breaker**, Redis-cached (cache layer, 6380), normalized directional output |
| `autocompleteClient.js` | Public suggest endpoint → keyword expansion; polite rate-limit, aggressive cache |
| `communityMiner.js` | Reddit public-JSON pulls → local-LLM embedding/clustering → community signals (**P2**) |
| `opportunityEngine.js` | recent `demand_signals` → deterministic candidates per type → LLM scoring/wording (`brain_plan_actions`, routed to local vLLM) → dedupe → insert. Honesty enforced in wording |
| `researchAgent.js` | Web search + page fetch + LLM synthesis — the insight processor's collection+synthesis core |
| `webResearch.js` | Real implementations for the **three dead `web-research.braid` endpoints** (`/api/utils/web-search`, `/fetch-page` via puppeteer, `/company-lookup`). General `web-search` is **P3**; P1 uses puppeteer fetch + existing Wikipedia search |
| `insightRunner.js` | Orchestrates one run end-to-end: collect → signals → engine → write report → status → notify. Called by the worker; idempotent/claimable |
| `etaEstimator.js` | Heuristic + rolling-median ETA |

### Worker — `backend/workers/growthInsightWorker.js`

Poll loop **mirroring `backend/workers/emailWorker.js`**: claim `growth_insights` rows with
`status='running'` (atomic claim to avoid double-processing), run `insightRunner`, update status,
insert the completion/failure `notifications` row. Per-tenant fail-soft, structured logs, gated
by `GROWTH_INSIGHT_WORKER_ENABLED`. **No daily/weekly cadence** — purely reactive to client-
created `running` rows. Started in the `server.js` bootstrap block alongside `startEmailWorker`.

> No background demand/opportunity workers: signal collection happens *inside* a run, not on a
> schedule. This fits the weekly-per-client cadence and avoids spending on tenants who never ask.

### Notifications

On terminal status, insert into the existing `notifications` table (shape per
`backend/lib/callFlowHandler.js:97`):
`{ tenant_id, user_email: generated_by_email, title, message, type: 'success'|'warning',
   is_read:false, link:'/reports?tab=ai-insights', metadata:{ insight_id, status } }`.

---

## 6. Braid tools — `braid-llm-kit/examples/assistant/growth-opportunities.braid`

```
getTopGrowthOpportunities(limit, type?)   → from the latest complete insight
getGrowthOpportunityDetail(id)            → full reason + provenance
getDemandTrends(service?, region?)        → humanized directional statements
getLatestInsight()                        → current persisted insight summary + status
requestInsightRun()                       → triggers a run (subject to the 7-day gate)
getBusinessProfile()                      → profile summary for agent context
actionGrowthOpportunity(id, overrides?)   → executes the one-click action
dismissGrowthOpportunity(id, reason?)
```

Run `npm run braid:sync` after adding. System-prompt section via `getBraidSystemPrompt()`:
answer "where to advertise / what's trending / which cities / what content / competitor
weakness" from these tools, **always directional phrasing, never raw counts**; if no insight
exists or it's stale, offer to run one (respecting the gate). Also fixes the long-standing
**vaporware** `web-research.braid` handlers via `webResearch.js`.

---

## 7. Frontend (inside Reports & Analytics + dashboard)

- **Rework** `src/components/reports/AIMarketInsights.jsx` (the Market Intelligence tab) into the
  async model: a **Generate Insight** button that shows the **cooldown state** (next-available
  date) or kicks off a run; a **Running — ~N minutes** state; and the **persisted** report once
  complete. Reads `GET /api/v2/growth/insights/current`. Superadmin sees no cooldown.
- **New** "Opportunities" tab in `Reports.jsx` — scored cards from the latest run, filter/sort,
  dismiss + one-click action (optimistic update + `clearCacheByKey`).
- **New** `src/components/dashboard/TopOpportunitiesWidget.jsx` — top 3 from the latest insight,
  or a "Generate your first insight" CTA → links to the tab.
- **Profile editor** — modal/panel to set service catalog / target regions / competitors,
  pre-filled from tenant fields.
- **Notifications** — no new UI; reuse the existing bell + `NotificationPanel.jsx`.
- **Tier gating: DEFERRED — not in scope.** Feature ships ungated for now. If revived, verify the
  tenant tier column name first (`subscription_tier` was not found in code during design).
- Testing per house rule: containerized FE (`docker compose up -d --build frontend`, port 4000).

---

## 8. Honesty guardrails (by construction)

- Directional language only ("rising/falling", "high/low interest"); **never invented
  percentages or volumes**.
- Trends relative-index never presented as absolute volume.
- Every opportunity card shows **provenance** (which `demand_signals` produced it).
- Insights are timestamped; UI shows "as of <run date>" so persisted data isn't mistaken for live.

---

## 9. Web search backend (SearXNG) — Phase 3, host TBD

General-purpose web search is **only** needed for the on-demand competitor depth (**Phase 3**).
Phase 1's runs use **puppeteer page-fetch + the existing Wikipedia search** — no new infra.

When P3 lands, the backend is **SearXNG** (self-hosted metasearch; no API key, no per-query
bill; fans out across many engines for resilience). Rejected: Brave/Google/Bing APIs (account +
key, usually a card → breaks zero-paid); single-engine DDG scraping (SearXNG supersedes).

**No paid IP rotation.** True rotating proxies cost money (out of scope). The free equivalent:
multi-engine fan-out + aggressive caching + polite rate-limit/backoff + **residential egress**
(a consumer ISP also tends to hand out a dynamic IP on reconnect — poor-man's rotation). Tor is
**not** viable (search engines hard-block it).

**Hosting (decide at P3, do not assume):**

- **AI Cloud Server (HP Omen) — favored default.** Residential egress (least blocked); spare
  CPU (SearXNG is CPU/network-light, never touches the GPU doing inference); already reachable
  over Tailscale. Trade-off: home-box uptime + manual (non-Coolify) ops. Acceptable because the
  feature degrades gracefully if search fails.
- **VPS-2 — only if measured to have room.** It is the *conventional* tooling host, BUT it runs
  the **Coolify control plane** plus Cal.com + OneDev (Java) + Gitea + Uptime Kuma. A bursty
  scraper that tips the box (cf. the VPS-1 lock incident in `DEPLOY_TOPOLOGY.md`) would take
  down deploys for everything. **Measure `free -m` / `nproc` / load before choosing it.**
- **Hetzner (Production) — never.** Paid box, customer traffic; an outbound scraper there risks
  production IP reputation and adds cost/load.

---

## 10. Compute requirements

- **No new GPU dependency.** The pipeline (scraping, fetch, search, DB, candidate rules, UI) is
  pure CPU/network. LLM steps (scoring, synthesis) go through the existing multi-provider
  `aiEngine` — preferentially the local **vLLM** (GPU-backed, zero marginal cost) but failing
  over to cloud providers if it's unavailable. Load added to the vLLM is light (weekly per
  tenant, batched), separate from the GPU's profile-summary work.
- Reddit clustering embeddings (P2) can run on a small CPU model — also not a GPU dependency.

---

## 11. Phasing

- **P1 — Foundation:** migration (4 tables + RLS + indexes + PostgREST reload + REST verify) ·
  `business_profiles` routes + profile editor (seeded from tenant) · async `/insights` flow
  (generate w/ cooldown+superadmin gate, current, by-id) · `growthInsightWorker` +
  `insightRunner` + `etaEstimator` · signal collection (Trends + autocomplete) + `opportunityEngine`
  v1 · completion/failure notifications · Opportunities tab + dashboard widget · reworked Market
  Intelligence tab (async UX) · `growth-opportunities.braid` + system prompt + `braid:sync` ·
  real `web-research` handlers (puppeteer fetch + Wikipedia; no SearXNG).
- **P2 — Community:** `communityMiner` (Reddit) folded into the run → community signals.
- **P3 — Competitor depth + web search:** agentic competitor analysis; deploy **SearXNG**
  (host decided per §9); optional review-theme mining behind `GROWTH_REVIEW_SCRAPING_ENABLED`
  (default off, ToS-gray, low frequency, fail-soft).
- **P4 — Tiers:** tier gating. **Deferred — not scheduled.** Ships ungated until revived.

---

## 12. Test plan (house rule)

- **Backend (native runner):** route tests (auth / tenant-isolation / validation / happy-path,
  incl. cross-tenant); **cooldown gate** (blocks within 7 days; superadmin bypasses; returns
  `next_available_at`); async kickoff returns 202 + eta without blocking; `insightRunner`
  idempotent claim (no double-processing); notification inserted on complete/fail;
  `opportunityEngine` unit tests (deterministic candidates, dedupe, expiry, no-invented-numbers
  regex); `trendsClient` circuit breaker (mocked failures); `etaEstimator` heuristic + rolling
  median.
- **Frontend (Vitest):** Market Intelligence tab states (idle / cooldown-blocked / running-with-
  ETA / complete-persisted / failed); Opportunities card actions (+ `clearCacheByKey`); widget
  render + CTA empty state; profile editor.
- **E2E (Playwright):** set scope → kick off run (mocked processor) → status transitions to
  complete → notification appears → opportunity → one-click campaign → appears in `aicampaigns`;
  second immediate run is throttled (429); superadmin run is not.
- **Regression:** `docker exec aishacrm-backend npm test` green; `npm run test:run` 0-failed.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Unofficial Trends API breaks | Circuit breaker + cached last-good; run degrades gracefully |
| Thin/directional signals overpromise | Directional language by construction; provenance + "as of" timestamp |
| LLM cost | Weekly-per-tenant throttle + cooldown + batching + route to local vLLM |
| Long-running run blocks UX | Async by design: 202 + ETA + notification; never a blocking request |
| Double-processing a run | Atomic claim in the worker (status transition guard) |
| Search-engine IP blocking (P3) | Engine fan-out + caching + residential egress; no paid proxies; Tor excluded |
| Web-search host headroom (P3) | Favor AI server; measure VPS-2 before using it; never Hetzner |
| Scope creep back to "live numbers" | Contract is directional-only; enforced in prompt + UI copy |
