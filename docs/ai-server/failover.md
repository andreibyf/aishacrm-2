# Failover & resilience

The AI server is **one home box with no hardware redundancy** (a deliberate cost choice). The resilience strategy is therefore: **cloud models are the backup**, and the things that *invoke* the models live on always-on hosts so they survive a box outage. This doc is the definitive map of what fails over and what doesn't.

## Two kinds of outage — they behave differently

**1. The models are down, the box is up** (vLLM crashed / Ollama hung, but OS + workers alive):
- A worker makes the model call → it fails → **LiteLLM falls it over to a cloud model**. Task completes on cloud. ✓

**2. The whole box is down** (power / network / OS):
- This is *not* a model-failover problem — it's a "who's alive to make the call" problem. The fix is keeping the **executor off the box** (see Worker resilience below).

## Model-call failover (LiteLLM)

Backend code calls **virtual aliases**; `litellm_config.yaml`'s `router_settings.fallbacks` decides the cloud backup. Every alias that can hit the box falls over to cloud:

| Alias | Primary (box) | Falls over to |
| --- | --- | --- |
| `aisha-summary` | vLLM `qwen-14b` | `groq/llama-3.3-70b` |
| `aisha-task` | vLLM `qwen-14b` | `groq/llama-3.3-70b` |
| `aisha-task-lite` | Ollama `qwen2.5:3b` | `aisha-task` (GPU) → groq |
| `aisha-task-lite-plus` | Ollama `qwen2.5-coder:7b` | `aisha-task` (GPU) → groq |
| `aisha-lite-7b` | Ollama `qwen2.5:7b` | `aisha-task` (GPU) → groq |
| `aisha-cpu-14b` | Ollama `qwen2.5:14b` | `aisha-task` (GPU) → groq |

The cloud-native aliases (`aisha-vision`→gpt-4o, `aisha-mcp`/`aisha-whatsapp`→Claude, `aisha-workflow`→Haiku) don't touch the box at all.

**Keys are verified present** in Doppler `dev_personal`, `stg_stg`, and `prd_prd`: `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, with `LITELLM_ENABLED=true`. A fallback chain is only as good as its keys — keep these set in every environment.

### Coverage audit (which paths fall over)

| Path | Routes via | When box down |
| --- | --- | --- |
| Summaries (`aiSummary.js`) | `aisha-summary` alias | → groq ✓ |
| Agent tasks (`taskWorkers.js`) | `aisha-task` / `aisha-task-lite` | → groq ✓ |
| Vision / MCP / WhatsApp / Workflow | cloud-native aliases | unaffected ✓ |
| Chat (`routes/ai.js`) | direct provider client | **defaults to OpenAI** — only hits box if a capability is set to `local` (it isn't) |
| Embeddings (`aiMemory/embedder.js`) | direct provider call | **defaults to OpenAI** — see caveat below |
| AI Brain (`aiBrain.js`) | `generateChatCompletion` / direct | defaults to Anthropic; the LiteLLM path falls over, the raw-OpenAI-compat path doesn't |

**The 3 "direct" paths are not currently exposed** — they default to cloud and no capability is configured to `local`. They are documented gaps, not active risks. If you ever route a capability to `local`, add a cloud fallback for that path first.

### Caveat: embeddings can't naively fall over

Embedding **dimensions must match** across the vector store (OpenAI `text-embedding-3-small` = 1536; Ollama `nomic-embed-text` = 768). A naive local→OpenAI fallback would mix dimensions and corrupt the index. So embeddings deliberately **default to OpenAI** and have no auto-fallback. If you want local embeddings (`nomic-embed-text` is pulled and available), configure a **dimension-matched** cloud fallback (OpenAI supports a `dimensions` param to truncate to 768).

## Worker resilience (the real single point of failure)

Model failover only fires if **something is alive to make the call**. The agent-task **workers** and the **Bull queue Redis** both being on the box is the actual SPOF — a full box outage takes out the executor and the queue, so background tasks *pause* (nothing alive to fail over).

**History:** before the AI server, workers ran **in-process in the CRM backend** (`server.js` → `startTaskWorkers()`), on the backend's own Redis. That was resilient (the backend is always-on). The "HP Omen shared AI execution layer" change (commit `990153d3`) moved them to a PM2 pool on the box + the box's Redis 6381 — which is what introduced the SPOF.

**Target topology (posture B — a revert):** workers run **in the backend** again, queue on the backend's Redis; the **box is a model server only**. If the box dies, the backend worker keeps pulling jobs and the model call falls over to cloud.

| Setting | Value for resilient (backend-hosted) workers |
| --- | --- |
| `TASK_WORKERS_ENABLED` | `true` (in the backend's Doppler config) |
| `TASK_QUEUE_REDIS_URL` | **unset** → falls back to `REDIS_MEMORY_URL` (the backend's own Redis) |
| HP Omen PM2 workers | stopped (box no longer runs workers) |

> **Env-precedence gotcha:** the backend node process reads the **Doppler** value over the compose `environment:` block. Setting `TASK_WORKERS_ENABLED` in `.env` alone is *not* enough — it must be set in the environment's **Doppler** config, and the container **force-recreated** (`docker compose up -d --force-recreate`) to re-fetch.

### Migration status — DONE (all environments, 2026-06-12)

`TASK_WORKERS_ENABLED=true` + `TASK_QUEUE_REDIS_URL` removed in Doppler `dev_personal` / `stg_stg` / `prd_prd`; each backend now logs `[TaskWorkers] Starting Ops Dispatch and Execute workers` and runs the queue on its own `redis-memory` (verified clean — no `ECONNREFUSED`/Redis errors in the staging + prod deploy logs). All three HP Omen PM2 workers (`worker-dev`/`worker-staging`/`worker-prd`) are **stopped** (kept, not deleted, for easy rollback). The box is now **model-server-only** (vLLM + Ollama + monitor).

> **The resolved "open question":** the box's Redis 6381 is bound to `127.0.0.1` only and was **never reachable** from the staging/prod backends over Tailscale — they had `TASK_QUEUE_REDIS_URL=…:6381` but couldn't connect, and `staging`/`prd` had **0 completed jobs ever**. So agent-task processing in staging/prod had been **silently broken** since the HP Omen externalization. This migration *fixed* it (queue back on the always-on backend's own Redis), in addition to removing the SPOF.

**Rollback** (per env): restore Doppler `TASK_WORKERS_ENABLED=false` + re-add `TASK_QUEUE_REDIS_URL`, redeploy the backend, and `pm2 start worker-<env>` on the box.

## Validating failover (do this in staging)

1. Take the box offline (or stop vLLM): `ssh aisha@192.168.7.219 "sudo systemctl stop vllm"`.
2. Trigger a summary or agent task → confirm it still completes (served by Groq), and the monitor/logs show the fallback.
3. Bring it back: `sudo systemctl start vllm`.
4. For a *full-box* outage test: confirm a backend-hosted worker still processes a queued task with the box powered off.
