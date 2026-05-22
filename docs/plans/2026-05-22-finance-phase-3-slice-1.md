# Finance Ops Phase 3 — Slice 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the projection/audit prerequisites that Phase 3 staging activation depends on — durable event persistence, a Postgres-backed projection store, the `audit_timeline` projection, the `finance-projection-worker` process, and the companion RLS migration.

**Architecture:** Route operations persist finance events to `finance.audit_events` (via a DI-selected event store, gated by `ENABLE_FINANCE_PERSISTENT_EVENTS` + DB-pool presence). A separate, disabled-by-default `finance-projection-worker` process polls that event stream and drives the existing `ProjectionRunner` — now async-store-aware — over a Postgres `ProjectionStoreProvider` that persists read models and cursors to `finance.projection_state`.

**Tech stack:** Node.js 22 (ESM), `node:test`, `pg`, Postgres 17 / Supabase. No new dependencies.

**Design reference:** `docs/plans/2026-05-22-finance-phase-3-slice-1-design.md` — read it before starting. The 8 implementation constraints in §6 of that doc are binding.

**Branch:** `feat/finance-ops-runtime` (already checked out).

**Note on the pre-commit hook:** the repo's `.husky` pre-commit hook has been failing on multi-file finance commits this cycle; Dre authorized `--no-verify` for finance commits. Use `git commit --no-verify` and run `npx prettier --write <files>` on touched Markdown before committing.

---

## Task 1: Companion RLS migration (`171_finance_rls_policies.sql`)

Independent of all other tasks — do it first.

**Files:**

- Create: `backend/migrations/171_finance_rls_policies.sql`

**Step 1: Write the migration**

A dev-only, gated, idempotent migration. Model the header on `169_finance_event_store_append_only.sql`. It must:

1. `alter table finance.<t> enable row level security;` for all 9 finance tables: `accounts`, `journal_entries`, `journal_lines`, `invoices`, `invoice_lines`, `approvals`, `audit_events`, `adapter_jobs`, `projection_state`.
2. Create the policies from `security-rls-hardening.md` §2 — `service_role` policies on every table, `authenticated` `tenant_match` SELECT policies, `USING (false)` DELETE policies on the immutable tables. Use the finalized expression from `phase-2c-rls-application-plan.md` §3:
   - `tenant_match` = `tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid) or (select auth.role()) = 'service_role'`
   - `service_only` = `(select auth.role()) = 'service_role'`
3. Add the no-hard-delete ledger triggers from `security-rls-hardening.md` §3.1 (`finance.prevent_hard_delete` on `journal_entries`/`journal_lines`/`audit_events`; `finance.prevent_hard_delete_posted` on `invoices`/`approvals`).
4. For `finance.projection_state`: `tenant_match` SELECT, `service_only` INSERT/UPDATE, `USING (false)` DELETE is **not** applied (it is a rebuildable cache — service_role may delete/truncate it).
5. Every statement idempotent: `drop policy if exists` before each `create policy`, `create or replace function`, `drop trigger if exists` before each `create trigger`.
6. Header comment: dev-only DRAFT, do NOT apply to staging/production until the Phase 3-2 review; additive only; no `public.*` object touched.

**Step 2: Verify it parses**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('backend/migrations/171_finance_rls_policies.sql','utf8');if(!/enable row level security/.test(s)||!/projection_state/.test(s))throw new Error('migration incomplete');console.log('ok')"`
Expected: `ok`

**Step 3: Confirm finance suite still green** (the migration is a file, applied to nothing)

Run: `node --test backend/__tests__/lib/finance/financePersistencePolicy.test.js`
Expected: PASS.

**Step 4: Commit**

```bash
npx prettier --write docs/architecture/finance/*.md   # no-op unless needed
git add backend/migrations/171_finance_rls_policies.sql
git commit --no-verify -m "feat(finance): add companion RLS migration 171 (dev-only draft)"
```

---

## Task 2: `audit_timeline` projection worker

A new `ProjectionWorker`, structured exactly like `backend/lib/finance/projections/ledgerProjection.js`. Read `ledgerProjection.js` and `ledgerProjection.test.js` first as the template; read `projection-contracts.md` §8 for the read model.

**Files:**

- Create: `backend/lib/finance/projections/auditTimelineProjection.js`
- Test: `backend/__tests__/lib/finance/projections/auditTimelineProjection.test.js`

**Step 1: Write the failing tests**

Mirror `ledgerProjection.test.js` structure (`node:test`, `createProjectionRunner` + `createMemoryProjectionStoreProvider`, a `fakeEventStore`). Cover:

1. A consumed business event (e.g. `finance.invoice.draft_created`) is added to the timeline; `getProjection` returns it in `events` with the §8 entry shape.
2. `events` are ordered `created_at DESC` by default; `opts.order: 'asc'` reverses.
3. `total_events` equals the number of timeline entries; `tenant_id` echoes the input.
4. Replay rebuilds an identical timeline; a repeated replay does not duplicate entries (keyed by `event_id`).
5. Replay and event-by-event dispatch converge.
6. With `includeInfrastructureEvents` **false** (default), a `finance.audit.event_appended` event is **not** in the timeline and does not advance the cursor.
7. With `includeInfrastructureEvents: true`, `finance.audit.event_appended` **is** in the timeline.
8. Timeline state is tenant-isolated.
9. `payload_summary` is a non-empty string for a known event type.

**Step 2: Run tests to verify they fail**

Run: `node --test backend/__tests__/lib/finance/projections/auditTimelineProjection.test.js`
Expected: FAIL — module not found.

**Step 3: Implement `auditTimelineProjection.js`**

- `export const AUDIT_TIMELINE_PROJECTION_NAME = 'finance.projection.audit_timeline';`
- `CONSUMED_EVENTS` = the 18 business event types listed in `projection-contracts.md` §8 **plus** `'finance.audit.event_appended'`.
- `createAuditTimelineProjectionWorker({ includeInfrastructureEvents = false } = {})` returns a worker with `projectionName`, `consumedEvents: CONSUMED_EVENTS`, `schemaVersion: 1`, `includeInfrastructureEvents` (passed through — the runner's `workerConsumes` reads it to gate the infra event), `handleEvent`, `replay`, `getProjection`.
- `handleEvent(event, store)` / `replay(events, store)` share one apply path: `store.set(event.id, buildEntry(event))` — keyed by `event.id`, so a repeated replay never duplicates. `buildEntry` maps the event envelope to the §8 entry shape (`event_id`, `event_type`, `aggregate_type`, `aggregate_id`, `actor_id`, `actor_type`, `source`, `request_id`, `braid_trace_id`, `correlation_id`, `causation_id`, `created_at`, `policy_summary` derived from `event.policy_decision`, `payload_summary` from a `summarize(event)` helper).
- `payload_summary`: a small `summarize(event)` switch producing a one-line string per event type (e.g. `` `Invoice ${event.aggregate_id} draft created` ``); default to `` `${event.event_type} (${event.aggregate_id ?? 'n/a'})` ``.
- `getProjection(tenantId, opts = {}, store)` assembles `{ tenant_id, as_of: new Date().toISOString(), total_events, events, meta: { last_rebuilt_at: null, is_degraded: false } }`. `events` = all `store.keys()` mapped to their values, sorted by `created_at` then `event_id`; `desc` by default, `asc` when `opts.order === 'asc'`. (Filtering by `opts.event_type` etc. is **deferred** — out of Slice 1; implement only `order`.)
- `export default createAuditTimelineProjectionWorker;`

**Step 4: Run tests to verify they pass**

Run: `node --test backend/__tests__/lib/finance/projections/auditTimelineProjection.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/lib/finance/projections/auditTimelineProjection.js backend/__tests__/lib/finance/projections/auditTimelineProjection.test.js
git commit --no-verify -m "feat(finance): add audit_timeline projection worker"
```

---

## Task 3: Async store-provider seam in `projectionRunner.js`

Make the runner `await` its store-provider calls so a Postgres (async) provider works. **Backward-compatible** — the sync memory provider still works under `await`.

**Files:**

- Modify: `backend/lib/finance/projections/projectionRunner.js`
- Test: `backend/__tests__/lib/finance/projections/projectionRunner.test.js` (existing — extend)

**Step 1: Write a failing test for an async provider**

Add a test to `projectionRunner.test.js`: build a provider whose `getState`/`setState`/`getLiveStore`/`createShadowStore`/`promoteShadow`/`discardShadow` are all `async` (wrap `createMemoryProjectionStoreProvider` so each method returns a Promise). Register the ledger worker, `dispatch` a balanced posting, and assert the projection state advanced (cursor set, ledger populated). With the current sync code this fails — the runner treats the returned Promise as the value.

**Step 2: Run it to verify it fails**

Run: `node --test backend/__tests__/lib/finance/projections/projectionRunner.test.js`
Expected: the new test FAILS (Promise treated as state object / store).

**Step 3: Add `await` to the provider seam**

In `projectionRunner.js`, `await` every store-provider call. The functions that contain them — `getState`, `dispatchToWorker`, `doReplay`, `status` — must be `async` where they are not already:

- `getState(worker, tenantId)` → `async`; `return (await storeProvider.getState(...)) || defaultState(...)`.
- `dispatchToWorker` — already async — `await getState(...)`, `await storeProvider.getLiveStore(...)`, `await storeProvider.setState(...)` (both branches).
- `doReplay` — already async — `await storeProvider.setState(...)`, `await storeProvider.createShadowStore(...)`, `await storeProvider.promoteShadow(...)`, `await storeProvider.discardShadow(...)`.
- `status(projectionName, tenantId)` → `async` (it calls `getState`).
- The `ProjectionStore` returned by `getLiveStore` keeps its **synchronous** `get/set/delete/keys/clear` — `createBufferedStore` is unchanged.

**Step 4: Run the full projection suite**

Run: `node --test backend/__tests__/lib/finance/projections/*.test.js`
Expected: PASS — the new async-provider test passes, and all 28 runner + 19 replay-harness + projection tests stay green (the sync memory provider works unchanged under `await`).

> If a test calls `runner.status(...)` synchronously and now needs `await`, update that call. Search the projection tests for `.status(` and `await` them.

**Step 5: Commit**

```bash
git add backend/lib/finance/projections/projectionRunner.js backend/__tests__/lib/finance/projections/projectionRunner.test.js
git commit --no-verify -m "feat(finance): make projectionRunner store-provider seam async-aware"
```

---

## Task 4: Postgres `ProjectionStoreProvider` (`projectionStore.pg.js`)

A persistent provider backing `finance.projection_state` (migration 170). Same interface as `projectionStore.memory.js` — read that file as the contract. Model the pg/test style on `financeEventStore.pg.js` / `financeEventStore.pg.test.js`.

**Files:**

- Create: `backend/lib/finance/projections/projectionStore.pg.js`
- Test: `backend/__tests__/lib/finance/projections/projectionStore.pg.test.js`

**Step 1: Write the failing tests** (against a mock `pool` with a `query` method)

1. `getLiveStore(projection, tenant)` hydrates a synchronous store from the row's `state_json`; `get/set/delete/keys/clear` mutate the snapshot synchronously.
2. `setState` persists `state_json` (serialized from the live store) **and** the metadata columns (`schema_version`, `cursor_event_id`, `cursor_created_at`, `status`, `degraded_reason`, `last_rebuilt_at`) in **one** `UPDATE`/upsert.
3. `getState` reads the row back into the runtime `ProjectionState` shape (`{ state, cursor, last_rebuilt_at, schema_version, is_degraded, error_count }`); returns `null` when no row exists.
4. `createShadowStore` returns an isolated empty store; `promoteShadow` persists the shadow as the new live `state_json` in a single `UPDATE`; `discardShadow` drops it without a write.
5. A failed `query` inside `setState`/`promoteShadow` **throws** and leaves no partial write (assert the mock pool saw no second/partial statement) — the no-partial-persistence guarantee.
6. The provider drives a full `createProjectionRunner` + ledger worker `dispatch`/`replay` (mock pool) and produces the same ledger as the memory provider — parity.

**Step 2: Run to verify they fail**

Run: `node --test backend/__tests__/lib/finance/projections/projectionStore.pg.test.js`
Expected: FAIL — module not found.

**Step 3: Implement `projectionStore.pg.js`**

`createPgProjectionStoreProvider({ pool })` returns `{ getLiveStore, createShadowStore, promoteShadow, discardShadow, getState, setState }`.

- The provider keeps an in-memory map of live snapshot stores per `(projection, tenant)` — exactly like `projectionStore.memory.js` — but **hydrated from / persisted to** `finance.projection_state`.
- `getLiveStore(p, t)` (async): if not cached, `SELECT state_json FROM finance.projection_state WHERE projection_name=$1 AND tenant_id=$2`; build a `Map`-backed synchronous store seeded from `state_json` (`{}` when no row). Cache and return it.
- `createShadowStore(p, t)` (async): a fresh empty `Map`-backed sync store, held pending promotion.
- `promoteShadow(p, t)` (async): replace the cached live store with the shadow **and** persist — one `INSERT ... ON CONFLICT (projection_name, tenant_id) DO UPDATE` writing `state_json` (serialized shadow) + the current metadata. (`setState` writes metadata; `promoteShadow` writes `state_json` — or combine: have the provider always write the full row. Simplest: a private `persistRow(p, t)` that writes `state_json` + all metadata columns in one upsert; `setState` and `promoteShadow` both call it.)
- `discardShadow(p, t)` (async): drop the pending shadow; no DB write.
- `getState(p, t)` (async): `SELECT` the metadata columns; map to the `ProjectionState` shape; `null` if no row. (`status` column → `state`; `is_degraded` = `status === 'degraded'`; `error_count` is not a column — default `0`, see design §3 note.)
- `setState(p, t, state)` (async): upsert the row's metadata columns from `state` (and the current cached `state_json`). Map `state.cursor` → `cursor_event_id`/`cursor_created_at` (both null when `cursor` is null); `state.state` → `status`; `state.is_degraded`/`degraded_reason`.
- INSERT/UPDATE only — never partial: build one parametrized statement; on `pool.query` rejection, rethrow (wrap as a `FinanceProjectionStoreError` mirroring `financeEventStore.pg.js`'s error wrapping). Do not catch-and-continue.
- The snapshot store's `get/set/delete/keys/clear` are **synchronous** (operate on the in-memory `Map`).

**Step 4: Run to verify they pass**

Run: `node --test backend/__tests__/lib/finance/projections/projectionStore.pg.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/lib/finance/projections/projectionStore.pg.js backend/__tests__/lib/finance/projections/projectionStore.pg.test.js
git commit --no-verify -m "feat(finance): add Postgres projection store provider"
```

---

## Task 5: `finance-projection-worker` process

The worker process. Read `backend/workers/communicationsWorker.js` as the structural template.

**Files:**

- Create: `backend/workers/financeProjectionWorker.js`
- Test: `backend/__tests__/workers/financeProjectionWorker.test.js`
- Modify: `backend/package.json` (add the `worker:finance-projection` script)

**Step 1: Write the failing tests**

Test the worker's **pure pieces** with injected dependencies (no real DB, no real timers):

1. A gate helper `isFinanceProjectionWorkerEnabled(env)` returns `true` only when `ENABLE_FINANCE_OPS`, `ENABLE_FINANCE_WORKERS`, and `ENABLE_FINANCE_PROJECTION_WORKER` are all `'true'`; `false` if any is unset.
2. A `runProjectionPollCycle({ runner, eventStore, tenantIds })` helper: for each tenant, calls `eventStore.replay(tenantId)` and `runner.dispatch(event)` per event; returns a per-tenant summary. Drive it with a fake runner + fake event store.
3. The poll cycle isolates a thrown error from one tenant (logs, continues to the next).

**Step 2: Run to verify they fail**

Run: `node --test backend/__tests__/workers/financeProjectionWorker.test.js`
Expected: FAIL — module not found.

**Step 3: Implement `financeProjectionWorker.js`**

Mirror `communicationsWorker.js`:

- Exports the testable pure helpers: `isFinanceProjectionWorkerEnabled(env = process.env)`, `runProjectionPollCycle({ runner, eventStore, tenantIds })`.
- `buildProjectionRunner({ pool })` — constructs `createProjectionRunner({ eventStore: createFinancePgEventStore({ pool }), storeProvider: createPgProjectionStoreProvider({ pool }) })`, registers the 4 projection workers (ledger, approval_queue, adapter_queue, `createAuditTimelineProjectionWorker({ includeInfrastructureEvents: true })`).
- `startFinanceProjectionWorker()` — if `!isFinanceProjectionWorkerEnabled()`, log `"[finance-projection-worker] disabled — idling"` and return an idle `{ stop }`; else set up the `setTimeout` poll loop (interval from `FINANCE_WORKER_POLL_INTERVAL_MS`, default 5000), write a heartbeat file (`FINANCE_PROJECTION_WORKER_HEARTBEAT_PATH`), `stop()`.
- The controlled tenant id(s) come from an env var (e.g. `FINANCE_CONTROLLED_TENANT_IDS`, comma-separated) — Slice 1 processes only the configured controlled tenant(s).
- Standalone entry block (`if (import.meta.url === ...)`) with `SIGINT`/`SIGTERM` → `stop()` → exit, exactly as `communicationsWorker.js`.
- The worker owns **only** the process lifecycle, poll loop, scheduling, heartbeat — no cursor/replay/persistence logic (design constraint 1, 6).

In `backend/package.json` add to `scripts`: `"worker:finance-projection": "node workers/financeProjectionWorker.js"`. Also extend the `test` / `test:coverage` globs to include `__tests__/workers/*.test.js` if not already covered (mirror how `__tests__/lib/finance/*.test.js` was added).

**Step 4: Run to verify they pass**

Run: `node --test backend/__tests__/workers/financeProjectionWorker.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/workers/financeProjectionWorker.js backend/__tests__/workers/financeProjectionWorker.test.js backend/package.json
git commit --no-verify -m "feat(finance): add finance-projection-worker process"
```

---

## Task 6: Async event path in `financeDomainService.js`

`financeDomainService` already accepts `opts.eventStore` (line 56) — the DI seam exists. But `appendEvent` and `listAuditEvents`/`getState` call `eventStore.append`/`query` **synchronously**, and `financeEventStore.pg.js`'s `append`/`query` are **async**. Make the event path async so both stores work.

**Files:**

- Modify: `backend/lib/finance/financeDomainService.js`
- Modify: `backend/__tests__/lib/finance/financeDomainService.test.js`

**Step 1: Write a failing test**

Add a test to `financeDomainService.test.js`: construct the service with an **async** event store stub (`{ append: async () => {...}, query: async () => [] }`). Call `await service.createDraftInvoice({...})` and assert it resolves and the async `append` received the envelope. With the current sync code, `appendEvent` does not await — the test exposes that events are not awaited.

**Step 2: Run to verify it fails**

Run: `node --test backend/__tests__/lib/finance/financeDomainService.test.js`
Expected: the new test FAILS.

**Step 3: Make the event path async**

- `appendEvent` → `async function appendEvent(_bucket, envelope) { await eventStore.append(envelope); }`.
- Every service method that calls `appendEvent` — `createDraftInvoice`, `updateDraftInvoice`, `createJournalDraft`, `simulateDealWon`, `reverseJournalEntry`, `approveFinanceAction` — becomes `async` and `await`s each `appendEvent(...)` call. `simulateDealWon` also `await`s its `this.createJournalDraft(...)` call.
- `listAuditEvents` → `async`, `return await eventStore.query({ tenant_id: tenantId });`.
- `getState` → `async`, `bucket.auditEvents = await eventStore.query({ tenant_id: tenantId });`.
- Awaiting the synchronous in-memory store is a no-op — existing behavior is preserved (design constraint 2).

**Step 4: Update `financeDomainService.test.js`**

Add `await` to every call of the now-async methods throughout the existing tests. Run and fix until green.

Run: `node --test backend/__tests__/lib/finance/financeDomainService.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/lib/finance/financeDomainService.js backend/__tests__/lib/finance/financeDomainService.test.js
git commit --no-verify -m "feat(finance): make domain-service event path async for pg event store"
```

---

## Task 7: Event-store DI selection + route wiring + verification

Wire the pg event store into the route factory, gated by `ENABLE_FINANCE_PERSISTENT_EVENTS` + pool presence, and update the route handlers for the now-async service.

**Files:**

- Modify: `backend/routes/finance.v2.js`
- Modify: `backend/__tests__/routes/finance.v2.routes.test.js`
- Modify: `deploy/coolify/finance-workers.example.yml`
- Modify: `CHANGELOG.md`

**Step 1: Write/adjust the failing tests**

In `finance.v2.routes.test.js`: (a) add a test that with `ENABLE_FINANCE_PERSISTENT_EVENTS` unset, `createFinanceV2Routes` builds a service backed by the in-memory store (default, safe). (b) Add a test that when a pool is passed **and** `ENABLE_FINANCE_PERSISTENT_EVENTS=true`, the pg event store is selected. (Use `opts.service` injection or a seam — see Step 3 — to assert selection without a real DB.) Existing route tests must be updated for the now-async service (the route handlers `await`).

**Step 2: Run to verify they fail**

Run: `node --test backend/__tests__/routes/finance.v2.routes.test.js`
Expected: FAIL.

**Step 3: Implement the selection + route `await`s**

In `finance.v2.js`:

- Rename the first parameter `_pgPool` → `pgPool` (it is currently unused).
- Replace `const service = opts.service || createFinanceDomainService();` with:
  ```js
  const persistentEvents = process.env.ENABLE_FINANCE_PERSISTENT_EVENTS === 'true';
  const eventStore =
    opts.eventStore ||
    (persistentEvents && pgPool ? createFinancePgEventStore({ pool: pgPool }) : undefined);
  const service = opts.service || createFinanceDomainService(eventStore ? { eventStore } : {});
  ```
  (Import `createFinancePgEventStore` from `../lib/finance/financeEventStore.pg.js`.)
- In every route handler that calls a now-async service method (`createDraftInvoice`, `updateDraftInvoice`, `createJournalDraft`, `simulateDealWon`, `reverseJournalEntry`, `approveFinanceAction`) add `await`: `const result = await service.X({...})`. Also `await` `service.listAuditEvents(...)` and `service.getState(...)` in `/runtime/status`.
- `server.js` already calls `createFinanceV2Routes(measuredPgPool)` — `measuredPgPool` flows through; no `server.js` change needed.

**Step 4: Run the full Phase 3 verification**

```bash
node --test backend/__tests__/lib/finance/*.test.js backend/__tests__/lib/finance/projections/*.test.js backend/__tests__/routes/finance.v2.routes.test.js backend/__tests__/workers/financeProjectionWorker.test.js
npm run lint -- --quiet
```

Expected: all tests PASS, lint clean.

**Step 5: Update `deploy/coolify/finance-workers.example.yml` and `CHANGELOG.md`**

- Add `ENABLE_FINANCE_PERSISTENT_EVENTS=false` and `FINANCE_CONTROLLED_TENANT_IDS=` to the `finance-projection-worker` service env block in the example compose file (and a note that the backend app also needs `ENABLE_FINANCE_PERSISTENT_EVENTS=true` in staging for events to persist).
- Add a CHANGELOG `### Added` entry covering the whole Slice 1 build (the 7 tasks).

**Step 6: Commit**

```bash
npx prettier --write deploy/coolify/finance-workers.example.yml CHANGELOG.md
git add backend/routes/finance.v2.js backend/__tests__/routes/finance.v2.routes.test.js deploy/coolify/finance-workers.example.yml CHANGELOG.md
git commit --no-verify -m "feat(finance): wire pg event store into finance v2 routes via DI"
```

---

## Done criteria

- All 7 tasks committed.
- `node --test backend/__tests__/lib/finance/*.test.js backend/__tests__/lib/finance/projections/*.test.js backend/__tests__/routes/finance.v2.routes.test.js backend/__tests__/workers/financeProjectionWorker.test.js` — all green.
- `npm run lint -- --quiet` — clean.
- Default behavior unchanged without `ENABLE_FINANCE_PERSISTENT_EVENTS` (in-memory event store; no Postgres dependency for tests/local).
- `finance-projection-worker` is disabled-by-default (three-tier gate).
- Migration 171 is a dev-only draft, applied to nothing.
- This unblocks Phase 3-2 … 3-8. Slice 2 (adapter worker + ERPNext) is separate.
