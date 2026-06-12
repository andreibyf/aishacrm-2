# Task workers & deployment

> **✅ Migrated to backend-hosted workers (2026-06-12).** Task workers now run **in each environment's always-on backend** on its own `redis-memory`, not on the box — see [failover.md](./failover.md). The box is **model-server-only**; all three HP Omen PM2 workers are **stopped** (kept for rollback). The on-box PM2 worker layer described below is **historical** — left here for context and rollback, not the current topology.

Historically (pre-2026-06-12) the AI server ran a shared PM2 worker pool + the Bull queue. The sync/deploy mechanics below still apply if you ever need to bring it back.

## The worker layer

Three PM2 processes run on the box, one per CRM environment:

| PM2 app | `APP_ENV` | Queue it processes |
| --- | --- | --- |
| `worker-dev` | `dev` | `task-execution:dev` |
| `worker-staging` | `staging` | `task-execution:staging` |
| `worker-prd` | `prd` | `task-execution:prd` |

- Defined in `ecosystem.config.cjs`; deployed copy lives at `/home/aisha/aisha-worker/`.
- Each has its own env file (`/home/aisha/aisha-worker/.env.{dev,staging,prd}`) with the matching Supabase creds + LiteLLM master key.
- They run the **standalone worker entrypoint** (`backend/workers/worker-entry.js`) — no Express; load env, start the Bull workers, drain on SIGTERM/SIGINT.

```bash
ssh aisha@192.168.7.219 "pm2 list"                 # status
ssh aisha@192.168.7.219 "pm2 logs worker-dev --lines 50"
ssh aisha@192.168.7.219 "pm2 reload ecosystem.config.cjs"   # graceful reload (drains queue first)
```

## The task queue (Bull v4)

- **Library:** `bull@4` (NOT BullMQ — the Redis key layout differs).
- **Redis:** `redis://192.168.7.219:6381` (`TASK_QUEUE_REDIS_URL`). Even **dev** points here — all environments share this one Redis, kept separate by the `:{env}` queue-name suffix.
- **Binding:** Redis 6381 is bound to **`127.0.0.1` only**. So only on-box processes (the PM2 workers, the admin monitor) can reach it. A laptop/docker worker **cannot** reach this queue, even though it has `TASK_QUEUE_REDIS_URL` set — keep that in mind when something "should" be processing but isn't.
- **Retention:** `removeOnComplete: 100`, `removeOnFail: 200` (see `backend/services/taskQueue.js`).

### Job `meta` enrichment (feeds the monitor)

On completion the worker attaches a `meta` block to the Bull job's **return value** (`{ status, result, meta }`), built in `taskWorkers.js`. It carries the request monitor's signal — requested topic, the tools that actually fired, the resulting topic, a mismatch flag, the model/tier/env, gate result, and token count. The [monitor](./monitor.md) reads this straight off the queue (no push channel). The block is always computed and never throws.

## Deploying worker code changes

Worker code is a **synced copy** of the repo's backend — it does **not** auto-update when you edit locally. After any change to `backend/workers`, `backend/lib`, `backend/services`, `shared/contracts`, or `braid-llm-kit`, deploy with:

```powershell
# from repo root, on Windows
.\scripts\sync-workers-to-ai-server.ps1
# override the IP if DHCP moved it:
.\scripts\sync-workers-to-ai-server.ps1 -IP 192.168.7.219
```

What it does: `tar` the worker subset → `scp` to the box → extract into `/home/aisha/aisha-worker` → `npm install --omit=dev` → `pm2 reload ecosystem.config.cjs`.

**Auth:** it uses an SSH **key** (`~/.ssh/hp_omen_ed25519`, BatchMode — no password). Make sure that key is present and authorized on the box.

**Excluded from the sync** (not needed by workers): `node_modules`, `.env*`, `__tests__`, `backend/migrations`, `backend/routes`, `backend/middleware`, and braid editor/docs/spec/tests.

### Verifying a deploy

```bash
ssh aisha@192.168.7.219 "grep -c monitorMeta /home/aisha/aisha-worker/backend/workers/taskWorkers.js"  # expect >0 after this change set
ssh aisha@192.168.7.219 "pm2 jlist | grep -o '\"status\":\"[a-z]*\"'"   # all 'online'
# error log mtime should be OLD relative to the box clock if the reload was clean:
ssh aisha@192.168.7.219 "date -u; stat -c '%y' /var/log/aisha/worker-dev-error-0.log"
```

> A graceful `pm2 reload` drains the queue and restarts each worker; you'll see a `SIGINT received — draining queue` line in the OUT log from the old process. That's expected, not an error.

## Gotchas

- **Localhost-bound Redis** — the #1 confusion: the docker/laptop worker can't reach `6381`. The on-box PM2 workers are the real processors.
- **`python` not on PATH** — admin/injector scripts need `/home/aisha/vllm-env/bin/python` (redis-py lives only in the venv).
- **`sync-workers-to-ai-server.ps1` escaping** — the embedded bash here-string must use backtick-`$` (`` `$ ``) for bash variables, not `\$` (PowerShell escapes with a backtick). A `\$` regression shows up as a `\/tmp/aisha-worker.tar.gz` path error.
