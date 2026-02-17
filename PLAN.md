# PLAN

## Root Cause

No single normalized AI execution record exists. The current `logLLMActivity` calls fire **per-iteration** (one per LLM round-trip inside the tool loop), producing N entries for a single user request. There is no request-level telemetry object that captures the full lifecycle — provider, total latency, aggregated token usage, all tool calls, and final outcome — in one structured record conforming to `docs/AI_RUNTIME_CONTRACT.md`. Without this, C.A.R.E. scoring, provider performance comparison, and retry analysis have no canonical input.

## Impacted Services

**One file modified:**

- **`backend/routes/ai.js`** — the `POST /api/ai/chat` handler (line 2678). A single `logLLMActivity()` call inserted **after** `safeToolInteractions` construction (line 3759) and **before** `return res.json(...)` (line 3939). Error-path equivalent in the `catch` block (line ~3965).

**No other files modified.** `logLLMActivity` in `backend/lib/aiEngine/activityLogger.js` already accepts arbitrary fields — no signature change needed.

## Contracts Affected

- **`docs/AI_RUNTIME_CONTRACT.md`** — Section "Required Telemetry Fields". The runtime will now emit all defined fields in a single structured log entry per AI execution: `task_id`, `request_id`, `tenant_id`, `intent`, `provider`, `model`, `latency_ms`, `token_usage`, `tool_calls`, `final_state`, `retry_count`.
- **No API contract changes.** The `res.json(...)` response shape is untouched.
- **No database contract changes.** No new tables, columns, or RLS policies.
- **Existing per-iteration `logLLMActivity` calls are preserved.** The new call is additive — tagged with `nodeId: "ai:chat:execution_record"` to distinguish it.

## Ordered Steps

1. **Add a request-level timer at handler entry.**
   Insert `const chatStartTime = Date.now();` immediately after the `try {` on line 2680 of the `POST /api/ai/chat` handler. Captures full request latency (intent classification + context loading + all iterations + message persistence).

2. **Construct the structured telemetry payload.**
   After line 3759 (`const safeToolInteractions = ...`) and before line 3939 (`return res.json(...)`), build the contract-conforming object using variables already in scope:

   | Contract field | Source variable | Notes |
   |---|---|---|
   | `task_id` | `conversationId \|\| null` | Per contract §Task Identity: "conversation_id is the session-level correlation key" |
   | `request_id` | Generated inline: `"req_" + chatStartTime + "_" + Math.random().toString(36).slice(2,11)` | Matches `generateRequestId()` format without importing Braid utils |
   | `tenant_id` | `tenantRecord?.id` | UUID, already validated non-null at line 2751 |
   | `intent` | `classifiedIntent \|\| null` | From `classifyIntent()` at line 3308 |
   | `provider` | `effectiveProvider` | From line 3019 |
   | `model` | `finalModel` | Tracks actual model used (may differ from requested) |
   | `latency_ms` | `Date.now() - chatStartTime` | Full request duration (via `durationMs` param) |
   | `token_usage` | `finalUsage \|\| null` | `{ prompt_tokens, completion_tokens, total_tokens }` — already normalized (via `usage` param) |
   | `tool_calls` | `safeToolInteractions.map(t => t.tool)` | Array of tool name strings (via `toolsCalled` param) |
   | `final_state` | `"success"` | Literal — this code path only reached on success (via `status` param) |
   | `retry_count` | `0` | No retry loop at request level in in-process path (via `attempt` param) |

3. **Emit via `logLLMActivity()`.**
   Call with constructed payload. Use `nodeId: "ai:chat:execution_record"` and `capability: "chat_tools"`. Structured JSON output appears in same console sink as existing activity logs, tagged `[AIEngine][LLM_CALL_SUCCESS]`.

4. **Add error-path emission.**
   In the `catch` block at line ~3965, emit equivalent record with `status: "error"` and `error: error.message`. Token usage and tool calls may be partial or null — guard with `|| null` and `|| []`.

5. **Ensure no duplication.**
   - New call uses `nodeId: "ai:chat:execution_record"` — distinct from per-iteration `nodeId: "ai:chat:iter${i}"`.
   - Placed **after** iteration loop and message persistence — no intermediate emissions.
   - `generateAssistantResponse` (line 820) is a separate async path for conversation follow-ups — not touched.

6. **Guard against missing optional fields.**
   - `finalUsage` → `null` if no LLM call succeeded (initialized at line 3238).
   - `classifiedIntent` → `null` if classification fails.
   - `safeToolInteractions` → `[]` (initialized as empty array at line 3236).
   - `effectiveProvider` always set by line 3019.
   - `tenantRecord?.id` validated non-null at line 2751 (400 returned if missing).

## Tests

- **Run an AI chat request** (`POST /api/ai/chat`). Verify exactly **one** log entry with `nodeId: "ai:chat:execution_record"` appears: `docker compose logs -f backend | grep execution_record`.
- **Verify `tenant_id`** is present and matches the request's `x-tenant-id` header.
- **Verify `intent`** is non-null for classifiable messages (e.g., "show my leads").
- **Verify `latency_ms`** (`durationMs` in log) is a positive integer > 0.
- **Verify no duplicate logs** — count `"ai:chat:execution_record"` occurrences per request; must be exactly 1.
- **Verify error path** — trigger a 500. Confirm one `execution_record` with `status: "error"`.
- **Regression** — `docker exec aishacrm-backend npm test` passes with no regressions.

## Observability Checks

- **Log sink**: Record appears in same stdout/console sink as existing `[AIEngine][LLM_CALL_SUCCESS]` / `[AIEngine][LLM_CALL_ERROR]` entries. No new transport.
- **Payload key mapping**: `durationMs` → contract `latency_ms`, `usage` → `token_usage`, `toolsCalled` → `tool_calls`, `status` → `final_state`, `attempt` → `retry_count`.
- **Filtering**: `nodeId === "ai:chat:execution_record"` uniquely identifies request-level records vs per-iteration records.
- **Buffer**: Entry stored in the in-memory rolling buffer (500 entries) — accessible via `GET /api/system/llm-activity`.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Duplicate emission if placed too early | Medium | Insertion after `safeToolInteractions` construction and message persistence — all iterations complete. Verified by `nodeId` tag uniqueness. |
| Undefined `token_usage` for tool-only flows | Low | `finalUsage` initialized to `null`; guarded with `\|\| null`. |
| `chatStartTime` not capturing full latency | Low | Placed inside `try` block — captures everything after Express routing/middleware. Middleware latency outside AI execution lifecycle per contract. |
| Buffer bloat from additional entry | Very Low | One extra entry per `/chat` request in 500-entry buffer. Per-iteration entries already exist; adds ~1 more — negligible. |
| Field name mapping drift | Low | `logLLMActivity` passes through arbitrary fields. Mapping documented in contract and inline comments. |

## Definition of Done

- [ ] One `logLLMActivity` call with `nodeId: "ai:chat:execution_record"` on the success path (before `res.json`).
- [ ] One `logLLMActivity` call with `nodeId: "ai:chat:execution_record"` on the error path (in `catch` block).
- [ ] Structured log contains all 11 contract fields: `task_id`, `request_id`, `tenant_id`, `intent`, `provider`, `model`, `latency_ms` (via `durationMs`), `token_usage` (via `usage`), `tool_calls` (via `toolsCalled`), `final_state` (via `status`), `retry_count` (via `attempt`).
- [ ] No change to the `res.json(...)` response shape.
- [ ] No change to existing per-iteration `logLLMActivity` calls.
- [ ] No new files, services, or dependencies.
- [ ] `docker exec aishacrm-backend npm test` passes with no regressions.
- [ ] Guardrails respected: no refactors, no new services, no response shape changes, single insertion point, existing logger pathway.
