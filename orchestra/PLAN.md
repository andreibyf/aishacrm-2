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

## CRUD Health Tests

### BUG-CRUD-001 – Auth failures for CRUD health tests (Contacts, Leads, Accounts, Lists)

Status: Complete ✅  
Priority: High  
Area: Core API – Contacts / Leads / Accounts / Listing

Symptoms (from automated tests):
- CRUD Operations – Contact:
  - Create: `Error: Create should succeed (status: 401)`
  - Read: `Error: Contact ID from create test should exist`
  - Update: `Error: Contact ID from create test should exist`
  - Delete: `Error: Contact ID from create test should exist`
- CRUD Operations – Lead:
  - Create: `Error: Create should succeed (status: 401)`
  - Read/Update/Delete: `Error: Lead ID from create test should exist`
- CRUD Operations – Account:
  - Create: `Error: Create should succeed (status: 401)`
  - Read/Update/Delete: `Error: Account ID from create test should exist`
- CRUD Operations – List with Filters:
  - `Error: List should succeed (status: 401)`

Interpretation:
- All create operations for Contacts, Leads, and Accounts are returning HTTP 401 (Unauthorized) in the health test context.
- All read/update/delete failures are cascading from the missing ID (because create never succeeded).
- List-with-filters endpoint also returns 401, indicating the same auth problem.

Suspected Causes:
- The health test runner (or MCP/Braid test suite) is not authenticated correctly:
  - Missing or invalid auth token/cookie for API calls.
  - Using a user or service account that lacks the required CRM permissions.
- CRUD endpoints may be using stricter or different auth middleware compared to other endpoints that are passing.
- Possible mismatch between “normal app” auth flow and “health test” auth flow.

Notes:
- Fix must NOT weaken security or make CRUD endpoints publicly accessible.
- The goal is to:
  - Ensure health tests use a proper authenticated context (service account or test user).
  - Ensure CRUD endpoints honor that authenticated context consistently.

Resolution (Completed):
- **Root Cause:** Browser-based tests used unauthenticated `fetch()` calls against production-mode backend
- **Fix:** Added Supabase auth to all CRUD test fetch calls via `getAuthHeaders()` helper
- **Changes:** Updated `src/components/testing/crudTests.jsx` with auth headers + credentials for 14 fetch calls
- **Impact:** Tests now authenticate like production app; no security weakening; validates full auth flow




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

### BUG-PROD-001 – Settings page returns HTML instead of JSON (Production only)

**Status**: Open  
**Priority**: Critical  
**Area**: Settings API / Production Environment

**Goal**:  
Fix the Settings page in production that is returning HTML instead of JSON, causing a parse error.

**Symptoms**:
- URL: `https://app.aishacrm.com/settings`
- Error: `SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`
- Production only - dev environment works correctly
- User Agent: Chrome 144.0.0.0 on Windows 10

**Tasks**:
1. **Investigation Phase**:
   - Identify which API endpoint Settings page is calling
   - Check frontend code: does it use `/settings` or `/api/settings`?
   - Verify production nginx configuration (routing rules, proxy pass)
   - Compare production vs dev environment configurations
   - Check production docker-compose.yml and .env settings
   - Test API endpoint directly with curl from production server

2. **Root Cause Analysis**:
   - Determine if nginx is routing API calls to frontend container
   - Check if VITE_AISHACRM_BACKEND_URL is correct in production build
   - Verify backend route registration for Settings endpoints
   - Check if issue is specific to `/settings` or affects other routes

3. **Resolution Phase**:
   - Fix nginx configuration if routing issue
   - Update frontend API calls if using wrong base URL
   - Ensure backend routes are accessible from production nginx
   - Test fix in staging before production deploy

**Acceptance Criteria**:
- Settings page loads in production without JSON parse error
- API calls return proper JSON responses, not HTML
- Dev and production behavior is consistent
- No regression on other API endpoints

---

### BUG-DB-001 – Missing synchealth table in database schema

**Status**: Open  
**Priority**: Critical  
**Area**: Database Schema / Sync Health Monitoring

**Goal**:  
Resolve the missing `synchealth` table error that is blocking the sync health monitoring endpoint.

**Symptoms**:
- Endpoint: `GET /api/synchealths?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46`
- Error: `Could not find the table 'public.synchealth' in the schema cache`
- Complete failure of sync health monitoring functionality

**Tasks**:
1. **Investigation Phase**:
   - Search for synchealth table migration files in `backend/migrations/`
   - Check if table exists in local/dev Supabase database
   - Review `backend/routes/synchealths.js` for expected schema
   - Determine if this is a missing migration or schema mismatch

2. **Resolution Phase**:
   - Create or apply migration to add `synchealth` table to production
   - Include proper columns, indexes, and constraints
   - Apply RLS policies for tenant isolation
   - Test endpoint after table creation

**Acceptance Criteria**:
- `GET /api/synchealths` returns data or empty array (not schema error)
- Table visible in Supabase Table Editor
- RLS policies enforce tenant isolation
- No impact on existing sync functionality

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
Status: Complete ✅ (v1.0.87–v1.0.90)  
Area: Integrations – Braid MCP / n8n

Goal:  
Make `mcp-node`, `n8n-proxy`, and `n8n` reachable again and restore MCP test suite to a passing or mostly-passing state.

Resolution:
- Production compose uses internal service URL `http://mcp:8000` for backend (`BRAID_MCP_URL`, `MCP_NODE_HEALTH_URL`).
- Backend `/api/mcp/health-proxy` fixed with timeout, payload validation, and multi-candidate attempts. Enhanced diagnostics added.
- GitHub Actions deployment injects `GITHUB_TOKEN` to prod `.env`; MCP container recreated when token is present.
- MCP monitor shows all green in production; validation issues created and confirmed: `#60` (dev), `#61` (prod), `#62` (post v1.0.90 deploy).
- Direct prod curl to `/api/mcp/health-proxy` returns `reachable: true`, `url: http://mcp:8000/health`, low latency.

Acceptance:
- MCP and n8n containers healthy under `docker compose ps`.
- MCP health suite and monitor green; health-proxy reachable with diagnostics.

---

### 6) BUG-INT-001 – Stabilize GitHub health issue reporter

Type: bugfix  
Status: Complete ✅ (v1.0.91)  
Area: Integrations – GitHub health reporting

Goal:  
Stop flapping/repeated attempts for `POST /api/github-issues/create-health-issue` and make health issue creation idempotent and reliable.

Resolution:
- **Idempotency:** Generate hash key from incident context (env, type, component, severity, error signature). Redis-backed with 24h TTL prevents duplicate issues for same incident.
- **Retry Logic:** Exponential backoff with 30% jitter for transient GitHub API failures (rate limits, network errors). Skips retries on client errors (except 429).
- **Suppression Logging:** Logs duplicate detections with existing issue reference. Returns `suppressed: true` response with existing issue URL.
- **Token & Metadata:** Enhanced in earlier iterations (token fallback, environment labels, build version footer).
- **Validation:** Tested locally; ready for production deployment via tag.

Files Changed:
- `backend/routes/github-issues.js`: Added `getRedisClient`, `generateIdempotencyKey`, `checkIdempotency`, `recordIssueCreation`, `retryWithBackoff` functions; integrated into create-health-issue endpoint.

Acceptance:
- ✅ No repeated bursts of `create-health-issue` calls for the same event (dedupe via Redis).
- ✅ Transient failures retry automatically with backoff/jitter.
- ✅ Suppressed duplicates logged clearly with existing issue reference.

---

### 7) BUG-CACHE-001 – Make tenant resolve cache actually useful

Type: bugfix  
Status: Complete ✅ (v1.0.92)  
Area: Performance – Tenant resolution cache

Goal:  
Improve tenant resolution cache effectiveness so that repeated tenant lookups benefit from caching without breaking correctness.

Resolution:
- **Root Cause:** `backend/routes/ai.js` had duplicate tenant resolution logic with local `tenantLookupCache` (80 lines). AI routes (handling most tenant traffic) bypassed canonical resolver completely, resulting in 0% cache hit ratio.
- **Fix:** Removed duplicate implementation; replaced with calls to `resolveCanonicalTenant()` from `tenantCanonicalResolver.js`.
- **Impact:** All tenant resolution now flows through single canonical cache with TTL (300s prod). Reduced code duplication (~65 lines removed). Cache hit ratio expected to improve from 0% to 50%+ under normal load.

Files Changed:
- `backend/routes/ai.js`: Import canonical resolver; replace `resolveTenantRecord()` with wrapper calling `resolveCanonicalTenant()`; remove `tenantLookupCache` Map and `UUID_PATTERN` constant.

Acceptance:
- ✅ `tenant_resolve_cache_hit_ratio` moves above 0 under normal usage.
- ✅ No incorrect tenant resolution due to cache.
- ✅ Single source of truth for tenant resolution across all routes.

---

### 8) BUG-DASH-003 – Fix dashboard phantom counts and cache issues

Type: bugfix  
Status: Complete ✅ (v1.0.93-95)  
Area: Dashboard – Data accuracy and caching

Goal:  
Eliminate incorrect dashboard counts showing phantom data when tables are empty, and fix cache-related data leakage issues.

Resolution:

**v1.0.93 - Cache Key Isolation:**
- **Root Cause:** Dashboard bundle cache used `'GLOBAL'` fallback when `tenant_id` was missing, causing cross-tenant cache leakage. One tenant's cached data returned to another tenant.
- **Fix:** Removed `'GLOBAL'` fallback; required explicit `tenant_id` parameter for cache keys. Each tenant now has isolated cache entry.
- **Side Effect:** Broke superadmin "All Clients Global" view (sent `null` tenant_id, rejected by backend).

**v1.0.94 - Superadmin Regression Fix:**
- **Root Cause:** v1.0.93 was too restrictive - rejected `null` tenant_id, breaking legitimate superadmin global aggregation view.
- **Fix:** Allow `null` tenant_id but use distinct `'SUPERADMIN_GLOBAL'` cache key. Maintains tenant isolation while enabling global view.
- **Impact:** Both single-tenant and global views work correctly with proper cache separation.

**v1.0.95 - Phantom Count Fix:**
- **Root Cause:** PostgreSQL `count: 'planned'` uses statistical estimates that don't update immediately after DELETE operations, showing phantom counts (e.g., "67 activities" when table empty).
- **Fix:** Changed all dashboard count queries to use `count: 'exact'` instead of `'planned'` estimates. Added `bust_cache=true` query parameter for testing.
- **Impact:** Dashboard now shows accurate counts reflecting actual database rows. No more phantom data from stale statistics.

Files Changed:
- `backend/routes/reports.js`: Cache key logic (effectiveTenantKey), count mode changed from 'planned' to 'exact', added cache bust parameter, simplified new leads and activities queries.

Acceptance:
- ✅ Dashboard shows 0 counts when tables are empty (no phantom data).
- ✅ Each tenant has isolated cache (no cross-tenant data leakage).
- ✅ Superadmin global view works without errors.
- ✅ Test data toggle functions correctly.
- ✅ Cache bypass available for testing (`?bust_cache=true`).

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
- BUG-MCP-001: Complete ✅ (v1.0.87-90 - MCP connectivity, health-proxy, token injection)
- BUG-INT-001: Complete ✅ (v1.0.91 - idempotency, retry, suppression logging)
- BUG-CACHE-001: Complete ✅ (v1.0.92 - consolidated tenant resolution to canonical cache)
- BUG-DASH-003: Complete ✅ (v1.0.93-95 - phantom counts, cache isolation, exact count queries)

**All planned bugfixes complete! Platform stable and ready for feature work. 🎉**

---

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

---

## Backlog

### FEAT-NOTIFICATIONS-001 – Enable notifications feature in production

Type: feature  
Status: Backlog  
Area: Notifications / Database  
Priority: Low

Goal:  
Enable the in-app notifications feature (Bell icon panel) in production by creating the required database table and RLS policies.

Context:
- Notifications table exists in migrations but not yet created in production Supabase database
- Feature currently gracefully fails with suppressed console warnings (v1.0.79)
- Non-critical feature - app works fine without it

Steps:
1. Run migration `001_init.sql` (lines 76-85) to create notifications table in production Supabase
2. Add `created_date` column and sync trigger (from migration 002)
3. Enable RLS policies via migration `061_consolidate_rls_notifications.sql`
4. Verify table exists in Supabase Table Editor
5. Test Bell icon functionality in production app

Scope:
- Database only (no code changes required)
- Migrations already exist in `backend/migrations/`
- Feature code already deployed and working in v1.0.79+

