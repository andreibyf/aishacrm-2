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
- `braid-llm-kit/` — VSCode extension parser and grammar updated (generic type fix)
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
    - '11436:11434'
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
- LOCAL_LLM_API_KEY=${LOCAL_LLM_API_KEY:-ollama} # required by llmClient.js; any value works for Ollama
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
curl http://localhost:11436/api/tags
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
| 0   | Update `docker-compose.yml` — add `ollama` service, `ollama_data` volume, env vars (`LOCAL_LLM_BASE_URL`, `LOCAL_LLM_API_KEY`, `PEP_LLM_PROVIDER`, `PEP_LLM_MODEL`) to backend service. Run `docker compose up ollama -d` then `docker exec aishacrm-ollama ollama pull qwen2.5-coder:3b`                                                                                                                                                                               | `curl http://localhost:11436/api/tags` lists `qwen2.5-coder:3b`                                                     |
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
- [ ] Backend service has `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_API_KEY`, `PEP_LLM_PROVIDER`, `PEP_LLM_MODEL` env vars
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

## Notes for Copilot

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
