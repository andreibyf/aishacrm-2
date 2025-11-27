# AiSHA CRM – Bug Register

This file tracks known issues. PLAN.md selects which bugs are currently in scope.

---
## Platform Health & Integrations

## CRUD Health Tests

### BUG-CRUD-001 – Auth failures for CRUD health tests (Contacts, Leads, Accounts, Lists)

Status: Open  
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





### BUG-API-001 – Tenant and employee API calls intermittently fail (fetch failed)

Status: Closed  
Priority: Critical  
Area: Core API – tenants and employees

Symptoms:
- Monitoring shows repeated critical errors:
  - `GET /api/tenants/a11dfb63-4b18-4eb8-872e-747af2e37c46`
  - `GET /api/employees?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46`
- Both fail with `TypeError: fetch failed`.
- Affects user: `abyfield@4vdataconsulting.com` at `10:03:41 PM`.
- Not reported as a clean HTTP 4xx/5xx; instead it’s a lower-level fetch failure (network / TLS / DNS / connection).

Suspected Causes:
- Backend service or reverse proxy temporarily unreachable from the frontend/API layer.
- DNS / host resolution issues in the environment where tests run.
- TLS/SSL or network configuration mismatch between frontend and backend.
- Possible container or service restart/health issues during calls.

Resolution:
- Runtime connectivity and environment alignment fixes applied as part of v1.0.74+ releases (APP_BUILD_VERSION injection and proxy/config corrections). Frontend now consistently reaches backend with explicit HTTP responses (401/403 as applicable) instead of lower-level `fetch failed`. Monitoring no longer reports tenant/employee fetch failures; endpoints return stable results across sessions.
Notes:
- This impacts core tenant and employee resolution, which cascades into access control and UI loading.
- Fix stabilizes connectivity and removes fetch-level failures; application-level errors (e.g. 401/403) are explicit HTTP responses, not “fetch failed”.

### BUG-API-002 – Leads API returns “Authentication required” in healthy session

Status: Closed  
Priority: High  
Area: Leads API / Auth

Symptoms:
- Monitoring shows repeated warnings:
  - `GET /api/leads?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46`
- Response: `Authentication required`.
- Occurs even while other tenant-scoped endpoints for the same tenant/user may be working.

Suspected Causes:
- Leads endpoint using a different auth check/middleware than tenants/employees.
- Missing or incorrect auth token/cookie propagation for this specific route.
- Tenant or permission checks misconfigured for leads, causing false “Authentication required”.

Resolution:
- Aligned leads route auth with global middleware; frontend `callBackendAPI` attaches Supabase bearer token and cookies, enabling backend to populate `req.user` consistently. Issue resolved alongside BUG-API-001 connectivity fixes; monitoring shows no false “Authentication required” on `/api/leads` for authenticated sessions.
Notes:
- Fix aligns leads endpoint auth behavior with the rest of the authenticated API without weakening auth.

### BUG-MCP-001 – Braid MCP server and n8n integrations unreachable

Status: In Progress (Reachability Restored)  
Priority: High  
Area: Integrations – Braid MCP / n8n

Symptoms (original):
- Health checks showed MCP/n8n unreachable with code 0 and ~1500ms latency.
- MCP test suite reported 0/12 passing.
- All MCP-related tests failing: Braid Health, Wikipedia Search, CRM Accounts/Leads/Contacts, Mock Adapter, Batch Actions, GitHub Repos, Memory Store, LLM Generation, Error Handling.

Current status (verified):
- MCP server `aishacrm-mcp` is running and healthy.
- Host health: `curl http://localhost:4002/health` → `200 application/json`.
- Backend DNS: `wget http://aishacrm-mcp:8000/health` from `aishacrm-backend` → `200`.
- Pending: enable memory layer (`REDIS_URL`) and re-run MCP test suite.

Suspected Causes (original):
- MCP/Braid and n8n containers or services down or misconfigured (ports, hostnames, TLS).
- Health checker targeting wrong host port (`8000` instead of published `4002`) or not using service DNS.

Notes:
- Reachability restored; next focus is enabling Redis-backed memory and validating adapters.
- Fix must pass core health tests before feature work.

Action Items:
- Set `REDIS_URL=redis://redis:6379` for MCP to enable memory.
- Ensure `CRM_BACKEND_URL=http://backend:3001` inside network.
- Align health monitors: host → `http://localhost:4002/health`, containers → `http://aishacrm-mcp:8000/health`.
- Re-run MCP test suite and record results in `braid-mcp-node-server/TEST_RESULTS.md`.

### BUG-API-003 – Elevated API error rate (~10%)

Status: Open  
Priority: Medium  
Area: API reliability / Observability

Symptoms:
- Average API response time: ~447ms over 451 successful calls.
- API error rate at ~10%:
  - 49 errors from 500 calls.
- Errors include:
  - Fetch failures for core endpoints (tenants/employees).
  - Authentication errors on specific endpoints (e.g. leads).
  - Repeated errors in the health issue reporter.

Suspected Causes:
- Combination of:
  - Unreachable services (MCP/n8n).
  - Auth failures on certain routes.
  - Intermittent backend/API availability issues.
- Observability is catching the errors, but underlying causes are not yet stabilized.

Notes:
- This bug is a meta-issue representing overall reliability; it should trend down as BUG-API-001, BUG-API-002, and BUG-MCP-001 are resolved.
- Fix is partially dependent on those underlying issues.
---

### BUG-INT-001 – Health issue reporter endpoint is flapping or misbehaving

Status: Open  
Priority: Medium  
Area: Integrations – GitHub health issue reporting

Symptoms:
- Monitoring shows repeated critical events at the same timestamp:
  - `POST /api/github-issues/create-health-issue - 11/25/2025, 10:23:38 PM` (multiple times)
- Suggests:
  - Either repeated automatic retries due to failure, or
  - Misconfigured integration that fires multiple times for the same event.

Suspected Causes:
- Health reporter logic attempting to auto-create GitHub issues and failing, then retrying.
- No deduplication or backoff, causing multiple attempts for the same health incident.
- Possible GitHub API errors or misconfiguration (token, repo, permissions).

Notes:
- This bug is about making the health reporter reliable and non-spammy.
- Fix must ensure idempotency/deduplication and clear logging, not silent or repeated failures.
---

### BUG-CACHE-001 – Tenant resolve cache ineffective (0% hit ratio)

Status: Open  
Priority: Low  
Area: Performance – Tenant resolution cache

Symptoms:
- Metrics show:
  - `tenant_resolve_cache_size 1`
  - `tenant_resolve_cache_hits_total 0`
  - `tenant_resolve_cache_misses_total 2`
  - `tenant_resolve_cache_hit_ratio 0.0000`
  - `tenant_resolve_cache_ttl_ms 300000` (5 minutes)
- Cache exists but is effectively never hit.

Suspected Causes:
- Cache key or lookup logic not aligning with how tenant resolution is invoked.
- Cache TTL/eviction OK, but data is never marked as reusable for incoming requests.
- Possibly too many unique keys or per-request variations.

Notes:
- Lower priority than hard failures, but relevant for performance and load reduction.
- Fix should make tenant resolution cache actually useful without compromising correctness or tenant isolation.


---


## Dashboard

### BUG-DASH-001 – Dashboard fails to load for authenticated user

Status: Resolved  
Priority: High  
Area: Dashboard / Backend API / Auth  
Resolution: Frontend `callBackendAPI` now attaches Supabase bearer token (session or stored `sb-access-token`) plus `credentials: 'include'`, allowing backend auth middleware to populate `req.user` before `requireAdminRole` on `/api/modulesettings`. Backend auth middleware updated to support publishable (anon) key fallback (no service-role key required) ensuring authenticated users receive module settings. Dashboard renders successfully post-change; non-admin users receive proper 403 for settings while UI degrades gracefully.

Symptoms:
- After login and tenant auto-selection, the Dashboard does not render the expected content.
- Console shows repeated logs from:
  - `TenantContext` (tenant selection and synchronization)
  - `RouteGuard` and `hasPageAccess` (access checks running repeatedly)
  - `TenantSwitcher` (tenants successfully loaded)
- Backend calls to `GET /api/modulesettings?tenant_id=<tenant-id>` return:
  - `{"status":"error","message":"Authentication required"}`
- Logs indicate:
  - Supabase user is selected successfully (`[Supabase Auth] User record selected`)
  - `User.me` returns data
  - Tenant context and filtering appear to be applied
  - But the backend still responds as unauthenticated for dashboard module settings.

Suspected Causes (Original):
- Dashboard/module settings API was not receiving/validating auth headers, despite frontend session.
- Mismatch between Supabase session and backend auth mechanism (missing Authorization bearer/cookie).
- Route guards treated 401 “Authentication required” from module settings as fatal, blocking initial Dashboard render.

Notes:
- Fix must not redesign the auth system.
- The goal is to ensure that a properly authenticated user with a valid tenant can load dashboard module settings and see the Dashboard.
- Changes should be minimal and localized to:
  - API auth handling for module settings
  - Any guard logic that treats “Authentication required” as a fatal state for a valid session.

Resolution Details:
- Added bearer + cookies in `callBackendAPI` to supply backend with Supabase access token early.
- Auth middleware enhanced with publishable key fallback (no privileged key required) so `req.user` consistently set.
- Guards now receive settings or 403 (non-admin) rather than 401; dashboard renders modules accordingly.
- No redesign of auth; changes localized to API helper + middleware.

Verification:
- Authenticated admin/superadmin: `/api/modulesettings` returns settings list (200).
- Non-admin with tenant: receives 403 (expected) and UI continues with limited navigation.
- No further repeated 401 loops observed in logs.

---

### BUG-DASH-002 – Dashboard stats slow to load

Status: Resolved  
Priority: Medium  
Area: Dashboard / Backend API / Performance

Resolution: Implemented `/api/reports/dashboard-bundle` to aggregate fast counts and recent lists with a per-tenant in-memory cache (≈60s TTL). Added planned-counts with exact fallback for small values to improve accuracy and speed. Wired frontend to fetch the bundle first, render quickly, and hydrate widgets with full data in the background. Disabled chart animations and memoized widgets to reduce presentation delay (INP). Applied database indexes to leads, opportunities, activities, contacts, and accounts to accelerate common filters and ordering.

Symptoms (original):
- Dashboard cards and statistics took noticeably long to appear after page load.
- Metrics lagged versus rest of the UI.

Changes:
- Backend: new `dashboard-bundle` endpoint with tenant-scoped cache; exact fallback for small counts; `include_test_data` alignment.
- Frontend: bundle-first render; background hydration for `RecentActivities`, `SalesPipeline`, `LeadSourceChart`, `LeadAgeReport`.
- Performance: chart animations off; React.memo on widgets; stable props.
- Database: indexes created via `backend/migrations/077_dashboard_indexes.sql`.

Verification:
- Local and staging show faster time-to-first-paint for dashboard.
- Counts now align with dataset size and test data toggle.
- PROD release tagged `v1.0.66` for GHCR build and deploy.

## Authentication

### BUG-AUTH-001 – Supabase credential misconfiguration

**Status:** Resolved  
**Priority:** High  
**Area:** Frontend auth / env config
**Resolution:** Supabase credentials properly configured and validated; auth initialization flow fixed.

**Symptoms:**
- Console warnings about missing Supabase credentials.
- App silently falling back to “Local Dev Mode” when it shouldn’t.

**Suspected Causes:**
- `.env` missing or misconfigured:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Incorrect environment loading in Vite.

**Notes:**
- Fix must not alter overall auth architecture, only configuration and initialization.

---

### BUG-AUTH-002 – Valid users getting "Invalid login credentials"

**Status:** Resolved  
**Priority:** High  
**Area:** Auth endpoints / User.signIn
**Resolution:** Auth error handling improved; credential validation now correctly maps Supabase auth responses.

**Symptoms:**
- User exists in Supabase Auth and database.
- Correct email/password still returns “Invalid login credentials”.
- Sometimes works in Supabase dashboard but not in CRM UI.

**Suspected Causes:**
- Misalignment between Supabase auth and CRM `employees` / `users` tables.
- Incorrect error handling or mapping in `User.signIn` (frontend) or `/auth/login` (backend).

**Notes:**
- Focus on mapping, error handling, and auth flow.
- No feature-level changes (MFA, OAuth, etc.) in this bug.

---

### BUG-AUTH-003 – "User logged in but UI not recognizing session"

**Status:** Resolved  
**Priority:** High  
**Area:** Session handling / User.me()
**Resolution:** Session persistence fixed; user context now properly maintained across page refreshes.

**Symptoms:**
- Supabase shows active session.
- UI redirects to login or shows as logged out.
- `User.me()` returns null or incomplete user object.

**Suspected Causes:**
- Broken mapping from Supabase user → CRM user model.
- Session not stored/read correctly from localStorage or cookies.
- Tenant or permissions not attached correctly to user object.

**Notes:**
- Fix must ensure:
  - Session survives refresh.
  - Tenant and permissions are loaded for the current user.

---

### BUG-AUTH-004 – CRM access not enforced after login

**Status:** Resolved  
**Priority:** Medium  
**Area:** Post-login validation / permissions
**Resolution:** CRM access checks now properly enforced; inactive/suspended users blocked at guard level.

**Symptoms:**
- User without `crm_access` can still reach parts of the app.
- Inactive/suspended users are not consistently blocked.

**Suspected Causes:**
- Missing check on:
  - `permissions` JSONB (`crm_access` flag).
  - `status` field (active/inactive).
- Frontend routing or guards not fully enforcing backend decisions.

**Notes:**
- Fix should be limited to guard logic and checks.
- No redesign of the permissions model in this bugfix.

---

## Other Known Issues (Parking Lot)

Add non-auth bugs here; do not work on them unless they are pulled into PLAN.md.

### BUG-GEN-001 – Stale activity stats after bulk changes

**Status:** Backlog  
**Area:** Backend stats + Redis cache

Short description:
- Activity stats widget sometimes shows outdated counts after bulk update/delete operations.

---

### BUG-CAMP-001 – Rare double-send in campaign worker

**Status:** Backlog  
**Area:** Campaign worker / advisory locks / idempotency

Short description:
- Under restart or multi-instance scenarios, some contacts occasionally receive duplicate campaign messages.
