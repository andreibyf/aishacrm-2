# Finance Ops — Phase 3-4: Staging Worker Deployment Plan / Config

**Phase 3-4 — Controlled Staging Activation, disabled-by-default worker deployment package.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Plan and config artifact. **No deployment was performed by this task.** No Coolify app created, no Coolify mutation, no VPS shell command run, no environment variable set in staging, no migration applied, no provider write opened. This document specifies the deployment package an authorized operator uses; it does not deploy.
**Date:** 2026-05-24
**Related:**
[`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) (3-1, baseline `3c60d9ff`) ·
[`staging-migration-application-log.md`](./staging-migration-application-log.md) (3-2) ·
[`staging-rls-verification-results.md`](./staging-rls-verification-results.md) (3-3) ·
[`finance-worker-deployment-config.md`](./finance-worker-deployment-config.md) (2C-5, all-three-worker template) ·
[`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md) (2C-6) ·
[`worker-service-topology.md`](./worker-service-topology.md) (2B-13) ·
[`audit-worker-staging-plan.md`](./audit-worker-staging-plan.md) (2C-7, audit worker design — deferred from 3-4) ·
[`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) (2C-8, adapter worker design — deferred from 3-4) ·
[`../DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md) (host / placement source of truth) ·
[`deploy/coolify/finance-workers.example.yml`](../../../deploy/coolify/finance-workers.example.yml) (2C-5 all-three template) ·
[`deploy/coolify/finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml) (Phase 3-4 — NEW, projection-only staging variant)

---

## 1. Purpose and scope

This is the Phase 3-4 **deployment package and operator runbook** for placing the implemented Finance Ops worker — `finance-projection-worker` — onto staging as a Coolify worker app, **disabled by default**, ready to be enabled in Phase 3-5 for the one controlled staging tenant.

Phase 2C-5 ([`finance-worker-deployment-config.md`](./finance-worker-deployment-config.md)) produced an all-three-worker reviewed template ([`finance-workers.example.yml`](../../../deploy/coolify/finance-workers.example.yml)). That template covered the design intent for all three planned workers (projection / audit / adapter). 3-4 narrows that template to **what is actually implementable today** — just the projection worker — and produces the staging-specific compose file the deploy owner uses.

**This document and the matching YAML are doc/config only.** No Coolify app is created by this task; no Coolify webhook is registered; no VPS mutation occurs; no `ENABLE_*` flag is flipped anywhere. Creating the worker app on VPS-1 via Coolify is a separately authorized operator action covered by §6.

---

## 2. Live-deployment posture

**Default for this task: no deployment was performed.**

| What                                                                                       | Status this task                                                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Coolify worker app created on VPS-1                                                        | None.                                                                                      |
| Coolify mutation against the VPS-1 server record (`f7uzrwlbqjtx6qamppma5xsz`)              | None.                                                                                      |
| SSH session to VPS-1 (`andreibyf@147.189.173.237`)                                         | None.                                                                                      |
| Container started, image built, image pushed                                               | None.                                                                                      |
| Staging Doppler (`stg_stg`) environment variable read or written                           | None.                                                                                      |
| Staging Supabase migration applied                                                         | None.                                                                                      |
| Production environment touched in any way (Hetzner, `prd_prd` Doppler, production tenants) | None.                                                                                      |
| Provider HTTP write (QuickBooks / Xero / ERPNext)                                          | None — `FINANCE_PROVIDER_WRITES_ENABLED=false`; adapter worker not in scope of 3-4 anyway. |

A live execution requires the deploy owner's explicit authorization. When authorized, the procedures in §6 are run **in the order listed** and the outputs are captured per §11.

---

## 3. Staging placement — VPS-1 only

Per [`DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md) and [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §5.3:

| Field                          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target host                    | **VPS-1** (Zap-Hosting staging, `147.189.173.237`)                                                                                                                                                                                                                                                                                                                                                                                                  |
| SSH user                       | `andreibyf` (not `root` — per the 2026-05-14 SSH-user incident)                                                                                                                                                                                                                                                                                                                                                                                     |
| Coolify control plane          | VPS-2 (`147.189.168.164`) — mutations target VPS-2's Coolify API but deploy _to_ VPS-1                                                                                                                                                                                                                                                                                                                                                              |
| Coolify server UUID for VPS-1  | `f7uzrwlbqjtx6qamppma5xsz`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Docker network                 | `aishanet` (external; shared with `staging-backend-heavy` so the worker resolves `aishacrm-backend`, `redis-memory`, `redis-cache` by alias)                                                                                                                                                                                                                                                                                                        |
| Image pull source              | GHCR via Coolify pull from Gitea (mirror of GitHub `main`); per [`DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md) "push to `github` only"                                                                                                                                                                                                                                                                                                               |
| Production placement (Hetzner) | **Out of scope.** Phase 3 never deploys workers to Hetzner. Production worker placement is Phase 4 (separately reviewed) and uses GHCR images directly.                                                                                                                                                                                                                                                                                             |
| VPS-2 placement                | **Forbidden.** VPS-2 is the control plane (Coolify, Cal.com, Uptime Kuma, Gitea, OneDev). Decision E2 in `worker-service-topology.md` (a 2B-13 design doc) predates the VPS-1/VPS-2 lockdown in `DEPLOY_TOPOLOGY.md` and is **superseded** by it; reconciling those two design docs to the VPS-1-staging / Hetzner-production placement is outstanding (deferred — neither doc is in the Phase 3-4 baseline scope, and 3-4 operates from this doc). |

**Capacity note.** VPS-1 is capped at 5.5 cores by Zap-Hosting; the 2026-05-10 incident (double Coolify deploy on `staging-app-fast`) showed the cap matters. The projection worker is a thin host (`mem_limit: 512m`, idle CPU when polling an empty stream — which is the expected Phase 3-4 posture before 3-5 enables the controlled tenant). Adding one disabled-by-default worker is well within budget. **The deploy owner should still re-check VPS-1 utilization before activating Phase 3-5** to avoid stacking the worker activation onto an already-saturated host.

---

## 4. Workers in scope vs deferred

Per the Phase 3-4 orchestration ("provide a staging example config for `finance-projection-worker` only if that is the only implemented worker") and the actual state of `backend/workers/` and `backend/package.json`:

| Worker                      | Status in this task                                                                                                             | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finance-projection-worker` | **In scope.** Included in [`finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml). | Entry module `backend/workers/financeProjectionWorker.js` exists (Slice 1 Task 5, commit `fe745500`). npm script `worker:finance-projection` registered in `backend/package.json`. Tests pass (278/278 finance + projection + worker + route per Phase 3-1 baseline).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `finance-audit-worker`      | **Deferred — not in this YAML.**                                                                                                | No entry module exists at `backend/workers/financeAuditWorker.js`; no `worker:finance-audit` npm script; Phase 2C-7 audit worker design is contingent on an `audit_pack_requests` host (called out as a carried-forward engineering prerequisite in [`production-readiness-review.md`](./production-readiness-review.md) §"engineering prerequisites"). Audit-timeline projection upkeep is currently handled in-process by the projection worker via the `auditTimelineProjection` registered in `buildProjectionRunner` (`backend/workers/financeProjectionWorker.js:194`) with `includeInfrastructureEvents: true`. A standalone audit worker is **not implemented** and **must not be deployed yet**. Activation is gated on a separate spec + implementation pass; until then, this YAML deliberately omits the `finance-audit-worker` service to avoid implying a runtime that does not exist. |
| `finance-adapter-worker`    | **Deferred — not in this YAML.**                                                                                                | No entry module exists at `backend/workers/financeAdapterWorker.js`; no `worker:finance-adapter` npm script; sandbox/draft-only adapter behavior is gated on **Phase 3 Slice 2** (adapter implementation + ERPNext sandbox proof per [`erpnext-sandbox-proof.md`](./erpnext-sandbox-proof.md), 2C-9). The Phase 2C-8 adapter-worker sandbox plan ([`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md)) is design-only at this stage. This YAML deliberately omits the `finance-adapter-worker` service to keep the deployment package honest.                                                                                                                                                                                                                                                                                                                                       |

The 2C-5 template ([`finance-workers.example.yml`](../../../deploy/coolify/finance-workers.example.yml)) **retains** the three-worker design intent and remains the source-of-truth design template; the Phase 3-4 staging YAML is the **tighter, deployable-today subset** of it.

---

## 5. Worker behavior — what's implemented vs what the 2C-5 example claimed

Phase 3-4 reconciles two divergences between the 2C-5 design template and the actual `backend/workers/financeProjectionWorker.js`:

### 5.1 Health surface

| Field                    | 2C-5 template claim                                                        | Phase 3-4 reality (per `backend/workers/financeProjectionWorker.js`)                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP health endpoint     | `GET /health` on `FINANCE_WORKER_HEALTH_PORT` (default `9090`) per 2C-5 §6 | **Not implemented.** The worker process binds no HTTP port. Grep for `http.createServer`, `express()`, `.listen(`, `FINANCE_WORKER_HEALTH_PORT` in `backend/workers/financeProjectionWorker.js` returns zero matches.                                                                                                                                                                                                                                                            |
| HTTP readiness endpoint  | `GET /ready` per 2C-5 §6, `worker-service-topology.md` §8.2                | **Not implemented.** Same reason.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Heartbeat                | Mentioned in 2C-5 §6 / topology §8 but not specified concretely            | **Implemented as a file heartbeat.** The worker writes JSON to a path controlled by `FINANCE_PROJECTION_WORKER_HEARTBEAT_PATH` (default `/tmp/finance-projection-worker-heartbeat.json`) on every poll-cycle completion. Schema: `{ status, updated_at, pid, poll_interval_ms, tenant_count, success_count, failure_count, event_count }`. Written by `writeWorkerHeartbeat(...)` in the worker; the recent-mtime + valid-JSON check below is the operator-side liveness signal. |
| Docker healthcheck shape | `wget -qO- http://127.0.0.1:9090/health` per 2C-5 §6                       | **Replaced** in the Phase 3-4 YAML with a heartbeat-file check: `test -f $HEARTBEAT_PATH` plus an `mtime` recency assertion (≤ `3 × FINANCE_WORKER_HEARTBEAT_MS` since last write). See [`finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml) and §7 below.                                                                                                                                                                       |

**Operator implication.** Coolify and Uptime Kuma cannot poll an HTTP endpoint from this worker. They can monitor:

1. Container liveness (Coolify built-in: container running ≠ exited).
2. The heartbeat-file healthcheck defined in the YAML (Docker reports unhealthy if the file goes stale).
3. Pino-structured log lines emitted on every poll cycle (`[finance-projection-worker] poll cycle complete` carrying `tenant_count`, `success_count`, `failure_count`, `event_count`), captured by the standard `json-file` driver per [`observability-alerting.md`](./observability-alerting.md) (2C-11).

**Implementing a proper HTTP `/health` and `/ready` surface remains a follow-up** — useful for future external monitor scraping and for the multi-worker future where audit and adapter workers join. **Deferred to a separate pass.** Phase 3-4 does not block on it because the heartbeat-file + log signals are sufficient for one disabled-by-default worker on one controlled tenant.

### 5.2 ENABLE_FINANCE_PERSISTENT_EVENTS flag

The Phase 3-1 P2 review correction ([`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §7) already established this, restated here for completeness: **the worker does NOT read `ENABLE_FINANCE_PERSISTENT_EVENTS`.** `buildProjectionRunner()` at `backend/workers/financeProjectionWorker.js:185` unconditionally constructs the runner with `createFinancePgEventStore({ pool })`. The flag is a **backend-route constraint only** (boot-time refuse-to-mount guard in `backend/routes/finance.v2.js:48`).

Practical Phase 3-4 consequence: with the backend's `ENABLE_FINANCE_PERSISTENT_EVENTS=false` (the Slice 1 invariant), the backend route does not write to `finance.audit_events`. The worker still polls `finance.audit_events`; it finds the controlled tenant's stream empty (or contains only pre-existing dev/seed data), and its poll cycles are no-ops. **That is the expected idle Phase 3-4 worker behavior.** The YAML still sets `ENABLE_FINANCE_PERSISTENT_EVENTS=false` on the worker app for environment-parity clarity, even though the worker doesn't read it — anything else would be confusing for operators reading the deployment.

---

## 6. Coolify deployment procedure (planned — NOT executed by this task)

The deploy owner runs these steps when authorized. **None of them ran by this Phase 3-4 task.** Each step lists prerequisites, expected outcome, and rollback.

### 6.1 Preflight (no Coolify mutation)

- [ ] `git status` on `feat/finance-ops-runtime` is clean at a descendant of the Phase 3 baseline `3c60d9ff` per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §2.1.
- [ ] Phase 3-3 verification execution per [`staging-rls-verification-results.md`](./staging-rls-verification-results.md) §4 has been completed in staging, with §4.1 (PostgREST exclusion), §4.2 (`auth.role()`), and §4.3.a (scratch-table rehearsal) all PASS. `§4.5` may be deferred if migrations 168/171 have not yet been applied, but the worker app SHOULD NOT be created if any §4 check has FAILED.
- [ ] Phase 3-2 staging migrations applied per [`staging-migration-application-log.md`](./staging-migration-application-log.md) §3 — at minimum 168 + 169 (`finance.audit_events` exists, append-only triggers installed); 170 (`finance.projection_state`) is required for projection-state durability across worker restarts but the worker can run against an empty table.
- [ ] VPS-1 utilization checked via `ssh andreibyf@147.189.173.237 'top -bn1 | head -5'` — adding one disabled-by-default worker container should consume effectively no CPU at idle, but confirm no other Coolify deploy is in flight (the 2026-05-10 incident).
- [ ] Doppler `stg_stg` config carries the secrets the worker needs _when later enabled_: `FINANCE_DB_URL` (or fallback `DATABASE_URL`) pointing at the staging Supabase project, `DOPPLER_TOKEN` for the worker app's service account.
- [ ] **No production action** — `prd_prd` Doppler config is not opened, Hetzner is not touched.

### 6.2 Create the Coolify worker app on VPS-1 (operator action)

Following the same pattern as the existing `aisha-comms` worker (`prod/04-app-fast/docker-compose.yml`), but on the **staging** server (VPS-1, Coolify server UUID `f7uzrwlbqjtx6qamppma5xsz`):

| Field                        | Value                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coolify app type             | "Docker Compose" (single-service, the same shape `aisha-comms` uses)                                                                                                      |
| Compose file source          | [`deploy/coolify/finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml) — copy verbatim into the Coolify app's compose editor |
| Coolify server               | Staging (`f7uzrwlbqjtx6qamppma5xsz`, VPS-1)                                                                                                                               |
| Coolify app name (suggested) | `staging-finance-projection-worker`                                                                                                                                       |
| Git source                   | Gitea (`gitea.aishacrm.com/aishacrm/aishacrm-2`), branch `feat/finance-ops-runtime` initially; switch to `main` once Slice 1 merges                                       |
| Build context                | Repo root (Dockerfile path: `backend/Dockerfile`)                                                                                                                         |
| Public FQDN                  | **None.** Workers have no public exposure; no Cloudflare DNS, no Traefik route, no `ports:` mapping.                                                                      |
| Network                      | External `aishanet` (same network as `staging-backend-heavy`)                                                                                                             |
| Doppler integration          | `DOPPLER_TOKEN` injected at app level; `DOPPLER_PROJECT=aishacrm`, `DOPPLER_CONFIG=stg_stg` set in the compose env block                                                  |

Outcome: the Coolify app exists and is in "running, healthy, idle" state. The container starts, the worker module loads, `isFinanceProjectionWorkerEnabled()` returns `false` (because `ENABLE_FINANCE_OPS` is unset), the worker logs `[finance-projection-worker] disabled — idling` and never opens a DB connection. The container is healthy because the heartbeat file is written on startup (`writeWorkerHeartbeat({ status: 'starting' })` — but note: per §5.1, on the disabled-and-idling path the current code does **not** write a heartbeat at all, only logs and returns an idle stub. **This means the heartbeat-file healthcheck will fail for a disabled-and-idling worker.** The operator action: in the Coolify app, set `restart: unless-stopped` and rely on container-liveness alone for the disabled state — Docker healthcheck unhealthy is acceptable for a disabled worker because the worker is intentionally not processing anything. When 3-5 flips the enable flags, the heartbeat file starts being written and the healthcheck transitions to healthy. Alternatively: write a one-time startup heartbeat for the disabled path — that's a follow-up code change, not a 3-4 blocker.)

**Rollback for 6.2:** Delete the Coolify app. No DB state was changed; no data exists to lose.

### 6.3 Confirm disabled-and-idling

After the Coolify app is created and the first deploy completes:

- [ ] `docker ps` (via Coolify or SSH) shows the container running.
- [ ] Container logs (Coolify UI or `docker logs`) show the single-line entry `[finance-projection-worker] disabled — idling`.
- [ ] No subsequent log lines about poll cycles, DB connections, or event dispatch.
- [ ] No DB connection to staging Supabase from the worker container (validated by absent log lines and by Supabase project's connection pool metrics, if accessible).
- [ ] `ENABLE_FINANCE_OPS` in the worker app's Coolify env is **unset** (or any value other than the literal string `'true'`). Same for `ENABLE_FINANCE_WORKERS` and `ENABLE_FINANCE_PROJECTION_WORKER`.
- [ ] `FINANCE_CONTROLLED_TENANT_IDS` is `""` (empty) or unset.
- [ ] Production (`prd_prd` Doppler config, Hetzner) unchanged.

**Rollback for 6.3:** if any check fails, stop the worker app in Coolify and investigate. Worker stop is a single click; no DB state to undo.

### 6.4 Do NOT enable in 3-4

Phase 3-4 ends here — at "deployed disabled". **Enabling the worker is Phase 3-5** ([`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3-5: "Enable projection/audit workers for one controlled staging tenant"). 3-5 is a separate orchestration with its own approval. Do not pre-emptively set `ENABLE_FINANCE_OPS=true` in the worker app during 3-4.

---

## 7. Environment variables — staging worker app

The full env block lives in [`finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml). This table is the reference summary.

| Variable                                   | Phase 3-4 default                                                | When changed                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOPPLER_TOKEN`                            | (injected by Coolify per app)                                    | Never in this YAML — pulled from secret manager.                                                                                                      |
| `DOPPLER_PROJECT`                          | `aishacrm`                                                       | Phase 4 (Hetzner) only.                                                                                                                               |
| `DOPPLER_CONFIG`                           | `stg_stg`                                                        | Phase 4 (`prd_prd`) only.                                                                                                                             |
| `NODE_ENV`                                 | `production`                                                     | Never — staging runs the same image with prod-mode Node behavior.                                                                                     |
| `ENABLE_FINANCE_OPS`                       | `false`                                                          | **Phase 3-7** flips this to `true` on the **backend** (`staging-backend-heavy`); Phase 3-5 flips it on the **worker** app for tenant processing.      |
| `ENABLE_FINANCE_WORKERS`                   | `false`                                                          | Phase 3-5 (worker tier on).                                                                                                                           |
| `ENABLE_FINANCE_PROJECTION_WORKER`         | `false`                                                          | Phase 3-5 (this specific worker on).                                                                                                                  |
| `ENABLE_FINANCE_PERSISTENT_EVENTS`         | `false`                                                          | **Worker doesn't read this** (§5.2); shown for env-parity with the backend, which structurally refuses to mount the route when true until Slice 2.    |
| `FINANCE_CONTROLLED_TENANT_IDS`            | `""` (empty — no tenants, no-op cycles)                          | Phase 3-5 sets this to the controlled tenant UUID `a11dfb63-4b18-4eb8-872e-747af2e37c46`. **No implicit "all tenants" fall-through** — empty = no-op. |
| `FINANCE_DB_URL`                           | (injected by Doppler; required when enabled)                     | Never — Doppler-injected.                                                                                                                             |
| `FINANCE_DB_POOL_MAX`                      | `5`                                                              | Tuned only if Supabase connection pressure observed.                                                                                                  |
| `FINANCE_DB_STATEMENT_TIMEOUT_MS`          | `30000`                                                          | Tuned only if long-running queries observed.                                                                                                          |
| `FINANCE_WORKER_POLL_INTERVAL_MS`          | `5000`                                                           | Optionally raised to reduce idle polling load; lowered only with care.                                                                                |
| `FINANCE_WORKER_HEARTBEAT_MS`              | `15000`                                                          | Reference value the healthcheck staleness threshold uses (3× = 45 s window).                                                                          |
| `FINANCE_PROJECTION_WORKER_HEARTBEAT_PATH` | `/tmp/finance-projection-worker-heartbeat.json` (worker default) | Only if container filesystem layout requires a different location.                                                                                    |
| `FINANCE_WORKER_LOG_LEVEL`                 | `info`                                                           | `debug` during incident triage only.                                                                                                                  |

**`FINANCE_CONTROLLED_TENANT_IDS` semantics — explicit restatement (matches the `parseControlledTenantIds()` contract in `backend/workers/financeProjectionWorker.js:89-96`):**

- Empty or unset ⇒ `[]` ⇒ poll cycle iterates zero tenants ⇒ no-op. **No implicit "all tenants" fall-through.**
- Tenants are added explicitly as a comma-separated UUID list (whitespace tolerated, trailing commas tolerated).
- The standalone entry block at `backend/workers/financeProjectionWorker.js:396` logs a `warn` when the worker is enabled but the tenant list is empty: `"[finance-projection-worker] enabled but no FINANCE_CONTROLLED_TENANT_IDS configured — poll cycles will be no-ops"` — that warning is the operator signal that 3-5 setup is incomplete.

---

## 8. Health, log, and heartbeat expectations

Per §5.1 (reality), Phase 3-4 establishes three observability surfaces for the projection worker. None requires an HTTP endpoint.

### 8.1 Container liveness (Coolify built-in)

- **Signal:** Coolify reports the container as `running` if Docker reports the container alive.
- **Pass:** container is `running`.
- **Fail:** container `exited` or `restarting` repeatedly. Investigate via `docker logs` — likely a hard module-load failure or DB connection refusal.

### 8.2 Heartbeat-file healthcheck (Docker `HEALTHCHECK`)

- **Signal:** Docker `HEALTHCHECK` checks the heartbeat file's existence and `mtime`. Defined in [`finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml).
- **Pass:** file exists at `FINANCE_PROJECTION_WORKER_HEARTBEAT_PATH` AND its `mtime` is newer than `3 × FINANCE_WORKER_HEARTBEAT_MS` seconds ago (default: 45 s).
- **Fail when worker is disabled:** the disabled-and-idling path in `startFinanceProjectionWorker()` does not currently write a heartbeat (see §6.2 note). For a disabled worker this healthcheck reports `unhealthy`. That is **acceptable** in Phase 3-4 — a disabled worker is not processing anything and "unhealthy" correctly reflects "not actively working." Coolify and operator dashboards can filter the disabled state by the `ENABLE_FINANCE_PROJECTION_WORKER` env-var value or by inspecting logs.
- **Fail when worker is enabled but stuck:** healthcheck reports `unhealthy` after 45 s of no heartbeat write. This means the poll cycle has stopped completing. Investigate.

**Follow-up — write a startup heartbeat on the disabled path.** A small code change to `startFinanceProjectionWorker()` would emit `writeWorkerHeartbeat({ status: 'disabled' })` on the idle return path so the healthcheck reports healthy in the disabled state too. **Not blocking on 3-4**; tracked as a follow-up.

### 8.3 Pino log lines (the operational signal)

- **Source:** structured Pino logs from `backend/lib/logger.js` → stdout → Docker `json-file` driver → Coolify log UI.
- **Per-cycle line:** `[finance-projection-worker] poll cycle complete` with structured fields `tenant_count`, `success_count`, `failure_count`, `event_count` (`backend/workers/financeProjectionWorker.js:310`).
- **Disabled-state line (once at startup):** `[finance-projection-worker] disabled — idling`.
- **Starting line:** `[finance-projection-worker] starting finance projection worker` with `poll_interval_ms`, `tenant_count`.
- **Per-tenant error line:** `[finance-projection-worker] eventStore.replay failed for tenant` or `[finance-projection-worker] runner.dispatch failed for event` with structured `tenant_id`, `event_id`, `event_type`, `error`.
- **Cycle crash (defense-in-depth):** `[finance-projection-worker] poll cycle crashed` with `error`, `code`.
- **No secrets logged.** No JWT contents, no Doppler tokens, no `tenant_integrations.api_credentials`, no DB connection string. The Pino logger's redaction layer is applied at the backend lib level and inherited by the worker.

### 8.4 Alerting (Uptime Kuma on VPS-2 — separate setup)

- Uptime Kuma cannot ping a non-existent HTTP endpoint. For Phase 3-4 the operator-visible signal is Coolify container status + the heartbeat file healthcheck. [`observability-alerting.md`](./observability-alerting.md) (2C-11) enumerates the nine required observability signals and how they map to existing infra; adding finance-worker-specific Uptime Kuma checks is part of 3-11 ("Verify observability, alerts, degraded-state visibility, and rollback controls"), not 3-4.

---

## 9. Rollback / disable procedure

Per [`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md) §11, disabling is config-only. **No code rollback, no schema rollback, no Git revert, no data loss.**

### 9.1 Disable the worker (Phase 3-5 → Phase 3-4 state)

- **Cleanest:** in the Coolify app env for `staging-finance-projection-worker`, set `ENABLE_FINANCE_PROJECTION_WORKER=false` (or unset). Redeploy the worker app from Coolify.
- **Coarser (kills all finance workers if more exist later):** set `ENABLE_FINANCE_WORKERS=false`.
- **Coarsest (kills all of Finance Ops including the backend route):** unset `ENABLE_FINANCE_OPS` in **both** the worker app and `staging-backend-heavy`.
- **Tenant-only disable:** clear `FINANCE_CONTROLLED_TENANT_IDS` to `""`. The worker idles cycles to no-ops while staying healthy and enabled — useful for keeping the worker process available while temporarily stopping tenant processing without a config-flag reshuffle.

### 9.2 Remove the worker entirely (Phase 3-4 → pre-3-4 state)

- Delete the Coolify app `staging-finance-projection-worker`. No DB state to undo.
- `finance.audit_events` is untouched (the worker is a pure reader).
- `finance.projection_state` rows for the controlled tenant (if any were written) remain as a valid snapshot at the last applied cursor; they can be truncated or left in place.

### 9.3 Rollback is config-only

- **No code revert required.** All Phase 3 activation is environment-variable driven on top of code that is already merged and verified at baseline `3c60d9ff`. A Phase 3-4 rollback does not require reverting any commit.
- **No schema rollback required** unless a migration application defect was the root cause (in which case Phase 3-2 rollback applies — see [`staging-migration-application-log.md`](./staging-migration-application-log.md) §6).
- **No customer impact.** Production is untouched (§3); rollback affects only the staging worker app.

---

## 10. Hard constraints (explicit restatement)

These constraints are non-negotiable for Phase 3-4 and the rest of the Phase 3 arc. Each maps to a hard rule in [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md):

| Constraint                                                                                                                                                                                                                                                                                                                                                  | Source         | Status this task             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------- |
| **No deployment performed by this task.** No Coolify app created, no Coolify mutation, no VPS shell command run. This document is the plan and the YAML; execution is a separately authorized operator action.                                                                                                                                              | 3-4 scope      | Confirmed — doc/config only. |
| **No Coolify/VPS mutation by this task.**                                                                                                                                                                                                                                                                                                                   | 3-4 acceptance | Confirmed.                   |
| **No env var changed on staging by this task.**                                                                                                                                                                                                                                                                                                             | 3-4 acceptance | Confirmed.                   |
| **No migration application by this task.**                                                                                                                                                                                                                                                                                                                  | 3-2 scope      | Confirmed.                   |
| **No provider writes.** Adapter worker is deferred from 3-4 anyway; `FINANCE_PROVIDER_WRITES_ENABLED` does not appear in this YAML because no adapter worker is in scope.                                                                                                                                                                                   | Phase 3-1 §9   | Confirmed.                   |
| **No production action.** Hetzner is not touched; `prd_prd` Doppler config is not opened.                                                                                                                                                                                                                                                                   | Phase 3-1 §8   | Confirmed.                   |
| **VPS-1 placement only; never VPS-2.** Per [`DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md), app services (including background workers) go to VPS-1 (staging) or Hetzner (production). VPS-2 is control plane only. (Resolves the residual `worker-service-topology.md` decision E2 / `finance-worker-deployment-config.md` §8 tension.)                      | 3-1 §5.3       | Confirmed.                   |
| **Do not imply standalone audit or adapter workers exist if they are deferred.** §4 explicitly marks both deferred with the reason; the YAML omits both services.                                                                                                                                                                                           | 3-4 scope      | Confirmed.                   |
| **All worker flags disabled by default.** Every enable flag in [`finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml) is hard-set to `false`.                                                                                                                                                                 | 3-4 scope      | Confirmed.                   |
| **`FINANCE_CONTROLLED_TENANT_IDS` is required, empty = no-op.** §7 explicitly states this; matches the `parseControlledTenantIds()` contract in code.                                                                                                                                                                                                       | 3-4 scope      | Confirmed.                   |
| **`ENABLE_FINANCE_PERSISTENT_EVENTS` remains `false`** (unset). The `createFinanceV2Routes` boot-time guard at `backend/routes/finance.v2.js:48` enforces this structurally on the backend. The worker doesn't read it (§5.2) but the YAML still sets it `false` for env-parity. Lifting this guard is gated on projection-backed reads landing in Slice 2. | Phase 3-1 §7   | Confirmed.                   |
| **`ENABLE_FINANCE_OPS` remains unchanged** unless operator activation is separately authorized in Phase 3-7 (backend) or Phase 3-5 (worker).                                                                                                                                                                                                                | Phase 3-1 §7   | Confirmed.                   |

---

## 11. Acceptance for Phase 3-4 (this task)

This document is the Phase 3-4 deliverable when paired with the matching `deploy/coolify/finance-workers.staging.example.yml` file, the CHANGELOG entry, and the scaffold update. Acceptance for the **plan and YAML** (this task):

- [x] Intended staging placement per [`DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md) documented (§3) — VPS-1 for staging app/background workers, not VPS-2
- [x] This task does not deploy anything unless explicitly operator-authorized (§2, §6)
- [x] Staging example config for `finance-projection-worker` provided ([`finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml)) — only the implemented worker
- [x] `finance-audit-worker` deferred until audit_pack_requests / evidence-pack host exists (§4)
- [x] `finance-adapter-worker` deferred until adapter Slice 2 (§4)
- [x] All worker flags disabled by default (§7 — `ENABLE_FINANCE_OPS=false`, `ENABLE_FINANCE_WORKERS=false`, `ENABLE_FINANCE_PROJECTION_WORKER=false`)
- [x] `FINANCE_CONTROLLED_TENANT_IDS` required to be explicitly set; empty = no-op (§7, with code contract reference)
- [x] `ENABLE_FINANCE_PERSISTENT_EVENTS` kept `false`/unset; backend route refuse-to-mount guard preserved until Slice 2 (§5.2, §10)
- [x] `ENABLE_FINANCE_OPS` unchanged unless operator activation separately authorized (§10)
- [x] Health/log/heartbeat expectations documented for the projection worker (§8), with honest reconciliation of the 2C-5 template's HTTP claim vs the actual heartbeat-file implementation (§5.1)
- [x] Rollback/disable procedure documented as config-only toggles (§9)
- [x] CHANGELOG entry recording Phase 3-4 (separate change)
- [x] Scaffold updated with commit hash, next active item (Phase 3-5)

Acceptance for the **execution** (a future, separately-authorized action by the deploy owner): every step in §6.1, §6.2, §6.3 PASS. Coolify app `staging-finance-projection-worker` exists on VPS-1, container is `running`, healthcheck status acceptable for the disabled state (per §6.2 note and §8.2), no DB connection opened, no events processed, no production touched.

---

## 12. Evidence pack (populated on execution)

When the deployment is executed, capture verbatim outputs here (or in a linked evidence record under `docs/architecture/finance/phase-3-evidence/`). Until execution, the table below is empty.

| Step | Run at (UTC) | Operator | Result (PASS / FAIL / DEFERRED)                        | Output / evidence link | Notes |
| ---- | ------------ | -------- | ------------------------------------------------------ | ---------------------- | ----- |
| §6.1 |              |          |                                                        |                        |       |
| §6.2 |              |          |                                                        |                        |       |
| §6.3 |              |          |                                                        |                        |       |
| §6.4 |              |          | N/A (3-4 ends at "deployed disabled"; enabling is 3-5) | —                      |       |

Next packet (once §6.1–§6.3 PASS): **Phase 3-5 — Enable projection/audit workers for one controlled staging tenant.**
