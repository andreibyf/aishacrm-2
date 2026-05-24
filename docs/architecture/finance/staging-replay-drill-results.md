# Finance Ops — Phase 3-6: Replay / Rebuild Operational Drill Plan (Dry Run)

**Phase 3-6 — Controlled Staging Activation, replay/rebuild operational drill against staging data.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Drill plan / dry run. **No replay was run by this task.** No Coolify mutation, no Doppler / env var change in staging, no migration applied, no `runner.replay()` / `runner.replayAll()` invocation against any environment, no worker execution against staging by this task. This document is the operator drill plan a deploy owner uses to execute the drill against the controlled staging tenant; it does not execute the drill.
**Date:** 2026-05-24
**Related:**
[`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) (3-1, baseline `3c60d9ff`) ·
[`staging-migration-application-log.md`](./staging-migration-application-log.md) (3-2) ·
[`staging-rls-verification-results.md`](./staging-rls-verification-results.md) (3-3) ·
[`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) (3-4) ·
[`staging-worker-activation-log.md`](./staging-worker-activation-log.md) (3-5) ·
[`replay-rebuild-operational-drill.md`](./replay-rebuild-operational-drill.md) (2C-12, upstream drill design) ·
[`replay-validation.md`](./replay-validation.md) (2B-12, validation harness) ·
[`projection-runtime.md`](./projection-runtime.md) §9, §11 (replay + degraded-recovery contract) ·
[`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md) (2C-6)

---

## 1. Purpose and scope

Phase 3-6 is the **operational drill plan** for the replay / rebuild capability defined in 2C-12 ([`replay-rebuild-operational-drill.md`](./replay-rebuild-operational-drill.md)) — adapted for staging execution against the one controlled tenant (`a11dfb63-4b18-4eb8-872e-747af2e37c46`). 2C-12 defined the drill procedure as an architectural deliverable; 2B-12 ([`replay-validation.md`](./replay-validation.md)) proved the underlying invariants in tests. 3-6 wraps those into an executable runbook with concrete commands, pass/fail criteria, stop conditions, and explicit handling of the empty-stream case that Phase 3-5 corrected.

**This document is a plan, not an execution record.** No replay was triggered by this task. Executing the drill is a separately authorized operator action covered by §5. The "Evidence pack" in §12 is empty until execution.

The drill is structured as a dry run because Phase 3 staging activation has not progressed past 3-5 (worker enabled disabled in 3-4; route still unmounted; `ENABLE_FINANCE_PERSISTENT_EVENTS=false` everywhere). The drill is still meaningful before 3-7 because it proves the replay path itself works end-to-end: an operator-triggered `replayAll(tenantId)` reads `finance.audit_events`, rebuilds projections in shadow stores, atomically promotes them, and produces the same final state as incremental dispatch would. That guarantee matters most **before** events start flowing in Slice 2.

---

## 2. Live-execution posture

**Default for this task: no replay was executed.**

| What                                                               | Status this task                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `runner.replay()` or `runner.replayAll()` invoked against staging  | None.                                                                       |
| `replayValidationHarness.js` (2B-12) executed against staging data | None.                                                                       |
| Worker container in staging shelled into via `docker exec`         | None.                                                                       |
| SSH session to VPS-1 (`andreibyf@147.189.173.237`)                 | None.                                                                       |
| Staging Supabase migration applied                                 | None.                                                                       |
| Staging Doppler (`stg_stg`) env var changed                        | None.                                                                       |
| Backend `/api/v2/finance` route mounted in staging                 | None — `ENABLE_FINANCE_OPS` on the backend app remains unset.               |
| Provider HTTP write (QuickBooks / Xero / ERPNext)                  | None — no adapter worker exists; replay never executes adapter jobs anyway. |
| Production environment touched in any way                          | None.                                                                       |

A live execution requires the deploy owner's explicit authorization. When authorized, the procedure in §5 is run **in the order listed** and outputs are captured per §12.

---

## 3. Prerequisites

- [ ] **Phase 3-1 baseline.** Branch `feat/finance-ops-runtime` at a descendant of `3c60d9ff`; 278/278 finance + projection + worker + route tests passing.
- [ ] **Phase 3-2 migrations applied.** At minimum 168 (`finance.audit_events` exists) + 169 (append-only triggers) + 170 (`finance.projection_state` exists, the target of replay writes) + 171 (RLS policies + no-hard-delete triggers).
- [ ] **Phase 3-3 RLS verification PASS.** §4.1 / §4.2 / §4.3.a / §4.4.a all PASS (so the worker's `service_role` reads/writes work and the drill's `finance.projection_state` writes succeed).
- [ ] **Phase 3-4 worker app exists on VPS-1.** `staging-finance-projection-worker` Coolify app deployed. (Whether enabled or disabled — Phase 3-5 status — doesn't change the drill itself, but matters for the "during drill, will the poll loop also be running?" interaction note in §5.3.)
- [ ] **Doppler `stg_stg` secrets available.** `FINANCE_DB_URL` (or `DATABASE_URL`) for the staging Supabase, `DOPPLER_TOKEN` for whichever account executes the drill.
- [ ] **Controlled tenant identified.** `a11dfb63-4b18-4eb8-872e-747af2e37c46` per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3.
- [ ] **`ENABLE_FINANCE_PERSISTENT_EVENTS` unset everywhere.** The Slice 1 fail-closed route-mount guard at `backend/routes/finance.v2.js:48` is structurally enforced. The drill doesn't need this lifted — it reads `finance.audit_events` as the source of truth regardless of how events got there.
- [ ] **No production action.** `prd_prd` Doppler config is not opened; Hetzner is not touched.

3-7 (route activation) and 3-8 (smoke tests) are **not** prerequisites for 3-6. The drill exercises the runner's replay path, which is independent of the backend route mount.

---

## 4. The operator replay surface — current gap and execution paths

This section is the 3-6 reconciliation of the 2C-12 design vs the implemented codebase, mirroring the Phase 3-4 §5 honesty pass on the HTTP healthcheck.

**The 2C-12 design assumes "the projection worker's operator `replay` / `replayAll` control surface (2C-6 §2)."** That surface — an HTTP / CLI / IPC path that lets a human operator invoke `runner.replay()` or `runner.replayAll()` against the running staging worker process — **does not exist in the deployed worker today.** `runner.replay()` and `runner.replayAll()` are methods on the in-process runner instance built inside `backend/workers/financeProjectionWorker.js` (`buildProjectionRunner()` at line 185), but there is no exported handle for an operator to reach.

**Three execution paths for the drill today**, in order of safety and operational fidelity:

### 4.1 Option A — Run `replayValidationHarness.js` locally against staging data (test-mode drill)

The harness from Phase 2B-12 ([`replay-validation.md`](./replay-validation.md), `backend/lib/finance/projections/replayValidationHarness.js`) accepts injectable collaborators. Point its event store at the staging Postgres (via `doppler run --config stg_stg` resolving `FINANCE_DB_URL`) and run `runReplayValidation({ tenantId })`. The harness produces the structured `{ passed, checks }` report that 2C-12 §2 documents.

**Trade-off:** the harness builds its own runner / store provider / projection workers and runs **outside** the staging worker process. So it proves the **invariant** (rebuild parity, ordering, infrastructure-event filtering, degraded recovery, tenant isolation) but does **not** exercise the deployed worker container or the actual `finance.projection_state` table the staging worker writes to. Useful for "is the replay logic correct" — not useful for "does the staging worker rebuild correctly."

### 4.2 Option B — `docker exec` + one-off Node script against the staging worker container

`ssh andreibyf@147.189.173.237` then `docker exec -it staging-finance-projection-worker node -e "<snippet>"` to invoke a small inline script that imports `buildProjectionRunner` and `createFinancePgEventStore`, builds the runner with the staging DB pool, calls `runner.replayAll(tenantId)`, and prints the result. Exact snippet sketched in §5.3 below.

**Trade-off:** exercises the real deployed worker code, the real `finance.projection_state` table, and the real `finance.audit_events` data — high operational fidelity. But it's an inline one-off, not a reviewable artifact, and prone to copy-paste errors. Acceptable as the **interim drill mechanism**; not durable.

### 4.3 Option C (recommended next step — code change, NOT delivered by 3-6) — Add `backend/scripts/finance-replay-drill.js`

The optional artifact named in 2C-12 §7. A small admin script that imports `buildProjectionRunner` and `createFinancePgEventStore`, parses CLI args (`--tenant-id`, `--projection-name`, `--all`), calls `runner.replayAll(tenantId)` or `runner.replay(projectionName, tenantId)`, captures before/after `finance.projection_state` rows, and writes a structured JSON report to stdout. Invoked via `doppler run --config stg_stg npm run finance:replay-drill -- --tenant-id=a11dfb63-...`.

**Trade-off:** the right long-term answer. **Not implemented by Phase 3-6** — 3-6 is doc-only per the orchestration constraints (no worker code change, no migration). The script is a tracked follow-up.

**Recommended drill mechanism for the first authorized execution:** Option B (docker exec + Node snippet) — operational fidelity matters more than tooling polish for the proof. After the first successful drill, write Option C and switch to it for subsequent drills.

---

## 5. Drill procedure (planned — NOT executed by this task)

Mirrors 2C-12 §4, with concrete execution detail and pass/fail criteria added.

### 5.1 Select the controlled tenant

```
tenant_id = a11dfb63-4b18-4eb8-872e-747af2e37c46
```

Every subsequent step scopes to this `tenant_id`. The drill never touches another tenant.

### 5.2 Snapshot the "before" state

From the staging Supabase SQL editor (service_role connection):

```sql
select projection_name,
       tenant_id,
       status,
       cursor_event_id,
       cursor_created_at,
       schema_version,
       last_rebuilt_at,
       md5(state_json::text) as state_json_hash
from finance.projection_state
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
order by projection_name;

select count(*) as audit_event_count
from finance.audit_events
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
```

Record both result sets verbatim in §12 evidence pack — this is the "before" baseline AND the restore point per §9. The `md5(state_json::text)` hash gives a fast byte-equality check for the comparison in §5.4 without dumping the full JSON.

### 5.3 Trigger `replayAll(tenantId)` via Option B (docker exec + Node snippet)

**Interaction note**: if the staging worker is currently enabled (Phase 3-5 activated), the poll loop is also running. The runner's per-`(projection, tenant)` mutex (`runExclusive` at `projectionRunner.js:294`) serializes `dispatch` and `replay` against the same key, so a poll-cycle dispatch will not race the drill replay. But for cleaner evidence, **temporarily clear `FINANCE_CONTROLLED_TENANT_IDS` to `""` on the worker app before the drill** (a single-step "pause processing without flipping enable flags" per Phase 3-5 §9.2) and restore it after. This keeps the worker enabled / healthy but stops the poll loop from interleaving with the drill.

Snippet (run via `ssh andreibyf@147.189.173.237 'docker exec -i staging-finance-projection-worker node -e "<paste>"'`):

```javascript
import('./workers/financeProjectionWorker.js').then(async (m) => {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: process.env.FINANCE_DB_URL || process.env.DATABASE_URL,
    max: 5,
  });
  const { createFinancePgEventStore } = await import('./lib/finance/financeEventStore.pg.js');
  const eventStore = createFinancePgEventStore({ pool });
  const runner = m.buildProjectionRunner({ pool });
  try {
    const result = await runner.replayAll('a11dfb63-4b18-4eb8-872e-747af2e37c46');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
});
```

Expected stdout: a JSON array of `{ projectionName, outcome, cursor }` — one entry per registered projection (`ledger`, `approval_queue`, `adapter_queue`, `audit_timeline`). Per `projectionRunner.js:339`, each `outcome` is `'rebuilt'` on success (or `'degraded'` on handler failure — see §5.10).

**Rollback for 5.3:** the runner's replay is a pure function of the event stream — no rollback action needed if it succeeds. On failure, `discardShadow()` (`projectionRunner.js:343-345`) is called, the live store is untouched, and the projection is marked `degraded` — recoverable via re-running §5.3 once the root cause is fixed.

### 5.4 Compare before / after

Re-run the §5.2 snapshot query post-replay. Compare each projection's row against the "before" snapshot:

| Field               | After empty-stream replay (the expected Phase 3-6 state)                                                                                                                                                                                                                       | After non-empty-stream replay                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `status`            | `idle` (per `projectionRunner.js:332`).                                                                                                                                                                                                                                        | `idle`.                                                                                              |
| `cursor_event_id`   | `null` — `replayAll` with empty filtered events sets `cursor = null` per `projectionRunner.js:327`.                                                                                                                                                                            | The `(created_at, id)` of the last event in the tenant-scoped, ordered, filtered stream.             |
| `cursor_created_at` | `null`.                                                                                                                                                                                                                                                                        | The `created_at` of the last event.                                                                  |
| `last_rebuilt_at`   | A fresh ISO timestamp (set by every successful replay per `projectionRunner.js:334`).                                                                                                                                                                                          | Fresh ISO timestamp.                                                                                 |
| `state_json_hash`   | If the "before" row existed and had a hash, the post-replay hash must equal the pre-replay hash — a replay of an unchanged event stream produces byte-identical state (`checkRepeatedReplayDeterminism`). If no "before" row existed, the post-replay row is the new baseline. | Hash equals the hash of the incrementally-dispatched state for the same stream (`checkConvergence`). |

**Empty-stream nuance — the 3-5 correction carried forward**: the empty stream behavior depends on whether anyone called `replay()` or `dispatch()`. Restating cleanly:

| Pre-condition                                                                       | `finance.projection_state` row count for the tenant                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty `finance.audit_events`, worker disabled, no operator replay called.           | **Zero rows.** No write path was triggered.                                                                                                                                                                                                                                                                               |
| Empty `finance.audit_events`, worker enabled (post-3-5), no operator replay called. | **Zero rows.** `runProjectionPollCycle()` (`backend/workers/financeProjectionWorker.js:112-171`) iterates the events array — empty → `runner.dispatch()` never called → no write. This is the Phase 3-5 correction.                                                                                                       |
| Empty `finance.audit_events`, operator triggers `replayAll(tenantId)`.              | **One row per registered projection (4 rows for the current worker config).** `runner.replay()` calls `storeProvider.setState(...)` unconditionally on entry (transient `replaying`) and on completion (final `idle` with `cursor: null`) per `projectionRunner.js:307,331-338`. Replay writes regardless of stream size. |
| Non-empty `finance.audit_events`, operator triggers `replayAll(tenantId)`.          | One row per registered projection; `cursor` set to the last event's `(created_at, id)`; `state_json` reflects the rebuilt state.                                                                                                                                                                                          |

The drill must record which pre-condition was true at §5.2 snapshot time.

### 5.5 Verify the `ledger` projection

Per [`replay-rebuild-operational-drill.md`](./replay-rebuild-operational-drill.md) §5 + `replay-validation.md` §"checkPerProjectionParity":

- For an empty stream: ledger `state_json` is the empty-initial-state shape (no accounts, all classification totals = 0).
- For a non-empty stream: per-account `debit_cents` / `credit_cents` / `balance_cents` buckets and the five-classification totals match the result of `accountingEngine.buildLedger()` applied to the same posted journals (the 2B-8 parity assertion).

Pass: structural match per the above. Fail: any divergence — investigate; this is a stop condition per §8.

### 5.6 Verify the `approval_queue` projection

- For an empty stream: `pending: []`, `resolved: []`.
- For a non-empty stream: `pending` contains all `finance.approval.requested` events not yet `approved` / `rejected` / `cancelled`; `resolved` contains all approvals that have been (with their resolution event). A cancelled approval has left `pending` and remains in `resolved` (per the Phase 2 cross-track reconciliation). No `approval_id` appears in both buckets; no `approval_id` appears twice in either bucket.

Pass: structural match. Fail: any divergence — stop condition.

### 5.7 Verify the `adapter_queue` projection

- For an empty stream: `queued: []`, `running: []`, `failed: []`, `completed: []`.
- For a non-empty stream: an `adapter_job_id` appears in exactly one bucket; transitions follow the `sync_queued → completed`/`failed` lifecycle; a dead-lettered job (`sync_failed` with `permanent: true`) is reflected in `failed` and not healed by replay (replay never re-executes a job — execution is operator-only per 2C-10).

Pass: structural match. Fail: a job in multiple buckets, or a dead-letter that disappeared after replay — stop condition.

### 5.8 Verify the `audit_timeline` projection + infrastructure-event rules

`audit_timeline` is the only projection that consumes `finance.audit.event_appended` — and only because `buildProjectionRunner()` at `backend/workers/financeProjectionWorker.js:194` registers it with `includeInfrastructureEvents: true`. The runner's infrastructure-event filter (`projectionRunner.js:27` defines `INFRASTRUCTURE_EVENT_TYPES`; the `workerConsumes()` check filters per worker) enforces:

- **Business projections (`ledger`, `approval_queue`, `adapter_queue`) never see `finance.audit.event_appended`** — even if a worker's `consumedEvents` list erroneously contained it, the runtime filter would drop it.
- **`audit_timeline` sees it** (the opt-in flag is set).

Drill verification for the `audit_timeline` projection: confirm any `finance.audit.event_appended` events present in `finance.audit_events` for the controlled tenant appear in the replayed `audit_timeline` `state_json`, and do NOT appear in any of `ledger` / `approval_queue` / `adapter_queue`'s replayed states. Use `replayValidationHarness.js` `checkInfrastructureEventFiltering` as the structured verifier.

Pass: structural match — `audit_timeline` carries infra events, business projections do not. Fail: a business projection consumed an infra event — stop condition.

### 5.9 Verify repeated-replay determinism

Run §5.3 a second time. Re-snapshot per §5.2. The two post-replay states (run 1 and run 2) must produce **byte-identical** `state_json_hash` per projection — the proof that replay is a pure function of the event stream (`checkRepeatedReplayDeterminism`).

For an empty stream, this is trivially true (both runs produce the same empty initial state, same `null` cursor, only `last_rebuilt_at` differs — exclude `last_rebuilt_at` from the byte-equality check).

For a non-empty stream, this is the strong invariant.

Pass: hashes equal (ignoring `last_rebuilt_at`). Fail: any difference — indicates non-determinism in a projection handler, which is a code-correctness defect — stop condition.

### 5.10 Verify degraded recovery requires operator-triggered replay

This step exercises [`projection-runtime.md`](./projection-runtime.md) §11 explicitly. Per the runtime contract:

- A failed handler during `dispatch` writes `status: 'degraded'` and **pauses** further dispatch for that `(projection, tenant)`.
- A failed `replay` writes `status: 'degraded'` and leaves the live store untouched (shadow discarded).
- Recovery is **operator-only** — the runner never auto-replays a degraded projection.

**The drill cannot easily induce a real degraded projection** without injecting a malformed event into `finance.audit_events` (which violates the no-mutation hard constraint), or temporarily registering a deliberately-failing test projection in the runner (which requires worker code change). The Phase 2B-12 `replay-validation.md` `checkDegradedRecovery` covers this invariant in tests using injected test workers; **Phase 3-6 inherits that proof and does not re-execute it in staging** — running it would require code change.

What §5.10 **does** verify in staging: capture the current `finance.projection_state` rows after §5.3 and confirm none has `status: 'degraded'`. If any does (from a prior incident or test data), the drill must investigate why before promoting the rebuilt state — it could mask the original failure.

Pass: zero rows with `status: 'degraded'` after the drill. Fail: any degraded row — stop condition; the drill is not the right tool to clear a pre-existing degraded condition without investigation.

---

## 6. Verification commands (operator instructions only)

The §5 procedure already inlines the key commands. This section consolidates them for §12 evidence capture.

```bash
# §5.2 + §5.4 snapshot via SSH + psql (from VPS-1 or local with doppler):
ssh andreibyf@147.189.173.237 'docker exec staging-backend-heavy doppler run --config stg_stg -- \
  psql "$DATABASE_URL" -c "select projection_name, tenant_id, status, cursor_event_id, \
       cursor_created_at, last_rebuilt_at, md5(state_json::text) as state_json_hash \
       from finance.projection_state \
       where tenant_id = '\''a11dfb63-4b18-4eb8-872e-747af2e37c46'\'' \
       order by projection_name;"'

# §5.3 replayAll trigger (Option B from §4.2):
ssh andreibyf@147.189.173.237 'docker exec -i staging-finance-projection-worker \
  node -e "<paste-the-§5.3-snippet>"'

# §5.4 audit_events count:
ssh andreibyf@147.189.173.237 'docker exec staging-backend-heavy doppler run --config stg_stg -- \
  psql "$DATABASE_URL" -c "select count(*) from finance.audit_events \
       where tenant_id = '\''a11dfb63-4b18-4eb8-872e-747af2e37c46'\'';"'
```

All commands are read-only against `finance.audit_events` (the source of truth, immutable per migration 169). The replayAll call writes to `finance.projection_state` (the rebuildable cache) — the only mutation in the entire drill.

---

## 7. Pass / fail criteria summary

The drill passes if **all** of:

- §5.2 / §5.4 snapshots captured.
- §5.3 `replayAll` returns `[ { outcome: 'rebuilt', ... }, ... ]` — no `'degraded'` outcomes.
- §5.4 before / after comparison matches the expected table (empty-stream → null cursor, idle status, fresh `last_rebuilt_at`; non-empty-stream → cursor at the last event, hash equals incremental).
- §5.5 / §5.6 / §5.7 / §5.8 per-projection verifications structurally match.
- §5.9 repeated-replay determinism: hashes equal between runs (excluding `last_rebuilt_at`).
- §5.10 zero `status: 'degraded'` rows in the final `finance.projection_state`.
- `finance.audit_events` row count for the tenant is unchanged between §5.2 and the end of §5.9 (the drill is read-only against the source of truth).
- The drill was performed only against the controlled tenant; no other tenant's `finance.projection_state` row was touched.

The drill fails if any check fails. See §8 stop conditions.

---

## 8. Stop conditions

Phase 3-6 stop conditions are the subset of the Phase 3 scaffold stop conditions ([`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §10.3) that apply to the replay drill. Any of the following halts the drill and triggers rollback per §9:

- §5.3 `replayAll` returns a `'degraded'` outcome for any projection — investigate the projection handler before re-running.
- §5.4 post-drill state diverges from the empty-stream-replay expected shape (null cursor + idle status + 4 rows) without an obvious explanation in `finance.audit_events`.
- §5.5 ledger projection rebuild does not match `accountingEngine.buildLedger()` output for the same posted journals — projection logic defect.
- §5.6 `approval_queue` shows an `approval_id` in both `pending` and `resolved`, or twice in either bucket — projection logic defect.
- §5.7 `adapter_queue` shows an `adapter_job_id` in multiple buckets, or a dead-lettered job has disappeared after replay — projection logic defect or replay-side healing (which is forbidden per 2C-10).
- §5.8 a business projection (`ledger`, `approval_queue`, `adapter_queue`) carries a `finance.audit.event_appended` row — infrastructure-event filter is broken.
- §5.9 repeated-replay hashes differ (excluding `last_rebuilt_at`) — non-determinism in a projection handler.
- §5.10 a `status: 'degraded'` row appears post-drill that was not present pre-drill — a replay-time handler failure that the operator must investigate.
- `finance.audit_events` row count changes during the drill — something is writing events while the drill runs; investigate (could be the backend route somehow active, or the worker poll loop interleaving despite §5.3 mutex).
- Any non-controlled tenant's `finance.projection_state` row is modified during the drill — tenant isolation violation; replay is supposed to be strictly tenant-scoped per `projectionRunner.js:317` (`tenantScoped = all.filter((event) => event.tenant_id === tenantId)`).
- Production environment is touched in any way — instant halt.

---

## 9. Rollback / restore

Replay against the event stream is a **pure function** of `finance.audit_events`, which the drill never mutates. So rollback is always possible:

- **Restore from §5.2 snapshot.** Write the pre-drill `finance.projection_state` rows back for the tenant — returns projections to the exact pre-drill state. Useful when the drill's rebuilt state is suspect and the pre-drill state was known-good.
- **Restore by re-replay.** Re-run §5.3. Replay is deterministic over the unchanged event stream, so the second run reconstructs the same state as the first. Useful when the first run was the suspect one.
- **Truncate-and-rebuild.** Delete the tenant's `finance.projection_state` rows entirely, then re-run §5.3 — a clean rebuild from the event stream. Safe because the event stream is immutable and the projection_state is a rebuildable cache.
- **No `finance.audit_events` rollback exists or is needed.** The table is immutable at the DB layer (migration 169 triggers block UPDATE / DELETE / TRUNCATE for every role including `service_role`).

The drill never touches `finance.audit_events`; it only reads from it. The only mutation is the replay's writes to `finance.projection_state`, and those are fully reversible by any of the above three paths.

---

## 10. Hard constraints (explicit restatement)

| Constraint                                                                                                                                                                                                                                                                                                             | Source                     | Status this task                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------- | ------------------ | ---------- |
| **No live replay run by this task.** §2 explicit "None" row for every modality.                                                                                                                                                                                                                                        | 3-6 scope                  | Confirmed — plan only.                                                          |
| **No worker execution against staging.** No `docker exec` / no Node snippet ran by 3-6.                                                                                                                                                                                                                                | 3-6 acceptance             | Confirmed.                                                                      |
| **No Coolify / VPS mutation.**                                                                                                                                                                                                                                                                                         | 3-6 acceptance             | Confirmed.                                                                      |
| **No Doppler / env var changes.** §5.3 notes the _option_ to temporarily clear `FINANCE_CONTROLLED_TENANT_IDS` to "" during the drill execution, but 3-6 itself makes no such change.                                                                                                                                  | 3-6 acceptance             | Confirmed.                                                                      |
| **No migration application.**                                                                                                                                                                                                                                                                                          | 3-2 scope                  | Confirmed.                                                                      |
| **No route activation.** Backend `staging-backend-heavy` `ENABLE_FINANCE_OPS` remains unset; `/api/v2/finance` route stays unmounted. 3-7 is the route activation packet, not 3-6.                                                                                                                                     | 3-5 / 3-6 scope            | Confirmed.                                                                      |
| **No provider writes.** Replay never executes adapter jobs (per 2C-10: "replay never re-executes a job"); no provider HTTP path exists for the drill to touch.                                                                                                                                                         | Phase 3-1 §9               | Confirmed.                                                                      |
| **No production action.** Hetzner is not touched; `prd_prd` Doppler config is not opened; production tenants are not queried.                                                                                                                                                                                          | Phase 3-1 §8               | Confirmed.                                                                      |
| **`ENABLE_FINANCE_PERSISTENT_EVENTS` remains `false` (unset).** Backend route-mount guard at `backend/routes/finance.v2.js:48` stays structurally fail-closed until Slice 2. The drill does not require this flag lifted — it reads `finance.audit_events` directly.                                                   | Phase 3-1 §7               | Confirmed.                                                                      |
| **`ENABLE_FINANCE_OPS` unchanged** unless operator activation is separately authorized.                                                                                                                                                                                                                                | Phase 3-1 §7               | Confirmed.                                                                      |
| **Empty-stream behavior is honest.** §5.4 distinguishes empty-stream-no-replay (zero rows, the 3-5 correction) from empty-stream-with-replay (4 rows with `cursor: null`, `status: 'idle'`, fresh `last_rebuilt_at` — because `replay()` always writes `setState` per `projectionRunner.js:307,331-338`).              | 3-5 / 3-6 reconciliation   | Confirmed.                                                                      |
| **Only valid `finance.projection_state.status` values are used.** §5.4 / §5.10 / §8 reference `idle                                                                                                                                                                                                                    | replaying                  | degraded`per`projection-runtime.md`§3; no use of`'ok'` or other made-up values. | 3-5 reconciliation | Confirmed. |
| **Infrastructure-event filtering rules preserved.** §5.8 explicitly states `audit_timeline` is the only consumer of `finance.audit.event_appended` (opt-in via `includeInfrastructureEvents: true` in `buildProjectionRunner` at `backend/workers/financeProjectionWorker.js:194`); business projections never see it. | Track A freeze + 3-6 scope | Confirmed.                                                                      |
| **Operator-triggered degraded recovery is the only path out of degraded.** §5.10 references `projection-runtime.md` §11 and notes that the drill itself does not induce degraded conditions (would require code change or event-store mutation, both forbidden).                                                       | 3-6 scope                  | Confirmed.                                                                      |

---

## 11. Acceptance for Phase 3-6 (this task)

This document is the Phase 3-6 deliverable when paired with the matching CHANGELOG entry and the scaffold update. Acceptance for the **drill plan** (this task):

- [x] Operator drill steps defined as a dry run (§5 — 10 sub-steps; the operator replay surface gap is honestly documented in §4 with three execution paths)
- [x] No replay run by this task — §2 explicit "None" for every modality
- [x] Ledger projection rebuild parity covered (§5.5)
- [x] `approval_queue` rebuild parity covered (§5.6)
- [x] `adapter_queue` rebuild parity covered (§5.7)
- [x] `audit_timeline` behavior + infrastructure-event filtering / opt-in rules covered (§5.8)
- [x] Repeated-replay determinism covered (§5.9)
- [x] Degraded-projection recovery as operator-only covered (§5.10, with explicit note that the drill does not induce degraded conditions)
- [x] Expected empty-stream behavior: no projection_state bootstrap rows from worker poll loop, but four rows from operator-triggered replayAll (§5.4 nuance table — the 3-5 correction explicitly carried forward and refined)
- [x] Commands / log checks as operator instructions only (§5 + §6)
- [x] Pass/fail criteria and stop conditions included (§7, §8)
- [x] `ENABLE_FINANCE_PERSISTENT_EVENTS` kept `false`/unset, fail-closed at `backend/routes/finance.v2.js:48` (§3 prereq, §10)
- [x] `ENABLE_FINANCE_OPS` unchanged (§10)
- [x] CHANGELOG entry recording Phase 3-6 (separate change)
- [x] Scaffold updated with commit hash and next active item (Phase 3-7)

Acceptance for the **execution** (a future, separately-authorized operator action): every check in §7 PASS, the `finance.projection_state` for the controlled tenant is in the expected post-replay shape, no production action occurred.

---

## 12. Evidence pack (populated on execution)

When the drill is executed, capture verbatim outputs here (or in a linked evidence record under `docs/architecture/finance/phase-3-evidence/`). Until execution, the table below is empty.

| Step  | Run at (UTC) | Operator | Result (PASS / FAIL / DEFERRED) | Output / evidence link | Notes |
| ----- | ------------ | -------- | ------------------------------- | ---------------------- | ----- |
| §5.2  |              |          |                                 |                        |       |
| §5.3  |              |          |                                 |                        |       |
| §5.4  |              |          |                                 |                        |       |
| §5.5  |              |          |                                 |                        |       |
| §5.6  |              |          |                                 |                        |       |
| §5.7  |              |          |                                 |                        |       |
| §5.8  |              |          |                                 |                        |       |
| §5.9  |              |          |                                 |                        |       |
| §5.10 |              |          |                                 |                        |       |

Next packet (once §5 PASS): **Phase 3-7 — Activate Finance v2 route for one controlled staging tenant**.
