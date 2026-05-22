# Finance Ops — Worker Service Topology

**Phase 2B-13 — Worker Service Topology Design.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Design specification — no implementation, no deployment. Design/docs only.
**Date:** 2026-05-21
**Scope:** the three Finance Ops worker services, their deployment shape on
VPS-2, their environment contract, health checks, and disabled-by-default
posture.
**Audience:** engineers who will later build and deploy the Finance Ops
workers; operators who will eventually run them.

---

## Overview

Finance Ops separates **request handling** from **background processing**.
The finance API (part of the main backend) accepts commands, validates them
through the gates, appends finance events to the persistent event store, and
returns. Everything that happens _after_ the event is appended — updating
projections, calling external accounting providers, building audit evidence —
is the job of dedicated **worker services**.

This document defines **three worker services**:

| Service                     | Drives                                | Source contract                                                |
| --------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| `finance-projection-worker` | the Projection Runtime (Runner)       | [`projection-runtime.md`](./projection-runtime.md)             |
| `finance-adapter-worker`    | the adapter job processor             | [`adapter-runtime-contract.md`](./adapter-runtime-contract.md) |
| `finance-audit-worker`      | evidence-pack / audit timeline upkeep | [`audit-evidence-layer.md`](./audit-evidence-layer.md)         |

The recommended runtime flow, per the Finance Ops scaffold decision **E2**:

```
finance-api (main backend)
  └─ append finance event   → finance.audit_events (event store)
       └─ enqueue adapter job (when the command needs a provider sync)
            └─ finance-adapter-worker
                 └─ provider sandbox / draft-only call   (NOT a live write)
                      └─ append result event             → finance.audit_events
                           └─ finance-projection-worker  → updates projections
```

`finance-audit-worker` runs alongside this flow, not inside it: it consumes the
same event stream to keep `audit_timeline` current and to produce evidence
packs on demand.

> **This phase is design only.** No worker service is implemented, no Dockerfile
> or Coolify app is created, and nothing is deployed in any environment. See
> [§9 Current status / intentional gaps](#9-current-status--intentional-gaps).

---

## Table of Contents

1. [Why Separate Worker Services (Decision E2)](#1-why-separate-worker-services-decision-e2)
2. [`finance-projection-worker`](#2-finance-projection-worker)
3. [`finance-adapter-worker`](#3-finance-adapter-worker)
4. [`finance-audit-worker`](#4-finance-audit-worker)
5. [Environment Variables](#5-environment-variables)
6. [Disabled-by-Default Posture](#6-disabled-by-default-posture)
7. [Coolify / VPS-2 Deployment Shape](#7-coolify--vps-2-deployment-shape)
8. [Health Checks](#8-health-checks)
9. [Concurrency & Idempotency](#9-concurrency--idempotency)
10. [No Provider Writes](#10-no-provider-writes)
11. [Current Status / Intentional Gaps](#11-current-status--intentional-gaps)

---

## 1. Why Separate Worker Services (Decision E2)

The Finance Ops scaffold's Phase 2 decision **E2** resolved the deployment
question explicitly:

> **E2 — Job processor deployment.** Separate Coolify worker service on VPS-2 —
> **not in-process, not Supabase cron.**

This document extends that decision from the adapter job processor to all three
worker classes. The same rationale applies to each:

**Not in-process (inside the main backend).**

- A retry storm, a rate-limited provider, or a pathological replay must not
  consume request-handling CPU. Background work isolated in its own process
  cannot starve the API event loop.
- The main backend already carries the CRM, Braid, and AI engine load. Adding
  poll loops, exponential back-off timers, and dead-letter handling to it
  couples unrelated failure domains — a worker crash should never take down the
  API, and an API restart should never drop in-flight background work.
- Workers and the API scale on different axes. The API scales with user
  traffic; the projection worker scales with event volume; the adapter worker
  scales with provider throughput and rate limits. Separate processes let each
  scale independently.

**Not Supabase cron.**

- Supabase cron (`pg_cron`) fires SQL on a fixed schedule. It cannot hold the
  Projection Runner's in-memory worker registry, run the adapter plugin
  interface, perform exponential back-off with jitter, or maintain a
  dead-letter workflow. The runtimes these workers drive are JavaScript
  contracts, not SQL.
- Cron has no concept of liveness/readiness probes, no structured logs in the
  app's logging stack, and no graceful shutdown. Operability would regress.
- Cron _may_ still have a narrow role as a **watchdog backstop** (e.g. resetting
  jobs stuck in `running` — see [§9](#9-concurrency--idempotency)), but it is
  not the primary execution model.

**Why three services, not one.**

- Each worker has a distinct failure mode and a distinct retry/back-off profile.
  Adapter jobs are at-least-once with a 5-attempt exponential back-off and a
  dead-letter escalation; projection dispatch retries 3× then degrades and waits
  for an operator; audit-evidence work is read-mostly and largely on-demand.
  Mixing them in one process means one runtime's pressure is the others' noise.
- Coolify deploys, restarts, scales, and monitors **applications** as units.
  Three apps means the adapter worker can be redeployed (e.g. to ship a new
  provider adapter) without restarting the projection worker.
- It keeps each codebase small and independently testable, consistent with the
  interface-injected, in-memory-testable posture the runtime contracts already
  assume.

**Net effect:** the API process stays light and predictable; retries,
rate-limits, and dead-letters are isolated; and each worker is a separately
deployable Coolify unit.

---

## 2. `finance-projection-worker`

### 2.1 Responsibility

`finance-projection-worker` is the **host process for the Projection Runtime
Runner** (`backend/lib/finance/projections/projectionRunner.js`). It keeps the
eight Finance Ops projection read models current by feeding finance events into
the Runner.

The [`projection-runtime.md`](./projection-runtime.md) contract is explicit
that the Runner is environment-agnostic — "in-process for Phase 2, hostable in a
separate worker service for Phase 3 with no contract change." This worker **is**
that separate host. It changes nothing about the Runner contract; it only
supplies the Runner with a poll loop and a process to live in.

The worker:

- Constructs the Runner via `createProjectionRunner({ eventStore, storeProvider })`,
  with the Postgres-backed `financeEventStore.pg.js` as `eventStore`.
- Registers every projection worker (the eight defined in
  [`projection-contracts.md`](./projection-contracts.md)).
- Runs a **catch-up poll loop**. The event-store interface
  (`append` / `query` / `replay` / `getCount`) exposes no "events appended
  after cursor" query, so the worker calls `replay(tenantId)` for the full
  ordered tenant stream and feeds every event to the Runner via
  `dispatch(event)`; the Runner's cursor guard drops already-applied events,
  making re-delivery and out-of-order delivery safe and correct. This is
  O(full tenant stream) per poll cycle — adequate for a controlled staging
  tenant. An incremental `query({ tenant_id, afterCursor })` is an additive
  interface extension required before production-scale event volumes. See
  [`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md)
  §3.1 (Phase 2C-6), which corrected this point and to which this bullet was
  reconciled.
- Exposes `replay` / `replayAll` as an operator-triggered control surface (the
  only path that clears a degraded projection — the Runner never auto-recovers).

### 2.2 Events consumed

All canonical business `finance.*` event types — `finance.journal.*`,
`finance.invoice.*`, `finance.approval.*`, `finance.adapter.*`,
`finance.governance.*`. The exact per-projection consumed-event lists are owned
by [`projection-contracts.md`](./projection-contracts.md); the worker does not
re-declare them.

The infrastructure event `finance.audit.event_appended` is **filtered out** by
the Runner before it reaches any business projection — only `audit_timeline`
may consume it, and only when explicitly opted in
(`includeInfrastructureEvents: true`). The worker inherits this filter; it does
not implement its own.

### 2.3 Relationship to the projection runtime

The worker is a **thin host**. It owns the process lifecycle, the poll loop, the
per-tenant scheduling, and the health surface. It owns **no** projection logic:
event filtering, cursor tracking, dispatch sequencing, replay orchestration, and
degraded-state tracking all live in the Runner; read-model computation lives in
the registered projection workers. This separation is the same one
`projection-runtime.md` §1–§2 already draws between the Runner and its workers —
the service is simply the outermost shell.

---

## 3. `finance-adapter-worker`

### 3.1 Responsibility

`finance-adapter-worker` is the **adapter job processor** that decision E2
calls for. It drains `finance.adapter_jobs` and drives external accounting
providers through the adapter plugin interface — **sandbox / draft-only**, never
a live finalising write (see [§10](#10-no-provider-writes)).

Per [`adapter-runtime-contract.md`](./adapter-runtime-contract.md) §8 and §10,
the worker:

- Polls `finance.adapter_jobs WHERE status = 'queued' AND next_attempt_at <= now()`.
- Claims each job with an **optimistic lock** (`UPDATE ... WHERE status = 'queued'
RETURNING *`) so concurrent processors never double-claim.
- Loads the tenant's provider connection config from
  `tenant_integrations.api_credentials`, calls `assertWritePermitted(job, ...)`
  (the write guard), then dispatches to the adapter plugin method.
- On success → `status = 'succeeded'`; on a transient throw → `status = 'failed'`
  and re-queues with exponential back-off + jitter (5 attempts max); on the
  final attempt → permanent failure, emits `finance.adapter.sync_failed` with
  `permanent: true`, and **creates a `finance.approvals` record with
  `target_type = 'adapter_job'`** for human review — this is the dead-letter
  path.
- Runs a **stuck-job watchdog**: any job in `running` for more than 5 minutes is
  reset to `queued` (attempt count unchanged).

### 3.2 Events consumed and emitted

The adapter worker is **not** an event-stream consumer in the projection sense —
it is driven by rows in `finance.adapter_jobs`. It **emits** finance events as a
result of job execution: `finance.adapter.sync_queued` (at enqueue, by the API),
`finance.adapter.sync_succeeded`, and `finance.adapter.sync_failed`. Those
emitted events are what `finance-projection-worker` (and the `adapter_queue`
projection in particular) later consume.

All emitted events use the standard envelope with `aggregate_type = 'adapter_job'`
and `aggregate_id = adapter_jobs.id` — the frozen Track A envelope. The worker
never invents `object_type` / `object_id` fields.

### 3.3 Relationship to the adapter runtime

`adapter-runtime-contract.md` is the **authoritative** contract for the job
lifecycle state machine, the write guard, the retry policy, the canonical
mapping, and event emission. This worker is the **process that runs that
contract**. It does not redefine any of it; it supplies the poll loop, the
optimistic-lock claim, the watchdog timer, and the process the adapter plugins
load into. Decision **E2** and its "E2 implications" section in
`adapter-runtime-contract.md` describe exactly this service.

---

## 4. `finance-audit-worker`

### 4.1 Responsibility

`finance-audit-worker` keeps the audit and evidence layer
([`audit-evidence-layer.md`](./audit-evidence-layer.md)) operational without
loading that work onto the API or the projection worker. It covers:

- **`audit_timeline` upkeep.** `audit_timeline` is the one projection permitted
  to consume the infrastructure event `finance.audit.event_appended`. Driving it
  can be hosted here (with `includeInfrastructureEvents: true`) so that
  infrastructure-event handling is isolated from the business projections that
  `finance-projection-worker` drives. Alternatively `audit_timeline` stays in
  `finance-projection-worker` and the audit worker focuses purely on evidence
  packs — this is an implementation choice deferred to build time; the contract
  permits either.
- **Evidence-pack generation.** `buildEvidencePack()` is a read-only,
  potentially expensive operation (hashing a sorted event slice, assembling a
  state timeline). Running it in a worker keeps a large evidence export from
  blocking an API request. The worker would service evidence-pack requests
  asynchronously and record each request to `audit_pack_requests` (per
  `audit-evidence-layer.md` §7.2).
- **Chain-of-custody / reversal-chain materialisation** (optional, later) —
  precomputing `getReversalChain` results for hot aggregates.

### 4.2 Events consumed

The full business `finance.*` stream (read-only, for evidence assembly) **and**
the infrastructure event `finance.audit.event_appended` — the audit worker is
the only worker permitted to consume the latter, and only via the explicit
opt-in described in `projection-runtime.md` §13. The audit worker **never
mutates** `finance.audit_events`; the table is append-only and immutable at the
DB layer ([`event-store-persistence.md`](./event-store-persistence.md) §7).

### 4.3 Relationship to the audit-evidence layer

`audit-evidence-layer.md` defines _what_ an audit event, an evidence pack, and a
chain of custody are. `finance-audit-worker` is _where_ the non-request-path
parts of that layer run. The worker holds no new contract — it is the execution
home for `queryAuditTimeline` / `buildEvidencePack` / `getReversalChain` when
those run as background jobs rather than synchronous API calls.

---

## 5. Environment Variables

All three workers share a common configuration core and add per-worker tuning.
**Every enable flag defaults to disabled.** A worker that finds Finance Ops
disabled, or its own enable flag unset, **starts, logs that it is disabled, and
idles** — it never polls, never claims jobs, never calls a provider.

### 5.1 Global gate

| Variable             | Purpose                                                                                                                                              | Default              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `ENABLE_FINANCE_OPS` | Master runtime gate for all Finance Ops, enforced by `financeRuntimeGate.js`. Every worker checks this first; if it is not truthy, the worker idles. | **disabled** (unset) |

### 5.2 Per-worker enable flags

| Variable                           | Purpose                                                       | Default              |
| ---------------------------------- | ------------------------------------------------------------- | -------------------- |
| `ENABLE_FINANCE_PROJECTION_WORKER` | Enables the `finance-projection-worker` poll loop.            | **disabled** (unset) |
| `ENABLE_FINANCE_ADAPTER_WORKER`    | Enables the `finance-adapter-worker` job-claim loop.          | **disabled** (unset) |
| `ENABLE_FINANCE_AUDIT_WORKER`      | Enables the `finance-audit-worker` audit/evidence processing. | **disabled** (unset) |

A worker runs only when **both** `ENABLE_FINANCE_OPS` **and** its own
per-worker flag are truthy. Either one unset → idle.

### 5.3 Event store / database connection

| Variable                          | Purpose                                                                                                                  | Default                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `FINANCE_DB_URL`                  | Postgres connection string for the finance schema (`finance.audit_events`, `finance.adapter_jobs`). Injected by Doppler. | (none — required when enabled) |
| `FINANCE_DB_POOL_MAX`             | Max connections in the worker's `pg.Pool` (the pool is dependency-injected into `financeEventStore.pg.js`).              | `5`                            |
| `FINANCE_DB_STATEMENT_TIMEOUT_MS` | Per-statement timeout for worker queries.                                                                                | `30000`                        |

The event store is the durable Postgres-backed `finance.audit_events` table
([`event-store-persistence.md`](./event-store-persistence.md)). Workers are
event-store backend-agnostic; they depend on the
`append`/`query`/`replay`/`getCount` interface, not the backend.

### 5.4 Polling and batching

| Variable                          | Purpose                                                                     | Default |
| --------------------------------- | --------------------------------------------------------------------------- | ------- |
| `FINANCE_WORKER_POLL_INTERVAL_MS` | Idle wait between poll cycles when the last cycle found no work.            | `5000`  |
| `FINANCE_WORKER_BATCH_SIZE`       | Max events (projection) or jobs (adapter) claimed/processed per poll cycle. | `100`   |
| `FINANCE_PROJECTION_TENANT_BATCH` | Max tenants the projection worker advances per poll cycle.                  | `25`    |

### 5.5 Retry / back-off

These mirror the contracts they belong to and are surfaced as env vars only for
operational tuning — they do **not** override the contract defaults unless set.

| Variable                          | Purpose                                                                                             | Default            |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ |
| `FINANCE_ADAPTER_MAX_ATTEMPTS`    | Max adapter-job attempts before permanent failure / dead-letter (`adapter-runtime-contract.md` §3). | `5`                |
| `FINANCE_ADAPTER_BACKOFF_BASE_MS` | Base for the adapter exponential back-off (`2^attempts × base`, capped, plus jitter).               | `15000`            |
| `FINANCE_ADAPTER_BACKOFF_CAP_MS`  | Upper bound on adapter back-off delay.                                                              | `1800000` (30 min) |
| `FINANCE_ADAPTER_STUCK_JOB_MS`    | A job in `running` longer than this is reset to `queued` by the watchdog.                           | `300000` (5 min)   |
| `FINANCE_PROJECTION_MAX_ATTEMPTS` | Per-event handler attempts before a projection is marked `degraded` (`projection-runtime.md` §4).   | `3`                |
| `FINANCE_PROJECTION_BACKOFF_MS`   | Base for the projection per-event retry back-off.                                                   | `50`               |

### 5.6 Observability

| Variable                      | Purpose                                                         | Default |
| ----------------------------- | --------------------------------------------------------------- | ------- |
| `FINANCE_WORKER_HEALTH_PORT`  | Port the worker's `/health` / `/ready` HTTP surface listens on. | `9090`  |
| `FINANCE_WORKER_LOG_LEVEL`    | Worker log verbosity (`error` / `warn` / `info` / `debug`).     | `info`  |
| `FINANCE_WORKER_HEARTBEAT_MS` | Interval at which the worker updates its liveness heartbeat.    | `15000` |

> **No provider-credential or OAuth env vars appear here.** Provider connection
> config is loaded per-tenant from `tenant_integrations.api_credentials` at
> runtime ([`adapter-runtime-contract.md`](./adapter-runtime-contract.md) §6).
> Because the adapter worker is sandbox/draft-only and no provider client is
> built in this phase, no provider secrets are introduced (see [§10](#10-no-provider-writes)).

---

## 6. Disabled-by-Default Posture

Finance Ops is **disabled by default and stays that way** until an explicit,
separate release decision. The worker services do not change that posture — they
strengthen it with a second layer of off-switches.

- **`ENABLE_FINANCE_OPS` defaults to disabled** (unset). This is the existing
  master gate, enforced by `financeRuntimeGate.js`. No worker does anything
  while it is unset.
- **Each per-worker flag also defaults to disabled.** Even with
  `ENABLE_FINANCE_OPS` somehow enabled, a worker without its own flag set idles.
- **Workers may exist as code without being deployed.** The intended state for
  the foreseeable future: the worker source lives in the repo, is unit-tested
  with in-memory backends, and **is not deployed as a running Coolify app in any
  environment.** "Code merged" is not "service running."
- **No staging or production activation.** These workers must not be deployed or
  enabled on VPS-1 (staging) or Hetzner (production). The only place a worker
  may run is a **local/dev environment**, with both flags explicitly set, for
  development and testing.
- **A disabled worker is a no-op, not an error.** A worker that starts with
  Finance Ops disabled logs a single clear line (`finance ops disabled — worker
idling`), reports healthy-but-idle on its health surface, and consumes no DB
  connections or CPU beyond the idle heartbeat. It does not crash-loop and does
  not need to be removed.

This matches the posture already stated across the suite:
`event-store-persistence.md` ("Finance Ops stays disabled in staging/prod"),
`adapter-runtime-contract.md` ("defaults to absent (off)"), and the migration
docs ("do not apply to staging/production").

---

## 7. Coolify / VPS-2 Deployment Shape

> **Description only.** This section describes how the workers _would_ be
> deployed when a future gate opens. No Dockerfile, no `docker-compose`, no
> Coolify app, and no Coolify config is created in this phase.

### 7.1 Where workers run

Per [`DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md), the host roles are fixed:

- **VPS-1 = Staging.** App services. CPU-capped at 5.5 cores by the hypervisor;
  build pressure there has wedged the host before.
- **VPS-2 = Services.** The Coolify control plane, plus Cal.com, Uptime Kuma,
  Gitea. `DEPLOY_TOPOLOGY.md` states app services deploy to **VPS-1 or
  Hetzner**, never VPS-2; infra/tooling deploys to **VPS-2**.

The task brief specifies VPS-2 as the worker host, consistent with decision
E2's "separate Coolify worker service on VPS-2." Finance Ops workers sit in a
deliberate middle ground: they are **not** user-facing app services and they
are **not** part of the request path — they are background processing units.
Treating them as VPS-2 services keeps adapter retry/back-off load and projection
replay load **off the CPU-capped staging VPS-1**, which is the core motivation
behind E2. When this is actioned, the VPS-1-vs-VPS-2 placement should be
re-confirmed against `DEPLOY_TOPOLOGY.md` as the authoritative deploy doc, and
that doc updated to record the worker apps in its app↔role table.

### 7.2 App ↔ role mapping

Each worker is a **separate Coolify application** — its own app slug, its own
deploy trigger, its own env var set, its own restart/scale controls. Indicative
shape (names illustrative; not yet created):

| Coolify app (proposed)      | Worker service              | Role                                             |
| --------------------------- | --------------------------- | ------------------------------------------------ |
| `finance-projection-worker` | `finance-projection-worker` | Projection Runtime host (poll → dispatch/replay) |
| `finance-adapter-worker`    | `finance-adapter-worker`    | Adapter job processor (claim → adapter → emit)   |
| `finance-audit-worker`      | `finance-audit-worker`      | Audit-timeline upkeep + evidence-pack generation |

Each app is a long-running Node process — **not** an HTTP app behind Traefik for
its primary function (it has no public FQDN), though it exposes a small internal
health port ([§8](#8-health-checks)). Env vars ([§5](#5-environment-variables))
are injected via Doppler / Coolify env settings, with every enable flag left
unset by default. Following the `DEPLOY_TOPOLOGY.md` "pre-built images in CI,
deploy = pull" guidance avoids running build CPU on the VPS.

### 7.3 When this happens (the later gate)

Deploying these apps is **explicitly out of scope now**. It happens only after a
separate release decision, gated on the same checklist that gates the rest of
Finance Ops:

- the Track F migration readiness checklist
  ([`security-rls-hardening.md`](./security-rls-hardening.md) §6) clears;
- finance RLS is finalised and applied;
- `ENABLE_FINANCE_OPS` is deliberately enabled for the target environment.

Until then the workers exist (if at all) as code only. No Coolify app is created
in advance.

---

## 8. Health Checks

Each worker exposes a minimal HTTP health surface on
`FINANCE_WORKER_HEALTH_PORT` (internal only — not routed through Cloudflare /
Traefik). Two endpoints, plus a heartbeat:

### 8.1 Liveness — `GET /health`

Answers "is the process alive and its event loop responsive?" Returns `200` as
long as the process can serve the request and its heartbeat timer is firing
within `FINANCE_WORKER_HEARTBEAT_MS`. A liveness failure means the process
should be restarted by Coolify.

### 8.2 Readiness — `GET /ready`

Answers "is the worker doing its job correctly?" Returns a JSON body and a
`200` (healthy) or `503` (unhealthy) status. The signals differ per worker:

| Signal                    | `finance-projection-worker`                                       | `finance-adapter-worker`                                             | `finance-audit-worker`                           |
| ------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| Disabled posture          | `enabled: false` → reports **healthy-but-idle** (200)             | same                                                                 | same                                             |
| DB reachability           | event store `getCount` succeeds                                   | `finance.adapter_jobs` query succeeds                                | event store query succeeds                       |
| Last-processed cursor age | max age across all `(projection, tenant)` cursors vs newest event | n/a (job-driven)                                                     | `audit_timeline` cursor age (if hosted here)     |
| Oldest unclaimed work     | n/a                                                               | age of oldest `queued` job past its `next_attempt_at`                | age of oldest pending evidence-pack request      |
| Degraded count            | count of `(projection, tenant)` pairs in `degraded` state         | count of permanently-failed jobs awaiting human review (dead-letter) | n/a                                              |
| Heartbeat freshness       | last poll-cycle timestamp within threshold                        | last claim-cycle timestamp within threshold                          | last processing-cycle timestamp within threshold |

### 8.3 Healthy vs unhealthy

**Healthy** (`200`):

- Disabled and idling (the default posture) — explicitly a healthy state.
- Enabled, DB reachable, heartbeat fresh, cursor age / oldest-unclaimed-work
  within thresholds, degraded/dead-letter counts at or below their alert
  thresholds.

**Unhealthy** (`503`):

- DB unreachable, or the poll/claim loop has not completed a cycle within a
  multiple of its interval.
- Last-processed cursor age exceeds threshold while events are pending — the
  worker is enabled but falling behind.
- One or more projections are `degraded`, or adapter jobs sit in the
  dead-letter state — these surface as unhealthy/`warn` so monitoring (Uptime
  Kuma on VPS-2) alerts an operator. Recovery for both is **operator-triggered**
  (`projection-runtime.md` §11; `adapter-runtime-contract.md` §3) — the health
  surface only reports; it never auto-recovers.

A degraded projection or a dead-lettered job is a **deliberately visible**
condition. The health surface is how it becomes observable.

---

## 9. Concurrency & Idempotency

The worker services introduce no new concurrency or idempotency contract — they
**run the existing ones**. This section points to the source contracts; it does
not redefine them.

- **Per-`(projection, tenant)` serialization.** The Projection Runner already
  serializes dispatch and replay per `(projection, tenant)` pair via its
  internal chain map (`projection-runtime.md` §4; `projectionRunner.js`
  `runExclusive`). Different tenants and different projections proceed
  concurrently. `finance-projection-worker` must run **one Runner instance per
  process** so this serialization holds; it must not shard the same
  `(projection, tenant)` pair across two processes.
- **Adapter-job idempotency.** Adapter jobs are at-least-once. Claiming uses an
  optimistic lock so two `finance-adapter-worker` instances never double-claim a
  job (`adapter-runtime-contract.md` §3, "Job processor invariants"). Every
  adapter operation must be idempotent across retries — provider idempotency
  keys where available, otherwise a `syncStatus`/`fetchObject` pre-check. The
  job processor checks job status before emitting a result event so a retry does
  not append a duplicate `finance.adapter.sync_succeeded`.
- **Event-store idempotency.** The event store never deduplicates; `append` is a
  plain insert and a duplicate `id` is rejected, not merged
  (`event-store-persistence.md` §8). Exactly-once _effect_ is achieved by the
  Runner's cursor plus idempotent projection handlers
  (`projection-runtime.md` §7), not by the store.
- **Dead-letter handling.** A permanently-failed adapter job (5 attempts
  exhausted) is not silently dropped: `finance.adapter.sync_failed` is emitted
  with `permanent: true` and a `finance.approvals` record with
  `target_type = 'adapter_job'` is created for human review
  (`adapter-runtime-contract.md` §3). A degraded projection is the projection
  analogue — dispatch pauses and the cursor freezes until an operator triggers a
  replay (`projection-runtime.md` §11). Both are operator-resolved by design.
- **Stuck-work recovery.** `finance-adapter-worker` runs a watchdog that resets
  any job stuck in `running` past `FINANCE_ADAPTER_STUCK_JOB_MS` back to
  `queued`. A Supabase cron job _may_ serve as a backstop for this single
  narrow task, but it is not the primary execution model (see [§1](#1-why-separate-worker-services-decision-e2)).

**Envelope discipline.** Every event a worker emits uses the frozen Track A
envelope: `aggregate_type` / `aggregate_id` for the event subject, and
`target_type` / `target_id` for approval linkage. Workers must **not** introduce
`object_type` / `object_id` — that drift is explicitly disallowed across the
Finance Ops suite.

---

## 10. No Provider Writes

`finance-adapter-worker` remains **sandbox / draft-only** in this phase and
until a future, explicit gate:

- **No live finalising writes.** The adapter worker may, when eventually
  enabled in a dev environment, call provider sandboxes via `pushDraft` only —
  creating non-finalised records (QuickBooks Estimate, ERPNext draft, Xero draft
  invoice, NetSuite Estimate). `pushFinal` and `void` (the writes that finalise,
  post, or delete provider records) require `approval_required_write` mode and
  an approved `finance.approval` record, and remain gated behind a future
  decision.
- **No provider clients or OAuth in this phase.** This design introduces **no
  OAuth flow, no provider HTTP client, and no provider credentials**. The
  adapter plugin implementations and their `PROVIDER_OBJECT_MAP`s are Phase 2
  work tracked in `adapter-runtime-contract.md` §8 — not delivered here. The
  worker is designed as the _host_ for those plugins; the plugins themselves do
  not yet exist.
- **The write guard always runs.** Even sandbox/draft-only, the worker calls
  `assertWritePermitted` as the first step of every job. The four-layer safety
  stack (`ENABLE_FINANCE_OPS` → module gate → governance → write guard) is never
  bypassed.
- **AI actors cannot move money.** The governance policy
  `finance.ai.no_money_movement` independently blocks AI actors from approving
  or posting, regardless of adapter mode. This is unchanged by the worker
  topology.

The promotion from draft-only to any finalising write is a separate, explicit
decision — not part of this document and not part of this phase.

---

## 11. Current Status / Intentional Gaps

**This is a design document. Nothing described here is built or deployed.**

- **No worker service exists.** `finance-projection-worker`,
  `finance-adapter-worker`, and `finance-audit-worker` are design names. No
  process, entry point, or service module is implemented in this phase.
- **No deployment artifacts.** No Dockerfile, no `docker-compose` service, no
  Coolify application, and no Coolify env configuration is created. The §7
  deployment shape is descriptive only.
- **Nothing runs in any environment.** No worker runs in staging (VPS-1),
  production (Hetzner), or — until explicitly enabled — local/dev. Every enable
  flag (`ENABLE_FINANCE_OPS` and all three per-worker flags) defaults to
  disabled.
- **No provider integration.** No OAuth, no provider HTTP client, no provider
  credentials. The adapter worker, when eventually built, is sandbox/draft-only.
- **The runtimes the workers would host already partly exist.** The Projection
  Runner (`projectionRunner.js`) and the Postgres event store
  (`financeEventStore.pg.js`) are implemented; the adapter job processor is not.
  This document defines the _service shells_ that would host them — it does not
  implement those shells.
- **Open for build time:** whether `audit_timeline` is driven inside
  `finance-projection-worker` or `finance-audit-worker`; the exact poll-loop
  scheduling fairness across tenants; and whether a single watchdog cron or an
  in-worker timer owns stuck-job recovery. None of these block the design.

This document is the contract a future Phase will implement against. It changes
no code and deploys nothing.

---

_This document is part of the Finance Ops architecture suite. Related:
[`projection-runtime.md`](./projection-runtime.md) (Projection Runtime),
[`projection-contracts.md`](./projection-contracts.md) (Track B — Projection
Contracts), [`adapter-runtime-contract.md`](./adapter-runtime-contract.md)
(Track E — Adapter Runtime), [`event-store-persistence.md`](./event-store-persistence.md)
(Phase 2B — Event Store Persistence), [`audit-evidence-layer.md`](./audit-evidence-layer.md)
(Track D — Audit / Evidence Layer), and [`../DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md)
(authoritative deploy topology)._
