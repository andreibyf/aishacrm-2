# Models & routing

Several models across two engines on one box, plus how AiSHA decides which one a request uses.

## The models

| Model | Engine | Device | Endpoint | Role |
| --- | --- | --- | --- | --- |
| `qwen-14b` (Qwen2.5-14B-Instruct-AWQ) | **vLLM** | GPU | `:8000/v1` | **Full tier** — chat tools, summaries |
| `qwen2.5:3b` | **Ollama** | CPU | `:11434` | **Lite tier** — fast, simple text |
| `qwen2.5-coder:7b` | **Ollama** | CPU | `:11434` | **Lite-plus tier** — structured/JSON |
| `qwen2.5:7b` | **Ollama** | CPU | `:11434` | General 7B — prose alternative to the coder |
| `qwen2.5:14b` | **Ollama** | CPU | `:11434` | Heavy CPU tier — free but slow (~20–40s), async only |
| `nomic-embed-text` | **Ollama** | CPU | `:11434` | Embeddings (768-dim) — available, not yet wired (see failover caveat) |

> Only **one model fits on the GPU** (`qwen-14b` ≈ 14.8/16 GB). Everything else is CPU/Ollama — disk and RAM are abundant (823 GB / ~25 GB free), so more CPU models can be added freely; the only shared constraint is CPU compute under concurrency. See [failover.md](./failover.md) for the resilience story.

### Why the CPU models can't hurt vLLM

vLLM holds ~14.8 of the 16 GB VRAM, so there is no GPU headroom for a second model. Ollama is **forced CPU-only** via a systemd drop-in:

```ini
# /etc/systemd/system/ollama.service.d/cpu-only.conf
[Service]
Environment="CUDA_VISIBLE_DEVICES="
```

With the GPU hidden, every Ollama model runs on the CPU (16 threads, 32 GB RAM) and can never evict vLLM. Verify any time with `ollama ps` → the `PROCESSOR` column must read `100% CPU`, and `nvidia-smi` VRAM should be unchanged (~14.8 GB = vLLM only).

> **Trade-off:** the 3B on CPU is ~4 s/request and the 7B ~8–15 s — *slower* than the 14B on GPU (~1.8 s). The lite tiers are about **GPU offload** (keeping cheap/bulk work off the GPU so vLLM capacity stays free), **not** latency. Use them for async/background tasks.

## LiteLLM aliases

Backend code never names a provider/model directly for these paths — it sends a **virtual alias** and `litellm_config.yaml` decides routing. Local-LLM aliases:

| Alias | Routes to | `api_base` env |
| --- | --- | --- |
| `aisha-summary` | `qwen-14b` (vLLM/GPU) | `LOCAL_LLM_BASE_URL` |
| `aisha-task` | `qwen-14b` (vLLM/GPU) | `LOCAL_LLM_BASE_URL` |
| `aisha-task-lite` | `qwen2.5:3b` (Ollama/CPU) | `LOCAL_LLM_OLLAMA_BASE_URL` |
| `aisha-task-lite-plus` | `qwen2.5-coder:7b` (Ollama/CPU) | `LOCAL_LLM_OLLAMA_BASE_URL` |
| `aisha-lite-7b` | `qwen2.5:7b` (Ollama/CPU) | `LOCAL_LLM_OLLAMA_BASE_URL` |
| `aisha-cpu-14b` | `qwen2.5:14b` (Ollama/CPU) | `LOCAL_LLM_OLLAMA_BASE_URL` |

Env values (Doppler `dev_personal` + `.env`):

```
LOCAL_LLM_BASE_URL=http://192.168.7.219:8000/v1     # vLLM
LOCAL_LLM_OLLAMA_BASE_URL=http://192.168.7.219:11434 # Ollama
```

**Fallbacks** (in `router_settings.fallbacks`) keep things degrading gracefully, never hard-failing:

- `aisha-task-lite` → `aisha-task` (GPU) → `groq/llama-3.3-70b-versatile`
- `aisha-task-lite-plus` → `aisha-task` (GPU) → groq

So if Ollama is slow or down, a lite request quietly falls to the GPU tier, then to Groq.

## Agent tier routing (`model_tier`)

Each agent role in `backend/lib/agents/agentRegistry.js` carries `metadata.model_tier`. `backend/workers/taskWorkers.js` picks the alias from it (only when `LITELLM_ENABLED`):

| `model_tier` | Alias used |
| --- | --- |
| `lite` | `aisha-task-lite` |
| `full` (default) | `aisha-task` |

Resolution precedence (per role): **per-role env → global `AISHA_DEFAULT_MODEL_TIER` env → built-in default → `full`**. Only `lite`/`full` are honored; anything else falls through to `full`.

**Conservative default:** only `customer_service_manager` ships as `lite`; every other role is `full`. Widen the lite set **without a code change** by setting env vars:

| Role | Env var |
| --- | --- |
| ops_manager | `AISHA_OPS_MODEL_TIER` |
| sales_manager | `AISHA_SALES_MODEL_TIER` |
| client_services_expert | `AISHA_CS_EXPERT_MODEL_TIER` |
| project_manager | `AISHA_PM_MODEL_TIER` |
| marketing_manager | `AISHA_MKT_MODEL_TIER` |
| customer_service_manager | `AISHA_CS_MODEL_TIER` |

e.g. `AISHA_OPS_MODEL_TIER=lite` in Doppler `dev_personal`. Or flip everything at once with `AISHA_DEFAULT_MODEL_TIER=lite`.

### Planned: lite-plus as a middle escalation rung

`aisha-task-lite-plus` (the 7B) is wired but not yet routed by `model_tier`. The intended shape is a three-rung escalation that stays off the GPU as long as possible: **lite (3B CPU) → lite-plus (7B CPU) → full (14B GPU)**, with escalation driven by the quality pipeline (see `docs/plans/2026-06-11-lite-tier-supervisor-refine.md`). Until then it can be targeted by mapping a capability/alias to it manually.

## Adding / changing a model

1. On the box: `ollama pull <model>` (CPU models) — it inherits the CPU-only lock automatically.
2. Add a `model_name` alias in `litellm_config.yaml` pointing at `ollama_chat/<model>` + `LOCAL_LLM_OLLAMA_BASE_URL`, with a fallback entry.
3. Rebuild/recreate the litellm container so it reloads config + env (`docker compose up -d litellm`).
4. (Optional) reference the alias from a `model_tier` rung or capability map.
