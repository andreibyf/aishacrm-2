# Admin monitor (`vllm_admin.py`)

A single-file FastAPI/HTML dashboard on the AI server that surfaces everything the box is doing.

| | |
| --- | --- |
| **URL** | `http://192.168.7.219:7860/` (open from your laptop) |
| **File** | `/home/aisha/vllm_admin.py` — **lives on the server, not in this repo** |
| **Service** | systemd `vllm-admin` |
| **Runtime** | the vLLM venv (`/home/aisha/vllm-env`), deps: fastapi, uvicorn, httpx, redis |

## Tabs

### Overview
GPU stats (nvidia-smi), vLLM health + config, a one-shot test-inference button, the latency chart, and a live `journalctl` log viewer (`vllm` / `vllm-admin`). Config edits write `~/vllm.config` and restart vLLM via `~/vllm-apply.sh`.

### Requests — agent task queue, **by topic**
The headline operational view. Reads the Bull `task-execution:{dev,staging,prd}` queues straight from local Redis (6381) and shows each job classified by **topic**, with **mismatches highlighted** and each row **labeled by environment**.

- **Topic = aligned with tools.** *Requested topic* comes from the task description; *actual topic* comes from the tools the agent actually fired (`draft_email`→email, `create_note`→note, `create_activity`→activity, …). A compound ask like "draft an email and add a note" reads as `email+note`.
- **Mismatch (red row)** = what happened didn't match what was asked — e.g. requested `email+note` but only the email tool ran ("requested note but no note tool ran") — or a quality gate failed.
- **Per-env counts** (waiting / active / done / failed) sit above the table; the box shares one Redis so envs are *labeled*, not split into separate views.
- Jobs without worker `meta` (failed / still waiting) fall back to a description-based topic guess so the row is still legible, and show the `failedReason`.

The data comes from the worker's job `meta` (see [workers-and-deploy.md](./workers-and-deploy.md)). **No push channel** — the monitor just reads the queue.

### By Model — both engines
All served models in one table with **Engine** + **State** columns:

- **vLLM (GPU)** `qwen-14b` — per-call stats from Prometheus (requests, latency, tokens); always shown via health even at rest.
- **Ollama (CPU)** `qwen2.5:3b`, `qwen2.5-coder:7b` — loaded/idle state + size from `/api/ps` + `/api/tags`.

**Lite-model activity comes from the agent task queue**, not Ollama (which exposes no per-model counters). `vllm_admin.py` aggregates completed Bull jobs by model (via the worker `meta`, mapping alias→model with `ALIAS_TO_MODEL`) to show request count, avg **task** latency, and tokens for the lite models. This captures 100% of *production* lite traffic, because the lite models are only ever called by queued agent tasks (direct calls like `aisha-summary` route to the 14B). A blank lite row means that model hasn't run a queued task yet. Note the latency is whole-task duration (agentic loop + tools), not per-call.

### Audit Log
Kafka-style request aggregates — one row per 10-second poll window in which vLLM completed new requests (count, avg latency, tokens). Derived from vLLM's Prometheus `/metrics`; 200-entry ring.

## API endpoints

| Endpoint | Returns |
| --- | --- |
| `GET /api/status` | GPU + vLLM health + config |
| `GET /api/metrics` | parsed vLLM Prometheus + latency history |
| `GET /api/model-stats` | combined vLLM + Ollama model list |
| `GET /api/requests?limit=N` | Bull jobs, topic-classified + mismatch-flagged + per-env counts |
| `GET /api/audit?limit=N` | request-window aggregates |
| `POST /api/apply` / `POST /api/test` | apply vLLM config / test-inference |

## Operating it

It's a server-side file, so edit it on the box (or edit a local copy and `pscp` it up):

```bash
# restart after a change
ssh aisha@192.168.7.219 "sudo systemctl restart vllm-admin"
# syntax-check before restarting
ssh aisha@192.168.7.219 "/home/aisha/vllm-env/bin/python -m py_compile /home/aisha/vllm_admin.py"
# backup of the previous version:
#   /home/aisha/vllm_admin.py.bak
```

### Demo data for the Requests tab

`/home/aisha/inject_demo_jobs.py` seeds 3 illustrative `[demo]` jobs (a clean email, an `email+note` mismatch, a failed summary) so you can see the tab populated before real traffic. Remember: **use the venv python**, there's no `python` on PATH.

```bash
ssh aisha@192.168.7.219 "/home/aisha/vllm-env/bin/python /home/aisha/inject_demo_jobs.py"        # seed
ssh aisha@192.168.7.219 "/home/aisha/vllm-env/bin/python /home/aisha/inject_demo_jobs.py clear"  # remove
```

## Notes

- Real (non-demo) Requests data appears as agent tasks run through the PM2 workers — so the workers must be running the `meta`-enriched code (deploy via `sync-workers-to-ai-server.ps1`).
- The monitor reads Redis `6381` locally; it works regardless of the localhost-only binding because it runs on the same box.
