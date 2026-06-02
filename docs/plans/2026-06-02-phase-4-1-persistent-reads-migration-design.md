# Phase 4-1 Persistent Reads + Writes Migration — Design

**Date:** 2026-06-02
**Status:** Approved (brainstorm)
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
  instance, while the projection-backed reads *do* see it. Divergence (Codex PR #632 P1
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
3. **Advance** — synchronously run the projection runner's catch-up in-process
   (cursor-guarded, idempotent) for the affected projections so the read models reflect
   the write.
4. **Return** the authoritative command result.

## Components

| Component | Type | Notes |
|---|---|---|
| `financeDomainReplay.js` → `rebuildBucketFromEvents(events)` | NEW | Folds finance events into `{journalEntries, invoices, approvals, adapterJobs}`. Riskiest piece → pinned by an equivalence test. |
| `invoiceProjection.js` (`finance.projection.invoices`) | NEW | Consumes `finance.invoice.draft_created` / `draft_updated`; returns full invoice snapshots (mirrors `journalEntriesProjection`). Registered in runner, read-adapter workers, worker deployment, replay harness. |
| Read adapter interface | EXTEND | `listInvoices`, `listApprovals`, `listAdapterJobs` on both adapters. |
| `getRuntimeStatus` invoices count | FIX | Wire the real invoice-projection count (currently hardcoded `0`). |
| Persistent write orchestration | NEW | Per-request hydrate → run → advance, in `finance.v2.js` (or a small helper). |
| Boot guard | REMOVE | Once reads + writes are durable. The no-pool guard (persistent requires a pool) stays. |

## Read-your-write & advancement failure

Append is the commit point. Synchronous advancement is best-effort-strong: retry N times;
on persistent failure, log and return the authoritative result (eventual consistency for
that one request). Never 500 a durable write.

## Concurrency / deployment

Synchronous in-process advancement must coexist with the async projection worker without
double-applying or clobbering cursors → **`projection_state` row-locking
(`SELECT … FOR UPDATE`) during cursor advancement**. Verify `projectionStore.pg.js` already
locks; add if missing. Advancement is cursor-guarded so double-processing is a no-op.

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
- **Durable mutation** (core Codex fix): approve a PG-persisted approval on a *fresh*
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
