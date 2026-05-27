# Finance Ops — Phase 3-11: Observability / Alerts / Degraded-State / Rollback Verification Plan

**Phase 3-11 — Controlled Staging Activation, observability and rollback verification.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Verification plan. **No live staging observability checks were executed by this task.** No alert configuration changes, no dashboard changes, no env var changes, no deployment changes, no provider HTTP write, production untouched. This document is the verification plan an authorized operator runs against staging; it does not run any checks.
**Date:** 2026-05-24
**Related:**
[`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) (3-1, baseline `3c60d9ff`) ·
[`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) (3-4) ·
[`staging-worker-activation-log.md`](./staging-worker-activation-log.md) (3-5) ·
[`staging-replay-drill-results.md`](./staging-replay-drill-results.md) (3-6) ·
[`staging-route-activation-log.md`](./staging-route-activation-log.md) (3-7) ·
[`observability-alerting.md`](./observability-alerting.md) (2C-11, upstream signal design) ·
[`dead-letter-retry-verification.md`](./dead-letter-retry-verification.md) (2C-10) ·
[`../DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md)

---

## 1. Purpose and scope

Phase 3-11 verifies that the **operational signals** defined in 2C-11 ([`observability-alerting.md`](./observability-alerting.md)) are actually observable in staging — and where the implemented runtime can't supply a signal yet, that the gap is honestly documented as deferred rather than papered over.

3-11 is **not** an alerting configuration task — it does not create Uptime Kuma monitors, modify Coolify dashboards, or wire log-based alert rules. Those are downstream deployment work. 3-11 is the **pre-alert verification**: confirms that the data and surfaces each signal needs are actually present, and that an operator can read them today.

**This document and the verification procedure are plan only.** No staging observability surface was inspected by this task; no SSH session was opened; no Pino log was read. Executing the verification is a separately authorized operator action covered by §8.

---

## 2. Live-verification posture

**Default for this task: no staging observability check was executed.**

| What                                                                                          | Status this task                 |
| --------------------------------------------------------------------------------------------- | -------------------------------- |
| Coolify log view inspected for `staging-backend-heavy` or `staging-finance-projection-worker` | None.                            |
| `docker logs` against any staging container                                                   | None.                            |
| SSH session to VPS-1 (`andreibyf@147.189.173.237`) or VPS-2 (`147.189.168.164`)               | None.                            |
| Uptime Kuma monitor created / modified                                                        | None.                            |
| Staging Doppler (`stg_stg`) env var changed                                                   | None.                            |
| Staging Supabase queried for `finance.projection_state` / `modulesettings` rows               | None.                            |
| Backend `/api/system/health` or finance route polled                                          | None.                            |
| Coolify deploy webhook triggered                                                              | None.                            |
| Provider HTTP write (QuickBooks / Xero / ERPNext)                                             | None — no adapter worker exists. |
| Production environment touched in any way                                                     | None.                            |

A live execution requires the deploy owner's explicit authorization. When authorized, the verification commands in §8 are run and outputs are captured per §13.

---

## 3. Prerequisites

- [ ] **Phase 3-1 baseline.** Branch `feat/finance-ops-runtime` at a descendant of `3c60d9ff`.
- [ ] **Phase 3-2 migrations applied.** At minimum 172 + 173 + 174 + 175 (signal 4 reads `finance.projection_state` which 174 creates; signal 8 / 9 depend on the route surface that 3-7 mounts).
- [ ] **Phase 3-4 worker app exists on VPS-1.** Whether enabled or disabled, the heartbeat-file healthcheck behavior described in §6 is reachable.
- [ ] **Doppler `stg_stg` secrets** available for any DB-side checks.
- [ ] **Optional but useful for full verification: Phase 3-5 worker activated + Phase 3-7 route mounted.** Some signals (signal 1 healthy state, signal 9 route auth/module spikes) only meaningfully fire when those activations have occurred. The 3-11 plan documents how to verify each signal _whether or not_ those activations are live.
- [ ] **`ENABLE_FINANCE_PERSISTENT_EVENTS` unset.** The Slice 1 fail-closed guard at `backend/routes/finance.v2.js:48` remains structurally enforced — backend startup throws if it's true.
- [ ] **No production action.** `prd_prd` Doppler config is not opened; Hetzner is not touched.

---

## 4. Signal catalog — implemented vs deferred

Per 2C-11 §3, nine signals are required for staging-readiness. Each row below states the signal, the data source available today, the operator surface where it's read, and the **implementation status**. Honest reconciliation of the 2C-11 design against the actual deployed runtime, mirroring the 3-4 / 3-5 / 3-6 honesty pattern.

| #   | Signal                           | Status                 | Source available today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Operator surface today                                                                                                                        | Gap vs 2C-11 design                                                                                                                                                                                                                                                      |
| --- | -------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Worker up/down**               | IMPLEMENTED            | Heartbeat-file healthcheck (`FINANCE_PROJECTION_WORKER_HEARTBEAT_PATH`, default `/tmp/finance-projection-worker-heartbeat.json`) + Docker container state                                                                                                                                                                                                                                                                                                                                                                                                                                           | Coolify app status for `staging-finance-projection-worker` + Docker `HEALTHCHECK` reported state (`healthy` / `unhealthy`)                    | 2C-11 §2 assumed `GET /health` HTTP endpoint on `FINANCE_WORKER_HEALTH_PORT`. **That endpoint does not exist** in the deployed worker (per Phase 3-4 §5.1). Replaced by the heartbeat-file healthcheck (Phase 3-4 §8.2). HTTP `/health` is a tracked follow-up.          |
| 2   | **Worker lag**                   | DEFERRED               | The worker writes `event_count` per poll cycle to the heartbeat file and to Pino. Max cursor age across `(projection, tenant)` would need direct DB queries against `finance.projection_state.cursor_event_id` joined to `finance.audit_events.created_at` for newest.                                                                                                                                                                                                                                                                                                                              | None packaged. Operator can compose ad-hoc SQL (see §8) but no JSON `/ready` endpoint exists for an Uptime Kuma keyword check.                | 2C-11 §3 assumed `/ready` returns lag JSON. **`/ready` does not exist.** Implementing it is a tracked follow-up; for Phase 3-5/3-7 steady state (event_count = 0 — no events flow until Slice 2) lag is trivially zero, so this signal isn't operationally pressing yet. |
| 3   | **Replay failure**               | IMPLEMENTED            | Pino `error` log lines: `[finance-projection-worker] eventStore.replay failed for tenant` and `[finance-projection-worker] runner.dispatch failed for event` (`backend/workers/financeProjectionWorker.js:120,142`) + `finance.projection_state.status = 'degraded'` row                                                                                                                                                                                                                                                                                                                            | Coolify log view; Docker `docker logs` on the worker container; direct SQL against `finance.projection_state`                                 | None.                                                                                                                                                                                                                                                                    |
| 4   | **Degraded projection**          | PARTIAL                | `finance.projection_state.status = 'degraded'` rows; the runner writes this status via `storeProvider.setState(...)` on handler failure (`projectionRunner.js:262-267`) or replay failure (`:346-351`). Valid runtime statuses: `idle \| replaying \| degraded` per `projection-runtime.md` §3.                                                                                                                                                                                                                                                                                                     | Direct SQL against `finance.projection_state` (per Phase 3-5 §8.5 verification command)                                                       | 2C-11 §3 assumed `/ready` returns degraded count. **No `/ready` endpoint exists.** Count must be computed via SQL. Operationally fine for the controlled-tenant scope; alerting layer can poll the SQL or be replaced by `/ready` when implemented.                      |
| 5   | **Adapter sync failure**         | DEFERRED               | No source. `finance.adapter.sync_failed` events would be produced by `finance-adapter-worker`, which doesn't exist (per Phase 3-4 §4 — adapter worker deferred until adapter Slice 2). `finance.adapter_jobs` table exists but no worker writes `status = 'failed'`.                                                                                                                                                                                                                                                                                                                                | None.                                                                                                                                         | Cannot be implemented until the adapter worker module exists. Gated on adapter Slice 2 + ERPNext sandbox proof (2C-9).                                                                                                                                                   |
| 6   | **Dead-letter count**            | DEFERRED               | No source. Dead-letter records (terminal `failed` adapter jobs + `pending` `adapter_job` approvals per 2C-10 §5) are produced by the adapter worker, which doesn't exist.                                                                                                                                                                                                                                                                                                                                                                                                                           | None.                                                                                                                                         | Same blocker as signal 5 — gated on adapter Slice 2. Until then, the dead-letter count is trivially zero.                                                                                                                                                                |
| 7   | **Audit evidence build failure** | PARTIAL                | The `audit_timeline` projection runs **inside** `finance-projection-worker` via `auditTimelineProjection` registered in `buildProjectionRunner({ includeInfrastructureEvents: true })` (`backend/workers/financeProjectionWorker.js:194`). A handler failure surfaces as `status = 'degraded'` on the `audit_timeline` projection row — covered by signal 4. **Standalone evidence-pack generation has no host** — no `finance-audit-worker` module exists; the `buildEvidencePack` function in `backend/lib/finance/auditEvidenceBuilder.js` is callable but has no operator surface to invoke it. | Same surface as signal 4 (SQL row inspection) for the in-process audit_timeline projection. **None** for standalone evidence-pack generation. | 2C-11 §3 assumed an audit worker `/ready` endpoint and a separate `buildEvidencePack` invocation log. The audit_timeline portion is covered transitively via signal 4; the evidence-pack portion is deferred with the standalone audit worker.                           |
| 8   | **RLS / tenant mismatch error**  | IMPLEMENTED            | Pino `error` / `warn` logs from `validateTenantAccess` middleware (`backend/middleware/validateTenant.js`) and any direct SQL that returns wrong/zero tenant rows; the backend's standard logger pattern with `tenant_id` field.                                                                                                                                                                                                                                                                                                                                                                    | Coolify log view for `staging-backend-heavy`; `docker logs` on the backend container                                                          | None for the IMPLEMENTED part. Note: when 3-7 has NOT mounted the route, there are no `finance.*` route-level tenant rejections to observe — signal applies only post-3-7.                                                                                               |
| 9   | **Finance route 401/403 spikes** | IMPLEMENTED (post-3-7) | Backend access logs + Pino route logs with status code. `401` from `authenticateRequest` middleware (server.js); `403` with `{ status: 'error', message: 'Finance Ops is not enabled for this tenant' }` from the module gate at `backend/routes/finance.v2.js:78-82` for tenants without the `financeOps` flag; `403`/`400` from `validateTenantAccess` for tenant mismatch.                                                                                                                                                                                                                       | Coolify log view; `docker logs` on the backend container                                                                                      | None for the data layer. Rate-alerting on a window would require a log-aggregation layer (loki, datadog, etc.) that doesn't exist. For Phase 3-11 the operator inspects log volume manually; rate-alert wiring is a tracked follow-up.                                   |

**Summary:** 4 signals are IMPLEMENTED today (1, 3, 8, 9). 2 signals are PARTIAL (signal 4 — degraded projection, via SQL row inspection only because no `/ready` count endpoint exists; signal 7 — audit evidence build failure, in-process `audit_timeline` covered transitively via signal 4 but the standalone evidence-pack generation is DEFERRED with the audit worker). 3 signals are explicitly DEFERRED at the catalog level (signal 2 worker lag needs `/ready`; signals 5 + 6 need the adapter worker, which doesn't exist). No signal is silently absent — every gap is named here.

---

## 5. Heartbeat behavior — carrying over Phase 3-4 and 3-5

Per [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) §5.1 + §8.2 and [`staging-worker-activation-log.md`](./staging-worker-activation-log.md) §7.2:

| Worker state                                                                      | Heartbeat file (`/tmp/finance-projection-worker-heartbeat.json`)                                                                                                                                                  | Docker `HEALTHCHECK`                                                          | Container state in Coolify | Notes                                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disabled (any of the three-tier gate flags unset)                                 | **Not written.** The disabled return path at `startFinanceProjectionWorker()` returns an idle stub without calling `writeWorkerHeartbeat()` — Phase 3-4 §5.1 limitation.                                          | `unhealthy` after ≤ 45 s (3 × default `FINANCE_WORKER_HEARTBEAT_MS=15000`)    | `running`                  | **Unhealthy is intentional and acceptable in the disabled state** (Phase 3-4 §8.2). Operator differentiates "disabled correctly" from "enabled and stuck" via the `disabled — idling` log line. |
| Enabled, first poll cycle runs                                                    | Initial `writeWorkerHeartbeat({ status: 'starting', poll_interval_ms, tenant_count })` at start, then refreshed on every poll-cycle completion with `{ tenant_count, success_count, failure_count, event_count }` | Transitions to `healthy` within one poll cycle (≤ 5 s + healthcheck interval) | `running`                  | The `unhealthy → healthy` transition is the primary "the worker enabled successfully" signal (Phase 3-5 §7.2).                                                                                  |
| Enabled, steady state, empty `finance.audit_events`                               | Refreshed every poll cycle with `event_count: 0`. Per Phase 3-5 §6.2 / 3-6 §5.4: empty stream + worker poll loop = no events dispatched, no `finance.projection_state` rows written.                              | `healthy`                                                                     | `running`                  | Expected Phase 3-5 + pre-Slice-2 steady state.                                                                                                                                                  |
| Enabled, stuck (handler hang, DB connection death, etc.)                          | Stops being refreshed; file `mtime` ages out.                                                                                                                                                                     | Flips to `unhealthy` after 45 s of no heartbeat write                         | `running`                  | This is the operator alert path for signal 1 "worker stuck" — distinguish from disabled state via the absence of a fresh `disabled — idling` log line.                                          |
| Rolled back to disabled (Phase 3-5 §9 — unset `ENABLE_FINANCE_PROJECTION_WORKER`) | Stops being refreshed (same as disabled-from-boot); file `mtime` ages out.                                                                                                                                        | Returns to `unhealthy`                                                        | `running`                  | Same as "disabled" row — `unhealthy` is the expected rollback state.                                                                                                                            |

**Follow-up tracked from Phase 3-4 / 3-5**: emit a one-time `writeWorkerHeartbeat({ status: 'disabled' })` on the idle return path. That would let the disabled state report `healthy`, making the healthcheck a cleaner "container is doing what it's supposed to" signal. **Not a 3-11 blocker** — operators have the log + env signals to differentiate today.

---

## 6. Log expectations per state

Stable Pino `msg` strings from `backend/workers/financeProjectionWorker.js`. Operators alert on / filter on these.

| State                                             | Expected log lines                                                                                                                                                                                                                                                                                                                                                                                                                                 | Source                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Disabled (worker boot, gate not satisfied)        | One-shot at startup: `[finance-projection-worker] disabled — idling`. No subsequent finance log lines from the worker container.                                                                                                                                                                                                                                                                                                                   | `financeProjectionWorker.js:258`              |
| Enabled, starting                                 | At startup: `[finance-projection-worker] starting finance projection worker` with structured `poll_interval_ms`, `tenant_count`. If enabled with empty `FINANCE_CONTROLLED_TENANT_IDS`: an additional `warn` line `[finance-projection-worker] enabled but no FINANCE_CONTROLLED_TENANT_IDS configured — poll cycles will be no-ops` (`:397-400`).                                                                                                 | `financeProjectionWorker.js:289-292, 397-400` |
| Enabled, poll cycle complete (steady state)       | Once per cycle (default 5 s): `[finance-projection-worker] poll cycle complete` with `tenant_count`, `success_count`, `failure_count`, `event_count`. `tenant_count: 1` for the controlled tenant configuration; `event_count: 0` in steady state pre-Slice-2 (empty stream).                                                                                                                                                                      | `financeProjectionWorker.js:310-317`          |
| Replay failure for a tenant                       | `error`-level: `[finance-projection-worker] eventStore.replay failed for tenant` with structured `tenant_id`, `error`. The tenant's summary row carries `ok: false`, `error: <message>`. The cycle's `failure_count` is incremented; `event_count` reflects events successfully dispatched before failure (per `runProjectionPollCycle` contract at `:130`).                                                                                       | `financeProjectionWorker.js:119-132`          |
| Dispatch failure for an event                     | `error`-level: `[finance-projection-worker] runner.dispatch failed for event` with structured `tenant_id`, `event_id`, `event_type`, `error`. Inner tenant loop breaks on first dispatch failure per the comment at `:153-158` (re-feeding from the unprocessed event happens on the next cycle via the runner's cursor guard). The runner side has also marked the projection `degraded` per `projectionRunner.js:262-267`.                       | `financeProjectionWorker.js:142-152`          |
| Cycle crashed (defense-in-depth, should not fire) | `error`-level: `[finance-projection-worker] poll cycle crashed` with `error`, `code`. `runProjectionPollCycle` is designed never to throw; this catch is defense-in-depth (`:326-336`). If it fires, treat as a code-correctness defect.                                                                                                                                                                                                           | `financeProjectionWorker.js:326-336`          |
| Rolled back to disabled                           | After redeploy with the gate flag unset: the worker boots and emits the `disabled — idling` line again. No `poll cycle complete` lines appear. The previously-fresh heartbeat file becomes stale; healthcheck flips to `unhealthy`. The transition log line `[finance-projection-worker] stopping finance projection worker` (`:348`) does **not** appear because the container was restarted (Coolify redeploy stops and starts a new container). | `financeProjectionWorker.js:258, 348`         |

**Backend-side route logs** (post-3-7 only):

| State                                        | Expected log lines                                                                                                                                                                                                                                                                                            | Source                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Module gate rejection                        | `error` from `logger.error('[finance.v2] module gate error:', error)` at `backend/routes/finance.v2.js:87` (only on `checkFinanceOpsEnabled` throw — Supabase outage etc.). Normal "not enabled" returns `403` JSON without an error log. Rate of `403` responses observable via backend access logs.         | `backend/routes/finance.v2.js:87` |
| Route mount refused (split-brain prevention) | At backend startup, an `Error` thrown from `createFinanceV2Routes` propagates and crashes startup. Container will repeatedly restart in Coolify with the same error in logs. This is the structurally-fail-closed signal from `backend/routes/finance.v2.js:48` when `ENABLE_FINANCE_PERSISTENT_EVENTS=true`. | `backend/routes/finance.v2.js:48` |

**No secrets in logs.** Pino redaction is global per `backend/lib/logger.js`; finance-specific never-log rule (per 2C-11 §4.2): never log JWT contents, `tenant_integrations.api_credentials`, full request bodies that may carry them. `tenant_id` (UUID) is safe and required for triage.

---

## 7. Rollback control matrix

Four independent rollback layers, per the orchestration prompt. Each is config / module-toggle only — no code revert, no schema rollback, no data loss.

| Layer                        | Rollback action                                                                                                                                                                                          | Effect                                                                                                                                                                                 | Where documented                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Route**                    | Unset `ENABLE_FINANCE_OPS` (or set to anything ≠ literal `'true'`) on `staging-backend-heavy` in Coolify; redeploy backend.                                                                              | `/api/v2/finance/*` unmounts. Express returns `404` for every request, regardless of tenant or auth state. The worker (separate Coolify app) is unaffected.                            | Phase 3-7 §9.2.                                                                                       |
| **Worker**                   | Unset `ENABLE_FINANCE_PROJECTION_WORKER` (preferred) on `staging-finance-projection-worker` in Coolify; redeploy worker. Or coarser: unset `ENABLE_FINANCE_WORKERS` or worker-side `ENABLE_FINANCE_OPS`. | Worker idles per the three-tier gate, logs `disabled — idling`, stops polling. The heartbeat file ages out; healthcheck flips to `unhealthy` (acceptable per §5).                      | Phase 3-5 §9.                                                                                         |
| **Tenant module enablement** | `update modulesettings set is_enabled = false where tenant_id = 'a11dfb63-...' and module_name = 'financeOps'` (single SQL statement).                                                                   | Controlled tenant loses route access on the next request. Module gate returns `403`. Route surface stays mounted for other tenants (none of whom have access either — they never did). | Phase 3-7 §9.1.                                                                                       |
| **Tenant list scoping**      | Set `FINANCE_CONTROLLED_TENANT_IDS=""` (empty) on `staging-finance-projection-worker` in Coolify; redeploy worker.                                                                                       | Worker stays enabled and healthy, but `parseControlledTenantIds()` returns `[]` so the poll cycle iterates zero tenants — `tenant_count: 0` in cycle logs; `event_count: 0`.           | Phase 3-5 §9.2 (the "tenant-list-clear option that pauses processing without flipping enable flags"). |

**Layering note:** the four layers are independent and orthogonal. An operator can roll back at any single layer without affecting the others. For an incident requiring "stop everything finance-related immediately," the coarsest combination is: route rollback + worker rollback (both layer 1 actions). Tenant-module + tenant-list rollbacks are scalpel options that preserve the runtime surface while pausing access.

**No code rollback required for any layer.** All Phase 3 activation is environment-variable + module-flag driven on top of code merged and verified at the Phase 3 baseline `3c60d9ff`. None of these rollbacks requires a Git revert.

---

## 8. Verification commands (operator instructions only — NOT executed by this task)

Each command targets a specific signal from §4. None ran by 3-11; the operator runs them when authorized and captures outputs in §13.

### 8.1 Signal 1 — Worker up/down

```bash
# Coolify-side: app status (run from Coolify UI or API):
# Expected when 3-5 active: container `running`, healthcheck `healthy`.
# Expected when 3-5 not active (3-4 only): container `running`, healthcheck `unhealthy` (acceptable, see §5).

# Direct via SSH:
ssh andreibyf@147.189.173.237 'docker ps --filter "name=staging-finance-projection-worker" --format "{{.Status}}"'
```

Pass: container `Up` with healthcheck matching the expected state for the worker's enable status. Fail: container `Exited`, `Restarting` repeatedly, or healthcheck `unhealthy` while the worker is supposed to be enabled (logs say `starting`, not `disabled — idling`).

### 8.2 Signal 2 — Worker lag (DEFERRED — no `/ready` JSON)

Until `/ready` exists, operator-side ad-hoc SQL (`service_role` against staging Supabase):

```sql
-- Newest event per tenant in finance.audit_events:
select tenant_id, max(created_at) as newest_event_at
from finance.audit_events
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
group by tenant_id;

-- Cursor position per (projection, tenant):
select projection_name, tenant_id, cursor_event_id, cursor_created_at, last_rebuilt_at
from finance.projection_state
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
order by projection_name;
```

Lag = `newest_event_at - cursor_created_at` per projection. Pass: lag below an operator-defined threshold (typically < 1 minute under normal load). In Phase 3-5 / pre-Slice-2 steady state, newest_event_at is null (empty stream) and lag is trivially zero.

### 8.3 Signal 3 — Replay failure

```bash
# Recent error log lines for replay / dispatch failures:
ssh andreibyf@147.189.173.237 'docker logs --tail 200 staging-finance-projection-worker 2>&1 | grep -E "eventStore\.replay failed|runner\.dispatch failed|poll cycle crashed"'
```

Pass: zero matches in steady state. Fail: any matches — capture the structured fields (`tenant_id`, `event_id`, `event_type`, `error`) for triage; cross-reference signal 4.

### 8.4 Signal 4 — Degraded projection

```sql
-- service_role connection against staging Supabase:
select projection_name, tenant_id, status, degraded_reason, last_rebuilt_at
from finance.projection_state
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and status = 'degraded';
```

Pass: zero rows. Fail: any rows — capture `degraded_reason` and cross-reference signal 3 logs for the failing event. Per Phase 3-5 §8.5 and 3-6 §5.10: also verify no row reports `status = 'replaying'` unexpectedly (the worker never calls `runner.replay()`, so post-3-5 steady state `replaying` is a stop condition).

### 8.5 Signal 5 — Adapter sync failure (DEFERRED)

No verification command — adapter worker does not exist. Operator confirms by checking that no `finance-adapter-worker` Coolify app exists on VPS-1 and no `finance.adapter.sync_failed` events appear in `finance.audit_events`:

```sql
select count(*) from finance.audit_events
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and event_type = 'finance.adapter.sync_failed';
```

Pass: count is zero (expected — nothing is producing this event type in Phase 3-11 scope).

### 8.6 Signal 6 — Dead-letter count (DEFERRED)

No verification command — dead-letter mechanism does not exist in steady state. Operator confirms via:

```sql
select count(*) from finance.adapter_jobs
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and status = 'failed';

select count(*) from finance.approvals
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and target_type = 'adapter_job'
  and status = 'pending';
```

Pass: both counts are zero.

### 8.7 Signal 7 — Audit evidence build failure (PARTIAL)

The `audit_timeline` projection's degraded state surfaces via signal 4 — re-use §8.4's query and filter for `projection_name = 'audit_timeline'`:

```sql
select status, degraded_reason
from finance.projection_state
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and projection_name = 'audit_timeline';
```

Standalone evidence-pack generation has no host — no verification command exists. Operator confirms by noting that no `buildEvidencePack` invocation surface (CLI / HTTP / worker) is deployed.

### 8.8 Signal 8 — RLS / tenant mismatch error (post-3-7)

```bash
# Backend log scan for tenant-mismatch / RLS errors over the last hour:
ssh andreibyf@147.189.173.237 'docker logs --since 1h staging-backend-heavy 2>&1 | grep -iE "tenant.*mismatch|rls|validateTenantAccess|cross-tenant"'
```

Pass: zero matches in steady state. Fail: any matches — high-severity, investigate immediately.

### 8.9 Signal 9 — Finance route 401/403 spikes (post-3-7)

```bash
# Count 401/403 responses on /api/v2/finance/* over the last hour:
ssh andreibyf@147.189.173.237 'docker logs --since 1h staging-backend-heavy 2>&1 | grep -E "GET|POST|PATCH" | grep "/api/v2/finance" | grep -E " 401| 403"' | wc -l
```

Pass: rate consistent with normal operation (≈ zero for the controlled tenant if everything's configured correctly; nonzero for other tenants attempting access — which is the expected reject behavior). Fail: a spike beyond a normal baseline — possible attempted unauthorized access; investigate.

---

## 9. Pass / fail criteria summary

3-11 verification passes if **all** of:

- §8.1 worker up/down: container `running`, healthcheck matches expected state for current enable status.
- §8.3 replay failure: zero error log matches in steady state.
- §8.4 degraded projection: zero `status = 'degraded'` rows.
- §8.5 / §8.6 / §8.7 deferred signals: zero rows / zero adapter events / no standalone audit invocation (expected — those runtimes don't exist).
- §8.8 RLS / tenant mismatch: zero log matches.
- §8.9 401/403 spikes: rate within normal baseline.
- No production environment was touched.
- No alert / dashboard / env / deployment configuration was changed.

3-11 fails if any check fails. See §10 stop conditions.

---

## 10. Stop conditions

- Signal 1: container `Exited` / `Restarting` repeatedly, or `unhealthy` while logs show `starting` (enabled but stuck) — investigate immediately.
- Signal 3: any `eventStore.replay failed` or `runner.dispatch failed` log line — capture structured fields, cross-reference signal 4, halt 3-11 verification until investigated.
- Signal 4: any `status = 'degraded'` row — read `degraded_reason`, find the matching failure log, halt further Phase 3 activation until the projection is operator-replayed (per 3-6 §5.10).
- Signal 4: any `status = 'replaying'` row outside an operator-triggered replay — the worker never calls `runner.replay()` in steady state, so this is unexpected (per Phase 3-5 §8.5 corrected expectation).
- Signal 8: any RLS / tenant-mismatch log entry — high severity; tenant isolation is the strongest staging invariant per Phase 3-3.
- Signal 9: 401/403 spike beyond normal baseline — investigate for unauthorized access attempts or misconfigured client.
- Production environment was touched in any way by the verification — instant halt.
- Backend startup fails repeatedly with `createFinanceV2Routes` constructor `Error` — `ENABLE_FINANCE_PERSISTENT_EVENTS` is accidentally set; remediation per Phase 3-7 §10.
- The heartbeat file format diverges from the expected shape (`{ status, updated_at, pid, poll_interval_ms, tenant_count, success_count, failure_count, event_count }`) — investigate; the operator surface §8.1 depends on the shape.

---

## 11. Hard constraints (explicit restatement)

| Constraint                                                                                                                                                                                                                                                                                                                                      | Source                   | Status this task       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------- |
| **No live staging observability checks executed by this task.** §2 explicit "None" row for every modality.                                                                                                                                                                                                                                      | 3-11 scope               | Confirmed — plan only. |
| **No alert configuration changes.** No Uptime Kuma monitor created / modified.                                                                                                                                                                                                                                                                  | 3-11 acceptance          | Confirmed.             |
| **No dashboard changes.** No Coolify dashboard / log-view setting altered.                                                                                                                                                                                                                                                                      | 3-11 acceptance          | Confirmed.             |
| **No env var changes.** No Doppler `stg_stg` mutation.                                                                                                                                                                                                                                                                                          | 3-11 acceptance          | Confirmed.             |
| **No deployment changes.** No Coolify redeploy of backend or worker triggered.                                                                                                                                                                                                                                                                  | 3-11 acceptance          | Confirmed.             |
| **No provider writes.** No adapter worker exists; no provider HTTP path opened.                                                                                                                                                                                                                                                                 | Phase 3-1 §9             | Confirmed.             |
| **No production action.** Hetzner is not touched; `prd_prd` Doppler not opened; production tenants not queried.                                                                                                                                                                                                                                 | Phase 3-1 §8             | Confirmed.             |
| **`ENABLE_FINANCE_PERSISTENT_EVENTS` remains `false` (unset).** The Slice 1 fail-closed guard at `backend/routes/finance.v2.js:48` stays structurally enforced. §6 documents the backend-startup-fails-loud behavior if this is accidentally set.                                                                                               | Phase 3-1 §7             | Confirmed.             |
| **Honest distinction of implemented vs deferred signals.** §4 catalog explicitly marks each signal as IMPLEMENTED, PARTIAL, or DEFERRED with the gap reason. No signal is silently absent or papered over. Mirrors the 3-4 / 3-5 / 3-6 honesty pattern for HTTP healthcheck / empty-stream / replay-surface gaps.                               | 3-11 scope               | Confirmed.             |
| **No standalone `finance-audit-worker` or `finance-adapter-worker` runtime invented.** §4 signals 5, 6 (adapter), 7 (standalone audit pack) explicitly DEFERRED because the worker modules don't exist; audit_timeline (in-process) covered transitively via signal 4.                                                                          | 3-4 / 3-11 scope         | Confirmed.             |
| **Heartbeat / log expectations consistent with Phase 3-4 and 3-5 corrections.** §5 carries over the disabled-state heartbeat limitation (Phase 3-4 §8.2) and the `unhealthy → healthy` enable transition (Phase 3-5 §7.2). §6 references only the actual log strings emitted by `backend/workers/financeProjectionWorker.js` with line numbers. | 3-4 / 3-5 reconciliation | Confirmed.             |
| **Rollback controls are config / module-toggle only.** §7 four-layer matrix; no code revert, no schema rollback, no data loss across all four layers.                                                                                                                                                                                           | 3-11 acceptance          | Confirmed.             |
| **Only valid `finance.projection_state.status` values referenced.** §4 signal 4, §8.4, §10 use `idle \| replaying \| degraded` per `projection-runtime.md` §3 — no `'ok'` slip-ups.                                                                                                                                                             | 3-5 reconciliation       | Confirmed.             |

---

## 12. Acceptance for Phase 3-11 (this task)

This document is the Phase 3-11 deliverable when paired with the matching CHANGELOG entry and the scaffold update. Acceptance for the **plan** (this task):

- [x] Signals defined for route auth/tenant failures (signal 8 + 9), worker up/down (signal 1), worker lag (signal 2 — DEFERRED), degraded projection (signal 4 — PARTIAL via SQL), replay failure (signal 3), adapter sync failure (signal 5 — DEFERRED), dead-letter count (signal 6 — DEFERRED), audit evidence build failure (signal 7 — PARTIAL via signal 4 for in-process audit_timeline; DEFERRED for standalone evidence-pack)
- [x] Adapter / dead-letter / audit-pack signals explicitly marked DEFERRED where runtime does not exist yet (§4 signals 5, 6, 7)
- [x] Current projection-worker heartbeat behavior documented, including disabled-state limitation from Phase 3-4 (§5 + §6 disabled-state row)
- [x] Expected logs for disabled, enabled-idle, replay failure, dispatch failure, rollback documented (§6)
- [x] Rollback controls for route, worker, tenant module enablement, tenant list scoping documented (§7 four-layer matrix)
- [x] Pass/fail criteria (§9) and stop conditions (§10) included
- [x] No live staging observability checks executed by this task — §2 explicit "None" for every modality
- [x] Production out of scope (§11)
- [x] CHANGELOG entry recording Phase 3-11 (separate change)
- [x] Scaffold updated with commit hash

Acceptance for the **execution** (a future, separately-authorized operator action): every check in §8 PASS (or DEFERRED with reason captured), no stop condition triggered, evidence captured per §13.

---

## 13. Evidence pack (populated on execution)

| Step | Run at (UTC) | Operator | Result (PASS / FAIL / DEFERRED)                                      | Output / evidence link | Notes |
| ---- | ------------ | -------- | -------------------------------------------------------------------- | ---------------------- | ----- |
| §8.1 |              |          |                                                                      |                        |       |
| §8.2 |              |          | DEFERRED (no /ready endpoint)                                        | —                      |       |
| §8.3 |              |          |                                                                      |                        |       |
| §8.4 |              |          |                                                                      |                        |       |
| §8.5 |              |          | DEFERRED (no adapter worker)                                         | —                      |       |
| §8.6 |              |          | DEFERRED (no adapter worker)                                         | —                      |       |
| §8.7 |              |          | PARTIAL (audit_timeline via §8.4; standalone evidence-pack deferred) |                        |       |
| §8.8 |              |          |                                                                      |                        |       |
| §8.9 |              |          |                                                                      |                        |       |

Next packet: **Phase 3-12 — Run staging regression and security review** (per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3-12).
