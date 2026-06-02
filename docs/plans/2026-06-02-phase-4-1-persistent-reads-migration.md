# Phase 4-1 Persistent Reads + Writes Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Each code task is TDD: write the failing test, run it red, implement, run it green, commit.

**Goal:** Make `ENABLE_FINANCE_PERSISTENT_EVENTS=true` durable end-to-end (reads + writes) so the finance v2 routes mount safely in persistent mode, then remove the boot guard added in PR #632.

**Architecture:** Reads route the 4 still-service-backed GETs through the read adapter (backed by projections in persistent mode, incl. a NEW invoice projection). Writes, in persistent mode, rebuild the tenant bucket from the PG event store, run the existing command logic unchanged, append, then synchronously advance projections (read-your-write). Advancement failure after a committed append returns the authoritative result and lets the async worker catch up.

**Tech stack:** Node 22 (ESM, `node:test`), Express, Postgres (`pg`), the finance event store + projection runtime (`backend/lib/finance/projections/`).

**Design doc:** `docs/plans/2026-06-02-phase-4-1-persistent-reads-migration-design.md`

**Conventions for every task below:**
- Run a single backend test file with: `cd backend && node --test <path>` (pass explicit file paths — never a directory, which produces a spurious "Cannot find module").
- The repo pre-commit gate can hang on the CARE step's open Redis handle. Run `npx prettier --write <files>` and `npx eslint <files>` manually; commit with `--no-verify` only if the gate hangs after lint/format/tests are green. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Do NOT stage `scripts/create_prs.ps1`, `scripts/gh_diag.*`, `scripts/pr_output.txt`, or `scripts/codebase_review.py` (another agent's / the user's local files).

---

## Slice 1 — Invoice projection

### Task 1: `invoiceProjection.js`

**Files:**
- Create: `backend/lib/finance/projections/invoiceProjection.js`
- Test: `backend/__tests__/lib/finance/projections/invoiceProjection.test.js`

**Pattern to mirror:** `backend/lib/finance/projections/journalEntriesProjection.js` (worker shape: `projectionName`, `consumedEvents`, `schemaVersion`, `handleEvent(event, store)`, `replay(events, store)`, `getProjection(tenantId, opts, store)`; store API = `get/set/delete/keys/clear`).

**Event sources** (`backend/lib/finance/financeDomainService.js`): `finance.invoice.draft_created` (payload `{ invoice }`) and `finance.invoice.draft_updated` (payload `{ invoice }`). Both carry the full post-transition invoice. Upsert by `invoice.id`.

**Step 1 — failing test:**
```js
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createInvoiceProjectionWorker } from '../../../../lib/finance/projections/invoiceProjection.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';

const T = '00000000-0000-4000-8000-000000000060';
function evt(type, invoice, id, at) {
  return { id, tenant_id: T, event_type: type, created_at: at, payload: { invoice } };
}

describe('invoiceProjection', () => {
  test('projectionName + consumes draft_created/draft_updated', () => {
    const w = createInvoiceProjectionWorker();
    assert.equal(w.projectionName, 'finance.projection.invoices');
    assert.ok(w.consumedEvents.includes('finance.invoice.draft_created'));
    assert.ok(w.consumedEvents.includes('finance.invoice.draft_updated'));
  });

  test('upserts full invoice snapshots in insertion order; update merges in place', async () => {
    const w = createInvoiceProjectionWorker();
    const provider = createMemoryProjectionStoreProvider();
    const store = await provider.getLiveStore(w.projectionName, T);
    w.replay(
      [
        evt('finance.invoice.draft_created',
          { id: 'inv1', tenant_id: T, status: 'draft', total_cents: 100, memo: 'a' },
          'e1', '2026-06-01T00:00:01Z'),
        evt('finance.invoice.draft_created',
          { id: 'inv2', tenant_id: T, status: 'draft', total_cents: 200 },
          'e2', '2026-06-01T00:00:02Z'),
        evt('finance.invoice.draft_updated',
          { id: 'inv1', tenant_id: T, status: 'draft', total_cents: 150, memo: 'b' },
          'e3', '2026-06-01T00:00:03Z'),
      ],
      store,
    );
    const rows = w.getProjection(T, {}, store);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 'inv1');
    assert.equal(rows[0].total_cents, 150);
    assert.equal(rows[0].memo, 'b');
    assert.equal(rows[1].id, 'inv2');
  });
});
```

**Step 2 — run red:** `cd backend && node --test __tests__/lib/finance/projections/invoiceProjection.test.js` → FAIL (module not found).

**Step 3 — implement** (mirror journalEntriesProjection):
```js
export const INVOICE_PROJECTION_NAME = 'finance.projection.invoices';

const CONSUMED_EVENTS = ['finance.invoice.draft_created', 'finance.invoice.draft_updated'];

function applyEvent(event, store) {
  const invoice = event?.payload?.invoice;
  if (invoice && invoice.id) store.set(invoice.id, invoice);
}

export function createInvoiceProjectionWorker() {
  return {
    projectionName: INVOICE_PROJECTION_NAME,
    consumedEvents: CONSUMED_EVENTS,
    schemaVersion: 1,
    handleEvent(event, store) { applyEvent(event, store); },
    replay(events, store) { for (const e of events) applyEvent(e, store); },
    getProjection(_tenantId, _opts, store) {
      return store.keys().map((key) => store.get(key));
    },
  };
}

export default createInvoiceProjectionWorker;
```

**Step 4 — run green.** **Step 5 — commit** `feat(finance): invoice projection (finance.projection.invoices)`.

### Task 2: Register the invoice worker + wire its runtime count

**Files:**
- Modify: `backend/routes/finance.v2.js` (`defaultFinanceReadAdapterFactory` `workers` object — add `invoices: createInvoiceProjectionWorker()`; import it).
- Modify: `backend/lib/finance/readAdapters/projectionBackedFinanceReadAdapter.js` (accept an `invoices` worker; `getRuntimeStatus` counts read the invoice projection instead of hardcoded `invoices: 0`).
- Check: any worker-deployment registry / replay harness that enumerates projections (`grep -rn "approvalQueue\|adapterQueue" backend/lib backend/workers 2>/dev/null` and `backend/lib/finance/projections/replayValidationHarness.js`) — register the invoice worker everywhere the other four are registered.
- Test: `backend/__tests__/lib/finance/readAdapters/projectionBackedFinanceReadAdapter.test.js` (extend `workers()` with `invoices`, assert `getRuntimeStatus().counts.invoices` reflects the projection).

**Step 1 — failing test:** extend the adapter's `workers()` helper to include `invoices: createInvoiceProjectionWorker()`, seed an invoice event into a memory provider, assert `status.counts.invoices === 1`.
**Step 2 — red. Step 3 — implement. Step 4 — green. Step 5 — commit** `feat(finance): register invoice projection + wire runtime count`.

---

## Slice 2 — Route the 4 reads through the adapter

### Task 3: Extend the read-adapter interface (both adapters)

**Files:**
- Modify: `backend/lib/finance/readAdapters/inMemoryFinanceReadAdapter.js` — add `listInvoices`, `listApprovals`, `listAdapterJobs` delegating to `service.*`.
- Modify: `backend/lib/finance/readAdapters/projectionBackedFinanceReadAdapter.js` — add the same three, reconstructing **service-shaped records** from the `invoices` / `approval_queue` / `adapter_queue` projections.
- Test: `backend/__tests__/lib/finance/readAdapters/readAdapterParity.test.js` (NEW).

**Service record shapes the projection adapter must reproduce** (so the route handlers' existing mapping is unchanged):
- `listInvoices` → array of full invoice objects (as `service.listInvoices`: `id, tenant_id, status, customer_id, currency, total_cents, created_at, updated_at, …`). Source: invoice projection (already full snapshots).
- `listApprovals` → array of full approval records (`id, tenant_id, status, target_type, target_id, requested_by, requested_at, approved_by/approved_at | rejected_by/rejected_at | cancelled_by/cancelled_at`). Source: `approval_queue` projection. Map `pending[]` → `{status:'pending', requested_by, requested_at, target_type, target_id, id:approval_id}`; `resolved[]` → `{status, target_type, target_id, id:approval_id, approved_by/approved_at}` derived from `resolved_by`/`resolved_at`+`status` (the route maps `decided_by = approved_by||rejected_by||cancelled_by`; set the field matching `status`).
- `listAdapterJobs` → array of full job records (`id, tenant_id, operation, status, attempts, created_at, updated_at, last_error`). Source: `adapter_queue` projection (concat the 4 buckets); map `adapter_job_id→id`, `error_message→last_error`.

**Step 1 — parity test:** drive a sequence of domain-service commands against an in-memory service to produce events; build BOTH adapters over the same event history (InMemory over the service; ProjectionBacked over memory projections seeded by replaying those events via the runner); assert `await inMemory.listInvoices(T)` deep-equals `await projection.listInvoices(T)` (and the same for approvals, adapterJobs), modulo documented field-ordering. Reuse the `seededProvider` pattern from `projectionBackedFinanceReadAdapter.test.js`.
**Step 2 — red. Step 3 — implement both adapters. Step 4 — green. Step 5 — commit** `feat(finance): read adapter listInvoices/listApprovals/listAdapterJobs + parity`.

### Task 4: Point the 4 route handlers at the adapter

**Files:**
- Modify: `backend/routes/finance.v2.js` — `/draft-invoices` (~282), `/journal-drafts` (~312), `/approvals` (~345), `/adapter-jobs` (~375): replace the `service.list*` call with `await readAdapter.list*` (journal-drafts keeps using `readAdapter.listJournalEntries`). **Keep the existing field mapping / filtering / pagination in each handler unchanged** — only the data source changes.
- Test: `backend/__tests__/routes/finance.v2.routes.test.js` — existing default-mode (in-memory) tests must still pass unchanged (proves zero behavioral change in the default posture). Add a focused test asserting each handler calls `readAdapter.*` (inject a spy `readAdapterFactory`).

**Step 1 — failing test** (spy adapter records calls). **Step 2 — red. Step 3 — implement. Step 4 — green** + re-run the whole route suite. **Step 5 — commit** `refactor(finance): serve the 4 remaining reads via the read adapter`.

---

## Slice 3 — Durable bucket rebuild

### Task 5: `rebuildBucketFromEvents`

**Files:**
- Create: `backend/lib/finance/financeDomainReplay.js`
- Test: `backend/__tests__/lib/finance/financeDomainReplay.test.js`

**Contract:** `rebuildBucketFromEvents(events)` returns a bucket `{ journalEntries, invoices, approvals, adapterJobs, commands: [] }` equal to what the live command sequence would have produced. Fold rules (from the event payloads):
- `finance.invoice.draft_created` / `draft_updated` → upsert `payload.invoice` into `invoices` by id.
- `finance.journal.draft_created` → push/upsert `payload.journal_entry` into `journalEntries` by id.
- `finance.journal.validation_failed` → no-op.
- `finance.approval.requested` → upsert `payload.journal_entry` (status now `pending_approval`) into `journalEntries`; push `payload.approval` into `approvals`; push `payload.adapter_job` into `adapterJobs`.
- `finance.approval.approved` → set the matching `approvals[id].status='approved'` + `approved_by/approved_at` from `payload.approval`.
- `finance.journal.reversal_requested` → push `payload.reversal_entry` into `journalEntries`; push `payload.approval` into `approvals`.
- `finance.adapter.sync_queued` → set the matching `adapterJobs[id].status='queued'` + `updated_at` from `payload.adapter_job`.
Upserts are by id and preserve insertion order (mirror the in-memory arrays).

**Step 1 — the equivalence test (the important one):**
```js
// Drive a representative command sequence on an in-memory service, capturing
// every appended event; then rebuild a bucket from those events and assert it
// equals the service's own getState() bucket (minus `commands`).
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';
import { rebuildBucketFromEvents } from '../../../lib/finance/financeDomainReplay.js';

test('rebuilt bucket equals the live in-memory bucket for a full command sequence', async () => {
  const captured = [];
  const eventStore = {
    append: async (e) => { captured.push(e); },
    query: async () => captured,
    replay: async () => captured,
  };
  const service = createFinanceDomainService({ eventStore });
  // createDraftInvoice -> updateDraftInvoice -> createJournalDraft ->
  // simulateDealWon -> approveFinanceAction (drive each; balanced lines).
  // ...
  const live = await service.getState(T);          // { journalEntries, invoices, approvals, adapterJobs, auditEvents }
  const rebuilt = rebuildBucketFromEvents(captured);
  assert.deepEqual(rebuilt.journalEntries, live.journalEntries);
  assert.deepEqual(rebuilt.invoices, live.invoices);
  assert.deepEqual(rebuilt.approvals, live.approvals);
  assert.deepEqual(rebuilt.adapterJobs, live.adapterJobs);
});
```
(Build the command sequence to exercise every fold rule. If a field diverges, the fold rule is wrong — fix the fold, not the assertion.)

**Step 2 — red. Step 3 — implement the fold. Step 4 — green. Step 5 — commit** `feat(finance): rebuildBucketFromEvents (durable bucket hydration)`.

---

## Slice 4 — Persistent write orchestration + synchronous advancement

### Task 6: `projection_state` row-locking (verify/add)

**Files:**
- Inspect: `backend/lib/finance/projections/projectionStore.pg.js` — does the `getState`→`setState` cursor advance hold a row lock (`SELECT … FOR UPDATE`) so two processes can't both apply the same event? 
- Test: `backend/__tests__/lib/finance/projections/projectionStore.pg.test.js`.

If locking is absent, add a `withState(projectionName, tenantId, fn)` that runs `SELECT … FOR UPDATE` + the read-modify-write in one transaction, and have the runner's advance path use it (or document that the runner's per-(projection,tenant) serialization + an advisory/row lock is the cross-process guard). **Step 1 — failing test** simulating two interleaved advances of the same event (spy pool asserting `FOR UPDATE` is issued). **Steps 2-5** as usual. **Commit** `fix(finance): lock projection_state during cursor advance`.

### Task 7: Persistent write orchestration helper

**Files:**
- Create: `backend/lib/finance/persistentWriteRunner.js` — `runPersistentWrite({ pgPool, tenantId, command })` that:
  1. `const events = await pgEventStore.replay(tenantId)` → `const bucket = rebuildBucketFromEvents(events)`.
  2. Build a per-request service: `createFinanceDomainService({ store: storeWith(tenantId, bucket), eventStore: capturingPgEventStore })` where the capturing store wraps `createFinancePgEventStore({pool})`'s `append` to also collect the appended envelopes.
  3. `const result = await command(service)` (the route passes a closure calling the right `service.method(...)`).
  4. **Advance:** for each captured envelope, `await runner.dispatch(envelope)` on an in-process runner registered with all 5 workers + a fresh `createPgProjectionStoreProvider({pool})`. Wrap in retry (N=3, backoff); on persistent failure, `logger.warn` and continue (the append already committed).
  5. Return `result`.
- Test: `backend/__tests__/lib/finance/persistentWriteRunner.test.js` (spy pg event store + spy runner; assert hydrate→command→dispatch order, and that advancement failure does NOT throw).

**Step 1 — red. Step 3 — implement. Step 4 — green. Step 5 — commit** `feat(finance): persistent write runner (hydrate, run, advance)`.

### Task 8: Wire mutations through the runner in persistent mode

**Files:**
- Modify: `backend/routes/finance.v2.js` — the 6 mutating handlers. In persistent mode, route through `runPersistentWrite`; in default mode, call `service.*` directly (today's path). Keep the per-request provider pattern.
- Test: `backend/__tests__/routes/finance.v2.persistentWrites.test.js` (NEW) — the two acceptance tests:
  1. **Durable mutation (core Codex fix):** persistent mode, a *fresh* route instance (empty in-process bucket) with a pg pool whose event store already holds a `finance.approval.requested` for approval `A`; `POST /approvals/A/approve` → 200 (NOT 404), and a `finance.approval.approved` is appended.
  2. **Read-your-write:** persistent mode, `POST /journal-drafts` (balanced) then immediately `GET /journal-drafts` → the new draft appears (proves synchronous advancement).

Use a spy/fake pg pool that backs both the event store (`finance.audit_events` insert + replay) and the projection store (`projection_state` + snapshot json), or a lightweight in-memory pg double shared across both.

**Step 1 — red (404 / missing). Step 3 — implement. Step 4 — green. Step 5 — commit** `feat(finance): durable mutations in persistent mode (read-your-write)`.

---

## Slice 5 — Remove the boot guard

### Task 9: Remove the guard, flip the tests

**Files:**
- Modify: `backend/routes/finance.v2.js` — delete the `if (persistentEvents) throw …` boot guard (added in PR #632). Keep the factory's no-pool guard (persistent requires a pool). Update the construction comments.
- Modify: `backend/__tests__/routes/finance.v2.routes.test.js` — replace the "refuses to mount when flag=true (even with a pool)" test with "mounts in persistent mode when a pool is present"; keep "refuses without a pool".
- Modify: `CHANGELOG.md` — `### Added`: persistent mode is now durable end-to-end (reads + writes, read-your-write); guard removed. `### Fixed`: closes Codex PR #632 P1 `#3344750464`.
- Run the FULL finance suite: `cd backend && node --test $(find __tests__ -path '*finance*' -name '*.test.js')` → all green.

**Step 5 — commit** `feat(finance): activate persistent mode — remove boot guard (Phase 4-1 complete)`.

---

## Done criteria

- `ENABLE_FINANCE_PERSISTENT_EVENTS=true` mounts with a pool; all 8 read endpoints + 6 mutations are durable; a write is reflected by the next read (read-your-write); a mutation on a fresh process finds PG-persisted aggregates (no 404).
- Full backend finance suite green.
- Open PR; address any Codex review the same way (verify → ask on scope forks → fix → reply + resolve).
