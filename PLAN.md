PLAN
Root Cause
AI execution in AiSHA has no single document defining the lifecycle, telemetry schema, correlation model, or success/failure semantics. Observability data is produced by 8+ modules (activityLogger.js, metrics.js, performanceLogger.js, execution.js, etc.) but no contract standardizes what must be recorded, how executions are correlated, or what constitutes success. Without this contract, future C.A.R.E. orchestration cannot make deterministic decisions about provider routing, retries, or task scoring.

Impacted Services
None modified. This is a new read-only documentation file (docs/AI_RUNTIME_CONTRACT.md).
No backend, frontend, database, or infrastructure changes.
Contracts Affected
None. No API routes, database schemas, middleware, RLS policies, or Braid tool definitions are altered.
Ordered Steps
Create docs/AI_RUNTIME_CONTRACT.md with exactly these 10 sections:

Contract Purpose

Max 3-line preamble stating this file defines the canonical lifecycle, telemetry schema, correlation model, and success/failure semantics for every AI execution in AiSHA.
Audience: AI orchestration (C.A.R.E.), observability consumers, and AI agent developers.
This is a contract for observability and orchestration — not an implementation.
AI Task Lifecycle

Define canonical state flow: REQUESTED → ROUTED → EXECUTING → TOOL_CALL → COMPLETED | FAILED
REQUESTED: User message arrives at POST /api/ai/chat (see ai.js line 2678). Input validated, tenant resolved via getTenantIdFromRequest() + resolveTenantRecord() (see tenantContext.js). Security checked via validateUserTenantAccess().
ROUTED: Provider selected via selectLLMConfigForTenant({ capability }) (see modelRouter.js). API key resolved via 5-layer cascade in resolveLLMApiKey() (see keyResolver.js). Intent classified via classifyIntent(). Tool subset focused via applyToolHardCap() (max 12 tools).
EXECUTING: LLM called via generateChatCompletion() (see llmClient.js). Iteration loop runs up to maxIterations (default 5, configurable via ai_settings.max_iterations). Each iteration logged via logLLMActivity() with nodeId: "ai:chat:iter{i}" (see activityLogger.js).
TOOL_CALL: Entered per tool call within an iteration. Tool executed via executeBraidTool() (see execution.js). Passes through access token validation → registry lookup → input validation → RBAC → rate limiting → cache check → JWT generation → execution → cache store → metrics → audit log.
COMPLETED: Final assistant content produced. Response persisted to conversation_messages. Entity context extracted for frontend. Activity logged with status: "success".
FAILED: Error at any stage. Activity logged with status: "error". Response returns { status: "error", message } with appropriate HTTP code (400/403/500/501).
Task Identity & Correlation

task_id: Not yet generated as a first-class field. Currently approximated by activityLogger entry id: "llm-<timestamp>-<random6>" (see activityLogger.js). Future: should be assigned at REQUESTED stage.
request_id: Generated as "req_<timestamp>_<random9>" by generateRequestId() in utils.js (line ~46). Scoped to Braid tool execution context.
tenant_id: UUID from req.tenant.id, injected by validateTenantAccess middleware (see validateTenant.js). Present in all telemetry: activity logs, Braid metrics, audit entries.
user_id: Extracted from JWT via auth middleware. Present in Braid audit log entries and JWT tokens issued for tool execution.
correlation_id: No explicit cross-service correlation ID exists today. The conversation_id (from request body) serves as the closest equivalent for multi-turn correlation. Braid requestId correlates within a single tool execution. Future: a correlation_id header should propagate across AI route → Braid → MCP.
conversation_id: Optional UUID from request body. Links user messages, assistant responses, and tool context in conversation_messages table. Serves as the session-level correlation key.
Required Telemetry Fields

intent: Produced by classifyIntent() in ai.js. Includes { intent, entity, confidence }.
provider: Selected by selectLLMConfigForTenant() (see modelRouter.js). Values: openai, anthropic, groq, local.
model: Selected alongside provider. Logged in activity logger and chat response.
latency_ms: durationMs field in activity logger entry (see activityLogger.js). Also executionTimeMs in Braid audit log (see metrics.js).
token_usage: { prompt_tokens, completion_tokens, total_tokens } — normalized from LLM response. Anthropic adapter normalizes to this shape (see anthropicAdapter.js). Logged in activity logger usage field and returned in chat response.
tool_calls[]: Array of { tool, args, result_preview, summary } — collected during iteration loop in ai.js. Also toolsCalled: string[] in activity logger.
cache_hit: Boolean per tool call — tracked by Braid execution (see execution.js). Redis key pattern: braid:<tenantId>:<toolName>:<argsHash>. Aggregated in braid:metrics:<tenantId>:*:cache_hits (see metrics.js).
retry_count: attempt and totalAttempts fields in activity logger. Retry logic via retryWithBackoff() in utils.js.
final_state: status field in activity logger: "success", "error", or "failover".
Success Criteria

Pure LLM response: generateChatCompletion() returns { status: "success", content: string }. Activity logger records status: "success". Token usage is non-null. No tool calls required.
Tool execution: executeBraidTool() returns { tag: "Ok", value: any }. Braid audit log records resultTag: "Ok". Metrics record success: true. Cache invalidation (for writes) completes without error.
Multi-step AI flow: All iterations complete within maxIterations. Final assistant response contains non-empty content. If max iterations exhausted, a fallback summary request succeeds. All tool calls within the flow returned tag: "Ok". Chat response status: "success" with tool_interactions[] populated.
Failure Classification

provider_error: LLM API call fails. Detected in generateChatCompletion() (see llmClient.js). Activity logger records status: "error". Includes HTTP errors, rate limits, invalid responses from provider.
tool_error: Braid tool execution fails. Detected in executeBraidTool() (see execution.js). Sub-types: UnknownTool, ExecutionError, NetworkError. Audit log records resultTag: "Err" with errorType and errorMessage.
validation_error: Invalid input to AI chat endpoint or to Braid tool. Chat: missing messages array → 400. Braid: validateToolArgs() returns validation errors → { tag: "Err", error: { type: "ValidationError" } }.
timeout: Braid execution exceeds 30s timeout (see withTimeout() in utils.js). Or LLM call exceeds provider SDK timeout.
tenant_scope_violation: Cross-tenant access attempt detected by validateUserTenantAccess() (see tenantContext.js) → 403. Also detected by IDR (see intrusionDetection.js) — MAX_TENANT_VIOLATIONS_PER_HOUR: 5 → IP blocked for 5 min.
auth_error: Missing/invalid access token for Braid execution → AuthorizationError. Or JWT validation failure in auth middleware.
rate_limit_exceeded: Braid policy rate limits (per-tenant/user/tool-class, 60s window) → RateLimitExceeded with retryAfter: 60. Also global rate limiter: 120 req/min per IP (see middleware).
permission_error: User role insufficient for requested Braid policy → InsufficientPermissions (see policies.js).
Idempotency & Retry Safety

Safe to retry: READ_ONLY Braid tool calls (cached, no side effects). LLM completions with identical message context (stateless). Failed provider calls where no tool was executed.
Conditionally safe: WRITE tool calls that failed before database commit (no partial state). Tool calls that returned RateLimitExceeded (after retryAfter window). Provider failover — retryWithBackoff() handles this (see utils.js).
Never safe to auto-retry: DELETE operations (require confirmed: true; see policies.js). Tool calls that returned tag: "Ok" — re-execution would duplicate. Any operation that already modified database state. Multi-step chain executions (see chains.js) — partial completion may leave state.
Current idempotency: Braid cache for READ_ONLY tools provides natural idempotency within TTL (10s–5min). No explicit idempotency keys exist for write operations.
Provider Routing Observability

Failover events: Activity logger records status: "failover" with { attempt, totalAttempts, provider, model, error } (see activityLogger.js). Console tag: [AIEngine][LLM_CALL_FAILOVER].
Per-tenant override: selectLLMConfigForTenant() checks LLM_PROVIDER__TENANT_<KEY> and MODEL_<CAPABILITY>__TENANT_<KEY> env vars (see modelRouter.js). Selected provider/model logged in activity entry.
Latency-based routing: Not currently implemented. durationMs is recorded per call but not used for routing decisions. Future: activity stats (getLLMActivityStats()) could feed a latency-based selector.
Key resolution path: resolveLLMApiKey() logs which layer provided the key via [AIEngine][KeyResolver] tag (see keyResolver.js). 5 layers: explicit → tenant_integrations → system_settings → legacy users → env vars.
C.A.R.E. Readiness Signals

Provider performance scoring: getLLMActivityStats() (see activityLogger.js) aggregates byProvider, byCapability, byStatus, avgDurationMs, requestsPerMinute, tokenUsage over rolling 500-entry buffer. These signals are sufficient for a scoring function but no scorer exists today.
Task outcome scoring: Braid metrics (see metrics.js) track per-tenant and per-tool calls, errors, cache_hits at minute and hour granularity. Audit log entries (Supabase audit_logs table) record resultTag, errorType, executionTimeMs per tool invocation. Combined with chat response status, these provide task-level outcome data.
Cost tracking hooks: Token usage (prompt_tokens, completion_tokens, total_tokens) is logged per iteration in activity logger and returned in chat response. [CostGuard] logs incomingMsgCount and incomingCharCount at request entry. No monetary cost calculation exists today — requires provider pricing tables.
Minimum signals for automated decisions: provider + model per call, latency per call, token usage per call, success/failure per call, tool call count per request, cache hit ratio per tenant, error rate per provider (all currently produced).
Definition of Done

 docs/AI_RUNTIME_CONTRACT.md exists and is under 180 lines.
 All 10 section headings present: Contract Purpose, AI Task Lifecycle, Task Identity & Correlation, Required Telemetry Fields, Success Criteria, Failure Classification, Idempotency & Retry Safety, Provider Routing Observability, C.A.R.E. Readiness Signals, Definition of Done.
 Every field and rule traces to a real source file with path reference.
 No runtime, code, or infrastructure changes.
 Consistent with GUARDRAILS.md (when created) in port numbers, rate limits, Redis separation, tenant isolation rules.
Keep under 180 lines. Bullet lists exclusively; no prose paragraphs.

No code changes. File is purely informational markdown.

Source references. Every rule cites the canonical source file(s) in parentheses.

Tests
No automated tests required. Documentation-only change.
Manual verification: Confirm all referenced file paths exist:
ai.js
activityLogger.js
modelRouter.js
keyResolver.js
llmClient.js
anthropicAdapter.js
tenantContext.js
execution.js
metrics.js
policies.js
utils.js
chains.js
requestContext.js
tokenBudget.js
memoryClient.js
cacheManager.js
errors.js
logger.js
validateTenant.js
intrusionDetection.js
productionSafetyGuard.js
performanceLogger.js
Content cross-check: Verify key values (rate limits, timeouts, buffer sizes, Redis key patterns) against actual source code.
Observability Checks
N/A. No runtime behavior changes. No metrics, logs, or health endpoints affected.
Risks
Low. Documentation-only addition with zero runtime impact.
Staleness risk: File may drift from actual telemetry fields or rate limits. Mitigated by citing source files rather than hardcoding values.
Missing correlation_id: The plan documents that no first-class correlation_id exists today — this is accurate and intentional (future enhancement).
No SYSTEM_OVERVIEW.md or GUARDRAILS.md yet: These files are referenced as future cross-references. The contract stands independently.
Definition of Done
 docs/AI_RUNTIME_CONTRACT.md exists and is under 180 lines.
 All 10 section headings are present.
 All referenced file paths are valid (spot-checked above — all 22 confirmed).
 Key values (rate limits, timeouts, buffer sizes, TTLs, Redis key patterns) match actual source code.
 No existing files were modified (documentation-only addition).
 Every rule traces to a real system component — no invented architecture.