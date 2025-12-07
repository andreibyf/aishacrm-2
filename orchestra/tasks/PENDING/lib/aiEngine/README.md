# AiSHA AI Engine (Multi-Provider Ready)

This folder contains the shared logic that unifies:

- Model routing by **capability**
- API key resolution (tenant + system + env)
- Multi-tenant authorization
- A minimal multi-provider **LLM client** for OpenAI-style APIs

It is designed so you can plug this in under:

- `routes/ai.js`
- `routes/aiRealtime.js`
- `routes/mcp.js`

without changing your front-end API surface.

---

## Files

### `modelRouter.js`

Exposes:

```js
import { pickModel } from "./modelRouter.js";

const model = pickModel({ capability: "chat_tools" });
```

Supported capabilities:

- `chat_light`        – cheap, fast chat (no heavy tools)
- `chat_tools`        – tool-heavy CRM agent chat
- `json_strict`       – JSON/schema generation
- `realtime_voice`    – OpenAI realtime voice
- `brain_read_only`   – read-only analytics
- `brain_plan_actions`– heavier planning with tools

Backed by env vars (optional):

- `MODEL_CHAT_LIGHT`
- `MODEL_CHAT_TOOLS`
- `MODEL_JSON_STRICT`
- `MODEL_REALTIME_VOICE`
- `MODEL_BRAIN_READ_ONLY`
- `MODEL_BRAIN_PLAN_ACTIONS`
- `DEFAULT_OPENAI_MODEL`
- `OPENAI_REALTIME_MODEL`

---

### `keyResolver.js`

Exposes:

```js
import { resolveLLMApiKey } from "./keyResolver.js";

const apiKey = await resolveLLMApiKey({
  explicitKey,
  headerKey,
  userKey,
  tenantSlugOrId,
  provider: "openai", // or "groq" | "local"
});
```

Resolution order:

1. Explicit overrides (request/body/headers)
2. `tenant_integrations` (type: `openai_llm`)
3. `system_settings.settings.system_openai_settings`
4. Legacy admin `users.system_openai_settings`
5. Env fallbacks:
   - `OPENAI_API_KEY`
   - `GROQ_API_KEY`
   - `LOCAL_LLM_API_KEY`

This keeps all key logic in one place instead of scattering it across routes.

---

### `tenantContext.js`

Exposes:

```js
import {
  getTenantIdFromRequest,
  resolveTenantRecord,
  validateUserTenantAccess,
} from "./tenantContext.js";
```

- `getTenantIdFromRequest(req)`
  - Reads from: `x-tenant-id` header, `tenant_id`/`tenantId` query, or `req.user.tenant_id`.

- `resolveTenantRecord(identifier)`
  - Uses your existing `resolveCanonicalTenant` helper to normalize slug/UUID into:
    ```js
    { id: <uuid>, tenant_id: <slug>, name: <string> }
    ```

- `validateUserTenantAccess(req, requestedTenantId, tenantRecord)`
  - Enforces that `req.user.tenant_id` matches the canonical tenant record.
  - Returns `{ authorized: boolean, error?: string }`.

Use these helpers in all AI/CRM routes to avoid copy-pasted multi-tenant logic.

---

### `llmClient.js`

A minimal, **multi-provider** client for OpenAI-style chat completions.

```js
import { generateChatCompletion } from "./llmClient.js";

const result = await generateChatCompletion({
  provider: "openai",   // "openai" | "groq" | "local"
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hi" },
  ],
  temperature: 0.2,
  apiKey: null,         // optional override
  baseUrl: null,        // optional override
});
```

Providers:

- `openai`
  - Base URL: `OPENAI_BASE_URL` (default `https://api.openai.com/v1`)
  - Key: `OPENAI_API_KEY`

- `groq`
  - Base URL: `GROQ_BASE_URL` (default `https://api.groq.com/openai/v1`)
  - Key: `GROQ_API_KEY`

- `local`
  - Base URL: `LOCAL_LLM_BASE_URL` (default `http://localhost:1234/v1`)
  - Key: `LOCAL_LLM_API_KEY`

All providers assume an **OpenAI-compatible** `/chat/completions` endpoint.
This matches Groq and most local servers (LM Studio, vLLM, etc.) out of the box.

---

## How to integrate

1. Drop `lib/aiEngine/` into your backend.
2. In `routes/ai.js`, `routes/mcp.js`, etc.:

   - Replace any direct OpenAI client usage with:

     ```js
     import { pickModel } from "../lib/aiEngine/modelRouter.js";
     import { resolveLLMApiKey } from "../lib/aiEngine/keyResolver.js";
     import { generateChatCompletion } from "../lib/aiEngine/llmClient.js";
     ```

   - Then:

     ```js
     const model = pickModel({ capability: "chat_tools" });

     const apiKey = await resolveLLMApiKey({
       explicitKey: body.api_key,
       headerKey: req.headers["x-openai-key"],
       userKey: req.user?.system_openai_settings?.openai_api_key,
       tenantSlugOrId: tenantRecord?.tenant_id,
       provider: "openai", // or "groq" | "local" per-tenant
     });

     const llmResult = await generateChatCompletion({
       provider: "openai",
       model,
       messages,
       temperature: 0.2,
       apiKey,
     });
     ```

3. For multi-tenant per-provider routing, persist a provider field in
   `tenant_integrations.api_credentials` (e.g. `"provider": "groq"`)
   and branch on that when calling `generateChatCompletion`.

This gives you a clean, future-proof place to add Anthropic or other providers later,
without rewriting your routes again.
