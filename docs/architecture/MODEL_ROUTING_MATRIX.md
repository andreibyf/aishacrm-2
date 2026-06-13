# Model Routing Matrix

**What model handles each task category, what the fallbacks are, who generates content, and what it costs.**

> **Last verified:** 2026-06-13 against `litellm_config.yaml`, `backend/lib/aiEngine/modelRouter.js`,
> `backend/lib/quality/complexityRouter.js`, `backend/lib/quality/taskType.js`, `backend/lib/aiBrain.js`,
> and the `.braid` tool definitions. Pricing is approximate (early-2026) and rounded.

---

## TL;DR

- There are **two independent routers**. Which one you hit depends on the **feature**, not on how "simple" the request is.
  - **Router 1 — LiteLLM virtual aliases** (config-driven): agentic tasks, summaries, growth, documents, MCP, WhatsApp, C.A.R.E. workflows.
  - **Router 2 — Capability router** (code-driven, no alias): `aiBrain` features (email drafting, AI suggestions) + AiSHA chat → the tenant's `LLM_PROVIDER` (dev = Anthropic).
- An agentic task is **orchestrated** by a local model (3B/7B/14B), but each tool decides **who writes the content** — some tools delegate to Anthropic.
- The only things that **cost money** are Anthropic delegations (email/suggestions/chat/MCP/WhatsApp), vision OCR (gpt-4o), and C.A.R.E. workflow emails (Haiku). Local tiers (orchestration, notes/activities, summaries, growth) are effectively **$0**.

---

## Router 1 — LiteLLM virtual aliases

Backend code sends an alias name; the primary model + fallback chain live in `litellm_config.yaml`.
**Requires `LITELLM_ENABLED=true` and the AI box (vLLM/Ollama) reachable.**

| Task category | Alias | Primary model | Fallback chain |
|---|---|---|---|
| Contact/Lead/Account **summaries** | `aisha-summary` | **Qwen2.5-14B** (vLLM, GPU) | → groq llama-3.3-70b |
| **Growth scorer / insights** | `aisha-summary` | **Qwen2.5-14B** (vLLM, GPU) | → groq llama-3.3-70b |
| **Agentic task** — full tier | `aisha-task` | **Qwen2.5-14B** (vLLM, GPU) | → groq llama-3.3-70b |
| Agentic task — lite (3B) | `aisha-task-lite` | **Qwen2.5-3B** (Ollama, CPU) | → `aisha-task` (14B GPU) → groq |
| Agentic task — mid (7B) | `aisha-lite-7b` | **Qwen2.5-7B** (Ollama, CPU) | → `aisha-task` (14B GPU) → groq |
| Agentic task — coder/JSON | `aisha-task-lite-plus` | **Qwen2.5-Coder-7B** (Ollama, CPU) | → `aisha-task` (14B GPU) → groq |
| Heavy background (CPU) | `aisha-cpu-14b` | **Qwen2.5-14B** (Ollama, CPU) | → `aisha-task` (14B GPU) → groq |
| **Document/image** OCR | `aisha-vision` | **gpt-4o** (OpenAI, vision) | → claude-sonnet-4 |
| **MCP** planning / **Market insights** | `aisha-mcp` | **claude-sonnet-4** (Anthropic) | → gpt-4o |
| **WhatsApp** AI replies | `aisha-whatsapp` | **claude-sonnet-4** (Anthropic) | → gpt-4o |
| **C.A.R.E. workflow** nodes (summarize/email) | `aisha-workflow` | **claude-3-5-haiku** (Anthropic) | → groq llama-3.3-70b |

---

## Router 2 — Capability router (no alias)

`aiBrain` features + AiSHA chat call `selectLLMConfigForTenant(capability)` → the **tenant's provider**
(`LLM_PROVIDER`, dev = `anthropic`) → that provider's default model (`modelRouter.js`).
The complexity-routing flag does **not** affect this path.

| Feature | Capability | provider=**anthropic** | provider=groq | provider=openai |
|---|---|---|---|---|
| **Email drafting** (`/api/ai/chat-draft-email`) | `brain_read_only` | **claude-sonnet-4** | llama-3.3-70b | gpt-4o |
| **AI Suggestions** | `brain_plan_actions` | claude-sonnet-4 | llama-3.3-70b | gpt-4o |
| **AiSHA Chat** | `chat_tools` | claude-sonnet-4 | llama-3.3-70b | gpt-4o |
| light / JSON helpers | `chat_light` / `json_strict` | claude-3-5-haiku | llama-3.1-8b | gpt-4o-mini |

**Router-2 fallback:** when routed through LiteLLM, the passthrough chain is `anthropic/* → openai/* → groq/*`.
Provider is overridable per tenant via `LLM_PROVIDER__TENANT_<uuid>`.

---

## Agentic-task tier ladder (the lite-tier system)

Within the "agentic task" category, the **entry** model is chosen by `routeEntryTier`
(only when `AISHA_COMPLEXITY_ROUTING=true`; otherwise the agent role's `model_tier`).
The quality pipeline then **escalates** a rung if the output fails the gate (when `LITE_QUALITY_MODE=active`).

```
   task text ──► sequence words? ("…then…", "once they reply") ─yes─► FULL
              ──► structured out? (json·csv·table·export·fields) ─yes─► CODER
              ──► 2+ action intents? ("note AND meeting")        ─yes─► FULL
              ──► exactly 1 action intent ("create a note")      ─────► LITE (3B)
              ──► 0 action intents ("review strategy")           ─────► role's model_tier

   ESCALATION (on gate failure):   LITE 3B ─► MID 7B ─► FULL 14B GPU
                                   CODER 7B ───────────► FULL 14B GPU
```

### What qualifies as **lite** — examples

| Tier | Model | Qualifies when… | Example phrasing |
|---|---|---|---|
| **lite** | Qwen2.5-3B (CPU) | exactly **1** action intent; not sequenced; not structured | "Create a **note**…", "**Schedule** a meeting at 3pm", "Draft an **email** to Acme", "Log a **call**", "Add a **follow-up**" |
| **coder** | Qwen2.5-Coder-7B (CPU) | structured/machine-readable output | "Export a **CSV** of leads", "Return contacts as **JSON** with id+email **fields**", "Build a **table** by stage" |
| **full** | Qwen2.5-14B (vLLM GPU) | **2+** intents OR an explicit **sequence** | "Create a note **and** set up a meeting", "Schedule a call **then** remind **once they reply**" |
| **mid** | Qwen2.5-7B (CPU) | **never an entry tier** — only via escalation from lite | *(escalation only)* |
| **(role default)** | the role's `model_tier` | task maps to **no** action (0 intents) | "Update the pipeline forecast", "Review our strategy" |

**Action-intent keywords** (one = lite): `note` · `email/compose/reply/outreach` · `meeting/appointment/schedule/reminder/follow-up` · `call` · `contact` · `summarize/recap/brief` · `research/look up`.

> ⚠️ **The flag matters.** When `AISHA_COMPLEXITY_ROUTING=false` (the code default), the table above is bypassed —
> the tier is simply the **assigned agent role's `model_tier`**, regardless of phrasing.
> (As of 2026-06-13, **dev** has it **ON** with `LITE_QUALITY_MODE=active`; staging/prod must be verified per-env.)

---

## Orchestrate vs. Generate (who writes the content)

An agentic task is always **orchestrated** by the local tier model (3B/7B/14B). But each tool decides who
produces the *content* — and some tools **delegate to Anthropic**. This is why an email drafted *from a task*
still shows up as `aiBrain:email_generation:generate_content` / Anthropic in the monitor.

| Group | Tools | Content written by | Model | ~Cost / call |
|---|---|---|---|---|
| **A · Local inline** | `create_note`, `create_activity`, `create_contact`, `create_lead`, `update_*`, `schedule_meeting`, `convert/promote/advance` | the **task-tier model** writes it into the tool args | local 3B/14B | **≈ $0** |
| **B · Delegates → Anthropic** | `draft_email`, `suggest_next_actions`, `trigger_suggestion_generation` | `aiBrain` (`generate_content` / `brain_*`) | **Claude Sonnet-4** | **$0.012–0.02** |
| **C · Delegates → local LLM** | `request_insight_run` (growth) | growth scorer → `aisha-summary` | **vLLM Qwen-14B** | **≈ $0** |
| **D · Computed / external (no LLM)** | `get_health_summary`, `get_cashflow_summary`, `get_latest_insight`, `search_web`, `fetch_web_page`, `lookup_company_info`, list/get/approve/reject suggestions | DB aggregation or external fetch | none | **≈ $0** *(web tools may have a search-API fee)* |

> **Key asymmetry:** `create_note` content is written by the **local** orchestrator (we observed the 3B author note
> bodies); `draft_email` content is written by **Anthropic**. Same task, different tool, different model + cost.

---

## Per-call cost reference (approximate, early-2026)

| Model | Used by | Input / Output ($/M) | ~Per call¹ |
|---|---|---|---|
| **Local vLLM/Ollama** (Qwen 3B/7B/14B) | task tiers, summaries, growth | self-hosted | **≈ $0** (power/HW only) |
| **Claude Sonnet-4** | email draft, suggestions, chat, MCP, WhatsApp | ~$3 / ~$15 | **$0.012–0.02** |
| **Claude Haiku-3.5** | C.A.R.E. workflow nodes | ~$0.80 / ~$4 | **$0.004–0.006** |
| **OpenAI gpt-4o** | document/image OCR (vision) | ~$2.50 / ~$10 | **$0.012–0.03** (+image) |
| **Groq llama-3.3-70b** | *fallback only* (box down) | ~$0.59 / ~$0.79 | **$0.003–0.005** |

¹ assumes ~4k input + ~300–600 output tokens (matches observed: $0.0693 / 6 calls ≈ $0.0116 each).

### Practical task-cost examples

| Task | Orchestration | Content gen | ~Total |
|---|---|---|---|
| "Create a note…" | 3B local ≈$0 | Group A, local ≈$0 | **≈ $0** |
| "Draft an email…" | 3B/14B local ≈$0 | Group B → Sonnet | **~$0.012–0.02** |
| "Draft an email **and** log a call" | 14B local ≈$0 (multi-tool→full) | Sonnet email + local activity | **~$0.015–0.02** |
| "Summarize this contact" (feature) | — | `aisha-summary` → vLLM | **≈ $0** |
| "Get cashflow summary" | 3B local ≈$0 | Group D, computed | **≈ $0** |

---

## Environment switches that silently change the matrix

| Flag | Effect |
|---|---|
| `LITELLM_ENABLED=false` (or box unreachable) | Router-1 features fall back to groq/cloud per the alias chains. |
| `LLM_PROVIDER` (global or `__TENANT_<uuid>`) | Flips every Router-2 cell to that provider's column. |
| `AISHA_COMPLEXITY_ROUTING` | ON → intent-based tier table governs entry. OFF → entry = role `model_tier`. |
| `LITE_QUALITY_PIPELINE_ENABLED` + `LITE_QUALITY_MODE` | `active` → quality gate can escalate a rung; `shadow` → observe only, no escalation. |

These live in Doppler (per-config). `doppler run` snapshots secrets **at container start** — changing a flag
needs a **restart/redeploy** to take effect. Read the live value from the **node child** process, not PID 1
(PID 1 is `doppler run`, which only holds compose-passthrough vars):

```bash
# live value the server actually sees (dev container)
NODEPID=$(docker exec aishacrm-backend sh -c 'ps -o pid,ppid,args | awk "\$2==1 && /node server.js/ {print \$1; exit}"')
docker exec aishacrm-backend sh -c "tr '\0' '\n' < /proc/$NODEPID/environ | grep -E 'AISHA_COMPLEXITY_ROUTING|LITE_QUALITY|LITELLM_ENABLED'"
```

---

## How to make a feature use a different model

- **Email drafts on the local model** instead of Anthropic: point `/api/ai/chat-draft-email`'s `aiBrain`
  call (`brain_read_only`) at a local LiteLLM alias (e.g. a new `aisha-email` → vLLM), rather than the tenant
  provider. Narrow blast radius (email only).
- **All `brain_read_only` local**: set `MODEL_BRAIN_READ_ONLY` + provider `local` — but this also moves AI
  Suggestions and other brain reads (broader).
