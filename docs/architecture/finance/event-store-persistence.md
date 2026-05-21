# Finance Ops — Event Store Persistence (Phase 2B)

**Branch:** `feat/finance-ops-runtime`
**Status:** Phase 2B — implemented (pg adapter + migration draft). Not wired into the runtime; migration is dev-only.
**Date:** 2026-05-20
**Covers:** `backend/lib/finance/financeEventStore.pg.js` · `backend/migrations/169_finance_event_store_append_only.sql`

---

## 1. Overview

Phase 2B adds **DB-backed persistence** for the Finance Ops event store, behind the
frozen Track A runtime contract. Phase 1 / Phase 2A used an in-memory event store
(`financeEventStore.js`); events did not survive a process restart. Phase 2B
introduces a Postgres persistence adapter so the finance event stream is durable.

This phase delivers the adapter, its tests, and a dev-only migration. It does **not**
switch the runtime over — see [Non-goals](#9-non-goals).

---

## 2. The backing table — `finance.audit_events`

`finance.audit_events` (created in migration 168) **is** the Phase 2B persistent
event store. It is the canonical Postgres-backed finance event stream — **not merely
an audit side table**. It remains the event backbone until/unless a dedicated event
bus (Kafka / NATS) becomes the primary backbone in a later phase.

Its columns map 1:1 to the finance event envelope produced by
`financeEventEnvelope.js`:

```
id, tenant_id, event_type, aggregate_type, aggregate_id,
actor_id, actor_type, source, request_id, braid_trace_id,
correlation_id, causation_id, payload, policy_decision, created_at
```

There is no separate `finance.events` table. Earlier Track E notes referenced
`finance.events`; those have been corrected to `finance.audit_events` so the
architecture docs agree on a single canonical event table.

---

## 3. The dual-store model

Two interchangeable implementations expose the **same interface**
(`append`, `query`, `replay`, `getCount`):

| Store                      | File                        | Role                                            |
| -------------------------- | --------------------------- | ----------------------------------------------- |
| In-memory event store      | `financeEventStore.js`      | Default for tests and local fallback. Synchronous. |
| Postgres persistence adapter | `financeEventStore.pg.js` | Durable persistence. Asynchronous (Promise-based). |

Because the interfaces match, the pg adapter is a drop-in replacement for the
in-memory store in a later phase. Phase 2B keeps the in-memory store as the default;
it does not change `financeDomainService`.

---

## 4. Adapter interface

```js
import createFinancePgEventStore from './financeEventStore.pg.js';

const store = createFinancePgEventStore({ pool }); // pool: a pg.Pool
```

The factory requires a `pool` (anything exposing `query(text, params)`); it throws
`FinanceEventStoreError` (`FINANCE_EVENT_STORE_INVALID`) otherwise. The pool is
dependency-injected — the adapter never creates its own connection.

| Method                  | Returns                    | Notes                                                            |
| ----------------------- | -------------------------- | ---------------------------------------------------------------- |
| `append(eventPartial)`  | `Promise<event>` (frozen)  | Inserts exactly one row. Returns the DB row, frozen.             |
| `query(opts)`           | `Promise<event[]>`         | Tenant-scoped; optional `event_type` / `aggregate_type` / `aggregate_id` / `limit`. |
| `replay(tenantId)`      | `Promise<event[]>`         | Full tenant stream, `created_at ASC, id ASC`.                    |
| `getCount(tenantId)`    | `Promise<number>`          | Tenant-scoped event count.                                       |

There is **no** `update`, `delete`, `upsert`, `clear`, or `truncate` method. The
adapter is insert-only by construction.

---

## 5. Append contract

- **Caller-supplied id is honored.** If `eventPartial.id` is present it is persisted
  verbatim — this preserves correlation/causation chains where a downstream event
  cites an upstream event's id. When absent, a bare v4 UUID is generated
  (`randomUUID()` from `node:crypto`) — never an `evt_`-prefixed string.
- **`created_at` is DB-assigned.** The adapter does not include `created_at` in the
  INSERT column list; the column's `default now()` fills it. The DB clock is the
  single source of truth for replay ordering. Any `created_at` on the input is
  ignored.
- **Validation runs before any DB call:**
  - `tenant_id` is required → `FINANCE_EVENT_STORE_INVALID`.
  - `event_type` is required and must be a canonical `finance.*` event name →
    `FINANCE_EVENT_STORE_INVALID`.
  - A command name (anything ending in `Command`, e.g. `PostJournalEntryCommand`)
    is rejected as `event_type` → `FINANCE_EVENT_STORE_INVALID`. Command names
    belong in `payload.command_type` / policy metadata, never in `event_type`.
- **One row per append.** Each `append` issues a single `INSERT ... RETURNING *`
  and returns the inserted row, frozen with `Object.freeze()` for parity with the
  in-memory store.

---

## 6. Replay ordering

`replay(tenantId)` returns the full tenant stream ordered by **`created_at` ASC**,
with **`id` (uuid) ASC** as the deterministic tie-break — the frozen Track A
contract. The migration's `idx_finance_audit_events_replay` index on
`(tenant_id, created_at, id)` backs this scan. `query()` uses the same ordering.

---

## 7. Append-only enforcement

Append-only is enforced at **two independent layers**:

1. **Application layer** — the adapter exposes no mutating method. There is no code
   path that issues `UPDATE`, `DELETE`, or `ON CONFLICT`/upsert against
   `finance.audit_events`. A DB failure surfaces as `FinanceEventStoreError`
   (`FINANCE_EVENT_STORE_DB_ERROR`); the adapter never silently retries or upserts.
2. **Database layer** — migration 169 installs `finance.audit_events_immutable()`,
   a `BEFORE` trigger that raises `restrict_violation` on any `UPDATE`, `DELETE`,
   or `TRUNCATE`. This holds even for the `service_role` connection the backend
   uses (which bypasses RLS).

---

## 8. Idempotency posture

The event store does **not deduplicate**. `append` issues a plain `INSERT` — never
`ON CONFLICT`, an upsert, or a pre-insert existence check — so it never silently
merges, skips, or overwrites an event.

`finance.audit_events.id` is a primary key. A second `append` with an id that
already exists is therefore rejected by the database; the adapter surfaces it as
`FinanceEventStoreError` with code `FINANCE_EVENT_STORE_DUPLICATE_EVENT_ID`
(distinct from the generic `FINANCE_EVENT_STORE_DB_ERROR`). The conflict is
reported, never hidden — so the **domain layer** owns the retry decision (treat a
retry as already-applied, or fail). Exactly-once is a domain-layer responsibility,
per the runtime-wide "Final idempotency posture by layer" in the Finance Ops
scaffold.

> The in-memory `financeEventStore.js` has no primary key, so its A-3 posture —
> two appends with the same id yield two records — differs on this pathological
> edge. Both stores agree on the property that matters: **neither deduplicates.**

---

## 9. Migration 169

`backend/migrations/169_finance_event_store_append_only.sql` — **dev-only draft.**

- Installs the `finance.audit_events_immutable()` trigger function and the
  `trg_audit_events_no_update` / `_no_delete` / `_no_truncate` triggers.
- Adds `idx_finance_audit_events_replay` on `(tenant_id, created_at, id)`.
- Additive only — no existing table is altered or dropped; no `public.*` object is
  touched. Idempotent (`create or replace`, `drop trigger if exists`,
  `create index if not exists`) — safe to re-run.
- RLS stays disabled — finance RLS is finalized separately once the Track F
  readiness checklist clears.

**Do not apply to staging/production** until the Track F migration readiness
checklist (`security-rls-hardening.md`, Section 6) clears.

---

## 10. Non-goals

Out of scope for Phase 2B (unchanged by this work):

- Not wired into `financeDomainService` — the in-memory store stays the default.
- No new routes; no provider writes; Finance Ops stays disabled in staging/prod.
- No Kafka / NATS — Postgres is the event backbone for now.
- The migration is not applied outside dev/local.

---

## 11. Verification

- **Adapter tests** — `backend/__tests__/lib/finance/financeEventStore.pg.test.js`
  run under the Node test runner. They use a faithful in-memory `pg.Pool` double
  (no live Postgres needed in CI; same spirit as `calcomDb.test.js`) and cover
  every acceptance criterion: single-row append, caller-supplied id, generated
  bare UUID, DB-assigned `created_at`, replay ordering + UUID tie-break,
  `tenant_id` required, canonical-`finance.*` enforcement, command-name rejection,
  no mutation API, append-always duplicates, and DB-error wrapping.
- **DB trigger** — verified by applying migration 169 to a local/dev Postgres and
  confirming `UPDATE` / `DELETE` / `TRUNCATE` on `finance.audit_events` raise
  `restrict_violation`. This is a dev-environment check; it is not part of the CI
  test suite (no live DB in CI).

---

_This document is part of the Finance Ops architecture suite. Related: Track A
(Event Store contract, in the scaffold), Track D (Audit / Evidence Layer), Track E
(Adapter Runtime Contract), Track F (Security / RLS / Persistence Hardening)._
