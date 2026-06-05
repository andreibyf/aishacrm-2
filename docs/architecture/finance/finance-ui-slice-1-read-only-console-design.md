# Finance Ops — UI Slice 1: Read-only Finance Operations Console Design Freeze

**UI Slice 1 — Design freeze for the read-only Finance Operations Console (operator/admin view) before any UI code lands.**
**Branch:** `feat/finance-ops-runtime` (parallel track to backend Phase 4 planning — does not block, is not blocked by, Phase 4-0).
**Status:** Design freeze. **No UI code, no React component, no API client, no nav-config entry, no module-mapping change, no route binding, no test, no `.env` change, no migration, no Coolify mutation, no provider write, no production action by this task.** This document freezes IA, screen inventory, API mapping, guardrail banners, authz behavior, error states, and the parallel implementation packet split so the implementation packets (UI-1A…UI-1F) can proceed without re-deciding architecture mid-flight.
**Date:** 2026-05-26
**Why now:** Phase 3 closed (Phase 3-14 GO-WITH-CONDITIONS for Phase 4 production-pilot planning, `ce7d8cd8`); Slice 2 closed (`af8f71bc`…`d1371632`); backend runtime + projections + sandbox adapter all structurally exist, but finance admins / operators currently have **zero UI surface** for inspecting any of it. Without a read-only console the operator-side evidence packs and the Phase 4 pilot are flying blind: operators have no way to observe runtime health, approval backlog, ledger / journal state, the adapter queue, or the audit timeline without shelling into a backend container and hitting the API by hand. This slice closes that observability gap **without introducing any mutating UI control** — every approve / reverse / replay / adapter-retry / provider-sync / route-flip path remains explicitly out of scope and is enumerated below.
**Related:**
[`phase-3-activation-evidence-pack.md`](./phase-3-activation-evidence-pack.md) (Phase 3-13, source of truth for backend + Slice 2 closure state) ·
[`phase-4-production-pilot-go-no-go.md`](./phase-4-production-pilot-go-no-go.md) (Phase 3-14, parallel backend track this UI slice does not block) ·
[`worker-service-topology.md`](./worker-service-topology.md) (worker topology + heartbeat liveness — informs runtime overview screen) ·
[`projection-runtime.md`](./projection-runtime.md) §3 (projection store backends — informs degraded/projection status banner) ·
[`projection-contracts.md`](./projection-contracts.md) §3–§7 (`ledger`, `approval_queue`, `adapter_queue`, `audit_timeline` projection contracts — define the read-models the API gaps below would expose) ·
[`adapter-runtime-contract.md`](./adapter-runtime-contract.md) §2 (adapter contract — informs sandbox adapter status screen) ·
[`audit-evidence-layer.md`](./audit-evidence-layer.md) (audit evidence builder — informs evidence/audit pack placeholder screen) ·
[`slice-2-adapter-runtime-design.md`](./slice-2-adapter-runtime-design.md) (Slice 2-0 design freeze cadence this packet mirrors) ·
`backend/routes/finance.v2.js` (the **only** Finance v2 HTTP surface today — 5 GET routes + 6 mutating routes, all enumerated in §8) ·
`backend/lib/finance/financeRuntimeGate.js` (process-level `ENABLE_FINANCE_OPS` gate) ·
`backend/lib/finance/financeModuleGate.js` (per-tenant `modulesettings.financeOps` gate) ·
`src/utils/navigationConfig.js` (primary + secondary nav + `moduleMapping` table — informs §6 IA proposal) ·
`src/pages/Layout.jsx` (`RouteGuard` + nav rendering — informs §11 authz behavior)

---

## 1. Purpose and scope

UI Slice 1 freezes the design for the **first finance-ops user-facing surface**: a strictly read-only operations console mounted as a single CRM page (plus tabs / subroutes) that lets a finance admin or operator inspect what the Finance v2 backend is currently doing for their tenant.

After UI Slice 1 lands all packets (UI-1A…UI-1F), the following becomes true that isn't true today:

- A finance admin can open the CRM, click a single nav entry ("Finance Operations" — proposed label, §6), and see runtime health, ledger summary, draft invoices, journal drafts and posted journal entries, the approval queue, the adapter queue, the audit timeline, projection / degraded status, sandbox adapter status, and an evidence / audit-pack placeholder — **without typing a single SQL query, hitting the API by hand, or shelling into a backend container**.
- An operator looking at a degraded tenant can confirm at a glance: (a) is the runtime in-memory or persistent? (b) is `ENABLE_FINANCE_PERSISTENT_EVENTS` lifted yet? (c) is `FINANCE_PROVIDER_WRITES_ENABLED` still default-closed? (d) is the sandbox adapter still sandbox-only? (e) is production activation authorized? (Answer for today: in-memory, no, no, yes, no — and the UI must surface that honestly.)
- An implementation engineer working on Phase 4 planning can use the console as a live oracle to confirm whether a runtime change actually took effect end-to-end (event emitted → projection advanced → API exposes new state → UI renders it), rather than relying on logs + test runs alone.

**Scope boundary — what UI Slice 1 does NOT do:**

- **No mutating controls.** No approve button, no reject button, no reverse button, no replay button, no adapter retry button, no adapter cancel button, no provider sync trigger, no route-flip button for `ENABLE_FINANCE_PERSISTENT_EVENTS`, no provider-writes-enable button, no production-activation button. Enumerated exhaustively in §13.
- **No frontend execution of `POST /api/v2/finance/*`.** The six mutating endpoints (`POST /draft-invoices`, `PATCH /draft-invoices/:id`, `POST /journal-drafts`, `POST /simulate/deal-won`, `POST /journal-entries/:id/reverse`, `POST /approvals/:id/approve`) are out of scope. The API client must not even import them.
- **No new backend endpoints.** UI Slice 1 consumes only the **5 existing GET routes** in `backend/routes/finance.v2.js` (§8.1). Every read the UI cannot satisfy from those five today is **flagged as an API gap** in §8.2 and deferred to the appropriate backend slice (UI-1F bundles the gap inventory; backend slices that close them are out of UI Slice 1 scope).
- **No persistent-events route activation.** `ENABLE_FINANCE_PERSISTENT_EVENTS` stays unset / fail-closed at `backend/routes/finance.v2.js:48`. The UI **observes** the fail-closed posture (via `/runtime/status.runtime.persistence === 'in_memory'` and a persistent banner — §10) but does not flip it.
- **No provider writes.** `FINANCE_PROVIDER_WRITES_ENABLED` stays `false` by default. The UI **observes** the disabled posture (via `/runtime/status.runtime.provider_sync === 'disabled'` and a persistent banner — §10) but does not toggle it.
- **No sandbox adapter activation or credential management.** The sandbox adapter status screen (§7.9) is observe-only; it does not let the operator add, edit, rotate, or test ERPNext credentials.
- **No evidence / audit pack generation.** The evidence / audit-pack placeholder screen (§7.10) is a **navigation stub + future-state explainer**, not an "Export evidence" button. The audit evidence builder runtime (`backend/lib/finance/auditEvidenceBuilder.js`) exists but has no HTTP surface today; UI-1F includes the gap entry but does not generate evidence packs.
- **No tenant or module enablement.** The UI does not let an admin enroll a tenant in `financeOps`, lift the process-level `ENABLE_FINANCE_OPS`, or claim production tenants. It **observes** module gate state and renders the correct empty state for non-enrolled tenants (§11, §12).
- **No multi-tenant aggregation.** Every screen is scoped to `req.tenant.id` end-to-end; no super-admin "all tenants" cross-tenant view in Slice 1.
- **No write-side AI surface.** The AiSHA assistant remains in `read_only` / `propose_actions` for finance entities; UI Slice 1 does not add a Braid tool for any of these screens. (A separate later slice can add Braid read-only tools that mirror the same backend GETs.)

**This document is a design freeze.** No frontend code, no API client, no nav-config change, no test code is delivered by this task. The implementation packets (UI-1A…UI-1F) each deliver their own code in separately reviewed commits.

---

## 2. Live-execution posture

**Default for this task: no code shipped, no live execution, no environment touched.**

| What                                                                                | Status this task                                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/pages/FinanceOps.jsx` (new finance ops page)                                   | None — UI-1A delivers it.                                                                                  |
| `src/components/finance/*` (screen components)                                      | None — UI-1B / UI-1C / UI-1D deliver them.                                                                 |
| `src/api/finance.js` (read-only API client) or equivalent under `src/api/entities/` | None — UI-1A delivers it (read-only methods only).                                                         |
| `src/utils/navigationConfig.js` updates (nav entry + `moduleMapping`)               | None — UI-1A delivers it.                                                                                  |
| `src/pages/index.jsx` route binding                                                 | None — UI-1A delivers it.                                                                                  |
| Frontend test files under `src/components/finance/__tests__/`                       | None — each implementation packet delivers its own.                                                        |
| Backend endpoint added or changed                                                   | None — UI Slice 1 is frontend-only against the 5 existing GET routes; backend gap closure is out of scope. |
| `ENABLE_FINANCE_OPS` flipped in any environment                                     | None.                                                                                                      |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` flipped in any environment                       | None — remains fail-closed everywhere.                                                                     |
| `FINANCE_PROVIDER_WRITES_ENABLED` flipped in any environment                        | None — remains default-closed everywhere.                                                                  |
| `modulesettings.financeOps` row inserted / enabled for any tenant                   | None — operator action, separately authorized.                                                             |
| Staging Doppler env changed                                                         | None.                                                                                                      |
| Production environment touched in any way                                           | None.                                                                                                      |

A live implementation of any UI-1A…UI-1F packet requires the deploy owner's explicit authorization. When authorized, each packet is implemented in its own commit (or commit series) with its own pre-commit gate and Codex review, exactly as the backend Slice 2A–2E packets were.

---

## 3. Prerequisites — what must be true before UI Slice 1 implementation begins

- [x] **Phase 3 closed.** Phase 3-13 evidence pack (`ed6a0485`) + Phase 3-14 go/no-go packet (`ce7d8cd8`) committed and Codex-cleared.
- [x] **Slice 2 closed.** Slice 2-0 design freeze through Slice 2E runbooks committed (`af8f71bc`, `18c5c480`, `3a730945`, `c414802f`, `d1371632`, `b9dbd191`) and Codex-cleared.
- [x] **Backend Finance v2 read surface stable.** The 5 GET routes (`/runtime/status`, `/journal-entries`, `/ledger`, `/profit-loss`, `/balance-sheet`) have been the same shape since Slice 1 backend and are the **only** surface this UI consumes (§8.1).
- [x] **Module gate semantics frozen.** `financeOps` canonical / `enterpriseFinance` alias keys per `backend/lib/finance/financeModuleGate.js`; canonical wins on conflict.
- [x] **Process-level gate frozen.** `ENABLE_FINANCE_OPS === 'true'` mounts the route surface; anything else returns 404. Per `financeRuntimeGate.js`.
- [x] **Persistent-events guard frozen.** `ENABLE_FINANCE_PERSISTENT_EVENTS === 'true'` causes the v2 router to throw on construction (`finance.v2.js:48`). UI Slice 1 does not lift this; it only observes it.
- [x] **Provider-writes guard frozen.** `FINANCE_PROVIDER_WRITES_ENABLED=false` is the default; the kill switch lives at `adapterJobProcessor.js:332-345` per Phase 3-13 §7. UI Slice 1 does not toggle this; it only observes it.
- [ ] **No production action.** `prd_prd` Doppler not opened; Hetzner not touched; production tenant `modulesettings.financeOps` not enrolled; production `ENABLE_FINANCE_OPS` stays unset.

---

## 4. User personas

Slice 1 names three personas. They are deliberately operator / admin facing; no end-customer persona is in scope (no customer-visible invoice surface, no AR/AP customer view, no payment portal integration in Slice 1).

### 4.1 Finance admin (primary persona)

- **Who:** An internal tenant user with `crm_access = true`, in a tenant enrolled in `financeOps`. In production usage, this is the customer's finance lead (CFO / controller / finance ops manager). The actual Finance v2 backend authorization contract today is exactly: authenticated session + `validateTenantAccess` (tenant match) + per-tenant `financeOps` module gate (`backend/routes/finance.v2.js:67-85`). There is **no backend role check** — restricting the nav entry to admin/superadmin would be a frontend-only product-policy decision introduced by Slice 1, not a reflection of the backend contract; that decision is deferred to a later product/UX slice per §11.3.
- **Trust level:** High. Authorized to see all finance state for their tenant. Not authorized to mutate anything in Slice 1; mutation paths are deferred to a later UI slice and gated separately.
- **Mental model:** "Show me what's happening with my finance data — what's pending, what's posted, what's queued, what failed, what's pending approval." Wants a single page to glance at and a confidence signal that the system is healthy / degraded / blocked.
- **Decision authority in Slice 1:** None binding — the UI is read-only. Out-of-band escalation: contact the deploy owner if something looks wrong.
- **Volume of access:** Daily / weekly check-in pattern.

### 4.2 Operator / support engineer (secondary persona)

- **Who:** 4V Data Consulting LLC internal staff (deploy owner, on-call engineer, support engineer) with elevated access to a customer tenant via super-admin / impersonation. May also be the same person as the implementation engineer in §4.3 for small-team contexts.
- **Trust level:** High at the platform level; bound to one tenant at a time via the existing impersonation banner (`src/components/shared/ImpersonationBanner`).
- **Mental model:** "A customer reported X is broken — what does the runtime actually show? Are workers running? Is the queue draining? Is the route mounted? Are guards still intact?" Needs to confirm system state without trusting the customer's description and without depending on customer-side logs.
- **Decision authority in Slice 1:** None binding from the UI. Operator decides whether to escalate, file a defect, page on-call, or recommend an environment change — but all of those happen outside this UI.
- **Volume of access:** Incident-driven, plus periodic spot checks during pilot.

### 4.3 Implementation engineer (tertiary persona)

- **Who:** Backend / full-stack engineer building or extending finance backend slices, Phase 4 planning packets, or future UI slices. Internal AiSHA team.
- **Trust level:** High at the platform level.
- **Mental model:** "I just shipped a backend change — did the runtime + projection + API + UI line up? Is what I'm seeing in the UI the same thing the API returns? Does the empty state for X actually look right when the projection is empty?" Uses the UI as a live oracle for end-to-end correctness during development.
- **Decision authority in Slice 1:** None binding — uses the UI as observation, then files a defect or proposes a change via the normal slice cadence if state diverges from expectations.
- **Volume of access:** During backend slice development cycles.

---

## 5. Primary jobs-to-be-done

Each JTBD below is grounded in an existing or gap-flagged read surface. JTBDs that depend on a future endpoint are labeled **(blocked on backend gap)** and cross-referenced to §8.2.

1. **Understand runtime health at a glance.** "Is the finance ops module on for this tenant? Is the runtime in-memory or persistent? Is the provider sync enabled or disabled? Is governance enforced? How many journal entries / invoices / approvals / audit events / adapter jobs exist?" — Satisfied by `GET /api/v2/finance/runtime/status` (§8.1.1).
2. **See the ledger summary.** "What does the ledger look like for this tenant right now?" — Satisfied by `GET /api/v2/finance/ledger` (§8.1.3).
3. **See the P&L and balance sheet.** "What does the P&L look like? What does the balance sheet look like?" — Satisfied by `GET /api/v2/finance/profit-loss` (§8.1.4) and `GET /api/v2/finance/balance-sheet` (§8.1.5).
4. **Inspect posted journal entries.** "What journal entries exist? What are their amounts / accounts / posted-at timestamps?" — Satisfied by `GET /api/v2/finance/journal-entries` (§8.1.2).
5. **Inspect draft invoices.** "What invoices are still in draft? Who created them? When?" — **(blocked on backend gap §8.2.1: no `GET /draft-invoices` list endpoint.)** Slice 1 renders an explicit "API not yet available — see §8.2.1" empty state.
6. **Inspect journal drafts (pre-approval).** "What journal drafts have been created but not yet approved or posted?" — **(blocked on backend gap §8.2.2: no `GET /journal-drafts` list endpoint.)** Slice 1 renders an explicit gap empty state.
7. **See the approval backlog.** "What approvals are pending? What is the requested action? Who requested? How old is the request?" — **(blocked on backend gap §8.2.3: no `GET /approvals` list endpoint.)** Slice 1 renders an explicit gap empty state.
8. **Inspect the adapter queue.** "What adapter_jobs are queued, running, failed? For which provider? Last attempt at what time?" — **(blocked on backend gap §8.2.4: no `GET /adapter-jobs` list endpoint; `adapter_queue` projection contract per [`projection-contracts.md`](./projection-contracts.md) §7 is the natural read-model.)** Slice 1 renders an explicit gap empty state.
9. **See the audit timeline.** "What events have happened recently? Who/what acted? In what order?" — **(blocked on backend gap §8.2.5: no `GET /audit-events` or `audit_timeline` projection list endpoint.)** Slice 1 renders an explicit gap empty state.
10. **Confirm projection / degraded status.** "Is the projection runtime currently in-memory only? Is the persistent store mounted? Is the projection store fully populated or is there a known gap?" — Partially satisfied by `/runtime/status.runtime.persistence` (§8.1.1), with explicit gap callout for projection-store store-type / cursor / lag (§8.2.6).
11. **Confirm sandbox adapter status.** "Is the sandbox adapter registered? Is its `base_url` still sandbox-bounded? Is `FINANCE_PROVIDER_WRITES_ENABLED=false`?" — Partially satisfied by `/runtime/status.runtime.provider_sync` (§8.1.1) + a banner; the deeper "which adapters are registered" view is **(blocked on backend gap §8.2.7)**.
12. **Identify guardrail-relevant state in one place.** "Is persistent events disabled / fail-closed? Are provider writes disabled by default? Is the adapter sandbox-only? Is production activation not authorized?" — Satisfied by the persistent guardrail banner area (§10) reading `/runtime/status` plus design-time constants.
13. **Navigate to evidence / audit-pack tooling when it lands.** "Where would I go to pull an evidence pack for an auditor?" — Stub-only in Slice 1, points to §8.2.8 gap and the existing `auditEvidenceBuilder.js` runtime that has no HTTP surface yet.

---

## 6. Information architecture / navigation proposal

### 6.1 Top-level navigation

The console mounts as a **single new primary-nav entry** in the existing left sidebar, gated by the per-tenant `financeOps` module enablement (§11).

- **Proposed label:** "Finance Operations" (long enough to be unambiguous; not "Finance" alone — that overlaps semantically with `CashFlow`).
- **Proposed `href`:** `FinanceOps` (matches the kebab-to-CamelCase convention of `BizDevSources`, `CashFlow`, `AICampaigns`, `ClientOnboarding` already in `src/utils/navigationConfig.js`).
- **Proposed module mapping key in `moduleMapping`:** `'Finance Operations'` (a new display-label entry to match the existing pattern). **Open question:** the existing `moduleMapping` table values are display strings like `'Cash Flow Management'` while the backend canonical key is `'financeOps'`. The implementation packet UI-1A must either (a) introduce a second key field on the moduleMapping entry that points to `'financeOps'`, or (b) add a translation in the route-guard that maps the display label to the canonical key. The cleaner direction is (a); UI-1A finalizes this on review.
- **Proposed icon:** a `BarChart3` / `BookOpen` / `Wrench` glyph from `lucide-react` (already imported in `Layout.jsx`). UI-1A picks a single one on review.
- **Proposed position:** between `Reports` and `Integrations` (analytics-adjacent, settings-adjacent). UI-1A confirms on review.
- **Secondary nav entry:** no. The console is operationally important enough to be primary-nav when enabled.
- **`pagesAllowedWithoutCRM` set:** no — finance ops requires CRM access by definition.
- **`systemPages` set:** no in Slice 1. Per §11.3, the Slice 1 access model matches the real Finance v2 backend contract — authenticated tenant + `financeOps` enabled, no role gate — so adding `FinanceOps` to `systemPages` (which is a superadmin / platform-side restriction) would over-narrow the access surface beyond what the backend enforces. A later product/UX slice may add a role gate as a deliberate product-policy decision; if it does, the corresponding backend role check must land in the same slice so the rule is enforced at both layers.

### 6.2 In-page navigation (tabs / subroutes)

The `FinanceOps` page hosts **10 read-only screens** (§7). They are exposed as **tabs** inside the page rather than separate top-level nav entries — adding 10 new top-level entries would dwarf the rest of the sidebar.

Proposed tab layout (left-to-right) — frozen for UI-1A; **amended 2026-06-05** (COA Slice 1) to insert "Chart of accounts" after Ledger summary (the master the ledger aggregates over). See `finance-coa-wiring-and-cashflow-bridge-design.md` §5.

| #   | Tab label              | Screen ref | Default? |
| --- | ---------------------- | ---------- | -------- |
| 1   | Runtime overview       | §7.1       | **Yes**  |
| 2   | Ledger summary         | §7.2       | No       |
| 2a  | Chart of accounts      | COA Slice 1 | No      |
| 3   | Draft invoices         | §7.3       | No       |
| 4   | Journal drafts         | §7.4       | No       |
| 5   | Journal entries        | §7.5       | No       |
| 6   | Approval queue         | §7.6       | No       |
| 7   | Adapter queue          | §7.7       | No       |
| 8   | Audit timeline         | §7.8       | No       |
| 9   | Projection / degraded  | §7.9       | No       |
| 10  | Sandbox adapter        | §7.10      | No       |
| 11  | Evidence (placeholder) | §7.11      | No       |

Tabs whose backing endpoint is a gap (§8.2) are **rendered but disabled** in Slice 1 — they show the explicit gap empty state when clicked. The Slice 1 default tab is **Runtime overview** because (a) it has live data today, (b) it answers the most JTBDs at once (1, 10, 11, 12), and (c) its empty state is the least scary if the tenant has zero finance activity.

### 6.3 Deep-linking and URL structure

- Primary route: `/FinanceOps`
- Tab routing: `/FinanceOps?tab=runtime-overview` (default), `?tab=ledger`, `?tab=invoices`, `?tab=journal-drafts`, `?tab=journal-entries`, `?tab=approvals`, `?tab=adapter-queue`, `?tab=audit`, `?tab=projection`, `?tab=sandbox-adapter`, `?tab=evidence`.
- Query-param tab state, not nested routes — matches the existing pattern used by `Settings.jsx` and avoids registering 11 new route paths in `src/pages/index.jsx`.
- No row-level deep linking in Slice 1 (no `/FinanceOps/journal-entries/:id` detail route). Detail views are deferred to a later slice; Slice 1 surfaces lists + summary state.

### 6.4 Breadcrumb / back behavior

- Single-level breadcrumb: `Home > Finance Operations`.
- No mid-tab back state in Slice 1.

---

## 7. Screen inventory (10 read-only screens + 1 placeholder)

Each screen entry below lists (a) the JTBD it satisfies (§5), (b) the API source (existing endpoint or gap reference), (c) the columns / fields rendered, (d) empty state, (e) error state, (f) refresh behavior, (g) explicit out-of-scope items.

### 7.1 Runtime overview

- **JTBD:** §5.1, §5.10, §5.11, §5.12.
- **API:** `GET /api/v2/finance/runtime/status` (§8.1.1) — **exists today**.
- **Renders:**
  - Header strip: tenant id + tenant name (from existing `useTenant()` hook).
  - Runtime mode (`mock_read_only` today — frozen string for Slice 1 since the route returns this hard-coded; flagged in §8.2.9 as a gap when projection-backed routes land).
  - Persistence (`in_memory` today — same caveat).
  - Provider sync (`disabled` today).
  - Governance (`enabled` today).
  - Counts grid (5 tiles): journal entries, invoices, approvals, audit events, adapter jobs.
- **Empty state:** all counts at zero → "No finance activity yet for this tenant. Use the Approval queue, Adapter queue, or Audit timeline tabs to confirm workers are running." (Wording final on UI-1B.)
- **Error state:** §12.
- **Refresh:** manual refresh button only in Slice 1 (no polling, no live-stream, no SSE). Polling is a Slice-2-UI feature explicitly deferred per §9.
- **Out of scope:** no time-series counts, no historical chart, no per-projection cursor view (the latter is in §7.9 and depends on §8.2.6).

### 7.2 Ledger summary

- **JTBD:** §5.2.
- **API:** `GET /api/v2/finance/ledger` (§8.1.3) — **exists today**.
- **Renders:** the ledger object as returned by the domain service (`service.getLedger(tenantId)`). Slice 1 renders it as a flat key/value table; the structure is not enumerated in this design freeze because the in-memory domain service shape may differ from the projection-backed shape that lands when persistent reads come online. UI-1B treats the response as opaque and renders any returned fields generically (no field-name validation).
- **Empty state:** "Ledger is empty for this tenant."
- **Error state:** §12.
- **Refresh:** manual.
- **Out of scope:** no drill-into-account-detail in Slice 1 (no `/FinanceOps/ledger/:account_code` route).

### 7.3 Draft invoices

- **JTBD:** §5.5.
- **API:** **gap — §8.2.1**. There is no `GET /draft-invoices` endpoint; only `POST /draft-invoices` and `PATCH /draft-invoices/:id`.
- **Slice 1 behavior:** the tab renders an explicit gap state — a non-error informational card titled "Draft invoices read-API not yet implemented" with the §8.2.1 gap reference and a "Why this exists" explainer paragraph noting that the create / update endpoints are not consumed by Slice 1 (no UI mutation surface).
- **Empty state:** N/A — the gap state replaces it.
- **Error state:** N/A — the tab does not fetch.
- **Refresh:** N/A.
- **Out of scope:** all create / edit / send / void / delete affordances; the existing `POST` and `PATCH` endpoints are not called by Slice 1.

### 7.4 Journal drafts

- **JTBD:** §5.6.
- **API:** **gap — §8.2.2**. There is no `GET /journal-drafts` endpoint; only `POST /journal-drafts`.
- **Slice 1 behavior:** gap state, same pattern as §7.3.
- **Out of scope:** all create / edit / approve / post affordances.

### 7.5 Journal entries (posted)

- **JTBD:** §5.4.
- **API:** `GET /api/v2/finance/journal-entries` (§8.1.2) — **exists today**.
- **Renders:** a table of journal entries. Columns are not pinned in this design freeze beyond the four fields the in-memory domain service guarantees on every journal entry (`id`, `aggregate_id`, `status`, `created_at`); the domain service may return additional fields (e.g. `account_code`, `amount`, `currency`, `posted_at`) that Slice 1 renders if present and omits if absent (graceful per-row degradation).
- **Sort:** newest first (descending `created_at`) — Slice 1 default; no client-side sort UI.
- **Filter:** none in Slice 1. (Status filter is a Slice-2-UI deferral.)
- **Empty state:** "No journal entries posted for this tenant yet."
- **Error state:** §12.
- **Refresh:** manual.
- **Out of scope:** no reverse button (deferred per §13), no detail-row drill-down, no export.

### 7.6 Approval queue

- **JTBD:** §5.7.
- **API:** **gap — §8.2.3**. There is no `GET /approvals` endpoint; only `POST /approvals/:id/approve`.
- **Slice 1 behavior:** gap state, same pattern as §7.3.
- **Out of scope:** all approve / reject / claim affordances; `POST /approvals/:id/approve` is not called by Slice 1.

### 7.7 Adapter queue

- **JTBD:** §5.8.
- **API:** **gap — §8.2.4**. There is no `GET /adapter-jobs` endpoint and no `GET /adapter-queue` projection-list endpoint. The projection itself exists in code (`backend/lib/finance/projections/adapterQueueProjection.js`) per Slice 2D and the contract at [`projection-contracts.md`](./projection-contracts.md) §7.
- **Slice 1 behavior:** gap state. The gap copy explicitly names the natural backing read-model so the future backend slice has a clear contract target.
- **Out of scope:** all retry / cancel / replay / re-emit affordances.

### 7.8 Audit timeline

- **JTBD:** §5.9.
- **API:** **gap — §8.2.5**. The domain service has `listAuditEvents(tenantId)` (`financeDomainService.js:144`) and `/runtime/status` exposes a count; no list endpoint is exposed yet. The `audit_timeline` projection (`backend/lib/finance/projections/auditTimelineProjection.js`) is the natural backing read-model per [`projection-contracts.md`](./projection-contracts.md).
- **Slice 1 behavior:** gap state.
- **Out of scope:** no per-event drill-down, no actor-identity filter, no time-range filter, no export.

### 7.9 Projection / degraded status

- **JTBD:** §5.10.
- **API (partial):** `GET /api/v2/finance/runtime/status` (§8.1.1) — exposes `runtime.persistence` only (`in_memory` today).
- **API (gap):** **§8.2.6** — no per-projection cursor / store-type / last-applied-event endpoint. The runtime has projection cursor state internally (`projectionStore.memory.js` / `projectionStore.pg.js`) but does not expose it.
- **Slice 1 behavior:**
  - Renders `runtime.persistence` from `/runtime/status` as a single line: "Persistence: in-memory" (today) or "Persistence: postgres-projection" (future).
  - Renders a degraded banner if `runtime.persistence === 'in_memory'` AND `ENABLE_FINANCE_PERSISTENT_EVENTS` is observably unset (it must be unset in Slice 1 — the route would refuse to mount otherwise; this is a defensive double-check).
  - Renders a gap card pointing to §8.2.6 for the deeper per-projection cursor view.
- **Empty state:** none — runtime status is always available when the route is mounted.
- **Error state:** §12 (specifically: the route-mount-refused state and the projection-runtime-error state).
- **Out of scope:** no replay button, no advance-cursor button, no drop-and-rebuild button.

### 7.10 Sandbox adapter status

- **JTBD:** §5.11.
- **API (partial):** `GET /api/v2/finance/runtime/status` (§8.1.1) — exposes `runtime.provider_sync` only (`disabled` today).
- **API (gap):** **§8.2.7** — no list-of-registered-adapters endpoint, no sandbox-`base_url` echo endpoint, no `assertWritePermitted` posture view, no adapter `register()` `kind` / `version` / `capabilities` echo per `adapter-runtime-contract.md` §2.
- **Slice 1 behavior:**
  - Renders `runtime.provider_sync` from `/runtime/status` as a single line: "Provider sync: disabled" (today).
  - Renders a persistent informational note: "ERPNext sandbox adapter is the only configured adapter (per `adapter-runtime-contract.md`). Sandbox-`base_url` enforcement is verified structurally in code at `erpnextSandboxAdapter.js:89-128`. Slice 1 cannot expose the registered-adapter list — see §8.2.7."
  - Banner state: "Sandbox-only adapter — `FINANCE_PROVIDER_WRITES_ENABLED=false` default" (matches the persistent guardrail banner in §10).
- **Out of scope:** no credentials view, no rotate-credentials affordance, no test-connection button, no add-adapter affordance, no provider-sync-trigger button.

### 7.11 Evidence / audit pack placeholder

- **JTBD:** §5.13.
- **API (gap):** **§8.2.8** — `backend/lib/finance/auditEvidenceBuilder.js` exists per the audit evidence layer design but has no HTTP surface. There is no `POST /evidence-packs` (would be mutating anyway) and no `GET /evidence-packs` (read-only list) today.
- **Slice 1 behavior:** placeholder card titled "Evidence / audit packs" with explainer copy: "The audit evidence builder runtime exists in `backend/lib/finance/auditEvidenceBuilder.js` but has no HTTP surface yet. A later slice will expose it. See §8.2.8."
- **Out of scope:** generate-pack button (mutating), download-pack button (depends on a backend gap), every export / share affordance.

---

## 8. API contract mapping to Finance v2 + known gaps

### 8.1 Existing Finance v2 GET endpoints consumed by Slice 1

All endpoints below are mounted under `/api/v2/finance` per `server.js:537`. Authentication uses the existing session/JWT path; tenant is resolved server-side via `req.tenant.id` (route's `resolveTenantId` at `finance.v2.js:8-13`); `validateTenantAccess` middleware applies (`finance.v2.js:67`); the `financeOps` module gate applies (`finance.v2.js:69-90`).

| #     | Method | Path               | Returns                                                                                                                                                  | UI consumer                                                                                                                            |
| ----- | ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1.1 | GET    | `/runtime/status`  | `{ tenant_id, runtime: { mode, persistence, provider_sync, governance }, counts: { journal_entries, invoices, approvals, audit_events, adapter_jobs } }` | §7.1 Runtime overview; §7.9 Projection/degraded (`runtime.persistence`); §7.10 Sandbox adapter (`runtime.provider_sync`); §10 banners. |
| 8.1.2 | GET    | `/journal-entries` | `{ status, data: { journal_entries: JournalEntry[] } }`                                                                                                  | §7.5 Journal entries.                                                                                                                  |
| 8.1.3 | GET    | `/ledger`          | `{ status, data: Ledger }` — opaque ledger object                                                                                                        | §7.2 Ledger summary.                                                                                                                   |
| 8.1.4 | GET    | `/profit-loss`     | `{ status, data: ProfitLoss }` — opaque P&L object                                                                                                       | §7.2 Ledger summary (P&L section — optional add to ledger tab in UI-1B, or separate sub-tab if needed).                                |
| 8.1.5 | GET    | `/balance-sheet`   | `{ status, data: BalanceSheet }` — opaque balance-sheet object                                                                                           | §7.2 Ledger summary (balance-sheet section — same caveat as 8.1.4).                                                                    |

The route module also exposes 6 mutating endpoints (`POST /draft-invoices`, `PATCH /draft-invoices/:id`, `POST /journal-drafts`, `POST /simulate/deal-won`, `POST /journal-entries/:id/reverse`, `POST /approvals/:id/approve`). **Slice 1 does not consume them.** They are listed in §13 with their deferral reason.

### 8.2 Known API gaps surfaced by this UI slice

Each gap below is a read-side endpoint UI Slice 1 _cannot satisfy honestly today_. The UI does NOT fabricate frontend data sources; instead it renders an explicit gap state per §7 and §12. These gaps are the recommended backend follow-up slices after UI Slice 1 lands.

| #     | Gap                                                                                 | Affected screen / JTBD  | Natural backing source                                                                                               | Owner (recommended)              |
| ----- | ----------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 8.2.1 | No `GET /draft-invoices` list endpoint.                                             | §7.3 / §5.5             | `financeDomainService.bucket.invoices` (in-memory today; persistent invoices projection later).                      | Backend follow-up slice.         |
| 8.2.2 | No `GET /journal-drafts` list endpoint.                                             | §7.4 / §5.6             | Domain service journal-draft state (currently merged into `listJournalEntries` for posted only).                     | Backend follow-up slice.         |
| 8.2.3 | No `GET /approvals` list endpoint.                                                  | §7.6 / §5.7             | `financeDomainService.listApprovals(tenantId)` (`financeDomainService.js:139`) + future `approval_queue` projection. | Backend follow-up slice.         |
| 8.2.4 | No `GET /adapter-jobs` or `GET /adapter-queue` list endpoint.                       | §7.7 / §5.8             | `adapterQueueProjection` per `projection-contracts.md` §7; backed by `finance.adapter_jobs` once persistent.         | Backend follow-up slice.         |
| 8.2.5 | No `GET /audit-events` or audit-timeline list endpoint.                             | §7.8 / §5.9             | `financeDomainService.listAuditEvents(tenantId)` (`financeDomainService.js:144`) + `auditTimelineProjection`.        | Backend follow-up slice.         |
| 8.2.6 | No per-projection cursor / store-type / lag endpoint.                               | §7.9 / §5.10            | `projectionStore.{memory,pg}.js` cursors per projection per tenant.                                                  | Backend follow-up slice.         |
| 8.2.7 | No registered-adapter list / capability echo endpoint.                              | §7.10 / §5.11           | The adapter registry constructed inside `financeAdapterWorker.js` / `adapterJobProcessor.js`.                        | Backend follow-up slice.         |
| 8.2.8 | No evidence / audit-pack HTTP surface (existing builder has no route).              | §7.11 / §5.13           | `backend/lib/finance/auditEvidenceBuilder.js`.                                                                       | Backend follow-up slice.         |
| 8.2.9 | `/runtime/status.runtime.mode` is currently a hard-coded `'mock_read_only'` string. | §7.1 — accuracy concern | Domain service should publish an authoritative mode value (e.g. `'in_memory_draft_only'` / `'persistent'`).          | Backend follow-up slice (small). |

UI Slice 1 **does not** propose backend changes for any of these — that work lives in a downstream backend slice. UI-1F bundles the gap inventory exactly as written above so the backend slice that closes it has an unambiguous contract.

### 8.3 Endpoints explicitly **not** consumed (mutating)

| Method | Path                           | Why not in Slice 1                                                  |
| ------ | ------------------------------ | ------------------------------------------------------------------- |
| POST   | `/draft-invoices`              | Mutating — out of scope (§1, §13).                                  |
| PATCH  | `/draft-invoices/:id`          | Mutating — out of scope.                                            |
| POST   | `/journal-drafts`              | Mutating — out of scope.                                            |
| POST   | `/simulate/deal-won`           | Mutating — out of scope. Also a simulation, not an operator action. |
| POST   | `/journal-entries/:id/reverse` | Mutating + irreversible affordance — out of scope (§13).            |
| POST   | `/approvals/:id/approve`       | Mutating + governance-sensitive — out of scope (§13).               |

---

## 9. Data freshness and empty-state behavior

### 9.1 Refresh model — manual only in Slice 1

- Every screen has a single "Refresh" button next to its title; click → fires the GET → updates the view.
- **No polling** by default. **No SSE / WebSocket stream.** **No optimistic updates** (read-only; nothing to be optimistic about).
- Rationale: polling adds load, ambiguity ("how stale is the count?"), and a need for cursor / etag / last-modified semantics the backend does not yet publish. Slice 1 is the observability seed, not a real-time dashboard.
- A later slice (deferred) may add a manual auto-refresh interval picker — but only when the backend publishes an authoritative `last_updated_at` per resource. Slice 1 does not approximate this client-side.

### 9.2 Stale-data semantics

- Slice 1 does **not** display an "as-of" timestamp on each screen (the backend does not return one). Instead, each screen shows when the user last clicked Refresh (client-side clock, plain-English: "Last refreshed 3m ago" / "Last refreshed 12:14 PM"). The label is explicitly client-side per §12.5 so users do not confuse client-side last-refresh with server-side last-event-at.
- Inter-tab consistency is not guaranteed: switching from Runtime overview (counts) → Journal entries (list) re-fetches the list; the count and the list may briefly disagree if a backend mutation happened between the two fetches. This is an acceptable read-after-write surprise in a read-only console; mitigation is to expose the per-resource last-updated-at in a later backend slice (§8.2.6 covers part of this).

### 9.3 Empty-state per screen

| Screen                     | Empty-state copy (UI-1B finalizes wording)                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| §7.1 Runtime overview      | All counts zero → "No finance activity yet for this tenant. The runtime is healthy and listening for events." |
| §7.2 Ledger summary        | "Ledger is empty for this tenant."                                                                            |
| §7.3 Draft invoices        | Gap state (§8.2.1) — replaces empty state.                                                                    |
| §7.4 Journal drafts        | Gap state (§8.2.2) — replaces empty state.                                                                    |
| §7.5 Journal entries       | "No journal entries posted for this tenant yet."                                                              |
| §7.6 Approval queue        | Gap state (§8.2.3).                                                                                           |
| §7.7 Adapter queue         | Gap state (§8.2.4).                                                                                           |
| §7.8 Audit timeline        | Gap state (§8.2.5).                                                                                           |
| §7.9 Projection / degraded | Always populated when the route is mounted; degraded banner overrides empty state.                            |
| §7.10 Sandbox adapter      | Always populated (`provider_sync` is always present in the runtime status response).                          |
| §7.11 Evidence placeholder | Gap state (§8.2.8).                                                                                           |

### 9.4 Why gap-states are not error-states

A gap state means "the backend has not yet exposed this read-API; the UI cannot fabricate the data." It is **not** an error in the user's environment or session — it is a known limitation of Slice 1's scope. Rendering it as a non-error informational card prevents:

- Operators from filing support tickets that "the queue is broken when it's just unimplemented."
- Admins from concluding the system is degraded when only the UI is incomplete.
- Implementation engineers from confusing a missing route with a 5xx.

Each gap state carries a `Why this is empty` link pointing to the §8.2 row.

---

## 10. Guardrail banners

Banners are persistent, dismissible-per-session, and rendered above the tab strip on the Finance Operations page so they are visible regardless of which tab is active.

### 10.1 Persistent events fail-closed banner

- **Condition:** always rendered as long as `runtime.persistence === 'in_memory'` from `/runtime/status` (which is the only supported state in Slice 1, by the `finance.v2.js:48` guard).
- **Copy (Slice 1 wording, UI-1B finalizes):** "Persistent events are disabled. The finance runtime is using in-memory state per-process; counts and lists reset on backend restart. Persistent-events activation requires a separate route lift (see backend Phase 4 planning)."
- **Severity:** informational (not red — this is the intended Slice 1 / Phase 3 / Phase 4-planning state). Yellow / amber accent acceptable; not red.
- **Action affordance:** none (no flip button). The banner is purely informative.

### 10.2 Provider writes default-closed banner

- **Condition:** always rendered as long as `runtime.provider_sync === 'disabled'` from `/runtime/status` (the default; flipping to `enabled` is out of scope for Slice 1).
- **Copy:** "Provider writes are disabled by default. The adapter runtime drafts payloads but never sends them to ERPNext / QuickBooks / Xero / NetSuite. Flipping this requires `FINANCE_PROVIDER_WRITES_ENABLED=true` and is controlled by backend gates only."
- **Severity:** informational.
- **Action affordance:** none.

### 10.3 Sandbox-only adapter banner

- **Condition:** always rendered (sandbox-only is a Slice 1 / Phase 3 invariant, structurally enforced in `erpnextSandboxAdapter.js:89-128`).
- **Copy:** "Adapter is sandbox-only. Only ERPNext sandbox `base_url` values are allowed; production endpoints are structurally blocked."
- **Severity:** informational.
- **Action affordance:** none.

### 10.4 Production activation not authorized banner

- **Condition:** always rendered as long as the tenant is not the named production-pilot tenant. **Slice 1 has no signal to detect this** server-side, so the banner is rendered unconditionally for all tenants in Slice 1 — a deliberately conservative default. A later backend slice can return a `production_authorization` field on `/runtime/status` to suppress this banner once a tenant is genuinely production-pilot-authorized (Phase 4-20+).
- **Copy:** "Production activation is not authorized. This tenant is in the staging / pilot-planning posture per Phase 3-14. Any production write attempt would be blocked structurally at the adapter URL guard."
- **Severity:** informational.
- **Action affordance:** none.

### 10.5 Banner ordering and stacking

Top → bottom on the page header: 10.1 → 10.2 → 10.3 → 10.4. They stack rather than collapse; the user sees the full posture in a single glance. Each banner is independently dismissible per-session; dismiss state lives in `sessionStorage` (no server-side persistence, no per-user tracking — Slice 1 does not introduce a new user-preference store).

---

## 11. Authorization, tenant scoping, and module gate behavior in the UI

### 11.1 Process-level (`ENABLE_FINANCE_OPS`) — frontend posture

- The frontend does not directly read `ENABLE_FINANCE_OPS`; that flag is a backend process-level flag (`financeRuntimeGate.js`) and the route is absent (HTTP 404) when it is not `'true'`.
- If the frontend tries to call any `/api/v2/finance/*` route when the surface is not mounted, the API client gets a 404. UI Slice 1's catch path renders the "Route disabled" empty state (§12.1) rather than a generic error.

### 11.2 Per-tenant (`modulesettings.financeOps`) — frontend posture

- The route is mounted but the per-tenant module gate denies enrollment → backend returns HTTP 403 with `{ status: 'error', message: 'Finance Ops is not enabled for this tenant' }` (`finance.v2.js:77-82`).
- Slice 1 catches this and renders the "Tenant not enrolled" empty state (§12.2).
- The nav entry itself (§6.1) **does not appear** in the sidebar when the tenant is not enrolled in `financeOps`. Implementation packet UI-1A wires the module check via the existing `ModuleSettings` entity import already in `Layout.jsx:73`.
- **Open question for UI-1A:** the existing `moduleMapping` table uses display labels (`'Cash Flow Management'`, etc.). The finance module gate uses canonical keys (`'financeOps'` / `'enterpriseFinance'`). UI-1A must reconcile this — see §6.1 open question.

### 11.3 Role-based access — backend contract vs. Slice 1 frontend posture

**Backend contract (today, factual):** the Finance v2 route module enforces exactly two access checks — `validateTenantAccess` (authenticated tenant match) and the per-tenant `financeOps` module gate (`backend/routes/finance.v2.js:67-85`). There is **no backend role check.** Any authenticated user of a tenant enrolled in `financeOps` can hit `GET /api/v2/finance/*` and get a 200; admins, regular users, and AI agents are all on the same footing at the route boundary.

**Slice 1 frontend posture:** the access model adopted at the route boundary is therefore "authenticated tenant + `financeOps` enabled" — the same as the backend. The nav entry and the `/FinanceOps` page are surfaced to any user of an enrolled tenant in Slice 1.

**Role-as-product-policy (deferred to a later slice, NOT Slice 1):** restricting the nav entry / page to `admin` / `superadmin` is a _product-policy_ question (who should see operational finance state?), not a security boundary. It is a defensible choice — finance state is operationally sensitive and the personas in §4 are admin / operator / engineer — but it is a **new** rule introduced by the frontend, not a reflection of any backend enforcement that exists today. Slice 1 deliberately does NOT adopt this restriction so that:

1. The Slice 1 access model matches the real backend contract honestly (no stricter-than-server frontend rule that could hide a legitimate read for an enrolled tenant user).
2. The product/UX decision about who should see operational finance state is made deliberately in a later slice — with explicit acceptance criteria, a corresponding backend role check (so the rule is enforced at both layers, not just hidden in the UI), and a migration path for tenants whose finance leads are not platform admins.

A later slice may add the role gate; if it does, it must add the corresponding backend role check at the same time so the UI never enforces a rule the API would otherwise allow.

### 11.4 Tenant impersonation — frontend posture

- The existing `ImpersonationBanner` (`src/components/shared/ImpersonationBanner`) renders above the page header per the current pattern. Finance Operations is no different from other pages in this respect.
- The banner makes the "operator viewing customer tenant" persona (§4.2) visually unambiguous.

### 11.5 Wrong-tenant detection — frontend posture

- All Finance v2 requests resolve `tenant_id` server-side from `req.tenant.id` (`finance.v2.js:8-13`); body-supplied / query-supplied tenant IDs are ignored per the M-5 hardening note.
- The frontend never sends `tenant_id` in the body of these GETs (the routes don't accept one). Tenant identity is carried by the session, not the URL — Slice 1 does not introduce `/FinanceOps/:tenant_id`.
- **Wrong-tenant safety net:** if the user switches tenants mid-session (existing tenant-switch flow), the API client must invalidate the per-screen cached data. UI-1A wires this via the existing tenant-context cache-bust pattern; Slice 1 design freezes the rule, not the implementation.

---

## 12. Error states

Each error state below is rendered as an informational / warning card (not a full-page crash, not a silent failure). Generic 500s are last-resort.

### 12.1 Route disabled (process-level gate off)

- **Trigger:** all `/api/v2/finance/*` calls return HTTP 404 (route absent).
- **Render:** "Finance Operations is not enabled in this environment. Contact your deploy owner." No retry button (retry doesn't help — the flag is process-level).
- **Logging:** client-side console warning; no automatic Sentry / log forwarding in Slice 1 (existing logger path covers this).

### 12.2 Tenant not enrolled (per-tenant module gate)

- **Trigger:** HTTP 403 with `message: 'Finance Ops is not enabled for this tenant'`.
- **Render:** "Finance Operations is not enabled for this tenant. Contact your administrator to enable it in Module Settings."
- **No retry button.** (Retry doesn't help — the row must change.)

### 12.3 Wrong tenant / impersonation mismatch

- **Trigger:** HTTP 4xx with a tenant-mismatch shape from `validateTenantAccess` middleware.
- **Render:** "Your session does not have access to this tenant. Please sign in to the correct tenant or contact support."
- **Logging:** treated as a security signal (existing path) — no Slice 1 changes.

### 12.4 Degraded projection runtime

- **Trigger:** `/runtime/status` returns a `runtime` block where `persistence === 'in_memory'` — this is the _intended_ posture in Slice 1, not an error state, so it is surfaced as the §10.1 banner rather than an error.
- A _true_ degraded state (e.g. the projection runner exists but raised a `ProjectionRuntimeError`) is not currently exposed via `/runtime/status` — §8.2.6 covers the gap. Slice 1 cannot render a true degraded state today; the gap card explains this.

### 12.5 Worker disabled

- **Trigger:** there is no direct frontend signal for worker enablement today (workers heartbeat to a file, not an HTTP endpoint — per `worker-service-topology.md` and the `Phase 3-4 §5.1` heartbeat-on-disk pattern).
- **Render:** Slice 1 cannot detect worker enablement honestly from the frontend. The Projection / Degraded tab notes this as a gap (referencing §8.2.6) rather than guessing.

### 12.6 Adapter unavailable

- **Trigger:** no direct frontend signal in Slice 1 (no list-of-registered-adapters endpoint — §8.2.7).
- **Render:** the Sandbox adapter tab notes this as a gap, not an error.

### 12.7 Provider writes disabled

- **Not an error.** Provider writes being disabled is the _intended default_ and is rendered as the §10.2 banner, not an error.

### 12.8 Network / 5xx

- **Trigger:** request fails with 5xx or network error.
- **Render:** "Could not load this view. The backend may be restarting or unreachable. Retry?" + manual Retry button.
- **Auto-retry:** none in Slice 1. (Existing API client circuit-breaker at `src/api/fallbackFunctions.js` is not bypassed; Slice 1 honors it.)

### 12.9 Unauthorized (401)

- **Trigger:** session expired.
- **Render:** existing app-wide 401 handler kicks in (redirect to login). Slice 1 does not introduce a new 401 path.

---

## 13. Explicitly deferred mutating actions

This list is exhaustive. Slice 1 does NOT expose any of these. Each item names the affordance, the backend path that would back it (if it exists), and the slice that would deliver it.

| Affordance                              | Backend path                                                       | Deferred to                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Approve a pending approval              | `POST /api/v2/finance/approvals/:id/approve`                       | A separate later UI slice with governance-decision review affordance (out of Slice 1).                                                           |
| Reject / decline an approval            | (no endpoint today)                                                | Requires backend endpoint first; out of Slice 1.                                                                                                 |
| Claim an approval                       | (no endpoint today)                                                | Requires backend endpoint first; out of Slice 1.                                                                                                 |
| Reverse a journal entry                 | `POST /api/v2/finance/journal-entries/:id/reverse`                 | Out of Slice 1. The endpoint is irreversible-by-design; UI must add review affordance and is deferred to a later slice with stronger guardrails. |
| Post a journal draft                    | (no endpoint today — domain service path is internal)              | Out of Slice 1.                                                                                                                                  |
| Create a draft invoice                  | `POST /api/v2/finance/draft-invoices`                              | Out of Slice 1.                                                                                                                                  |
| Edit a draft invoice                    | `PATCH /api/v2/finance/draft-invoices/:id`                         | Out of Slice 1.                                                                                                                                  |
| Replay events for a tenant              | (no endpoint today)                                                | Backend slice required first; out of Slice 1.                                                                                                    |
| Replay a single projection              | (no endpoint today)                                                | Backend slice required first; out of Slice 1.                                                                                                    |
| Retry a failed adapter job              | (no endpoint today — retry path is internal)                       | Backend slice required first; out of Slice 1.                                                                                                    |
| Cancel a queued adapter job             | (no endpoint today)                                                | Backend slice required first; out of Slice 1.                                                                                                    |
| Trigger a provider sync                 | (no endpoint today; worker-driven)                                 | Slice 1 will never expose this — provider sync is worker-loop-driven, not request-driven. Out of every UI slice.                                 |
| Activate persistent events for a tenant | `ENABLE_FINANCE_PERSISTENT_EVENTS` env flag                        | Out of every UI slice — env flag is process-level, not per-tenant, and must be a deploy-time change reviewed via the route lift slice.           |
| Enable provider writes                  | `FINANCE_PROVIDER_WRITES_ENABLED` env flag                         | Out of every UI slice for the same reason as persistent events.                                                                                  |
| Add / rotate ERPNext credentials        | (`tenant_integrations.api_credentials` row)                        | Out of Slice 1; will live in Integrations settings, not Finance Operations.                                                                      |
| Generate an audit evidence pack         | (no HTTP endpoint today — runtime only)                            | Backend slice required first; out of Slice 1.                                                                                                    |
| Run replay drill                        | (no `backend/scripts/finance-replay-drill.js` per Phase 3-13 §8.4) | Out of Slice 1; deferred separately.                                                                                                             |
| Enable `financeOps` for a tenant        | `modulesettings` row                                               | Out of Finance Operations page entirely — lives in Tenant module settings (existing UI surface).                                                 |
| Promote a tenant to production pilot    | (no automated path — Phase 4-20 is a decision packet)              | Out of every UI slice.                                                                                                                           |

---

## 14. Parallel implementation packet split after design approval

After Codex review of this design freeze, UI Slice 1 splits into **six** parallel-safe implementation packets. The split mirrors the Slice 2 cadence (2A–2E for backend) so the same review / commit / Slack-coordination pattern applies.

| Packet | Scope                                                                                                                                                                                                                                                                                                                                                              | Files (allowed)                                                                                                                                                     | Depends on               | Parallel-safe with                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| UI-1A  | Shell + nav wiring. `src/pages/FinanceOps.jsx` skeleton, tab routing, `RouteGuard` integration, nav entry in `src/utils/navigationConfig.js`, `moduleMapping` reconciliation (§11.2), route binding in `src/pages/index.jsx`, base API client `src/api/finance.js` (read-only methods only — the 5 GETs in §8.1). No screen content yet (each tab renders a stub). | `src/pages/FinanceOps.jsx`, `src/utils/navigationConfig.js`, `src/pages/index.jsx`, `src/api/finance.js`, `src/pages/Layout.jsx` (nav icon map only)                | Codex approval of §1–§13 | UI-1B, UI-1C, UI-1D, UI-1E, UI-1F          |
| UI-1B  | Runtime overview + Ledger / P&L / Balance sheet + Journal entries (the four screens with real existing APIs). All read-only.                                                                                                                                                                                                                                       | `src/components/finance/RuntimeOverview.jsx`, `src/components/finance/LedgerSummary.jsx`, `src/components/finance/JournalEntriesList.jsx`, tests under `__tests__/` | UI-1A                    | UI-1C, UI-1D, UI-1E, UI-1F (data-disjoint) |
| UI-1C  | Persistent guardrail banners (§10.1 / §10.2 / §10.3 / §10.4) reading `/runtime/status`. Per-session dismiss state.                                                                                                                                                                                                                                                 | `src/components/finance/GuardrailBanners.jsx`, tests                                                                                                                | UI-1A                    | UI-1B, UI-1D, UI-1E, UI-1F                 |
| UI-1D  | Gap-state screens (§7.3 / §7.4 / §7.6 / §7.7 / §7.8). Each renders the explicit gap card per §7 + §8.2. No API calls.                                                                                                                                                                                                                                              | `src/components/finance/GapStateCard.jsx` + per-tab wrapper components, tests                                                                                       | UI-1A                    | UI-1B, UI-1C, UI-1E, UI-1F                 |
| UI-1E  | Projection/degraded (§7.9) + Sandbox adapter (§7.10) + Evidence placeholder (§7.11). All read from `/runtime/status` only; the rest is gap-flagged.                                                                                                                                                                                                                | `src/components/finance/ProjectionStatus.jsx`, `src/components/finance/SandboxAdapterStatus.jsx`, `src/components/finance/EvidencePlaceholder.jsx`, tests           | UI-1A                    | UI-1B, UI-1C, UI-1D, UI-1F                 |
| UI-1F  | Error states (§12), API client error handling, route-disabled / tenant-not-enrolled / wrong-tenant / network / 5xx paths. Also publishes the §8.2 gap inventory as an in-repo reference (e.g. `docs/architecture/finance/finance-ui-slice-1-api-gaps.md`) that the backend follow-up slice consumes verbatim.                                                      | `src/api/finance.js` error-handling layer, `src/components/finance/ErrorStates.jsx`, `docs/architecture/finance/finance-ui-slice-1-api-gaps.md`, tests              | UI-1A                    | UI-1B, UI-1C, UI-1D, UI-1E                 |

**Cross-packet contracts (frozen here so packets don't re-decide):**

- All screen components consume the shape defined by `src/api/finance.js` (delivered in UI-1A). No screen calls `fetch` directly.
- All screens render a `<RuntimeStatusContext>` value supplied at the page level (UI-1A) so they share a single `/runtime/status` response per page mount.
- All gap states reuse the `<GapStateCard>` component (UI-1D) — no per-tab gap card duplication.
- All error states reuse `<ErrorStates>` (UI-1F).
- All packets respect §1 hard constraints: no mutating endpoint imports, no test code calling mutating endpoints, no nav entry pointing at write affordances.

**Codex review for each packet** mirrors the backend Slice 2 cadence:

- Does it stay read-only and avoid accidental mutation paths?
- Does it accurately map to the existing Finance v2 endpoints?
- Does it mark missing APIs honestly via the §8.2 gap inventory?
- Does it expose the right guardrails (§10)?
- Does it preserve tenant / module / auth boundaries (§11)?
- Does it avoid hiding degraded / projection / worker / adapter failure states (§7.9 / §12)?
- Does it distinguish in-memory route runtime from future projection-backed reads (§7.9)?
- Does it avoid provider-write or production activation drift (§10.2 / §10.4)?

---

## 15. Hard constraints (re-stated for the implementation packets)

1. **No UI code shipped by this task.** This document is design only.
2. **No mutating controls** in any Slice 1 packet. Approve / reject / reverse / replay / retry / cancel / sync / activate are all out.
3. **No new backend endpoint** added or required for Slice 1 to compile and run. Slice 1 consumes only the 5 existing GETs.
4. **No `ENABLE_FINANCE_PERSISTENT_EVENTS` activation** — the UI observes the fail-closed state but never flips it.
5. **No provider writes** — the UI observes the `provider_sync === 'disabled'` state but never flips it.
6. **No production action** — the UI observes the "production activation not authorized" posture and renders the §10.4 banner unconditionally in Slice 1.
7. **No fabricated frontend data sources.** Where a backend GET does not exist, the UI renders an explicit gap state, not made-up data.
8. **No bypass of `validateTenantAccess` or the `financeOps` module gate.** The frontend handles 403 (§12.2) without trying to re-route or impersonate.

---

## 16. Acceptance for this design freeze packet

This is a documentation-only deliverable. Acceptance criteria:

1. The document exists at `docs/architecture/finance/finance-ui-slice-1-read-only-console-design.md`.
2. All 11 required sections from the directive are present and addressed:
   - User personas (§4)
   - Primary jobs-to-be-done (§5)
   - Information architecture / navigation proposal (§6)
   - Screen inventory for read-only console (§7)
   - API contract mapping to existing Finance v2 endpoints and known gaps (§8)
   - Data freshness / empty-state behavior (§9)
   - Guardrail banners (§10)
   - Authorization / tenant / module-gate behavior in the UI (§11)
   - Error states (§12)
   - Explicitly deferred mutating actions (§13)
   - Parallel implementation packet split after design approval (§14)
3. All 10 read-only screens from the directive are designed (§7.1–§7.10) plus the evidence placeholder (§7.11).
4. Every API claim is grounded in a real route in `backend/routes/finance.v2.js` or explicitly flagged as a gap in §8.2.
5. No mutating endpoint appears in the consumer list of any Slice 1 packet (§14).
6. The fail-closed `ENABLE_FINANCE_PERSISTENT_EVENTS` posture and default-closed `FINANCE_PROVIDER_WRITES_ENABLED` posture are preserved (§1, §10, §15).
7. The parallel implementation packet split (UI-1A…UI-1F) is parallel-safe — each packet's allowed-files set is disjoint from the others (§14).
8. `CHANGELOG.md` records this packet under `[Unreleased] / Added`.
9. No backend code, frontend code, environment, migration, or external system was touched by this task.

---

## 17. Sign-off

UI Slice 1 design is frozen for implementation. Backend Phase 4-0 planning may proceed in parallel.

- **All hard constraints (§15) confirmed.**
- **Persistent-events route guard at `finance.v2.js:48` preserved.**
- **Default-closed `FINANCE_PROVIDER_WRITES_ENABLED` posture preserved.**
- **Sandbox-only ERPNext URL guard at `erpnextSandboxAdapter.js:89-128` preserved.**
- **No production action.**

**Next active items (after Codex review of this packet):**

- UI-1A — Shell + nav wiring (depends on this packet's approval).
- Backend Phase 4-0 — Production pilot design freeze (per `phase-4-production-pilot-go-no-go.md` §9; independent of UI-1A).

The two tracks proceed in parallel; UI Slice 1 does not block Phase 4-0 and Phase 4-0 does not block UI-1A.
