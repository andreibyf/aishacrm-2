## 3. Test harness – validate tenant routing + failover

You can add a simple Node script plus a few curl commands.

### 3.1 Node script: `scripts/test-ai-engine.mjs`

Assumes:

- The aiEngine exports `selectLLMConfigForTenant` and `generateChatCompletion`.
    
- Env vars set for OpenAI and Anthropic.
    

``// scripts/test-ai-engine.mjs import dotenv from "dotenv"; dotenv.config();  import {   selectLLMConfigForTenant,   resolveLLMApiKey,   generateChatCompletion, } from "../lib/aiEngine/index.js";  async function runTest({ label, tenantId, capability, explicitProvider }) {   console.log(`\n=== TEST: ${label} ===`);   const cfg = selectLLMConfigForTenant({     capability,     tenantSlugOrId: tenantId,     providerOverride: explicitProvider || null,   });   console.log("Model config:", cfg);    const apiKey = await resolveLLMApiKey({     tenantSlugOrId: tenantId,     provider: cfg.provider,   });   if (!apiKey) {     console.log("NO API KEY for provider:", cfg.provider);     return;   }    const messages = [     { role: "system", content: "You are a terse diagnostic bot. Reply with one short sentence." },     { role: "user", content: `Tenant: ${tenantId || "GLOBAL"}, capability: ${capability}` },   ];    const result = await generateChatCompletion({     provider: cfg.provider,     model: cfg.model,     messages,     temperature: 0,     apiKey,   });    console.log("Result status:", result.status);   if (result.status === "error") {     console.log("Error:", result.error);   } else {     console.log("Content:", result.content);     console.log("Raw model:", result.raw?.model);   } }  async function main() {   await runTest({     label: "Global default / chat_tools",     tenantId: null,     capability: "chat_tools",   });    await runTest({     label: "Tenant ACME_INC / chat_tools",     tenantId: "acme-tenant-id-or-slug",     capability: "chat_tools",   });    await runTest({     label: "Tenant ACME_INC / json_strict",     tenantId: "acme-tenant-id-or-slug",     capability: "json_strict",   }); }  main().catch((err) => {   console.error("Test runner error:", err);   process.exit(1); });``

Run:

`node scripts/test-ai-engine.mjs`

You should see:

- Different provider/model combos when env and tenant overrides are set.
    
- Successful responses from both OpenAI and Anthropic when keys are valid.
    

---

### 3.2 cURL tests – Braid `/chat` endpoint

Global default (no tenant override):

`curl -X POST "http://localhost:3000/api/ai/chat" \   -H "Content-Type: application/json" \   -H "Authorization: Bearer TEST_TOKEN" \   -d '{     "messages": [       { "role": "user", "content": "Say: CHAT TEST GLOBAL ONE" }     ]   }'`

Tenant-specific (assuming you pass tenant via header or query and your `getTenantIdFromRequest` respects it – adapt to your exact shape):

`curl -X POST "http://localhost:3000/api/ai/chat?tenant_slug=acme-inc" \   -H "Content-Type: application/json" \   -H "Authorization: Bearer TEST_TOKEN" \   -d '{     "messages": [       { "role": "user", "content": "Say: CHAT TEST ACME TENANT" }     ]   }'`

Check logs and response payload for the model actually used; with proper env overrides you should see:

- Global: OpenAI model (e.g. `gpt-4o`).
    
- ACME tenant: Anthropic model (e.g. `claude-3-5-sonnet-20241022`).
    

---

### 3.3 cURL tests – MCP `llm.generate_json` (failover)

`curl -X POST "http://localhost:3000/api/mcp/run" \   -H "Content-Type: application/json" \   -d '{     "server_id": "llm",     "tool_name": "generate_json",     "parameters": {       "prompt": "Return a JSON object with a single key tenant and provider.",       "schema": {         "type": "object",         "properties": {           "tenant": { "type": "string" },           "provider_used": { "type": "string" }         },         "required": ["tenant", "provider_used"]       },       "context": ["Just respond with a short object."],       "tenant_id": "acme-tenant-id-or-slug"     }   }'`

Then:

1. Break Anthropic on purpose (invalid key or wrong env).
    
2. Ensure:
    
    - First attempt fails on Anthropic.
        
    - Second attempt succeeds on OpenAI.
        
    - Response JSON includes `provider` and `model` in the metadata returned by the route (from `callLLMWithFailover`’s result).