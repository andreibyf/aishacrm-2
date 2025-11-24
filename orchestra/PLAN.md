# AiSHA CRM – Orchestra Plan

## Current Goal

Type: bugfix  
Title: Stabilize critical entry flows (blank page + auth flows)

Description:  
Focus on fixing high-impact, reproducible issues that prevent users from seeing or accessing the app:
- Blank white page instead of UI
- Broken password reset redirect

No new features in this phase. Only targeted bugfixes and minimal structural corrections where absolutely required for stability.

---

## Execution Rules (Critical)

Mode: BUGFIX ONLY

Do NOT:
- Redesign layout, routing, or global state management.
- Introduce new auth features (MFA, magic links, etc.).
- Perform broad or “opportunistic” refactors.
- Change ports, core environment assumptions, or tenant isolation.

Larger changes are allowed **only if strictly required** to:
- Prevent or fix a fatal runtime error (crash of the root React tree).
- Correct a misconfiguration that prevents initial render or auth flow.
- Resolve a clear security/stability issue (e.g., auth bypass, broken reset token handling).

Every fix must:
- Be as small and localized as possible.
- Include a clear explanation of root cause.
- Add or update tests where feasible.

If there is any doubt: **stop and ask** instead of guessing.

---

## Active Tasks (Priority Order)

### 1) BUG-UI-001 – Diagnose Blank Page Root Cause

Type: bugfix  
Status: Active (P1)  
Area: Frontend shell (root React tree, routing, app initialization)

Problem Indicators:
- Browser shows a completely blank white screen.
- URL loads, but no visible UI.
- May or may not show errors in DevTools console.

Steps:
1. Reproduce in the failing environment(s):
   - Record URL, user state (logged in/logged out), environment (Docker vs direct dev).
2. Use DevTools:
   - Console: capture any runtime errors (React, TypeError, import failures).
   - Network: check for failed JS/CSS/API requests (404/500).
3. Inspect root files:
   - `src/main.tsx` or `src/main.jsx` (bootstrap)
   - `src/App.tsx` or `src/App.jsx` (top-level app shell)
   - Routing entry: e.g. `src/router.tsx` or equivalent.

Scope:
- Diagnostics ONLY.
- Temporary logging allowed.
- No behavioral or structural changes yet.

Acceptance:
- Clear, documented root cause hypothesis:
  - e.g., uncaught error, routing mismatch, guard returning `null` indefinitely, asset load failure, etc.
- Evidence captured (console logs, stack traces, code locations) to feed into BUG-UI-002.

---

### 2) BUG-UI-002 – Fix Root Cause of Blank Page

Type: bugfix  
Status: Pending (starts after BUG-UI-001 has a root cause)  
Area: Same as BUG-UI-001, plus any directly implicated component/guard

Dependencies:
- BUG-UI-001 diagnosis completed.

Typical Causes to Check:
- Uncaught runtime errors in an ancestor component with no error boundary.
- React Router configuration that leaves the initial route unmatched → nothing rendered.
- Auth/tenant guard returning `null` or empty fragment and never transitioning.
- Critical assets (main bundle, CSS) failing to load due to misconfigured paths.

Steps:
1. Implement the smallest possible change that restores visible UI:
   - Add or adjust error boundaries only if required.
   - Fix route configuration so initial URL renders a real page.
   - Fix guard logic so it does not leave the app in a permanent “blank” state.
2. Ensure any auth/tenant gates:
   - Show a loader or error UI instead of a permanent blank.
3. Remove any temporary logging added in BUG-UI-001 if no longer needed.

Scope:
- Only touch:
  - `src/main.*`
  - `src/App.*`
  - Directly implicated route/guard components.
- No global state or architecture redesign.

Acceptance:
- The failing scenario no longer shows a blank page.
- A valid or anonymous user sees a real screen (login, dashboard, or explicit error).
- No regressions in other known-good paths.

---

### 3) BUG-UI-003 – Add Regression Coverage for Blank Page Scenario

Type: bugfix  
Status: Pending (after BUG-UI-002)  
Area: Frontend tests (unit/integration/E2E)

Dependencies:
- BUG-UI-002 fix applied.

Steps:
1. Add or update tests to cover the previously failing scenario:
   - Same route, same user state, same environment conditions as original bug.
2. Assertions must validate:
   - Non-empty render (e.g., app shell, header, login form, or dashboard element).
   - Not just “no throw”, but actual UI visible.

Scope:
- Test files and helpers only.

Acceptance:
- Test fails against pre-fix code (if run back in time).
- Test passes with current fix.
- Future regressions that reintroduce a blank page are caught.

---

## Next Up (Not Active Yet – Do Not Work On)

### BUG-AUTH-005 – Reset link redirects to login instead of new password page

Type: bugfix  
Status: Planned (P2, after BUG-UI-00x)  
Area: Auth – password reset flow

Goal:  
Fix the password reset flow so that valid reset links (from email) open the “Set New Password” screen instead of redirecting to the login page.

Problem Indicators:
- User clicks reset link from email.
- App opens login page instead of new password page.
- No clear message about token state (valid/invalid/expired).

Scope (when activated):
- Frontend reset-password route and auth guard logic.
- Supabase redirect URL/token handling, only as needed.
- No auth model redesign, no new flows.

Acceptance (when implemented):
- Valid reset link → new password screen.
- Invalid/expired link → clear error + option to request new link.
- Login page is not the default for valid reset links.

---

## Testing & Validation Requirements (for all active tasks)

Manual:
- Reproduce the original blank-page scenario(s).
- Confirm:
  - UI now renders where it previously showed blank.
  - No unexpected redirects or infinite loading states.
- Later (when BUG-AUTH-005 becomes active):
  - Reset email → link → correct reset screen behavior.

Automated:
- Run existing frontend test suites.
- New tests for BUG-UI-003 must pass.
- When BUG-AUTH-005 is implemented:
  - Add tests for reset token handling and routing.

Environment:
- Validate in:
  - Local dev server (e.g. `npm run dev`).
  - Dockerized / deployed environment where the bug actually manifests.

---

## Status

- BUG-UI-001: Not started (Active diagnostic)
- BUG-UI-002: Not started (Pending, P1)
- BUG-UI-003: Not started (Pending, P1)
- BUG-AUTH-005: Planned (P2 – do not start yet)

---

## Backlog (Do Not Touch)

- BUG-AUTH-002 – Invalid login credentials for valid Supabase users
- FEAT-UI-001 – Improve global error boundary UX
- FEAT-UI-002 – Add standardized loading skeleton for root-level guards
- PERF-UI-001 – Optimize initial bundle size for first paint

---

## Usage Instruction for AI Tools (Claude, Copilot, Orchestrator)

When using any AI to modify code in this repo:

1. Read `.github/copilot-instructions.md` and follow it exactly.  
2. Read `orchestra/ARCHITECTURE.md`.  
3. Read `orchestra/CONVENTIONS.md` (especially Copilot/AI behavior rules).  
4. Read this PLAN and select **BUG-UI-001** first.  

Rules:
- For BUG-UI-001: Diagnostics only (no fixes).
- For BUG-UI-002: Minimal fix only, after BUG-UI-001 diagnosis is done.
- For BUG-UI-003: Tests only.
- BUG-AUTH-005 must not be touched until explicitly promoted to Status: Active.

AI must:
- Declare which task ID it is working on.
- List files it intends to modify.
- Wait for human approval before making changes.
- Keep diffs minimal and within the approved scope.
