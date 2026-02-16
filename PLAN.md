# PLAN

## Root Cause

Guardrail rules are scattered across `orchestra/CONVENTIONS.md`, `orchestra/ARCHITECTURE.md`, `CLAUDE.md`, inline middleware code, and tribal knowledge. AI executors must reconstruct constraints from 5+ sources before making changes. A single `docs/GUARDRAILS.md` consolidates the non-negotiable invariants into one authoritative, citable reference.

## Impacted Services

- **None modified.** This is a new read-only documentation file (`docs/GUARDRAILS.md`).
- No backend, frontend, database, or infrastructure changes.

## Contracts Affected

- **None.** No API routes, database schemas, middleware, RLS policies, or Braid tool definitions are altered.
- `docs/SYSTEM_OVERVIEW.md` Documentation Index should reference the new file (separate follow-up).

## Ordered Steps

1. **Create `docs/GUARDRAILS.md`** with exactly these 7 sections:

   - **Execution Scope Rules**
     - Default mode is BUGFIX-FIRST; no features unless `orchestra/PLAN.md` marks a task Active.
     - AI agents may only modify files within the Active task's declared scope.
     - Larger rewrites allowed only for: security, stability, performance, or race-condition resolution.
     - Prefer minimal patches; no opportunistic refactors, mass renames, or file moves.
     - Must add/update tests for every change; demonstrate the bug via failing test first.

   - **Multi-Tenancy Safety**
     - Every table has `tenant_id UUID` with RLS policies; use `req.tenant.id` (UUID from `validateTenant` middleware).
     - Never use deprecated `tenant_id_text` (slug-based).
     - Non-superadmin users are locked to their own tenant; cross-tenant requests return 403.
     - Superadmin write operations must specify a `tenant_id` (400 if missing).
     - System tenant UUID: `a11dfb63-4b18-4eb8-872e-747af2e37c46`.
     - IDR detects rapid tenant switching (≥5 distinct tenants) and cross-tenant access violations (5/hour → block).

   - **Data Access Rules**
     - All queries must include `.eq('tenant_id', req.tenant.id)` — no cross-tenant queries.
     - Redis Memory (port 6379, 256 MB LRU): ephemeral only — presence, sessions, real-time. Managed by `memoryClient.js`.
     - Redis Cache (port 6380, 512 MB LRU): persistent — stats, aggregations, response caches. Managed by `cacheManager.js`.
     - Never store persistent data in Memory Redis or ephemeral data in Cache Redis.
     - Braid tool execution requires frozen `TOOL_ACCESS_TOKEN` with `{ verified: true, source: 'tenant-authorization' }`.
     - Braid policy rate limits: READ 100/min, WRITE 50/min, DELETE 20/min (requires `confirmed: true`), ADMIN 30/min.
     - Delete operations require `manager` role or above.

   - **Service Boundary Rules**
     - Docker ports are deployment contracts — do not change: frontend 4000, backend 4001, Redis Memory 6379, Redis Cache 6380.
     - Network: `aishanet` (Docker bridge). Local dev: frontend 5173, backend 3001.
     - Middleware initialization order is fixed (12 global steps in `initMiddleware.js`); do not reorder or skip.
     - `productionSafetyGuard` blocks all writes to production/cloud DBs unless explicitly bypassed via `ALLOW_PRODUCTION_WRITES` or token header.
     - Rate limiter: 120 req/min per IP on `/api/*`; fail-open on internal errors.
     - CORS: production requires `ALLOWED_ORIGINS` env var — missing → `process.exit(1)`.
     - `trust proxy` set to 1 (single hop).

   - **AI Pipeline Constraints**
     - All AI tool calls are tenant-scoped; internal JWT issued per execution with 5-minute TTL.
     - Braid tools execute in two modes: in-process (primary, `braidIntegration-v2.js`) and distributed MCP (`braid-mcp-node-server/`).
     - LLM provider failover is automatic; per-tenant overrides via `LLM_PROVIDER__TENANT_<UUID>` env vars.
     - Capability routing: `chat_tools`, `json_strict`, `brain_read_only`, `brain_plan_actions`.
     - After modifying `.braid` files, always run `npm run braid:sync`.
     - Braid effects system: each policy declares `allow_effects`; runtime checks before execution.

   - **Change Management Rules**
     - Authority hierarchy: `PLAN.md` (what) → `CONVENTIONS.md` (how) → `ARCHITECTURE.md` + `interfaces.md` (boundaries).
     - If `PLAN.md` has no Active task, AI modification is prohibited.
     - No new architectural patterns without explicit user approval.
     - No new dependencies without justification in the wave report.
     - Backend agent: only `backend/` and shared libs. Frontend agent: only `src/`. Test agent: only `tests/` and test configs.
     - Run `docker exec aishacrm-backend npm test` after every change.

   - **Prohibited Actions**
     - Never bypass auth, rate limiting, IDR, or `productionSafetyGuard` middleware.
     - Never disable or weaken RLS policies on production tables.
     - Never hardcode tenant IDs (except system tenant UUID in infra config).
     - Never mix Redis instance responsibilities (memory ↔ cache).
     - Never change Docker port mappings without updating all docs and configs.
     - Never perform cross-tenant queries or data access.
     - Never push/tag without explicit user approval.
     - Never modify files outside the Active task scope.
     - When in doubt: **DO NOTHING and ask.**

2. **Keep under 150 lines.** Use bullet lists exclusively; no prose paragraphs. Include a short preamble (2–3 lines) stating purpose and audience.
3. **No code changes.** File is purely informational markdown.
4. **Source references.** Each section should cite the canonical source file(s) in parentheses (e.g., `(see backend/middleware/validateTenant.js)`).

## Tests

- **No automated tests required.** This is a documentation-only change.
- **Manual verification:** Confirm all referenced file paths exist (middleware files, Redis clients, Braid files, etc.).
- **Content cross-check:** Verify key values (port numbers, rate limits, IDR thresholds, Braid policy limits) against actual source code.

## Observability Checks

- **N/A.** No runtime behavior changes. No metrics, logs, or health endpoints affected.

## Risks

- **Low.** Documentation-only addition with zero runtime impact.
- **Staleness risk:** File may drift from actual thresholds. Mitigate by citing source files rather than duplicating exact values where possible.
- **Overlap risk:** Content overlaps with `orchestra/CONVENTIONS.md`. Mitigate by keeping GUARDRAILS focused on hard invariants only; CONVENTIONS covers process/workflow.

## Definition of Done

- [ ] `docs/GUARDRAILS.md` exists and is under 150 lines.
- [ ] All 7 section headings are present: Execution Scope Rules, Multi-Tenancy Safety, Data Access Rules, Service Boundary Rules, AI Pipeline Constraints, Change Management Rules, Prohibited Actions.
- [ ] All referenced file paths are valid (spot-checked).
- [ ] Key values (ports, rate limits, Redis config, Braid policies) match actual source code.
- [ ] No existing files were modified (documentation-only addition).
- [ ] Content contains no generic boilerplate — every rule traces to a real system invariant.
# PLAN

## Root Cause

No single-page system overview exists. Onboarding developers and AI assistants must piece together architecture from 40+ docs, CLAUDE.md, and orchestra files. A concise `SYSTEM_OVERVIEW.md` reduces ramp-up time and acts as an index into deeper documentation.

## Impacted Services

- **None modified.** This is a new read-only documentation file (`docs/SYSTEM_OVERVIEW.md`).
- No backend, frontend, database, or infrastructure changes.

## Contracts Affected

- **None.** No API routes, database schemas, middleware, RLS policies, or Braid tool definitions are altered.
- CLAUDE.md documentation table should be updated to reference the new file (separate follow-up).

## Ordered Steps

1. **Create `docs/SYSTEM_OVERVIEW.md`** with these sections:
   - **System Identity**: AiSHA CRM v3.0.x, multi-tenant AI-native Executive Assistant CRM.
   - **Runtime Topology**: Docker services (frontend :4000, backend :4001, redis-memory :6379, redis-cache :6380, postgres optional), network `aishanet`.
   - **Request Flow**: Client → frontend (React/Vite) → backend (Express) → middleware stack (authenticate → validateTenant → routerGuard → performanceLogger → intrusionDetection) → route handler → Supabase (RLS-enforced) → response.
   - **AI Pipeline**: Chat request → intentRouter → intentClassifier → aiEngine (multi-provider failover: OpenAI/Anthropic/Groq/Local) → Braid tool execution (braidIntegration-v2.js) → Supabase query → response. Two modes: in-process (primary) and distributed MCP.
   - **Multi-Tenancy Model**: UUID `tenant_id` on every table, RLS policies, `validateTenant` middleware, `req.tenant.id` convention. Never use `tenant_id_text`.
   - **Data Layer**: Supabase PostgreSQL 15+, 50+ tables, dual Redis (memory for ephemeral/session, cache for persistent/aggregations), cacheManager.js.
   - **Background Workers**: campaignWorker, aiTriggersWorker, cronExecutors, email worker, health monitor — all initialized in `server.js`.
   - **Key Entry Points Table**: Map `backend/server.js`, `backend/startup/`, `backend/middleware/`, `backend/routes/`, `backend/lib/aiEngine/`, `backend/lib/braid/`, `src/main.jsx`, `braid-llm-kit/examples/assistant/`.
   - **Documentation Index**: Link to each doc in `docs/` with one-line descriptions.
2. **Keep under 200 lines.** Prefer tables and bullet lists over prose.
3. **No code changes.** File is purely informational markdown.

## Tests

- **No automated tests required.** This is a documentation-only change.
- **Manual verification:** Confirm all referenced file paths exist (`backend/server.js`, `backend/lib/braidIntegration-v2.js`, middleware files, etc.).
- **Link check:** Verify all relative markdown links resolve correctly from `docs/`.

## Observability Checks

- **N/A.** No runtime behavior changes. No metrics, logs, or health endpoints affected.
- Confirm `docs/SYSTEM_OVERVIEW.md` renders correctly in GitHub markdown preview.

## Risks

- **Low.** Documentation-only addition with zero runtime impact.
- **Staleness risk:** File may drift from actual architecture over time. Mitigate by keeping it concise and linking to canonical sources rather than duplicating details.
- **No merge conflicts expected** unless another branch adds the same file concurrently.

## Definition of Done

- [ ] `docs/SYSTEM_OVERVIEW.md` exists and is under 200 lines.
- [ ] All referenced file paths are valid (spot-checked).
- [ ] All section headings from Ordered Steps are present.
- [ ] No existing files were modified.
- [ ] Content is consistent with CLAUDE.md and `orchestra/ARCHITECTURE.md`.
