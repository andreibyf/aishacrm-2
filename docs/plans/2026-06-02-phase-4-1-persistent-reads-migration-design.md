# Phase 4-1 Persistent Reads + Writes Migration — Design

**Date:** 2026-06-02
**Status:** Implemented (this branch — persistent mode durable end-to-end; boot guard removed; closes Codex PR #632 P1 `#3344750464`)
**Branch:** `feat/finance-ops-phase4-1-persistent-reads-migration`
**Predecessor:** PR #632 (route lift + Codex hardening), merged as `54ee9e1d`. That PR
added a boot guard so `ENABLE_FINANCE_PERSISTENT_EVENTS=true` **refuses to mount** until
the read/mutation surface is durable. This migration makes it durable and removes the guard.

## Goal

Make `ENABLE_FINANCE_PERSISTENT_EVENTS=true` fully durable **end-to-end (reads and
writes)** so the finance v2 routes can mount in persistent mode safely, then remove the
boot guard.

## Problem (why the guard exists)

In persistent mode today:

- The headline reads (`/journal-entries`, `/ledger`, `/profit-loss`, `/balance-sheet`,
  `/runtime/status`) go through the Postgres-backed projection adapter.
- But `/draft-invoices`, `/journal-drafts`, `/approvals`, `/adapter-jobs` still read the
  **in-memory domain-service buckets**, which start empty per process.
- The mutation lookups (`updateDraftInvoice`, `reverseJournalEntry`, `approveFinanceAction`)
  also read the empty buckets → a PG-persisted record 404s on a fresh process / second
  instance, while the projection-backed reads _do_ see it. Divergence (Codex PR #632 P1
  `#3344750464`).

`/audit-events` and `/evidence-packs` read through `service.listAuditEvents` /
`service.getEventStore()`, which **is** the PG event store in persistent mode — already
durable. `/adapters` reads env — durable. So only **4 reads** and **3 mutation lookups**
need migrating.

## Decisions (locked via brainstorm)

1. **Scope:** Full read **and** write in persistent mode (not read-only).
2. **Write consistency:** **Read-your-write** — after a write, the next list GET must
   reflect it → synchronous projection advancement on the write path.
3. **Write architecture (Approach A):** per write, **hydrate the tenant bucket from
   durable state, run the existing command logic unchanged**, append, then advance
   projections. Reuses 100% of the tested command logic + guards (lowest regression risk).
4. **Advancement-failure semantics:** the event append is the commit point. If
   synchronous advancement then fails, **retry a few times; if still failing, return the
   authoritative write result anyway** (async worker catches up). Never 500 a write that
   actually persisted.

## Architecture

### Reads

Route `/draft-invoices`, `/journal-drafts`, `/approvals`, `/adapter-jobs` through the read
adapter (currently they call `service.*` directly even in in-memory mode). Both adapters
return **service-shaped records**; the route handlers keep their existing field mapping
unchanged.

- `InMemoryFinanceReadAdapter`: delegates to `service.listInvoices` / `listApprovals` /
  `listAdapterJobs` (and existing `listJournalEntries` for journal-drafts).
- `ProjectionBackedFinanceReadAdapter`: reconstructs service-shaped records from the
  projections (`invoices` [new], `approval_queue`, `adapter_queue`, `journal_entries`).

### Writes (Approach A)

In persistent mode, each mutating endpoint:

1. **Hydrate** — rebuild the tenant bucket by replaying the tenant's events from the **PG
   event store** (authoritative — not from projections, so guards never see lagged state).
2. **Run** — construct a per-request domain service with the hydrated store + the PG event
   store, and run the existing command method unchanged. `bucket.find` lookups and the
   duplicate/state guards now see the full durable picture. Append-before-mutate (from
   PR #632) means the event lands in PG before the (discarded) bucket mutation.
3. **Advance** — synchronously REBUILD the affected projections in-process so the read
   models reflect the write. **As implemented** (`persistentWriteRunner.js`): the advance
   computes the distinct set of affected projection names (every worker whose
   `consumedEvents` includes any appended envelope's `event_type`) and calls
   `runner.replay(projectionName, tenantId)` for each — rebuilding it from the durable
   stream (`eventStore.replay(tenantId)`, which now includes this write's events) into a
   shadow store that is atomically promoted. Rebuild (rather than dispatching only the new
   envelopes) is robust to a projection being BEHIND the durable stream — cold start, async
   worker lag, or a durably-recorded-but-unprojected prior event (e.g. approving an approval
   whose `finance.approval.requested` is in the event store but was never projected into
   this process). It is idempotent and recovers a degraded projection.
4. **Return** the authoritative command result.

## Components

| Component                                                    | Type                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `financeDomainReplay.js` → `rebuildBucketFromEvents(events)` | NEW                           | Folds finance events into `{journalEntries, invoices, approvals, adapterJobs}`. Riskiest piece → pinned by an equivalence test.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `invoiceProjection.js` (`finance.projection.invoices`)       | NEW                           | Consumes `finance.invoice.draft_created` / `draft_updated`; returns full invoice snapshots (mirrors `journalEntriesProjection`). Registered in runner, read-adapter workers, worker deployment, replay harness.                                                                                                                                                                                                                                                                                                                 |
| Read adapter interface                                       | EXTEND                        | `listInvoices`, `listApprovals`, `listAdapterJobs` on both adapters.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `getRuntimeStatus` invoices count                            | FIX                           | Wire the real invoice-projection count (currently hardcoded `0`).                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Persistent write orchestration                               | NEW                           | Per-request hydrate → run → advance, in `finance.v2.js` (or a small helper).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Boot guard                                                   | REMOVE (done)                 | Removed once reads + writes were durable (activation capstone). The no-pool guard (persistent requires a pool) stays.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `adapterQueueProjection.js` — DRAFT materialization          | EXTEND (Task 8b, post-design) | **Not in the original design — code-review follow-up.** The `adapter_queue` projection now ALSO consumes `finance.approval.requested` and, when the payload carries an `adapter_job`, materializes it into a new `draft` bucket keyed by `adapter_job_id` (guard-skips approval.requested events with no `adapter_job`). Closes the persistent-mode parity gap where un-synced draft adapter jobs were omitted from `/adapter-jobs` and the runtime `adapter_jobs` count — persistent now matches the in-memory domain service. |

## Read-your-write & advancement failure

Append is the commit point. Synchronous advancement is best-effort-strong. **As
implemented**, the advance REBUILDS each affected projection from the durable stream via
`runner.replay(projectionName, tenantId)` (robust to a projection being behind — cold
start / worker lag / a durably-recorded-but-unprojected prior event). Advancement stays
strictly NON-FATAL: a `degraded` outcome or a thrown `replay` (infra/PG) is logged via
`logger.warn` and the loop continues; the authoritative command result (or error) is still
returned/rethrown (eventual consistency for that one request via the async worker). Never
500 a durable write. (Tradeoff: rebuild is O(stream) per affected projection per write —
acceptable for the low-write-volume finance console; incremental catch-up-since-cursor can
optimize later.)

## Concurrency / deployment

Synchronous in-process advancement (API read-your-write) must coexist with the async
projection worker: both advance the same projections from the same PG event store, so the
same event can be processed by both processes. **As implemented**, the API-side advance is a
full `runner.replay(projection, tenant)` rebuild from the durable stream into a shadow store
that is atomically promoted (not an incremental dispatch); the async worker still advances
incrementally via the cursor. The idempotency reasoning below is unchanged — every live
projection is an idempotent upsert-by-id, so a rebuild and an incremental dispatch converge
to identical read-model state.

**Finding (Task 6 — verified, not assumed).** Cross-process `projection_state` row-locking is
**deferred** because there is no exposure today:

- The **only non-idempotent** projection is the **ledger** (`ledgerProjection.js`), whose
  accumulation `debit_cents = prev + line.debit_cents` is a read-modify-write that
  double-counts under double-apply. It consumes **`finance.journal.posted` only**, which has
  **no emit-site anywhere in the codebase** — confirmed by grep; every reference is a
  projection `consumedEvents` declaration, a "no emit-site today" comment
  (`financeDomainReplay.js`), or a test fixture. So **no live event ever reaches it.**
- **Every projection that actually receives events today** — `journal_entries`, `invoices`,
  `approval_queue`, `adapter_queue` — is an **idempotent upsert-by-id** (`store.set(id, …)`
  with event-type-derived status; the approval-`requested` create is dedup-guarded). Double-
  applying any of their live events yields **identical** read-model state. Pinned by
  `backend/__tests__/lib/finance/projections/projectionDoubleApply.test.js`, which proves
  idempotency two ways per worker: (1) a direct double-`handleEvent` (cursor bypassed) and
  (2) a runner re-`dispatch` (cursor guard makes the 2nd a no-op).

The runner's cursor guard (`isAfterCursor` in `projectionRunner.js`) already makes a re-
dispatch of an already-applied event a no-op **within a process**. That guard is a per-process
read-then-write of `projection_state`; it is **not serialized across the API and worker
processes** (`projectionStore.pg.js` issues plain upserts — no `SELECT … FOR UPDATE` / no
advisory lock during the getState→commit→setState window). For idempotent projections that
gap is harmless. For the ledger it would double-count.

**REQUIRED before the journal-posting slice** (Slicing item beyond #5 / the deferred posting
flow) — pick one before any `finance.journal.posted` emit-site goes live:

- **(a) cross-process serialization** of the per-`(projection, tenant)` read-modify-write on
  `finance.projection_state` — e.g. `SELECT … FOR UPDATE` on the row or
  `pg_advisory_xact_lock` keyed by `(projection_name, tenant_id)` in `projectionStore.pg.js`,
  held across `getState → getLiveStore → buffer.commit() → setState`; **or**
- **(b) an idempotent ledger rewrite** keying each contribution by journal/event id, so
  re-applying the same event is a no-op (removes the read-modify-write hazard entirely).

This requirement is also documented as a comment block next to `applyJournalPosted` in
`ledgerProjection.js`.

## Error handling

§6 no-silent-fallback preserved: read failures → `503 FinanceReadDegradedError`, never
in-memory fallback. Writes hydrate from the **event store** (not projections), so a
projection outage never corrupts a write's guard checks.

## Testing

- **Bucket-rebuild equivalence** (per command type): drive a command sequence in-memory,
  capture the bucket; replay the same events through `rebuildBucketFromEvents`; assert
  identical bucket.
- **Read-adapter parity** (per endpoint): ProjectionBacked output == InMemory output for
  the same event history.
- **Read-your-write**: persistent-mode POST then immediate GET reflects the write.
- **Durable mutation** (core Codex fix): approve a PG-persisted approval on a _fresh_
  process (empty in-process bucket) → succeeds, not 404.
- **Invoice projection** unit tests (`draft_created` / `draft_updated` folds).
- **Guard removal**: persistent mode mounts with a pool; refuses without one.

## Slicing (each independently testable)

1. Invoice projection + wire its count.
2. Read routing: the 4 endpoints through the adapter (+ ProjectionBacked
   `listInvoices` / `listApprovals` / `listAdapterJobs`).
3. `rebuildBucketFromEvents` + equivalence tests.
4. Persistent write orchestration + synchronous advancement + `projection_state` locking.
5. Remove the boot guard; flip the route tests to mount-with-pool.

## Out of scope

- New mutating endpoints (hard constraint from the Phase 4-1 freeze).
- Provider writes (`FINANCE_PROVIDER_WRITES_ENABLED` stays default-closed).
- Journal posting flow (journals remain draft / pending_approval).
