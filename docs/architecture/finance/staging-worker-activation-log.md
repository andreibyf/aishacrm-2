# Finance Ops — Phase 3-5: Controlled-Tenant Projection Worker Activation Runbook (Dry Run)

**Phase 3-5 — Controlled Staging Activation, projection worker enablement for one controlled tenant.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Runbook / dry-run plan. **No live activation was performed by this task.** No Coolify mutation, no Doppler / env var change in staging, no migration applied, no backend route mounted, no provider HTTP write. This document is the exact operator runbook a deploy owner would use; it does not execute the runbook.
**Date:** 2026-05-24
**Related:**
[`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) (3-1, baseline `3c60d9ff`) ·
[`staging-migration-application-log.md`](./staging-migration-application-log.md) (3-2) ·
[`staging-rls-verification-results.md`](./staging-rls-verification-results.md) (3-3) ·
[`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) (3-4, the deployment package + Coolify app this doc activates) ·
[`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) (2C-13, full enablement procedure — 3-5 is its Step 4 (worker toggles) for the projection worker only) ·
[`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md) (2C-6, worker design) ·
[`finance-worker-deployment-config.md`](./finance-worker-deployment-config.md) (2C-5, three-tier gate semantics) ·
[`deploy/coolify/finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml) (Phase 3-4 staging YAML)

---

## 1. Purpose and scope

Phase 3-5 is the **worker-only enablement** of `finance-projection-worker` for **exactly one controlled staging tenant**. After 3-5, the worker process satisfies its three-tier gate, starts its poll loop, and is scoped to the single controlled tenant via `FINANCE_CONTROLLED_TENANT_IDS`.

3-5 is **not** route activation. The backend `/api/v2/finance` surface remains unmounted (`ENABLE_FINANCE_OPS=false` on the backend app per Phase 3-1 §7 / Phase 3-4 §10). Route activation is **Phase 3-7**. The `financeOps` per-tenant module flag, smoke tests, and end-to-end customer-visible enablement (which 2C-13 §3–§5 cover in full) all wait for 3-7 / 3-8.

**Why 3-5 still has operational value before 3-7:**

- It proves the worker's tenant configuration is correct (`FINANCE_CONTROLLED_TENANT_IDS` correctly targets the controlled tenant; the DB connection works as `service_role` and reads `finance.audit_events`; the projection-state writes work; the heartbeat-file healthcheck transitions to healthy under load).
- It does so **without exposing any HTTP surface** — there is no public-facing change, no customer-visible side effect. Failure to reach healthy-enabled-idle is a worker-config bug, caught in isolation.
- It pre-stages the worker so that when 3-7 (route mount) and eventually Slice 2 (persistent events on the route) land, the worker is already running and ready to consume new events.

**This document and the matching env-change list are runbook only.** No flag is flipped, no Doppler config is mutated, no Coolify redeploy is triggered by this task. Executing the runbook is a separately authorized operator action covered by §5.

---

## 2. Live-activation posture

**Default for this task: no activation was performed.**

| What                                                                                      | Status this task                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Doppler `stg_stg` env var changed (any worker-tier flag, `FINANCE_CONTROLLED_TENANT_IDS`) | None.                                                                         |
| Coolify worker app redeploy                                                               | None.                                                                         |
| SSH session to VPS-1 (`andreibyf@147.189.173.237`)                                        | None.                                                                         |
| Staging Supabase migration applied                                                        | None.                                                                         |
| Backend `/api/v2/finance` route mounted in staging                                        | None — `ENABLE_FINANCE_OPS` on the backend app remains unset.                 |
| Per-tenant `financeOps` module flag flipped                                               | None — `financeOps` for `a11dfb63-4b18-4eb8-872e-747af2e37c46` remains unset. |
| Production environment touched in any way                                                 | None.                                                                         |
| Provider HTTP write (QuickBooks / Xero / ERPNext)                                         | None — no adapter worker exists; deferred until adapter Slice 2.              |

A live execution requires the deploy owner's explicit authorization. When authorized, the procedure in §5 is run **in the order listed** and outputs are captured per §11.

---

## 3. Prerequisites — what must be true before 3-5 runs

Each prerequisite is a previous Phase 3 packet's deliverable; this list is a single place an operator can scan before running §5.

- [ ] **Phase 3-1 baseline.** Branch `feat/finance-ops-runtime` at a descendant of `3c60d9ff` per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §2.1; 278/278 finance + projection + worker + route tests passing.
- [ ] **Phase 3-2 migrations applied to staging.** At minimum 168 (`finance` schema + 8 tables) and 169 (`finance.audit_events` append-only triggers); 170 (`finance.projection_state`) is required for projection-state durability across restarts; 171 (RLS policies on all 9 tables + no-hard-delete triggers) is required so the worker's `service_role` reads/writes work as expected and so any future direct PostgREST exposure stays fail-closed. Per [`staging-migration-application-log.md`](./staging-migration-application-log.md).
- [ ] **Phase 3-3 verification execution.** §4.1 (PostgREST exclusion), §4.2 (`auth.role()` from backend connection), §4.3.a (scratch-table RLS rehearsal), and §4.4.a (RLS catalog inventory: 9 tables RLS-enabled + 35 policies + 9 triggers) all PASS in staging. Per [`staging-rls-verification-results.md`](./staging-rls-verification-results.md).
- [ ] **Phase 3-4 worker app deployed disabled.** Coolify app `staging-finance-projection-worker` exists on VPS-1 (Coolify server UUID `f7uzrwlbqjtx6qamppma5xsz`), container is `running`, Docker healthcheck reports `unhealthy` (acceptable while disabled — see [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) §8.2), logs show the single line `[finance-projection-worker] disabled — idling`. All three enable flags unset; `FINANCE_CONTROLLED_TENANT_IDS` empty. Per [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) §6.3.
- [ ] **Doppler `stg_stg` secrets present.** `FINANCE_DB_URL` (or `DATABASE_URL`) pointing at the staging Supabase project, and `DOPPLER_TOKEN` for the worker app's service account. Per [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) §6.1 — these are needed for the worker process to **boot at all**, not just to run, because the entry block at `backend/workers/financeProjectionWorker.js:378-383` exits without them.
- [ ] **Backend `ENABLE_FINANCE_OPS` unset on `staging-backend-heavy`.** The backend's route mount and Phase 3-7 are out of 3-5 scope; do not pre-emptively flip the backend's env to advance Phase 3-7. The worker's `ENABLE_FINANCE_OPS` (on the worker app) is independent of the backend's (on the backend app).
- [ ] **`ENABLE_FINANCE_PERSISTENT_EVENTS` unset on `staging-backend-heavy`.** The Slice 1 fail-closed route-mount guard at `backend/routes/finance.v2.js:48` makes the backend refuse to start with this flag true; Slice 2 lifts that guard. The worker does **not** read this flag (Phase 3-1 §7, Phase 3-4 §5.2 — `buildProjectionRunner()` at `backend/workers/financeProjectionWorker.js:185` unconditionally uses `createFinancePgEventStore`). Keep it unset on both apps for environment-parity clarity.
- [ ] **No production action.** `prd_prd` Doppler config is not opened; Hetzner is not touched; no production tenant is queried.

If any prerequisite fails, **halt** 3-5 and remediate before continuing. None of these checks mutates anything; they confirm the state required for the activation to be meaningful.

---

## 4. Activation envelope — what changes vs what does not

3-5 is intentionally minimal. The complete diff between "before 3-5" and "after 3-5" is four env-var values on **one** Coolify app.

| Env var (worker app `staging-finance-projection-worker`) | Before 3-5                      | After 3-5                                                                                                                                                                            |
| -------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ENABLE_FINANCE_OPS`                                     | unset (or any value ≠ `'true'`) | `true` — tier 1 of the three-tier worker gate. Note: this is set on the **worker app**, which is independent of the **backend app**'s `ENABLE_FINANCE_OPS` (route mount, Phase 3-7). |
| `ENABLE_FINANCE_WORKERS`                                 | unset                           | `true` — tier 2 of the three-tier gate. Master switch for the whole worker tier.                                                                                                     |
| `ENABLE_FINANCE_PROJECTION_WORKER`                       | unset                           | `true` — tier 3, the per-worker flag.                                                                                                                                                |
| `FINANCE_CONTROLLED_TENANT_IDS`                          | `""` (empty)                    | `a11dfb63-4b18-4eb8-872e-747af2e37c46` — the single controlled staging tenant UUID per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3.              |

**Nothing else changes.** The following are explicitly **unchanged** by 3-5:

| Env var / app                                                       | 3-5 posture                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENABLE_FINANCE_OPS` on `staging-backend-heavy`                     | **Unchanged** (unset). Backend route mount is Phase 3-7. 3-5 does not pre-stage the backend.                                                                                                                                                                                                                                |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` (any app)                        | **Unchanged** (unset / false). The worker doesn't read it; the backend route refuses to start with it true (`backend/routes/finance.v2.js:48`). Lifting that guard is gated on projection-backed reads landing in Slice 2.                                                                                                  |
| `financeOps` module flag for `a11dfb63-4b18-4eb8-872e-747af2e37c46` | **Unchanged** (unset). The module flag gates **route requests**, not worker poll loops — the worker reads `finance.audit_events` directly via `service_role` connection. Module flag flip is Phase 3-7's prerequisite for tenant access on the route.                                                                       |
| `financeOps` module flag for any other tenant                       | **Unchanged** (unset). Per [`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) §2: "one tenant only" is structurally enforced by setting `financeOps` for exactly one `tenant_id`. 3-5 doesn't even touch this flag for the one controlled tenant; 3-7 will.                                             |
| `FINANCE_ADAPTER_MODE`, `FINANCE_PROVIDER_WRITES_ENABLED`           | **Not applicable.** No `finance-adapter-worker` exists (deferred until adapter Slice 2 per [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) §4). No env vars to flip.                                                                                                                               |
| Any standalone `finance-audit-worker` env or app                    | **Does not exist.** No standalone audit worker module is implemented; `audit_timeline` projection runs inside `finance-projection-worker` via `auditTimelineProjection` registered in `buildProjectionRunner` with `includeInfrastructureEvents: true` (`backend/workers/financeProjectionWorker.js:194`). No flag to flip. |
| Staging migrations                                                  | **Unchanged.** No migration applied by 3-5.                                                                                                                                                                                                                                                                                 |
| Production env (Hetzner, `prd_prd` Doppler, production tenants)     | **Unchanged.** Never in any Phase 3 packet's scope.                                                                                                                                                                                                                                                                         |

---

## 5. Dry-run activation sequence (the env changes the operator WOULD make — NOT executed by this task)

The operator runs these steps in order, in staging only. **None of them ran by this Phase 3-5 task.** Each step lists prerequisites, the exact env-var change, expected outcome, and rollback for that step.

### 5.1 Preflight (no mutation)

- [ ] Re-confirm every item in §3 is still true. If anything has drifted (`git status` shows uncommitted changes, the worker app is no longer `running`, `ENABLE_FINANCE_PERSISTENT_EVENTS` got set somewhere, etc.), halt and remediate.
- [ ] Confirm VPS-1 utilization is normal via `ssh andreibyf@147.189.173.237 'top -bn1 | head -5'` — the projection worker activation adds a poll loop, not a heavy job; load should be minimal. The 2026-05-10 incident is the reason this check is in every Phase 3 packet.
- [ ] Confirm the controlled tenant `tenant_id` `a11dfb63-4b18-4eb8-872e-747af2e37c46` is still the chosen staging tenant per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3. If it changed, update 3-1 first.
- [ ] Confirm no production action is implied: `prd_prd` Doppler config is not opened, Hetzner backend (`backend.aishacrm.com`) is not touched.

### 5.2 Update the worker app env (Coolify UI / API)

In Coolify (control plane on VPS-2, targeting the `staging-finance-projection-worker` app on VPS-1 server UUID `f7uzrwlbqjtx6qamppma5xsz`), open the app's environment editor and set the four values per §4:

```
ENABLE_FINANCE_OPS=true
ENABLE_FINANCE_WORKERS=true
ENABLE_FINANCE_PROJECTION_WORKER=true
FINANCE_CONTROLLED_TENANT_IDS=a11dfb63-4b18-4eb8-872e-747af2e37c46
```

**Strict-equality reminder** (matches `isFinanceProjectionWorkerEnabled()` at `backend/workers/financeProjectionWorker.js:69`): the three enable flags must be the literal lowercase string `'true'`. Anything else — `'TRUE'`, `'1'`, the boolean `true`, the string `'yes'` — leaves the gate closed. This prevents accidental enablement from typos / coerced values.

**Tenant-id reminder** (matches `parseControlledTenantIds()` at `backend/workers/financeProjectionWorker.js:89`): `FINANCE_CONTROLLED_TENANT_IDS` is comma-separated, whitespace tolerated, trailing commas tolerated. Empty / unset / whitespace-only ⇒ `[]` ⇒ poll cycle iterates zero tenants. **There is no implicit "all tenants" fall-through.** A typo in the tenant UUID becomes an empty-array silent no-op, not a wide-open processing of every tenant. The §6 verification reads the worker logs to confirm the configured-tenant-count is `1`.

**Rollback for 5.2:** revert any of the four env vars to its pre-3-5 value (cleanest: unset `ENABLE_FINANCE_PROJECTION_WORKER` or set it `false`) and redeploy. Per §9.

### 5.3 Redeploy the worker app

Trigger a Coolify redeploy on `staging-finance-projection-worker` so the container restarts with the new env. Coolify will:

1. Stop the existing container (which was idling in the disabled state).
2. Pull the existing image (the image itself is unchanged; only the env block differs).
3. Start a fresh container with the new env block.

The new container goes through the boot sequence in [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) §6.2, but this time the three-tier gate is satisfied, so the worker proceeds to start its poll loop instead of returning the idle stub.

**Rollback for 5.3:** same as 5.2 — flip a flag and redeploy. No DB rollback, no migration rollback, no code revert.

### 5.4 Do NOT touch other apps in 3-5

The backend `staging-backend-heavy` env is **not** modified. The `financeOps` module flag for the controlled tenant is **not** flipped. Those are 3-7. Pre-emptively flipping them collapses 3-5 and 3-7 into a single change, which loses the isolated-worker-config-failure signal that 3-5 is designed to give.

---

## 6. Expected worker behavior after activation

After §5 completes, the worker container reaches **healthy enabled idle** state. The full sequence:

### 6.1 Boot and gate-satisfied path

1. Container starts.
2. Entry block at `backend/workers/financeProjectionWorker.js:370-415` reads `FINANCE_DB_URL || DATABASE_URL` (Doppler-injected); constructs `pg.Pool` (lazy — no TCP connection yet); constructs runner and event store via `buildProjectionRunner({ pool })` and `createFinancePgEventStore({ pool })`.
3. `parseControlledTenantIds()` returns `['a11dfb63-4b18-4eb8-872e-747af2e37c46']` — array length 1.
4. `startFinanceProjectionWorker({ runner, eventStore, tenantIds })` is called.
5. `isFinanceProjectionWorkerEnabled()` returns `true` (all three gates satisfied).
6. Worker logs `[finance-projection-worker] starting finance projection worker` with structured fields `poll_interval_ms: 5000` (default) and `tenant_count: 1`.
7. Worker writes an initial heartbeat with `status: 'starting'` to `/tmp/finance-projection-worker-heartbeat.json`.
8. `setImmediate(runCycle)` queues the first poll cycle.

### 6.2 First and subsequent poll cycles

Each cycle calls `runProjectionPollCycle({ runner, eventStore, tenantIds })`. For the controlled tenant:

1. `await eventStore.replay(tenantId)` → reads the full ordered tenant stream from `finance.audit_events` via the Postgres adapter. Ordering is `created_at` ASC, `id` ASC (the frozen Track A contract, backed by migration 169's `idx_finance_audit_events_replay (tenant_id, created_at, id)`).
2. **At this point the stream is expected to be empty.** Reason: the backend route is not mounted (`ENABLE_FINANCE_OPS=false` on `staging-backend-heavy` — Phase 3-7), and even when 3-7 lands, the backend will not write to `finance.audit_events` until `ENABLE_FINANCE_PERSISTENT_EVENTS=true` on the backend, which Slice 1 structurally refuses (`backend/routes/finance.v2.js:48`) until Slice 2 lifts the guard. So the only events the worker can find are whatever pre-existing dev / seed data was inserted directly into staging's `finance.audit_events` before 3-2 (likely none, since 3-2 applied to a clean staging schema).
3. For each event in the stream (if any): `await runner.dispatch(event)`. The runner's cursor guard at the `(projection, tenant)` level drops events whose position is not strictly greater than the persisted cursor, so re-feeding the whole stream on every poll is **safe and correct** — already-applied events are no-ops; a projection advances only on genuinely new events. The runner dispatches each event to the four registered projection workers based on each worker's `consumedEvents` membership and the infrastructure-event filter (`audit_timeline` opts in to `finance.audit.event_appended`; the other three never see it):

| Projection in `buildProjectionRunner`           | Source                                                                       | Event types consumed                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledger` (`ledgerProjection.js`)                | `createLedgerProjectionWorker()`                                             | `finance.journal.posted`                                                                                                                                |
| `approval_queue` (`approvalQueueProjection.js`) | `createApprovalQueueProjectionWorker()`                                      | `finance.approval.requested`, `.approved`, `.rejected`, `.cancelled`                                                                                    |
| `adapter_queue` (`adapterQueueProjection.js`)   | `createAdapterQueueProjectionWorker()`                                       | `finance.adapter.sync_queued`, `.sync_succeeded`, `.sync_failed`                                                                                        |
| `audit_timeline` (`auditTimelineProjection.js`) | `createAuditTimelineProjectionWorker({ includeInfrastructureEvents: true })` | Full canonical taxonomy + the reserved internal infrastructure event `finance.audit.event_appended` (audit timeline is the only opt-in consumer of it). |

4. Cycle complete: worker logs `[finance-projection-worker] poll cycle complete` with `tenant_count: 1, success_count: 1, failure_count: 0, event_count: 0` (the typical 3-5 steady-state numbers — `0` events because the stream is empty until Slice 2).
5. Worker writes a heartbeat update with the same fields to `/tmp/finance-projection-worker-heartbeat.json`. **The healthcheck transitions from `unhealthy` (the disabled-state limitation from Phase 3-4 §8.2) to `healthy`** — heartbeat file present and freshly written, `mtime` well within the 45 s recency threshold.
6. `setTimeout(runCycle, 5000)` schedules the next cycle.

### 6.3 What does NOT happen

- **No adapter execution.** No `finance-adapter-worker` exists; no provider HTTP write of any kind can occur.
- **No standalone audit-worker activity.** No `finance-audit-worker` process exists; `audit_timeline` projection upkeep happens inside this same `finance-projection-worker` process via the registered projection worker.
- **No backend route activity.** `/api/v2/finance/*` returns `404` (route unmounted; Phase 3-7).
- **No tenant-facing change.** The controlled tenant's `financeOps` module flag is still unset; even if the route were mounted, the module gate would reject every request from that tenant.
- **No `finance.audit_events` writes.** The Slice 1 invariant holds: the backend route is the only writer in the current code, and it isn't mounted. The worker is a pure reader of that table.
- **No `finance.projection_state` writes during 3-5 steady state.** `runProjectionPollCycle()` (`backend/workers/financeProjectionWorker.js:112-171`) only iterates events returned by `eventStore.replay(tenantId)`; with an empty `finance.audit_events` stream, the inner `for (const event of events)` body never executes, so `runner.dispatch()` is never called. The runner only persists projection-state rows inside `dispatch()` and `replay()` — there is no empty-stream bootstrap write. Expected `finance.projection_state` row count for the controlled tenant during 3-5: **zero** (assuming no pre-existing dev/seed events in `finance.audit_events`). Rows will start being written once events appear — i.e., after Slice 2 lifts the fail-closed route guard and the backend begins persisting events.

---

## 7. Health, log, and heartbeat expectations after activation

Per [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) §8, three surfaces are observable. 3-5 changes the expected reading on each.

### 7.1 Container liveness (Coolify built-in)

| When           | Expected                                                                               |
| -------------- | -------------------------------------------------------------------------------------- |
| Before 5.3     | `running`                                                                              |
| After 5.3 boot | `running` (unchanged — the container restarts but stays alive throughout the redeploy) |

### 7.2 Heartbeat-file healthcheck (Docker `HEALTHCHECK`)

| When           | Expected                                                                                                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before 5.3     | `unhealthy` — acceptable while disabled per [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) §8.2. The disabled return path does not write a heartbeat (the carried-over limitation from Phase 3-4).                                                                                         |
| After 5.3 boot | First poll-cycle completes → heartbeat file written → Docker healthcheck **transitions to `healthy`** within one cycle (≤ 5 s + healthcheck interval). This transition is the primary "the worker enabled successfully" signal an operator should look for.                                                          |
| Steady state   | `healthy` — heartbeat refreshed on every poll cycle (default 5 s); `mtime` recency threshold is 45 s (3 × default `FINANCE_WORKER_HEARTBEAT_MS=15000`), so even a one-poll-cycle delay does not trip the check. If the healthcheck flips to `unhealthy` post-activation, the worker is stuck — investigate via logs. |

**Disabled-state heartbeat limitation, carried over from Phase 3-4 §8.2** — if 3-5 is rolled back (§9), the worker returns to the disabled state and the heartbeat-file healthcheck will flip back to `unhealthy`. That `unhealthy` is the expected rollback state, not a new failure. The follow-up to emit a one-time `writeWorkerHeartbeat({ status: 'disabled' })` on the idle return path would let rollback report `healthy, idle` instead — still tracked as a follow-up code change, **not a 3-5 blocker**.

### 7.3 Pino log lines (the operational signal)

The activation produces these new log lines, in order:

1. `[finance-projection-worker] starting finance projection worker` (once at startup) — structured `poll_interval_ms`, `tenant_count`. Confirms the gate is satisfied. **If you see this line, §5.2's flag flips reached the process.**
2. `[finance-projection-worker] poll cycle complete` (once per poll cycle, ~every 5 s) — structured `tenant_count: 1`, `success_count: 1`, `failure_count: 0`, `event_count: <n>`. **`tenant_count: 1` confirms `FINANCE_CONTROLLED_TENANT_IDS` parsed as expected; any other value means the env var is mis-set.**
3. **If `event_count > 0`** in any cycle, events are flowing — which in 3-5 (before 3-7 / Slice 2) would indicate either pre-existing dev/seed data in `finance.audit_events` or some path I haven't accounted for. Worth investigating, not failing.

**Error log lines that would indicate trouble** (none expected in 3-5 steady-state):

- `[finance-projection-worker] eventStore.replay failed for tenant` — DB error or RLS misconfiguration on `finance.audit_events`. Halt and check Phase 3-3 §4.4.a (RLS catalog) and §4.2 (`auth.role()`).
- `[finance-projection-worker] runner.dispatch failed for event` — projection handler error. Halt; this is a runtime degraded-projection situation per [`projection-runtime.md`](./projection-runtime.md) §11.
- `[finance-projection-worker] poll cycle crashed` — defense-in-depth catch around the cycle. Investigate immediately.
- `[finance-projection-worker] enabled but no FINANCE_CONTROLLED_TENANT_IDS configured — poll cycles will be no-ops` — the env-var flip was incomplete (`ENABLE_FINANCE_PROJECTION_WORKER=true` but `FINANCE_CONTROLLED_TENANT_IDS=` still empty). Set the tenant id and redeploy.

### 7.4 Alerting

Phase 3-5 doesn't add new alert rules. The Uptime Kuma / Coolify status surfaces continue to read the heartbeat-file healthcheck. Adding finance-worker-specific alerting (worker lag, degraded projection count, replay failure count) is part of Phase 3-11 ([`observability-alerting.md`](./observability-alerting.md), 2C-11), not 3-5.

---

## 8. Verification commands (operator instructions only — NOT executed by this task)

After §5 completes, the operator runs these checks in order. **None ran by this 3-5 task.** Capture every output as evidence per §11.

### 8.1 Container and healthcheck status

```bash
ssh andreibyf@147.189.173.237 'docker ps --filter "name=staging-finance-projection-worker" --format "{{.Status}}"'
```

**Pass:** output starts with `Up <duration>` and ends with `(healthy)` once the first cycle has completed. **Fail (or timeout to healthy >> 60 s):** investigate via logs (§8.2).

### 8.2 Log lines confirm enabled + tenant-configured

```bash
ssh andreibyf@147.189.173.237 'docker logs --tail 50 staging-finance-projection-worker'
```

**Pass:** logs contain `[finance-projection-worker] starting finance projection worker` with `tenant_count: 1`, followed by one or more `[finance-projection-worker] poll cycle complete` lines also reporting `tenant_count: 1`. **Fail:** any of the §7.3 error log lines, or any line containing `disabled — idling` (means the gate isn't satisfied — go back and verify the four env vars per §4 are the literal string `'true'` / the correct UUID).

### 8.3 Heartbeat file present and fresh (read from inside the container)

```bash
ssh andreibyf@147.189.173.237 'docker exec staging-finance-projection-worker cat /tmp/finance-projection-worker-heartbeat.json'
ssh andreibyf@147.189.173.237 'docker exec staging-finance-projection-worker stat /tmp/finance-projection-worker-heartbeat.json'
```

**Pass:** file contains valid JSON with `status: "ok"`, `tenant_count: 1`, `pid: <number>`, `updated_at` within the last 60 s. **Fail:** file absent, JSON malformed, or `updated_at` older than 60 s.

### 8.4 No new `finance.audit_events` rows (because the route is still unmounted)

From the staging Supabase SQL editor (service_role):

```sql
select count(*) from finance.audit_events where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
```

**Pass:** count is `0` (or whatever pre-existing dev/seed data count was before 3-5 — record both pre- and post-activation counts; they should be equal). **Fail:** count increased after 3-5. This would mean either (a) the backend is somehow writing events despite `ENABLE_FINANCE_OPS=false` on `staging-backend-heavy`, or (b) something other than the gated backend route wrote to the table. Either is a stop condition — investigate.

### 8.5 `finance.projection_state` rows for the configured projections (optional)

From the staging Supabase SQL editor (service_role):

```sql
select projection_name, tenant_id, status, cursor_event_id, cursor_created_at, updated_at
from finance.projection_state
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
order by projection_name;
```

**Pass:** **zero rows** is the expected result for the controlled tenant when `finance.audit_events` is empty (the steady-state 3-5 condition per §6.3). `runProjectionPollCycle()` only dispatches events that exist; with an empty stream no `dispatch()` runs and no `projection_state` rows are created. If any rows do exist (e.g., from pre-existing dev/seed events in `finance.audit_events`), each should report `status = 'idle'` — the steady-state value per the `idle | replaying | degraded` contract (`projection-runtime.md` §3; `projectionStore.pg.js:256` persists `state.state ?? 'idle'`). **Fail:** any row with `status = 'degraded'` — means an event made a handler throw; investigate the `degraded_reason` and the matching `[finance-projection-worker] runner.dispatch failed` log line. A row with `status = 'replaying'` outside an operator-triggered replay is also a fail (the worker does not call `runner.replay()`; the only path to `replaying` is operator action).

### 8.6 No production action confirmation

```bash
# Verify no Hetzner backend change
ssh root@178.156.140.86 'docker ps --filter "name=backend" --format "{{.Status}}"' 2>/dev/null \
  || echo "Hetzner access not opened — expected, production is out of scope"
```

**Pass:** either the SSH connection isn't open (expected; we don't open production for 3-5) OR if it is, the backend container shows no recent restart triggered by anything 3-5 did.

---

## 9. Disabled-state and rollback behavior

Phase 3-5 rollback is **config-only**. No code revert, no schema rollback, no data migration, no Coolify app recreation.

### 9.1 Rollback to the Phase 3-4 disabled state

The cleanest rollback: unset `ENABLE_FINANCE_PROJECTION_WORKER` (or set it to anything other than the literal string `'true'`) on the `staging-finance-projection-worker` Coolify app, and redeploy.

What happens on the next container start:

1. The container boots, reads `FINANCE_DB_URL`, constructs the `pg.Pool` (no TCP connection — lazy).
2. `isFinanceProjectionWorkerEnabled()` returns `false` because tier 3 is now unsatisfied.
3. Worker logs `[finance-projection-worker] disabled — idling` and returns an idle stub.
4. Heartbeat file is **not** written (the carried-over limitation from Phase 3-4 §8.2); the heartbeat file from before the redeploy ages out within 45 s; Docker healthcheck flips back to `unhealthy`. **`unhealthy` is the expected rollback state**, matching the Phase 3-4 disabled-and-idling posture.
5. Operator differentiates "rolled back correctly" from "unexpectedly failed" by reading the `disabled — idling` log line and confirming the env-var flip in Coolify.

**No data is lost or corrupted.** `finance.audit_events` is untouched (the worker is a pure reader of it). `finance.projection_state` rows (if any were written during the brief active window) remain as a valid snapshot at the last applied cursor — the next activation resumes catch-up dispatch strictly after the persisted cursor, no cold rebuild.

### 9.2 Coarser rollback options

If the per-worker flag is unreliable for some reason, the broader rollback options work the same way:

- **Worker-tier rollback:** unset `ENABLE_FINANCE_WORKERS`. Same effect for the projection worker; would also disable any future workers sharing the worker tier.
- **Whole-Finance-Ops rollback (worker side):** unset `ENABLE_FINANCE_OPS` on the worker app. Tier 1 fails; same effect on the worker. Does **not** affect the backend's `ENABLE_FINANCE_OPS` (different app, different env block).
- **Tenant-list rollback (no flag change):** clear `FINANCE_CONTROLLED_TENANT_IDS` to `""`. The worker stays enabled but processes zero tenants — poll cycles iterate the empty array, heartbeat is still written on every cycle, log line shows `tenant_count: 0`. Healthcheck stays `healthy`. Useful for "pause processing without flipping enable flags" if you want to preserve the enabled state for a quick re-enable.

### 9.3 Removing the worker entirely

If 3-5 was a mistake and the worker app should not exist at all, delete the Coolify app — that returns to the pre-3-4 state. No DB rollback; `finance.audit_events` is untouched; `finance.projection_state` rows (if any) can be left in place (they're a rebuildable cache) or truncated for the controlled tenant.

### 9.4 Rollback is config-only

- **No code revert required.** All Phase 3 activation is environment-variable driven on top of code already merged and verified at the Phase 3 baseline `3c60d9ff`. A Phase 3-5 rollback does not require reverting any commit.
- **No schema rollback required.** No migration was applied by 3-5; rolling back the worker doesn't roll back migrations 168/169/170/171 (which 3-2 applied).
- **No customer impact.** No tenant-facing surface was activated by 3-5 (the route is still unmounted; the module flag is still unset). Rollback affects only the worker's poll loop on staging.

---

## 10. Stop conditions

Phase 3-5 stop conditions are the subset of the Phase 3 scaffold stop conditions ([`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §10.3) that apply to worker activation. Any of the following triggers an immediate halt; rollback per §9.

- Worker fails to reach `[finance-projection-worker] starting finance projection worker` after §5.3 redeploy — the three-tier gate is not satisfied; verify §5.2 env-var literal-string `'true'` semantics.
- Worker logs `enabled but no FINANCE_CONTROLLED_TENANT_IDS configured — poll cycles will be no-ops` — `FINANCE_CONTROLLED_TENANT_IDS` is unset/empty. Set it and redeploy.
- Worker reaches enabled state but logs report `tenant_count` other than `1` — env var parsed differently than expected; check for typos, extra commas, etc.
- Worker logs `[finance-projection-worker] eventStore.replay failed for tenant` — RLS/service_role/DB-connection failure. Halt; verify Phase 3-3 §4.2 and §4.4.a.
- Worker logs `[finance-projection-worker] runner.dispatch failed for event` — a projection handler crashed; runtime is in degraded state. Halt; investigate via the degraded `finance.projection_state` row.
- Healthcheck stays `unhealthy` for more than 2 × poll interval after §5.3 — heartbeat file not being written despite the worker being enabled. Investigate.
- `finance.audit_events` row count for the controlled tenant increases without an obvious source — Phase 3-7 hasn't run yet and Slice 2 hasn't lifted the fail-closed guard, so this should be impossible; if it happens, halt and audit.
- Production env is touched in any way — instant halt.
- `ENABLE_FINANCE_OPS=true` is set on `staging-backend-heavy` as part of 3-5 — this conflates 3-5 with 3-7 and is out of scope. Halt; revert the backend env to unset before continuing.
- `ENABLE_FINANCE_PERSISTENT_EVENTS=true` is set anywhere — the backend would refuse to start; halt and revert.
- Any tenant other than the controlled `a11dfb63-4b18-4eb8-872e-747af2e37c46` appears in worker logs — `FINANCE_CONTROLLED_TENANT_IDS` is mis-set. Halt and correct.

---

## 11. Hard constraints (explicit restatement)

These constraints are non-negotiable for Phase 3-5 and the rest of the Phase 3 arc. Each maps to a hard rule in [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md).

| Constraint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Source                   | Status this task          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------- |
| **No actual staging activation performed by this task.** This document is the runbook; execution is a separately authorized operator action.                                                                                                                                                                                                                                                                                                                                                                    | 3-5 scope                | Confirmed — runbook only. |
| **No Coolify/VPS mutation by this task.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 3-5 acceptance           | Confirmed.                |
| **No Doppler / env var changes on staging by this task.**                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 3-5 acceptance           | Confirmed.                |
| **No migration application.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 3-2 scope                | Confirmed.                |
| **No route activation.** Backend `staging-backend-heavy` `ENABLE_FINANCE_OPS` remains unset; `/api/v2/finance` route stays unmounted. Phase 3-7 is the route activation packet, not 3-5.                                                                                                                                                                                                                                                                                                                        | 3-5 scope                | Confirmed.                |
| **No provider writes.** No adapter worker exists (deferred until adapter Slice 2 per [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) §4); no HTTP write path is opened.                                                                                                                                                                                                                                                                                                                | Phase 3-1 §9             | Confirmed.                |
| **No production action.** Hetzner is not touched; `prd_prd` Doppler config is not opened; production tenants are not queried.                                                                                                                                                                                                                                                                                                                                                                                   | Phase 3-1 §8             | Confirmed.                |
| **Do not imply standalone audit or adapter workers exist.** `audit_timeline` projection runs inside `finance-projection-worker` via `auditTimelineProjection` registered in `buildProjectionRunner({ includeInfrastructureEvents: true })` at `backend/workers/financeProjectionWorker.js:194`. No standalone `finance-audit-worker` module is implemented. No standalone `finance-adapter-worker` module is implemented. This doc and the activation procedure reflect only the implemented projection worker. | 3-5 scope                | Confirmed.                |
| **`FINANCE_CONTROLLED_TENANT_IDS` required, empty = no-op.** §4 / §5.2 / §6.2 all state this. Enforced by `parseControlledTenantIds()` at `backend/workers/financeProjectionWorker.js:89`. No implicit "process all tenants" fall-through.                                                                                                                                                                                                                                                                      | 3-5 scope                | Confirmed.                |
| **`ENABLE_FINANCE_PERSISTENT_EVENTS` remains `false`** (unset) on both apps. Backend route-mount guard at `backend/routes/finance.v2.js:48` is structurally fail-closed until Slice 2. Worker does not read this flag.                                                                                                                                                                                                                                                                                          | Phase 3-1 §7             | Confirmed.                |
| **Heartbeat / log expectations consistent with Phase 3-4 corrected behavior.** §7.2 carries over the disabled-state heartbeat limitation and frames the disabled-state `unhealthy` as expected — both for the pre-5.3 state and for any post-rollback state. §7.3 references the exact log lines emitted by `backend/workers/financeProjectionWorker.js`.                                                                                                                                                       | 3-4 / 3-5 reconciliation | Confirmed.                |

---

## 12. Acceptance for Phase 3-5 (this task)

This document is the Phase 3-5 deliverable when paired with the matching CHANGELOG entry and the scaffold update. Acceptance for the **runbook** (this task):

- [x] Controlled-tenant activation sequence documented as a dry run (§5, three sub-steps with rollback per step)
- [x] Required env changes listed but not made (§4 change table, §5.2 exact env block)
- [x] `ENABLE_FINANCE_OPS` / `ENABLE_FINANCE_WORKERS` / `ENABLE_FINANCE_PROJECTION_WORKER` behavior documented (§4, §5.2 with strict-equality note, §11)
- [x] `FINANCE_CONTROLLED_TENANT_IDS` required to contain the single controlled tenant id (§4, §5.2)
- [x] Empty `FINANCE_CONTROLLED_TENANT_IDS` = no tenants/no-op restated (§4 table, §5.2 tenant-id reminder, §11)
- [x] `ENABLE_FINANCE_PERSISTENT_EVENTS` kept false/unset for backend route safety (§4 unchanged-things table, §11, multiple cross-references to `backend/routes/finance.v2.js:48`)
- [x] Expected worker behavior after activation documented (§6 — replay per configured tenant, dispatch to 4 projections including `audit_timeline`, no adapter/provider writes)
- [x] Disabled-state and rollback behavior documented (§9 — config-only, returns to Phase 3-4 disabled state)
- [x] Health/log/heartbeat expectations documented, including disabled-state heartbeat limitation from Phase 3-4 (§7.2 carries it over explicitly)
- [x] Verification commands as operator instructions only (§8 — five command groups, none executed)
- [x] No live activation performed by this task — §2 explicit "None" row for every modality
- [x] CHANGELOG entry recording Phase 3-5 (separate change)
- [x] Scaffold updated with commit hash, next active item (Phase 3-6 or 3-7 depending on cadence)

Acceptance for the **execution** (a future, separately-authorized action by the deploy owner): every check in §8 PASS, worker is in `running, healthy, enabled` state, logs report `tenant_count: 1`, no production action occurred.

---

## 13. Evidence pack (populated on execution)

When the activation is executed, capture verbatim outputs here (or in a linked evidence record under `docs/architecture/finance/phase-3-evidence/`). Until execution, the table below is empty.

| Step | Run at (UTC) | Operator | Result (PASS / FAIL / DEFERRED) | Output / evidence link | Notes |
| ---- | ------------ | -------- | ------------------------------- | ---------------------- | ----- |
| §5.1 |              |          |                                 |                        |       |
| §5.2 |              |          |                                 |                        |       |
| §5.3 |              |          |                                 |                        |       |
| §8.1 |              |          |                                 |                        |       |
| §8.2 |              |          |                                 |                        |       |
| §8.3 |              |          |                                 |                        |       |
| §8.4 |              |          |                                 |                        |       |
| §8.5 |              |          |                                 |                        |       |
| §8.6 |              |          |                                 |                        |       |

Next packet (once §5 + §8 PASS): **Phase 3-6 — Run replay/rebuild operational drill against staging data**, then **Phase 3-7 — Activate Finance v2 route for one controlled staging tenant**.
