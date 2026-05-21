# Finance Ops — Projection Runtime

**Phase 2B-6 — Projection Rebuild Harness.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Design specification — no implementation. Design/docs only.
**Date:** 2026-05-21
**Audience:** Engineers implementing the projection runner, the store provider, and projection workers.

---

## Overview

The **Projection Runtime** is the shared harness that drives every Finance Ops
projection. It dispatches finance events to projection workers, maintains each
projection's tenant-scoped read model, and rebuilds those read models by
replaying the event stream.

This document is the **authoritative runtime/harness contract**. It owns _how_
any projection is run; it does not define _what_ each projection computes — the
eight projection read models are defined in
[`projection-contracts.md`](./projection-contracts.md) (Track B).

It builds on two frozen inputs:

- **Track A** — the frozen finance event contract: bare-UUID event IDs,
  `aggregate_type` / `aggregate_id` envelopes, `created_at` ASC ordering with
  event `id` as the deterministic tie-break, append-only.
- **Phase 2B event store** — the persistent `financeEventStore` interface
  (`append` / `query` / `replay` / `getCount`), backed in production by
  `finance.audit_events` (see [`event-store-persistence.md`](./event-store-persistence.md)).

**Phase 2B-6 scope is design only.** No runner, store provider, or projection
worker is implemented in this phase.

---

## Table of Contents

1. [Projection Runner Contract](#1-projection-runner-contract)
2. [Projection Worker Interface](#2-projection-worker-interface)
3. [Projection Store Abstraction](#3-projection-store-abstraction)
4. [Event Dispatch Rules](#4-event-dispatch-rules)
5. [Event Filtering Rules](#5-event-filtering-rules)
6. [Cursor Semantics](#6-cursor-semantics)
7. [Idempotent Per-Event Handler Behavior](#7-idempotent-per-event-handler-behavior)
8. [Replay Ordering Semantics](#8-replay-ordering-semantics)
9. [Replay Lifecycle](#9-replay-lifecycle)
10. [Tenant-Scoped Replay](#10-tenant-scoped-replay)
11. [Degraded Projection State](#11-degraded-projection-state)
12. [Consistency Model](#12-consistency-model)
13. [Infrastructure Event Handling](#13-infrastructure-event-handling)
14. [Relationship to Track A and Track B](#14-relationship-to-track-a-and-track-b)

---

## 1. Projection Runner Contract

The **Runner** is the harness. One Runner instance manages all registered
projection workers for a deployment. It is the only component that reads the
event store on behalf of projections and the only component that mutates
projection stores.

**The Runner owns:** the worker registry, event filtering, cursor tracking,
dispatch, replay orchestration, degraded-state tracking, and status reporting.
**The Runner does not own:** domain/read-model logic — that lives in workers (§2).

```js
/**
 * @typedef {Object} ProjectionRunner
 */
{
  register(worker): void,
  dispatch(event): Promise<DispatchResult>,
  replay(projectionName, tenantId): Promise<ReplayResult>,
  replayAll(tenantId): Promise<ReplayResult[]>,
  getProjection(projectionName, tenantId, opts): Promise<object>,
  status(projectionName, tenantId): ProjectionStatus,
}
```

- **`register(worker)`** — registers a `ProjectionWorker`. Validates that
  `projectionName` is unique and `consumedEvents` is a non-empty array of
  canonical `finance.*` event types. A duplicate `projectionName` throws.
- **`dispatch(event)`** — the live/push path. Routes one newly-appended event to
  every interested worker (§4). Called in-process by the finance domain service
  immediately after `eventStore.append` returns (Phase 2). In Phase 3 a separate
  projection-worker service may call it from a poll loop — the contract is
  identical. `dispatch` never reads the event store; the caller supplies the event.
- **`replay(projectionName, tenantId)` / `replayAll(tenantId)`** — rebuild one
  projection, or all projections, for one tenant (§9, §10).
- **`getProjection(projectionName, tenantId, opts)`** — the read path. Delegates
  to `worker.getProjection`, attaching runtime `meta` (`is_degraded`,
  `last_rebuilt_at`). Supports the opt-in read-your-writes wait (§12).
- **`status(projectionName, tenantId)`** — returns the `ProjectionStatus`:
  `{ state, cursor, last_rebuilt_at, schema_version, is_degraded, error_count }`.

**Deployment posture.** The Runner is environment-agnostic: in-process for
Phase 2, hostable in a separate worker service for Phase 3 with no contract
change. Both push (`dispatch`) and pull (poll the event store, then `dispatch` /
`replay`) are supported.

---

## 2. Projection Worker Interface

A **ProjectionWorker** is the unit of domain logic — one per projection. Workers
contain no event-store access, no cross-tenant logic, and no cursor / replay /
degraded logic; those are all the Runner's.

```js
/**
 * @typedef {Object} ProjectionWorker
 */
{
  projectionName: 'finance.projection.<name>',  // unique; one of the 8 defined names
  consumedEvents: string[],                     // exact canonical finance.* event types
  handleEvent(event, store): void | Promise<void>,
  replay(events, store): void | Promise<void>,
  getProjection(tenantId, opts): object,
}
```

- **`handleEvent(event, store)`** — apply ONE event to `store` (already scoped to
  one `(projectionName, tenantId)`). Must be idempotent (§7). The Runner
  guarantees it is called at most once per event, in `created_at` order (§6).
- **`replay(events, store)`** — apply a full ordered event slice to a fresh
  store during a rebuild (§9).
- **`getProjection(tenantId, opts)`** — a pure read of the current read model;
  no mutation, no event-store access.

A worker also declares an internal `schema_version` (an integer); a mismatch
against the persisted `ProjectionState.schema_version` triggers a replay (§9).

---

## 3. Projection Store Abstraction

A **ProjectionStore** is a mutable key-value read-model store scoped to exactly
one `(projectionName, tenantId)` pair. Tenant isolation is **structural** — no
store instance ever spans tenants or projections.

```js
/**
 * @typedef {Object} ProjectionStore
 */
{
  get(key): any,
  set(key, value): void,
  delete(key): void,
  keys(): string[],
  clear(): void,
}
```

The backend is **pluggable**: an in-memory `Map` for Phase 2, local dev, and
tests; Redis or Postgres JSONB later. The Runner and workers depend only on the
interface, never on the backend.

The Runner obtains stores from a **store provider**, which also supplies the
replay-isolation primitives and the runtime metadata record:

```js
/**
 * @typedef {Object} ProjectionStoreProvider
 */
{
  getLiveStore(projectionName, tenantId): ProjectionStore,
  createShadowStore(projectionName, tenantId): ProjectionStore,  // isolated, empty
  promoteShadow(projectionName, tenantId): void,                 // atomic: shadow -> live
  getState(projectionName, tenantId): ProjectionState,
  setState(projectionName, tenantId, state): void,
}
```

`promoteShadow` **must be atomic from a reader's perspective** — a reader sees
either the entire pre-replay model or the entire rebuilt model, never a partial
one. In-memory: reassign the underlying `Map` reference. Postgres-backed: build
into a staging namespace and swap within a transaction.

The per-`(projection, tenant)` runtime metadata:

```js
/**
 * @typedef {Object} ProjectionState
 */
{
  state: 'idle' | 'replaying' | 'degraded',
  cursor: { created_at, id } | null,   // position of last applied event; null = nothing applied
  last_rebuilt_at: string | null,      // ISO timestamp of last successful replay
  schema_version: number,
  is_degraded: boolean,
  error_count: number,
}
```

---

## 4. Event Dispatch Rules

`dispatch(event)` applies one newly-appended event to interested projections:

1. **Validate** the event is a well-formed finance envelope (`id`, `tenant_id`,
   `event_type`, `created_at` present).
2. **Select target workers** — those whose `consumedEvents` includes
   `event.event_type`, after applying the filtering rules of §5 (notably:
   infrastructure events are excluded from business projections).
3. For each target worker, load `ProjectionState` for `(projectionName, event.tenant_id)`:
   - If the event's position `(created_at, id)` is **not strictly greater** than
     `state.cursor` → **skip** (already applied — see §6).
   - Otherwise call `worker.handleEvent(event, liveStore)`.
   - On success → advance `cursor` to the event's position; reset `error_count`.
   - On throw → retry up to **3×** with exponential back-off; if still failing →
     mark the projection `degraded` (§11) and do **not** advance the cursor.
4. **Sequencing** — dispatch is sequential per `(projection, tenant)`: a worker
   fully acknowledges one event before the next event for that tenant is
   delivered to it. Different tenants and different projections dispatch
   concurrently.
5. **Ordering** — within a tenant the Runner delivers events in `created_at`
   order, id tie-break (§8). The cursor check in step 3 makes duplicate or
   out-of-order delivery safe regardless.

`dispatch` is the live path only; reading events from the store (catch-up) is a
`replay` / poll concern (§9).

---

## 5. Event Filtering Rules

The Runner decides which workers receive an event in **two layers, applied in
order**:

1. **Infrastructure-event filter (Runner-enforced, non-overridable for business
   projections).** Infrastructure event types — currently exactly
   `finance.audit.event_appended` — are **never** delivered to business
   projections, even if a worker lists one in `consumedEvents`. See §13.
2. **`consumedEvents` match.** An event is delivered to a worker only if
   `event.event_type` is an **exact string match** in `worker.consumedEvents`.
   There are no wildcards: `consumedEvents` is an explicit, auditable list of
   canonical `finance.*` event types.

The Runner — not individual workers — maintains the canonical set of
infrastructure event types. Adding one is a Runner-level change.

---

## 6. Cursor Semantics

Every projection tracks a **cursor** per `(projectionName, tenantId)`: the
total-order position of the last event successfully applied to that read model.

- A cursor is `{ created_at, id }` — a position in the frozen Track A total
  order (§8). `null` means nothing has been applied yet (a fresh projection).
- The cursor is the **authority for once-delivery**. The Runner applies an event
  to a worker only when the event's position is **strictly greater** than the
  cursor (`created_at` ascending; event `id` as the tie-break).
- A successful `handleEvent` advances the cursor to that event's position. A
  **failed** `handleEvent` does not advance it.
- A completed `replay` sets the cursor to the position of the last event in the
  replayed slice (or `null` if the slice was empty).
- The cursor is persisted in `ProjectionState`. After a Runner restart,
  dispatch / catch-up resumes strictly after the persisted cursor.
- **Infrastructure events never advance any business-projection cursor.** They
  are filtered out before dispatch (§5, §13), so they can never be the
  last-applied event of a business projection.

Cursors are **independent per projection** — `ledger` and `approval_queue` for
the same tenant advance at their own rates. This independence is the source of
the cross-projection consistency caveat in §12.

---

## 7. Idempotent Per-Event Handler Behavior

- The Runner's cursor (§6) guarantees each event is delivered to each worker
  **at most once** under normal operation.
- `handleEvent` **must also be idempotent**: applying the same event twice
  produces the same store state. This is defense-in-depth — if the process
  crashes after `handleEvent` succeeds but before the cursor is persisted, the
  event is re-delivered on restart, and an idempotent handler makes that a
  no-op.
- Idempotency is the **worker's** responsibility. Practical patterns: derive
  read-model keys deterministically from the event or aggregate ID; prefer
  set-from-source assignments over blind increments where the event carries
  absolute state; treat writes as last-writer-wins keyed by event identity.
- `replay` is idempotent by construction — it always begins from a fresh, empty
  shadow store.
- This is the **projection-layer half** of the runtime-wide idempotency posture:
  the event store is append-always and never deduplicates; the Runner's cursor
  plus idempotent handlers provide exactly-once _effect_ on the read model.

---

## 8. Replay Ordering Semantics

- The Runner consumes events in the **frozen Track A total order**: `created_at`
  ascending, with the event `id` (a bare UUID) as the deterministic tie-break
  for events that share a `created_at`.
- This single ordering is used identically for live dispatch and for replay — so
  a replayed projection and a live-updated projection converge to the same
  state.
- The event store provides this order directly: `financeEventStore.replay(tenantId)`
  returns events `ORDER BY created_at ASC, id ASC` (Phase 2B). The Runner does
  not re-sort.
- Until monotonic sequence IDs exist (a known Phase 2 gap), `(created_at, id)`
  **is** the position. If sequence IDs are added later, the position type
  changes but the cursor contract (§6) is unchanged.

---

## 9. Replay Lifecycle

A projection's `(projection, tenant)` pair is in one of three states: `idle`,
`replaying`, or `degraded`.

**A replay is triggered when:**

- a worker is registered and has no prior `ProjectionState` for a tenant (first build);
- an operator explicitly requests a rebuild;
- the worker's `schema_version` does not match the persisted state's; or
- an operator triggers recovery from `degraded` (§11).

**`replay(projectionName, tenantId)` steps:**

1. Set `state = 'replaying'`. Reads continue to be served from the **live**
   store — the pre-replay snapshot. Replay does not block readers.
2. Create a fresh **shadow** store (`createShadowStore`).
3. Fetch the tenant's full event stream — `eventStore.replay(tenantId)`, ordered
   per §8.
4. Apply the event filtering of §5 against the worker's `consumedEvents`.
5. Call `worker.replay(filteredEvents, shadowStore)`.
6. Compute the new cursor = the position of the last event in the filtered slice
   (or `null` if empty).
7. **Atomically promote** the shadow store to live (`promoteShadow`).
8. Update `ProjectionState`: `state = 'idle'`, the new `cursor`,
   `last_rebuilt_at = now`, `is_degraded = false`, `schema_version` = the worker's.
9. **Catch-up** — any events appended during steps 3–8 (position greater than
   the new cursor) are applied to the now-live store via normal cursor-driven
   dispatch.

**Failure** — any throw in steps 3–7 discards the shadow store (the live store
is untouched), sets `state = 'degraded'`, and leaves the prior `cursor` and
`last_rebuilt_at` intact.

**Concurrency** — a replay blocks only its own `(projection, tenant)` pair.
Other tenants and other projections dispatch and replay concurrently.

---

## 10. Tenant-Scoped Replay

- Projection stores, cursors, and `ProjectionState` records are all partitioned
  by `tenant_id`. No instance spans tenants.
- `replay(projectionName, tenantId)` reads only that tenant's events. The event
  store enforces this at the query layer — `financeEventStore.replay(tenant_id)`
  resolves to `WHERE tenant_id = $1` — so cross-tenant read-model contamination
  is **structurally impossible**; the harness inherits the guarantee.
- A replay of tenant A's projection blocks only `(projection, A)`. Tenant B is
  unaffected and replays concurrently.
- `replayAll(tenantId)` fans out to one `replay` per registered projection for
  that tenant. A whole-deployment rebuild is itself a fan-out of per-tenant
  `replayAll` calls — there is no global, cross-tenant replay primitive.

---

## 11. Degraded Projection State

**Entry.** A projection becomes `degraded` when a live `handleEvent` exhausts
its 3 retries (exponential back-off), or when a `replay` fails. The Runner sets
`is_degraded = true`, records `error_count`, and reflects it in `state`.

**While degraded:**

- Reads are still served, from the last-good store — the read model is **stale
  and possibly divergent** (a skipped event may have left a gap). `getProjection`
  results carry `meta.is_degraded = true` so UIs display a staleness / integrity
  warning.
- The Runner continues best-effort live dispatch. A later `handleEvent`
  succeeding does **not** clear `is_degraded` — a prior failed event may have
  left a gap that subsequent events cannot heal.

**Recovery — operator-triggered only.**

- A degraded projection is cleared **exclusively** by a successful `replay`, and
  that replay is **initiated by an operator** (or monitoring / a runbook). The
  Runner **never auto-triggers** replay recovery.
- Rationale: a degraded projection signals possible read-model divergence or a
  real handler defect. Automatic replay would mask the failure and risk a replay
  loop if the defect persists. Recovery must be **explicit and observable** — the
  degraded state surfaces via `status()` and `meta.is_degraded`; an operator
  investigates, then triggers `replay`.

---

## 12. Consistency Model

Finance Ops projections are **eventually consistent**.

| Property                     | Guarantee                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ordering                     | Events are applied in `created_at` order (event `id` tie-break) within a tenant.                                                                                                                       |
| Durability                   | An event appended to the event store will eventually be reflected in every projection that consumes it.                                                                                                |
| Read-your-writes             | Not guaranteed by default. A caller that just appended an event may read a projection that does not yet reflect it.                                                                                    |
| Read-your-writes (opt-in)    | A caller may pass `{ await_event_id }` to `getProjection`. The Runner blocks up to `opts.timeout_ms` (default 2000) until that event's position is at or before the projection's cursor, then returns. |
| Cross-projection consistency | Not guaranteed. Projections have independent cursors (§6) and may reflect different stream positions at the same instant. Roll-up consumers (e.g. `executive_summary`) must tolerate component lag.    |
| Replay consistency           | During a replay the pre-replay snapshot is served; at the atomic promote, reads switch wholesale to the rebuilt model.                                                                                 |
| Degraded reads               | A degraded projection serves stale, possibly-divergent data, flagged `is_degraded` (§11).                                                                                                              |

Projections are not serializable or linearizable — they are read models derived
from the authoritative event stream. The event stream is the source of truth.

---

## 13. Infrastructure Event Handling

`finance.audit.event_appended` is a **reserved internal infrastructure event**,
not a business domain event (per the canonical taxonomy split in the Finance Ops
scaffold). It carries event-store integrity signals — event persisted,
checksummed, replicated, dispatched, archived — and never substitutes for the
business event it accompanies.

The Projection Runtime enforces the following rules centrally:

1. **Business projections never consume it.** `ledger`, `profit_loss`,
   `balance_sheet`, `approval_queue`, `adapter_queue`, `cash_position`, and
   `executive_summary` must never receive `finance.audit.event_appended`. The
   Runner's infrastructure-event filter (§5) drops it before dispatch — even if a
   worker erroneously declares it in `consumedEvents`.
2. **It never advances a business-projection cursor.** Because it is never
   delivered to a business projection, it can never be that projection's
   last-applied event — the filter (§5) and the cursor contract (§6) together
   guarantee this.
3. **`audit_timeline` is the only projection permitted to consume it,** and only
   when its worker is explicitly configured with `includeInfrastructureEvents: true`.
   The default is `false` — `audit_timeline` filters `finance.audit.event_appended`
   out unless an operator opts in to surface infrastructure events.

---

## 14. Relationship to Track A and Track B

- **Track A — frozen event contract.** The Projection Runtime consumes Track A's
  contract (bare-UUID event IDs, `aggregate_type` / `aggregate_id` envelopes,
  `created_at` ASC + id tie-break ordering, append-only). The Runtime does not
  change the event envelope.
- **Track B — `projection-contracts.md`.** This document is the **authoritative
  runtime/harness contract**. `projection-contracts.md` retains the
  per-projection read-model definitions — consumed-event lists, output shapes,
  and projection-specific rebuild logic (its §3–§10). Its former §1 (Projection
  Worker Contract / Event Dispatch / Replay Protocol) and §2 (Consistency Model)
  are **superseded by this document** and now point here.
- **Phase 2B event store.** The Runtime's event source is the `financeEventStore`
  interface (`append` / `query` / `replay` / `getCount`), backed in production by
  `finance.audit_events` (`financeEventStore.pg`). The Runtime is event-store
  backend-agnostic.

---

## Status and non-goals

- **Design only.** No Runner, store provider, or projection worker is
  implemented in Phase 2B-6.
- Because the store and event-store backends are interface-injected, the Runner
  and workers will be unit-testable with in-memory backends — the same approach
  used for the Phase 2B event store.

---

_This document is part of the Finance Ops architecture suite. Related: Track A
(Event Store contract, in the scaffold), Track B (Projection Contracts),
Phase 2B (Event Store Persistence), Track C (Approval Orchestration), Track D
(Audit / Evidence Layer)._
