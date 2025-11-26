# AiSHA CRM – Bug Register

This file tracks known issues. PLAN.md selects which bugs are currently in scope.

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
