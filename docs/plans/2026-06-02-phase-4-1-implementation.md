# Finance Ops Phase 4-1 — Implementation Plan (persistent-events route lift + projection-backed reads)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Finance Ops v2 read path durable — replace the route's fail-closed split-brain guard with a construction-time read-adapter selection so that, when `ENABLE_FINANCE_PERSISTENT_EVENTS=true`, the 5 GET endpoints read from Postgres-backed projections instead of in-memory state.

**Architecture:** Implements the Codex-cleared design freeze `docs/architecture/finance/phase-4-1-persistent-events-projection-reads-design.md` (§4 read-source mapping, §5 env-gating sequence, §6 no-silent-fallback, §8 read-adapter contract, §9 11-row test surface). Introduces a `FinanceReadAdapter` abstraction with two implementations (`InMemoryFinanceReadAdapter`, `ProjectionBackedFinanceReadAdapter`) selected once at route construction, plus the one new projection the design requires (`journal_entries`). The default posture (flag false/unset) is byte-for-byte unchanged.

**Tech Stack:** Node.js 22, Express, Postgres (event store migration 173 `audit_events` + migration 174 `projection_state`), node:test + supertest. Projection runtime: `backend/lib/finance/projections/projectionRunner.js`.

---

## ⚠️ Scope boundary — read this first

This is a **code** packet. It makes the durable path _correct and activatable_. It does **NOT** turn durability on.

**In scope (this packet):**

- New `journal_entries` projection + registration in the runner + replay-validation harness.
- `FinanceReadAdapter` abstraction + both adapters.
- §5 construction-time adapter selection that **replaces** the `finance.v2.js` fail-closed throw with an equivalent loud-on-misconfig guard.
- The §9 11-row test surface. The throw is removed **only** after every §9 test is committed and green.

**Out of scope — operator/staging-gated, NOT done here (design §10, §11):**

- Applying migrations 172/173/174/175 to any environment.
- Flipping `ENABLE_FINANCE_PERSISTENT_EVENTS` anywhere (it **stays false/unset**).
- Any staging/Coolify/Doppler/production action; the §10 staging proof; the Phase 4-20 activation gate.
- `FINANCE_PROVIDER_WRITES_ENABLED` stays false. No provider writes. No new mutating endpoint.

**Consequence to state plainly:** after this packet merges, **beta finance is still in-memory/ephemeral by default.** Durability only activates when an operator (later, gated by §10) applies the migrations, flips the flag in a deploy, and restarts. This packet earns the right to do that safely.

**Commit policy:** follow the team pattern — land in the working tree, hold for Codex review; the **guard-removal commit (Task 8)** is the gated milestone. Per-task `git add`/commit below is the local TDD rhythm; do not push until Codex clears + Andrei authorizes.

---

## Pre-req decision (resolve before Task 1): the journal-posting emit-site

Design §4 flags this. The `ledgerProjection` consumes only `finance.journal.posted` (`ledgerProjection.js:19`), but `financeDomainService.js:681-684` keeps journals at `pending_approval` — **there is no `finance.journal.posted` emit-site in the current runtime.** YAGNI decision for this packet (matching the design's allowed option): **do NOT add a posting emit-site.** The `journal_entries` projection captures `pending_approval` as the terminal pre-posting status; `/ledger` under persistent mode is empty exactly when no posting events exist — which matches the in-memory branch (`getLedger` builds only from `posted`/`reversed`). Posting is a separate future slice. Document this in the projection file header + CHANGELOG so the parity is honest, not a silent gap.

---

### Task 1: `journal_entries` projection (the only new projection)

**Files:**

- Create: `backend/lib/finance/projections/journalEntriesProjection.js`
- Test: `backend/__tests__/lib/finance/projections/journalEntriesProjection.test.js`

Conform to the worker contract proven by `ledgerProjection.js` + enforced by `projectionRunner.js:204-227`: `{ projectionName, consumedEvents[], schemaVersion, handleEvent(event, store), replay(events, store), getProjection(tenantId, opts, store) }`. Maintain a per-`journal_entry_id` snapshot keyed by status (`draft` / `pending_approval` / `posted` / `reversed`). Return the list in the **exact shape** of `service.listJournalEntries()` (`id`, `aggregate_id`, `status`, `created_at`, plus any fields that flow through today).

**Step 1: Write the failing test** (design §9 row 8 — full-state coverage):

```js
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createJournalEntriesProjectionWorker, {
  JOURNAL_ENTRIES_PROJECTION_NAME,
} from '../../../../lib/finance/projections/journalEntriesProjection.js';

const T = '00000000-0000-4000-8000-000000000011';
// A tiny in-memory store matching the runner's buffered-store surface.
function memStore() {
  const m = new Map();
  return {
    get: (k) => m.get(k),
    set: (k, v) => m.set(k, v),
    delete: (k) => m.delete(k),
    keys: () => [...m.keys()],
    clear: () => m.clear(),
  };
}
const evt = (event_type, journal_entry_id, status, created_at, extra = {}) => ({
  id: `evt_${journal_entry_id}_${event_type}`,
  tenant_id: T,
  event_type,
  created_at,
  payload: {
    journal_entry: {
      id: journal_entry_id,
      aggregate_id: journal_entry_id,
      status,
      created_at,
      ...extra,
    },
  },
});

describe('journal_entries projection — full status coverage', () => {
  test('snapshots one entry per lifecycle stage with the right status', () => {
    const w = createJournalEntriesProjectionWorker();
    const store = memStore();
    const events = [
      evt('finance.journal.draft_created', 'j_draft', 'draft', '2026-06-01T00:00:01Z'),
      evt('finance.approval.requested', 'j_pending', 'pending_approval', '2026-06-01T00:00:02Z'),
      evt('finance.journal.reversal_requested', 'j_rev', 'reversed', '2026-06-01T00:00:03Z'),
    ];
    w.replay(events, store);
    const out = w.getProjection(T, {}, store);
    const byStatus = Object.fromEntries(out.map((e) => [e.status, e]));
    assert.equal(byStatus.draft.id, 'j_draft');
    assert.equal(byStatus.pending_approval.id, 'j_pending');
    assert.equal(byStatus.reversed.id, 'j_rev');
    assert.equal(out.length, 3);
  });

  test('a later lifecycle event for the same entry advances its status', () => {
    const w = createJournalEntriesProjectionWorker();
    const store = memStore();
    w.handleEvent(
      evt('finance.journal.draft_created', 'j1', 'draft', '2026-06-01T00:00:01Z'),
      store,
    );
    w.handleEvent(evt('finance.approval.approved', 'j1', 'posted', '2026-06-01T00:00:05Z'), store);
    const out = w.getProjection(T, {}, store);
    assert.equal(out.length, 1);
    assert.equal(out[0].status, 'posted');
  });
});
```

**Step 2: Run, expect FAIL.** `cd backend && node --test __tests__/lib/finance/projections/journalEntriesProjection.test.js`
**Step 3: Implement** — `consumedEvents = ['finance.journal.draft_created','finance.journal.validation_failed','finance.approval.requested','finance.approval.approved','finance.journal.reversal_requested','finance.journal.posted','finance.journal.reversed']`; `handleEvent`/`replay` upsert `store.set(journal_entry_id, snapshot)` from `event.payload.journal_entry`; `getProjection` returns `store.keys().map(...)` sorted newest-first by `created_at` (mirroring `JournalEntriesList`/`listJournalEntries`). Map each event_type → status if the payload omits it. Header documents the posting decision above.
**Step 4: Run, expect PASS. Step 5: Stage (hold).**

---

### Task 2: Register `journal_entries` in the runner default set + replay harness

**Files:**

- Modify: the default projection wiring (`backend/lib/finance/financeWorkerCommon.js` — `createDefaultHarnessConfig`, which today wires ledger/approval_queue/adapter_queue/audit_timeline) and `backend/lib/finance/projections/replayValidationHarness.js` (registered-projection set).
- Test: extend `backend/__tests__/lib/finance/financeRuntimeGate.test.js` / the existing "createDefaultHarnessConfig wires the N real projection workers" test.

**Step 1: Failing test** — assert the default harness now registers **5** workers including `finance.projection.journal_entries`, and the replay-validation registered set includes it.
**Step 3: Implement** — add `createJournalEntriesProjectionWorker()` to the default registration array + the replay harness set. **Step 4: PASS** (design §7 "all registered projections" now = 5). **Step 5: Stage.**

---

### Task 3: `InMemoryFinanceReadAdapter` (default posture, zero behavior change)

**Files:**

- Create: `backend/lib/finance/readAdapters/inMemoryFinanceReadAdapter.js`
- Test: `backend/__tests__/lib/finance/readAdapters/inMemoryFinanceReadAdapter.test.js`

Implements the §8 contract: `getRuntimeStatus`, `listJournalEntries`, `getLedger`, `getProfitLoss`, `getBalanceSheet` — each delegating to the existing `financeDomainService` method. Pure pass-through.

**Step 1: Failing test** — given a seeded domain service, the adapter's methods return exactly `service.method(tenantId)`. **Step 3: Implement** thin wrapper. **Step 4: PASS. Step 5: Stage.**

---

### Task 4: `ProjectionBackedFinanceReadAdapter` (§4 sources + §6 no-silent-fallback)

**Files:**

- Create: `backend/lib/finance/readAdapters/projectionBackedFinanceReadAdapter.js`
- Test: `backend/__tests__/lib/finance/readAdapters/projectionBackedFinanceReadAdapter.test.js`

Holds the projection workers + a pg-backed `storeProvider` (`projectionStore.pg.js`) + an `auditEventsReader` (per-tenant `count` + `last_seq`). Read sources per design §4:

- `listJournalEntries` → `journalEntriesWorker.getProjection(tenantId, {}, await storeProvider.getLiveStore('finance.projection.journal_entries', tenantId))` — **full status set, never a posted/reversed-only audit_events query**.
- `getLedger` → `ledgerWorker.getProjection(...)`; `getProfitLoss`/`getBalanceSheet` → reuse `accountingEngine.buildProfitAndLoss`/`buildBalanceSheet` over the projection-backed ledger accounts (derivation is store-agnostic).
- `getRuntimeStatus` → composite: `audit_events` count + per-projection cursor from `projection_state` + `persistence: 'persistent'` + `mode: 'persistent'` + a `persistence_lag` map (`audit_events.last_seq − projection_state.last_applied_seq`).

**§6 no-silent-fallback (design §6 table):**

- On a pg query error in any read → **throw a typed `FinanceReadDegradedError`** (carries the upstream error class); the route maps it to **503** with `runtime: { persistence: 'persistent', degraded: true }`. NEVER catch-and-return in-memory state.
- Projection lag → still return the projection snapshot; surface lag in `getRuntimeStatus`, do not switch source.

**Step 1: Failing tests** (design §9 rows 4, 5, 6) using a fake pg store seeded with a full journal lifecycle:

- end-to-end reads return projection-derived values incl. draft + pending_approval entries;
- a store injected to throw on a given read → adapter throws `FinanceReadDegradedError` (no in-memory data);
- lag present → `getRuntimeStatus().persistence_lag` exposes it, reads unaffected.
  **Step 3: Implement. Step 4: PASS. Step 5: Stage.**

---

### Task 5: Route construction §5 sequence — adapter selection + loud-on-misconfig

**Files:**

- Modify: `backend/routes/finance.v2.js` (the `createFinanceV2Routes(pgPool, opts)` head — currently the fail-closed throw at the top).
- Test: `backend/__tests__/routes/finance.v2.adapterSelection.test.js` (new).

Implement design §5: read `process.env.ENABLE_FINANCE_PERSISTENT_EVENTS` **once** at construction. If `true` → require `pgPool` (else **throw** — the new loud-on-misconfig guard) and build `ProjectionBackedFinanceReadAdapter`; else build `InMemoryFinanceReadAdapter`. Accept `opts.readAdapterFactory` for test injection. **Do NOT remove the existing fail-closed throw yet** — guard it behind the new selection so both exist until Task 8.

**Step 1: Failing tests** (design §9 rows 1, 2, 7):

- flag true + pgPool → selects `ProjectionBacked...`; flag false → selects `InMemory...` (assert via injected factory spy);
- flag true + no pgPool → construction throws;
- mutating `process.env` **after** construction does not change the selected adapter (deploy-time, not per-request).
  **Step 3: Implement. Step 4: PASS. Step 5: Stage.**

---

### Task 6: Wire the 5 GET handlers through the adapter (regression-protect the in-memory branch)

**Files:**

- Modify: `backend/routes/finance.v2.js` (the `/runtime/status`, `/journal-entries`, `/ledger`, `/profit-loss`, `/balance-sheet` handlers call `adapter.method(req.financeTenantId)`).
- Test: existing `backend/__tests__/routes/finance.v2.routes.test.js` + `finance.v2.read-routes.test.js` (design §9 row 3 — must pass **unchanged**).

Map a thrown `FinanceReadDegradedError` to a 503 with the §6 honest signal in a shared error handler.

**Step 1:** Run the existing finance route suites — they must stay green with the in-memory adapter (default). **Step 3:** Adjust handlers to delegate. **Step 4:** Existing suites green (zero behavior change for flag-false). **Step 5: Stage.**

---

### Task 7: Static route-shape guard — no new endpoint

**Files:** extend `backend/__tests__/routes/finance.v2.routes.test.js` (design §9 row 10).

Assert the mounted route table still has exactly the known GETs + the 6 known mutating endpoints — no expansion. **Stage.**

---

### Task 8: Remove the fail-closed throw (GATED — only after Tasks 1–7 green)

**Files:**

- Modify: `backend/routes/finance.v2.js` — delete the original `ENABLE_FINANCE_PERSISTENT_EVENTS === 'true'` throw; the §5 selection's loud-on-misconfig guard (Task 5) now provides the fail-loud posture.
- Modify: `backend/__tests__/routes/financePersistencePolicy.test.js` (design §9 row 11) — re-express the 4 assertions as: "throws under flag=true + no pgPool" and "throws under flag=true + adapter factory throws."

**Step 1:** Confirm Tasks 1–7 all green + the full finance backend suite green. **Step 2:** Remove the throw; update the policy test. **Step 3:** Run `financePersistencePolicy.test.js` + `finance.v2.adapterSelection.test.js` — both green. **Step 4: Stage.** This is the **Codex-gated milestone** — do not commit/push this task until Codex clears.

---

### Task 9: Full regression + CHANGELOG + docs

**Files:** `CHANGELOG.md`; reference `docs/architecture/finance/phase-4-1-persistent-events-projection-reads-design.md`.

**Step 1:** Run the whole finance backend suite (lib + projections + routes + workers) + the frontend finance suite — all green, including the **390+ existing tests unchanged** (design §9 closing rule). **Step 2:** CHANGELOG entry: persistent-events route lift + projection-backed reads + new `journal_entries` projection; **note the flag stays false and durability is operator-gated (design §10).** **Step 3:** Stage.

---

## Acceptance (maps to design §12 + §9)

- Adapter selected once at construction; flag-false branch byte-for-byte unchanged (existing finance suites green).
- `journal_entries` projection preserves the full status set (draft/pending_approval/posted/reversed); registered in runner + replay harness.
- No silent fallback: pg failure → 503 honest signal, never in-memory data; lag observable in `/runtime/status`.
- Persistence is deploy-time (one env read, no runtime swap).
- Fail-closed posture preserved via the §5 loud-on-misconfig guard before the old throw is removed.
- No new endpoint; no migration applied; no flag flipped; no staging/prod action.

## What still gates real durability after this lands (NOT this packet — design §10)

Apply migrations 172–175 in staging → projection worker healthy (incl. `journal_entries`) → Doppler `stg_stg` flag on + restart (route mounts) → POST produces an `audit_events` row → GET round-trips it via projections → replay drill byte-identical → negative proof (flag off → reverts to in-memory). Only then may the Phase 4-20 gate mark rows 1+2 PASS and production activation be considered.
