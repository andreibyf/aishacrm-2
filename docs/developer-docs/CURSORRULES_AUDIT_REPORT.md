# Repository Audit vs .cursorrules

**Audit date:** 2025-03-06  
**Reference:** `.cursorrules` (API layer, service layer, data layer, AI/Braid, utilities, drift detection)

---

## 1. Raw SQL outside the data layer

**.cursorrules:** _"All database access must occur through the data layer. Raw SQL queries are only allowed inside the data layer. API routes and services must not execute raw SQL directly."_

**Finding:** A minimal **data layer** exists at `backend/data/` (e.g. `tenant.js` for tenant lookup). `backend/lib/tenantResolver.js` was refactored to use it; raw SQL remains in many other places (routes, lib, workers, middleware). Scripts and migrations are excluded from this list (they are one-off/admin).

### Production code with raw SQL (pgPool.query / client.query)

| File path                                     | Notes                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `backend/routes/bizdevsources.js`             | `client.query('BEGIN'                                                            | 'ROLLBACK' | 'COMMIT')`, parameterized SQL for promote flow, `pgPool.query` for assignment updates |
| `backend/routes/workflows.js`                 | Many `pgPool.query()` calls (workflow CRUD, metadata, execution state)           |
| `backend/routes/suggestions.js`               | Multiple `pgPool.query()` for list, get, metrics, summary, apply, status updates |
| `backend/routes/users.js`                     | `pgPool.query()` for user/tenant lookups                                         |
| `backend/routes/aicampaigns.js`               | Multiple `pgPool.query()` for campaigns, profiles, calls                         |
| `backend/routes/leads.v2.js`                  | `supabase.rpc('exec_sql', …)` for dynamic filtering                              |
| `backend/routes/dashboard-funnel.js`          | `supabase.rpc('raw_sql', …)` fallback                                            |
| `backend/routes/aiRealtime.js`                | `pgPool.query()` for tenant/feature config                                       |
| `backend/middleware/productionSafetyGuard.js` | **FIXED** — now uses `backend/data/systemLogs.js` (data layer)                   |
| `backend/server.js`                           | `pgPool.query()` for auth/session or cleanup                                     |
| `backend/lib/campaignWorker.js`               | `pgPool.query()`, `client.query()` for locks and campaign SQL                    |
| `backend/lib/cronExecutors.js`                | `pgPool.query()` for cron job execution                                          |
| `backend/lib/tenantResolver.js`               | **FIXED** — now uses `backend/data/tenant.js` (data layer)                       |
| `backend/workers/emailWorker.js`              | `pgPool.query()` for debug and activity queries                                  |
| `backend/lib/aiTriggersWorker.js`             | Supabase `.from().select()` (no raw SQL; listed for “DB in lib”)                 |
| `backend/lib/suggestNextActions.js`           | Supabase `.from().select()` (no raw SQL; listed for “DB in lib”)                 |
| `backend/lib/transitions.js`                  | Supabase `.from()` (no raw SQL; listed for “DB in lib”)                          |
| `backend/lib/twilioService.js`                | Supabase `.from()` for integrations and activities                               |

**Recommendation:** Continue moving raw SQL from routes/lib/workers into `backend/data/*`; routes and services should call data-layer functions only. (One instance fixed: tenantResolver → data/tenant.js.)

---

## 2. API routes containing business logic

**.cursorrules:** _"API routes must only handle request parsing and response formatting. API routes must not contain business logic. API routes must call the service layer for all operations."_

**Finding:** Many route files contain direct database access (Supabase `.from()`, `.rpc()`, or `pgPool.query`) and in-route logic (validation, branching, multi-step flows). This mixes routing with data access and business logic.

### Routes with direct DB access and/or substantial in-route logic

| File path                                   | Evidence                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `backend/routes/bizdevsources.js`           | Direct Supabase + raw SQL; promote flow, assignment history, CRUD in route handlers           |
| `backend/routes/workflows.js`               | Heavy `pgPool.query()` and workflow logic in routes                                           |
| `backend/routes/suggestions.js`             | `pgPool.query()` and apply/approve logic in routes                                            |
| `backend/routes/leads.v2.js`                | `supabase.from('leads')`, `.rpc('leads_*_definer')`, `exec_sql`, assignment history in routes |
| `backend/routes/accounts.v2.js`             | `supabase.from('accounts')`, assignment history, CRUD in routes                               |
| `backend/routes/aicampaigns.js`             | `pgPool.query()` and campaign logic in routes                                                 |
| `backend/routes/dashboard-funnel.js`        | Supabase queries and `rpc('raw_sql')` in routes                                               |
| `backend/routes/reports.v2.js`              | Supabase `.from()` for opportunities, leads, activities in routes                             |
| `backend/routes/carePlaybooks.js`           | Supabase `.from('care_playbook*')` and CRUD in routes                                         |
| `backend/routes/webhooks.js`                | Supabase `.from('webhook')` CRUD in routes                                                    |
| `backend/routes/modulesettings.js`          | Supabase `.from('modulesettings')` CRUD in routes                                             |
| `backend/routes/tenants.js`                 | Supabase `.from('tenant')`, modulesettings, audit_log in routes                               |
| `backend/routes/aiRealtime.js`              | `pgPool.query()` and Supabase in routes                                                       |
| `backend/routes/aiSummary.js`               | `supabase.from('person_profile')` and LLM call in route                                       |
| `backend/routes/ai.js`                      | Supabase for context; orchestration and tool calls in route (Braid used for tools)            |
| `backend/routes/users.js`                   | `pgPool.query()` in routes                                                                    |
| Plus others from the “direct DB” list above | Same pattern: DB + logic in route handlers                                                    |

**Recommendation:** Move business logic and data access into a service layer (and data layer). Keep routes thin: parse request, call service, format and send response.

---

## 3. Services / lib returning or handling HTTP responses

**.cursorrules:** _"Services must not directly handle HTTP responses."_

**Finding:** No `backend/services/*` file sends HTTP (no `res.json`/`res.status` in services). The following **lib** modules are used as route helpers and do send HTTP responses; they behave like middleware.

| File path                        | Evidence                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `backend/lib/validation.js`      | `validateUUIDParam`, `validateTenantId`, `validateTenantScopedId` take `res` and call `res.status(400).json(...)` |
| `backend/lib/uuidValidator.js`   | `validateUuidParams`, `validateUuidQuery` return middleware that call `res.status(400).json(...)`                 |
| `backend/lib/cacheMiddleware.js` | Wraps `res.json` for caching (middleware; acceptable for Express middleware).                                     |
| `backend/lib/teamVisibility.js`  | No direct `res` in code; only usage example in comments (`res.status(403).json(...)`).                            |

**Recommendation:** Treat `validation.js` and `uuidValidator.js` as route-layer helpers (or middleware). If they are ever used from a “service” module, refactor so services return results/errors and the route layer sends HTTP.

---

## 4. AI calls bypassing Braid tools

**.cursorrules:** _"All LLM or AI operations must occur through Braid tools."_

**Finding:** Tool execution in chat flows goes through `executeBraidTool` (Braid). The **LLM chat completion** itself (`client.chat.completions.create`) is invoked directly in routes and lib. Other features (summarization, workflow steps, realtime, etc.) call LLMs without going through Braid tools.

### Direct LLM usage (no Braid tool wrapper)

| File path                                      | Usage                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `backend/routes/ai.js`                         | `client.chat.completions.create()` for main chat and tool loop; summarization and other non-tool completions are direct. |
| `backend/routes/aiSummary.js`                  | `llm.client.chat.completions.create()` for person profile summary (no Braid tool).                                       |
| `backend/routes/whatsapp.js`                   | `client.chat.completions.create()` for WhatsApp AI reply (Braid used for tool calls from that reply).                    |
| `backend/routes/integrations.js`               | POST `/openai/chat` stub (placeholder; would bypass Braid if implemented as direct chat).                                |
| `backend/lib/aiMemory/conversationSummary.js`  | `generateChatCompletion()` for conversation summary.                                                                     |
| `backend/services/workflowExecutionService.js` | `generateChatCompletion()` for workflow LLM steps.                                                                       |
| `backend/lib/developerAI.js`                   | `client.chat.completions.create()` for developer AI.                                                                     |
| `backend/workers/taskWorkers.js`               | `client.chat.completions.create()` for task worker LLM.                                                                  |
| `backend/lib/aiBrain.js`                       | Uses Braid for tools; chat completion is still direct.                                                                   |
| `pep/compiler/llmParser.js`                    | `generateChatCompletion()` for PEP parsing.                                                                              |

**Recommendation:** Either (a) define Braid tools for each LLM use case (e.g. “summarize_profile”, “workflow_llm_step”) and route all LLM calls through Braid, or (b) relax the rule to “all AI operations that perform CRM/data actions use Braid tools” and document which LLM entry points are orchestration-only vs. tool-execution.

---

## 5. Duplicate utilities

**.cursorrules:** _"Avoid creating duplicate utility modules. Before adding new helpers, search the repository for existing equivalents."_

**Finding:** Overlapping responsibility and duplicate helpers.

| Duplicate       | Files                          | Overlap                                                                                                                                        |
| --------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| UUID validation | `backend/lib/validation.js`    | `isValidUUID(value)`, `validateUUIDParam(id, res)`, `validateTenantId`, `validateTenantScopedId`                                               |
|                 | `backend/lib/uuidValidator.js` | `isValidUUID(value)`, `sanitizeUuidInput()`, `validateUuidParams(...paramNames)` (middleware), `validateUuidQuery(...queryNames)` (middleware) |

**Status: FIXED (2025-03-06).** Consolidated into `uuidValidator.js`; `validation.js` now re-exports route helpers from `uuidValidator.js`. Single source of truth for UUID validation.

**Other \*Utils / helpers:** Multiple `*Utils.js` and `*utils.js` files exist (`src/utils/`, `src/components/*/loggerUtils.js`, `chartUtils.js`, etc.). No other clear duplication was flagged; worth a follow-up pass for similar names and behavior.

---

## 6. Unused modules

**.cursorrules:** (Drift detection) _"unused modules"_

**Finding:**

| Category            | Path / pattern                                                 | Notes                                                                                      |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Archive             | `backend/archive/**`, `archive/legacy-lib/braidIntegration.js` | Intentionally unused; legacy or ad-hoc scripts.                                            |
| Legacy Braid        | `archive/legacy-lib/braidIntegration.js`                       | Replaced by `braidIntegration-v2.js`; only in archive.                                     |
| Route vs lib naming | `backend/routes/validation.js`                                 | Route module (validation API), not the same as `backend/lib/validation.js`. Both are used. |

No production entry points were found that import from archive. No other clearly unused production modules were identified without a full dependency graph; recommend running a tree-shake or “find unused files” script for the build.

---

## Summary table

| Rule                           | Severity | Count (file-level)                                              |
| ------------------------------ | -------- | --------------------------------------------------------------- |
| Raw SQL outside data layer     | High     | 18+ (routes, lib, workers, middleware, server)                  |
| API routes with business logic | High     | 20+ route files                                                 |
| Services returning HTTP        | Low      | 0 services; 2 lib helpers send HTTP                             |
| AI bypassing Braid             | Medium   | 10+ files (orchestration + summarization + workflows + workers) |
| Duplicate utilities            | Medium   | **FIXED** — consolidated to uuidValidator.js                    |
| Unused modules                 | Low      | Archive only; no stray production modules found                 |

---

## Recommended next steps

1. **Data layer:** Add `backend/data/` (or `backend/repositories/`) and move all raw SQL and Supabase query construction from routes, lib, and workers into this layer.
2. **Service layer:** Add or clarify `backend/services/` for business logic; routes should call services only; services call data layer and Braid.
3. **Routes:** Refactor route handlers to: parse input → call service → format response; remove direct DB and business logic from route files.
4. **Braid vs LLM:** Decide whether “all LLM operations” must go through Braid or only “CRM/data tool” operations; then either add Braid tools for summarization/workflows or document exceptions.
5. **UUID utilities:** ~~Consolidate `backend/lib/validation.js` and `backend/lib/uuidValidator.js`~~ **DONE** — single source in `uuidValidator.js`, `validation.js` re-exports.

---

## Post-audit fixes applied (2025-03-06)

| Issue                      | Fix                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Duplicate utilities (UUID) | Consolidated into `backend/lib/uuidValidator.js`; `backend/lib/validation.js` re-exports route helpers.     |
| Raw SQL in lib             | Added `backend/data/tenant.js`; `backend/lib/tenantResolver.js` uses `getTenantDomainAndName()`.            |
| Raw SQL in middleware      | Added `backend/data/systemLogs.js`; `backend/middleware/productionSafetyGuard.js` uses `insertSystemLog()`. |

**Remaining issues** (per .cursorrules: _Avoid large architectural changes_ — left for planned refactors):

- Raw SQL in 15+ other files (routes, lib, workers, server): move into `backend/data/*` incrementally.
- API routes with business logic (20+ files): introduce service layer and thin routes.
- AI calls outside Braid (10+ files): define Braid tools or document orchestration exceptions.
- Services returning HTTP: none; lib `validation.js` / `uuidValidator.js` are route-layer helpers only.
- Unused modules: archive only (intentional).
