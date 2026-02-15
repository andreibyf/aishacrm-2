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
