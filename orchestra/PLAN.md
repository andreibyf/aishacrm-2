# AiSHA CRM – Orchestra Plan

## Mode

- Default mode: BUGFIX-FIRST.
- Features must be explicitly tagged as `Type: feature`.

---

## Active Tasks

### BUG-AUTH-002 – Fix Invalid Login Credential Errors
Type: bugfix  
Status: In progress  
Area: Auth backend + frontend  

Goal:
Fix Supabase sign-in failing for valid users.

Scope:
- Backend: `backend/routes/auth.js` (main authentication routes/logic).
- Frontend: `src/api/entities.js` and the login form component(s).
- No auth model redesign or new flows.

Acceptance:
- Valid users can sign in successfully.
- Invalid credentials handled correctly.
- Regression tests verify login success/failure.

---

### FEAT-PIPE-001 – Pipeline summary widget
Type: feature  
Status: Active  
Area: frontend – opportunities  

Goal:
Add a summary widget showing total deal value per pipeline stage on the opportunities dashboard.

Scope:
- Frontend only: `src/components/pipeline/*`, related API client functions.
- Backend changes only if absolutely necessary for data aggregation.

Acceptance:
- Widget renders with correct totals.
- Tests cover at least one realistic pipeline scenario.

---

## Pending / Backlog (Not Active)

- BUG-CAMP-001 – Campaign worker rare double-send (bugfix)
- PERF-REDIS-001 – Optimize Redis cache usage for activity stats (feature/perf)

---

## Rules for Copilot / Agents

- Only work on tasks under **Active Tasks**.
- Do not touch **Pending / Backlog** items.
- If no task is Active, no AI-driven code changes are allowed.
