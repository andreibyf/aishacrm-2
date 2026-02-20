# Braid + PEP Journal

## Purpose

This document tracks the architectural decisions, completed phases, and forward state
of the PEP (Plain English Programming) pipeline as it is built on top of the existing
Braid language infrastructure in AiSHA CRM.

Each entry records: what was built, what decisions were made, why, and what the next
phase inherits.

---

## Phase 1 — PEP Foundation

**Branch:** `feature/pep-foundation`
**Merged:** February 2026
**Auditor:** Claude (Anthropic)
**Status:** ✅ Complete — all 14 Definition of Done items passed

### What Was Built

| Artifact                 | Location                                          | Description                                                                         |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| PEP compiler             | `pep/compiler/`                                   | Three-phase pipeline: parser → resolver → emitter                                   |
| Entity catalog           | `pep/catalogs/entity-catalog.yaml`                | `CashFlowTransaction` entity with AiSHA binding (YAML)                              |
| Capability catalog       | `pep/catalogs/capability-catalog.yaml`            | 4 capabilities: `persist_entity`, `read_entity`, `notify_role`, `compute_next_date` |
| First PEP program        | `pep/programs/cashflow/source.pep.md`             | Recurring transaction policy in plain English                                       |
| Compiled artifacts       | `pep/programs/cashflow/`                          | `semantic_frame.json`, `braid_ir.json`, `plan.json`, `audit.json`                   |
| PEP runtime adapter      | `pep/runtime/pepRuntime.js`                       | Thin bridge to `backend/lib/braid/execution.js`                                     |
| Cash flow Braid tools    | `braid-llm-kit/examples/assistant/cashflow.braid` | 5 functions: list, get, create, update, summary                                     |
| CashFlowTransaction type | `braid-llm-kit/spec/types.braid`                  | Added after audit — was missing from types file                                     |
| 15 unit tests            | `pep/tests/compiler.test.js`                      | All passing — `node --test pep/tests/compiler.test.js`                              |
| Documentation            | `pep/README.md`                                   | Pipeline overview, CLI, catalog extension guide                                     |

### The First PEP Program

```
When a cash flow transaction is marked as recurring,
automatically create the next transaction based on the recurrence pattern.
If creation fails, notify the owner.
```

This compiles deterministically to a 5-instruction Braid IR, a `semantic_frame` with
full intent annotation, an ordered `plan`, and an `audit` with risk flags and cost estimate.

### Architectural Decisions Made

**1. PEP lives at the top level (`pep/`), not inside `backend/lib/`**

The compiler is a development-time tool, not a backend service. Only `pep/runtime/`
touches the backend infrastructure. This keeps the language concern separate from the
application concern. Future: `pep/` could become its own package.

**2. Phase 1 compiler uses no LLM**

All resolution is deterministic rule-based matching against YAML catalogs. The LLM
is not involved in compilation at all in Phase 1. This was a deliberate choice:
prove the pipeline shape works deterministically before introducing LLM-assisted
parsing in Phase 2. Cost: zero inference per compile. Reliability: 100% reproducible.

**3. Fail-closed everywhere**

The compiler never guesses. If any phase cannot resolve a term against its catalog,
it returns `{ status: "clarification_required", reason: "..." }` immediately. It
never partially emits and never throws. This is the core safety property of PEP.

**4. The IR is the stable interface**

`braid_ir.json` is the contract between the compiler and the runtime. The compiler
can change (better parsing, LLM augmentation, new grammar patterns) without touching
the runtime, as long as the IR shape is preserved. The runtime can change (different
execution engine, distributed mode) without touching the compiler.

**5. Braid was not forked**

PEP sits above Braid, not inside it. The existing `.braid` files, runtime, sandbox,
and policies are all unchanged. PEP compiles to Braid IR; Braid executes it.
The fork question will be revisited when PEP needs first-class `entity`/`event`/`goal`
syntax added to the Braid grammar itself — that is not yet needed.

**6. `CashFlowTransaction` type added to `types.braid`**

Identified during audit: `cashflow.braid` imported a type that did not exist in
`spec/types.braid`. Fixed by adding the type definition. All future Braid tools
for new entities must add their type to `spec/types.braid` before the tool file
is written.

### Defect Found During Audit (Resolved)

`cashflow.braid` imported `CashFlowTransaction` from `spec/types.braid` but the type
was not defined there. `braid-check` would have exited with an error. Fix: added the
type definition to `spec/types.braid`. Verified before merge approval.

### What Phase 1 Does NOT Do

- No API endpoint for PEP (no `POST /api/braid/compile`)
- No frontend integration
- No C.A.R.E. integration
- No LLM in the compiler
- No runtime execution of the cashflow program (runtime adapter exists but is not wired to a trigger)
- No database migration

These are all intentional. Phase 1 proves the pipeline shape. Phases 2+ wire it in.

---

## Phase 1-A — Catalog Migration from JSON to YAML

**Branch:** `feature/pep-1a-yaml-catalogs`
**Date:** February 2026
**Auditor:** Claude (Anthropic)
**Status:** ✅ Complete

### What Changed

| Before                               | After                             | Reason                                      |
| ------------------------------------ | --------------------------------- | ------------------------------------------- |
| `entity-catalog.json`                | `entity-catalog.yaml`             | Human-authored config belongs in YAML       |
| `capability-catalog.json`            | `capability-catalog.yaml`         | Comments, cleaner diffs, better readability |
| `JSON.parse()` in `index.js`         | `parseYaml()` from `yaml` package | Reads YAML catalogs                         |
| `JSON.parse()` in `compiler.test.js` | `parseYaml()` from `yaml` package | Test catalog loading                        |

### Format Decision and Rationale

Catalogs are **human-authored configuration** — they are hand-edited every time a new
domain entity or capability is added to PEP. YAML is the correct format for this use
case because:

1. **Comments** — YAML supports inline and block comments. JSON does not. Catalogs need
   explanatory comments (e.g. ISO-8601 duration values like `P7D # 7 days`).
2. **Readability** — YAML has cleaner syntax for nested structures. No braces, no quotes
   on keys, no trailing commas to manage.
3. **Git diffs** — YAML produces smaller, more readable diffs when fields are added or
   changed. JSON diffs are noisier due to structural punctuation.
4. **Convention** — Configuration-as-code tools (Kubernetes, GitHub Actions, Docker Compose)
   universally use YAML for human-authored config. This aligns PEP catalogs with industry
   convention.

The **compiled artifacts** (`semantic_frame.json`, `braid_ir.json`, `plan.json`, `audit.json`)
stay JSON. They are machine-generated output, never hand-edited, and consumed programmatically.
JSON is the correct format for machine-generated data.

### Dependency

The `yaml` package (v2.8.2) was already installed in the repo as a `devDependency` in
`backend/package.json`. No new packages were added.

### Files Changed

- `pep/catalogs/entity-catalog.yaml` — created (YAML conversion of JSON)
- `pep/catalogs/capability-catalog.yaml` — created (YAML conversion of JSON)
- `pep/catalogs/entity-catalog.json` — deleted
- `pep/catalogs/capability-catalog.json` — deleted
- `pep/compiler/index.js` — added `import { parse as parseYaml } from 'yaml'`; updated `loadDefaultCatalogs()`
- `pep/tests/compiler.test.js` — added `import { parse as parseYaml } from 'yaml'`; updated catalog loading
- `pep/README.md` — updated all catalog references from `.json` to `.yaml`; added format decision note
- `BRAID_PEP_JOURNAL.md` — this entry

### Verification

- All 15 PEP tests pass (`node --test pep/tests/compiler.test.js`)
- `node pep/programs/cashflow/generate.js` exits 0 — compiled artifacts regenerated successfully
- No references to `.json` catalog files remain in `pep/`
- YAML catalogs parse to identical JavaScript objects as the JSON originals

---

## Phase 2 — LLM Parser + Live Execution Trigger

**Branch:** `feature/pep-phase2-llm-trigger`
**Date:** February 2026
**Auditor:** Claude (Anthropic)
**Status:** ✅ Complete — all 15 Definition of Done items passed

### What Was Built

| Artifact                | Location                      | Description                                                                                          |
| ----------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ollama container        | `docker-compose.yml`          | `qwen2.5-coder:3b` on `aishanet`, port 11436:11434                                                   |
| LLM parser              | `pep/compiler/llmParser.js`   | Async `parseLLM()` — calls `generateChatCompletion` with structured system prompt                    |
| LLM parser tests        | `pep/tests/llmParser.test.js` | 8 tests with mocked `generateChatCompletion` — no real LLM calls                                     |
| Async compiler          | `pep/compiler/index.js`       | `compile()` is now async; uses LLM parser by default, `useLegacyParser` flag for deterministic regex |
| Live trigger            | `backend/routes/cashflow.js`  | `firePepTrigger()` — fire-and-forget after successful POST when `is_recurring: true`                 |
| Runtime trigger context | `pep/runtime/pepRuntime.js`   | `trigger_record` in `runtimeContext` seeds `load_entity` result (`__t0`)                             |

### What Changed from Phase 1

| Component        | Phase 1                            | Phase 2                                               |
| ---------------- | ---------------------------------- | ----------------------------------------------------- |
| Parser           | Rigid regex (`parser.js`)          | LLM-powered (`llmParser.js`) — regex kept as fallback |
| `compile()`      | Synchronous                        | Async (returns Promise)                               |
| Runtime          | Adapter exists but unwired         | Wired to `POST /api/cashflow` trigger                 |
| `load_entity` op | Placeholder `{ _entity, _loaded }` | Seeds from `trigger_record` when present              |
| Docker           | No Ollama                          | Ollama container with `qwen2.5-coder:3b`              |

### Architectural Decisions Made

**1. LLM parser is a compiler dependency, not a runtime dependency**

The LLM is used only at compile time to parse English into a CBE pattern object.
Once compiled, the IR executes deterministically — no LLM is involved in runtime
execution. This means: (a) runtime latency is unaffected by model speed, (b) a
compiled program works identically whether the LLM is available or not, and (c)
the fail-closed contract from Phase 1 is fully preserved. If the LLM cannot parse,
the compiler returns `clarification_required` — it never guesses.

**2. Local model rationale: `qwen2.5-coder:3b` via Ollama**

The backend runs inside Docker. A host-machine Ollama at `localhost:11434` is
unreachable from inside a container. Containerising Ollama on `aishanet` solves
this. `qwen2.5-coder:3b` was chosen because: (a) it is already available locally,
(b) it is CPU-only and fast (~1–2s per parse), (c) it excels at structured JSON
output — exactly what the CBE parsing task requires (classification + extraction
against a fixed output schema at temperature 0), and (d) it runs entirely on-prem
with zero API cost or external dependency.

**3. Env-driven provider configuration**

Provider, model, and base URL are all configurable via environment variables:

- `PEP_LLM_PROVIDER` (default: `"local"`)
- `PEP_LLM_MODEL` (default: `"qwen2.5-coder:3b"`)
- `LOCAL_LLM_BASE_URL` (default: `"http://ollama:11434/v1"`)

This allows switching to `anthropic`/`openai` in production without code changes.
When provider is not `"local"`, `baseUrl` is omitted and `generateChatCompletion`
routes to the appropriate cloud endpoint automatically.

**4. Fail-closed contract preserved**

The LLM parser never throws. Every failure mode returns `{ match: false, reason }`:

- Malformed JSON → `"LLM returned invalid JSON: ..."`
- Empty response → `"LLM parser unavailable: no content returned"`
- Network error / timeout → `"LLM parser unavailable: ..."`
- LLM returns `{ match: false }` → reason passed through as-is

The resolver and emitter see no difference from Phase 1. The IR is identical.

**5. Fire-and-forget trigger**

`firePepTrigger(data, req).catch(err => logger.warn(...))` — the HTTP response
(`res.status(201).json(...)`) is sent BEFORE the PEP trigger fires. PEP execution
is a side-effect, not a requirement. Errors are logged, never propagated. The POST
route behavior is completely unchanged for callers.

**6. Compiled artifacts loaded at module load time**

`cashflow.js` uses top-level `JSON.parse(readFileSync(...))` to load all four
artifacts once at import time. This avoids per-request I/O and ensures consistent
program state. If artifacts are missing or invalid, the trigger logs a warning
and skips — the route still works normally.

**7. Legacy parser preserved via `useLegacyParser` flag**

All 15 existing tests use `context.useLegacyParser: true` to remain fully
deterministic without mocking. New LLM parser tests use `mock.module()` to
intercept `generateChatCompletion`. The Phase 1 regex parser (`parser.js`) is
kept unchanged as a reference implementation and test fallback.

### Verification

- All 15 existing PEP tests pass: `node --test pep/tests/compiler.test.js` (using `useLegacyParser: true`)
- All 8 new LLM parser tests pass: `node --experimental-test-module-mocks --test pep/tests/llmParser.test.js` (mocked, no real LLM calls)
- `node pep/programs/cashflow/generate.js` exits 0 — compiled artifacts regenerated successfully
- `docker exec aishacrm-backend npm test` — full backend suite passes (1236 tests, 0 failures)
- `curl http://localhost:11436/api/tags` — confirms `qwen2.5-coder:3b` available in Ollama container

### Test Coverage

| Suite               | Tests                                  | Runner                                         |
| ------------------- | -------------------------------------- | ---------------------------------------------- |
| `compiler.test.js`  | 15 (all pass, `useLegacyParser: true`) | `node --test`                                  |
| `llmParser.test.js` | 8 (all pass, mocked LLM)               | `node --experimental-test-module-mocks --test` |
| Backend suite       | 1236 (all pass)                        | `docker exec aishacrm-backend npm test`        |

### Files Changed

- `docker-compose.yml` — added `ollama` service, `ollama_data` volume, env vars to backend
- `pep/compiler/llmParser.js` — **NEW** — LLM-powered CBE parser
- `pep/compiler/index.js` — `compile()` async, `parseLLM` default, `useLegacyParser` flag
- `pep/runtime/pepRuntime.js` — `trigger_record` support in `load_entity`
- `pep/programs/cashflow/generate.js` — `await compile()` with `useLegacyParser: true`
- `pep/tests/compiler.test.js` — `async`/`await`/`useLegacyParser` for Tests 9, 10, 11
- `pep/tests/llmParser.test.js` — **NEW** — 8 mocked LLM parser tests
- `backend/routes/cashflow.js` — `firePepTrigger()` + fire-and-forget hook after POST
- `BRAID_PEP_JOURNAL.md` — this entry

### What Phase 2 Does NOT Do

- No `POST /api/braid/compile` API endpoint (planned for Phase 3)
- No frontend integration
- No C.A.R.E. workflow builder integration
- No tenant-scoped program configuration
- No automatic artifact regeneration (still manual via `generate.js`)
- No database migration

---

## Catalog State (Current)

### Entities

| ID                    | AiSHA Table | Route           | Events                                                                |
| --------------------- | ----------- | --------------- | --------------------------------------------------------------------- |
| `CashFlowTransaction` | `cash_flow` | `/api/cashflow` | `TransactionCreated`, `TransactionUpdated`, `RecurringTransactionDue` |

### Capabilities

| ID                  | Abstract          | Policy             | Effects  | Entity Bindings                                      |
| ------------------- | ----------------- | ------------------ | -------- | ---------------------------------------------------- |
| `persist_entity`    | `StoreRecord`     | `WRITE_OPERATIONS` | `!net`   | `CashFlowTransaction` (create, update)               |
| `read_entity`       | `ReadRecord`      | `READ_ONLY`        | `!net`   | `CashFlowTransaction` (list, get)                    |
| `notify_role`       | `SendMessage`     | `WRITE_OPERATIONS` | `!net`   | owner, manager                                       |
| `compute_next_date` | `TimeCalculation` | `READ_ONLY`        | `!clock` | weekly→P7D, monthly→P1M, quarterly→P3M, annually→P1Y |

### Braid Tools Added

| Function                    | File             | Policy             |
| --------------------------- | ---------------- | ------------------ |
| `listCashFlowTransactions`  | `cashflow.braid` | `READ_ONLY`        |
| `getCashFlowTransaction`    | `cashflow.braid` | `READ_ONLY`        |
| `createCashFlowTransaction` | `cashflow.braid` | `WRITE_OPERATIONS` |
| `updateCashFlowTransaction` | `cashflow.braid` | `WRITE_OPERATIONS` |
| `getCashFlowSummary`        | `cashflow.braid` | `READ_ONLY`        |

---

## Rules for Future PEP Work

1. **Every new entity requires three things**: entry in `entity-catalog.yaml`, type definition
   in `braid-llm-kit/spec/types.braid`, and at minimum a `create`/`list` Braid tool in a
   `.braid` file.

2. **Every new capability requires a binding**: abstract capabilities with no entity binding
   will fail at resolve time. Always add at least one binding before using a capability in
   a program.

3. **Compiled artifacts are version-controlled**: `pep/programs/<domain>/` files are committed.
   They represent the verified, audited state of each program. Regenerate with `generate.js`
   after any source or catalog change, and re-run the audit.

4. **The IR is immutable across minor versions**: adding new `op` types to the IR is fine.
   Changing the shape of existing ops requires a version bump and migration of existing
   compiled programs.

5. **`pepRuntime.js` is the only PEP file that imports from `backend/`**: all other
   `pep/` files are pure Node.js with no application dependencies. Keep it that way.

6. **Audit before merge**: every PEP phase must pass a full Definition of Done audit
   before merging to main. The audit is recorded in this journal.

---

## Phase 3 — Natural Language Report Queries

**Branch:** `feature/pep-phase3-report-queries`  
**Date:** February 2026  
**Auditor:** Claude (Anthropic)  
**Status:** ✅ Implementation complete — tests pending first run

### What Was Built

| Artifact                       | Location                                 | Description                                                         |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------- |
| Phase 3 entity catalog         | `pep/catalogs/entity-catalog.yaml`       | 6 queryable entities with full field/operator definitions           |
| Views catalog                  | `pep/catalogs/entity-catalog.yaml`       | 5 queryable views under `views:` key                                |
| `query_entity` capability      | `pep/catalogs/capability-catalog.yaml`   | New READ_ONLY capability with bindings for all 11 targets           |
| `resolveQuery()`               | `pep/compiler/resolver.js`               | Validates target, fields, operators against catalog                 |
| `findQueryTarget()`            | `pep/compiler/resolver.js`               | Finds entity/view by name — entities require `fields` array         |
| `emitQuery()`                  | `pep/compiler/emitter.js`                | Emits `query_entity` IR node with all four artifacts                |
| `buildConfirmationString()`    | `pep/compiler/emitter.js`                | Human-readable description of the compiled query                    |
| Phase 3 system prompt          | `backend/routes/pep.js`                  | Query-oriented LLM prompt with full entity/view/field vocabulary    |
| `POST /api/pep/compile`        | `backend/routes/pep.js`                  | Parses English query → IR + confirmation string                     |
| `POST /api/pep/query`          | `backend/routes/pep.js`                  | Executes compiled IR against Supabase, returns rows                 |
| Route registration             | `backend/server.js`                      | `/api/pep` mounted with `authenticateRequest`                       |
| `query_entity` runtime handler | `pep/runtime/pepRuntime.js`              | Deferred handler — execution goes through `/api/pep/query` directly |
| `CustomQuery.jsx`              | `src/components/reports/CustomQuery.jsx` | Frontend query UI: input → confirm → results table + save           |
| Custom Query tab               | `src/pages/Reports.jsx`                  | "Custom Query" tab added with Sparkles icon                         |
| 10 compiler tests              | `pep/tests/queryCompiler.test.js`        | All test `resolveQuery` / `emitQuery` / `buildConfirmationString`   |
| `parseLLM` Phase 3 shape       | `pep/compiler/llmParser.js`              | Added query-shape response branch (`target` + `filters`)            |

### Queryable Surfaces

**Entities** (6) — routed through existing backend routes or Supabase direct:

| Entity         | Table            | Key filterable fields                                                            |
| -------------- | ---------------- | -------------------------------------------------------------------------------- |
| `Lead`         | `leads`          | status, source, score, assigned_to, city, country, created_date, estimated_value |
| `Contact`      | `contacts`       | status, lead_source, city, country, assigned_to, created_date, job_title         |
| `Opportunity`  | `opportunities`  | stage, amount, probability, close_date, assigned_to, ai_health                   |
| `Account`      | `accounts`       | type, industry, city, country, assigned_to, annual_revenue, health_status        |
| `Activity`     | `activities`     | type, status, priority, due_date, outcome, sentiment, assigned_to                |
| `BizDevSource` | `bizdev_sources` | source_type, status, industry, city, revenue_generated                           |

**Views** (5) — queried directly via Supabase client (no join logic needed):

| View                              | Description                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `v_crm_records`                   | Unified leads/contacts/opportunities/accounts with `record_type` discriminator |
| `v_account_related_people`        | Contacts and leads under their parent account                                  |
| `lead_detail_full`                | Leads with `account_name` pre-resolved                                         |
| `v_activity_stream`               | Activities with `related_name` pre-resolved                                    |
| `v_opportunity_pipeline_by_stage` | Pre-aggregated pipeline counts by stage                                        |

### Architectural Decisions

**1. Entities require a `fields` array to be queryable**  
`CashFlowTransaction` has `attributes` but no `fields` — it is a Phase 1 trigger entity, not a
queryable entity. `findQueryTarget()` uses the presence of a `fields` array (not a `queryable: true`
flag) to distinguish them. Clean separation with zero additional catalog overhead.

**2. Two separate system prompts for the LLM parser**  
Phase 2 uses a CBE trigger→action prompt. Phase 3 uses a query-oriented prompt with entity/view
vocabulary and date token syntax. `parseLLM()` accepts an optional third argument `systemPrompt`.
When provided, it overrides the default Phase 2 CBE prompt. Phase 2 behavior is fully preserved.

**3. Date tokens resolve at query time, not compile time**  
A saved report with `start_of_month` always means the current month when re-run. Compile time
bakes the query structure; execution time bakes the date values. This is the correct semantic.

**4. Employee name resolution is hard-fail**  
`{{resolve_employee: James}}` resolves to a UUID at query time via the `employees` table.
If zero or multiple matches are found, the query returns a 400 error with a clear message.
Silently dropping the filter would return unfiltered results — worse than useless.

**5. Tenant isolation is double-enforced**  
`resolveQuery()` rejects explicit `tenant_id` filters (error 400). The `/api/pep/query`
endpoint injects `tenant_id` unconditionally as the first Supabase filter. Both layers enforce
isolation independently. There is no code path through Phase 3 that returns cross-tenant data.

**6. Read-only contract enforced at the endpoint boundary**  
`/api/pep/query` rejects any IR node whose `op` is not `query_entity`. No write operations
are reachable through any Phase 3 code path regardless of what IR is posted.

**7. localStorage for Phase 3 saved reports**  
Reports are stored in `localStorage` under `pep_saved_reports_<tenant_id>`. Database
persistence is deferred to Phase 4. The key is tenant-scoped to prevent cross-tenant bleed
in multi-tenant browser sessions. Cap at 20 saved reports.

**8. Phase 3 query programs pass `validateCompiledProgram()`**  
Query programs are single-instruction programs (`query_entity` op). The validator now
early-returns for this case, bypassing the multi-instruction cashflow-specific checks that
would otherwise fail. Both program shapes are valid.

### Files Changed

- `pep/catalogs/entity-catalog.yaml` — added 6 queryable entities + 5 views
- `pep/catalogs/capability-catalog.yaml` — added `query_entity` capability
- `pep/compiler/resolver.js` — fixed `findQueryTarget()` (was checking `.queryable` flag that doesn't exist)
- `pep/compiler/llmParser.js` — added Phase 3 query-shape response branch
- `pep/runtime/pepRuntime.js` — added `query_entity` case + early-return for query program validation
- `backend/routes/pep.js` — **NEW** — compile + query endpoints
- `backend/server.js` — import + mount `/api/pep`
- `src/components/reports/CustomQuery.jsx` — **NEW** — query UI
- `src/pages/Reports.jsx` — import `CustomQuery`, add `Sparkles` icon, add tab

### Tests

| Suite                   | Tests                                                          | Runner                                        |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `queryCompiler.test.js` | 10 (all target resolveQuery/emitQuery/buildConfirmationString) | `node --test pep/tests/queryCompiler.test.js` |

Run tests with:

```bash
node --test pep/tests/queryCompiler.test.js
```

### Docker Build Fix (post-implementation)

After initial build, the container failed with `ERR_MODULE_NOT_FOUND` for `pepRuntime.js`. Two issues were found and fixed by VS Code Copilot:

1. `pep/` was not in the Docker build context at all — fixed by adding `COPY pep ./pep` and `COPY pep /pep` to the Dockerfile.
2. `pepRuntime.js` imports `../../backend/lib/braid/execution.js`. In the container, `backend/` source lives at `/app/` not `/backend/`, so the path resolved to `/backend/lib/...` which didn't exist and had no `node_modules`. Fixed with a single symlink: `RUN ln -s /app /backend`. This mirrors the pattern already used for `braid-llm-kit` and keeps `node_modules` resolution inside `/app`.

**Rule for future PEP work:** any file in `pep/` that imports from `backend/` will work in Docker only because of the `/backend → /app` symlink. Do not remove that symlink. Do not change the import path in `pepRuntime.js`.

### What Phase 3 Does NOT Do

- No database persistence for saved reports (localStorage only — Phase 4)
- No aggregations or GROUP BY (pre-aggregated views handle the main use cases)
- No cross-entity joins beyond what views provide
- No JSONB/array field filtering (`metadata`, `tags`)
- No scheduling or recurring queries
- No export of query results to CSV/PDF
- No `GET /api/pep/saved-reports` endpoint
