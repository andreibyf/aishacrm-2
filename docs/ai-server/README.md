# AI Server — documentation

Everything about the **AiSHA AI Cloud Server** (the HP Omen box that serves the models, runs the shared task workers, and hosts the admin monitor) lives in this folder.

| Doc | What it covers |
| --- | --- |
| [setup.md](./setup.md) | One-time build/install: Ubuntu, NVIDIA/CUDA, vLLM-from-source (Blackwell), Ollama, systemd services, Tailscale, Doppler wiring, known Blackwell patches. |
| [models-and-routing.md](./models-and-routing.md) | The models across 2 engines, the GPU/CPU split, LiteLLM aliases, and the `model_tier` agent routing (full / lite / lite-plus). |
| [failover.md](./failover.md) | **Resilience** — cloud-as-backup, what falls over and what doesn't, the worker-SPOF, and the backend-hosted-workers migration. |
| [workers-and-deploy.md](./workers-and-deploy.md) | The task-worker layer (migrating to backend-hosted), the Bull queue, the job `meta` enrichment, and how to deploy worker code changes. |
| [monitor.md](./monitor.md) | The `vllm_admin.py` admin panel at `:7860` — Overview / Requests / By Model / Audit tabs, the request-monitor architecture, and how to operate it. |

---

## What this box is

| | |
| --- | --- |
| **Hardware** | HP Omen 35L — AMD Ryzen 7 9800X3D (16 threads), **RTX 5070 Ti 16 GB** (Blackwell sm_120), 32 GB DDR5 |
| **OS** | Ubuntu 24.04 LTS |
| **Role** | Dedicated inference + shared agent-task execution. Its sole purpose is serving models and running workers. |
| **LAN IP** | `192.168.7.219` (DHCP — has changed before; was `.200`) |
| **Tailscale** | `100.81.132.118` (hostname `ai-cloud-server`) — how staging/prod reach it |
| **SSH** | `ssh aisha@192.168.7.219` (LAN) — passwordless sudo for `aisha` |

> **IP note:** the LAN IP is DHCP and has moved before. If inference suddenly fails, re-check `LOCAL_LLM_BASE_URL` / `LOCAL_LLM_OLLAMA_BASE_URL` in Doppler + `.env` and the `192.168.7.219` references in these docs.

## Service map

| Service | Port | Manager | Purpose |
| --- | --- | --- | --- |
| **vLLM** | `8000` | systemd `vllm` | Qwen2.5-14B-AWQ on the **GPU** — the "full" tier (`aisha-task`, `aisha-summary`) |
| **Ollama** | `11434` | systemd `ollama` | CPU lite models `qwen2.5:3b` + `qwen2.5-coder:7b` — **GPU-locked off** so they never touch vLLM's VRAM |
| **Admin monitor** | `7860` | systemd `vllm-admin` | `vllm_admin.py` dashboard (GPU/health/config/logs + Requests/By-Model/Audit) |
| **Task-queue Redis** | `6381` | (Redis) | Bull `task-execution:{dev,staging,prd}` queue — **bound to `127.0.0.1` only** |
| **PM2 workers** | — | PM2 (`aisha`) | `worker-dev` / `worker-staging` / `worker-prd` — process agent tasks for all three CRM environments |

Reach the models **by IP over the network** (vLLM `:8000`, Ollama `:11434`). They are **not** docker-compose services — the CRM app stack runs on VPS-1 / Hetzner / your laptop, never on this box.

## Ops cheat-sheet

```bash
# Health
ssh aisha@192.168.7.219 "systemctl is-active vllm ollama vllm-admin; nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader"
ssh aisha@192.168.7.219 "ollama ps; ollama list"           # CPU models: loaded + installed
ssh aisha@192.168.7.219 "pm2 list"                          # worker status

# Restart a service
ssh aisha@192.168.7.219 "sudo systemctl restart vllm"       # or: ollama | vllm-admin

# Logs
ssh aisha@192.168.7.219 "sudo journalctl -u vllm -n 50 --no-pager"
ssh aisha@192.168.7.219 "pm2 logs worker-dev --lines 50"

# Deploy worker code changes (from repo root, Windows)
.\scripts\sync-workers-to-ai-server.ps1

# Monitor UI (from your laptop browser)
#   http://192.168.7.219:7860/
```

> **Python on the box:** there is no `python` on PATH and the app deps (redis, httpx) live only in the vLLM venv. Use `/home/aisha/vllm-env/bin/python`, not `python`.
