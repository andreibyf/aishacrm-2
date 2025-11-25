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

### BUG-DASH-001A – Diagnose Dashboard auth failure (root cause)

Type: bugfix  
Status: Active (P1)  
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
Status: Pending (P1, after BUG-DASH-001A)  
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
- Authenticated user with valid tenant can load Dashboard successfully.
- Module settings calls no longer return “Authentication required” for valid sessions.
- No regression in other authenticated routes.

---

### BUG-DASH-002 – Improve Dashboard stats loading performance

Type: bugfix  
Status: Pending (P2, after BUG-DASH-001A/B)  
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
- BUG-DASH-001B: **Ready for verification** (P1, fix) – Added Supabase bearer token + credentials to `callBackendAPI` in `src/api/entities.js`. Awaiting production test.
- BUG-DASH-002: Pending (P2, performance) – will begin after BUG-DASH-001B is verified.

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
