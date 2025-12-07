# AiSHA AI Engine

This folder contains the shared logic that unifies model routing, API key resolution,
and multi-tenant authorization across:

- `routes/ai.js`
- `routes/aiRealtime.js`
- `routes/mcp.js`

## Modules

### `modelRouter.js`
Provides `pickModel({ capability, override })` for selecting models by capability:

- `chat_light`
- `chat_tools`
- `json_strict`
- `realtime_voice`
- `brain_read_only`
- `brain_plan_actions`

Backed by environment variables like:

- `MODEL_CHAT_LIGHT`
- `MODEL_CHAT_TOOLS`
- `MODEL_JSON_STRICT`
- `MODEL_REALTIME_VOICE`
- `MODEL_BRAIN_READ_ONLY`
- `MODEL_BRAIN_PLAN_ACTIONS`
- `DEFAULT_OPENAI_MODEL`

### `keyResolver.js`
Unifies key resolution:

1. Explicit overrides (request/body/headers)
2. `tenant_integrations` (type: `openai_llm`)
3. `system_settings.settings.system_openai_settings`
4. Legacy admin `users.system_openai_settings`
5. `process.env.OPENAI_API_KEY`

### `tenantContext.js`
Centralized tenant and auth logic:

- `getTenantIdFromRequest(req)` – pull from headers/query/user
- `resolveTenantRecord(identifier)` – canonical UUID/slug resolution
- `validateUserTenantAccess(req, requestedTenantId, tenantRecord)` – multi-tenant guard

Use these helpers instead of duplicating tenant/model/key logic in each route file.
