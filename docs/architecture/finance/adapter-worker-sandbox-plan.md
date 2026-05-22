# Finance Ops — Phase 2C-8: Adapter Worker Sandbox-Only Activation Plan

**Phase 2C-8 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Activation plan — adapter worker stays disabled; provider writes stay disabled. No staging activation performed by this document.
**Date:** 2026-05-22
**Related:** [`adapter-runtime-contract.md`](./adapter-runtime-contract.md) (Track E) · [`worker-service-topology.md`](./worker-service-topology.md) §3, §10 · [`finance-worker-deployment-config.md`](./finance-worker-deployment-config.md) (2C-5) · [`erpnext-sandbox-proof.md`](./erpnext-sandbox-proof.md) (2C-9) · [`dead-letter-retry-verification.md`](./dead-letter-retry-verification.md) (2C-10)

---

## 1. Goal and Scope

Prepare `finance-adapter-worker` for staging activation **without enabling any
live provider write**. The worker may, in staging, drain adapter jobs and run
the job lifecycle — but it remains **sandbox-only and draft-only**, with provider
writes disabled, enforced by configuration **and** a code guard.

This introduces no new finance semantics. The adapter job lifecycle, write
guard, and event contract are already defined in
[`adapter-runtime-contract.md`](./adapter-runtime-contract.md) (Track E). This
document is the operational plan for hosting that contract in staging at the
safest possible setting.

---

## 2. What the Adapter Worker Does

`finance-adapter-worker` is the **adapter job processor** (decision E2). It is
**row-driven**, not an event-stream consumer:

- It polls `finance.adapter_jobs WHERE status = 'queued' AND next_attempt_at <= now()`.
- It claims each job with an **optimistic lock**
  (`UPDATE ... WHERE status = 'queued' RETURNING *`) so concurrent processors
  never double-claim (`adapter-runtime-contract.md` §3).
- It runs the job through the write guard (§5) and — only if permitted — the
  adapter plugin method, then writes the result back and **emits** the adapter
  event.

### 2.1 The adapter event family

The three canonical adapter events — `finance.adapter.sync_queued`,
`finance.adapter.sync_succeeded`, `finance.adapter.sync_failed` — are the
worker's **output**, not its input:

- `finance.adapter.sync_queued` is emitted at enqueue (by the API/domain
  service) when a job is inserted with `status = 'queued'`.
- `finance.adapter.sync_succeeded` / `finance.adapter.sync_failed` are emitted by
  **this worker** as a job reaches a terminal/retry state.

Those emitted events are what the `adapter_queue` projection later consumes
(`worker-service-topology.md` §3.2). The adapter worker reads `finance.adapter_jobs`
rows and writes `finance.audit_events` rows (event emission) — it does not
consume the event stream itself. All emitted events use the frozen Track A
envelope (`aggregate_type = 'adapter_job'`, `aggregate_id = adapter_jobs.id`);
the worker never introduces `object_type` / `object_id`.

---

## 3. Sandbox-Only / Draft-Only — Two Enforcement Layers

The "no live provider write" guarantee does not rest on a single switch. It is
enforced by **configuration** (§4) **and** an independent **code guard** (§5).
Either layer alone blocks a live write; both must be deliberately changed to
permit one.

```
Job ready to run
  └─ Layer 1 — CONFIG:  FINANCE_PROVIDER_WRITES_ENABLED=false
  │                     FINANCE_ADAPTER_MODE=draft_only
  │     ↓ (if config somehow permitted a write)
  └─ Layer 2 — CODE:    assertWritePermitted(job, approval)   — write guard
  │                     + provider-writes-enabled runtime check
  │     ↓ (if both somehow passed)
  └─ Provider call — pushDraft ONLY, against a sandbox base_url
```

This is the same defense-in-depth posture `worker-service-topology.md` §10
states: the four-layer safety stack (`ENABLE_FINANCE_OPS` → module gate →
governance → write guard) is never bypassed, and the adapter worker stays
sandbox/draft-only until a separate, explicit gate.

---

## 4. Layer 1 — Configuration Guards

From `finance-worker-deployment-config.md` §3.2, set on the adapter worker:

| Variable | Staging value | Effect |
| -------- | ------------- | ------ |
| `FINANCE_PROVIDER_WRITES_ENABLED` | `false` | **Dominant kill switch.** While `false`, the worker performs **no** outbound provider HTTP write of any kind — it may only map/validate payloads and advance job state. |
| `FINANCE_ADAPTER_MODE` | `draft_only` | Caps the adapter at `pushDraft`. `approval_required_write` (the `pushFinal` / `void` path) is **never** set in staging config. |

`FINANCE_PROVIDER_WRITES_ENABLED=false` dominates: even with
`FINANCE_ADAPTER_MODE=draft_only`, **no provider write occurs while it is
`false`**. In that posture the worker is a dry processor — it claims jobs,
exercises the lifecycle and event emission, runs the write guard, builds the
canonical→provider payload, and stops short of the HTTP call.

Flipping `FINANCE_PROVIDER_WRITES_ENABLED` to `true` is a **separate, explicit
decision** requiring a sandbox-only provider target (2C-9) and is out of scope
for Phase 2C activation.

---

## 5. Layer 2 — Code Guards

Configuration is not trusted alone. The worker code enforces two independent
checks before any adapter method that could write:

### 5.1 The write guard — `assertWritePermitted`

`adapter-runtime-contract.md` §4 defines `assertWritePermitted(job, approvalRecord)`,
called as the **first step of every job execution**:

- `pull` / `sync_status` / `reconcile` → always permitted (reads).
- `read_only` mode → any write operation throws `WriteGuardError`.
- `void` under `draft_only` → throws (`void` requires `approval_required_write`).
- `approval_required_write` → requires an `approved` `finance.approval` record.

Under the staging config (`FINANCE_ADAPTER_MODE=draft_only`), the only write the
guard can pass is `push_draft` → `adapter.pushDraft()`, which by contract creates
only a **non-finalised** provider record and must never post/submit/finalise.

### 5.2 The provider-writes-enabled gate

In addition to the write guard, the worker checks `FINANCE_PROVIDER_WRITES_ENABLED`
in code immediately before any `pushDraft` HTTP call. If it is not truthy, the
worker **skips the provider call entirely** — it records the job outcome as a
dry-run (no provider contacted) rather than performing a write. This makes the
config flag a code-enforced gate, not merely a hint: a misconfigured `mode`
cannot produce a provider write while `FINANCE_PROVIDER_WRITES_ENABLED` is false.

### 5.3 AI actors cannot move money

Independently, the governance policy `finance.ai.no_money_movement` blocks AI
actors from approving or posting regardless of adapter mode
(`adapter-runtime-contract.md` §4 "AI actor constraint"). The write guard and the
governance guard are independent layers; both must pass.

---

## 6. Provider Payload Strips Internal Runtime Metadata

Decision **E6** (`adapter-runtime-contract.md` §10): internal AiSHA runtime
metadata must **never** appear in an outbound provider payload.

- `draft_only`, governance/policy fields, Braid trace IDs, correlation/causation
  IDs, and any internal runtime policy field are **internal metadata only**.
- They are stripped in the **job processor dispatch layer** — a
  `buildProviderPayload(canonicalObject, runtimePolicy)` boundary — **not** in
  the canonical mapper.
- The provider receives only the provider-native shape produced by the adapter's
  `fromCanonical` + `PROVIDER_OBJECT_MAP`. Unmapped canonical fields are omitted
  (map value `null`); provider extras round-trip through `metadata.provider_extras`
  (`adapter-runtime-contract.md` §5).
- **Acceptance requirement** (carried from the scaffold E6): when the adapter is
  eventually implemented, tests must assert that `draft_only`, governance
  metadata, and internal policy fields are **not** present in the payload sent to
  any provider. This test obligation is recorded here and in
  [`erpnext-sandbox-proof.md`](./erpnext-sandbox-proof.md) (2C-9).

---

## 7. Sandbox Provider Targets Only

When provider interaction is eventually enabled (a later gate), it is
**sandbox-only**:

- **ERPNext sandbox / self-hosted instance only.** The connection `base_url`
  must point at a sandbox or local ERPNext instance — never a production ERPNext
  tenant. ERPNext is the first proof target (decision E5;
  [`erpnext-sandbox-proof.md`](./erpnext-sandbox-proof.md)).
- **No QuickBooks live credentials. No Xero live credentials.** No OAuth flow is
  configured or activated. QuickBooks/Xero remain canonical-schema references
  only; their live adapters are a much later gate.
- **No payment movement.** No operation that moves money, posts to a live
  ledger, or finalises a provider record is permitted in staging.
- Provider connection config is loaded per-tenant from
  `tenant_integrations.api_credentials` at runtime (`adapter-runtime-contract.md`
  §6). For the ERPNext POC, plain JSONB is acceptable (decision E4); only
  **sandbox** credentials are ever stored for the controlled staging tenant.

---

## 8. Adapter Events Are Emitted and Replayable

Every job outcome emits a canonical adapter event to `finance.audit_events`
(`adapter-runtime-contract.md` §7) using the frozen Track A envelope. Because the
events land in the append-only event store, they are **replayable** — the
`adapter_queue` projection rebuilds purely from them
([`projection-contracts.md`](./projection-contracts.md)). Event emission on
retry is status-checked so a retried job never emits a duplicate
`finance.adapter.sync_succeeded` (`adapter-runtime-contract.md` §3 "Retry
idempotency").

---

## 9. Failed Jobs Are Observable

Failure is never silent:

- Each `running → failed` transition emits `finance.adapter.sync_failed` with
  `attempts`, `max_attempts`, `permanent`, `error_message`, and `next_attempt_at`.
- On permanent failure (5 attempts exhausted), the worker emits
  `finance.adapter.sync_failed` with `permanent: true` **and** creates a
  `finance.approvals` record with `target_type = 'adapter_job'`, `status =
  'pending'` — the dead-letter path requiring human review
  (`adapter-runtime-contract.md` §3).
- A stuck-job watchdog resets any job in `running` longer than
  `FINANCE_ADAPTER_STUCK_JOB_MS` (default 5 min) back to `queued`.
- The worker's `GET /ready` surface reports the count of dead-lettered jobs as a
  `503`/`warn` signal (`worker-service-topology.md` §8.2).

Retry/back-off behavior, terminal-failure status, dead-letter visibility, and
operator recovery are specified in full in
[`dead-letter-retry-verification.md`](./dead-letter-retry-verification.md)
(2C-10); observability signals in
[`observability-alerting.md`](./observability-alerting.md) (2C-11).

---

## 10. Staging Activation

Enabled by the three-tier gate (`finance-worker-deployment-config.md` §3.1), set
**only** in staging, with the adapter safety flags as in §4:

```
ENABLE_FINANCE_OPS=true
ENABLE_FINANCE_WORKERS=true
ENABLE_FINANCE_ADAPTER_WORKER=true
FINANCE_ADAPTER_MODE=draft_only
FINANCE_PROVIDER_WRITES_ENABLED=false
```

All enable flags default to `false`; the worker **starts disabled** and idles
until all three are explicitly truthy. `FINANCE_PROVIDER_WRITES_ENABLED` stays
`false` — staging activation of the adapter worker does **not** include enabling
provider writes. Production keeps every flag unset.

---

## 11. Rollback / Disable

One non-destructive step: set `ENABLE_FINANCE_ADAPTER_WORKER=false` (or, to stop
only provider interaction while keeping job processing, this is already the
default since `FINANCE_PROVIDER_WRITES_ENABLED=false`) and redeploy. The worker
idles. In-flight jobs left in `running` are recovered by the stuck-job watchdog
on the next enabled run, or remain safely claimable. `finance.adapter_jobs` and
`finance.audit_events` are untouched by disabling the worker.

---

## 12. Acceptance Criteria — Self-Check

| 2C-8 acceptance criterion | Status |
| ------------------------- | ------ |
| Adapter worker cannot write to live providers | ✅ Sections 4–5, 7 — two enforcement layers; `FINANCE_PROVIDER_WRITES_ENABLED=false` code-gated; sandbox `base_url` only; no live QB/Xero credentials. |
| Sandbox-only behavior enforced by configuration **and** code guard | ✅ Section 3 — Layer 1 config (§4) + Layer 2 code (`assertWritePermitted` + provider-writes-enabled gate, §5). |
| Provider payload strips internal runtime metadata | ✅ Section 6 — E6 `buildProviderPayload` boundary; `draft_only`/governance/trace fields stripped; test obligation recorded. |
| Failed jobs are observable | ✅ Section 9 — `sync_failed` events, permanent-failure dead-letter approval record, stuck-job watchdog, `/ready` count. |

---

_Part of the Finance Ops architecture suite. Related: `adapter-runtime-contract.md`
(Track E), `worker-service-topology.md` (2B-13), `finance-worker-deployment-config.md`
(2C-5), `erpnext-sandbox-proof.md` (2C-9), `dead-letter-retry-verification.md`
(2C-10), `observability-alerting.md` (2C-11)._
