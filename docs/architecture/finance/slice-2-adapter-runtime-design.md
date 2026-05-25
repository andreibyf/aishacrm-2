# Finance Ops — Slice 2-0: Adapter Worker + ERPNext Sandbox Design Freeze

**Slice 2-0 — Design freeze for `finance-adapter-worker` + ERPNext sandbox/draft-only adapter implementation.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Design freeze. **No code was shipped by this task.** No worker process implemented, no ERPNext adapter implemented, no provider HTTP call, no migration applied, no env var changed, no Coolify mutation, no staging activation, no production action. This document freezes the interfaces, lifecycle, and packet boundaries so the five parallel implementation packets (2A–2E) can proceed without re-deciding architecture mid-flight.
**Date:** 2026-05-24
**Why now:** Phase 3-9 / 3-10 cannot be completed honestly until the adapter runtime exists in code. Slice 2 builds that runtime; Slice 2-0 is the design freeze before the parallel coding begins.
**Related:**
[`adapter-runtime-contract.md`](./adapter-runtime-contract.md) (Track E, the canonical adapter spec — Slice 2 implements against this) ·
[`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) (2C-8, sandbox-only activation plan) ·
[`erpnext-sandbox-proof.md`](./erpnext-sandbox-proof.md) (2C-9, ERPNext proof gate — Slice 2 makes this executable) ·
[`dead-letter-retry-verification.md`](./dead-letter-retry-verification.md) (2C-10, retry / DLQ contract) ·
[`projection-contracts.md`](./projection-contracts.md) §7 (`adapter_queue` projection — already implemented in Phase 2B-10, consumes the events Slice 2 will emit) ·
[`worker-service-topology.md`](./worker-service-topology.md) §3 (adapter worker topology) ·
[`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) (3-4) ·
[`staging-route-activation-log.md`](./staging-route-activation-log.md) (3-7) ·
`backend/lib/finance/accountingAdapters/quickbooksCanonicalAdapter.js` (existing canonical mapper) ·
`backend/lib/finance/projections/adapterQueueProjection.js` (already consuming `finance.adapter.sync_queued` / `sync_succeeded` / `sync_failed` events with no producer)

---

## 1. Purpose and scope

Slice 2-0 freezes the design for the next implementation slice. Specifically: **what gets built**, **what each parallel packet owns**, **what contracts the packets share**, and **what stays out of scope** until a later gate.

After Slice 2 lands all packets (2A–2E), the following becomes true that isn't true today:

- `finance-adapter-worker` exists as a deployable Coolify app process, gated by the three-tier worker enable gate.
- An ERPNext sandbox-only adapter implements every required `AccountingAdapter` interface method per [`adapter-runtime-contract.md`](./adapter-runtime-contract.md) §2.
- The adapter job processor drains `finance.adapter_jobs WHERE status = 'queued'` via optimistic-lock claim, runs `assertWritePermitted` + the provider-writes-enabled code gate, calls the adapter (or skips the HTTP call when `FINANCE_PROVIDER_WRITES_ENABLED=false`), and emits canonical `finance.adapter.sync_succeeded` / `sync_failed` events. The companion `finance.adapter.sync_queued` event is emitted upstream by the `approveFinanceAction()` promoter (see §4.1, §4.7), not by the processor.
- The `adapter_queue` projection (already implemented in Phase 2B-10) has actual events to consume.
- Phase 3-9 (adapter worker staging activation) and Phase 3-10 (ERPNext sandbox proof execution) become executable because the runtime they need exists.

**Scope boundary — what Slice 2 does NOT do:**

- **No live provider writes.** `FINANCE_PROVIDER_WRITES_ENABLED` remains `false` in all staging defaults. Provider HTTP writes are skipped at the code gate. The one explicit exception is the §5.3.c proof step in 2C-9 — a deliberately authorized one-time enablement against a sandbox ERPNext only, reverted immediately after.
- **No production credentials.** No QuickBooks / Xero / NetSuite live OAuth flow is configured. Only sandbox ERPNext API key + secret in `tenant_integrations.api_credentials` for the controlled staging tenant.
- **No persistent-events route activation.** `ENABLE_FINANCE_PERSISTENT_EVENTS` stays unset on the backend; the route-mount guard at `backend/routes/finance.v2.js:48` remains structurally fail-closed. Slice 2 is the adapter-runtime build; the persistent-events route lift is a separate Slice (not 2).
- **No QuickBooks / Xero / NetSuite adapter implementation.** Those remain canonical-schema references. ERPNext is the only live-adapter target in Slice 2 per decision E5.
- **No `pushFinal` / `void` execution path.** Those exist in the interface (must be implemented to satisfy the type) but are blocked by `mode = 'draft_only'` per the write guard. Slice 2 never enters `approval_required_write` mode.
- **No new finance domain semantics.** Slice 2 implements the existing Track E contract; it does not change the event taxonomy, the approval lifecycle, or the journal lifecycle.
- **No migration application.** Slice 2 may introduce a new migration for credential encryption (per E4 — not strictly required for ERPNext API-key POC), but applying it is a separate operator step.

**This document is a design freeze.** No worker code, no adapter code, no test code is delivered by this task. The five sub-packets (2A–2E) each deliver their own code in separately reviewed commits.

---

## 2. Live-execution posture

**Default for this task: no code shipped, no live execution, no environment touched.**

| What                                                                       | Status this task                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `backend/lib/finance/accountingAdapters/erpnextAdapter.js` created         | None — Slice 2A delivers it.                                                                      |
| `backend/lib/finance/accountingAdapters/providerPayloadBuilder.js` created | None — Slice 2A delivers it.                                                                      |
| `backend/workers/financeAdapterWorker.js` created                          | None — Slice 2C delivers it.                                                                      |
| `backend/lib/finance/adapterJobProcessor.js` created                       | None — Slice 2B delivers it.                                                                      |
| Migration for credential encryption                                        | None — deferred unless QuickBooks/Xero OAuth lands (Slice 2 ERPNext POC uses plain JSONB per E4). |
| `worker:finance-adapter` npm script registered in `backend/package.json`   | None — Slice 2C delivers it.                                                                      |
| Coolify worker app `staging-finance-adapter-worker` created                | None — Phase 3-9 covers that after Slice 2 lands.                                                 |
| Provider HTTP call to any ERPNext / QuickBooks / Xero / NetSuite endpoint  | None — `FINANCE_PROVIDER_WRITES_ENABLED=false` everywhere; no provider client constructed yet.    |
| `tenant_integrations.api_credentials` row inserted for any tenant          | None — Phase 3-10 covers that with sandbox credentials only.                                      |
| Staging Doppler env var changed                                            | None.                                                                                             |
| Production environment touched in any way                                  | None.                                                                                             |

A live implementation of any 2A–2E packet requires the deploy owner's explicit authorization. When authorized, each packet is implemented in its own commit (or commit series) with its own pre-commit gate and Codex review.

---

## 3. Prerequisites — what must be true before Slice 2 implementation begins

- [ ] **Phase 3-1 baseline.** Branch `feat/finance-ops-runtime` at a descendant of `3c60d9ff`; 278/278 finance + projection + worker + route tests passing.
- [ ] **Track E contract frozen.** [`adapter-runtime-contract.md`](./adapter-runtime-contract.md) is the authoritative interface. Slice 2 implements against it without modifying it.
- [ ] **Phase 2B-10 adapter_queue projection in place.** `backend/lib/finance/projections/adapterQueueProjection.js` already exists and consumes `finance.adapter.sync_queued` / `sync_succeeded` / `sync_failed` events. Slice 2's `approveFinanceAction()` promoter (§4.1, §4.7) emits `sync_queued`; Slice 2's job processor emits `sync_succeeded` / `sync_failed`. Together they produce the events that projection has been waiting for.
- [ ] **Phase 2C-8 sandbox plan reviewed.** The two enforcement layers (config + code), the E6 metadata-stripping boundary, and the sandbox-`base_url`-only rule are non-negotiable.
- [ ] **Phase 2C-9 ERPNext proof gate reviewed.** The §5 proof requirements bind the ERPNext adapter implementation; the §7 exit criteria become the Slice 2A acceptance test set.
- [ ] **`ENABLE_FINANCE_PERSISTENT_EVENTS` unset on the backend.** The Slice 1 fail-closed guard at `backend/routes/finance.v2.js:48` remains structurally enforced. Slice 2 does not lift this guard.
- [ ] **No production action.** `prd_prd` Doppler not opened; Hetzner not touched; production tenant `tenant_integrations` not modified.

---

## 4. Frozen decisions (the 10 design items)

Each decision below is **frozen for Slice 2 implementation**. Sub-packets (2A–2E) implement against these; deviations require updating this document first.

### 4.1 `finance.adapter_jobs` lifecycle and claim/lock semantics

**Lifecycle (corrected per Codex P1 / P2 review):** the actual canonical state machine in code + projection contracts + migration 168 includes a `draft` pre-approval state that the [`adapter-runtime-contract.md`](./adapter-runtime-contract.md) §3 lifecycle diagram omits (the diagram is the **runtime-side view** of jobs the processor sees; it starts at `queued`). The full DB lifecycle is:

```
draft  →  queued  →  running  →  succeeded
   ↓        ↑         ↓
   │        │         └→  failed  →  (retry: failed → queued)
   │        │                    →  (terminal: failed + permanent + approvals row)
   │        │
   └────────┴────  approval-driven transition (see "draft → queued promoter" below)

any → cancelled  (operator-only; out of Slice 2 HTTP scope)
```

`finance.adapter_jobs.status` enum per migration 168 + `simulateDealWon` (`backend/lib/finance/financeDomainService.js:471-483`) + projection-contracts.md §7 §"Adapter jobs in draft status" all agree: **`draft` is the canonical pre-approval state.** A `draft` row exists for adapter_jobs linked to approval-required journals; the row is **not** claimable by the worker and does **not** emit `finance.adapter.sync_queued`. The `sync_queued` event marks the post-approval `draft → queued` transition, and it's THAT transition that puts the job into the worker's claimable pool.

**`draft → queued` transition trigger (resolves §9 Q5 — no longer deferrable):**

When `approveFinanceAction()` marks an approval `approved`, the same call must — in the same transaction where possible — transition every adapter_job linked to that approval's target from `draft → queued` and emit `finance.adapter.sync_queued` for each. The "linked" relationship is structural via shared `aggregate_id`: simulateDealWon creates the approval with `aggregate_type='journal_entry', aggregate_id=<journal-id>` AND the adapter_job with the same `aggregate_type='journal_entry', aggregate_id=<journal-id>` (`financeDomainService.js:464-465, 476-477`). The promoter scope is therefore: "find all adapter_jobs WHERE tenant_id=$1 AND aggregate_id=$2 AND status='draft' and promote each to queued."

This makes the dependency explicit: **Slice 2B includes the `approveFinanceAction()` modification.** Q5's previous "wait" default is wrong — without this transition, no adapter_job ever reaches `queued`, the worker has nothing to claim, and Slice 2's end-to-end flow doesn't complete. Q5 is resolved YES below in §9.

**Note on the Phase 3-8 §5.7 contract** ("`approveFinanceAction` does not auto-post the journal"): that contract is preserved. The `draft → queued` adapter-job transition is **independent** of the journal `pending_approval → posted` transition. Approving the journal queues the adapter job (so the worker can sync a draft document to ERPNext); the journal itself stays at `pending_approval` until a separate journal-posting path lands in a future slice. Posting the journal is not a Slice 2 deliverable; queueing the adapter_job IS.

**Claim/lock semantics — frozen (unchanged from prior wording, claims `queued` only):**

**Claim/lock semantics — frozen:**

- The job processor claims jobs with a **single-row optimistic-lock UPDATE**:
  ```sql
  UPDATE finance.adapter_jobs
  SET status = 'running',
      attempts = attempts + 1,
      updated_at = now()
  WHERE id = (
    SELECT id FROM finance.adapter_jobs
    WHERE status = 'queued'
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      AND tenant_id = ANY($1::uuid[])
    ORDER BY created_at ASC, id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
  ```
- `FOR UPDATE SKIP LOCKED` prevents concurrent processors from blocking on the same row; combined with the `WHERE status = 'queued'` predicate it gives at-most-one claim per job per attempt.
- `tenant_id = ANY($1::uuid[])` scopes the claim to `FINANCE_CONTROLLED_TENANT_IDS` (Slice 2C parses this the same way `financeProjectionWorker.js:89` does — comma-separated UUIDs, empty = no tenants / no-op).
- **Stuck-job watchdog:** any row in `status = 'running'` for more than `FINANCE_ADAPTER_STUCK_JOB_MS` (default 300000 = 5 min) is reset to `status = 'queued'` (attempts unchanged) by a separate watchdog cycle within the same worker. Implementation: a periodic `UPDATE … WHERE status = 'running' AND updated_at < now() - INTERVAL '5 minutes'` run once per N poll cycles (default: every 20 cycles).

**Cancellation:** `any → cancelled` is operator-only and out of Slice 2 scope (no HTTP cancel endpoint is built in Slice 2). The cancellation state remains in the type/lifecycle for forward compatibility; nothing in Slice 2 transitions to it. The future cancel endpoint will be a separate packet.

### 4.2 Adapter job processor contract

**Module:** `backend/lib/finance/adapterJobProcessor.js` (Slice 2B). **Pure helper module** following the pattern of `runProjectionPollCycle` in `financeProjectionWorker.js:112-171` — takes its dependencies as arguments so it's unit-testable without a real DB or real adapter.

**Signature:**

```js
/**
 * runAdapterPollCycle({ pool, adapters, tenantIds, eventStore, now })
 *   - pool: pg.Pool for finance.adapter_jobs SELECT+UPDATE+SELECT
 *   - adapters: Map<provider, AccountingAdapter> — registered providers
 *   - tenantIds: string[] — controlled-tenant allow-list (from parseControlledTenantIds)
 *   - eventStore: financeEventStore.pg (for sync_succeeded / sync_failed emission)
 *   - now: () => Date (injectable for tests)
 *
 * Returns: { claimed_count, succeeded_count, failed_count, skipped_count, summary[] }
 *   summary[]: { job_id, tenant_id, provider, operation, outcome, error?, dry_run? }
 *
 * Error isolation: a thrown error from one job does not affect other jobs.
 * The cycle itself never throws — defense-in-depth catch around the inner loop.
 */
export async function runAdapterPollCycle({ pool, adapters, tenantIds, eventStore, now }) { ... }
```

**One-job-at-a-time processing per cycle.** Each cycle claims ONE job (the `LIMIT 1` in §4.1's SQL), processes it through guard + adapter + emit, then returns. The worker schedules subsequent cycles via `setTimeout` like the projection worker. Rationale: keeps the claim/process/release window tight; multiple processors (if ever scaled out) each claim their own job; no batching complexity.

**Per-job processing sequence:**

1. **Load context** — read the job row, load the adapter for `job.provider`, load `tenant_integrations` for the credentials (Slice 2A details the loader).
2. **`assertWritePermitted(job, approvalRecord)`** — per `adapter-runtime-contract.md` §4. For Slice 2, `approvalRecord` is always `null` (`approval_required_write` mode never used). The guard passes `pull` / `sync_status` / `reconcile` always; passes `push_draft` only under `draft_only`+ mode; blocks `void` and any operation under `read_only`.
3. **Build provider payload** — `buildProviderPayload(canonicalObject, runtimePolicy)` from Slice 2A. Strips `draft_only`, governance metadata, Braid trace, correlation/causation, and any field marked internal-runtime.
4. **Provider-writes-enabled code gate** — `if (operation !== 'pull' && operation !== 'sync_status' && operation !== 'reconcile') { if (process.env.FINANCE_PROVIDER_WRITES_ENABLED !== 'true') { /* skip HTTP, record dry_run outcome */ return; } }`. This is the §5.2 layer in 2C-8.
5. **Adapter HTTP call** — `await adapter.pushDraft(stripped, objectType)` (or `pull` / `sync_status`). Catches all errors.
6. **Job state update + event emission** — atomic where possible: a single `UPDATE finance.adapter_jobs SET status = $1, provider_response = $2, error_message = $3, next_attempt_at = $4, updated_at = now() WHERE id = $5` followed by the event emission via `eventStore.append({...})`.
7. **On terminal failure** (attempts ≥ max_attempts after this attempt) — additionally create a `finance.approvals` row with `target_type = 'adapter_job'`, `target_id = job.id`, `status = 'pending'` so a human can review (the DLQ-as-approval pattern from 2C-10 §4).

**Idempotency:** before emitting `finance.adapter.sync_succeeded`, the processor re-reads the job to confirm it didn't already reach terminal state from a concurrent processor (defense-in-depth — the `FOR UPDATE SKIP LOCKED` should prevent this, but the event-store has no dedupe; cheap re-read avoids duplicate events).

### 4.3 `finance-adapter-worker` process boundaries and env gates

**Module:** `backend/workers/financeAdapterWorker.js` (Slice 2C). **Mirror the projection worker structure** (`backend/workers/financeProjectionWorker.js`) — entry block + pure helpers + factory + standalone entry.

**Three-tier enable gate (mirrors projection worker):**

```js
export function isFinanceAdapterWorkerEnabled(env = process.env) {
  return (
    env.ENABLE_FINANCE_OPS === 'true' &&
    env.ENABLE_FINANCE_WORKERS === 'true' &&
    env.ENABLE_FINANCE_ADAPTER_WORKER === 'true'
  );
}
```

Same strict-equality semantics as the projection worker. Any non-`'true'` value leaves the gate closed.

**`FINANCE_CONTROLLED_TENANT_IDS` allow-list:** reuse the existing `parseControlledTenantIds()` helper from `financeProjectionWorker.js:89` (factor it into a shared `backend/workers/financeWorkerCommon.js` module in Slice 2C). Empty / unset → no tenants → no-op poll cycles.

**Additional env vars (per [`finance-worker-deployment-config.md`](./finance-worker-deployment-config.md) §3.2):**

- `FINANCE_ADAPTER_MODE` — staging default `draft_only`. Never `approval_required_write` in Slice 2 configs.
- `FINANCE_PROVIDER_WRITES_ENABLED` — staging default `false`. The dominant kill switch (§4.6).
- `FINANCE_ADAPTER_MAX_ATTEMPTS` — default `5` per `adapter-runtime-contract.md` §3.
- `FINANCE_ADAPTER_BACKOFF_BASE_MS` — default `15000` (15 s).
- `FINANCE_ADAPTER_BACKOFF_CAP_MS` — default `1800000` (30 min).
- `FINANCE_ADAPTER_STUCK_JOB_MS` — default `300000` (5 min).
- `FINANCE_WORKER_POLL_INTERVAL_MS` — default `5000`.
- `FINANCE_DB_URL` (or `DATABASE_URL`) — required at process startup (entry block exits if neither is set, same as the projection worker per Phase 3-4 §5.1 finding).

**Heartbeat file:** same pattern as the projection worker — `FINANCE_ADAPTER_WORKER_HEARTBEAT_PATH` (default `/tmp/finance-adapter-worker-heartbeat.json`), written on every poll cycle. The disabled-state-doesn't-write-heartbeat limitation (Phase 3-4 §8.2) carries over to the adapter worker; a follow-up to emit a one-time `status: 'disabled'` heartbeat could be done in Slice 2C or deferred.

**Health endpoint:** **NOT in Slice 2 scope.** Same gap as the projection worker per Phase 3-4 §5.1 — no HTTP `/health` / `/ready` endpoint is bound. The Docker healthcheck uses the heartbeat-file pattern from `deploy/coolify/finance-workers.staging.example.yml`. If/when a proper HTTP surface is added, both workers should get it together as a separate refactor.

### 4.4 ERPNext sandbox adapter boundary

**Module:** `backend/lib/finance/accountingAdapters/erpnextAdapter.js` (Slice 2A).

**Interface contract:** implements every required method of `AccountingAdapter` per `adapter-runtime-contract.md` §2:

- `checkHealth()` — `GET <base_url>/api/method/frappe.auth.get_logged_user` or equivalent lightweight ERPNext read. Resolves within 5 s. Returns `{ ok, latency_ms, provider: 'erpnext', error? }`.
- `fetchObject(objectType, providerId)` — `GET <base_url>/api/resource/<DocType>/<name>`.
- `listObjects(objectType, opts)` — `GET <base_url>/api/resource/<DocType>?limit_page_length=N&limit_start=offset`.
- `toCanonical(providerObject, objectType)` — uses `ERPNEXT_PROVIDER_OBJECT_MAP`. Round-trips unmapped fields through `metadata.provider_extras` per `adapter-runtime-contract.md` §5.
- `fromCanonical(canonicalObject, objectType)` — inverse mapping.
- `pushDraft(canonicalObject, objectType)` — `POST <base_url>/api/resource/<DocType>` with `docstatus: 0` explicitly set; **never calls the submit endpoint** (`/api/method/frappe.client.submit`) per 2C-9 §5.3.
- `pushFinal(canonicalObject, objectType, approvalId)` — implemented to satisfy the interface but throws `AdapterCapabilityError` (or returns `{ ok: false, error: 'pushFinal not enabled for ERPNext sandbox adapter' }`) since `mode = 'draft_only'` makes it unreachable via the write guard.
- `syncStatus(providerId, objectType)` — `GET …/api/resource/<DocType>/<name>` and read `docstatus`.

**`voidRecord` / `reconcile`:** **NOT implemented in Slice 2** — throw `AdapterCapabilityError`. ERPNext's cancel endpoint requires submission first, which Slice 2 never does.

**Sandbox `base_url` guard:** the adapter constructor refuses any `base_url` that doesn't match a known sandbox / local pattern. Acceptable patterns (the implementation can refine):

- `localhost` / `127.0.0.1` / `0.0.0.0` (local dev)
- `*.local`, `*.lan`, `*.internal` (private network)
- `sandbox.*` or `*-sandbox.*` (explicit sandbox subdomains)
- Any FQDN explicitly allowlisted in `FINANCE_ERPNEXT_SANDBOX_BASE_URLS` env (comma-separated, empty default)

Any other `base_url` → constructor throws `AdapterConfigError('base_url does not match a sandbox pattern')`. This is the §5.1 hard requirement from 2C-9.

**Auth:** API key + secret per `adapter-runtime-contract.md` §6 / 2C-9 §2. Loaded from `tenant_integrations.api_credentials` JSONB (plain — E4 / 2C-9 §6 step 2 — encryption deferred until QuickBooks OAuth). Sent as the `Authorization: token <api_key>:<api_secret>` header per ERPNext convention.

**`ERPNEXT_PROVIDER_OBJECT_MAP`:** ships in the same file. Initial coverage for `Account` and `JournalEntry`; `Invoice` / `Customer` / `Payment` follow in later packets. Mapping table format per `adapter-runtime-contract.md` §5 "Provider object maps".

### 4.5 Provider payload builder and internal metadata stripping rules

**Module:** `backend/lib/finance/accountingAdapters/providerPayloadBuilder.js` (Slice 2A).

**Signature:**

```js
/**
 * Strip internal AiSHA runtime metadata before a payload reaches the provider.
 *
 * @param {Object} canonicalObject — the canonical-shape object from the adapter's fromCanonical()
 * @param {Object} runtimePolicy — the job's mode + decision context (NOT included in output)
 * @returns {Object} payload safe to send to the provider
 */
export function buildProviderPayload(canonicalObject, runtimePolicy) { ... }
```

**Mandatory strips** (none of these may appear in the output):

| Field                                     | Source                                                             | Reason                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `draft_only`                              | Canonical shape (set by `mapJournalEntryToQuickBooksCanonical:52`) | Internal AiSHA runtime flag; not a provider field. E6.                                          |
| `governance_decision`                     | Job runtime context                                                | Policy metadata; not a provider field.                                                          |
| `policy_decision`                         | Job runtime context                                                | Same — policy metadata.                                                                         |
| `governance_policy_snapshot`              | Job runtime context                                                | Same — policy metadata.                                                                         |
| `braid_trace_id`                          | Event envelope context                                             | AiSHA telemetry; provider doesn't need to know.                                                 |
| `correlation_id` / `causation_id`         | Event envelope context                                             | AiSHA event lineage; provider doesn't need to know.                                             |
| `request_id`                              | Event envelope context                                             | AiSHA telemetry.                                                                                |
| `tenant_id` (on canonical objects)        | The whole multitenancy concept                                     | Provider is tenant-scoped via auth credentials, not via payload field.                          |
| `ai_generated`                            | AiSHA governance metadata                                          | Internal AI-actor flag; provider doesn't need to know.                                          |
| `created_by`, `updated_by`, `approved_by` | AiSHA user IDs                                                     | Internal AiSHA user IDs that don't map to provider users without a separate user-mapping table. |
| Any field whose key starts with `_`       | Convention                                                         | Leading-underscore = internal field by convention.                                              |

**Allowlist or denylist?** **Denylist with explicit allowlist override per adapter** is the Slice 2 choice. The builder takes the canonical object, removes the denylisted keys above, and returns the rest. If an adapter needs to add provider-specific fields, it does so in `fromCanonical()` AFTER `buildProviderPayload()` runs. Rationale: the canonical shape evolves; an allowlist would need updating every time a new canonical field is added. A denylist with explicit "these internal fields are never provider-bound" is more maintainable.

**Test obligation** (per E6 / 2C-8 §6): every adapter's `pushDraft` test must include an assertion that **none** of the denylist fields appears in the payload bytes sent to the (mocked) HTTP client. The shared assertion helper lives in `backend/__tests__/lib/finance/accountingAdapters/assertNoInternalMetadata.js` (Slice 2A delivers).

### 4.6 Sandbox / draft-only safety gates — TWO independent layers

Mirrors 2C-8 §3 exactly. Slice 2 implements **both** layers; **either alone** must block a live write.

**Layer 1 — CONFIGURATION:**

```
FINANCE_PROVIDER_WRITES_ENABLED=false  (dominant kill switch)
FINANCE_ADAPTER_MODE=draft_only        (caps the adapter at pushDraft)
```

Both staging defaults; both must be deliberately changed to permit any provider write. `FINANCE_ADAPTER_MODE=approval_required_write` is **never** set in staging config under Slice 2 (the future Slice that enables `pushFinal` will revisit this).

**Layer 2 — CODE:**

- `assertWritePermitted(job, approvalRecord)` per `adapter-runtime-contract.md` §4 — first call of every job execution. Throws `WriteGuardError` on any disallowed combination. For Slice 2, `approvalRecord` is always `null` (no `approval_required_write` mode used); the guard reduces to "is this operation allowed under `draft_only`?"
- **Provider-writes-enabled code gate** — second independent check before any HTTP call. `if (operation requires write && process.env.FINANCE_PROVIDER_WRITES_ENABLED !== 'true') { skip HTTP, record dry_run outcome }`. Cannot be bypassed by adapter code — the check lives in the processor, not in the adapter.

**Combined behavior table:**

| Operation     | `read_only` mode  | `draft_only` + `FINANCE_PROVIDER_WRITES_ENABLED=false`              | `draft_only` + `FINANCE_PROVIDER_WRITES_ENABLED=true` | `approval_required_write` (not used in Slice 2) |
| ------------- | ----------------- | ------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `pull`        | Allowed (HTTP)    | Allowed (HTTP — reads aren't gated by the kill switch)              | Allowed (HTTP)                                        | Allowed                                         |
| `sync_status` | Allowed (HTTP)    | Allowed (HTTP)                                                      | Allowed (HTTP)                                        | Allowed                                         |
| `reconcile`   | Allowed (HTTP)    | Allowed (HTTP)                                                      | Allowed (HTTP)                                        | Allowed                                         |
| `push_draft`  | `WriteGuardError` | Permitted by guard, **HTTP skipped** by code gate (dry-run outcome) | Allowed (HTTP, creates draft)                         | Allowed                                         |
| `void`        | `WriteGuardError` | `WriteGuardError` (void requires `approval_required_write`)         | `WriteGuardError`                                     | Allowed with approved approval                  |
| `push_final`  | `WriteGuardError` | `WriteGuardError`                                                   | `WriteGuardError`                                     | Allowed with approved approval                  |

**Note on reads vs writes for the kill switch:** read operations (`pull`, `sync_status`, `reconcile`) make HTTP calls to the provider but don't mutate provider state. The 2C-8 §5.2 framing is "no provider HTTP **write**"; reads against a sandbox are operationally fine. The code gate filters by operation type, not by HTTP-call-occurs.

### 4.7 Sync event emission contract — `finance.adapter.sync_queued` / `sync_succeeded` / `sync_failed`

**Producer:** Slice 2B's adapter job processor (`finance.adapter.sync_succeeded` / `sync_failed`) and Slice 2B's `approveFinanceAction()` promoter modification (`finance.adapter.sync_queued`, emitted at the `draft → queued` transition per §4.1). `simulateDealWon` (and any future adapter-job-creation path that targets approval-required journals) inserts the row in `status='draft'` and does NOT emit `sync_queued`; the event is exclusively the promoter's responsibility.

**Consumer:** the already-implemented `adapter_queue` projection at `backend/lib/finance/projections/adapterQueueProjection.js` (Phase 2B-10). The projection has been waiting for these events since 2B-10; Slice 2 is the producer that makes it operational.

**Envelope:** all three events use `aggregate_type = 'adapter_job'`, `aggregate_id = adapter_jobs.id` per `adapter-runtime-contract.md` §7. **NO `object_type` / `object_id` drift** — this is the explicit invariant from `adapter-runtime-contract.md` §10 decision-summary and the scaffold's Phase 2A freeze.

**Payload contracts** (frozen per `adapter-runtime-contract.md` §7):

- **`finance.adapter.sync_queued`** (emitted at the `draft → queued` transition — see §4.1 lifecycle correction; **NOT** emitted when the row is initially inserted in `draft` state):

  ```js
  payload: {
    job_id, provider, object_type, object_id, operation, mode, queued_at,
    adapter_job: { id, tenant_id, provider, aggregate_type, aggregate_id, operation, mode, status: 'queued', attempts: 0, ... }
  }
  ```

  The `adapter_job` snapshot embedded in the payload satisfies the projection's expectation per Phase 2B-10 §3 ("Every adapter event carries the full `payload.adapter_job` snapshot"). The `adapter_job.status` in the snapshot is `'queued'` (the post-transition state); `queued_at` is the timestamp of the `draft → queued` transition (i.e., the timestamp of the approval that promoted it).

  **Producer of `sync_queued`:** the `approveFinanceAction()` modification in Slice 2B (see §5.2) emits one `sync_queued` event per promoted adapter_job in the same call that marks the approval `approved`. `simulateDealWon` does NOT emit `sync_queued`; it only inserts the `draft` row with no event.

- **`finance.adapter.sync_succeeded`** (emitted at `running → succeeded`):

  ```js
  payload: {
    job_id, provider, object_type, object_id, operation, attempts, duration_ms,
    provider_id, canonical_snapshot,
    adapter_job: { ..., status: 'succeeded', updated_at: ... }
  }
  ```

  - `provider_id` is `null` on dry-run outcomes (`FINANCE_PROVIDER_WRITES_ENABLED=false`).
  - `duration_ms` covers the adapter call only, not the full processor cycle.

- **`finance.adapter.sync_failed`** (emitted at `running → failed`, both retryable and terminal):

  ```js
  payload: {
    job_id, provider, object_type, object_id, operation, attempts, max_attempts,
    permanent, error_message, error_code, next_attempt_at,
    adapter_job: { ..., status: 'failed', error_message, attempts, updated_at }
  }
  ```

  - `permanent: true` only when `attempts >= max_attempts` (terminal failure).
  - `next_attempt_at: null` when permanent.

**Idempotency:** the event store is append-always and does not dedupe (Postgres adapter rejects duplicate primary key but doesn't merge). The job processor must check job status before emission to avoid double-emitting `sync_succeeded` for a job that already reached terminal state (§4.2 step 7 covers this).

**Test obligation:** the existing `adapter_queue` projection tests at `backend/__tests__/lib/finance/projections/adapterQueueProjection.test.js` already cover the consumer side. Slice 2B and Slice 2D add producer-side tests that emit each of the three events from the actual job processor and verify the projection consumes them correctly end-to-end (the integration assertion).

### 4.8 Retry / dead-letter minimum posture for Slice 2

**Retry contract** (per `adapter-runtime-contract.md` §3 + 2C-10):

- `max_attempts = 5` (configurable via `FINANCE_ADAPTER_MAX_ATTEMPTS`).
- Exponential backoff: `delay = min(2^attempts × base_ms, cap_ms) + rand(0..5s_jitter_ms)`.
  - Default `base_ms = 15000`, `cap_ms = 1800000`, `jitter ±5000` ms (±5 s).
  - Schedule: ~15s / ~30s / ~1m / ~2m, then terminal at attempt 5.
- `next_attempt_at` is set on each `running → failed` transition (except terminal).

**Dead-letter posture for Slice 2** (minimum that satisfies 2C-10):

- **Terminal job stays in `status = 'failed'`** with `attempts = max_attempts` and `error_message` set to the last error.
- **`finance.adapter.sync_failed` event with `permanent: true`** is emitted (the append-only event makes the dead-letter fact replayable and unloseable).
- **`finance.approvals` row created** with `target_type = 'adapter_job'`, `target_id = adapter_jobs.id`, `status = 'pending'`, `risk_level = 'medium'` (or `'high'` for `push_final` / `void`), `requested_by = null` (system-generated). Operator review is required to re-queue / cancel / escalate.
- **The job is never re-queued automatically after this point.** Re-queueing requires a manual operator action (`UPDATE finance.adapter_jobs SET status = 'queued', attempts = 0` or a future cancel/retry HTTP endpoint).

**NOT in Slice 2 minimum posture** (explicitly deferred):

- HTTP endpoint to cancel / retry a dead-lettered job — operator action only via SQL until a later packet.
- Worker `/ready` endpoint exposing dead-letter count — projection worker has the same gap (Phase 3-11 §4 signal 6 is DEFERRED).
- Auto-escalation timer if the pending approval row sits unreviewed for N hours — future enhancement.

### 4.9 How the `adapter_queue` projection observes the emitted events

**Already implemented in Phase 2B-10.** `backend/lib/finance/projections/adapterQueueProjection.js` consumes `finance.adapter.sync_queued`, `finance.adapter.sync_succeeded`, `finance.adapter.sync_failed` and maintains a `{ queued, running, failed, completed }` view keyed by `adapter_job_id` per tenant.

**What Slice 2 must verify** (in Slice 2D integration tests):

1. After a `sync_queued` event is emitted by the `approveFinanceAction()` promoter (NOT by the job processor — see §4.1, §4.7), the projection's `queued` bucket contains the job within one runner dispatch cycle.
2. After a `sync_succeeded` event is emitted, the job moves from `queued` to `completed`.
3. After a `sync_failed` event (non-terminal), the job appears in `failed`.
4. After a `sync_failed` event (terminal with `permanent: true`), the job remains in `failed` and the corresponding `finance.approvals` row exists.
5. Replay of the tenant event stream rebuilds the same `adapter_queue` state — the producer side is replayable.
6. The event envelope uses `aggregate_type = 'adapter_job'` (NOT `object_type`). The projection's test at `backend/__tests__/lib/finance/projections/adapterQueueProjection.test.js` already asserts this; Slice 2's producer must match.

**No projection-side changes required for Slice 2.** The contract is already aligned; Slice 2 just provides the producer.

### 4.10 How Phase 3-9 and Phase 3-10 become executable after Slice 2

Today, Phase 3-9 ("Enable adapter worker in sandbox/draft-only mode") and Phase 3-10 ("Prove ERPNext sandbox adapter path with no live writes") cannot be honestly completed because the runtime they exercise doesn't exist. After Slice 2 lands:

- **Phase 3-9 becomes executable** because `staging-finance-adapter-worker` is a real Coolify-deployable worker app (Slice 2C delivered the process shell + entry block; Slice 2E delivered the staging YAML following the projection worker's `finance-workers.staging.example.yml` pattern from Phase 3-4).
- **Phase 3-10 becomes executable** because the ERPNext adapter implementation exists (Slice 2A), the job processor invokes it (Slice 2B), and the proof-procedure steps in 2C-9 §6 each have actual code to exercise.

**Slice 2E** delivers the matching staging runbooks (`docs/architecture/finance/staging-adapter-worker-activation-log.md` for 3-9 and `docs/architecture/finance/erpnext-staging-sandbox-proof-results.md` for 3-10) — analogous to Phase 3-5 (worker activation runbook) and Phase 3-6 (replay drill plan) for the projection worker. Both runbooks are dry-run-by-default and follow the same operator-instructions-only pattern from Phase 3-4 onwards.

The end-to-end flow after Slice 2 lands and Phase 3-9 + 3-10 execute:

```
Operator runs /simulate/deal-won (controlled tenant, via Phase 3-7 mounted route)
  → financeDomainService.simulateDealWon() creates adapter_job in-memory bucket
    → also INSERT into finance.adapter_jobs with status='draft' (Slice 2B-modified
      domain service via adapterJobEnqueuer helper — see §5.2)
      → NO finance.adapter.sync_queued event (the draft row is not yet runnable)
        → adapter_queue projection sees no event for this job yet
        → finance.approvals row created in status='pending' for the journal entry
          → approval_queue projection (Phase 3-5 projection worker) consumes → 'pending' bucket

Approver calls POST /api/v2/finance/approvals/:id/approve (or equivalent)
  → approveFinanceAction() marks approval row 'approved'
    → adapterJobPromoter (Slice 2B new helper) finds all adapter_jobs WHERE
      tenant_id=$1 AND aggregate_id=<approval target id> AND status='draft'
      → atomically UPDATE each row status='draft' → 'queued'
        → emit one finance.adapter.sync_queued event per promoted job
          → adapter_queue projection (Phase 3-5 projection worker) consumes → 'queued' bucket
  → journal entry stays at status='pending_approval' (Phase 3-8 §5.7 contract preserved;
    journal posting is NOT a Slice 2 deliverable)

Adapter worker (Phase 3-9 enabled) polls finance.adapter_jobs
  → claims the queued job via optimistic-lock UPDATE
    → assertWritePermitted (passes for push_draft + draft_only)
      → buildProviderPayload (strips internal metadata)
        → FINANCE_PROVIDER_WRITES_ENABLED check:
          - If false (default): skip HTTP, record dry_run, emit sync_succeeded with provider_id: null
          - If true (proof step only): call erpnextAdapter.pushDraft() against sandbox ERPNext
            → ERPNext creates a docstatus=0 draft document
              → adapter records provider_id, emits sync_succeeded with the draft id
                → adapter_queue projection moves job from 'queued' → 'completed'
```

**Phase 3-10 §6 step 6's "draft-write proof"** is the only step that flips `FINANCE_PROVIDER_WRITES_ENABLED=true` on the worker — and only temporarily, against sandbox ERPNext, reverted immediately after. Every other Slice 2 + Phase 3-9 + Phase 3-10 operation runs with `FINANCE_PROVIDER_WRITES_ENABLED=false` and exercises the full lifecycle as dry-run.

---

## 5. Parallel implementation packets (2A–2E)

Each packet is independently committable and reviewable. The packets have **defined dependencies** that constrain ordering; within each ordering tier, packets are parallel-safe.

### 5.1 Slice 2A — provider payload boundary + ERPNext sandbox adapter

**Files delivered:**

- `backend/lib/finance/accountingAdapters/providerPayloadBuilder.js` (the §4.5 builder)
- `backend/lib/finance/accountingAdapters/erpnextAdapter.js` (the §4.4 adapter)
- `backend/__tests__/lib/finance/accountingAdapters/providerPayloadBuilder.test.js`
- `backend/__tests__/lib/finance/accountingAdapters/erpnextAdapter.test.js` (against a mocked HTTP client — no real ERPNext)
- `backend/__tests__/lib/finance/accountingAdapters/assertNoInternalMetadata.js` (shared test helper)

**Test obligations:**

- Every denylist field from §4.5 verified absent from `buildProviderPayload()` output.
- Every `AccountingAdapter` required method implemented (signature + happy path).
- Sandbox `base_url` guard rejects non-sandbox URLs; accepts the patterns enumerated in §4.4.
- `pushDraft` sets `docstatus: 0` and does not call any submit endpoint.
- `toCanonical` / `fromCanonical` round-trips preserve mapped fields; `metadata.provider_extras` carries unmapped.
- Test runs against a mocked HTTP client; no network IO; no real credentials required.

**Dependencies:** none (can start first, in parallel with 2B and 2C).

**Out of scope for 2A:** the job processor (2B), the worker process (2C), staging activation (2E).

### 5.2 Slice 2B — adapter job processor + sync event emission + approval-driven `draft → queued` promoter

**Files delivered:**

- `backend/lib/finance/adapterJobProcessor.js` (the §4.2 `runAdapterPollCycle()`)
- `backend/lib/finance/adapterJobEnqueuer.js` (helper that **inserts a `finance.adapter_jobs` row with `status='draft'`** when called from `simulateDealWon`; does NOT emit `sync_queued` (the row is not yet runnable). Replaces the in-memory-only `adapterJob` creation in `simulateDealWon` while preserving the `draft` pre-approval state. Per §4.1 lifecycle correction.)
- `backend/lib/finance/adapterJobPromoter.js` (NEW helper — handles the `draft → queued` transition per §4.1. Signature: `promoteLinkedAdapterJobs({ pool, tenantId, aggregateId, eventStore, now })` — finds all adapter_jobs WHERE `tenant_id=$1 AND aggregate_id=$2 AND status='draft'`, atomically updates each to `status='queued'`, and emits `finance.adapter.sync_queued` for each.)
- Modifications to `financeDomainService.js` `simulateDealWon` to use the new enqueuer (when running with the persistent path; defaults to in-memory when not).
- **Modifications to `financeDomainService.js` `approveFinanceAction` to call `promoteLinkedAdapterJobs` after marking the approval `approved`** — resolves Q5 per §4.1. The promoter call uses the approval's `aggregate_id` (which is the journal entry id under the simulateDealWon flow) as the lookup key for adapter_jobs to promote. The Phase 3-8 §5.7 "approval doesn't auto-post the journal" contract is preserved — the journal stays at `pending_approval`; only the linked adapter_jobs transition.
- `backend/__tests__/lib/finance/adapterJobProcessor.test.js`
- `backend/__tests__/lib/finance/adapterJobEnqueuer.test.js`

**Test obligations:**

- `adapterJobEnqueuer` inserts `status='draft'` (not `'queued'`); does NOT emit `sync_queued`.
- `adapterJobPromoter` finds all `status='draft'` adapter_jobs linked by `aggregate_id` to a given approval; promotes each to `status='queued'` atomically; emits one `sync_queued` per promotion.
- `approveFinanceAction` calls `promoteLinkedAdapterJobs` after the approval mutation; the journal entry's `status` is **NOT** modified (Phase 3-8 §5.7 contract preserved); promoter emits one `sync_queued` per linked adapter_job that was promoted.
- `approveFinanceAction` for an approval whose target has no linked adapter_job (e.g., a future approval type) — the promoter is a no-op, no errors, no `sync_queued` emitted.
- Optimistic-lock claim semantics verified (concurrent processors don't double-claim).
- `assertWritePermitted` invoked first; `WriteGuardError` path tested.
- Provider-writes-enabled code gate: `FINANCE_PROVIDER_WRITES_ENABLED=false` → HTTP call skipped, `sync_succeeded` emitted with `provider_id: null`.
- Retry / backoff schedule matches the §4.8 contract.
- Stuck-job watchdog resets `running` rows older than threshold.
- Terminal failure emits `sync_failed` with `permanent: true` AND creates the `finance.approvals` row.
- Idempotent emission — re-running the cycle on a terminal job does not emit a duplicate `sync_succeeded` or `sync_failed`.
- All three events use `aggregate_type = 'adapter_job'`; no `object_type` / `object_id` drift.

**Dependencies:** uses the `AccountingAdapter` interface from `adapter-runtime-contract.md` §2 (already defined). Can start in parallel with 2A and 2C — the `approveFinanceAction` modification doesn't touch the adapter or the worker shell. Final integration test (2D) needs both 2A and 2B landed.

**Out of scope for 2B:** the worker process shell (2C), the ERPNext adapter (2A), staging activation (2E). Journal-posting (`pending_approval → posted`) remains out of scope — that's a separate later slice; Phase 3-8 §5.7 explicitly documents the gap.

### 5.3 Slice 2C — `finance-adapter-worker` process shell + config

**Files delivered:**

- `backend/workers/financeAdapterWorker.js` (the §4.3 worker, mirroring `financeProjectionWorker.js`)
- `backend/workers/financeWorkerCommon.js` (factored-out shared helpers — `parseControlledTenantIds`, heartbeat-file writer, three-tier-gate parser)
- `backend/package.json` — `"worker:finance-adapter": "node workers/financeAdapterWorker.js"` registered
- Refactor of `backend/workers/financeProjectionWorker.js` to import from `financeWorkerCommon.js` (no behavior change — pure extraction)
- `backend/__tests__/workers/financeAdapterWorker.test.js`
- `backend/__tests__/workers/financeWorkerCommon.test.js`

**Test obligations:**

- Three-tier gate semantics (strict-equality `'true'` per all three flags).
- `parseControlledTenantIds` empty-list / valid-list / typo-tolerant behavior.
- Disabled-state idle stub (logs `[finance-adapter-worker] disabled — idling` and returns).
- Enabled-state schedules poll cycles via `setTimeout`.
- Heartbeat file written on poll cycle complete.
- SIGINT / SIGTERM handlers stop the loop cleanly.
- Entry block exits with non-zero if `FINANCE_DB_URL` / `DATABASE_URL` absent (matching the Phase 3-4 §5.1 finding for the projection worker).

**Dependencies:** uses the job processor from 2B (`runAdapterPollCycle`). The refactor of `financeProjectionWorker.js` to use `financeWorkerCommon.js` is mechanical and should be reviewed carefully (regression risk).

**Out of scope for 2C:** the ERPNext adapter (2A), the actual job processor logic (2B), staging activation (2E).

### 5.4 Slice 2D — `adapter_queue` projection integration proof + tests

**Files delivered:**

- `backend/__tests__/lib/finance/projections/adapterQueueProjection.integration.test.js` (new — end-to-end producer + consumer test)
- Possibly an addition to `backend/lib/finance/projections/replayValidationHarness.js` (Phase 2B-12) to add an adapter-queue replay parity check using the real producer

**Test obligations:**

- A `simulateDealWon` call through the modified domain service (2B) inserts a `finance.adapter_jobs` row in `status='draft'` and emits NO `sync_queued` event; the `adapter_queue` projection has no observable change for this job yet (per the §4.1 lifecycle correction).
- An `approveFinanceAction()` call against the approval linked to that `simulateDealWon` (2B) promotes the draft row `draft → queued` and emits one `finance.adapter.sync_queued` event; the `adapter_queue` projection (already-implemented consumer) then surfaces the job in its `queued` bucket within one runner dispatch cycle.
- An adapter job processor run (2B) that succeeds produces a `sync_succeeded` event; projection moves the job from `queued` → `completed`.
- A failed job (2B) produces a `sync_failed` event; projection moves to `failed`.
- Terminal failure also creates the `finance.approvals` row visible via the existing `approval_queue` projection.
- Replay of the full tenant event stream rebuilds both `adapter_queue` and `approval_queue` byte-identically — including the absence of any `sync_queued` event for adapter_jobs that were created but never approved (the `draft` row exists in the table but contributes no event to replay).
- All events use `aggregate_type = 'adapter_job'` per the frozen Track A vocabulary.

**Dependencies:** needs both 2A and 2B landed. Can run in parallel with 2C and 2E once those land.

**Out of scope for 2D:** any change to the consumer-side projection (already correct per 2B-10), any change to the projection runner.

### 5.5 Slice 2E — Phase 3-9 + Phase 3-10 staging runbooks

**Files delivered:**

- `docs/architecture/finance/staging-adapter-worker-activation-log.md` (Phase 3-9 staging activation runbook — analogous to Phase 3-5's projection-worker activation runbook)
- `docs/architecture/finance/erpnext-staging-sandbox-proof-results.md` (Phase 3-10 ERPNext proof execution runbook — analogous to Phase 3-6's replay drill plan)
- Updates to `deploy/coolify/finance-workers.staging.example.yml` to add the `finance-adapter-worker` service definition (currently only the projection worker is in the staging YAML per Phase 3-4)

**Test obligations:**

- N/A — these are runbooks (the same dry-run pattern as Phase 3-5 / 3-6 / 3-7 / 3-8 / 3-11 docs).
- Documentation only; no code or test changes.

**Dependencies:** needs 2A + 2B + 2C landed so the runbooks reference real code paths and real npm scripts.

**Out of scope for 2E:** any actual staging activation, any Coolify mutation, any operator execution. The runbooks are dry-run-by-default per the established Phase 3-x convention.

---

## 6. Cross-packet ordering and dependency graph

```
       ┌────────────────────────────────────────────────────┐
       │                       2-0                           │
       │              Design freeze (this doc)                │
       └────────────────────────────────────────────────────┘
                │
        ┌───────┼──────────────┐
        │       │              │
        ▼       ▼              ▼
   ┌────────┐ ┌────────┐  ┌────────┐
   │  2A    │ │  2B    │  │  2C    │   ← can all start in parallel
   │ adapter│ │ proc + │  │ worker │     (after 2-0 lands)
   │ + boun-│ │ emit   │  │ shell  │
   │ dary   │ │        │  │ + cfg  │
   └────────┘ └────────┘  └────────┘
        │       │              │
        └───┬───┘              │
            │                  │
            ▼                  │
       ┌────────┐               │
       │  2D    │               │
       │ proj.  │               │
       │ inte-  │               │
       │ gration│               │
       └────────┘               │
            │                   │
            └──────────┬────────┘
                       │
                       ▼
                  ┌────────┐
                  │  2E    │
                  │ runbk  │
                  │ 3-9    │
                  │ + 3-10 │
                  └────────┘
```

**Parallel-safe pairs:**

- 2A + 2B + 2C — can be coded simultaneously by different agents/sessions. Their contracts (`AccountingAdapter` interface, `runAdapterPollCycle` signature, worker entry-block pattern) are frozen in this doc.
- 2D waits for both 2A and 2B (it tests them together).
- 2E waits for 2A + 2B + 2C (the runbooks reference real npm scripts and real worker behavior).

**Cross-packet contract risks** (worth flagging for parallel coders):

1. **2A vs 2B on the adapter-call signature.** Both packets reference `adapter.pushDraft(canonicalObject, objectType)`. The exact shape of `canonicalObject` passed in is the canonical object AFTER `fromCanonical` + `buildProviderPayload`. Document this carefully in 2A's JSDoc.
2. **2B vs 2D on event payload shape.** §4.7 freezes the payload contracts; deviations from this in 2B will break 2D's integration tests against the already-implemented projection (per 2B-10 §3 "Every adapter event carries the full `payload.adapter_job` snapshot").
3. **2C vs 2A on credential loading.** The worker loads `tenant_integrations.api_credentials` and hands it to the adapter constructor. The exact loader interface should be agreed: 2C defines `loadProviderConfig(pool, tenantId, provider)`, returning the `ProviderConnectionConfig` shape per `adapter-runtime-contract.md` §6; 2A's adapter constructor accepts that shape.

---

## 7. Hard constraints (explicit restatement)

| Constraint                                                                                                                                                                                                                                                                                                                 | Source          | Status this task                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| **No live provider writes by Slice 2.** `FINANCE_PROVIDER_WRITES_ENABLED=false` is the default everywhere; the code gate skips HTTP on write operations when false. The one exception is the 2C-9 §5.3 proof step (sandbox ERPNext only, one-time, reverted).                                                              | 2C-8 §4         | Confirmed — design freeze + acceptance test obligation in §4.6.                       |
| **ERPNext sandbox / local only.** The adapter's `base_url` guard rejects non-sandbox URLs per §4.4.                                                                                                                                                                                                                        | 2C-9 §5.1       | Confirmed.                                                                            |
| **No production credentials.** Only sandbox ERPNext API key + secret stored in `tenant_integrations.api_credentials` for the controlled staging tenant. Plain JSONB acceptable per E4.                                                                                                                                     | E4 / 2C-9       | Confirmed.                                                                            |
| **No QuickBooks / Xero live integration.** Neither adapter is implemented in Slice 2; both remain canonical-schema references. No OAuth flow configured.                                                                                                                                                                   | E5              | Confirmed.                                                                            |
| **No route persistent-events activation.** `ENABLE_FINANCE_PERSISTENT_EVENTS` stays unset on the backend. Slice 1 fail-closed guard at `backend/routes/finance.v2.js:48` stays structurally enforced. Slice 2 builds the adapter runtime; the route-persistent-events lift is a separate later Slice.                      | Phase 3-1 §7    | Confirmed.                                                                            |
| **No migration application.** A credential-encryption migration may be designed but not applied; the ERPNext POC uses plain JSONB.                                                                                                                                                                                         | 3-2 scope       | Confirmed.                                                                            |
| **No staging / Coolify / Doppler mutation by Slice 2 itself.** Each sub-packet (2A–2D) lands code locally; 2E delivers runbooks. Staging activation is Phase 3-9 / 3-10 territory — separate operator actions gated on this design freeze.                                                                                 | Slice 2-0 scope | Confirmed.                                                                            |
| **No production action.** Hetzner is not touched; `prd_prd` Doppler is not opened; no production tenant `tenant_integrations` is modified.                                                                                                                                                                                 | Phase 3-1 §8    | Confirmed.                                                                            |
| **Preserve `aggregate_type` / `aggregate_id` vocabulary.** All adapter events use `aggregate_type = 'adapter_job'`. NO `object_type` / `object_id` drift. §4.7 + §4.9 + Slice 2D tests enforce this.                                                                                                                       | Track A freeze  | Confirmed.                                                                            |
| **Preserve `finance.*` canonical event names.** `finance.adapter.sync_queued`, `finance.adapter.sync_succeeded`, `finance.adapter.sync_failed` per the canonical taxonomy in the scaffold. No new event names introduced by Slice 2.                                                                                       | Track A freeze  | Confirmed.                                                                            |
| **Provider payloads must strip internal AiSHA runtime metadata.** §4.5 enumerates the denylist; Slice 2A test obligation enforces the assertion against every `pushDraft` payload.                                                                                                                                         | E6 / 2C-8 §6    | Confirmed — `buildProviderPayload` boundary + `assertNoInternalMetadata` test helper. |
| **Two enforcement layers for the no-live-write guarantee.** Config layer (`FINANCE_PROVIDER_WRITES_ENABLED=false` + `FINANCE_ADAPTER_MODE=draft_only`) AND code layer (`assertWritePermitted` + the provider-writes-enabled code gate). Either alone blocks a live write; both must be deliberately changed to permit one. | 2C-8 §3         | Confirmed — §4.6 design.                                                              |

---

## 8. Acceptance for Slice 2-0 (this task)

This document is the Slice 2-0 deliverable when paired with the matching CHANGELOG entry and the scaffold update. Acceptance for the **design freeze** (this task):

- [x] `finance.adapter_jobs` lifecycle and claim/lock semantics frozen (§4.1)
- [x] Adapter job processor contract frozen (§4.2 — `runAdapterPollCycle` signature + per-job processing sequence)
- [x] `finance-adapter-worker` process boundaries and env gates frozen (§4.3 — mirrors projection worker; three-tier gate, controlled-tenant allow-list, heartbeat file)
- [x] ERPNext sandbox adapter boundary frozen (§4.4 — interface methods, sandbox `base_url` guard, API-key auth, `docstatus: 0` constraint)
- [x] Provider payload builder + metadata stripping rules frozen (§4.5 — denylist with explicit shared test-helper obligation)
- [x] Sandbox / draft-only safety gates frozen (§4.6 — two independent layers, behavior table)
- [x] Sync event emission contract frozen (§4.7 — three event types, envelope, payload shapes, `aggregate_type` invariant, idempotency)
- [x] Retry / dead-letter minimum posture frozen (§4.8 — backoff schedule, terminal failure → approval row, deferrals named)
- [x] How `adapter_queue` projection observes the events documented (§4.9 — already-implemented consumer, Slice 2D integration test obligation)
- [x] How Phase 3-9 and Phase 3-10 become executable after Slice 2 documented (§4.10 — end-to-end flow)
- [x] Implementation split into 5 parallel-safe packets (§5 — 2A / 2B / 2C / 2D / 2E with file deliverables and test obligations per packet)
- [x] Cross-packet ordering and dependency graph documented (§6 — parallel-safe pairs + cross-packet contract risks)
- [x] All 12 hard constraints restated with status confirmed (§7)
- [x] No code, no migration, no env var change, no staging activation by Slice 2-0 itself (§2 explicit "None" for every modality)
- [x] CHANGELOG entry recording Slice 2-0 (separate change)
- [x] Scaffold updated with commit hash and next active item

Acceptance for **Slice 2 implementation** (a future, separately reviewed sequence): each 2A–2E packet lands as its own commit + Codex review; each packet's test obligations from §5 are satisfied; the design contracts from §4 are honored exactly. Slice 2 is **complete** only when Phase 3-9 + Phase 3-10 execution runbooks (2E) are landed and a Codex review of the full slice passes.

---

## 9. Open questions for Dre

These are items where the design needs your call before Slice 2 implementation begins. None blocks Slice 2-0 commit; all should be resolved before the matching sub-packet starts.

| #   | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Affects packet     | Default if no answer                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Should `simulateDealWon` write to BOTH the in-memory bucket AND `finance.adapter_jobs` (dual-write) under Slice 2, or should it stop writing to the in-memory bucket once Slice 2 lands? (The Slice 1 split-brain-prevention contract makes this tricky — the persistent-events route guard remains fail-closed, so the route uses in-memory reads.)                                                                                                                                                                                                                                                                                                                                                                                                                                      | 2B                 | Dual-write — keep in-memory as-is for backward compatibility; ALSO INSERT into `finance.adapter_jobs` so the worker has something to drain. |
| 2   | Should Slice 2 add a `finance-adapter-worker` to the **same** Coolify worker app as the projection worker (one container running both), or **separate** Coolify apps?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 2C / 2E            | Separate Coolify apps — matches Phase 2C-5 worker-service-topology decision; clearer rollback scope; lower blast-radius per failure.        |
| 3   | The sandbox `base_url` guard's allowlist patterns (§4.4) — are the listed patterns (`localhost`, `*.local`, `sandbox.*`, `FINANCE_ERPNEXT_SANDBOX_BASE_URLS`) sufficient for your sandbox setup, or do you have a specific staging ERPNext URL pattern in mind?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 2A                 | Use the listed patterns; require operator to add their specific sandbox FQDN to `FINANCE_ERPNEXT_SANDBOX_BASE_URLS` before 3-10.            |
| 4   | The `financeWorkerCommon.js` refactor in 2C extracts shared helpers from the projection worker. Is the regression risk acceptable, or should the refactor be a separate prior commit with its own Codex review before Slice 2C uses it?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 2C                 | Separate prior commit with its own review — the refactor risk is real (projection worker is enabled today via Phase 3-5); split safely.     |
| 5   | **RESOLVED YES — per §4.1 lifecycle correction (Codex P1 re-review).** Should `approveFinanceAction()` be modified in Slice 2 to transition linked adapter_jobs `draft → queued` and emit `sync_queued`? **Yes — not deferrable.** Without this transition, no adapter_job ever leaves `draft`, the worker has nothing to claim, and Slice 2's end-to-end flow doesn't complete. Slice 2B includes the `approveFinanceAction()` modification per §5.2. **Important scope note**: this resolution covers ONLY the adapter-job `draft → queued` promotion — it does NOT include transitioning the journal entry from `pending_approval → posted`. The Phase 3-8 §5.7 "approval doesn't auto-post the journal" contract is explicitly preserved. Journal posting is a separate future slice. | 2B (modify domain) | RESOLVED — Slice 2B includes the modification. The adapter-job promotion happens; the journal posting does not.                             |

---

## 10. Evidence pack (populated on Slice 2 completion)

When each sub-packet lands, record the commit hash and test result. The slice is complete when all rows are populated.

| Packet | Commit hash | Tests pass | Codex review | Notes                                       |
| ------ | ----------- | ---------- | ------------ | ------------------------------------------- |
| 2A     |             |            |              | provider payload boundary + ERPNext adapter |
| 2B     |             |            |              | job processor + sync event emission         |
| 2C     |             |            |              | adapter worker process shell + cfg          |
| 2D     |             |            |              | adapter_queue projection integration proof  |
| 2E     |             |            |              | Phase 3-9 + 3-10 staging runbooks           |

Once Slice 2 is complete, Phase 3-9 and Phase 3-10 can be authorized by Dre as separate operator-execution packets. Per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md), neither activates production; both remain staging-only, sandbox-only, draft-only.
