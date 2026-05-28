# Finance Ops — Phase 2C-10: Dead-Letter and Retry Operational Verification

**Phase 2C-10 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Verification document. No code, no activation. Adapter worker stays disabled; provider writes stay disabled.
**Date:** 2026-05-22
**Related:** [`adapter-runtime-contract.md`](./adapter-runtime-contract.md) §3 · [`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) (2C-8) · [`worker-service-topology.md`](./worker-service-topology.md) §9 · [`observability-alerting.md`](./observability-alerting.md) (2C-11)

---

## 1. Goal and Scope

Define and verify the retry and dead-letter behavior of the adapter worker
**before** that worker is activated in staging. This document does not change the
retry contract — it consolidates it from `adapter-runtime-contract.md` §3 into an
operational verification checklist, and states how an operator inspects and
recovers a failed job.

No new finance semantics. Provider writes remain sandbox-only throughout (§8).

---

## 2. Retry Count

| Parameter                            | Value | Env override                                 |
| ------------------------------------ | ----- | -------------------------------------------- |
| Max attempts before terminal failure | **5** | `FINANCE_ADAPTER_MAX_ATTEMPTS` (default `5`) |

After 5 failed attempts a job is **permanently failed** and is **never
re-queued automatically** (`adapter-runtime-contract.md` §3). Attempts are
counted on the `finance.adapter_jobs.attempts` column, incremented on each
`queued → running` claim. The count is durable — it survives a worker restart
because it lives on the job row, not in worker memory.

---

## 3. Backoff Strategy

Exponential backoff with jitter. The delay before the retry that follows a
failed attempt `n` (1-indexed) is:

```
delay_after_attempt_n = min(2^(n-1) × FINANCE_ADAPTER_BACKOFF_BASE_MS,
                            FINANCE_ADAPTER_BACKOFF_CAP_MS)
                        + random(0 .. 5000 ms)   -- jitter
```

| Env var                           | Default            | Purpose                                |
| --------------------------------- | ------------------ | -------------------------------------- |
| `FINANCE_ADAPTER_BACKOFF_BASE_MS` | `15000` (15 s)     | Base unit — the delay after attempt 1. |
| `FINANCE_ADAPTER_BACKOFF_CAP_MS`  | `1800000` (30 min) | Upper bound on any single delay.       |

Concrete schedule (base 15 s, doubling each attempt, capped 30 min):

| Failed attempt | Backoff before next attempt      |
| -------------- | -------------------------------- |
| 1              | `2^0 × 15 s` = ~15 s (+ jitter)  |
| 2              | `2^1 × 15 s` = ~30 s (+ jitter)  |
| 3              | `2^2 × 15 s` = ~1 min (+ jitter) |
| 4              | `2^3 × 15 s` = ~2 min (+ jitter) |
| 5              | **no retry — terminal**          |

> **Exponent note.** `adapter-runtime-contract.md` §3 writes the formula as
> `2^attempts × 15 s`. Read with 1-indexed `attempts`, that is off by one from
> its own retry table — it would make the attempt-1 delay 30 s, not 15 s. This
> document uses the `2^(n-1)` form so the formula reproduces the documented
> schedule exactly (the attempt-1 delay equals the base, 15 s). The schedule
> values are unchanged; only the exponent is stated precisely.

`finance.adapter_jobs.next_attempt_at` records the absolute time a `failed` job
becomes re-claimable; a `failed → queued` retry only happens once `next_attempt_at`
has elapsed **and** `attempts < max_attempts`.

**Determinism note.** The _sequence of states_ (`queued → running → failed →
queued → … → failed terminal`) and the _number of attempts_ are fully
deterministic. The backoff _delay_ is deterministic per attempt **plus** a
bounded `0–5 s` jitter — jitter spreads retry load and prevents thundering-herd
synchronization; it never changes the outcome, only the timing within a known
±5 s window. Retry behavior is therefore deterministic in every dimension that
affects correctness.

---

## 4. Terminal Failure Status

When `attempts >= max_attempts` (`adapter-runtime-contract.md` §3 "Permanent
failure handling"):

1. `finance.adapter_jobs.status` remains **`failed`** — there is no separate
   `dead_lettered` status; terminal failure is `failed` with `attempts` exhausted.
2. `finance.adapter_jobs.error_message` (and `error_payload`) hold the last
   adapter error — the failure cause is durably recorded on the job row.
3. `finance.adapter.sync_failed` is emitted with `payload.permanent = true`,
   `attempts`, `max_attempts`, `error_message`, `error_code`, and
   `next_attempt_at = null`.
4. A `finance.approvals` record is created — `target_type = 'adapter_job'`,
   `target_id = adapter_jobs.id`, `status = 'pending'` — routing the job to a
   human for review.
5. The job is **never re-queued automatically** after this point.

A terminal `failed` job is distinguished from a retryable `failed` job by
`attempts >= max_attempts` and `next_attempt_at IS NULL`.

---

## 5. Dead-Letter Visibility — Cannot Silently Disappear

The dead-letter state is the permanently-failed job plus its pending review
record. It is visible — and **durable** — in three independent places:

| Surface                    | What it shows                                                                                     | Durability                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finance.adapter_jobs` row | `status = 'failed'`, `attempts = max`, `error_message`, `error_payload`, `next_attempt_at = null` | A finance operational row; not auto-deleted.                                                                                                                                                                                                                                                                                                                          |
| `finance.approvals` row    | `target_type = 'adapter_job'`, `status = 'pending'` — the live human-review worklist entry        | No application code deletes a finance approval row. A DB-level hard-delete guard (`security-rls-hardening.md` §3.1 `prevent_hard_delete_posted`) is **DRAFT — not yet migrated** (`staging-rls-validation.md` §5.1), so this row is not yet trigger-protected. The definitive non-disappearance guarantee is the append-only `sync_failed` event below, not this row. |
| `finance.audit_events`     | the `finance.adapter.sync_failed` event with `permanent: true`                                    | **Append-only and immutable** at the DB layer (migration 173 triggers) — the failure record can never be edited or removed.                                                                                                                                                                                                                                           |

Because the terminal `sync_failed` event is in the append-only event store, the
dead-letter fact is **permanent and replayable** — it cannot silently disappear
even if the `adapter_jobs` or `approvals` row were somehow altered. The event
stream is the backstop. A dead-lettered job also surfaces on the adapter
worker's `GET /ready` health endpoint as a `503`/`warn` count
(`worker-service-topology.md` §8.2) and as an observability signal
([`observability-alerting.md`](./observability-alerting.md) 2C-11).

---

## 6. Operator Recovery Steps

A dead-lettered (permanently `failed`) job is resolved **only** by explicit
operator action — the worker never auto-recovers it.

1. **Detect.** The `dead-letter count` signal (2C-11) alerts; or the operator
   sees the `pending` `adapter_job` approval in the worklist, or a `503` on the
   adapter worker's `/ready`.
2. **Inspect the cause.** Read `finance.adapter_jobs.error_message` /
   `error_payload` for the last adapter error, and the `finance.adapter.sync_failed`
   event payload (`error_message`, `error_code`, `attempts`) for the full
   failure history. The `correlation_id` / `causation_id` link back to the
   originating command.
3. **Decide.** Three outcomes:
   - **Re-queue** — once the root cause is fixed (e.g. sandbox credentials,
     payload mapping). A human-only re-queue resets `attempts` to 0, sets
     `status = 'queued'`, and clears `next_attempt_at`
     (`adapter-runtime-contract.md` §9, `POST /adapter-jobs/:id/retry` — a
     Phase 2 route addition).
   - **Cancel** — `status = 'cancelled'` if the job should not run.
   - **Escalate** — leave the `pending` approval open and route it onward.
4. **Resolve the approval.** The `target_type = 'adapter_job'` approval record is
   moved to a terminal status, emitting `finance.approval.approved` /
   `finance.approval.rejected` so the resolution is itself in the audit trail.
5. **Confirm.** A re-queued job runs again under the normal lifecycle (attempts
   start fresh); confirm `finance.adapter.sync_succeeded`, or that it
   dead-letters again with a now-understood cause.

The recovery path is deliberately manual: a permanently-failed job means the
provider call, the payload, or the configuration is wrong — an operator must
understand _why_ before re-running it.

---

## 7. Replay Interaction

A precise distinction, because "replay" means two different things:

- **Event replay rebuilds read models — it does not re-run jobs.** Replaying the
  tenant event stream (`projection-runtime.md` §9) reconstructs the
  `adapter_queue` projection from the `finance.adapter.sync_*` events. A
  dead-lettered job's `sync_failed (permanent: true)` event is part of that
  stream, so a rebuilt `adapter_queue` projection **always reflects the
  dead-letter state** — replay never "loses" or "heals" a dead-letter.
- **Replay never re-executes an adapter job.** Re-running a job is an
  operator-only action (§6, the `/retry` route). Replay is a pure read-model
  rebuild; it issues no provider call and changes no `adapter_jobs` row.
- **Idempotent emission.** On a retry, the job processor checks job status before
  emitting, so a retried job never appends a duplicate
  `finance.adapter.sync_succeeded` (`adapter-runtime-contract.md` §3 "Retry
  idempotency"). Replay of the resulting stream is therefore stable.
- The replay/rebuild drill ([`replay-rebuild-operational-drill.md`](./replay-rebuild-operational-drill.md),
  2C-12) explicitly verifies the `adapter_queue` projection — including failed
  and dead-lettered jobs — rebuilds identically.

---

## 8. Provider Writes Remain Sandbox-Only

Nothing in retry or dead-letter handling relaxes the sandbox-only posture. A
retried job runs under the same two-layer guard as any other
([`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) §3–§5):
`FINANCE_PROVIDER_WRITES_ENABLED=false` and the `assertWritePermitted` write
guard. A dead-lettered job re-queued by an operator is **still** sandbox/draft-only
— recovery does not escalate privileges.

---

## 9. Staging Verification Checklist

Run against the controlled staging tenant, adapter worker enabled,
`FINANCE_PROVIDER_WRITES_ENABLED=false`:

- [ ] A job that fails transiently is retried; `attempts` increments; the
      backoff schedule (§3) is observed within the ±5 s jitter window.
- [ ] A job that fails 5× transitions to terminal `failed` with
      `next_attempt_at = null` and is not re-queued automatically.
- [ ] Terminal failure emits `finance.adapter.sync_failed` with
      `permanent: true` and creates a `finance.approvals` record
      (`target_type = 'adapter_job'`, `status = 'pending'`).
- [ ] The dead-letter is visible on all three surfaces (§5) and on the adapter
      worker's `/ready` count.
- [ ] `error_message` / `error_payload` let an operator inspect the failure cause.
- [ ] An operator re-queue resets `attempts` and the job re-runs.
- [ ] Replaying the event stream reconstructs the `adapter_queue` projection with
      the dead-letter state intact.

---

## 10. Acceptance Criteria — Self-Check

| 2C-10 acceptance criterion                  | Status                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Retry behavior is deterministic             | ✅ Sections 2–3 — fixed max attempts, deterministic exponential schedule + bounded ±5 s jitter; state sequence fully deterministic. |
| Failed adapter jobs are visible             | ✅ Section 5 — three durable surfaces + `/ready` count.                                                                             |
| Dead-letter state cannot silently disappear | ✅ Section 5 — terminal `sync_failed` event is append-only/immutable; the event stream is the permanent backstop.                   |
| Operator can inspect failure cause          | ✅ Sections 4, 6 — `error_message`/`error_payload` on the job, full history in the `sync_failed` event.                             |
| Provider writes remain sandbox-only         | ✅ Section 8 — retry/recovery runs under the unchanged two-layer guard.                                                             |

---

_Part of the Finance Ops architecture suite. Related: `adapter-runtime-contract.md`
(Track E), `adapter-worker-sandbox-plan.md` (2C-8), `worker-service-topology.md`
(2B-13), `observability-alerting.md` (2C-11), `replay-rebuild-operational-drill.md`
(2C-12)._
