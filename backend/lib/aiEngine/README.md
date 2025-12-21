# AiSHA AI Engine — Multi-Provider LLM Abstraction Layer

A lightweight, modular library for **multi-provider LLM** routing in Aisha CRM.
Supports **OpenAI, Anthropic (Claude), Groq**, and local OpenAI-compatible servers (e.g., LM Studio).

---

## Features

- **Multi-Provider Support:** OpenAI, Anthropic (Claude), Groq, and local LLMs
- **Automatic Failover:** Primary → fallback provider chain with configurable priorities
- **Per-Tenant Configuration:** Override provider/model per tenant via env vars or database
- **Capability-Based Routing:** Select models based on task requirements (chat_tools, json_strict, etc.)
- **API Key Resolution:** Cascading priority (explicit → header → user → tenant → system)

---

## Quick Start

```js
import { 
  selectLLMConfigForTenant, 
  resolveLLMApiKey, 
  callLLMWithFailover 
} from "../lib/aiEngine/index.js";

// 1. Get provider+model config for a capability
const modelConfig = await selectLLMConfigForTenant("json_strict", tenantRecord?.id);
// Returns: { provider: "openai", model: "gpt-4o-mini", failoverChain: ["openai", "anthropic", "groq"] }

// 2. Resolve API key for the selected provider
const apiKey = await resolveLLMApiKey({
  tenantSlugOrId: tenantRecord?.tenant_id,
  provider: modelConfig.provider,
});

// 3. Call with automatic failover
const result = await callLLMWithFailover({
  messages,
  capability: "json_strict",
  tenantId: tenantRecord?.id,
  temperature: 0.2,
});
```

---

## Files

| File | Purpose |
|------|---------|
| `modelRouter.js` | Central registry for capability → model mapping. Exports `pickModel()`, `selectLLMConfigForTenant()`, `getProviderDefaultModel()` |
| `keyResolver.js` | Resolves API key from tenant → user → system → env |
| `llmClient.js` | Multi-provider HTTP client. Exports `generateChatCompletion()`, `callLLMWithFailover()` |
| `tenantContext.js` | Helpers for tenant resolution and user access validation |
| `activityLogger.js` | Real-time LLM call logging with token usage. Exports `logLLMActivity()`, `getLLMActivity()`, `getLLMActivityStats()`, `clearLLMActivity()` |
| `index.js` | Convenience re-exports for all modules |

---

## Providers & Models

### Supported Providers

| Provider | API Style | Default Base URL |
|----------|-----------|------------------|
| `openai` | OpenAI | `https://api.openai.com/v1` |
| `anthropic` | Native Claude | `https://api.anthropic.com` |
| `groq` | OpenAI-compatible | `https://api.groq.com/openai/v1` |
| `local` | OpenAI-compatible | `http://localhost:1234/v1` |

### Capability → Model Mapping

| Capability | OpenAI | Anthropic | Groq | Use Case |
|------------|--------|-----------|------|----------|
| `chat_tools` | gpt-4o | claude-3-5-sonnet-20241022 | llama-3.3-70b-versatile | AI Chat with tool calling |
| `chat_light` | gpt-4o-mini | claude-3-haiku-20240307 | llama-3.1-8b-instant | Quick responses, low cost |
| `json_strict` | gpt-4o-mini | claude-3-haiku-20240307 | llama-3.1-8b-instant | Structured JSON output |
| `brain_read_only` | gpt-4o | claude-3-5-sonnet-20241022 | llama-3.3-70b-versatile | Market insights, analysis |
| `brain_plan_actions` | gpt-4o | claude-3-5-sonnet-20241022 | llama-3.3-70b-versatile | AI Brain task planning |
| `realtime_voice` | gpt-4o-realtime-preview | N/A | N/A | WebRTC voice API |

---

## Environment Variables

### API Keys (Required for each provider you want to use)
```bash
OPENAI_API_KEY=sk-...           # OpenAI
ANTHROPIC_API_KEY=sk-ant-...    # Anthropic Claude
GROQ_API_KEY=gsk_...            # Groq
LOCAL_LLM_API_KEY=lm-studio     # Local server (if required)
```

### Provider Selection
```bash
# Primary provider for all AI requests
LLM_PROVIDER=openai             # openai | anthropic | groq | local

# Failover chain (comma-separated, falls back in order)
LLM_FAILOVER_CHAIN=openai,anthropic,groq
```

### Model Overrides (Optional)
```bash
# OpenAI model overrides
OPENAI_MODEL_CHAT_TOOLS=gpt-4o
OPENAI_MODEL_JSON_STRICT=gpt-4o-mini

# Anthropic model overrides
ANTHROPIC_MODEL_CHAT_TOOLS=claude-3-5-sonnet-20241022
ANTHROPIC_MODEL_JSON_STRICT=claude-3-haiku-20240307

# Groq model overrides (useful for custom fine-tunes)
GROQ_MODEL_CHAT_TOOLS=llama-3.3-70b-versatile
GROQ_MODEL_JSON_STRICT=llama-3.1-8b-instant
```

### Base URL Overrides (Optional)
```bash
OPENAI_BASE_URL=https://api.openai.com/v1
GROQ_BASE_URL=https://api.groq.com/openai/v1
LOCAL_LLM_BASE_URL=http://localhost:1234/v1
```

---

## Core Functions

### `modelRouter.js`

```js
import { pickModel, selectLLMConfigForTenant, getProviderDefaultModel } from "./modelRouter.js";

// Simple model selection (uses LLM_PROVIDER env var)
const model = pickModel({ capability: "chat_tools" });

// Tenant-aware selection with full config
const config = await selectLLMConfigForTenant("json_strict", tenantId);
// Returns: { provider: "openai", model: "gpt-4o-mini", failoverChain: ["openai", "anthropic", "groq"] }

// Get default model for a specific provider
const groqModel = getProviderDefaultModel("chat_tools", "groq");
// Returns: "llama-3.3-70b-versatile"
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

A **multi-provider** LLM client supporting OpenAI-compatible endpoints and native Anthropic API.

#### Basic Usage

```js
import { generateChatCompletion } from "./llmClient.js";

const result = await generateChatCompletion({
  provider: "openai",   // "openai" | "anthropic" | "groq" | "local"
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

#### With Automatic Failover

```js
import { callLLMWithFailover } from "./llmClient.js";

// Automatically tries providers in order until one succeeds
const result = await callLLMWithFailover({
  messages,
  capability: "json_strict",
  tenantId: tenantRecord?.id,
  temperature: 0.2,
});
// Tries: openai → anthropic → groq (based on LLM_FAILOVER_CHAIN)
```

#### Providers

| Provider | API Style | Base URL Env | Key Env |
|----------|-----------|--------------|---------|
| `openai` | OpenAI | `OPENAI_BASE_URL` | `OPENAI_API_KEY` |
| `anthropic` | Native Claude | (hardcoded) | `ANTHROPIC_API_KEY` |
| `groq` | OpenAI-compatible | `GROQ_BASE_URL` | `GROQ_API_KEY` |
| `local` | OpenAI-compatible | `LOCAL_LLM_BASE_URL` | `LOCAL_LLM_API_KEY` |

The `anthropic` provider uses the **native Claude API** (not OpenAI-compatible).
All other providers use the OpenAI-compatible `/chat/completions` endpoint.

---

## Integration Examples

### AI Chat Route (`routes/ai.js`)

```js
import { selectLLMConfigForTenant, resolveLLMApiKey } from "../lib/aiEngine/index.js";
import OpenAI from "openai";

// Helper to create provider-specific client
function createProviderClient(provider, apiKey) {
  const baseURLs = {
    openai: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    groq: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    anthropic: "https://api.anthropic.com/v1",
    local: process.env.LOCAL_LLM_BASE_URL || "http://localhost:1234/v1",
  };
  return new OpenAI({ apiKey, baseURL: baseURLs[provider] || baseURLs.openai });
}

// In your route handler:
const modelConfig = await selectLLMConfigForTenant("chat_tools", tenantRecord?.id);
const apiKey = await resolveLLMApiKey({
  tenantSlugOrId: tenantRecord?.tenant_id,
  provider: modelConfig.provider,
});
const client = createProviderClient(modelConfig.provider, apiKey);

const response = await client.chat.completions.create({
  model: modelConfig.model,
  messages,
  temperature: 0.7,
});
```

### MCP Tool Execution (`routes/mcp.js`)

```js
import { callLLMWithFailover } from "../lib/aiEngine/llmClient.js";

// For llm.generate_json tool - uses automatic failover
const result = await callLLMWithFailover({
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
  capability: "json_strict",
  tenantId,
  temperature: 0.2,
});
```

### AI Brain (`lib/aiBrain.js`)

```js
import { selectLLMConfigForTenant, resolveLLMApiKey } from "./aiEngine/index.js";
import OpenAI from "openai";

// Get tenant-aware config
const llmConfig = await selectLLMConfigForTenant("brain_plan_actions", tenantId);
const apiKey = await resolveLLMApiKey({
  tenantSlugOrId: tenant?.tenant_id,
  provider: llmConfig.provider,
});

// Create client with provider-specific base URL
const openai = new OpenAI({
  apiKey,
  baseURL: llmConfig.provider === "groq" 
    ? "https://api.groq.com/openai/v1"
    : llmConfig.provider === "anthropic"
    ? "https://api.anthropic.com/v1"
    : undefined,
});
```

---

## Failover Behavior

The `callLLMWithFailover` function:

1. Gets the failover chain from `LLM_FAILOVER_CHAIN` env var (default: `openai,anthropic,groq`)
2. Tries each provider in order
3. If a provider fails (API error, timeout, missing key), tries the next one
4. Returns the first successful response
5. Logs which provider was used and any failover attempts

Example failover scenario:
```
[LLM] Primary openai failed: 429 Rate limit exceeded
[LLM] Falling back to anthropic...
[LLM] anthropic succeeded with claude-3-haiku-20240307
```

---

## Per-Tenant Configuration

Tenants can override the default provider via `tenant_integrations`:

```sql
INSERT INTO tenant_integrations (tenant_id, integration_type, api_credentials)
VALUES (
  'your-tenant-uuid',
  'openai_llm',
  '{"provider": "groq", "api_key": "gsk_..."}'::jsonb
);
```

The `selectLLMConfigForTenant` function will:
1. Check for tenant-specific override in `tenant_integrations`
2. Fall back to system-level `LLM_PROVIDER` env var
3. Use the appropriate model for the selected provider

---

## Activity Logger

Real-time monitoring of all LLM calls with token usage tracking.

### Module: `activityLogger.js`

```js
import { 
  logLLMActivity, 
  getLLMActivity, 
  getLLMActivityStats, 
  clearLLMActivity 
} from "./activityLogger.js";

// Log an LLM call
logLLMActivity({
  tenantId: "tenant-uuid",
  capability: "chat_tools",
  provider: "openai",
  model: "gpt-4o",
  nodeId: "ai:chat:iter0",
  status: "success",          // "success" | "error" | "failover"
  durationMs: 1500,
  usage: { prompt_tokens: 500, completion_tokens: 50, total_tokens: 550 },
  attempt: 1,
  totalAttempts: 1,
});

// Get recent activity
const entries = getLLMActivity({ 
  limit: 100, 
  provider: "openai",
  capability: "chat_tools",
  status: "success",
  since: "2025-12-07T00:00:00Z" 
});

// Get aggregated stats
const stats = getLLMActivityStats();
// Returns: { totalEntries, last5Minutes, avgDurationMs, byProvider, tokenUsage, ... }

// Clear logs
clearLLMActivity();
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/system/llm-activity` | GET | Get recent LLM calls with optional filters |
| `/api/system/llm-activity/stats` | GET | Get aggregated stats and token usage |
| `/api/system/llm-activity` | DELETE | Clear activity log |

### Container Identification

Each container logs its `MCP_NODE_ID` for distributed tracing:

```bash
# docker-compose.yml
environment:
  - MCP_NODE_ID=aishacrm-backend

# braid-mcp-node-server/docker-compose.yml  
environment:
  - MCP_NODE_ID=braid-mcp-1
```

### Frontend

Settings → **LLM Monitor** tab provides:
- Real-time activity table with auto-refresh (3s)
- Filter by provider, capability, status
- Token usage stats (prompt/completion/total)
- Color-coded badges (OpenAI=green, Anthropic=orange, Groq=purple)
- Error panel for recent failures

