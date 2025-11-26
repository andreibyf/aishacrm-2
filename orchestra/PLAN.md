# AiSHA CRM – Orchestra Plan (Dashboard Bugfixes)

## Current Goal

Type: bugfix  
Title: Stabilize Dashboard loading and performance

Description:  
The Dashboard must reliably load for authenticated users with a valid tenant and display stats in a timely manner. Current issues include:
- Dashboard failing to load due to backend “Authentication required” errors.
- Slow loading of dashboard cards and stats.

This phase is strictly bugfix work. No new Dashboard features, layout redesign, or metric expansions.

---

## Execution Rules (Critical)

Mode: BUGFIX ONLY

Do NOT:
- Redesign auth or tenant architecture.
- Change routing structure globally.
- Add new dashboard features or widgets.
- Introduce new dependencies for state management.

Allowed only when strictly necessary:
- Minimal changes to backend auth checks for dashboard-related endpoints.
- Minimal changes to frontend guards to handle auth failures more gracefully.
- Performance optimizations focused on dashboard APIs and their immediate consumers.

Every change must:
- Be small and justified.
- Include clear explanation of root cause.
- Include tests or at least a reproducible manual verification path.

---

## Active Tasks

# AiSHA CRM – Orchestra Plan (Platform Health & MCP/Braid Integrations)

## Current Goal

Type: bugfix  
Title: Stabilize core API reliability and MCP/Braid integrations

Description:  
Focus on fixing critical platform health issues detected in Settings/health tests:
- Core tenant/employee/leads APIs failing (fetch errors, auth errors).
- Braid MCP server and n8n integrations unreachable.
- Elevated API error rate (~10%).
- Health issue reporter behaving unreliably.
- Tenant resolve cache currently ineffective.

No new features in this phase. Only targeted reliability, auth, connectivity, and performance fixes.

---

## Execution Rules (Critical)

Mode: BUGFIX ONLY

Do NOT:
- Redesign entire auth or tenant architecture.
- Introduce new external services or queues without necessity.
- Add new product features or expand API surface.

Allowed only if strictly required:
- Minimal changes to auth middleware or token handling.
- Minimal wiring fixes between services (hostnames, ports, TLS).
- Adding logging, metrics, or small caching where needed to stabilize behavior.

Every change must:
- Be as small and localized as possible.
- Be tied to a specific BUG ID.
- Include a verifiable test or monitored metric that confirms improvement.

---

## Active Tasks (Priority Order)

### 1) BUG-API-001A – Diagnose tenant/employee fetch failures

Type: bugfix  
Status: Complete ✅  
Area: Core API – tenants and employees

Goal:  
Find out why `GET /api/tenants/<tenant-id>` and `GET /api/employees?tenant_id=<tenant-id>` are failing with `TypeError: fetch failed` for user `abyfield@4vdataconsulting.com`.

Steps:
1. Reproduce the failure path:
   - Same tenant ID: `a11dfb63-4b18-4eb8-872e-747af2e37c46`.
   - Same or similar user context.
2. Inspect:
   - Frontend/API caller for these endpoints.
   - Backend route handlers and any upstream services they depend on.
   - Network/proxy/TLS configuration between caller and backend.
3. Determine exact nature of “fetch failed”:
   - DNS/host resolution?
   - TLS error?
   - Connection reset/refused?
   - Misconfigured base URL?

Scope:
- Diagnostics only (logging, tracing).
- No behavior changes yet.

Acceptance:
- Clear root cause explanation for the fetch failures.
- List of exact files/services to be changed in the fix phase BUG-API-001B.

---

### 2) BUG-API-001B – Fix tenant/employee fetch failures

Type: bugfix  
Status: Complete ✅  
Area: Core API – tenants and employees
Resolution: v1.0.74 (APP_BUILD_VERSION runtime injection via env-config.js)

Goal:  
Implement minimal changes so that tenant and employee endpoints no longer produce `TypeError: fetch failed`, and instead behave like normal authenticated/unauthenticated HTTP endpoints.

Steps:
1. Apply connectivity/config fixes identified in BUG-API-001A:
   - Correct base URL, host, or protocol if required.
   - Fix any reverse proxy or container networking issues.
2. Ensure:
   - Valid requests succeed.
   - Invalid/unauthorized requests return explicit HTTP errors (401/403/404), not fetch-level failures.
3. Remove any temporary debug-only logging not needed for normal operation.

Scope:
- Only relevant backend/API config and caller logic for tenants/employees.
- No broad auth system redesign.

Acceptance:
- No `TypeError: fetch failed` for the monitored endpoints under normal operation.
- Health checks for tenant/employee endpoints pass consistently.

---

### 3) BUG-API-002 – Fix false "Authentication required" on leads endpoint

Type: bugfix  
Status: Resolved ✅ (No longer occurring)
Area: Leads API / Auth

Goal:  
Ensure that `GET /api/leads?tenant_id=<tenant-id>` behaves consistently with other authenticated endpoints and does not return `Authentication required` for valid sessions.

Resolution:
- Authentication issue resolved as part of BUG-API-001B fixes
- New issue discovered: generateUniqueId console warnings in production
- See BUG-API-003 for follow-up

Steps:
1. Compare auth middleware for:
   - `/api/leads`
   - `/api/tenants`
   - `/api/employees`
2. Check:
   - How tokens/cookies are passed from frontend to leads endpoint.
   - Whether tenant-based permission checks are aligned for leads.
3. Apply minimal fix:
   - Align auth handling with the working endpoints.
   - Do NOT weaken security; only correct false negative auth decisions.

Scope:
- Leads endpoint handler(s).
- Any specific auth middleware/guards applied to leads.

Acceptance:
- Leads endpoint returns data for authenticated, properly-permitted users.
- Unauthorized access still returns `Authentication required` or appropriate code.
- Monitoring no longer shows auth warnings for valid sessions.

---

### 4) BUG-API-003 – Add backend endpoint for generateUniqueId

Type: bugfix  
Status: Complete ✅
Resolution: v1.0.75 (backend endpoint + frontend integration)
Area: Leads/Contacts/Accounts - Unique ID generation

Goal:
Stop console warnings in production: "Function 'generateUniqueId' not available. Use backend routes."

Resolution:
- Created POST /api/utils/generate-unique-id endpoint
- Generates format: L-YYYYMMDD-RANDOM (e.g., L-20251126-6BD0C6)
- Updated src/api/functions.js to call backend in production
- Supports Lead, Contact, Account, Opportunity entity types
- No console warnings when creating entities

Files Changed:
- backend/routes/utils.js: Added generate-unique-id endpoint
- src/api/functions.js: Added production mode handler for generateUniqueId
- orchestra/PLAN.md: Documented issue and resolution

Testing:
- Backend endpoint verified with curl
- Frontend build successful
- Local Docker containers tested
- Deployed to production in v1.0.75

---

### 5) BUG-MCP-001 – Restore MCP/Braid and n8n reachability

Type: bugfix  
Status: Pending (P2, after P1 APIs are stable or in parallel if isolated)  
Area: Integrations – Braid MCP / n8n

Goal:  
Make `mcp-node`, `n8n-proxy`, and `n8n` reachable again and restore MCP test suite to a passing or mostly-passing state.

Steps:
1. Check container/service status:
   - Are MCP and n8n containers running?
   - Are the ports and hostnames matching the URLs used in health checks?
2. Validate connectivity:
   - From the monitoring environment to MCP/n8n.
   - Check TLS/SSL if HTTPS is involved.
3. Fix configuration:
   - Correct environment variables, base URLs, ports.
   - Ensure any required auth between services is configured.

Scope:
- Only service wiring/config for MCP/n8n and their health endpoints.

Acceptance:
- `mcp-node`, `n8n-proxy`, and `n8n` no longer report “Not reachable”.
- MCP health suite starts passing core tests (Braid Health, CRM endpoints, etc.).

---

### 6) BUG-INT-001 – Stabilize GitHub health issue reporter

Type: bugfix  
Status: Pending (P2)  
Area: Integrations – GitHub health reporting

Goal:  
Stop flapping/repeated attempts for `POST /api/github-issues/create-health-issue` and make health issue creation idempotent and reliable.

Steps:
1. Inspect the logic that triggers `create-health-issue`:
   - When is it called?
   - What conditions trigger multiple calls at the same timestamp?
2. Implement:
   - Deduplication or idempotency for a given incident.
   - Backoff/retry logic where appropriate.
3. Log:
   - Success vs failure of health issue creation.
   - Reason when suppressed (duplicate).

Scope:
- Only the metric/health issue reporter and its call to GitHub.

Acceptance:
- No repeated bursts of `create-health-issue` calls for the same event.
- Failures are logged clearly and do not cause uncontrolled retry storms.

---

### 7) BUG-CACHE-001 – Make tenant resolve cache actually useful

Type: bugfix  
Status: Pending (P3 – lower priority)  
Area: Performance – Tenant resolution cache

Goal:  
Improve tenant resolution cache effectiveness so that repeated tenant lookups benefit from caching without breaking correctness.

Steps:
1. Review current cache key design and where it is used.
2. Confirm:
   - That tenant resolution is called with repeatable keys.
   - Cache TTL (300000 ms) is appropriate.
3. Adjust:
   - Keying logic if needed.
   - Where cache is checked vs bypassed.

Scope:
- Only tenant resolution + cache logic.

Acceptance:
- `tenant_resolve_cache_hit_ratio` moves above 0 under normal usage.
- No incorrect tenant resolution due to cache.

---

## Testing & Validation Requirements

Manual:
- Re-run Settings / health tests for:
  - Tenants, employees, and leads endpoints.
  - MCP/Braid and n8n integrations.
  - GitHub health reporter.
- Confirm no `fetch failed` or bogus `Authentication required` where they shouldn’t appear.

Automated / Monitoring:
- API error rate drops significantly from ~10%.
- MCP test suite moves from 0/12 to majority passing (target: all green).
- GitHub health reporter calls are well-behaved and deduplicated.
- Tenant cache metrics show non-zero hit ratio under realistic load.

---

## Status

- BUG-API-001A: Complete ✅ (v1.0.66-74 - diagnosed runtime env issues)
- BUG-API-001B: Complete ✅ (v1.0.74 - APP_BUILD_VERSION runtime injection)
- BUG-API-002: Resolved ✅ (auth issue resolved with 001B fixes)
- BUG-API-003: Complete ✅ (v1.0.75 - generateUniqueId backend endpoint)
- BUG-MCP-001: Pending (P2)
- BUG-INT-001: Pending (P2)
- BUG-CACHE-001: Pending (P3)

---

## Usage Instruction for AI Tools

When using Claude, Copilot, or orchestrator:

1. Read `.github/copilot-instructions.md`.  
2. Read `orchestra/ARCHITECTURE.md` and `orchestra/CONVENTIONS.md`.  
3. Read this PLAN and select the highest-priority Active task:

   - Start with **BUG-API-001A (diagnostic)**.

4. For the selected task:
   - State the task ID and title.
   - List the files and services you will inspect.
   - Wait for human approval before making code/config changes.
   - Keep changes minimal and tied to the task’s Acceptance criteria.

---


## Completed Tasks

### BUG-DASH-001A – Diagnose Dashboard auth failure (root cause)

Type: bugfix  
Status: Completed (P1)  
Area: Dashboard / Backend API / Auth

Goal:  
Determine why the Dashboard fails to load for an authenticated user and why calls to `/api/modulesettings?tenant_id=<tenant>` return `{"status":"error","message":"Authentication required"}` despite valid Supabase user and tenant context.

Steps:
1. Reproduce:
   - Log in with an affected user.
   - Allow tenant auto-selection to occur.
   - Navigate to the Dashboard and observe console and network logs.
2. Inspect frontend:
   - Where module settings and dashboard data are fetched (e.g. `src/api/entities.js`, dashboard data hooks/components).
   - Route guards and `hasPageAccess` logic for the dashboard route.
3. Inspect backend:
   - Endpoint that serves module settings and dashboard-related data (e.g. `backend/routes/modulesettings.js` or equivalent).
   - Auth middleware / token extraction used for these endpoints.
4. Identify mismatch:
   - Is the auth header or cookie missing?
   - Is the backend expecting a different token than what the frontend sends?
   - Is tenant scoping causing an auth failure?

Scope:
- Diagnostic only.
- You may add temporary logging.
- Do not implement fixes yet.

Acceptance:
- Clear, documented root cause for the “Authentication required” response for dashboard module settings.
- List of exact files to be modified in the fix phase (BUG-DASH-001B).

---

### BUG-DASH-001B – Fix Dashboard auth failure and restore load

Type: bugfix  
Status: Completed (P1)  
Area: Dashboard / Backend API / Auth

Dependencies:
- BUG-DASH-001A (root cause identified).

Goal:  
Implement the smallest viable change that allows a properly authenticated user, with a valid tenant, to successfully load Dashboard module settings and render the Dashboard.

Steps:
1. Fix the auth mismatch:
   - Ensure the frontend sends the correct auth token/cookie on dashboard/module settings requests.
   - Ensure the backend validates the same token/cookie used for other authenticated endpoints.
2. Update guards (if needed):
   - If the dashboard route guard treats “Authentication required” as a fatal state, adjust it to:
     - Retry, OR
     - Redirect appropriately, OR
     - Show a clear error screen rather than silently failing.
3. Remove any temporary logging added during diagnosis.

Scope:
- Only the backend auth handling for dashboard/module settings.
- Only the frontend request and guard logic that interacts with those endpoints.
- No broader auth system redesign.

Acceptance:
- Authenticated user with valid tenant loads Dashboard successfully.
- Module settings calls no longer return “Authentication required” for valid sessions.
- No regression in other authenticated routes.

Verification:
- Frontend `callBackendAPI` attaches Supabase bearer + credentials; backend auth middleware supports publishable key fallback.
- Local, dev Docker, and staging verified; production tag `v1.0.66` published.

---

### BUG-DASH-002 – Improve Dashboard stats loading performance

Type: bugfix  
Status: Completed (P2)  
Area: Dashboard / Backend API / Performance

Goal:  
Reduce the time it takes for dashboard cards and stats to appear after page load, without changing the meaning of any metrics.

Steps:
1. Measure current behavior:
   - Identify which API endpoints are called for dashboard stats.
   - Determine whether calls are sequential or redundant.
2. Backend optimizations:
   - Consolidate multiple small calls into fewer, aggregated calls where safe.
   - Optimize database queries (indexes, joins, filters) for dashboard endpoints.
   - Consider adding short-lived caching (e.g. Redis) for frequently-read stats, ensuring tenant isolation.
3. Frontend optimizations:
   - Avoid duplicate requests on rerender.
   - Ensure components subscribe to shared data where appropriate instead of re-fetching.

Scope:
- Backend: only dashboard-related endpoints and queries.
- Frontend: only dashboard data-fetching components/hooks.
- No changes to metric definitions or visibility rules.

Acceptance:
- Noticeable reduction in time-to-display for dashboard cards/statistics.
- No incorrect or cross-tenant data shown.
- No increased error rates or auth issues from optimization changes.

Verification:
- Backend: `/api/reports/dashboard-bundle` aggregated response with cache (≈60s TTL), exact small-count fallback.
- Frontend: bundle-first render; background hydration; animations disabled; widgets memoized.
- DB: indexes applied via `077_dashboard_indexes.sql`; usage confirmed with EXPLAIN ANALYZE.

---

## Testing & Validation Requirements

Manual:
- For BUG-DASH-001:
  - Log in as an affected user, select tenant, open Dashboard.
  - Confirm the Dashboard actually loads and does not get stuck due to “Authentication required”.
- For BUG-DASH-002:
  - Observe dashboard load time before and after changes in the same environment.
  - Confirm metrics match expected values.

Automated:
- Add/extend tests for:
  - Auth checks on dashboard/module settings endpoints.
  - Basic dashboard data retrieval flows.
- Performance tests where feasible (e.g. request counts, execution time metrics).

Environment:
- Validate both:
  - Local dev
  - The deployed environment where the problem was observed (Docker / cloud).

---

## Status

- BUG-DASH-001A: **Completed** (P1, diagnostic) – Root cause identified: `callBackendAPI` lacked auth token attachment; `requireAdminRole` middleware rejected requests.
- BUG-DASH-001B: **Completed** (P1, fix) – Frontend attaches bearer + credentials; backend auth supports publishable key. Verified locally and staged; released under `v1.0.66`.
- BUG-DASH-002: **Completed** (P2, performance) – Bundle endpoint + cache, frontend background hydration, INP improvements, and DB indexes applied.

---

## Usage Instruction for AI Tools

When using Claude, Copilot, or any AI assistant:

1. Read `.github/copilot-instructions.md` and comply fully.  
2. Read `orchestra/ARCHITECTURE.md` and `orchestra/CONVENTIONS.md`.  
3. Read this PLAN and identify the highest priority task:

   - Start with **BUG-DASH-001A (diagnostic)**.
   - Do not work on BUG-DASH-001B until diagnosis is clear.
   - Do not work on BUG-DASH-002 until BUG-DASH-001A/B are completed or explicitly paused.

4. For the selected task:
   - State the task ID and title.
   - List the files you plan to touch.
   - Wait for human approval before changing code.
   - Keep diffs minimal and within scope.
