# Finance Ops — Phase 2C-12: Replay / Rebuild Operational Drill

**Phase 2C-12 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Operational drill procedure. Documentation only — no drill script delivered in Phase 2C.
**Date:** 2026-05-22
**Related:** [`replay-validation.md`](./replay-validation.md) (Phase 2B-12) · [`projection-runtime.md`](./projection-runtime.md) §9 · [`persistent-projection-store-plan.md`](./persistent-projection-store-plan.md) (2C-4) · [`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md) (2C-6)

---

## 1. Goal and Scope

Prove that Finance Ops projections can be **rebuilt operationally** — by an
operator, against staging-like data — and that the rebuilt state matches the
incrementally-built state. This is the operational counterpart to the Phase 2B-12
replay validation harness: 2B-12 proves the invariant in tests; 2C-12 exercises
it as an operations drill before staging activation.

**Scope.** This document is the **drill procedure**. Per the Phase 2C scope, no
new code is delivered — the optional `backend/scripts/finance-replay-drill.js` is
**not** created. The drill is run using the already-implemented
`replayValidationHarness.js` (2B-12) and the projection worker's operator
`replay` / `replayAll` control surface (2C-6). The drill can be scripted later;
the programmatic checks it depends on already exist.

---

## 2. Relationship to the Replay Validation Harness

`replayValidationHarness.js` (Phase 2B-12, `replay-validation.md`) already proves
the core invariant — a projection rebuilt by full `replay()` converges to the
same state as one built incrementally by sequential `dispatch()`. Its
`runReplayValidation()` returns `{ passed, checks }`, where each check is
structured `{ name, passed, detail }`:

| Harness check                       | What it proves                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `checkConvergence`                  | dispatch-built state == replay-built state                                        |
| `checkReplayOrdering`               | frozen Track A order (`created_at` ASC, `id` tie-break), incl. the tie-break case |
| `checkPerProjectionParity`          | ledger / approval_queue / adapter_queue each rebuild correctly                    |
| `checkRepeatedReplayDeterminism`    | replaying the same stream twice yields byte-identical state                       |
| `checkInfrastructureEventFiltering` | `finance.audit.event_appended` never reaches a business projection                |
| `checkDegradedRecovery`             | a degraded projection recovers only via operator-triggered replay                 |
| `checkTenantIsolation`              | per-`(projection, tenant)` isolation; no cross-tenant contamination               |

The 2C-12 drill **uses** this harness as its verification engine and adds the
operational wrapper: a real controlled tenant, a real before/after snapshot of
the persistent store, and a recorded result.

---

## 3. Prerequisites

- The controlled staging tenant is selected
  ([`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md), 2C-13).
- The persistent projection store exists — migration 174 applied to staging
  ([`persistent-projection-store-plan.md`](./persistent-projection-store-plan.md),
  2C-4) — so a before/after snapshot of `finance.projection_state` is meaningful.
- The projection worker is available with its operator `replay` / `replayAll`
  control surface (2C-6 §2).
- The drill is run in staging or a staging-like environment — never production.

---

## 4. Drill Procedure

Run for the controlled staging tenant.

### Step 1 — Select the controlled tenant

Fix `tenant_id` to the single controlled staging tenant. Every step below is
scoped to it; the drill never touches another tenant.

### Step 2 — Snapshot current projection state

Capture the current `finance.projection_state` rows for the tenant — for each
projection: `state_json`, `cursor_event_id`, `cursor_created_at`,
`schema_version`, `status`, `last_rebuilt_at`. This snapshot is the **"before"**
baseline and the restore point (§6).

### Step 3 — Rebuild from the finance event stream

Trigger an operator `replayAll(tenantId)`. The Runner, for each projection,
reads the tenant's full stream from `finance.audit_events` in frozen Track A
order, rebuilds into a shadow store, and atomically promotes it
(`projection-runtime.md` §9). The live store is served from the pre-replay
snapshot until the atomic promote — readers never see a partial rebuild.

### Step 4 — Compare before / after

Compare the Step 2 snapshot against the post-replay `finance.projection_state`:

- **Expected match:** if no events were appended between snapshot and replay,
  the rebuilt `state_json` is **byte-identical** to the snapshot for every
  projection (replay is a pure function of the event stream —
  `checkRepeatedReplayDeterminism`).
- **Expected, explained difference:** if events arrived during the drill, the
  rebuilt state legitimately advances past the snapshot cursor. The drill
  accounts for this by recording the event count at snapshot time.
- **Unexpected difference = divergence** → see §5.

Run `runReplayValidation()` for the tenant to get the structured
`{ passed, checks }` report as the machine verdict.

### Step 5 — Verify the ledger projection

Confirm `finance.projection.ledger` rebuilds correctly: per-account
debit/credit/balance buckets and the five-classification totals match the
incrementally-built ledger (`checkPerProjectionParity`; the 2B-8 parity test
also asserts equality with `accountingEngine.buildLedger()`).

### Step 6 — Verify the approval-queue projection

Confirm `finance.projection.approval_queue` rebuilds correctly: `pending` vs
`resolved` worklists; a cancelled approval has left `pending` and remains in
`resolved`; no `approval_id` appears twice.

### Step 7 — Verify the adapter-queue projection

Confirm `finance.projection.adapter_queue` rebuilds correctly: `queued` /
`running` / `failed` / `completed` buckets; a job appears in exactly one bucket;
failed and **dead-lettered** jobs (2C-10) are reflected — replay never heals a
dead-letter.

### Step 8 — Verify audit evidence-pack determinism

Build an evidence pack for the tenant twice with the **same** injected `packId`
and `generatedAt` (2C-7 §4). Confirm the two packs are **byte-identical**,
including all three integrity hashes (`events_hash`, `approvals_hash`,
`pack_hash`). This proves evidence is reproducible from the event stream.

### Step 9 — Verify degraded recovery requires operator replay

Confirm the degraded-recovery invariant (`checkDegradedRecovery`): induce or
observe a `degraded` projection, confirm dispatch is **paused** and the cursor
frozen, confirm it does **not** auto-recover, then confirm an **operator-triggered**
`replay` clears `status` to `idle` and catches the projection up. Recovery is
operator-only by contract (`projection-runtime.md` §11).

### Step 10 — Record the result

Record the `runReplayValidation()` report, the before/after comparison, and each
step's outcome as evidence for the staging activation review
([`staging-activation-review.md`](./staging-activation-review.md), 2C-14).

---

## 5. Divergence Detection

Divergence is any difference between rebuilt and expected state not explained by
events appended during the drill.

- **Structural detection.** `checkConvergence` and `checkPerProjectionParity`
  compare dispatch-built vs replay-built state structurally;
  `checkTenantIsolation` additionally rebuilds from only the tenant's events and
  asserts byte-identity, catching cross-tenant contamination even in read models
  whose buckets carry no `tenant_id` field (the proof strengthened in 2B-12).
- **Snapshot comparison.** A byte-level diff of `state_json` before vs after
  (Step 4) catches any drift the harness checks might not frame.
- **On divergence:** treat it as a **blocking finding**. Do not promote the
  rebuilt state. Capture both states, identify the offending projection and
  event, and resolve the root cause (a non-deterministic handler, an ordering
  bug, a contaminated store) before re-running the drill. Divergence is a
  Phase 2C stop condition.

---

## 6. Rollback / Restore Procedure

The projection store is a **rebuildable cache**; the event stream
(`finance.audit_events`) is the source of truth. So restore is always possible:

- **Restore from snapshot.** Write the Step 2 `finance.projection_state` rows
  back for the tenant — returns projections to the pre-drill state exactly.
- **Restore by rebuild.** Run `replayAll(tenantId)` again — because replay is a
  pure function of the (immutable, append-only) event stream, this deterministically
  reconstructs correct state. Truncating the tenant's `finance.projection_state`
  rows and replaying is a complete, safe reset.
- The drill **never mutates `finance.audit_events`** — it is append-only and
  immutable at the DB layer (migration 173). The drill is read-only with respect
  to financial truth; only the derived cache is touched, and the cache is always
  recoverable.

---

## 7. Repeatability

The drill is **idempotent and repeatable**:

- `replay()` / `replayAll()` are pure functions of the event stream — running
  the drill twice yields the same rebuilt state (`checkRepeatedReplayDeterminism`).
- Each run snapshots before and can restore after, so a run leaves no residue.
- The drill should be repeated: as part of the staging activation review (2C-14),
  after any projection-runtime change, and as a periodic operational exercise.
- When convenient, the procedure can be wrapped in
  `backend/scripts/finance-replay-drill.js` (the optional artifact named in the
  2C-12 deliverables) — a thin operational wrapper over `replayValidationHarness.js`
  and `replayAll`. Phase 2C delivers the procedure; the script is a later
  convenience, not a Phase 2C deliverable.

---

## 8. Acceptance Criteria — Self-Check

| 2C-12 acceptance criterion           | Status                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Replay output matches expected state | ✅ Steps 3–8 — before/after comparison + `runReplayValidation()`; ledger/approval/adapter parity + evidence determinism. |
| Divergence is detected               | ✅ Section 5 — structural harness checks + byte-level snapshot diff; divergence is a blocking stop condition.            |
| Rollback/restore procedure exists    | ✅ Section 6 — restore from snapshot or by deterministic rebuild; event stream untouched.                                |
| Drill is repeatable                  | ✅ Section 7 — replay is a pure function of the event stream; snapshot/restore leaves no residue.                        |

---

_Part of the Finance Ops architecture suite. Related: `replay-validation.md`
(Phase 2B-12), `projection-runtime.md`, `persistent-projection-store-plan.md`
(2C-4), `projection-worker-staging-plan.md` (2C-6), `audit-worker-staging-plan.md`
(2C-7), `controlled-tenant-enablement.md` (2C-13), `staging-activation-review.md`
(2C-14)._
