# AiSHA CRM – Orchestra Conventions

These rules apply to both human and AI-assisted changes when using the wave-orchestra.

## 1. Change Policy (Bugfix-First)

1. Primary goal: **BUG RESOLUTION**
   - Changes must be scoped to resolving a specific defect or clearly defined issue.
   - No opportunistic refactors or feature creep inside a bugfix wave.

2. When are larger rewrites allowed?
   Only if at least one of these is true and cannot be fixed locally:
   - Security: auth, access control, sensitive data handling flaws.
   - Stability: recurrent crashes, corrupt state, or unrecoverable errors.
   - Performance: the existing design cannot meet reasonable latency/throughput.
   - Resource efficiency / concurrency: race conditions, deadlocks, or pathological CPU/memory/IO usage.

3. Minimal impact principle:
   - Prefer the smallest patch that:
     - Fixes the bug.
     - Adds tests to prevent regression.
   - Avoid:
     - Large-scale renames.
     - Moving many files.
     - Reformatting entire modules.

4. Tests and validation:
   - Every bugfix should:
     - Demonstrate the bug via a failing test.
     - Pass the same test after the fix.
   - Feature work must include tests for new behavior.

## 2. Stack and Architecture Constraints

- **Frontend:**
  - React 18 + Vite, Tailwind, shadcn/ui, React Router, TanStack Query for server state where appropriate. :contentReference[oaicite:13]{index=13}  
  - Follow existing component hierarchy and patterns (container/presentational, custom hooks, etc.). :contentReference[oaicite:14]{index=14}  

- **Backend:**
  - Node 22 + Express.
  - Respect route organization by domain (accounts, contacts, opportunities, etc.).
  - Use existing repository/service patterns when adding logic. :contentReference[oaicite:15]{index=15}  

- **Database & Tenants:**
  - Always treat tenant UUID as the primary isolation key; no cross-tenant queries.
  - Never bypass RLS for production tables; test policies with care. :contentReference[oaicite:16]{index=16}  

- **Redis:**
  - Memory (6379) – ephemeral, for presence/session/real-time.
  - Cache (6380) – persistent, for stats/aggregations/response caches.
  - Do not mix responsibilities (no storing long-term cache in memory Redis). :contentReference[oaicite:17]{index=17}  

- **Ports (Docker):**
  - Frontend: host `4000`.
  - Backend: host `4001`.
  - These mappings are part of the deployment contract; do not change without updating all docs and configs. :contentReference[oaicite:18]{index=18}  

## 3. Code Standards (AI-Specific Interpretation)

Use the existing code standards and ESLint/Prettier configuration as ground truth. :contentReference[oaicite:19]{index=19}  

For AI-generated changes:

- Match existing style:
  - Function/component naming.
  - File organization.
  - Import patterns.
- Avoid introducing new dependencies unless necessary:
  - If a new dependency is required, explain why in the wave report.

## 4. Agent Behavior Constraints

### Backend Agent

- Only edits files under `backend/` and relevant shared libs.
- Must:
  - Preserve route structure and middleware chain.
  - Respect rate limiting, auth, and logging middleware.
  - Preserve RLS assumptions in DB access.
- For bugfixes:
  - Do not redesign APIs unless the defect is an API contract mismatch.

### Frontend Agent

- Only edits `src/` (React components, hooks, utils).
- Must:
  - Preserve routing shape and layout structure.
  - Use existing hooks (`useUser`, `TenantContext`, etc.) where applicable. :contentReference[oaicite:20]{index=20}  
- For bugfixes:
  - Do not overhaul component trees without cause.
  - Favor targeted fixes in the affected component or hook.

### Test Agent

- Only edits `tests/` and test-related configs.
- Must:
  - Reproduce reported bugs in tests where possib

## 5. Copilot Behavior Rules (Medium Control)

These rules apply whenever GitHub Copilot (or any AI agent) is used to modify code in this repository.

### Authority Hierarchy
1. orchestra/PLAN.md defines what is allowed to be worked on.
2. CONVENTIONS.md defines how work must be performed.
3. ARCHITECTURE.md and context/interfaces.md define system boundaries and contracts.

If PLAN.md has no Active task, AI modification is prohibited.

### Required Pre-Action Steps
Before writing or modifying any code, Copilot must:
- Identify the Active task in orchestra/PLAN.md.
- State the exact task ID and title.
- List the files it intends to modify.
- Await user confirmation before proceeding.

### Scope Enforcement
Copilot may ONLY:
- Modify files explicitly within the scope defined in the Active task.
- Perform changes required to satisfy the task’s Acceptance criteria.

Copilot may NOT:
- Modify unrelated files.
- Introduce new features during a bugfix.
- Perform broad refactors unless explicitly justified for:
  - Security
  - Stability
  - Performance
  - Race condition resolution

### Change Discipline
- Prefer minimal, targeted diffs.
- Reuse existing patterns and utilities.
- Do not invent new architectural patterns without explicit user approval.
- Do not “clean up” adjacent code unless directly required.

### Validation Requirements
For each task, Copilot must:
- Add or update tests where feasible.
- Ensure the fix is verifiable.
- Clearly describe what was changed and why.

### Stop Condition
Copilot must stop and request clarification if:
- The Active task is ambiguous.
- Required files or scope are unclear.
- The requested change conflicts with existing conventions.

Default behavior when in doubt: DO NOTHING and ask.
