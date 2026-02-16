# AI Runtime Contract

## Contract Purpose

- Canonical lifecycle, telemetry schema, correlation model, and success/failure semantics for every AI execution in AiSHA.
- Audience: C.A.R.E. orchestration, observability consumers, AI agent developers.
- This is a contract for observability and orchestration — not an implementation.

## AI Task Lifecycle

- **REQUESTED**: User message arrives at `POST /api/ai/chat` (see `backend/routes/ai.js` line 2678). Input validated, tenant resolved via `getTenantIdFromRequest()` + `resolveTenantRecord()` (see `backend/lib/aiEngine/tenantContext.js`). Security checked via `validateUserTenantAccess()`.
- **ROUTED**: Provider selected via `selectLLMConfigForTenant({ capability })` (see `backend/lib/aiEngine/modelRouter.js`). API key resolved via 5-layer cascade in `resolveLLMApiKey()` (see `backend/lib/aiEngine/keyResolver.js`). Intent classified via `classifyIntent()` (see `backend/lib/intentClassifier.js`). Tool subset focused via `applyToolHardCap()` (max 12 tools, see `backend/lib/entityLabelInjector.js`).
- **EXECUTING**: LLM called via `generateChatCompletion()` (see `backend/lib/aiEngine/llmClient.js`). Iteration loop runs up to `maxIterations` (default 5, configurable via `ai_settings.max_iterations`). Each iteration logged via `logLLMActivity()` (see `backend/lib/aiEngine/activityLogger.js`).
- **TOOL_CALL**: Entered per tool call within an iteration. Tool executed via `executeBraidTool()` (see `backend/lib/braid/execution.js`). Passes through: access token validation → registry lookup → input validation → RBAC → rate limiting → cache check → JWT generation → execution → cache store → metrics → audit log.
- **COMPLETED**: Final assistant content produced. Response persisted to `conversation_messages`. Activity logged with `status: "success"`.
- **FAILED**: Error at any stage. Activity logged with `status: "error"`. Response returns `{ status: "error", message }` with HTTP 400/403/500/501.

## Task Identity & Correlation

- **task_id**: Not yet a first-class field. Currently approximated by activity logger entry id (see `backend/lib/aiEngine/activityLogger.js`). Future: should be assigned at REQUESTED stage.
- **request_id**: Generated as `"req_<timestamp>_<random9>"` by `generateRequestId()` (see `backend/lib/braid/utils.js`). Scoped to Braid tool execution context.
- **tenant_id**: UUID from `req.tenant.id`, injected by `validateTenant` middleware (see `backend/middleware/validateTenant.js`). Present in all telemetry.
- **user_id**: Extracted from JWT via auth middleware. Present in Braid audit log entries and tool execution JWTs.
- **correlation_id**: No explicit cross-service correlation ID exists today. `conversation_id` (from request body) is the closest equivalent for multi-turn correlation. Braid `requestId` correlates within a single tool execution. Future: a `correlation_id` header should propagate across AI route → Braid → MCP.
- **conversation_id**: Optional UUID from request body. Links messages and tool context in `conversation_messages` table. Session-level correlation key.

## Required Telemetry Fields

- **intent**: Produced by `classifyIntent()` (see `backend/lib/intentClassifier.js`). Shape: `{ intent, entity, confidence }`.
- **provider**: Selected by `selectLLMConfigForTenant()` (see `backend/lib/aiEngine/modelRouter.js`). Values: `openai`, `anthropic`, `groq`, `local`.
- **model**: Selected alongside provider. Logged in activity logger and chat response.
- **latency_ms**: `durationMs` in activity logger entry (see `backend/lib/aiEngine/activityLogger.js`). Also `executionTimeMs` in Braid audit log (see `backend/lib/braid/metrics.js`).
- **token_usage**: `{ prompt_tokens, completion_tokens, total_tokens }` — normalized from LLM response. Anthropic adapter normalizes to this shape (see `backend/lib/aiEngine/anthropicAdapter.js`). Logged in activity logger `usage` field.
- **tool_calls[]**: Array of `{ tool, args, result_preview, summary }` — collected during iteration loop in `backend/routes/ai.js`. Also `toolsCalled: string[]` in activity logger.
- **cache_hit**: Boolean per tool call — tracked by Braid execution (see `backend/lib/braid/execution.js`). Redis key pattern: `braid:<tenantId>:<toolName>:<argsHash>`. Aggregated in `braid:metrics:<tenantId>:*:cache_hits` (see `backend/lib/braid/metrics.js`).
- **retry_count**: `attempt` and `totalAttempts` fields in activity logger. Retry logic via `retryWithBackoff()` (see `backend/lib/braid/utils.js`).
- **final_state**: `status` field in activity logger: `"success"`, `"error"`, or `"failover"`.

## Success Criteria

- **Pure LLM response**: `generateChatCompletion()` returns `{ status: "success", content: string }`. Activity logger records `status: "success"`. Token usage is non-null. No tool calls required.
- **Tool execution**: `executeBraidTool()` returns `{ tag: "Ok", value: any }`. Braid audit log records `resultTag: "Ok"`. Metrics record `success: true`. Cache invalidation (for writes) completes without error.
- **Multi-step AI flow**: All iterations complete within `maxIterations`. Final assistant response contains non-empty content. If max iterations exhausted, a fallback summary request succeeds. All tool calls returned `tag: "Ok"`. Chat response `status: "success"` with `tool_interactions[]` populated.

## Failure Classification

- **provider_error**: LLM API call fails. Detected in `generateChatCompletion()` (see `backend/lib/aiEngine/llmClient.js`). Activity logger records `status: "error"`. Includes HTTP errors, rate limits, invalid responses from provider.
- **tool_error**: Braid tool execution fails. Detected in `executeBraidTool()` (see `backend/lib/braid/execution.js`). Sub-types: `UnknownTool`, `ExecutionError`, `NetworkError`. Audit log records `resultTag: "Err"` with `errorType` and `errorMessage`.
- **validation_error**: Invalid input to AI chat endpoint or Braid tool. Chat: missing `messages` array → 400. Braid: `validateToolArgs()` returns errors → `{ tag: "Err", error: { type: "ValidationError" } }` (see `backend/lib/braid/utils.js`).
- **timeout**: Braid execution exceeds 30s timeout (see `withTimeout()` in `backend/lib/braid/utils.js`). Or LLM call exceeds provider SDK timeout.
- **tenant_scope_violation**: Cross-tenant access attempt detected by `validateUserTenantAccess()` (see `backend/lib/aiEngine/tenantContext.js`) → 403. Also detected by IDR (see `backend/middleware/intrusionDetection.js`) — `MAX_TENANT_VIOLATIONS_PER_HOUR: 5` → IP blocked for 5 min.
- **auth_error**: Missing/invalid access token for Braid execution → `AuthorizationError`. Or JWT validation failure in auth middleware.
- **rate_limit_exceeded**: Braid policy rate limits per tenant/user/tool-class, 60s window → `RateLimitExceeded` with `retryAfter: 60` (see `backend/lib/braid/policies.js`). Also global rate limiter: 120 req/min per IP (see `backend/startup/initMiddleware.js`).
- **permission_error**: User role insufficient for requested Braid policy → `InsufficientPermissions` (see `backend/lib/braid/policies.js`).

## Idempotency & Retry Safety

- **Safe to retry**:
  - READ_ONLY Braid tool calls (cached, no side effects)
  - LLM completions with identical message context (stateless)
  - Failed provider calls where no tool was executed
- **Conditionally safe**:
  - WRITE tool calls that failed before database commit (no partial state)
  - Tool calls that returned `RateLimitExceeded` (after `retryAfter` window)
  - Provider failover — `retryWithBackoff()` handles this (see `backend/lib/braid/utils.js`)
- **Never safe to auto-retry**:
  - DELETE operations (require `confirmed: true`, see `backend/lib/braid/policies.js`)
  - Tool calls that returned `tag: "Ok"` — re-execution would duplicate
  - Any operation that already modified database state
  - Multi-step chain executions (see `backend/lib/braid/chains.js`) — partial completion may leave state
- **Current idempotency**: Braid cache for READ_ONLY tools provides natural idempotency within TTL (default 90s, per-tool overrides in `backend/lib/braid/registry.js`). No explicit idempotency keys exist for write operations.

## Provider Routing Observability

- **Failover events**: Activity logger records `status: "failover"` with `{ attempt, totalAttempts, provider, model, error }` (see `backend/lib/aiEngine/activityLogger.js`). Console tag: `[AIEngine][LLM_CALL_FAILOVER]`.
- **Per-tenant override**: `selectLLMConfigForTenant()` checks `LLM_PROVIDER__TENANT_<KEY>` and `MODEL_<CAPABILITY>__TENANT_<KEY>` env vars (see `backend/lib/aiEngine/modelRouter.js`). Selected provider/model logged in activity entry.
- **Latency-based routing**: Not currently implemented. `durationMs` is recorded per call but not used for routing decisions. Future: `getLLMActivityStats()` could feed a latency-based selector.
- **Key resolution path**: `resolveLLMApiKey()` logs which layer provided the key via `[AIEngine][KeyResolver]` tag (see `backend/lib/aiEngine/keyResolver.js`). 5 layers: explicit → tenant_integrations → system_settings → legacy users → env vars.

## C.A.R.E. Readiness Signals

- **Provider performance scoring**: `getLLMActivityStats()` (see `backend/lib/aiEngine/activityLogger.js`) aggregates `byProvider`, `byCapability`, `byStatus`, `avgDurationMs`, `requestsPerMinute`, `tokenUsage` over rolling 500-entry buffer. Sufficient for a scoring function but no scorer exists today.
- **Task outcome scoring**: Braid metrics (see `backend/lib/braid/metrics.js`) track per-tenant and per-tool `calls`, `errors`, `cache_hits` at minute and hour granularity. Audit log entries (Supabase `audit_logs` table) record `resultTag`, `errorType`, `executionTimeMs` per tool invocation. Combined with chat response status, these provide task-level outcome data.
- **Cost tracking hooks**: Token usage (`prompt_tokens`, `completion_tokens`, `total_tokens`) logged per iteration in activity logger and returned in chat response. `[CostGuard]` logs `incomingMsgCount` and `incomingCharCount` at request entry (see `backend/routes/ai.js`). No monetary cost calculation exists today — requires provider pricing tables.
- **Minimum signals for automated decisions** (all currently produced):
  - `provider` + `model` per call
  - `latency` per call
  - `token_usage` per call
  - `success`/`failure` per call
  - `tool_call_count` per request
  - `cache_hit_ratio` per tenant
  - `error_rate` per provider

## Definition of Done

- This contract is satisfied when all telemetry fields in "Required Telemetry Fields" are produced by the cited modules.
- Success/failure classification matches the detection points listed in "Failure Classification".
- Idempotency rules in "Idempotency & Retry Safety" are respected by all AI execution paths.
- C.A.R.E. readiness signals in "C.A.R.E. Readiness Signals" are observable via existing modules — no new implementation required.
