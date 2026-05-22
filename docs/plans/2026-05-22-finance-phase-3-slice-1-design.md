# Finance Ops — Phase 3 Slice 1: Projection/Audit Prerequisites — Design

**Status:** Approved design — ready for implementation planning.
**Date:** 2026-05-22
**Branch:** `feat/finance-ops-runtime`
**Author:** Brainstormed and approved with Dre.

---

## 1. Context

Phase 3 is _controlled staging activation_ of Finance Ops. It assumes runtime
components that Phase 2C **designed but deliberately did not build** (Phase 2C was
documentation-only). Phase 3 cannot proceed until that code exists.

The prerequisite build was split by risk. **Slice 1** (this design) is the
projection/audit half — no external provider, lower risk — which unblocks Phase
3-2 … 3-8. **Slice 2** (separate, later) is the adapter worker + ERPNext adapter.

This design introduces durable event persistence and a persistent projection
read-side. It does **not** change finance-domain semantics, route behavior, or
the domain service's own (Phase-1, in-memory) state model.

---

## 2. Scope

### In scope (Slice 1)

- Persistent event-store wiring — route operations persist events to
  `finance.audit_events`, gated by `ENABLE_FINANCE_PERSISTENT_EVENTS` + DB-pool
  presence, injected via DI.
- `auditTimelineProjection.js` — the 4th projection worker.
- `projectionStore.pg.js` — a Postgres `ProjectionStoreProvider` backing
  `finance.projection_state` (migration 170).
- `projectionRunner.js` — `await` the store-provider seam (async-provider support).
- `backend/workers/financeProjectionWorker.js` — the projection worker process.
- Migration `171_finance_rls_policies.sql` — the companion RLS migration.

### Out of scope (Slice 2 / later / deferred)

Separate `finance-audit-worker` process · `audit_pack_requests` · adapter worker

- ERPNext adapter + DB-backed `finance.adapter_jobs` writes · incremental
  "events-after-cursor" event-store query · routes reading from
  `finance.projection_state` · fixing the domain service's own in-memory state
  persistence.

---

## 3. Architecture & Data Flow

```
Route op  →  financeDomainService  (in-memory Phase-1 runtime — behavior unchanged)
               → emits finance event → eventStore.append()
                   eventStore = financeEventStore.pg
                       WHEN  ENABLE_FINANCE_PERSISTENT_EVENTS is enabled
                        AND  a DB pool is available
                   eventStore = in-memory financeEventStore   (otherwise — default)
               → finance.audit_events  (durable, append-only)

finance-projection-worker  (separate process — disabled-by-default)
   → poll loop, controlled tenant:
        eventStore.replay(tenantId)  →  runner.dispatch(event)  per event
        (cursor guard drops already-applied events)
   → ProjectionRunner (existing) + projectionStore.pg (new)
        → 4 ProjectionWorkers: ledger · approval_queue · adapter_queue · audit_timeline
   → finance.projection_state  (durable read models + per-(projection,tenant) cursors)
   → operator-triggered replay / replayAll
```

The domain service's own in-memory state (journals, invoices, approvals) is
**unchanged** — its persistence is a known Phase-1 gap, explicitly out of scope.
Slice 1 makes (a) the event stream durable and (b) the projection read-side
durable and operable.

---

## 4. Components

### A. Persistent event-store wiring (DI)

`financeDomainService` accepts the event store as an **injected dependency**.
`createFinanceV2Routes(pool)` selects it:

```
if  ENABLE_FINANCE_PERSISTENT_EVENTS  and  pool is available:
    eventStore = createFinancePgEventStore({ pool })   → finance.audit_events
else:
    eventStore = createFinanceEventStore()             → in-memory (safe default)
```

- `ENABLE_FINANCE_PERSISTENT_EVENTS` defaults to **disabled**. Default, local,
  and test behavior is in-memory — **no Postgres dependency** unless explicitly
  opted in (constraint 7).
- Tests continue to construct the domain service with the in-memory store; no
  test requires Postgres.
- Staging activation sets `ENABLE_FINANCE_PERSISTENT_EVENTS=true` (with a pool
  present) so route operations land in `finance.audit_events`.

### B. `auditTimelineProjection.js`

A new `ProjectionWorker` (`backend/lib/finance/projections/`), structured like
`ledgerProjection.js` — a pure store-logic module with `projectionName`,
`consumedEvents`, `handleEvent`, `replay`, `getProjection`, `schemaVersion`. Its
read model follows the `audit_timeline` definition in `projection-contracts.md`.

It is the **only** projection that may consume the infrastructure event
`finance.audit.event_appended`, and only via `includeInfrastructureEvents: true`
(constraint 5). The runner's infrastructure-event filter enforces this for all
others.

### C. `projectionStore.pg.js`

`createPgProjectionStoreProvider({ pool })` — implements the **same provider
interface** as `projectionStore.memory.js`: `getLiveStore`, `createShadowStore`,
`promoteShadow`, `discardShadow`, `getState`, `setState`. Backed by
`finance.projection_state` (migration 170).

It must preserve the existing in-memory behavioral semantics exactly
(constraint 3):

- **Synchronous live-store mutations.** `getLiveStore` async-hydrates an
  in-memory snapshot from the row's `state_json`; the returned `ProjectionStore`'s
  `get/set/delete/keys/clear` stay **synchronous**, so the runner's
  `createBufferedStore` and `buffer.commit()` need no change.
- **Buffered isolation** is unchanged — it operates on the synchronous snapshot.
- **Shadow promotion.** `createShadowStore` builds an isolated empty snapshot;
  `promoteShadow` persists it as the new live `state_json` + cursor in a **single
  atomic row UPDATE** (Postgres MVCC gives readers all-or-nothing).
- **Deterministic replay** is unchanged — replay still rebuilds from the ordered
  event stream.
- **No partial persistence** (constraint 4): a failed `setState` / `promoteShadow`
  must leave the row at its last consistent state and let the runner mark the
  projection `degraded` exactly as `projection-runtime.md` §11 defines — never a
  half-written `state_json`.

### D. `projectionRunner.js` — async store-provider seam

The runner currently calls `getState/setState/getLiveStore/promoteShadow/`
`createShadowStore/discardShadow` synchronously. Slice 1 adds `await` to those
call-sites so an async provider is supported.

- **Backward-compatible:** the sync memory provider works unchanged under
  `await` (constraint 2 — awaiting a sync provider is the desired compatibility
  model). The existing 28 runner + 19 replay-harness tests must stay green.
- The runner **remains the orchestration authority** (constraint 1): cursor
  semantics, replay semantics, degraded-state semantics, dispatch sequencing all
  stay in the runner. The provider only persists; the worker only schedules.

### E. Migration `171_finance_rls_policies.sql`

The companion RLS migration from `phase-2c-rls-application-plan.md` §7:

- `ENABLE ROW LEVEL SECURITY` on all 9 finance tables (the 8 from migration 168
  plus `finance.projection_state` from 170).
- `service_role` policies (active) and `authenticated` `tenant_match` SELECT
  policies (active — fail-closed: a wrong/absent JWT claim yields zero rows, no
  leak).
- The no-hard-delete ledger triggers from `security-rls-hardening.md` §3–4.
- Dev-only header; gated, **not applied** by this build (application is the
  Phase 3-2 operational step).

---

## 5. Worker — `financeProjectionWorker.js`

`backend/workers/financeProjectionWorker.js`, mirroring `communicationsWorker.js`:

- `startFinanceProjectionWorker()` / `stop()`, a `setTimeout` poll loop, a
  heartbeat file, a standalone entry block with `SIGINT`/`SIGTERM` handlers.
- New npm script `worker:finance-projection`.
- **Three-tier gate** (constraint 8): runs only when
  `ENABLE_FINANCE_OPS && ENABLE_FINANCE_WORKERS && ENABLE_FINANCE_PROJECTION_WORKER`
  are all truthy — otherwise it starts, logs "disabled — idling", and idles. No
  implicit activation from deployment presence.
- It is **operational infrastructure, not business logic** (constraint 6): it
  owns the process lifecycle, the poll loop, per-tenant scheduling, and the
  health surface — nothing else. Cursor/replay/persistence stay in the runner;
  read-model computation stays in the (pure) projection workers.
- Poll cycle: for the controlled tenant, `eventStore.replay(tenantId)` →
  `runner.dispatch(event)` for each (the cursor guard makes re-feeding safe).
  Per 2C-6 §3.1 this is O(full stream)/poll — acceptable for one staging tenant;
  the incremental query stays deferred.
- Operator-triggered `replay` / `replayAll` is exposed as a control path (exact
  trigger mechanism — guarded admin call or one-off invocation — settled in the
  implementation plan); recovery is never automatic.

---

## 6. Implementation Constraints (binding)

1. The projection runner is the orchestration authority — workers never own
   replay, cursor, or persistence semantics independently.
2. Awaiting synchronous providers is acceptable and preferred; the memory
   provider stays sync-compatible under `await`.
3. `projectionStore.pg.js` preserves in-memory semantics: synchronous live-store
   mutations, buffered isolation, shadow promotion, deterministic replay.
4. No partial persistence — a failed `setState`/`promoteShadow` preserves
   degraded-state semantics exactly as `projection-runtime.md` defines.
5. `finance.audit.event_appended` is infrastructure-only; only `audit_timeline`
   may opt into consuming it.
6. `finance-projection-worker` is operational infrastructure; projection
   definitions stay pure and isolated from polling/runtime concerns.
7. `ENABLE_FINANCE_PERSISTENT_EVENTS` gates the pg event-store wiring; default
   and local behavior remain safe and testable without Postgres.
8. Workers are disabled-by-default; no implicit activation from deployment
   presence.

---

## 7. Error Handling

- pg `append` failure (e.g. duplicate id) → existing
  `FINANCE_EVENT_STORE_DUPLICATE_EVENT_ID`; the domain layer owns the retry
  decision (unchanged).
- Worker poll-cycle error → logged, the loop continues (the `communicationsWorker`
  `runCycle` try/catch pattern); the heartbeat reflects health.
- A failed `handleEvent`/`replay`, or a failed pg `setState`/`promoteShadow` →
  the projection degrades, dispatch pauses for that `(projection, tenant)`, and
  recovery is operator-triggered replay only — the existing runner contract,
  unchanged.

---

## 8. Testing (TDD)

New tests:

- `auditTimelineProjection.test.js` — projection behavior, mirroring the
  existing projection test files.
- `projectionStore.pg.test.js` — the pg provider against a mock pool, mirroring
  `financeEventStore.pg.test.js`; covers sync mutation semantics, shadow
  promotion atomicity, and the no-partial-persistence guarantee.
- `financeProjectionWorker.test.js` — poll-cycle logic with an injected runner
  and event store; the three-tier gate; disabled-idle behavior.
- Event-store DI — a test that the domain service uses the in-memory store by
  default and the pg store when injected.

Regression: re-run the full finance projection suite after the runner `await`
change — it must stay green. Final gate: the Phase 3 verification commands —
`node --test backend/__tests__/lib/finance/*.test.js
backend/__tests__/lib/finance/projections/*.test.js
backend/__tests__/routes/finance.v2.routes.test.js` and `npm run lint -- --quiet`.

---

## 9. Deliverable File Set

```
backend/lib/finance/projections/auditTimelineProjection.js        (NEW)
backend/lib/finance/projections/projectionStore.pg.js             (NEW)
backend/lib/finance/projections/projectionRunner.js               (MODIFIED — await seam)
backend/workers/financeProjectionWorker.js                        (NEW)
backend/migrations/171_finance_rls_policies.sql                   (NEW — dev-only, gated)
backend/lib/finance/financeDomainService.js                       (MODIFIED — injectable event store)
backend/routes/finance.v2.js                                      (MODIFIED — event-store selection)
backend/package.json                                              (MODIFIED — worker script, test globs)
backend/__tests__/lib/finance/projections/auditTimelineProjection.test.js     (NEW)
backend/__tests__/lib/finance/projections/projectionStore.pg.test.js          (NEW)
backend/__tests__/workers/financeProjectionWorker.test.js                     (NEW)
deploy/coolify/finance-workers.example.yml                        (MODIFIED — add ENABLE_FINANCE_PERSISTENT_EVENTS)
CHANGELOG.md                                                      (MODIFIED)
```

Exact file paths and the audit_timeline read-model shape are finalized in the
implementation plan, which reads the current code in detail.

---

_Related: `docs/architecture/finance/projection-runtime.md`,
`projection-contracts.md`, `persistent-projection-store-plan.md` (2C-4),
`worker-service-topology.md` (2B-13), `phase-2c-rls-application-plan.md` (2C-1)._
