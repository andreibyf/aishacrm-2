# Finance Test/Live Data Mode — Design

**Date:** 2026-06-03
**Status:** Approved — building
**Branch:** `feat/finance-test-live-data-mode` (stacked on `feat/finance-ops-phase4-1-persistent-reads-migration`)
**Foundation:** rides on the held Phase 4-1 persistent reads+writes migration (the durable engine).

## Resolved decisions

- **A — Projection partitioning:** add `is_test_data` to the projection-store key (clean separation).
- **B — In-memory adapter:** KEEP as the fallback when persistent infra isn't deployed. Consequence:
  **test mode works today on the in-memory engine** (create/see/clear entries immediately) and
  upgrades to durable persistent test data once the migration is deployed.
- **C — Merge order:** keep this stacked on the held migration (no un-holding required).
- **D — Default mode:** new finance-enabled tenant defaults to `test`.
- **Creation UI (new scope):** the Finance Ops console is read-only today (Slice 1). To "create
  entries", add superadmin/test-mode creation controls (journal draft, invoice, simulate, approve)
  to the console, gated so they only appear/act when permitted.

## Engine behavior by deployment state

| Persistent infra deployed? | Test mode engine                   | "Clear test data"                                       |
| -------------------------- | ---------------------------------- | ------------------------------------------------------- |
| No (today)                 | in-memory (ephemeral, per-process) | reset the in-memory buckets                             |
| Yes                        | persistent, `is_test_data`-flagged | delete test events + rebuild test-partition projections |

Live mode requires the persistent engine (fails closed without it).

## Goal

Give the finance module a **per-tenant Test ⟷ Live data mode**, controlled by **superadmin**,
so a tenant can generate throwaway **test** finance data (clearly indicated, durable,
purgeable) separate from **live** real data — replacing the misleading `mock_read_only`
presentation with an honest, operator-controlled mode.

## Motivation

- The finance console currently advertises `runtime.mode: 'mock_read_only'` (a hardcoded
  placeholder in `inMemoryFinanceReadAdapter.js`), making the working module look like a mock.
- There is no way to keep **test** finance data separate from **real** data within a tenant.
- The CRM already has a test-data concept — `is_test_data = true` rows, purged per-tenant by
  the QA console's "Clear Test Data" button (`POST /api/testing/cleanup-test-data`). Finance is
  not wired into it.

## Why mode-based (all-or-nothing), not per-record

The CRM's `is_test_data` flag is set **per record by the user at creation**, which works
because every CRM record is directly user-created. **Finance is event-sourced and
cascading**: one action spawns many records — `simulateDealWon` creates a journal entry + an
approval + a draft adapter job + several audit events; approving spawns more. The human only
initiates the parent; the engine creates the children. Per-record flagging would tag the
parent but leak unflagged children into the **live** ledger. So finance needs **all-or-nothing,
mode-based** tagging: while a tenant's finance module is in test mode, the engine
auto-stamps **every** finance write (parent + all spawned events) as test data.

## Decisions (locked via brainstorm)

1. **Per-tenant `finance_data_mode` (`test` | `live`)**, changeable by **superadmin only**,
   surfaced in **Finance → Settings**.
2. **Persistent, not in-memory.** Both test and live run on the durable engine; `is_test_data`
   distinguishes them. (Resolves the `mock_read_only` complaint.)
3. **Auto-flag, all-or-nothing.** In test mode every finance event the engine appends is
   stamped `is_test_data = true`; the human never flags individual records.
4. **Segregated on read.** Test data must NEVER appear in the live ledger/P&L/balance-sheet.
   `is_test_data` is a partition dimension alongside `tenant_id` for reads, writes, and
   projections.
5. **Non-destructive, reversible switch.** Flipping mode never deletes data. Switching to Live
   leaves test data **dormant** (retained, flagged, invisible in Live); switching back to Test
   re-exposes it. The switch dialog **warns** when test data exists and offers a one-click
   "Switch & Clear", but never auto-wipes or hard-blocks.
6. **Ties into the existing QA "Clear Test Data" button** (per-tenant). Clearing finance test
   data deletes the tenant's `is_test_data` finance events and drops/rebuilds the test-partition
   projections.

## Architecture

### 1. Per-tenant mode setting

- A per-tenant finance setting `finance_data_mode` (`'test'` | `'live'`), via the existing
  module/tenant settings mechanism (cf. `/api/modulesettings`). **Default `'test'`** (a newly
  enabled tenant explores safely; superadmin promotes to `'live'` when ready).
- **Superadmin-gated** write: only superadmin can change it (enforced server-side, not just UI).
- Read at request time (per-request), not boot — this is the runtime-switchable replacement
  for the deploy-time `ENABLE_FINANCE_PERSISTENT_EVENTS` decision.

### 2. `is_test_data` on finance events

- Add `is_test_data BOOLEAN NOT NULL DEFAULT false` to `finance.audit_events` (the event store).
- The event envelope carries `is_test_data`. Stamping happens at the **append boundary** in the
  persistent write path (`persistentWriteRunner` / the pg event store), keyed off the tenant's
  current mode — so every event (parent and every spawned child) is tagged consistently. Because
  all finance state derives from events, tagging the events tags everything.

### 3. Read/write partitioning by `(tenant_id, is_test_data)`

The durable engine already scopes everything by `tenant_id`; we add `is_test_data` as a second
scope dimension ("test" behaves like a virtual sub-partition of the tenant):

- **Writes:** events stamped with the mode's `is_test_data`.
- **Event replay** (`eventStore.replay`) scoped to `(tenant_id, is_test_data)`.
- **Projections:** `projection_state` and the projection snapshot store keyed by
  `(projectionName, tenant_id, is_test_data)` — test and live projections are independent.
- **Reads:** the read adapter reads the partition for the tenant's current mode. A test journal
  entry is structurally absent from the live ledger.

**Decision to confirm (§ Open A):** partition projections by adding `is_test_data` to the
projection-store key (recommended — clean separation) vs. replay-time filtering (simpler storage
but still needs per-mode snapshots). Recommended: partition key.

### 4. Clear test data (QA integration)

- Extend the per-tenant cleanup to finance: delete `finance.audit_events WHERE is_test_data =
true [AND tenant_id = $1]`, then drop the test-partition `projection_state` rows for the tenant
  (the test partition is now empty; live partition untouched). Live events/projections are never
  rebuilt or touched.
- Wire into the existing QA console button (`POST /api/testing/cleanup-test-data`) — either by
  adding a finance branch to that route, or a dedicated finance-cleanup endpoint the QA console
  also calls. Per-tenant (the button already supports `tenant_id`).

### 5. Non-destructive switch + dormant indicator

- Changing `finance_data_mode` only repoints reads/writes to the other partition. No deletion.
- **Switch dialog** (superadmin): when switching to Live and test data exists — _"This tenant has
  N test records. Switching to Live hides them (retained until cleared). [Switch to Live] · [Switch
  & Clear test data] · [Cancel]."_
- **Dormant-data indicator:** even in Live, Finance → Settings shows _"⚠ N dormant test records
  exist for this tenant — Clear."_ so retained test data is never forgotten.

### 6. Honest runtime mode + the legacy in-memory adapter

- `runtime.mode` (and the console banner) report the real mode: `test` / `live` (persistent),
  not `mock_read_only`. Fixes the original complaint and closes design gap §8.2.9.
- **In-memory adapter fate (§ Open B):** with test now persistent-flagged, the in-memory adapter
  is no longer the "test" path. Recommended: keep it as the **fallback only when the persistent
  infra is unavailable** (a deploy without PG projections), reporting `in_memory_draft_only` (not
  `mock_read_only`); retire `mock_read_only` entirely. Confirm whether to keep the fallback or
  hard-require persistent infra for finance.

## UI

- **Finance → Settings (superadmin):** a Test/Live toggle, the dormant-test indicator, a Clear
  action, and the switch confirm dialog. Non-superadmins see the current mode read-only.
- **Finance console:** a prominent, unmistakable banner whenever the tenant is in **Test mode**
  — _"TEST DATA — not real. In-tenant sandbox; clearable."_ — so no user mistakes it for live.

## Foundation / dependency

- This feature requires the **persistent engine** from the held migration
  (`feat/finance-ops-phase4-1-persistent-reads-migration`) — durable reads + writes are the
  substrate that makes "persistent test data" possible. **Decision (§ Open C):** merge the
  migration to main first, then rebase this onto main; or keep this stacked and land them
  together. Until the persistent infra (PG projection tables + worker) is actually deployed,
  "Live" (and persistent "Test") cannot serve real data.

## Open decisions for sign-off

Resolved — see "Resolved decisions" at the top (A: partition key · B: keep in-memory fallback ·
C: stacked on the held migration · D: default `test` · + Creation UI scope).

## Risks

- **Scope:** event-store schema change (`is_test_data` column + backfill), projection
  partitioning (touches the held migration's projection layer), mode setting + superadmin gate,
  QA-cleanup integration with projection rebuild, and the UI. Non-trivial.
- **Depends on deploying the held migration** + standing up PG projection infra; inert until then.
- Multi-instance: test data is now durable (in PG), so — unlike the old in-memory idea — it IS
  shared across backend instances and survives restarts (a benefit of going persistent).

## Testing strategy (high level)

- Mode setting: superadmin-only write enforced server-side; per-request read.
- Auto-flag: a write in test mode stamps `is_test_data` on the parent AND every spawned event
  (simulateDealWon → journal + approval + adapter job + events all flagged).
- Segregation: a test journal entry never appears in the live ledger/reads; live data never
  appears in test reads.
- Non-destructive switch: test→live retains + hides test data; back→test re-exposes it; counts
  match.
- Clear: per-tenant clear deletes test events + test projections only; live untouched.
- UI: banner in test mode; superadmin gate; switch dialog warn + optional clear.

## Out of scope

- Per-record finance test flagging (rejected — see "Why mode-based").
- Cross-tenant test data.
- Changing the CRM's existing per-record `is_test_data` model for non-finance entities.
