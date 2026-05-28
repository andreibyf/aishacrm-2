# Finance Ops — Phase 2C-6: Projection Worker Staging Activation Plan

**Phase 2C-6 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Activation plan — projection worker stays disabled. No staging activation performed by this document.
**Date:** 2026-05-22
**Related:** [`projection-runtime.md`](./projection-runtime.md) · [`worker-service-topology.md`](./worker-service-topology.md) §2 · [`persistent-projection-store-plan.md`](./persistent-projection-store-plan.md) (2C-4) · [`finance-worker-deployment-config.md`](./finance-worker-deployment-config.md) (2C-5)

---

## 1. Goal and Scope

Define how `finance-projection-worker` runs in **staging** — **without changing
any runtime semantics**. The projection worker is a _thin host_ for the
Projection Runtime Runner (`projection-runtime.md`); this document is the
operational plan for hosting it in a staging process, not a redesign.

Nothing here alters the Runner contract, the worker interface, the cursor
semantics, the replay algorithm, or the event taxonomy. Those are frozen. 2C-6
only specifies _where_ the Runner runs in staging, _how_ it is turned on, and
_how_ it is turned off.

---

## 2. The Projection Worker Is a Thin Host

`worker-service-topology.md` §2.3 already establishes this: the worker owns the
process lifecycle, the poll loop, per-tenant scheduling, and the health surface.
It owns **no** projection logic — event filtering, cursor tracking, dispatch
sequencing, replay orchestration, and degraded-state tracking all live in the
Runner; read-model computation lives in the registered projection workers.

Consequently, "running the projection worker in staging" changes **nothing**
about correctness. A projection rebuilt in a staging worker process is
byte-identical to one built in-process during Phase 2B, because it is the same
Runner running the same ordered event stream. The staging worker only supplies
the Runner a process to live in and a poll loop to feed it.

---

## 3. Event Source — `finance.audit_events`

The staging projection worker consumes the **persistent** event store, not the
in-memory one:

- It constructs the Runner via `createProjectionRunner({ eventStore, storeProvider })`
  with the Postgres-backed `financeEventStore.pg.js` as `eventStore` — backed by
  `finance.audit_events` (see `event-store-persistence.md`).
- The Runner consumes events through the frozen `append`/`query`/`replay`/`getCount`
  interface; it is event-store backend-agnostic (`projection-runtime.md` §14).

### 3.1 Catch-up via `replay()` — and a known interface gap

The worker runs a **catch-up poll loop**. A precise note on _how_, given the
event-store interface as it actually exists today:

- `financeEventStore` exposes exactly `append` / `query` / `replay` /
  `getCount`. **It does not expose an "events appended after cursor
  `(created_at, id)`" query.** `replay(tenantId)` returns the _full_ ordered
  tenant stream; `query(...)` filters only by equality on
  `event_type` / `aggregate_type` / `aggregate_id` (plus `limit`) — neither
  takes an after-position argument. (The in-memory `query` has a `fromIndex`
  array offset, but it is an in-memory array index, is absent from the Postgres
  adapter, and is not a portable stream cursor.)
- **Therefore the staging catch-up loop uses `replay(tenantId)`** — it fetches
  the full ordered tenant stream each poll cycle and feeds every event to the
  Runner via `dispatch(event)`. The Runner's cursor guard
  (`projection-runtime.md` §6) drops every event whose position is not strictly
  greater than the persisted cursor, so re-feeding the whole stream is **safe
  and correct**: already-applied events are no-ops; a projection advances only
  on genuinely new events.
- This is **correct but not efficient at scale** — it is O(full tenant stream)
  per poll cycle. For Phase 2C (one controlled staging tenant, low event
  volume) that cost is negligible and acceptable.
- **Known gap / prerequisite for production scale:** an incremental
  `eventStore.query({ tenant_id, afterCursor })` (or a `replaySince(tenantId,
cursor)`) is required before the projection worker runs at production event
  volumes. It is a purely **additive** interface extension — it changes no
  existing method and no event semantics — and is explicitly scoped **out of
  Phase 2C**. The same after-cursor assumption appears in
  `worker-service-topology.md` §2.1; that wording should be reconciled to this
  `replay`-based interim plan when the worker is implemented.

The worker does **not** read or mutate `finance.audit_events` for any other
purpose. That table is append-only and immutable at the DB layer (migration 173
triggers); the projection worker is a pure reader of it.

---

## 4. Updating Projection State

Projection read models and cursors persist to **`finance.projection_state`** —
the Postgres store decided in [`persistent-projection-store-plan.md`](./persistent-projection-store-plan.md)
(2C-4), accessed through a Postgres-backed `ProjectionStoreProvider`.

- A successful `handleEvent` advances the `(projection, tenant)` cursor
  (`cursor_event_id` / `cursor_created_at`) and commits the read-model change to
  `state_json`.
- A `replay` rebuilds into a shadow and **atomically promotes** it — a single
  `UPDATE` of the `finance.projection_state` row (2C-4 §5.1).
- Because cursors are durable, a worker restart or staging redeploy resumes
  strictly after the last applied event — no cold rebuild storm.

Until migration 174 is applied to staging, the worker may run against the
in-memory store provider for a first dry pass; the persistent store is the
intended staging configuration and is gated with 172/173 (2C-4 §4.2).

---

## 5. Replay Ordering Is Preserved

The worker changes nothing about ordering. The Runner consumes events in the
**frozen Track A total order** — `created_at` ASC, event `id` (bare UUID) as the
deterministic tie-break (`projection-runtime.md` §8). The event store returns
that order directly (`finance.audit_events` replay index, migration 173:
`(tenant_id, created_at, id)`); the Runner does not re-sort, and the worker does
not re-order. Live dispatch and replay use the identical order, so a
live-updated projection and a replayed one converge to the same state.

---

## 6. Tenant-Scoped Event Streams

- Projection stores, cursors, and `ProjectionState` rows are partitioned by
  `tenant_id` (`projection-runtime.md` §10; `finance.projection_state` PK
  `(projection_name, tenant_id)`).
- `financeEventStore.replay(tenantId)` / `query` resolve to `WHERE tenant_id = $1`,
  so a per-tenant rebuild reads only that tenant's events — cross-tenant
  contamination is structurally impossible.
- The staging worker processes **one controlled tenant** (see Section 8). Its
  poll loop and replay calls are always scoped to that tenant; no global,
  cross-tenant dispatch exists.

---

## 7. Infrastructure Event Filtering

`finance.audit.event_appended` is a reserved internal infrastructure event, not
a business event. The Runner's infrastructure-event filter
(`projection-runtime.md` §5, §13) drops it before dispatch:

- **Business projections never receive it** — `ledger`, `profit_loss`,
  `balance_sheet`, `approval_queue`, `adapter_queue`, `cash_position`,
  `executive_summary` — even if a worker erroneously lists it in `consumedEvents`.
- **It never advances a business-projection cursor.**
- Only `audit_timeline` may consume it, and only with
  `includeInfrastructureEvents: true`. In the recommended staging topology
  `audit_timeline` and infrastructure-event handling are hosted by
  `finance-audit-worker` (2C-7), keeping `finance-projection-worker` purely on
  business projections.

The staging worker **inherits** this filter from the Runner; it implements no
filtering of its own and cannot override it.

---

## 8. Staging Activation

### 8.1 Preconditions

- The staging-readiness gate (`phase-2c-rls-application-plan.md` §7) has cleared:
  migrations 172, 173, 174, and the companion RLS migration are applied to
  staging.
- The controlled staging tenant is selected ([`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md), 2C-13).
- Observability is in place ([`observability-alerting.md`](./observability-alerting.md), 2C-11).

### 8.2 Enabling — staging only

The worker is enabled by the three-tier gate (`finance-worker-deployment-config.md`
§3.1), set **only** in the staging environment:

```
ENABLE_FINANCE_OPS=true
ENABLE_FINANCE_WORKERS=true
ENABLE_FINANCE_PROJECTION_WORKER=true
```

All three default to `false`. The worker **starts disabled** in every
environment and idles until all three are explicitly truthy. Production
(Hetzner) keeps every flag unset — this worker is never enabled there by 2C.

### 8.3 First run

On first run for the controlled tenant, no `finance.projection_state` row
exists for any projection — the Runner treats that as the first-build trigger
(`projection-runtime.md` §9) and runs an initial `replay` per projection from
the event stream, writing the first rows. Steady-state catch-up dispatch
follows.

---

## 9. Degraded Projections

A projection becomes `degraded` when a live `handleEvent` exhausts its 3 retries,
or a `replay` fails (`projection-runtime.md` §11). The staging worker's behavior
is exactly the Runner's contract — unchanged:

- **Dispatch pauses** for that `(projection, tenant)`. Later events are not
  delivered and the cursor does not advance. The failed event applied nothing
  (its handler ran against an isolated buffer that was discarded), so the live
  store sits at the last fully-applied event.
- **Reads continue** from the last-good store — stale but internally consistent,
  flagged `meta.is_degraded = true`.
- **The degraded state persists** — `status = 'degraded'` and `degraded_reason`
  are written to the `finance.projection_state` row (2C-4 §5.3), surviving
  worker restarts.
- **Recovery is operator-triggered only.** The Runner never auto-replays. A
  degraded projection is cleared exclusively by an operator-initiated `replay`,
  which rebuilds from the event stream — including the previously failed event
  and every event paused after it. The worker exposes `replay` / `replayAll` as
  an operator control surface (`worker-service-topology.md` §2.1).

This is intentional: a degraded projection signals possible read-model
divergence or a real handler defect. Automatic replay would mask the failure and
risk a replay loop.

---

## 10. Observable Degraded State

The degraded condition must be **visible**, not silent:

- **Persisted** — `finance.projection_state.status = 'degraded'` +
  `degraded_reason`.
- **Health surface** — `GET /ready` returns `503` with the count of
  `(projection, tenant)` pairs in `degraded` state
  (`worker-service-topology.md` §8.2).
- **Read path** — `getProjection` results carry `meta.is_degraded = true` so any
  UI consuming the projection shows a staleness warning.
- **Alerting** — degraded-projection count is a required observability signal
  ([`observability-alerting.md`](./observability-alerting.md) 2C-11); Uptime Kuma
  on VPS-2 alerts an operator off the `/ready` status.

The replay/rebuild drill ([`replay-rebuild-operational-drill.md`](./replay-rebuild-operational-drill.md),
2C-12) exercises the full degrade → detect → operator-replay → recover loop in
staging-like conditions.

---

## 11. Rollback / Disable

Disabling the projection worker is a one-step, non-destructive operation:

- Set any one of the three gate flags to `false` (the cleanest is
  `ENABLE_FINANCE_PROJECTION_WORKER=false`) and redeploy the worker app. The
  worker idles; it stops polling and dispatching.
- **No data is lost or corrupted.** `finance.audit_events` is untouched (the
  worker is a pure reader of it). `finance.projection_state` simply stops
  advancing — its rows remain a valid snapshot at the last applied cursor.
- Re-enabling resumes catch-up dispatch strictly after the persisted cursor; a
  full `replay` is available but not required.
- Projections are derived read models — if `finance.projection_state` is ever
  suspect, it can be truncated for the controlled tenant and rebuilt by
  `replayAll(tenantId)`. The event stream remains the source of truth.

---

## 12. Acceptance Criteria — Self-Check

| 2C-6 acceptance criterion                                                | Status                                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Projection worker starts disabled                                        | ✅ Section 8.2 — three-tier gate, all flags default `false`; worker idles until explicitly enabled.  |
| Can be enabled in staging only                                           | ✅ Section 8.2 — gate flags set only in staging; production keeps every flag unset.                  |
| Processes tenant-scoped event streams                                    | ✅ Section 6 — per-tenant cursors and `WHERE tenant_id = $1` reads; one controlled tenant.           |
| Does not process `finance.audit.event_appended` for business projections | ✅ Section 7 — Runner infrastructure-event filter; inherited, non-overridable.                       |
| Emits observable degraded state                                          | ✅ Sections 9–10 — persisted `status`/`degraded_reason`, `/ready` 503, `meta.is_degraded`, alerting. |

---

_Part of the Finance Ops architecture suite. Related: `projection-runtime.md`,
`worker-service-topology.md` (2B-13), `persistent-projection-store-plan.md`
(2C-4), `finance-worker-deployment-config.md` (2C-5), `audit-worker-staging-plan.md`
(2C-7), `replay-rebuild-operational-drill.md` (2C-12)._
