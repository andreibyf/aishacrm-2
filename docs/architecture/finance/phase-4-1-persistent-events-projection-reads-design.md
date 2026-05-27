# Finance Ops — Phase 4-1: Persistent-Events Route Lift + Projection-Backed Reads Design Freeze

**Phase 4-1 — Design freeze for the persistent-events route lift and projection-backed reads (§7 slices #1 + #2 of the Phase 4-0 design freeze).**
**Branch:** `feat/finance-ops-phase4-planning` (no implementation in this packet; subsequent implementation packet authoring is gated on Codex clearing this design).
**Status:** Design freeze. **No code, no env-var changes, no migration application, no provider writes, no Coolify mutation, no production action by this task.** The current fail-closed guard at `backend/routes/finance.v2.js:48` remains in committed code; this packet does not remove it, weaken it, or propose flipping `ENABLE_FINANCE_PERSISTENT_EVENTS` anywhere.
**Date:** 2026-05-26
**Related:**
[`phase-4-production-pilot-design-freeze.md`](./phase-4-production-pilot-design-freeze.md) §7 slice #1 (persistent-events route lift) + slice #2 (projection-backed reads) — this packet operationalises both ·
[`phase-4-production-pilot-design-freeze.md`](./phase-4-production-pilot-design-freeze.md) §11.2 rows 1 + 2 — the activation-gate verifications this packet enables ·
[`phase-3-activation-evidence-pack.md`](./phase-3-activation-evidence-pack.md) §7 (16 safety guardrails, including the fail-closed route guard) ·
[`event-store-persistence.md`](./event-store-persistence.md) (Postgres-backed event store — the write target) ·
[`projection-runtime.md`](./projection-runtime.md) (projection worker runtime + cursor model) ·
[`projection-contracts.md`](./projection-contracts.md) §3–§7 (ledger / approval_queue / adapter_queue / audit_timeline contracts) ·
[`replay-validation.md`](./replay-validation.md) (replay determinism — required for projection-backed reads to be trustworthy) ·
`backend/routes/finance.v2.js:48` (the current fail-closed guard this packet plans to retire safely) ·
`backend/lib/finance/financeDomainService.js` (the in-memory domain service — read path entering this design) ·
`backend/lib/finance/projections/ledgerProjection.js` (already exists; backs the ledger / profit-loss / balance-sheet reads) ·
`backend/lib/finance/projections/approvalQueueProjection.js` (already exists; backs the approvals reads) ·
`backend/lib/finance/projections/adapterQueueProjection.js` (already exists; backs the adapter-queue reads) ·
`backend/lib/finance/projections/auditTimelineProjection.js` (already exists; backs the audit-timeline reads)

---

## 1. Purpose and scope

Phase 4-1 freezes the design for the **safe lift** of the `ENABLE_FINANCE_PERSISTENT_EVENTS` fail-closed guard at `backend/routes/finance.v2.js:48` by replacing the route's split-brain in-memory reads with **projection-backed reads** sourced from the same Postgres event store that the route would write to.

The Phase 3-13 §8.1 and Phase 4-0 §7 slice #1 records the same fact: today the Finance v2 route writes events to an in-memory bucket (per-process domain service), the adapter / projection workers read from Postgres, and the two never meet. Flipping the persistent-events flag in this state is structural corruption: writes land in Postgres, but the route's GETs still call `service.listJournalEntries(tenantId)` / `service.getLedger(tenantId)` against the empty in-memory bucket. After a restart the bucket is empty, the `audit_events` table is non-empty, and two backend instances disagree on what the same tenant looks like.

The guard at `backend/routes/finance.v2.js:48` exists specifically to make that mistake structurally impossible. It is the safest possible posture: refuse to mount the route entirely under the dangerous combination, force operators to read the error and stop. Phase 4-1 does **not** propose removing the guard; it proposes the design that earns the right to remove the guard later.

The lift is two paired slices in §7 of the Phase 4-0 design freeze:

- **Slice #1 — Persistent-events route lift** — make the route's write path emit into the Postgres event store correctly (today the write path is already in-memory; the lift is the read-path side, the boundaries that prevent split-brain, and the test surface that proves no silent fallback).
- **Slice #2 — Projection-backed reads** — switch the route's 5 GET endpoints to source from Postgres-backed projections (and a direct `audit_events` query for the one case without a dedicated projection) so reads and writes see the same world.

Phase 4-0 §11.2 row 1 verifies slice #1 (route lift) and Phase 4-0 §11.2 row 2 verifies slice #2 (projection-backed reads) at the Phase 4-19 activation gate. **They are paired in this design packet but verified separately at the gate.** Phase 4-1 explicitly preserves that distinction throughout.

**Inputs:**

- Phase 4-0 §7 slices #1 + #2 contracts.
- The 4 already-committed projections (ledger, approval_queue, adapter_queue, audit_timeline) plus the projection runner + Postgres-backed projection store.
- The Postgres event store (`audit_events` table from migration 169, append-only with immutability triggers).
- The current Finance v2 route surface (`backend/routes/finance.v2.js`) — 5 GET endpoints + the fail-closed guard.
- The `replayValidationHarness` (replay determinism — required to make projection-backed reads trustworthy).

**Outputs of this packet:**

- §3: Current architecture summary — what split-brain looks like today.
- §4: Read-source mapping per route — which projection (or direct event-store query) each GET will consume.
- §5: The route construction + env-gating sequence.
- §6: The no-silent-fallback contract.
- §7: Migration / replay / cursor dependency on `audit_events` + `projection_state` being healthy.
- §8: The boot-time wiring of projection-backed reads (what changes in route construction).
- §9: Required test surface before the guard can be lifted.
- §10: Required staging proof before the Phase 4-19 gate may verify rows 1 + 2 as PASS.
- §11: Hard constraints.
- §12: Acceptance checklist.

**Phase 4-1 does NOT:**

- Implement any code. Implementation is a separately-dispatched packet downstream of Codex clearing this design.
- Remove the fail-closed guard at `backend/routes/finance.v2.js:48` — that removal is part of the implementation packet, gated on §9 tests + §10 staging proof.
- Flip `ENABLE_FINANCE_PERSISTENT_EVENTS` in any environment.
- Apply any migration.
- Touch staging or production.

---

## 2. Live-execution posture

| What                                                                | Status this task                                                                                                        |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| New runtime code (route / service / worker / migration / frontend)  | None.                                                                                                                   |
| Doppler `stg_stg` or `prd_prd` env var changed                      | None.                                                                                                                   |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` flipped anywhere                 | None — stays `false` / unset. Route mount guard at `backend/routes/finance.v2.js:48` remains structurally enforced.     |
| `FINANCE_PROVIDER_WRITES_ENABLED` flipped anywhere                  | None — stays `false` / unset.                                                                                           |
| Staging Supabase migration applied                                  | None.                                                                                                                   |
| Production Supabase migration applied                               | None.                                                                                                                   |
| Backend `/api/v2/finance` route HTTP call (any environment)         | None.                                                                                                                   |
| ERPNext / QuickBooks / Xero / NetSuite endpoint contacted           | None.                                                                                                                   |
| Coolify mutation                                                    | None.                                                                                                                   |
| SSH session to VPS-1 / VPS-2 / Hetzner                              | None.                                                                                                                   |
| Production action of any kind                                       | None.                                                                                                                   |
| Re-read `backend/routes/finance.v2.js` + projection store to design | **Executed.** Cite-confirmed against current code at `finance.v2.js:36-128` and `backend/lib/finance/projections/*.js`. |

---

## 3. Current architecture summary — what split-brain looks like today

The current Finance v2 route (`backend/routes/finance.v2.js`) constructs a singleton `financeDomainService` per backend process (`finance.v2.js:59-61`). That service holds an in-memory event store and an in-memory bucket of business state (journal entries, approvals, audit events, draft invoices, adapter jobs). All 5 GET endpoints serve from that in-memory state:

| Route                  | Current read source                                        | Source line             |
| ---------------------- | ---------------------------------------------------------- | ----------------------- |
| `GET /runtime/status`  | `service.getState(tenantId)` → bucket counts               | `finance.v2.js:92-128`  |
| `GET /journal-entries` | `service.listJournalEntries(tenantId)`                     | `finance.v2.js:130-138` |
| `GET /ledger`          | `service.getLedger(tenantId)` (in-memory ledger)           | `finance.v2.js:140-148` |
| `GET /profit-loss`     | `service.getProfitLoss(tenantId)` (in-memory derivation)   | `finance.v2.js:150-158` |
| `GET /balance-sheet`   | `service.getBalanceSheet(tenantId)` (in-memory derivation) | `finance.v2.js:160-168` |

The fail-closed guard at `finance.v2.js:36-55` exists because flipping `ENABLE_FINANCE_PERSISTENT_EVENTS=true` in this state would make writes hit Postgres (`audit_events` via the event store) while reads keep hitting the in-memory bucket. The split-brain is real, structural, and silent — there is no error, just two views of the same tenant that disagree.

**The guard is the safest posture today.** The cost is: the persistent-events branch is structurally unreachable, so nothing about the persistent code path is exercised in any environment. The route lift's job is to make the persistent-events branch _correct_ before the guard is lifted, not to remove the guard and hope.

---

## 4. Read-source mapping per route

This is the §7 slice #2 contract: which projection (or direct event-store query) each of the 5 GET endpoints consumes when `ENABLE_FINANCE_PERSISTENT_EVENTS=true`. The in-memory read path remains the source under the default (`false` / unset) posture; this mapping applies **only** in the persistent-events branch.

| Route                  | Persistent-events read source                                                                                                                                                                                                                       | Why this source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /runtime/status`  | Composite: `audit_events` count (per tenant) + each projection's last-applied event cursor (per tenant) from `projection_state` + `runtime.persistence` literal `'persistent'` + `runtime.mode` advanced from `'mock_read_only'` to `'persistent'`. | Runtime status is meta-state about the runtime itself, not business data. The honest signal under persistent-events is: events written = audit_events count for this tenant; projection lag = `audit_events.last_seq - projection_state.last_applied_seq` per projection; persistence flag = `'persistent'`; mode = `'persistent'` (replacing the `'mock_read_only'` placeholder that Phase 4-0 §7 slice #2 / UI Slice 1 §8.2.9 already flagged as a known honesty gap).                                  |
| `GET /journal-entries` | Direct `audit_events` query filtered by event type `journal.posted` (and `journal.reversed` for reversal lifecycle), per tenant, ordered by `seq` or `created_at`.                                                                                  | There is no dedicated `journal_entries` projection (only `ledger` consumes journal-posted events). Listing journal entries is naturally a filtered view of `audit_events` — the same source the ledger projection consumes. Avoids introducing a new projection for what is fundamentally a query against the event log. Phase 4-1 design includes an explicit decision: **prefer direct event-store query for journal entries over a new projection, because the event store is the canonical journal**. |
| `GET /ledger`          | `ledgerProjection` snapshot from `projection_state` for this tenant.                                                                                                                                                                                | Ledger is a per-account-balance read model. The ledger projection (`finance.projection.ledger`, `backend/lib/finance/projections/ledgerProjection.js`) already maintains it from `journal.posted` events. Direct consumption.                                                                                                                                                                                                                                                                             |
| `GET /profit-loss`     | Derived from `ledgerProjection` snapshot — income + expense account balances grouped per the existing P&L definition in `financeDomainService.getProfitLoss`.                                                                                       | P&L is a derived read over ledger account balances; the derivation logic in `financeDomainService.getProfitLoss` does not depend on which store the balances come from, only on the balance shape. The lift reuses the derivation against the projection-backed ledger snapshot rather than the in-memory ledger.                                                                                                                                                                                         |
| `GET /balance-sheet`   | Derived from `ledgerProjection` snapshot — asset + liability + equity account balances grouped per the existing balance-sheet definition.                                                                                                           | Same pattern as P&L — derived read over ledger balances; the lift reuses the derivation logic against the projection-backed ledger.                                                                                                                                                                                                                                                                                                                                                                       |

**Approvals, adapter queue, audit timeline are NOT in this table** because the current Finance v2 GET surface does not expose them (UI Slice 1 §8.2 enumerates these as deferred-API gaps). Slice #2's scope is **only the existing 5 GETs**; new endpoints for the gap inventory are deferred to later packets that close those API gaps. This keeps the lift's blast radius minimal and the Phase 4-19 gate verifiable against today's route surface.

**Hard rule:** Phase 4-1 implementation MUST NOT add any new GET endpoint. Any new endpoint is a separate slice with its own design freeze + Codex review.

---

## 5. Route construction and env-gating sequence

The route construction sequence in `createFinanceV2Routes(pgPool, opts)` at `backend/routes/finance.v2.js:35` becomes (post-lift):

```
1. Read process.env.ENABLE_FINANCE_PERSISTENT_EVENTS once at module-load / route-construction time.
2. If 'true':
   a. Require pgPool to be present. If absent, THROW (loud boot failure — same posture as today's guard).
   b. Construct the projection-backed read adapter (per §8) bound to pgPool.
   c. Construct the persistent-events-backed write path (already exists in the domain service via the Postgres event store).
   d. Set runtime.persistence = 'persistent', runtime.mode = 'persistent'.
3. If 'false' / unset:
   a. Construct the in-memory read adapter (current behaviour).
   b. Construct the in-memory event store and domain service (current behaviour).
   c. Set runtime.persistence = 'in_memory', runtime.mode = 'mock_read_only' (unchanged from today).
4. Either branch — proceed with route mounting using the construction-time-selected adapter.
```

**Critical design rules for §5:**

- **Single env read.** `process.env.ENABLE_FINANCE_PERSISTENT_EVENTS` is read **exactly once** at route construction time. Per-request env reads are prohibited; they introduce time-of-check / time-of-use races where a flag flipped mid-process could move some reads to projections while others stay in-memory. Route construction is the only honest decision point.
- **No runtime adapter swap.** Once the route is constructed against an adapter, it cannot switch to the other adapter without backend restart. This is intentional — it makes the persistence mode a deploy-time decision, not a runtime decision, and prevents the split-brain failure mode the guard at `finance.v2.js:48` exists to block.
- **Loud-on-misconfig.** If `ENABLE_FINANCE_PERSISTENT_EVENTS=true` and the projection-backed adapter cannot be constructed (no `pgPool`, missing `projection_state` table, missing `audit_events` table, projection store factory throws), the route MUST throw at construction time. Same fail-loud posture as the current guard — a misconfigured persistent-events deploy refuses to boot rather than silently degrading.

---

## 6. No-silent-fallback contract

**There is NO silent fallback from projection-backed reads to in-memory reads when `ENABLE_FINANCE_PERSISTENT_EVENTS=true`.**

| Failure mode                                                                                   | Required behaviour                                                                                                                                                                                  | Forbidden behaviour                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pgPool` query fails (network blip, transient DB unavailability) during a GET                  | Return 503 with `runtime: { persistence: 'persistent', degraded: true }` (or equivalent honest signal) and the upstream error class. Surface the failure to the client and the observability layer. | Catch the error and fall back to `service.listJournalEntries(tenantId)` / in-memory state. Doing so re-introduces split-brain silently. |
| Projection has not yet caught up (`projection_state.last_applied_seq < audit_events.last_seq`) | Return the projection's current snapshot AND include a `runtime.persistence_lag` field in `/runtime/status` exposing the lag. Reads remain projection-backed; lag is observable rather than masked. | Switch the read source to `audit_events` directly to "fill the gap." That hides the worker's failure to advance.                        |
| The projection-backed adapter fails to construct at boot                                       | Route refuses to mount (§5 loud-on-misconfig rule).                                                                                                                                                 | Mount the in-memory adapter instead "to keep the route available." That violates the persistence-mode-is-deploy-time rule.              |
| Operator clears `ENABLE_FINANCE_PERSISTENT_EVENTS` mid-flight                                  | No effect on the running process (env read is one-shot at construction time). Operator must restart the backend to switch modes.                                                                    | Reading env per-request and silently switching adapters mid-process.                                                                    |

**The contract:** under `ENABLE_FINANCE_PERSISTENT_EVENTS=true`, the route reads from projections or fails honestly. There is no third option.

---

## 7. Migration / replay / cursor dependency

The projection-backed read path depends on the following operator-side state being healthy before it can be trusted. Phase 4-1 design freezes the dependency contract; Phase 3-2 / Phase 3-5 / Phase 3-6 staging-execution evidence packs populate the verification.

| Dependency                                                                                    | Why required                                                                                                                                                                                                                                    | Verified by                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration 169 (`audit_events` table with immutability + no-hard-delete triggers) applied      | The write target. Without 169 applied, persistent-events writes have nowhere to land.                                                                                                                                                           | Phase 3-2 §13 evidence pack populated (`staging-migration-application-log.md` row).                                                                                                       |
| Migration 170 (`projection_state` table) applied                                              | The projection cursor + snapshot store. Without 170 applied, projection worker has nowhere to record progress.                                                                                                                                  | Phase 3-2 §13 evidence pack populated.                                                                                                                                                    |
| Migration 171 (RLS policies + no-hard-delete triggers for the finance schema) applied         | The tenant-isolation enforcement for projection_state + audit_events.                                                                                                                                                                           | Phase 3-2 + Phase 3-3 §13 evidence packs populated.                                                                                                                                       |
| `finance-projection-worker` healthy and advancing all 4 projections for the controlled tenant | Reads are projection-backed; if the worker is not advancing, projection state goes stale and `runtime.persistence_lag` climbs without bound.                                                                                                    | Phase 3-5 §13 evidence pack populated.                                                                                                                                                    |
| Replay determinism PASS for all 4 projections                                                 | If a projection re-derivation from `audit_events` does not produce the same snapshot byte-for-byte as the worker-built snapshot, the projection-backed read is not safe to trust — any disaster-recovery rebuild would produce different state. | Phase 3-6 §13 evidence pack populated (`staging-replay-drill-results.md`) — the replay-validation harness already exists at `backend/lib/finance/projections/replayValidationHarness.js`. |
| No projection in degraded / replay-required state for the controlled tenant                   | If a projection is in degraded state (`projectionRuntimeErrors.js` markers), reads should reflect that — §6 no-silent-fallback applies — but the lift cannot be claimed-as-working in staging proof while degraded.                             | Phase 3-5 §13 evidence pack + the `/runtime/status` response itself once the lift lands in staging.                                                                                       |

**Phase 4-19 row 1 (slice #1) verifies the route lift end-to-end against §8 row 6 (Phase 3-7 route activation) + row 9 (Phase 3-10 ERPNext sandbox proof).** **Phase 4-19 row 2 (slice #2) verifies the projection-backed reads end-to-end against §8 row 4 (Phase 3-5 projection worker activation) + row 5 (Phase 3-6 replay drill) + row 7 (Phase 3-8 smoke matrix).** The dependencies in §7 are the inputs that those verifications consume.

---

## 8. Boot-time wiring of projection-backed reads

The implementation packet (a separate dispatch) will introduce a **read adapter** abstraction so that the route's GET handlers do not contain branching `if (persistent) ... else (memory) ...` logic. Phase 4-1 freezes the contract for that adapter without writing the code.

**Read adapter contract (frozen by this design):**

```
interface FinanceReadAdapter {
  getRuntimeStatus(tenantId): Promise<RuntimeStatus>
  listJournalEntries(tenantId): Promise<JournalEntry[]>
  getLedger(tenantId): Promise<Ledger>
  getProfitLoss(tenantId): Promise<ProfitLoss>
  getBalanceSheet(tenantId): Promise<BalanceSheet>
}
```

- **`InMemoryFinanceReadAdapter`** — wraps the existing `financeDomainService` calls. Used when `ENABLE_FINANCE_PERSISTENT_EVENTS` is false/unset. Behaviour identical to today's route handlers. Zero behavioural change for the default posture.
- **`ProjectionBackedFinanceReadAdapter`** — wraps the Postgres-backed projection store + a direct `audit_events` query path for journal entries (per §4). Used when `ENABLE_FINANCE_PERSISTENT_EVENTS=true`. Implements §6 no-silent-fallback.

Route construction picks one adapter at construction time per §5 sequence. Route handlers call `adapter.method(tenantId)`. The adapter selection is invisible to the handler.

**Why this shape:** it makes the persistent-events branch testable in isolation (instantiate `ProjectionBackedFinanceReadAdapter` against a test pgPool and run the same handler contract tests) and prevents the per-handler branching that would re-introduce drift-by-divergence between the two read paths.

**What this packet does NOT freeze:** the precise method signatures (`Promise<JournalEntry[]>` vs `Promise<{ journalEntries: ... }>`), the field names in the return shapes (these come from the existing `financeDomainService` return shape and the implementation packet will preserve them), and the internal layering of the projection-backed adapter (whether it owns a query builder, uses raw SQL, uses Knex, etc.). Those are implementation-packet decisions.

---

## 9. Required test surface before the guard can be lifted

The implementation packet may **not** remove the fail-closed guard at `backend/routes/finance.v2.js:48` until every test row below is committed and PASS. This list is the contract Codex will enforce on the implementation packet's review.

| #   | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Lives where                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Adapter selection at construction time** — given `ENABLE_FINANCE_PERSISTENT_EVENTS=true` + a valid pgPool, route construction selects `ProjectionBackedFinanceReadAdapter`. Given the flag false/unset, route construction selects `InMemoryFinanceReadAdapter`. Verified by injecting an adapter factory and asserting which adapter was instantiated.                                                                                                 | `backend/__tests__/routes/finance.v2.adapterSelection.test.js` (new)                                                                                                               |
| 2   | **Loud boot failure on misconfig** — given `ENABLE_FINANCE_PERSISTENT_EVENTS=true` + no pgPool, route construction throws. Replaces the current `finance.v2.js:48` throw with the new equivalent check; same fail-loud posture.                                                                                                                                                                                                                           | `backend/__tests__/routes/finance.v2.adapterSelection.test.js` (new)                                                                                                               |
| 3   | **In-memory branch unchanged** — given `ENABLE_FINANCE_PERSISTENT_EVENTS=false` (or unset), every existing Finance v2 GET test in `backend/__tests__/routes/finance.v2.test.js` continues to PASS unchanged. This is the regression-protection contract: lifting the persistent-events branch must NOT alter the in-memory branch's behaviour.                                                                                                            | Existing `backend/__tests__/routes/finance.v2.test.js` (unchanged file, expanded suite)                                                                                            |
| 4   | **Projection-backed reads end-to-end** — given `ENABLE_FINANCE_PERSISTENT_EVENTS=true` + a test pgPool seeded with `audit_events` (journal.posted events) + `projection_state` rows for `ledgerProjection`, every GET returns the projection-derived response. Compares: ledger account balances, journal-entries list, P&L, balance sheet, runtime/status counts.                                                                                        | `backend/__tests__/routes/finance.v2.persistent.integration.test.js` (new)                                                                                                         |
| 5   | **No silent fallback on transient pgPool failure** — given pgPool injected to fail on a specific GET's query, the route returns 503 (or the §6 contract status code) with the runtime.persistence=`'persistent'` + degraded=`true` signal. Test does not pass if the response 200s with in-memory data.                                                                                                                                                   | `backend/__tests__/routes/finance.v2.persistent.integration.test.js` (new)                                                                                                         |
| 6   | **Projection lag is observable, not masked** — given a projection_state row whose `last_applied_seq` is behind `audit_events.last_seq`, the `/runtime/status` response surfaces the lag value. The lag does not change the GET responses' read source (they still come from projections).                                                                                                                                                                 | `backend/__tests__/routes/finance.v2.persistent.integration.test.js` (new)                                                                                                         |
| 7   | **Persistence-mode-is-deploy-time** — once the route is constructed against one adapter, flipping `process.env.ENABLE_FINANCE_PERSISTENT_EVENTS` mid-process does NOT change which adapter the route uses. Verified by mutating `process.env` after route construction and asserting the response shape is still the original adapter's.                                                                                                                  | `backend/__tests__/routes/finance.v2.adapterSelection.test.js` (new)                                                                                                               |
| 8   | **No journal-entries projection introduced** — verifies the journal-entries read goes through a direct `audit_events` query path (per §4 design decision), not through a new projection. Asserted by mocking `pgPool.query` with the expected SQL shape (or by asserting the call site is the direct-query module, not a new projection module).                                                                                                          | `backend/__tests__/routes/finance.v2.persistent.integration.test.js` (new) — minimal assertion; the design rationale is the primary defence, the test catches drift.               |
| 9   | **Replay determinism still holds** — when the projection-backed read path is exercised against a tenant whose projection was rebuilt from scratch via the replay harness, results match the worker-built path byte-for-byte. Uses the existing `replayValidationHarness`.                                                                                                                                                                                 | `backend/__tests__/lib/finance/projections/adapterQueueProjection.integration.test.js` + the lifecycle proof file already exists; this test extends to journal/ledger projections. |
| 10  | **No new mutating endpoint added** — verifies the route surface still has exactly the 6 known mutating endpoints (no expansion). Static-shape test against the route table.                                                                                                                                                                                                                                                                               | `backend/__tests__/routes/finance.v2.test.js` (existing — extends the route-shape assertion)                                                                                       |
| 11  | **`financePersistencePolicy.test.js` updated** — the existing 4/4 fail-closed-guard test file is updated so its assertions describe the new structural shape: "guard refuses to mount the route under `ENABLE_FINANCE_PERSISTENT_EVENTS=true` AND no pgPool" + "guard refuses to mount the route under `ENABLE_FINANCE_PERSISTENT_EVENTS=true` AND projection-backed adapter factory throws". Under the new wiring this is the §5 loud-on-misconfig rule. | `backend/__tests__/routes/financePersistencePolicy.test.js` (existing — adapted)                                                                                                   |

**The implementation packet must run all of the above + all 390 existing tests, and all must PASS, before the implementation packet may remove the current `finance.v2.js:48` throw.** Codex enforces this on the implementation packet review.

---

## 10. Required staging proof before Phase 4-19 may verify rows 1 + 2

Phase 4-19 gate rows 1 + 2 (§11.2 of the Phase 4-0 design freeze) cannot be marked PASS until the staging proof below is committed as a populated evidence pack. Phase 4-1 design freezes the proof contract; the operator-side execution populates it later.

| Proof item                                                                                                                                                                                                                                                                   | Verified by                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **A.** Implementation packet lands. `finance.v2.js:48` fail-closed throw removed and replaced with the §5 sequence + adapter selection.                                                                                                                                      | Codex-clear on the implementation packet review.                                     |
| **B.** Staging migrations 168/169/170/171 applied (the §7 dependency chain). Phase 3-2 §13 row populated.                                                                                                                                                                    | `staging-migration-application-log.md` §13 — operator-populated.                     |
| **C.** Staging projection worker running and healthy (per Phase 3-5). Phase 3-5 §13 row populated.                                                                                                                                                                           | `staging-worker-activation-log.md` §13 — operator-populated.                         |
| **D.** Staging Doppler `stg_stg` `ENABLE_FINANCE_PERSISTENT_EVENTS=true`, backend restarted, route mount succeeds (loud-on-misconfig rule would otherwise have thrown). Phase 3-7 §13 row populated.                                                                         | `staging-route-activation-log.md` §13 — operator-populated.                          |
| **E.** Staging POST to a mutating route (e.g., `/simulate/deal-won`) produces a real `audit_events` row in staging Postgres. Phase 3-10 §6.5 step.                                                                                                                           | `erpnext-staging-sandbox-proof-results.md` §6.5 step — operator-populated.           |
| **F.** Staging GET to `/journal-entries` returns the same row's data from the direct `audit_events` query path. (Round-trip proof for slice #2.)                                                                                                                             | `erpnext-staging-sandbox-proof-results.md` §6.5 follow-up step — operator-populated. |
| **G.** Staging GET to `/ledger` returns balances reflecting the new journal-posted event (after projection worker advances). Phase 3-8 smoke matrix step.                                                                                                                    | `staging-smoke-test-results.md` §13 — operator-populated.                            |
| **H.** Replay drill on staging reproduces the same ledger snapshot byte-for-byte. Phase 3-6 §13 row populated.                                                                                                                                                               | `staging-replay-drill-results.md` §13 — operator-populated.                          |
| **I.** Negative proof: staging Doppler `ENABLE_FINANCE_PERSISTENT_EVENTS` cleared, backend restarted, route reverts to in-memory mode (`runtime.persistence: 'in_memory'`). Confirms the persistence-mode-is-deploy-time + no-runtime-swap rules hold in a live environment. | Same as D row — captured in the same evidence pack.                                  |

**Proof items B / C / D / E / F / G / H map to specific §11.2 row 1 + row 2 dependencies in Phase 4-0.** Phase 4-19 verifies them.

---

## 11. Hard constraints (explicit restatement)

| Constraint                                                                                                                | Source                                       | Status this task                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **No code yet unless separately dispatched.**                                                                             | Slack directive                              | Confirmed.                                                                                                              |
| **Do not remove the fail-closed guard in this packet.**                                                                   | Slack directive                              | Confirmed (§5 + §9 reference its preservation; the implementation packet is what removes it under §9 + §10 conditions). |
| **Do not activate `ENABLE_FINANCE_PERSISTENT_EVENTS`.**                                                                   | Slack directive                              | Confirmed.                                                                                                              |
| **Do not apply migrations.**                                                                                              | Slack directive                              | Confirmed.                                                                                                              |
| **Do not run staging operations.**                                                                                        | Slack directive                              | Confirmed.                                                                                                              |
| **No provider writes.**                                                                                                   | Slack directive                              | Confirmed.                                                                                                              |
| **No production action.**                                                                                                 | Slack directive                              | Confirmed.                                                                                                              |
| **No new mutating endpoint introduced by §8.**                                                                            | Phase 4-0 §6 + §11.1 trigger #1              | Confirmed (§4 hard rule + §9 test #10).                                                                                 |
| **Phase 4-0 §11.2 rows 1 and 2 remain separately verifiable** — slice #2 cannot be implicitly cleared by slice #1's pass. | Phase 4-0 §11.2 P2-fix wording               | Confirmed (§4 + §8 + §9 + §10 keep the two slices structurally distinct in design, contract, tests, and proof).         |
| **`ENABLE_FINANCE_PERSISTENT_EVENTS` fail-closed posture not weakened.**                                                  | Phase 3-14 §6.3 + Phase 4-0 §11.1 trigger #2 | Confirmed — the implementation packet's removal of the throw is paired with §5's loud-on-misconfig replacement guard.   |

---

## 12. Acceptance for Phase 4-1 (this task)

This document is the Phase 4-1 deliverable when paired with the matching CHANGELOG entry. Acceptance for the **design freeze packet** (this task):

- [x] Current fail-closed guard preserved (§5 + §9 + §11 cite-confirm it is untouched until implementation packet under §9 + §10 conditions).
- [x] Persistent event writes cannot be reachable without projection-backed reads (§5 sequence makes adapter selection structural; §6 no-silent-fallback forecloses the split-brain failure mode).
- [x] Defined which Finance v2 GET endpoints move to projection-backed reads (§4 — all 5 existing GETs; no new endpoints; journal-entries via direct `audit_events` query, ledger/P&L/balance-sheet via ledger projection, runtime/status as composite).
- [x] Defined read-model sources (§4 — per-route mapping with rationale).
- [x] Defined fallback behaviour: no silent fallback to in-memory when persistent events are enabled (§6 — four-row contract with required vs forbidden behaviours).
- [x] Defined migration / replay dependency (§7 — `audit_events`, `projection_state`, replay determinism, projection worker health all chained).
- [x] Defined route construction and env-gating sequence (§5 — single-env-read at construction time; no runtime adapter swap; loud-on-misconfig).
- [x] Defined tests required before lifting the guard (§9 — 11-row test contract).
- [x] Defined staging proof required before any production planning gate can treat this as satisfied (§10 — 9-item proof contract mapped to Phase 3 evidence pack rows).
- [x] Hard constraints status-confirmed (§11).
- [x] CHANGELOG entry recording Phase 4-1 (separate change).

---

## 13. Next active item

After this packet lands and Codex reviews it:

**Next active item:** Phase 4-1 implementation packet (separately dispatched after Codex clears this design). Phase 4-2, 4-3, 4-4, 4-5, 4-15 may be authored in parallel with this design per Phase 4-0 §10.2 per-packet dependency map.
