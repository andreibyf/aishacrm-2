# PLAN

## Feature Identity

- **Name**: PEP Phase 2 — LLM Parser + Live Execution Trigger
- **Description**: Two connected things: (1) replace the rigid Phase 1 regex parser with an
  LLM-powered parser that accepts more natural English, and (2) wire the compiled cashflow
  recurring transaction program to an actual execution trigger in the backend. After Phase 2,
  writing a PEP program in plain English produces a plan that actually runs in production.
- **Value**: Phase 1 proved the pipeline shape. Phase 2 makes it real — the first PEP program
  executes live code in response to a real business event.

---

## What Changes and What Stays the Same

### Changes

- `docker-compose.yml` — add `ollama` service on `aishanet` network
- `pep/compiler/llmParser.js` — new file, LLM-powered parser
- `pep/compiler/index.js` — use `llmParser` by default; `compile()` becomes async
- `pep/runtime/pepRuntime.js` — accept `trigger_record` in context; seed `__t0` from it
- `pep/programs/cashflow/generate.js` — await async `compile()`
- `pep/tests/compiler.test.js` — await async `compile()`; add `useLegacyParser: true`
- `pep/tests/llmParser.test.js` — new file, 8 tests with mocked LLM
- `backend/routes/cashflow.js` — additive non-blocking `firePepTrigger` hook after POST
- `BRAID_PEP_JOURNAL.md` — Phase 2 entry

### Does NOT Change

- `pep/compiler/parser.js` — kept as-is (legacy fallback for tests)
- `pep/compiler/resolver.js` — untouched
- `pep/compiler/emitter.js` — untouched
- `pep/catalogs/` — untouched
- `cashflow.braid` — untouched
- `braid-llm-kit/` — untouched
- All existing backend routes other than the additive hook in `cashflow.js`
- All existing frontend code

---

## Step 0 — Ollama Container (Prerequisite)

The LLM parser uses a local model served by Ollama running as a Docker container
on the `aishanet` network. This must be in place before the LLM parser can run.

### Why containerised

The backend runs inside Docker. A host-machine Ollama at `localhost:11434` is
unreachable from inside a container. The Ollama container joins `aishanet` so
the backend reaches it by service name: `http://ollama:11434`.

### Model

**`qwen2.5-coder:3b`** — already available locally, CPU-only, fast, strong at
structured JSON output. Ideal for the PEP parsing task (classification + extraction,
fixed output schema, temperature 0).

### Changes to `docker-compose.yml`

Add the following service (after `redis-cache`, before `backend`):

```yaml
# Ollama — local LLM server for PEP compiler parser
ollama:
  image: ollama/ollama:latest
  container_name: aishacrm-ollama
  restart: unless-stopped
  ports:
    - '11434:11434'
  volumes:
    - ollama_data:/root/.ollama
  healthcheck:
    test: ['CMD-SHELL', 'ollama list || exit 1']
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 20s
  logging:
    driver: json-file
    options:
      max-size: '5m'
      max-file: '2'
  networks:
    - aishanet
```

Add to the `volumes` block at the bottom of `docker-compose.yml`:

```yaml
ollama_data:
  driver: local
```

Add `ollama` to the `backend` service `depends_on` block:

```yaml
depends_on:
  redis-memory:
    condition: service_healthy
  redis-cache:
    condition: service_healthy
  ollama:
    condition: service_healthy
```

Add the following environment variable to the `backend` service `environment` block:

```yaml
- LOCAL_LLM_BASE_URL=http://ollama:11434/v1
- PEP_LLM_PROVIDER=local
- PEP_LLM_MODEL=qwen2.5-coder:3b
```

### One-time model pull (after container first starts)

```bash
docker compose up ollama -d
docker exec aishacrm-ollama ollama pull qwen2.5-coder:3b
```

The model lives in the `ollama_data` volume and persists across restarts. This
command only needs to be run once.

### Verifiable Output for Step 0

```bash
curl http://localhost:11434/api/tags
# Should list qwen2.5-coder:3b in the response
```

---

## Part A — LLM Parser

### What the LLM Parser Does

The Phase 1 parser used regex to match a rigid CBE grammar. It failed on anything
slightly off-pattern (e.g. "whenever" instead of "when", passive voice, different word
order). The LLM parser replaces that regex with an LLM call that normalizes free-form
English into the same CBE pattern object.

**The output contract is identical.** The LLM parser returns the exact same shape
as the Phase 1 parser:

```javascript
// Success
{
  match: true,
  trigger: { entity_ref: string, state_change: string },
  action: { capability_ref: string, entity_ref: string, attribute_ref: string },
  fallback: { outcome_condition: string, capability_ref: string, role_ref: string } | null,
  raw: string
}

// Failure (fail-closed)
{
  match: false,
  reason: string
}
```

The resolver, emitter, and runtime see no difference. The IR is identical. Only the
parsing step changes.

### LLM Provider

Use `generateChatCompletion` from `backend/lib/aiEngine/llmClient.js` with:

- `provider: process.env.PEP_LLM_PROVIDER || "local"`
- `model: process.env.PEP_LLM_MODEL || "qwen2.5-coder:3b"`
- `baseUrl: process.env.LOCAL_LLM_BASE_URL || "http://ollama:11434/v1"` (when provider is "local")
- `temperature: 0` (deterministic — this is a parsing task, not a creative one)

Anthropic remains available as a fallback by setting `PEP_LLM_PROVIDER=anthropic` and
`PEP_LLM_MODEL=claude-haiku-4-5-20251001` in the environment. No code change needed —
`generateChatCompletion` already supports both providers.

### System Prompt for the LLM Parser

The system prompt instructs the LLM to act as a strict CBE parser. It must:

1. Return ONLY valid JSON — no preamble, no markdown, no explanation
2. Map the English to the CBE pattern object shape exactly
3. Return `{ "match": false, "reason": "..." }` if it cannot confidently parse
4. Never invent entities or capabilities not present in the provided catalog summaries

The system prompt includes a compact summary of the entity and capability catalogs
so the LLM knows what terms are valid.

### Fail-Closed Contract Preserved

If the LLM:

- Returns malformed JSON → parser returns `{ match: false, reason: "LLM returned invalid JSON" }`
- Returns a pattern with unrecognized entity or capability → resolver catches it (unchanged)
- Returns `{ match: false }` → passed through as-is
- Throws or times out → parser returns `{ match: false, reason: "LLM parser unavailable" }`

The parser **never throws**. The pipeline fail-closed contract is fully preserved.

### New File: `pep/compiler/llmParser.js`

The LLM parser lives in a new file. `parser.js` is kept for reference and for use
in tests that do not want to make LLM calls. `index.js` is updated to use `llmParser.js`
by default, with a `context.useLegacyParser` flag to fall back to `parser.js` for tests.

```javascript
// pep/compiler/llmParser.js
export async function parseLLM(englishSource, catalogs) → { match, trigger, action, fallback, raw }
```

### Updated `index.js` compile() signature

`compile()` becomes async (returns a Promise) because the LLM call is async:

```javascript
// Before (sync)
const result = compile(source, context);

// After (async)
const result = await compile(source, context);
```

**All callers must be updated to await.** In Phase 2 the only callers are:

- `pep/tests/compiler.test.js` (updated)
- `pep/programs/cashflow/generate.js` (updated)
- The new trigger hook in `backend/routes/cashflow.js` (already async)

---

## Part B — Live Execution Trigger

### What the Trigger Does

When `POST /api/cashflow` succeeds and the created record has `is_recurring: true`,
the backend fires the compiled PEP cashflow program asynchronously. If the PEP
execution fails, it logs the error but does NOT affect the HTTP response to the caller.
The POST still returns 201. PEP execution is a side-effect, not a requirement.

This is the correct first wiring: additive, non-blocking, zero regression risk.

### Where the Hook Lives

In `backend/routes/cashflow.js`, after the successful `supabase.insert()`:

```javascript
// After successful insert — fire PEP trigger (non-blocking)
if (data.is_recurring) {
  firePepTrigger(data, req).catch((err) =>
    logger.warn('[PEP] Recurring trigger failed silently:', err.message),
  );
}
```

`firePepTrigger` is a local async function in the route file. It:

1. Uses compiled artifacts loaded at module load time from `pep/programs/cashflow/`
2. Imports `validateCompiledProgram` and `executePepProgram` from `pep/runtime/pepRuntime.js`
3. Builds the runtime context from the request (`tenant_id`, `actor`)
4. Calls `executePepProgram(compiled, runtimeContext)`
5. Logs the result at info level

### What `executePepProgram` Receives

```javascript
const compiled = {
  status: 'compiled',
  semantic_frame: <from semantic_frame.json>,
  braid_ir: <from braid_ir.json>,
  plan: <from plan.json>,
  audit: <from audit.json>
};

const runtimeContext = {
  tenant_id: req.tenant.id,
  actor: req.user?.id || 'system',
  trigger_record: data  // the newly created cash_flow record
};
```

### `pepRuntime.js` Update — Trigger Context

`executePepProgram` receives `trigger_record` in `runtimeContext` and uses it to
seed the `load_entity` instruction result (`__t0`) with the actual record data,
so the `check_condition` and subsequent instructions operate on real data.

---

## New Files

| File                          | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `pep/compiler/llmParser.js`   | LLM-powered parser — replaces regex parser for production use |
| `pep/tests/llmParser.test.js` | Tests for LLM parser with mocked LLM responses                |

## Modified Files

| File                                | Change                                                          |
| ----------------------------------- | --------------------------------------------------------------- |
| `docker-compose.yml`                | Add `ollama` service, `ollama_data` volume, env vars to backend |
| `pep/compiler/index.js`             | Use `llmParser` by default; `compile()` becomes async           |
| `pep/runtime/pepRuntime.js`         | Accept `trigger_record` in context; seed `__t0` from it         |
| `pep/programs/cashflow/generate.js` | Await async `compile()`                                         |
| `pep/tests/compiler.test.js`        | Await async `compile()`; use `useLegacyParser: true`            |
| `backend/routes/cashflow.js`        | Add non-blocking `firePepTrigger` hook after successful POST    |
| `BRAID_PEP_JOURNAL.md`              | Phase 2 entry                                                   |

---

## Ordered Implementation Steps

| #   | Step                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verifiable Output                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 0   | Update `docker-compose.yml` — add `ollama` service, `ollama_data` volume, env vars (`LOCAL_LLM_BASE_URL`, `PEP_LLM_PROVIDER`, `PEP_LLM_MODEL`) to backend service. Run `docker compose up ollama -d` then `docker exec aishacrm-ollama ollama pull qwen2.5-coder:3b`                                                                                                                                                                                                    | `curl http://localhost:11434/api/tags` lists `qwen2.5-coder:3b`                                                     |
| 1   | Create `pep/compiler/llmParser.js` — async `parseLLM(englishSource, catalogs)` that calls `generateChatCompletion` with `provider: process.env.PEP_LLM_PROVIDER \|\| "local"`, `model: process.env.PEP_LLM_MODEL \|\| "qwen2.5-coder:3b"`, `baseUrl: process.env.LOCAL_LLM_BASE_URL \|\| "http://ollama:11434/v1"`, `temperature: 0`, structured system prompt with catalog summaries injected. Returns CBE pattern object or `{ match: false, reason }`. Never throws. | File exists; exports `parseLLM`                                                                                     |
| 2   | Update `pep/compiler/index.js` — make `compile()` async; import and use `parseLLM` by default; add `context.useLegacyParser` flag that falls back to synchronous `parse()` from `parser.js`                                                                                                                                                                                                                                                                             | `await compile(source, { useLegacyParser: true })` returns same result as Phase 1                                   |
| 3   | Update `pep/programs/cashflow/generate.js` — add `await` before `compile()`                                                                                                                                                                                                                                                                                                                                                                                             | `node pep/programs/cashflow/generate.js` exits 0                                                                    |
| 4   | Update `pep/tests/compiler.test.js` — add `await` to all `compile()` calls; add `useLegacyParser: true` to all compiler test contexts                                                                                                                                                                                                                                                                                                                                   | All 15 existing tests still pass: `node --test pep/tests/compiler.test.js`                                          |
| 5   | Create `pep/tests/llmParser.test.js` — 8 tests with mocked `generateChatCompletion` (see test table below)                                                                                                                                                                                                                                                                                                                                                              | All 8 tests pass: `node --test pep/tests/llmParser.test.js`                                                         |
| 6   | Update `pep/runtime/pepRuntime.js` — accept `runtimeContext.trigger_record`; seed `results[instruction.assign]` with it in the `load_entity` handler when present                                                                                                                                                                                                                                                                                                       | `validateCompiledProgram` still passes; `__t0` seeded correctly from trigger record                                 |
| 7   | Update `backend/routes/cashflow.js` — add `firePepTrigger` async function and non-blocking `.catch()` call after successful POST when `data.is_recurring` is true. Load compiled artifacts at module load time using `readFileSync` with `import.meta.url` path resolution. Import `validateCompiledProgram` and `executePepProgram` from `pep/runtime/pepRuntime.js`. Errors caught and logged, never propagated to HTTP response                                      | Existing POST route tests pass; `is_recurring: true` in POST body triggers log line `[PEP] Recurring trigger fired` |
| 8   | Run full backend test suite                                                                                                                                                                                                                                                                                                                                                                                                                                             | `npm test` (from `backend/`) exits 0                                                                                |
| 9   | Run full PEP test suite                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `node --test pep/tests/compiler.test.js` and `node --test pep/tests/llmParser.test.js` both exit 0                  |
| 10  | Regenerate compiled artifacts                                                                                                                                                                                                                                                                                                                                                                                                                                           | `node pep/programs/cashflow/generate.js` exits 0                                                                    |
| 11  | Update `BRAID_PEP_JOURNAL.md` with Phase 2 entry                                                                                                                                                                                                                                                                                                                                                                                                                        | Journal updated                                                                                                     |

---

## System Prompt for LLM Parser

Copilot must implement the system prompt in `llmParser.js` exactly as follows:

```
You are a strict CBE (Controlled Business English) parser for a business automation system.

Your task: parse a plain English business rule into a structured JSON pattern object.

OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- If you cannot confidently parse the input, return: { "match": false, "reason": "<why>" }
- Never invent entities or capabilities not in the catalog summaries below.

OUTPUT SHAPE (on success):
{
  "match": true,
  "trigger": {
    "entity_ref": "<entity name in plain English>",
    "state_change": "<what condition triggers this>"
  },
  "action": {
    "capability_ref": "<verb phrase describing what to do>",
    "entity_ref": "<entity being acted on>",
    "attribute_ref": "<field or pattern driving the action>"
  },
  "fallback": {
    "outcome_condition": "<condition that triggers fallback>",
    "capability_ref": "<fallback action verb phrase>",
    "role_ref": "<role to notify>"
  } | null
}

VALID ENTITIES: {entity_summary}
VALID CAPABILITIES: {capability_summary}

Return { "match": false, "reason": "..." } if:
- The intent does not describe a trigger → action pattern
- The entity or capability cannot be mapped to the catalog
- The input is ambiguous or incomplete
```

`{entity_summary}` is a compact one-line-per-entity summary built from `entity-catalog.yaml`:

```
CashFlowTransaction — a financial transaction record (income or expense) in table cash_flow
```

`{capability_summary}` is a compact one-line-per-capability summary built from `capability-catalog.yaml`:

```
persist_entity — create or update a business entity record
read_entity — read or list business entity records
notify_role — notify a role (owner, manager) about an event
compute_next_date — calculate the next occurrence date from a recurrence pattern
```

---

## Test Strategy for LLM Parser (Step 5)

All 8 tests mock `generateChatCompletion` using `node:test` mock utilities. No real LLM calls.

| Test | Mock LLM Response                                               | Expected Result                                                   |
| ---- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1    | Valid CBE pattern JSON (full, with fallback)                    | `{ match: true, trigger: {...}, action: {...}, fallback: {...} }` |
| 2    | `{ "match": false, "reason": "unclear trigger" }`               | `{ match: false, reason: "unclear trigger" }`                     |
| 3    | Malformed JSON (`"not json at all"`)                            | `{ match: false, reason: contains "invalid JSON" }`               |
| 4    | Empty string response                                           | `{ match: false }`                                                |
| 5    | Valid pattern JSON but missing `fallback` key                   | `{ match: true, fallback: null }`                                 |
| 6    | `generateChatCompletion` throws network error                   | `{ match: false, reason: contains "unavailable" }`                |
| 7    | Verify system prompt sent to LLM contains "CashFlowTransaction" | Asserted via mock call args                                       |
| 8    | Verify `temperature: 0` sent to LLM                             | Asserted via mock call args                                       |

---

## Definition of Done

- [ ] `docker-compose.yml` has `ollama` service on `aishanet` network with `ollama_data` volume
- [ ] `qwen2.5-coder:3b` pulled and available: `curl http://localhost:11434/api/tags` confirms
- [ ] Backend service has `LOCAL_LLM_BASE_URL`, `PEP_LLM_PROVIDER`, `PEP_LLM_MODEL` env vars
- [ ] `pep/compiler/llmParser.js` exists and exports `parseLLM`
- [ ] `compile()` in `index.js` is async and uses `parseLLM` by default
- [ ] `context.useLegacyParser: true` falls back to synchronous `parser.js`
- [ ] All 15 existing PEP tests pass (using `useLegacyParser: true`)
- [ ] All 8 new LLM parser tests pass (mocked — no real LLM calls)
- [ ] `generate.js` awaits `compile()` and exits 0
- [ ] `backend/routes/cashflow.js` has non-blocking `firePepTrigger` after successful POST
- [ ] Trigger fires when `is_recurring: true` in POST body — log line confirmed
- [ ] Trigger errors caught, logged, never affect HTTP response
- [ ] `pepRuntime.js` seeds `__t0` from `trigger_record` when present
- [ ] All existing backend route tests pass
- [ ] `BRAID_PEP_JOURNAL.md` updated

---

## Notes for Copilot (Phase 2)

1. **`compile()` must stay fail-closed**: wrap the `parseLLM` call in try/catch inside
   `index.js`. If `parseLLM` throws for any reason, return `{ status: "clarification_required" }`.

2. **Provider and model are env-driven**: use `process.env.PEP_LLM_PROVIDER || "local"` and
   `process.env.PEP_LLM_MODEL || "qwen2.5-coder:3b"`. Never hardcode values without env fallbacks.
   When provider is `"local"`, pass `baseUrl: process.env.LOCAL_LLM_BASE_URL || "http://ollama:11434/v1"`
   to `generateChatCompletion`. When provider is `"anthropic"`, omit `baseUrl`.

3. **Do not make real LLM calls in tests**: use `node:test` mock to intercept
   `generateChatCompletion`. Import the mock before importing `llmParser`.

4. **The trigger in `cashflow.js` is fire-and-forget**: use `.catch()` not `await`.
   The HTTP response must not wait for PEP execution. Use `.catch()` on the promise directly,
   not `try/catch` around the call.

5. **Read compiled artifacts at module load time in `cashflow.js`**: use top-level
   `JSON.parse(readFileSync(...))` with `import.meta.url` path resolution. Load once,
   not on every request.

6. **Do not change the existing POST route logic**: insert, validation, and response are
   untouched. The PEP hook is appended after `res.status(201).json(...)` is called.

7. **`useLegacyParser` flag**: check `context.useLegacyParser === true` in `index.js`
   and call synchronous `parse()` from `parser.js` instead of `parseLLM`. This keeps
   all 15 existing tests deterministic without needing to mock Ollama.

8. **Temperature must be 0**: parsing is not a creative task. Same input must always
   produce the same output.

9. **Ollama healthcheck**: the `ollama list` command used in the healthcheck requires
   the model to already be pulled. If the container starts before the model is pulled,
   the healthcheck will fail until the pull completes. This is expected on first boot.
   Pull the model immediately after `docker compose up ollama -d`.

---

# PEP Phase 3 — Natural Language Report Queries

## Feature Identity

- **Name**: PEP Phase 3 — Natural Language Report Queries
- **Description**: Allow business users to query CRM data in plain English. The user types a
  sentence describing what they want to see. PEP compiles it to a structured `query_entity` IR
  node, executes it against the database, and returns results rendered in the Reports UI.
  Read-only. Single-entity or single-view per query. No scheduling, no endpoints yet.
- **Value**: Eliminates the IT bottleneck for ad-hoc reporting. Any user can get exactly the
  data slice they need without knowing SQL, without waiting for a developer, and without
  exporting to Excel.

---

## Scope Boundaries

### In scope

- Natural language → structured query → results in the Reports UI
- Six queryable entities: `leads`, `contacts`, `opportunities`, `accounts`,
  `bizdev_sources`, `activities`
- Five queryable views: `v_crm_records`, `v_account_related_people`, `lead_detail_full`,
  `v_activity_stream`, `v_opportunity_pipeline_by_stage`
- Filter operators: equals, not equals, greater than, less than, contains, in list,
  is null, is not null, date relative (e.g. last 30 days, this quarter, this year)
- Sort by any filterable field, ascending or descending
- Limit (default 100, max 500)
- `assigned_to` resolved by employee name → UUID lookup
- Results rendered as a table in a new "Custom Query" tab in the Reports page
- Query definition storable as a named saved report (name + compiled IR, persisted per tenant)
- "What the system understood" confirmation strip shown before results render

### Explicitly out of scope for Phase 3

- Scheduled execution (Phase 4)
- API endpoint exposure (Phase 4)
- Cross-entity joins beyond what the existing views already provide
- Aggregations and grouping (COUNT, SUM, GROUP BY) — views handle the pre-aggregated cases
- Write operations of any kind
- JSONB field querying (metadata, tags, activity_metadata)
- Pagination beyond the limit parameter

---

## What Changes and What Stays the Same

### Changes

- `pep/catalogs/entity-catalog.yaml` — extend with six entities and five views
- `pep/catalogs/capability-catalog.yaml` — add `query_entity` capability
- `pep/compiler/index.js` — handle `query_entity` IR node type in emitter
- `pep/compiler/emitter.js` — emit `query_entity` IR from resolved semantic frame
- `pep/compiler/resolver.js` — resolve query targets, filter fields, operators
- `pep/runtime/pepRuntime.js` — execute `query_entity` nodes via new query endpoint
- `backend/routes/pep.js` — new file: `POST /api/pep/compile` and `POST /api/pep/query`
- `backend/routes/index.js` — register `/api/pep` route
- `src/pages/Reports.jsx` — add "Custom Query" tab
- `src/components/reports/CustomQuery.jsx` — new component: query input, confirmation
  strip, results table, save report button
- `BRAID_PEP_JOURNAL.md` — Phase 3 entry

### Does NOT Change

- `pep/compiler/parser.js` — untouched (legacy fallback)
- `pep/compiler/llmParser.js` — untouched (Phase 2 parser used as-is)
- `pep/programs/cashflow/` — untouched
- `backend/routes/cashflow.js` — untouched
- All existing report tabs (Overview, Sales Analytics, Lead Analytics, etc.)
- All existing entity API routes
- Supabase schema — no migrations required (read-only, uses existing tables and views)

---

## Data Model: Queryable Surfaces

The catalog declares two categories of queryable surface: **entities** (direct table
access via existing backend routes) and **views** (pre-joined surfaces requiring the
new generic query endpoint).

### Entities

| Entity         | Backend Route               | Key Filterable Fields                                                                                                        |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Lead`         | `GET /api/v2/leads`         | status, source, score, assigned_to, city, country, created_date, last_contacted, qualification_status, estimated_value, tags |
| `Contact`      | `GET /api/v2/contacts`      | status, lead_source, city, country, assigned_to, created_date, last_contacted, job_title, tags                               |
| `Opportunity`  | `GET /api/v2/opportunities` | stage, amount, probability, close_date, assigned_to, lead_source, ai_health, last_activity_date, score                       |
| `Account`      | `GET /api/v2/accounts`      | type, industry, city, country, assigned_to, annual_revenue, employee_count, health_status, last_activity_date, score         |
| `Activity`     | `GET /api/v2/activities`    | type, status, priority, due_date, outcome, sentiment, assigned_to, related_to, created_date                                  |
| `BizDevSource` | `GET /api/bizdevsources`    | source_type, status, priority, industry, city, country, leads_generated, revenue_generated, created_date                     |

### Views

Views do not have dedicated backend routes. They are queried via the new
`POST /api/pep/query` endpoint which executes a parameterised Supabase select
directly against the view name.

| View                              | Description                                         | Key Columns                                                                      |
| --------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `v_crm_records`                   | Unified leads + contacts + opportunities + accounts | record_type, title, email, status, assigned_to, updated_at                       |
| `v_account_related_people`        | Contacts and leads under an account                 | account_id, person_type, first_name, last_name, email, status                    |
| `lead_detail_full`                | Leads with account name pre-resolved                | all lead fields + account_name                                                   |
| `v_activity_stream`               | Activities with related context                     | type, subject, status, priority, assigned_to, related_to, related_name, due_date |
| `v_opportunity_pipeline_by_stage` | Pre-aggregated pipeline counts                      | stage, count (tenant-scoped)                                                     |

### Relationships (UUID keys)

The following FK relationships exist in the schema. The LLM system prompt must
include these so it can correctly identify when a view is more appropriate than
a direct entity query.

```
bizdev_sources.account_id      → accounts.id
bizdev_sources.lead_ids (jsonb) → leads.id (array)
leads.account_id               → accounts.id
contacts.account_id            → accounts.id
opportunities.account_id       → accounts.id
opportunities.contact_id       → contacts.id
opportunities.lead_id          → leads.id
activities.related_id          → polymorphic (related_to indicates entity type)
all entities.assigned_to       → employees.id
```

---

## IR Extension: `query_entity` Node

A new IR node type added alongside the existing `load_entity`, `check_condition`,
`persist_entity`, `notify_role` node types.

```yaml
# Example compiled IR for: "show me all open leads assigned to James created this month"
program: open_leads_james_this_month
trigger: on_demand
actions:
  - type: query_entity
    target: Lead # entity name or view name
    target_kind: entity # "entity" | "view"
    filters:
      - field: status
        operator: eq
        value: open
      - field: assigned_to
        operator: eq
        value: '{{resolve_employee: James}}'
      - field: created_date
        operator: gte
        value: '{{date: start_of_month}}'
    sort:
      field: created_date
      direction: desc
    limit: 100
    assign: results
fallback:
  notify: 'Query failed to execute'
```

### Filter Operators

| Operator      | Meaning               | Example                         |
| ------------- | --------------------- | ------------------------------- |
| `eq`          | equals                | status eq 'open'                |
| `neq`         | not equals            | stage neq 'closed_lost'         |
| `gt`          | greater than          | amount gt 10000                 |
| `gte`         | greater than or equal | created_date gte start_of_month |
| `lt`          | less than             | score lt 50                     |
| `lte`         | less than or equal    | close_date lte end_of_quarter   |
| `contains`    | text contains (ilike) | company contains 'tech'         |
| `in`          | in list               | status in ['new','contacted']   |
| `is_null`     | field is null         | last_contacted is_null          |
| `is_not_null` | field is not null     | close_date is_not_null          |

### Date Relative Values

The following template tokens are resolved at runtime to actual dates:

| Token                        | Resolves To                                         |
| ---------------------------- | --------------------------------------------------- |
| `{{date: today}}`            | Current date                                        |
| `{{date: start_of_month}}`   | First day of current month                          |
| `{{date: end_of_month}}`     | Last day of current month                           |
| `{{date: start_of_quarter}}` | First day of current quarter                        |
| `{{date: end_of_quarter}}`   | Last day of current quarter                         |
| `{{date: start_of_year}}`    | First day of current year                           |
| `{{date: last_N_days}}`      | today minus N days (N extracted from user sentence) |

### Employee Name Resolution

`{{resolve_employee: <name>}}` tokens are resolved at runtime by the query endpoint.
The runtime calls `GET /api/employees?tenant_id=<id>&search=<name>` and substitutes
the matched employee UUID. If no match is found the query returns an error with
`reason: "Could not resolve employee name: <name>"`.

---

## New Backend: `backend/routes/pep.js`

Two endpoints:

### `POST /api/pep/compile`

Accepts a plain English query sentence and tenant context. Returns a compiled
`query_entity` IR node and a human-readable confirmation string.

**Request:**

```json
{
  "source": "show me all open leads assigned to James created this month",
  "tenant_id": "<uuid>"
}
```

**Response (success):**

```json
{
  "status": "success",
  "data": {
    "ir": { ...query_entity IR node... },
    "confirmation": "Showing Leads where status = open, assigned to James, created in December 2025, sorted by created date descending",
    "target": "Lead",
    "target_kind": "entity"
  }
}
```

**Response (parse failure):**

```json
{
  "status": "clarification_required",
  "reason": "Could not identify a queryable entity in your request"
}
```

### `POST /api/pep/query`

Accepts a compiled `query_entity` IR node and tenant context. Executes against
the database and returns results.

**Request:**

```json
{
  "ir": { ...query_entity IR node... },
  "tenant_id": "<uuid>"
}
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "rows": [...],
    "count": 42,
    "target": "Lead",
    "executed_at": "2026-02-20T14:00:00Z"
  }
}
```

For `target_kind: entity` — routes through existing entity backend endpoints.
For `target_kind: view` — executes directly via Supabase client with parameterised
filters. `tenant_id` is always injected as a mandatory filter regardless of what
the IR specifies, enforcing tenant isolation.

---

## LLM System Prompt for Phase 3 Parser

The Phase 3 LLM parser uses the same `parseLLM` infrastructure from Phase 2 but
with a different system prompt — one oriented to query extraction rather than
trigger-action extraction.

```
You are a strict query parser for a CRM reporting system.

Your task: parse a plain English report request into a structured JSON query object.

OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- If you cannot confidently parse the input, return: { "match": false, "reason": "<why>" }
- Never invent entities, fields, or operators not listed below.

OUTPUT SHAPE (on success):
{
  "match": true,
  "target": "<entity or view name>",
  "target_kind": "entity" | "view",
  "filters": [
    { "field": "<field>", "operator": "<operator>", "value": "<value>" }
  ],
  "sort": { "field": "<field>", "direction": "asc" | "desc" } | null,
  "limit": <number> | null
}

VALID ENTITIES AND FIELDS:
{entity_field_summary}

VALID VIEWS:
{view_summary}

VALID OPERATORS: eq, neq, gt, gte, lt, lte, contains, in, is_null, is_not_null

DATE RELATIVE TOKENS (use these for date values):
today, start_of_month, end_of_month, start_of_quarter, end_of_quarter, start_of_year, last_N_days

EMPLOYEE NAMES: if a filter references a person's name for assigned_to,
use value format: "{{resolve_employee: <name>}}"

ENTITY RELATIONSHIPS:
{relationship_summary}

Return { "match": false, "reason": "..." } if:
- No entity or view can be identified
- A requested field does not exist on the identified entity
- The request is ambiguous between two entities
```

---

## New Frontend: `src/components/reports/CustomQuery.jsx`

### User Flow

1. User types a plain English query into a text input and presses Enter or clicks Run
2. Frontend calls `POST /api/pep/compile` with the sentence
3. If `status: clarification_required` — show inline error asking user to rephrase
4. If `status: success` — show confirmation strip: "Showing [entity] where [conditions]"
5. User clicks Confirm (or results render automatically with a Cancel option)
6. Frontend calls `POST /api/pep/query` with the compiled IR
7. Results render as a sortable table
8. User can click "Save Report" — prompts for a name, stores `{ name, ir, confirmation }` in
   `localStorage` under `pep_saved_reports_<tenant_id>` (Phase 3 uses localStorage;
   database persistence is Phase 4)

### Component Structure

```
CustomQuery
├── QueryInput          — text input + Run button
├── ConfirmationStrip   — "Showing X where Y" + Confirm/Cancel
├── ResultsTable        — sortable columns, row count, loading state
└── SaveReportBar       — name input + Save button (shown after results render)
```

### Reports.jsx Change

Add one new tab entry to `reportTabs`:

```javascript
{
  id: "custom-query",
  label: "Custom Query",
  icon: Sparkles,
  iconColor: "text-violet-400",
  component: <CustomQuery tenantFilter={currentScopedFilter} />
}
```

---

## New Files

| File                                     | Description                                                 |
| ---------------------------------------- | ----------------------------------------------------------- |
| `backend/routes/pep.js`                  | `POST /api/pep/compile` and `POST /api/pep/query` endpoints |
| `src/components/reports/CustomQuery.jsx` | Custom query UI component                                   |
| `pep/tests/queryCompiler.test.js`        | Tests for Phase 3 query compilation                         |

## Modified Files

| File                                   | Change                                                          |
| -------------------------------------- | --------------------------------------------------------------- |
| `pep/catalogs/entity-catalog.yaml`     | Add six entities and five views with full field vocabulary      |
| `pep/catalogs/capability-catalog.yaml` | Add `query_entity` capability                                   |
| `pep/compiler/emitter.js`              | Emit `query_entity` IR node type                                |
| `pep/compiler/resolver.js`             | Resolve query targets, fields, operators, date tokens           |
| `pep/compiler/index.js`                | Route `query_entity` parse results through resolver and emitter |
| `pep/runtime/pepRuntime.js`            | Execute `query_entity` nodes via query endpoint                 |
| `backend/routes/index.js`              | Register `pep` router at `/api/pep`                             |
| `src/pages/Reports.jsx`                | Add Custom Query tab                                            |
| `BRAID_PEP_JOURNAL.md`                 | Phase 3 entry                                                   |

---

## Ordered Implementation Steps

| #   | Step                                                                                                                                                                                                                                                                                                                                                                                 | Verifiable Output                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Extend `pep/catalogs/entity-catalog.yaml` with six entity entries (Lead, Contact, Opportunity, Account, Activity, BizDevSource) each with full field list, field types, and valid operators per field                                                                                                                                                                                | YAML valid; each entity has `fields` array with `name`, `type`, `operators` keys                                                                                  |
| 2   | Extend `pep/catalogs/capability-catalog.yaml` with `query_entity` capability entry including description and output contract                                                                                                                                                                                                                                                         | YAML valid; `query_entity` entry present                                                                                                                          |
| 3   | Add five view entries to entity catalog under a `views` key: `v_crm_records`, `v_account_related_people`, `lead_detail_full`, `v_activity_stream`, `v_opportunity_pipeline_by_stage`, each with column list                                                                                                                                                                          | YAML valid; views section present                                                                                                                                 |
| 4   | Update `pep/compiler/resolver.js` — add `resolveQuery()` function that validates target name against catalog, validates each filter field against entity/view column list, validates operators, returns resolved IR or error                                                                                                                                                         | `resolveQuery({ target: 'Lead', filters: [{field:'status', operator:'eq', value:'open'}] })` returns resolved IR                                                  |
| 5   | Update `pep/compiler/emitter.js` — add `emitQuery()` that takes resolved query frame and produces `query_entity` IR node YAML/JSON                                                                                                                                                                                                                                                   | Emitted IR contains `type: query_entity`, `target`, `filters`, `sort`, `limit`, `assign` keys                                                                     |
| 6   | Update `pep/compiler/index.js` — detect query intent in parsed result (presence of `target` key vs `trigger` key), route to `resolveQuery` + `emitQuery` path                                                                                                                                                                                                                        | `await compile('show me open leads')` returns `{ status: 'compiled', braid_ir: { type: 'query_entity', ... } }`                                                   |
| 7   | Create `pep/tests/queryCompiler.test.js` — 10 tests covering: valid entity query, valid view query, unknown entity rejection, unknown field rejection, invalid operator rejection, employee name token present, date token present, missing target rejection, sort emitted correctly, limit emitted correctly                                                                        | All 10 tests pass: `node --test pep/tests/queryCompiler.test.js`                                                                                                  |
| 8   | Create `backend/routes/pep.js` — `POST /api/pep/compile`: calls `compile()` with phase 3 query system prompt, returns IR + confirmation string. `POST /api/pep/query`: resolves employee name tokens, resolves date tokens, executes query against entity route or Supabase view, returns rows + count. Both endpoints require `tenant_id`. Tenant isolation enforced on all queries | `curl -X POST /api/pep/compile -d '{"source":"show me open leads","tenant_id":"..."}' ` returns `{ status: "success", data: { ir: {...}, confirmation: "..." } }` |
| 9   | Register `pep` router in `backend/routes/index.js`                                                                                                                                                                                                                                                                                                                                   | `POST /api/pep/compile` returns 200, not 404                                                                                                                      |
| 10  | Update `pep/runtime/pepRuntime.js` — add handler for `query_entity` node type: resolves tokens, calls query endpoint, stores result in `results[instruction.assign]`                                                                                                                                                                                                                 | Existing runtime tests still pass                                                                                                                                 |
| 11  | Create `src/components/reports/CustomQuery.jsx` — QueryInput, ConfirmationStrip, ResultsTable, SaveReportBar sub-components. Calls `/api/pep/compile` then `/api/pep/query`. Saved reports stored in localStorage                                                                                                                                                                    | Component renders without errors; query flow completes end to end in browser                                                                                      |
| 12  | Update `src/pages/Reports.jsx` — add Custom Query tab with Sparkles icon                                                                                                                                                                                                                                                                                                             | New tab visible in Reports page                                                                                                                                   |
| 13  | End-to-end test in browser: type "show me all open leads assigned to me", confirm results render, save report                                                                                                                                                                                                                                                                        | Results table populated; saved report appears on next load                                                                                                        |
| 14  | Update `BRAID_PEP_JOURNAL.md` with Phase 3 entry                                                                                                                                                                                                                                                                                                                                     | Journal updated                                                                                                                                                   |

---

## Definition of Done

- [ ] `entity-catalog.yaml` has entries for Lead, Contact, Opportunity, Account, Activity, BizDevSource with full field vocabulary
- [ ] `entity-catalog.yaml` has entries for all five views with column lists
- [ ] `capability-catalog.yaml` has `query_entity` entry
- [ ] `resolver.js` has `resolveQuery()` that validates targets and fields against catalog
- [ ] `emitter.js` has `emitQuery()` that produces valid `query_entity` IR
- [ ] `compile()` correctly routes query intent through the query compilation path
- [ ] All 10 query compiler tests pass
- [ ] All existing Phase 2 tests still pass (compiler.test.js, llmParser.test.js)
- [ ] `POST /api/pep/compile` returns IR + confirmation string for valid query sentences
- [ ] `POST /api/pep/compile` returns `clarification_required` for unparseable sentences
- [ ] `POST /api/pep/query` executes entity queries via existing backend routes
- [ ] `POST /api/pep/query` executes view queries via Supabase direct with tenant isolation
- [ ] `{{resolve_employee: <name>}}` tokens resolved correctly at query time
- [ ] `{{date: <token>}}` tokens resolved to actual dates at query time
- [ ] `tenant_id` injected on every query regardless of IR contents
- [ ] CustomQuery component renders in Reports page as new tab
- [ ] Confirmation strip shows human-readable interpretation before results render
- [ ] Results table renders rows with column headers
- [ ] Save report stores IR + name in localStorage
- [ ] No write operations reachable through any Phase 3 code path
- [ ] `BRAID_PEP_JOURNAL.md` updated

---

## Notes for Copilot (Phase 3)

1. **Read-only contract is absolute**: `POST /api/pep/query` must only execute SELECT operations.
   Validate this at the route level — reject any IR node whose `type` is not `query_entity`.
   Never pass user-supplied SQL or filter values directly to Supabase without parameterisation.

2. **Tenant isolation on every query**: before executing any query (entity or view), inject
   `tenant_id = req.body.tenant_id` as a mandatory filter. This cannot be overridden by the
   IR. If `tenant_id` is missing from the request, return 400.

3. **Views use Supabase client directly**: for `target_kind: view`, use the Supabase JS client
   with `.from(viewName).select('*').eq('tenant_id', tenantId)` and append each resolved filter
   using the appropriate Supabase filter method. Do not construct raw SQL strings.

4. **Entity queries route through existing backends**: for `target_kind: entity`, translate the
   IR filters to query parameters and call the existing entity backend route internally (or call
   the entity's Supabase table directly — whichever is simpler to implement consistently).
   Do not duplicate entity route logic.

5. **Employee name resolution is best-effort**: if `{{resolve_employee: <name>}}` cannot be
   resolved to a UUID, return a clear error to the frontend with `reason: "Could not find
employee: <name>"`. Do not silently drop the filter or return unfiltered results.

6. **Date token resolution is server-side**: resolve `{{date: <token>}}` tokens in the
   query endpoint, not the compile endpoint. This ensures a saved report IR always uses
   relative tokens and resolves to the correct date when re-run.

7. **Confirmation string is compile-time**: generate the human-readable confirmation string
   in `POST /api/pep/compile`, not `POST /api/pep/query`. It reflects what the system
   understood from the sentence, before execution.

8. **Phase 3 parser uses a different system prompt**: the Phase 3 LLM call still uses
   `parseLLM` from `llmParser.js` but passes a different `systemPrompt` argument (the
   query-oriented prompt defined above). `parseLLM` must accept an optional `systemPrompt`
   parameter to support this without modifying Phase 2 behaviour.

9. **No JSONB field filtering in Phase 3**: do not expose `metadata`, `tags`,
   `activity_metadata`, or any JSONB column as a filterable field in the catalog.
   These are Phase 4 scope.

10. **localStorage for saved reports is intentional for Phase 3**: database persistence
    of saved report definitions is Phase 4. localStorage keyed by
    `pep_saved_reports_<tenant_id>` is sufficient for the Phase 3 proof of concept.
