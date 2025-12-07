# 
_Per-tenant model selection + Claude/OpenAI failover + Braid wiring_

## 1. Files to Replace/Drop In

1. In `lib/aiEngine/`:
   - [ ] Replace `modelRouter.js` with the new version (per-tenant provider/model).
   - [ ] Replace `keyResolver.js` with the provider-aware version (Anthropic + OpenAI).
   - [ ] Replace `llmClient.js` with the multi-provider (OpenAI/Groq/Local/Anthropic) client.
   - [ ] Replace `index.js` with the version that exports:
         - `pickModel`
         - `selectLLMConfigForTenant`
         - `resolveLLMApiKey`
         - `generateChatCompletion`
         - `getTenantIdFromRequest`, `resolveTenantRecord`, `validateUserTenantAccess`
   - [ ] Keep `tenantContext.js` (no functional change required).

2. At the API route level:
   - [ ] Replace `ai.js` with the updated version that:
         - Uses `selectLLMConfigForTenant` inside `generateAssistantResponse`.
         - Uses `selectLLMConfigForTenant` in the `/chat` route (Braid assistant) to select `finalModel` per tenant.
   - [ ] Replace `mcp.js` with the updated version that:
         - Imports `selectLLMConfigForTenant`.
         - Defines `callLLMWithFailover(...)`.
         - Uses `callLLMWithFailover` for:
           - `llm.generate_json`
           - `/market-insights` LLM calls.

## 2. Environment Variables

1. Global provider and defaults:
   - [ ] `LLM_PROVIDER=openai` (or `anthropic` if you want Sonnet as default).
   - [ ] `DEFAULT_OPENAI_MODEL=gpt-4o`
   - [ ] `MODEL_CHAT_TOOLS=gpt-4o`
   - [ ] `MODEL_JSON_STRICT=gpt-4o-mini`
   - [ ] `MODEL_BRAIN_READ_ONLY=gpt-4o`
   - [ ] `OPENAI_API_KEY=...`
   - [ ] `ANTHROPIC_API_KEY=...`

2. Optional Anthropic config:
   - [ ] `ANTHROPIC_BASE_URL=https://api.anthropic.com`
   - [ ] `ANTHROPIC_VERSION=2023-06-01`

3. Optional per-tenant overrides (examples):
   - [ ] `LLM_PROVIDER__TENANT_ACME_INC=anthropic`
   - [ ] `MODEL_CHAT_TOOLS__TENANT_ACME_INC=claude-3-5-sonnet-20241022`
   - [ ] `MODEL_JSON_STRICT__TENANT_ACME_INC=gpt-4o-mini`

## 3. Supabase Integration Records

1. `tenant_integrations` table:
   - [ ] For each tenant that should use OpenAI:
         - row with `integration_type = 'openai_llm'`
         - `api_credentials` JSON containing `{"api_key": "sk-..."}`.
   - [ ] For each tenant that should use Anthropic:
         - row with `integration_type = 'anthropic_llm'`
         - `api_credentials` JSON containing `{"api_key": "sk-ant-..."}`.
   - [ ] Ensure `is_active = true` for valid rows.

2. Optional global/system settings:
   - [ ] `system_settings.settings.system_openai_settings.openai_api_key` filled if you want a global OpenAI fallback.
   - [ ] Verify no stale / conflicting keys for disabled tenants.

## 4. Braid / AI Routes Wiring

1. `ai.js`:
   - [ ] Confirm `import` from `../lib/aiEngine/index.js` now includes `selectLLMConfigForTenant`.
   - [ ] In `generateAssistantResponse`, confirm `model` is taken from `selectLLMConfigForTenant(...)`.
   - [ ] In `/chat` route:
         - `systemPrompt` is unchanged (Braid system).
         - `tenantModelConfig = selectLLMConfigForTenant(...)`.
         - `finalModel` defaults to `tenantModelConfig.model || model || DEFAULT_CHAT_MODEL`.

2. `mcp.js`:
   - [ ] Confirm `callLLMWithFailover(...)` exists and is used for:
         - `server_id === "llm"` / `tool_name === "generate_json"`.
         - `/market-insights` LLM calls.
   - [ ] Confirm `resolveLLMApiKey` is called with `provider` aware of OpenAI vs Anthropic.

## 5. Sanity Checks Before Deploy

1. Static checks:
   - [ ] `npm run lint` (or equivalent) passes.
   - [ ] TypeScript builds (if applicable).
   - [ ] No circular imports in `lib/aiEngine`.

2. Local smoke tests:
   - [ ] Set `LLM_PROVIDER=openai`, run a `/chat` and `/mcp/run` (`llm.generate_json`) request.
   - [ ] Set `LLM_PROVIDER=anthropic`, repeat.
   - [ ] Add per-tenant overrides (`LLM_PROVIDER__TENANT_X`) and verify selection.

3. Logging:
   - [ ] Ensure logs include provider + model used in `callLLMWithFailover` for traceability.

## 6. Rollout

1. Deploy to staging:
   - [ ] Run all automated tests.
   - [ ] Manually test:
         - Tenant A (OpenAI)
         - Tenant B (Anthropic)
   - [ ] Validate failover by intentionally breaking one provider’s key.

2. Deploy to production:
   - [ ] Monitor logs for:
         - Provider errors.
         - Repeated failovers.
   - [ ] Adjust env overrides as needed.
