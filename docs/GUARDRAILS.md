# AiSHA CRM — Guardrails

- Non-negotiable invariants for all human and AI contributors.
- Every rule traces to enforced code; source files cited in parentheses.
- Authoritative over scattered references in orchestra/, CLAUDE.md, and inline comments.

## Execution Scope Rules

- Default mode is **BUGFIX-FIRST**; no new features unless `orchestra/PLAN.md` marks a task Active.
- AI agents may only modify files within the Active task's declared scope.
- Larger rewrites allowed only for: security, stability, performance, or race-condition resolution.
- Prefer minimal patches; no opportunistic refactors, mass renames, or file moves.
- Must add/update tests for every change; demonstrate the bug via a failing test first.
- Run `docker exec aishacrm-backend npm test` after every change.
  (see `orchestra/CONVENTIONS.md`, `orchestra/PLAN.md`)

## Multi-Tenancy Safety

- Every table has `tenant_id UUID` with RLS policies; use `req.tenant.id` (UUID from `validateTenant` middleware).
  (see `backend/middleware/validateTenant.js`)
- Never use deprecated `tenant_id_text` (slug-based).
- Non-superadmin users are locked to their own tenant; cross-tenant requests return 403.
- Superadmin write operations must specify a `tenant_id` (400 if missing).
- System tenant UUID: `a11dfb63-4b18-4eb8-872e-747af2e37c46`.
- IDR detects rapid tenant switching (≥5 distinct tenants) and cross-tenant access violations (5/hour → block).
  (see `backend/middleware/intrusionDetection.js`)

## Data Access Rules

- All queries must include `.eq('tenant_id', req.tenant.id)` — no cross-tenant queries.
- **Redis Memory** (port 6379, 256 MB LRU): ephemeral only — presence, sessions, real-time.
  (see `backend/lib/memoryClient.js`, `docker-compose.yml`)
- **Redis Cache** (port 6380, 512 MB LRU): persistent — stats, aggregations, response caches.
  (see `backend/lib/cacheManager.js`, `docker-compose.yml`)
- Never store persistent data in Memory Redis or ephemeral data in Cache Redis.
- Braid tool execution requires frozen `TOOL_ACCESS_TOKEN` with `{ verified: true, source: 'tenant-authorization' }`.
  (see `backend/lib/braidIntegration-v2.js`)
- Braid policy rate limits: READ 100/min, WRITE 50/min, DELETE 20/min (requires `confirmed: true`), ADMIN 30/min.
- Delete operations require `manager` role or above.

## Service Boundary Rules

- Docker ports are deployment contracts — do not change:
  - Frontend: 4000
  - Backend: 4001
  - Redis Memory: 6379
  - Redis Cache: 6380
- Network: `aishanet` (Docker bridge). Local dev: frontend 5173, backend 3001.
  (see `docker-compose.yml`)
- Middleware initialization order is fixed (12 global steps in `initMiddleware.js`); do not reorder or skip.
  (see `backend/startup/initMiddleware.js`)
- `productionSafetyGuard` blocks all writes to production/cloud DBs unless bypassed via `ALLOW_PRODUCTION_WRITES` env var or `X-Allow-Production-Write` header with `PRODUCTION_WRITE_TOKEN`.
  (see `backend/middleware/productionSafetyGuard.js`)
- Rate limiter: 120 req/min per IP on `/api/*`; fail-open on internal errors.
  (see `backend/startup/initMiddleware.js`)
- CORS: production requires `ALLOWED_ORIGINS` env var — missing → `process.exit(1)`.
  (see `backend/startup/initMiddleware.js`)
- `trust proxy` set to 1 (single hop).
  (see `backend/server.js`)

## AI Pipeline Constraints

- All AI tool calls are tenant-scoped; internal JWT issued per execution with 5-minute TTL.
- Braid tools execute in two modes:
  - In-process (primary): `backend/lib/braidIntegration-v2.js`
  - Distributed MCP: `braid-mcp-node-server/`
- LLM provider failover is automatic; per-tenant overrides via `LLM_PROVIDER__TENANT_<UUID>` env vars.
  (see `backend/lib/aiEngine/`)
- Capability routing: `chat_tools`, `json_strict`, `brain_read_only`, `brain_plan_actions`.
  (see `backend/lib/aiEngine/modelRouter.js`)
- After modifying `.braid` files, always run `npm run braid:sync`.
  (see `braid-llm-kit/examples/assistant/`)
- Braid effects system: each policy declares `allow_effects`; runtime checks before execution.

## Change Management Rules

- Authority hierarchy: `PLAN.md` (what) → `CONVENTIONS.md` (how) → `ARCHITECTURE.md` + `interfaces.md` (boundaries).
  (see `orchestra/PLAN.md`, `orchestra/CONVENTIONS.md`, `orchestra/ARCHITECTURE.md`, `orchestra/context/interfaces.md`)
- If `PLAN.md` has no Active task, AI modification is prohibited.
- No new architectural patterns without explicit user approval.
- No new dependencies without justification in the wave report.
- Agent boundaries:
  - Backend agent: only `backend/` and shared libs.
  - Frontend agent: only `src/`.
  - Test agent: only `tests/` and test configs.
- Run `docker exec aishacrm-backend npm test` after every change.

## Prohibited Actions

- Never bypass auth, rate limiting, IDR, or `productionSafetyGuard` middleware.
- Never disable or weaken RLS policies on production tables.
- Never hardcode tenant IDs (except system tenant UUID in infra config).
- Never mix Redis instance responsibilities (memory ↔ cache).
- Never change Docker port mappings without updating all docs and configs.
- Never perform cross-tenant queries or data access.
- Never push/tag without explicit user approval.
- Never modify files outside the Active task scope.
- When in doubt: **DO NOTHING and ask.**