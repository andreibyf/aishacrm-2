# AiSHA CRM – Bug Register

This file tracks known issues. PLAN.md selects which bugs are currently in scope.

---

## Dashboard

### BUG-DASH-001 – Dashboard fails to load for authenticated user

Status: Open  
Priority: High  
Area: Dashboard / Backend API / Auth

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

Suspected Causes:
- The dashboard/module settings API is not receiving or validating the auth token/session correctly, even though the frontend believes the user is authenticated.
- Possible mismatch between:
  - Supabase auth/session and the backend’s expected auth mechanism (e.g., missing Authorization header, cookie, or token mapping).
- Route guards may be relying on module settings and failing hard on “Authentication required”, leaving the Dashboard in a non-rendered state.

Notes:
- Fix must not redesign the auth system.
- The goal is to ensure that a properly authenticated user with a valid tenant can load dashboard module settings and see the Dashboard.
- Changes should be minimal and localized to:
  - API auth handling for module settings
  - Any guard logic that treats “Authentication required” as a fatal state for a valid session.

Interim Resolution Plan:
- Identified missing auth propagation in generic entity fetch helper (`callBackendAPI`) leading to 401 on `GET /api/modulesettings`.
- Added bearer token attachment (Supabase access token or stored `sb-access-token`) and `credentials: 'include'` to `callBackendAPI` in `src/api/entities.js`.
- This permits `requireAdminRole` to succeed for authenticated admin/superadmin without altering core auth architecture.
- Pending verification: dashboard load with module settings present; confirm non-admin receives expected 403 while UI degrades gracefully.
- After verification, update Status to Resolved and summarize outcome.

---

### BUG-DASH-002 – Dashboard stats slow to load

Status: Open  
Priority: Medium  
Area: Dashboard / Backend API / Performance

**Symptoms:**
- Dashboard cards and statistics take noticeably long to appear after page load.
- The UI feels responsive in other areas, but Dashboard metrics lag behind.
- No explicit frontend errors, but multiple sequential or redundant API calls are suspected.

**Suspected Causes:**
- Dashboard is issuing multiple requests to stats or module endpoints instead of batching where possible.
- Lack of caching for frequently-read dashboard metrics (e.g., no short-term in-memory or Redis cache).
- Inefficient database queries or joins on the backend for dashboard endpoints.

**Notes:**
- Fix must not alter overall authentication or tenant isolation logic.
- Focus on the performance of retrieving and displaying dashboard stats:
- Reduce redundant calls.
- Optimize queries or introduce safe caching.
- Any caching must respect tenant boundaries and avoid cross-tenant data exposure.

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
