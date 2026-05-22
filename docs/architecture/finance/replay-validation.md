# Finance Ops — Replay Validation Harness

**Phase 2B-12 — Replay Validation Harness.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Implemented. Pure validation library — no routes, no worker process.
**Date:** 2026-05-21
**Audience:** Engineers working on Finance Ops projections and anyone reviewing
projection correctness.

---

## Overview

The **Replay Validation Harness** is a dependency-light validation library that
proves the central correctness invariant of every Finance Ops projection:

> A projection rebuilt by a full `replay()` of the event stream converges to
> byte-for-byte the same read-model state as one built incrementally by
> sequential `dispatch()` of the same events.

It also asserts the surrounding contract guarantees the runtime depends on: the
frozen replay ordering, the degraded-recovery invariant, and per-`(projection,
tenant)` tenant isolation.

The harness is a **test/validation utility**. It is the executable counterpart
of the [`projection-runtime.md`](./projection-runtime.md) contract — where that
document _states_ the invariants, this harness _checks_ them. It adds no routes,
no Express wiring, no worker process, performs no provider writes and no network
calls.

It builds on the same two frozen inputs as the runtime:

- **Track A** — the frozen finance event contract: bare-UUID event IDs,
  `aggregate_type` / `aggregate_id` envelopes (`target_type` / `target_id` on
  approvals), `created_at` ASC ordering with event `id` as the deterministic
  tie-break, append-only.
- **Projection Runtime** — `createProjectionRunner` (`register`, `dispatch`,
  `replay`, `replayAll`, `status`), the memory store provider, and the three
  projection workers (`ledger`, `approval_queue`, `adapter_queue`).

**Source:** `backend/lib/finance/projections/replayValidationHarness.js`
**Tests:** `backend/__tests__/lib/finance/projections/replayValidationHarness.test.js`

---

## Table of Contents

1. [What Convergence Means](#1-what-convergence-means)
2. [The Ordering Contract](#2-the-ordering-contract)
3. [The Degraded-Recovery Invariant](#3-the-degraded-recovery-invariant)
4. [Tenant Isolation](#4-tenant-isolation)
5. [The Harness API](#5-the-harness-api)
6. [The Validation Event Store](#6-the-validation-event-store)
7. [Result Shape](#7-result-shape)
8. [Relationship to projection-runtime.md](#8-relationship-to-projection-runtimemd)

---

## 1. What Convergence Means

A projection is a read model **derived** from the immutable finance event
stream. The runtime offers two ways to bring a projection up to date:

- **Incremental** — `dispatch(event)` applies one newly-appended event, advances
  the cursor, and degrades on handler failure.
- **Rebuild** — `replay(projectionName, tenantId)` discards the read model and
  reconstructs it from scratch by replaying the whole tenant event stream into a
  shadow store, then atomically promoting it.

**Convergence** is the property that these two paths produce _the same state_.
If a projection worker's `handleEvent` and `replay` ever disagree — a different
accumulation rule, a missed event, an order dependency — the incremental and
rebuilt read models drift apart. That class of bug is silent in production
because each path looks internally consistent; it only surfaces when a
projection is rebuilt (e.g. after a degraded recovery or a schema-version bump)
and the numbers change.

The harness catches it deterministically:

- **Path 1 (incremental)** — append all events to a fresh runtime, then
  `dispatch()` them one by one in the frozen Track A order.
- **Path 2 (rebuild)** — append the same events to a _separate_ fresh runtime,
  then `replay()` every projection.
- **Compare** — snapshot each projection's live store from the store provider
  (`getLiveStore` → keys + values) and assert deep equality for `ledger`,
  `approval_queue`, and `adapter_queue`.

Comparison is done against the **live projection stores**, not `getProjection`
output — so it validates the actual persisted read-model state, independent of
any presentation logic.

Each path gets its own event store, store provider, runner, and freshly
registered workers — there is no shared mutable state to mask a divergence.

---

## 2. The Ordering Contract

Replay order is **frozen**: `created_at` ASC, then event `id` ASC as the
deterministic tie-break (Track A). This single order is used identically for
live dispatch and for replay — which is _why_ the two paths can converge at all.

The harness validates ordering directly: `checkReplayOrdering` appends a stream
in scrambled input order and asserts `eventStore.replay(tenantId)` returns it in
the canonical `created_at` ASC / `id` ASC order. It explicitly verifies the
**tie-break case** — multiple events sharing one `created_at` millisecond must
be ordered by `id` — and reports `tie_break_exercised` so a vacuous pass (no
collisions in the fixture) is visible rather than silently green.

`compareEventOrder(a, b)` is exported so callers can sort fixtures into the same
canonical order the runtime uses.

---

## 3. The Degraded-Recovery Invariant

From [`projection-runtime.md` §11](./projection-runtime.md#11-degraded-projection-state):
a projection that fails a handler becomes **degraded**, and a degraded
projection **pauses dispatch** and recovers **only** via an operator-triggered
`replay()` — never automatically.

`checkDegradedRecovery` proves the full lifecycle:

1. **Fault** — a one-shot fault is injected into a chosen projection worker
   (`handleEvent` throws for a single event `id`; `replay` is left intact).
   Dispatching that event must drive the projection to `is_degraded = true`,
   `state = 'degraded'`.
2. **Pause** — a subsequent `dispatch()` of a later consumed event must return
   outcome `paused`; the event is **not** applied and the cursor stays frozen at
   its pre-failure position.
3. **Recover** — an operator-triggered `replay()` must return the projection to
   `state = 'idle'`, `is_degraded = false`.
4. **Correctness** — the recovered read model is deep-compared against a clean
   reference build of the _same_ events. Recovery must reproduce the correct
   state — including the originally failed event and every event paused after it
   — not merely return to a live state.

This makes the harness a regression guard for the degraded-state machine, not
just a liveness check.

---

## 4. Tenant Isolation

Projection stores, cursors, and `ProjectionState` are partitioned by
`tenant_id`; no instance spans tenants
([`projection-runtime.md` §10](./projection-runtime.md#10-tenant-scoped-replay)).

`checkTenantIsolation` interleaves two tenants' event streams into one event
log, rebuilds every projection for each tenant, and asserts:

- **No row leakage** — every value in a tenant's projection store carries that
  tenant's `tenant_id`; a value stamped with the _other_ tenant's id is a leak.
- **Per-`(projection, tenant)` cursors** — each tenant's cursor reflects the
  position of _its own_ last consumed event, never advanced by the other
  tenant's stream. The two tenants' cursors are independent.

---

## 5. The Harness API

All check functions return a structured result `{ name, passed, detail }`
(see §7). The aggregate runner returns `{ passed, checks: [...] }`.

| Function                                                                             | Purpose                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runReplayValidation({ events, tenantA, tenantB?, failEventId?, config? })`          | Runs the full suite and returns the aggregate `{ passed, checks }`. Single-tenant checks run on `tenantA`; the isolation check runs only when `tenantB` is supplied and both tenants have events. |
| `checkConvergence(events, tenantId, config?)`                                        | Dispatch-vs-replay convergence for all registered projections.                                                                                                                                    |
| `checkReplayOrdering(events, tenantId, config?)`                                     | `replay()` returns events in `created_at` ASC / `id` ASC, including the tie-break.                                                                                                                |
| `checkPerProjectionParity(events, tenantId, config?)`                                | Convergence reported per individual projection.                                                                                                                                                   |
| `checkDegradedRecovery({ events, tenantId, failEventId, projectionName?, config? })` | Degrade → pause → operator replay → correct recovery.                                                                                                                                             |
| `checkTenantIsolation({ events, tenantA, tenantB, config? })`                        | No cross-tenant leakage; per-tenant cursors.                                                                                                                                                      |
| `compareEventOrder(a, b)`                                                            | Track A total-order comparator (exported helper).                                                                                                                                                 |
| `createValidationEventStore()`                                                       | Contract-faithful in-memory event store (see §6).                                                                                                                                                 |
| `createDefaultHarnessConfig()`                                                       | The default config — factories that wire the real runtime.                                                                                                                                        |

### Injectable config

Every collaborator is injected through a `config` object so tests can drive the
harness with doubles:

```js
{
  createEventStore:   () => EventStore,        // default: createValidationEventStore()
  createStoreProvider:() => StoreProvider,     // default: createMemoryProjectionStoreProvider()
  createWorkers:      () => ProjectionWorker[],// default: ledger + approval_queue + adapter_queue
  runnerOptions:      { retryBackoffMs, maxAttempts }, // default: { retryBackoffMs: 0 }
}
```

A partial `config` is merged over `createDefaultHarnessConfig()`, so overriding
just `createWorkers` (e.g. to inject a deliberately divergent worker) leaves the
rest of the wiring intact.

---

## 6. The Validation Event Store

The production `financeEventStore` deliberately **re-stamps `created_at`** at
append time — callers cannot inject timestamps, which is an audit-integrity
guarantee. A _validation_ harness, however, must drive controlled fixtures with
known `created_at` / `id` so it can deterministically assert the replay order.

`createValidationEventStore()` is therefore a minimal, append-only, in-memory
event store that **preserves** caller-supplied `created_at` and `id`. It
implements the identical **read-side** contract the Projection Runner depends on
— `replay(tenantId)` returns the tenant's events in `created_at` ASC / `id` ASC
order, freezing each stored event so a later fixture mutation cannot rewrite
history. Only the write-side timestamp policy differs from `financeEventStore`;
the order the runtime consumes is the same.

---

## 7. Result Shape

Each check returns:

```js
{
  name: 'convergence' | 'replay_ordering' | 'per_projection_parity'
      | 'degraded_recovery' | 'tenant_isolation',
  passed: boolean,
  detail: { /* check-specific evidence */ },
}
```

`runReplayValidation` returns the aggregate:

```js
{
  passed: boolean,        // true iff every check passed
  checks: [ { name, passed, detail }, ... ],
}
```

`detail` carries enough evidence to diagnose a failure without re-running — e.g.
`convergence.detail.diverged` lists the divergent projection's `dispatched` and
`replayed` snapshots side by side; `degraded_recovery.detail` reports each
lifecycle assertion as a named boolean.

---

## 8. Relationship to projection-runtime.md

[`projection-runtime.md`](./projection-runtime.md) is the **authoritative
runtime/harness contract** — it _defines_ cursor semantics, the shadow-store +
atomic-promotion replay lifecycle, the degraded state machine, replay ordering,
and per-`(projection, tenant)` scope.

This harness is the **executable check** of those guarantees. It imports the
real runtime (`createProjectionRunner`), the real store provider, and the real
projection workers — so it validates the shipping implementation, not a model of
it. When a future change touches the runner, a projection worker, or a store
backend, running `runReplayValidation` (or the dedicated test suite) proves the
convergence, ordering, degraded-recovery, and tenant-isolation invariants still
hold.

It does **not** redefine any contract. Terminology here — cursor, degraded,
shadow store, atomic promotion, per-`(projection, tenant)` scope — is used
exactly as `projection-runtime.md` defines it.

---

## Status and non-goals

- **Implemented** as a pure validation library. No routes, no Express wiring, no
  worker process, no provider writes, no network calls.
- It does not schedule or run replays in production — operators do that via the
  runtime. The harness only _validates_ that replays converge.
- It does not persist results; it returns structured reports to its caller
  (tests today; a future ops/CI check could consume the same API).

---

_This document is part of the Finance Ops architecture suite. Related:
[`projection-runtime.md`](./projection-runtime.md) (the runtime contract),
[`projection-contracts.md`](./projection-contracts.md) (per-projection read
models), [`event-store-persistence.md`](./event-store-persistence.md) (the
event store)._
