# Finance Ops — Phase 2C-4: Persistent Projection Store Decision and Migration Plan

**Phase 2C-4 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Decision finalized. Migration `174_finance_projection_state_draft.sql` is a DRAFT — not applied to any environment.
**Date:** 2026-05-22
**Related:** [`projection-runtime.md`](./projection-runtime.md) §3 · [`event-store-persistence.md`](./event-store-persistence.md) · [`worker-service-topology.md`](./worker-service-topology.md) §2 · [`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md) (2C-6)

---

## 1. Goal

Decide how Finance Ops projection state persists **beyond** the current
in-memory projection store (`projectionStore.memory.js`), and draft the migration
that backs that decision — without applying it anywhere.

Today every projection read model and every `(projection, tenant)` cursor lives
only in process memory. That is correct for Phase 2B (in-process Runner, tests,
local dev) but unacceptable for a staging worker service: a worker restart would
lose every cursor and every degraded flag, forcing a full cold rebuild of all
projections for all tenants on each deploy.

This document introduces **no new finance-domain semantics**. It adds a durable
backing store for state the runtime already computes.

---

## 2. Decision

| Option                                                     | Description                                                                       | Decision                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| **A — Postgres `finance.projection_state`**                | Canonical projection snapshots + cursors persisted as rows in the finance schema. | **SELECTED**                              |
| B — Redis cache with rebuild fallback                      | Projection state in Redis; rebuild from the event stream on a miss.               | Rejected for v1.                          |
| C — Hybrid: Postgres canonical snapshots + Redis hot cache | Postgres as the durable record, Redis as a read accelerator.                      | Deferred — a future optimization, not v1. |

**Decision: Option A — a Postgres `finance.projection_state` table.** This
follows the 2C recommended default ("use Postgres first unless there is a strong
reason not to") and there is no such reason.

### 2.1 Rationale

- **One consistency and durability domain.** The event store is already
  Postgres (`finance.audit_events` — see `event-store-persistence.md`). Keeping
  projection snapshots in the same database means one backup, one
  point-in-time-recovery story, one connection pool, and no cross-store
  consistency problem between "where the events are" and "where the cursors
  are."
- **Degraded status must persist (a 2C-4 acceptance criterion).** A degraded
  projection is a deliberately visible, operator-resolved condition
  (`projection-runtime.md` §11). If degraded state lived only in Redis, a Redis
  flush or eviction would silently clear it — a worker would resume dispatch on
  a projection that an operator never recovered. A Postgres row makes degraded
  state durable by construction.
- **Cursors must survive worker restarts.** The cursor is the authority for
  once-delivery (`projection-runtime.md` §6). Persisting it in Postgres means a
  restarted `finance-projection-worker` resumes strictly after the last applied
  event instead of cold-rebuilding every projection.
- **Replay can always rebuild.** The persisted snapshot is a _durable cache_ of
  derived state, never a source of truth — the event stream is. `replay()` can
  reconstruct any projection from `finance.audit_events` at any time
  (`projection-runtime.md` §9). Postgres durability simply avoids paying that
  rebuild cost on every restart.
- **The runtime contract already anticipates this.** `projection-runtime.md` §3
  states the store backend is pluggable ("an in-memory `Map` for Phase 2 … Redis
  or Postgres JSONB later") and that a Postgres-backed `promoteShadow` should
  "build into a staging namespace and swap within a transaction." Option A is
  the realization of that already-designed seam — not a new contract.
- **Redis (Option B) rejected** because ephemerality directly conflicts with the
  degraded-state durability requirement, and a rebuild-on-miss path adds a
  failure mode (silent cold rebuild storms) without a corresponding v1 benefit.
- **Hybrid (Option C) deferred** because a Redis read accelerator is only worth
  its operational complexity once projection read latency is a measured problem.
  It is not, at one controlled staging tenant. Option A does not preclude C — a
  Redis hot cache can be layered on later behind the same `ProjectionStoreProvider`
  interface with no schema change.

---

## 3. Table Shape

One row per `(projection_name, tenant_id)` pair. The row carries **both** the
serialized read model (`state_json`) and the runtime metadata (the
`ProjectionState` of `projection-runtime.md` §3).

| Column              | Type          | Maps to                             | Notes                                                                                                                                                                                                                                        |
| ------------------- | ------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projection_name`   | `text`        | worker `projectionName`             | One of the eight `finance.projection.*` names.                                                                                                                                                                                               |
| `tenant_id`         | `uuid`        | partition key                       | Structural tenant scope — no row spans tenants.                                                                                                                                                                                              |
| `schema_version`    | `integer`     | `ProjectionState.schema_version`    | A mismatch vs. the worker's version triggers a replay (`projection-runtime.md` §9).                                                                                                                                                          |
| `cursor_event_id`   | `uuid`        | `ProjectionState.cursor.id`         | The event-`id` half of the cursor. `null` ⇒ nothing applied yet.                                                                                                                                                                             |
| `cursor_created_at` | `timestamptz` | `ProjectionState.cursor.created_at` | The `created_at` half of the cursor. Moves together with `cursor_event_id`.                                                                                                                                                                  |
| `state_json`        | `jsonb`       | the `ProjectionStore` contents      | The serialized read model (the projection's accumulated key-value data).                                                                                                                                                                     |
| `status`            | `text`        | `ProjectionState.state`             | `idle` / `replaying` / `degraded`. `is_degraded` is derived (`status = 'degraded'`).                                                                                                                                                         |
| `degraded_reason`   | `text`        | (new)                               | Human-readable cause; populated only when `status = 'degraded'`, else `null`.                                                                                                                                                                |
| `last_rebuilt_at`   | `timestamptz` | `ProjectionState.last_rebuilt_at`   | ISO timestamp of the last successful `replay`.                                                                                                                                                                                               |
| `updated_at`        | `timestamptz` | —                                   | Row-level last-**mutation** time. `default now()` covers INSERT; a `BEFORE UPDATE` trigger (`finance.set_projection_state_updated_at`) stamps it on every UPDATE, so it authoritatively reflects the last row mutation regardless of caller. |

Primary key: `(projection_name, tenant_id)` — the structural scoping unit.

Notes:

- **`state_json` is a derived cache, not financial truth.** It can be discarded
  and rebuilt at any time. It is therefore intentionally **mutable** — unlike
  `finance.audit_events`, this table carries **no** append-only / no-hard-delete
  trigger. The event stream remains the single source of truth.
- **`error_count`** from the runtime `ProjectionState` is not a required 2C-4
  column. It is operational telemetry, not durable state needed for correctness;
  it may be folded into `state_json` metadata or added in a later migration if a
  durable count is wanted. Recovery does not depend on it.
- **`state_json` size.** Finance projection read models are bounded per tenant
  (a chart of accounts, a pending-approval worklist, an adapter-job queue — none
  unbounded). A single JSONB document per `(projection, tenant)` is adequate for
  v1. If a specific projection's read model later grows unbounded, that one
  projection can migrate to a row-per-key table behind the same store interface
  — a future, isolated change, not v1 scope.
- **`updated_at` is trigger-maintained.** `default now()` only covers INSERT; a
  `BEFORE UPDATE` trigger stamps `updated_at = now()` on every UPDATE, so the
  column is an authoritative last-mutation timestamp the projection store
  provider cannot forget to set. Migration 174 installs the trigger
  (`finance.set_projection_state_updated_at`).

---

## 4. Migration Plan

### 4.1 The draft migration

`backend/migrations/174_finance_projection_state_draft.sql` (next number after 173) creates `finance.projection_state` per Section 3. It is:

- **Additive only** — creates one new `finance.*` table and its indexes; touches
  no existing table, no `public.*` object.
- **Idempotent** — `create table if not exists`, `create index if not exists`.
- **RLS-deferred** — RLS is intentionally left disabled, consistent with
  migrations 172 and 173. Finance RLS is finalized in the single companion RLS
  migration described in `phase-2c-rls-application-plan.md` §7, which will also
  cover `finance.projection_state` (`tenant_match` SELECT, `service_only` writes;
  this table is mutable so no DELETE `DENY` beyond the standard policy).
- **DRAFT** — the filename carries the `_draft` suffix and the header marks it
  dev/local-only. It is **not applied** to staging or production by this phase.

### 4.2 Application gating

Migration 174 is gated on the same staging-readiness checklist as 172/173
(`phase-2c-rls-application-plan.md` §7, `staging-rls-validation.md` §6). It is
applied to staging **only** alongside 172/173 and the companion RLS migration,
after that gate clears. Production application is a separate, later decision
([`production-readiness-review.md`](./production-readiness-review.md)).

### 4.3 No backfill required

The table starts empty. The projection worker treats a missing row exactly as
`projection-runtime.md` §9 specifies for a missing `ProjectionState`: it is the
first-build trigger — the worker runs an initial `replay` from the event stream,
which writes the first row. No data migration or backfill step exists.

---

## 5. How This Backs the Runtime

### 5.1 A Postgres `ProjectionStoreProvider`

Option A is implemented as a Postgres-backed `ProjectionStoreProvider` —
the same interface `projectionStore.memory.js` already satisfies
(`getLiveStore` / `createShadowStore` / `promoteShadow` / `getState` /
`setState`). The Runner and the eight projection workers are unchanged; they
depend only on the interface (`projection-runtime.md` §3).

- **`getState` / `setState`** read and write the metadata columns
  (`schema_version`, `cursor_*`, `status`, `degraded_reason`, `last_rebuilt_at`)
  of the `(projection_name, tenant_id)` row.
- **`getLiveStore`** materializes a `ProjectionStore` view over `state_json`.
- **`createShadowStore`** builds the rebuilt read model in memory (or a scratch
  key); it is not visible to readers until promotion.
- **`promoteShadow`** is a **single atomic `UPDATE`** of the row — `state_json`,
  `cursor_*`, `status`, `last_rebuilt_at` set together in one statement. Postgres
  MVCC guarantees a concurrent reader sees either the whole pre-replay row or
  the whole rebuilt row, never a partial one — satisfying the
  `projection-runtime.md` §3 atomic-promotion requirement directly, with no
  staging namespace needed because the unit of promotion is one row.

### 5.2 Replay rebuilds from the event stream

Nothing about replay changes. `replay(projectionName, tenantId)` still reads the
tenant's full stream from `finance.audit_events` in the frozen Track A order
(`created_at` ASC, `id` tie-break), rebuilds into a shadow, and promotes. The
only difference is the promoted result is durably written to
`finance.projection_state` instead of an in-memory `Map`.

### 5.3 Degraded status persists

When a projection degrades, the worker writes `status = 'degraded'` and
`degraded_reason` to the row. That state survives worker restarts and deploys.
Dispatch stays paused for that `(projection, tenant)` until an operator triggers
a `replay`, which clears `status` back to `idle` and nulls `degraded_reason`
(`projection-runtime.md` §11). The operator-triggered-only recovery contract is
unchanged.

---

## 6. Tenant Scoping

`finance.projection_state` carries `tenant_id` on every row; the primary key
`(projection_name, tenant_id)` makes every row structurally tenant-scoped — no
row spans tenants, matching the `projection-runtime.md` §3 / §10 guarantee. The
companion RLS migration adds the `tenant_match` SELECT predicate as
defense-in-depth; the worker's queries are always explicitly
`WHERE tenant_id = $1` regardless.

---

## 7. Acceptance Criteria — Self-Check

| 2C-4 acceptance criterion                    | Status                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Persistent projection strategy selected      | ✅ Section 2 — Option A, Postgres `finance.projection_state`.                                                       |
| Migration is draft-only until staging review | ✅ Section 4 — `174_finance_projection_state_draft.sql`, `_draft` suffix, gated, not applied.                       |
| Projection state remains tenant-scoped       | ✅ Sections 3 + 6 — `tenant_id` on every row; PK `(projection_name, tenant_id)`.                                    |
| Replay can rebuild from event stream         | ✅ Section 5.2 — replay still reads `finance.audit_events`; the snapshot is a durable cache, not a source of truth. |
| Degraded status can persist                  | ✅ Sections 3 + 5.3 — `status` + `degraded_reason` columns; durable across restarts.                                |

---

_Part of the Finance Ops architecture suite. Related: `projection-runtime.md`
(Projection Runtime), `event-store-persistence.md` (Phase 2B — Event Store
Persistence), `worker-service-topology.md` (Phase 2B-13),
`projection-worker-staging-plan.md` (2C-6)._
