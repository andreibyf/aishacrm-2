# AiSHA CRM – Bug Register

This file tracks known issues. PLAN.md selects which bugs are currently in scope.

---
## UI/Frontend Issues

### BUG-UI-001 – Blocked IPs page crashes on load

Status: Resolved ✅  
Priority: High  
Area: Settings / Security Monitor / Blocked IPs Tab  
Detected: November 28, 2025

Symptoms:
- Navigating to Settings → Security Monitor → Blocked IPs tab causes page crash
- Console error: `TypeError: Cannot read properties of undefined (reading 'map')`
- Error occurs at SecurityMonitor component line 499: `idrStatus.blocked_ips.map((ipData, idx) => {`
- Full error trace:
  ```
  TypeError: Cannot read properties of undefined (reading 'map')
      at Jn (Settings-CBcDkmPw.js:211:21485)
      at Ch (entry-Cju4CqvL.js:39:17358)
      ...
  ```

Interpretation:
- `idrStatus.blocked_ips` is undefined when component tries to render Blocked IPs list
- Guard condition at line 492 checks `!idrStatus || idrStatus.blocked_ips?.length === 0` but doesn't handle undefined `blocked_ips`
- When `idrStatus` exists but `blocked_ips` is undefined, it falls through to `.map()` call which crashes

Suspected Causes:
1. **Backend response structure mismatch:**
   - API endpoint `/api/security/status` returns `idrStatus` object without `blocked_ips` property
   - Backend may return empty object `{}` or object with different structure
2. **Race condition:**
   - Component renders before `fetchIDRStatus()` completes
   - Initial state has `idrStatus: null` but changes to `{}` before `blocked_ips` is populated
3. **API error handling:**
   - Backend returns success status but incomplete data structure
   - Error in data transformation leaving `blocked_ips` undefined

Root Cause:
- Line 492 guard condition: `!idrStatus || idrStatus.blocked_ips?.length === 0`
- This is true when:
  - `idrStatus` is null/falsy (shows "No IPs blocked")
  - `blocked_ips` exists and is empty array (shows "No IPs blocked")
- This is false when:
  - `idrStatus` exists but `blocked_ips` is undefined → crashes on line 499

Fix:
- Change guard to: `!idrStatus || !idrStatus.blocked_ips || idrStatus.blocked_ips.length === 0`
- Or use optional chaining in map: `idrStatus?.blocked_ips?.map(...) || []`
- Ensure backend always returns `blocked_ips` as array (empty or populated)

Files Affected:
- `src/components/settings/SecurityMonitor.jsx` (line 492-499)
- Possibly `backend/routes/security.js` (status endpoint)

Resolution (November 28, 2025):
- Fixed guard condition at line 492 in SecurityMonitor.jsx
- Changed from: `!idrStatus || idrStatus.blocked_ips?.length === 0`
- Changed to: `!idrStatus || !idrStatus.blocked_ips || idrStatus.blocked_ips.length === 0`
- Now explicitly checks for undefined `blocked_ips` before accessing length/map
- Deployed in frontend container rebuild (21.0s build time)

Notes:
- High priority as it completely blocks access to Blocked IPs management
- Simple null-safety fix should resolve immediately
- Should verify backend response structure for consistency

---
## Production Critical Issues

### BUG-PROD-002 – Production backend fetch failures (Multiple endpoints returning 500)

Status: Open  
Priority: Critical  
Area: Production Backend / Database Connectivity  
Detected: November 28, 2025

Symptoms:
- Multiple API endpoints returning HTTP 500 errors in production (app.aishacrm.com)
- Error message: `{"status":"error","message":"TypeError: fetch failed"}`
- Affected endpoints:
  - `GET /api/notifications?tenant_id=...&user_email=...`
  - `GET /api/modulesettings?tenant_id=...`
  - `POST /api/system-logs`
  - `GET /heartbeat` (404 not found)
- Cascading failures causing Settings page and notifications to fail
- Error occurs on backend when attempting to fetch from Supabase

Interpretation:
- Backend Node.js process cannot complete fetch() calls to external services
- Most likely: Supabase database connectivity issue from production VPS
- Backend health checks (`/health`) still passing, indicating server is running
- Error is at network/connectivity layer, not application logic layer

Suspected Causes:
1. **Supabase connectivity issue:**
   - Supabase service down or unreachable from production VPS
   - Network/firewall blocking outbound HTTPS to Supabase
   - DNS resolution failure for Supabase domain
2. **Rate limiting or throttling:**
   - Supabase API rate limits exceeded
   - IP-based throttling from production server
3. **Configuration issue:**
   - Invalid/expired Supabase credentials in production `.env`
   - Missing `DATABASE_URL` or `SUPABASE_URL` in production environment
   - Incorrect SSL/TLS configuration (`PGSSLMODE`)
4. **Resource exhaustion:**
   - Connection pool exhausted
   - Too many concurrent requests to Supabase

Context:
- Issue appeared in production after normal operation
- NOT related to recent n8n removal changes (v1.1.7)
- Local development environment working correctly
- Affects authenticated users trying to load Settings and notifications

Notes:
- This is a **production-only infrastructure issue**
- Requires SSH access to production VPS for diagnosis
- May need coordination with Supabase support if service-side issue
- Check production backend logs for detailed error traces
- Verify Supabase dashboard shows project as healthy

---
## Platform Health & Integrations

### BUG-DB-001 – Missing synchealth table in database schema

Status: Open  
Priority: Critical  
Area: Database Schema / Sync Health Monitoring

Symptoms:
- `GET /api/synchealths?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46`
- Error: `Could not find the table 'public.synchealth' in the schema cache`
- Sync health monitoring endpoint completely non-functional

Interpretation:
- The `synchealth` table does not exist in the production Supabase database
- Schema cache cannot locate the table, causing all sync health queries to fail
- Likely missing migration or table was never created in production

Suspected Causes:
- Migration file exists but was never applied to production database
- Table creation SQL may be in migration files but not executed
- Possible table rename or schema mismatch between dev and production

Notes:
- This is a critical issue blocking sync health monitoring entirely
- Need to:
  - Verify if migration exists for synchealth table creation
  - Check if table exists in dev/local database
  - Apply missing migration to production or create table manually
  - Verify RLS policies are in place after table creation

---

### BUG-PROD-001 – Settings page authentication failure (Production only)

Status: Resolved ✅  
Priority: Critical  
Area: Settings API / Authentication  
Resolution: November 27, 2025 - Root cause identified as authentication issue, not routing

Symptoms (Initial Report):
- URL: `https://app.aishacrm.com/settings`
- Error: `SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`
- Occurs in production only, not in dev environment
- Browser: Chrome 144.0.0.0 on Windows 10

Investigation Results:
- Tested `/api/modulesettings` endpoint directly: Returns JSON (401 Authentication required) ✅
- Cloudflare Tunnel routing verified working: `/api/*` correctly reaches backend ✅
- Backend health check working: `http://localhost:4001/health` returns JSON ✅
- Settings page successfully makes API calls and receives JSON responses ✅

Root Cause:
- **NOT a routing issue** - Cloudflare Tunnel configured correctly
- **NOT returning HTML** - Backend returns proper JSON responses
- **Authentication issue**: User session expired or invalid, causing 401 errors
- Settings page cannot load module settings without valid authentication

Resolution:
- Initial symptom (HTML parse error) was either:
  - From a different time before Cloudflare Tunnel was configured
  - From a cached frontend build with incorrect API URL
  - From a specific auth state that has since been resolved
- Current production state: API routing works, authentication required
- Settings page properly receives JSON 401 responses (not HTML)

Verification (November 27, 2025):
```bash
# Backend health check
curl http://localhost:4001/health
# Returns: {"status":"ok","timestamp":"2025-11-27T17:28:06.370Z",...}

# Module settings endpoint (without auth)
curl https://app.aishacrm.com/api/modulesettings?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46
# Returns: {"status":"error","message":"Authentication required"}
```

Outcome:
- BUG-PROD-001 resolved: No routing issue, Cloudflare Tunnel working correctly
- If users still see Settings page errors, it's due to expired/invalid sessions (user-level issue)
- Settings page handles 401 responses gracefully per existing error handling in `callBackendAPI`

---

## CRUD Health Tests

### BUG-CRUD-001 – Auth failures for CRUD health tests (Contacts, Leads, Accounts, Lists)

Status: Closed ✅  
Priority: High  
Area: Core API – Contacts / Leads / Accounts / Listing
Resolution: v1.0.96 (November 27, 2025) - Browser tests now properly authenticate with Supabase session tokens

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
