# Finance Ops — Phase 3-10: ERPNext Sandbox Adapter Proof Execution Runbook (Dry Run)

**Phase 3-10 — Controlled Staging Activation, prove the ERPNext sandbox adapter path against a real sandbox endpoint with no live writes outside the deliberate sandbox `pushDraft` proof step.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Runbook / dry-run plan. **No ERPNext proof was executed by this task.** No `checkHealth()` call, no `listObjects()` call, no `pushDraft()` call against any ERPNext instance, no `FINANCE_PROVIDER_WRITES_ENABLED` flip in staging, no Coolify / Doppler mutation, no `tenant_integrations` row insertion. This document is the exact operator runbook a deploy owner would use; it does not execute the runbook.
**Date:** 2026-05-25
**Related:**
[`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) (3-1, baseline `3c60d9ff`) ·
[`erpnext-sandbox-proof.md`](./erpnext-sandbox-proof.md) (2C-9, the proof-gate definition this runbook implements) ·
[`staging-adapter-worker-activation-log.md`](./staging-adapter-worker-activation-log.md) (3-9, the worker activation runbook this proof builds on — 3-10 cannot run until 3-9 has executed and produced a healthy enabled adapter worker) ·
[`slice-2-adapter-runtime-design.md`](./slice-2-adapter-runtime-design.md) (Slice 2-0, the design freeze whose §4.6 two-layer safety contract is what makes the §6 step 6 "controlled flip" of `FINANCE_PROVIDER_WRITES_ENABLED` safe) ·
[`adapter-runtime-contract.md`](./adapter-runtime-contract.md) (Track E — `AccountingAdapter` interface §2, canonical object model §5, `ProviderConnectionConfig` §6, decisions E4/E5/E6) ·
[`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) (2C-8, original sandbox posture) ·
[`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) (2C-13, the controlled-tenant procedure 3-10 runs against) ·
[`staging-replay-drill-results.md`](./staging-replay-drill-results.md) (3-6, the structural twin for an execution-style runbook — 3-10 follows the same dry-run-plan-with-evidence-table pattern) ·
[`staging-smoke-test-results.md`](./staging-smoke-test-results.md) (3-8, smoke-test runbook against the route — 3-10 is the analogous proof against the adapter worker) ·
[`backend/__tests__/lib/finance/projections/adapterQueueProjection.integration.test.js`](../../../backend/__tests__/lib/finance/projections/adapterQueueProjection.integration.test.js) (Slice 2D, the local proof with mocked HTTP — 3-10 is the staging-against-real-sandbox version)

---

## 1. Purpose and scope

Phase 3-10 is the **end-to-end demonstration** of the Slice 2 adapter runtime against a real ERPNext sandbox endpoint, for the single controlled staging tenant. It is the staging cousin of the Slice 2D `adapterQueueProjection.integration.test.js` integration proof — same lifecycle, but the in-memory event store + mocked HTTP client are replaced with the real staging Postgres `finance.audit_events` + a real `httpClient.post()` call against the sandbox ERPNext instance.

**Lifecycle proved end-to-end** (the exact chain Slice 2D proves locally, now executed against real infrastructure):

```
backend route POST /api/v2/finance/simulate/deal-won (Phase 3-7 enabled route)
  → finance.audit_events.insert(finance.draft.created)
  → finance.audit_events.insert(finance.approval.requested)
  → finance.adapter_jobs.insert(status='draft')
  → NO finance.adapter.sync_queued event yet (draft-before-approval semantics)

backend route POST /api/v2/finance/approvals/:id/approve
  → approveFinanceAction()
  → finance.audit_events.insert(finance.approval.approved)
  → promoteLinkedAdapterJobs() → finance.adapter_jobs.update(status='draft' → 'queued')
  → finance.audit_events.insert(finance.adapter.sync_queued)  ← promoter-only

projection worker (Phase 3-5 enabled) dispatches sync_queued
  → adapter_queue projection: row in 'queued' bucket

adapter worker (Phase 3-9 enabled) polls finance.adapter_jobs
  → runAdapterPollCycle claims the queued row → status='running'
  → assertWritePermitted(push_draft, draft_only) → permitted
  → buildProviderPayload(canonical, runtimePolicy) → strips internal metadata
  → providerWritesEnabled check (the §4.6 code gate)
      → in 3-10 §6 step 6 ONLY: writes enabled → adapter.pushDraft() → httpClient.post(sandbox ERPNext)
      → otherwise: dry_run: true succeeded, no HTTP call
  → finance.audit_events.insert(finance.adapter.sync_succeeded or sync_failed)  ← processor-only

projection worker dispatches sync_succeeded / sync_failed
  → adapter_queue projection: row moves from 'queued' → 'completed' or 'failed'
```

3-10 is the **first** point in the Phase 3 arc where any real HTTP call to an ERPNext server is made. Every prior Phase 3 packet (and Slice 2 itself) operated against either mocked HTTP (Slice 2D) or zero ERPNext activity (everything else). Phase 3-10 §6 step 6 is therefore the most sensitive moment in the Phase 3 + Slice 2 arc, and the runbook makes that one window explicit with a dedicated before/during/after rollback envelope.

**Why 3-10 cannot collapse into 3-9.** Phase 3-9 stops at "the adapter worker is alive, enabled, idle, and ready." 3-10 requires:

- Phase 3-7 to have landed (the backend route mounted) so `simulateDealWon` and `approveFinanceAction` can actually run via HTTP.
- A separate later Slice (the "lift `ENABLE_FINANCE_PERSISTENT_EVENTS`" slice) to have landed so the backend route's domain service actually persists events to `finance.audit_events` instead of using its in-memory store — otherwise the events the worker is supposed to consume never reach Postgres in the first place.
- A `tenant_integrations` row with sandbox ERPNext credentials for the controlled tenant (2C-9 §6 step 2) — for completeness; the Slice 2C worker reads credentials from process env, but 2C-9 §6 calls out the `tenant_integrations` row as the canonical credential location for the future per-tenant credential router.
- The Phase 3-10 sandbox ERPNext instance to be reachable from VPS-1 and have a sandbox user with `Account` and `Journal Entry` write capability.

**This document and the matching procedure are runbook only.** No proof was executed by this task. Executing the runbook is a separately authorized operator action covered by §6.

---

## 2. Live-execution posture

**Default for this task: no proof was executed.**

| What                                                                                                                                                                        | Status this task                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ERPNext sandbox instance contacted (HTTP request of any kind, including `GET /api/method/ping`)                                                                             | None.                                                     |
| ERPNext document created (`Account`, `Journal Entry`, anything else)                                                                                                        | None.                                                     |
| `FINANCE_PROVIDER_WRITES_ENABLED=true` set on the staging adapter worker (the one §6 step 6 controlled-flip moment)                                                         | None. Stays `false` for the entire duration of this task. |
| `tenant_integrations` row insertion/update with `integration_type='finance.erpnext'`                                                                                        | None — 2C-9 §6 step 2 is the canonical insertion moment.  |
| Doppler `stg_stg` env var changed (`FINANCE_PROVIDER_WRITES_ENABLED`, any other)                                                                                            | None.                                                     |
| Coolify worker redeploy of `staging-finance-adapter-worker`                                                                                                                 | None.                                                     |
| Backend route HTTP call (`POST /api/v2/finance/simulate/deal-won`, `POST /api/v2/finance/approvals/:id/approve`, etc.)                                                      | None.                                                     |
| SSH session to VPS-1 (`andreibyf@147.189.173.237`)                                                                                                                          | None.                                                     |
| Staging Supabase migration applied                                                                                                                                          | None.                                                     |
| Production environment touched in any way (Hetzner, `prd_prd` Doppler, production tenants, production ERPNext, production QuickBooks, production Xero, production NetSuite) | None.                                                     |
| Provider HTTP write against anything that isn't the explicitly authorized sandbox endpoint                                                                                  | None.                                                     |
| Payment movement of any kind                                                                                                                                                | None.                                                     |

A live execution requires the deploy owner's explicit authorization. When authorized, the procedure in §6 is run **in the order listed**, the `FINANCE_PROVIDER_WRITES_ENABLED=true` window in §6 step 6 is bounded to the minimum time required for the proof, and outputs are captured per §13.

---

## 3. Prerequisites — what must be true before 3-10 runs

Each prerequisite is a previous Phase 3 packet's deliverable, a Slice 2 implementation packet, or an operator action; this list is a single place an operator can scan before running §6.

- [ ] **Phase 3-1 baseline.** Branch `feat/finance-ops-runtime` at a descendant of `3c60d9ff` per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §2.1.
- [ ] **Phase 3-2 migrations applied to staging.** 172 / 173 / 174 / 175 per [`staging-migration-application-log.md`](./staging-migration-application-log.md). Phase 3-10 needs `finance.adapter_jobs` (172), `finance.audit_events` (172 + 173 immutability triggers), and the RLS policies (175) all in place.
- [ ] **Phase 3-3 RLS verification PASS.** Per [`staging-rls-verification-results.md`](./staging-rls-verification-results.md).
- [ ] **Phase 3-4 disabled-by-default worker apps deployed.** Both `staging-finance-projection-worker` and `staging-finance-adapter-worker` Coolify apps exist on VPS-1 in their disabled-and-idling baseline state. Per [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md).
- [ ] **Phase 3-5 projection worker activated and healthy.** `staging-finance-projection-worker` reports `running, healthy` with `tenant_count: 1` for the controlled tenant. Per [`staging-worker-activation-log.md`](./staging-worker-activation-log.md). The projection worker is what consumes the `finance.adapter.sync_*` events the adapter worker emits and updates the `adapter_queue` projection — without it, §6 step 7's projection observation cannot pass.
- [ ] **Phase 3-7 backend route activated.** `ENABLE_FINANCE_OPS=true` on `staging-backend-heavy`; per-tenant `financeOps` module flag flipped for `a11dfb63-4b18-4eb8-872e-747af2e37c46`. The route at `/api/v2/finance/*` must be mounted and reachable. Per [`staging-route-activation-log.md`](./staging-route-activation-log.md).
- [ ] **Phase 3-8 route smoke tests PASS.** Per [`staging-smoke-test-results.md`](./staging-smoke-test-results.md). At minimum §5.6 (`POST /simulate/deal-won → 201`) and §5.7 (`POST /approvals/:id/approve → 200`) must pass, since 3-10 §6 steps 4 + 5 chain those same two route calls.
- [ ] **Phase 3-9 adapter worker activated and healthy.** `staging-finance-adapter-worker` reports `running, healthy` with `tenant_count: 1`, `adapter_count: 1` (ERPNext registered). Per [`staging-adapter-worker-activation-log.md`](./staging-adapter-worker-activation-log.md). The adapter worker poll loop must be the one that processes the queued adapter_job 3-10 creates.
- [ ] **Persistent-events route lift landed.** A separate later Slice (not Slice 2) must have lifted the `backend/routes/finance.v2.js:48` fail-closed guard on `ENABLE_FINANCE_PERSISTENT_EVENTS=true`, and `ENABLE_FINANCE_PERSISTENT_EVENTS=true` must be set on `staging-backend-heavy`, AND the backend's `financeDomainService` factory must wire `createFinancePgEventStore({ pool })` instead of the in-memory store. Without this lift, the backend route's `simulateDealWon` and `approveFinanceAction` calls succeed but write events to the in-memory store inside that one backend process — they never reach Postgres `finance.audit_events`, the adapter worker (which reads Postgres directly) sees an empty stream, and §6 step 5's worker observation fails with `claimed_count: 0`. **If this lift has not happened, halt 3-10 entirely.** This is the largest gap between Slice 2 (which builds the adapter runtime + Phase 3-9 worker activation) and Phase 3-10's executable proof.
- [ ] **Slice 2 commits all landed.** `27ae09fc` (Slice 2A), `e66538f0` (Slice 2B promoter+processor), `d671d816` (Slice 2B P1 payload+adapter registration), `1d2b41e6` (Slice 2 review P1 follow-up), `95f65144` (Slice 2C worker shell), `af8f71bc` (Slice 2D integration proof + projectionRunner option-2 fix), plus the Slice 2E runbooks (this doc + [`staging-adapter-worker-activation-log.md`](./staging-adapter-worker-activation-log.md)).
- [ ] **ERPNext sandbox instance available.** A self-hosted or cloud sandbox ERPNext instance is running, reachable from VPS-1, configured with at least the standard "Standard" Chart of Accounts. The instance is sandbox / local — not a production ERPNext tenant. Its base URL matches one of the built-in sandbox patterns (`localhost` / `127.0.0.1` / `*.local` / `*.lan` / `*.internal` / `sandbox.*` / `-sandbox.*` per `erpnextSandboxAdapter.js:89-98`) OR is enumerated in `FINANCE_ERPNEXT_SANDBOX_BASE_URLS`.
- [ ] **Sandbox ERPNext API key + secret generated.** A sandbox ERPNext user has an API key and secret pair with `Account` (read), `Journal Entry` (read + create), and `Item` (read) capabilities. Stored in Doppler `stg_stg` (encrypted at rest); never committed to git, never referenced from `prd_prd`.
- [ ] **No production action.** `prd_prd` Doppler config is not opened; Hetzner is not touched; no production tenant is queried; no production ERPNext / QuickBooks / Xero / NetSuite instance is contacted.

If any prerequisite fails, **halt** 3-10 and remediate before continuing. The dependency on the persistent-events route lift is particularly easy to miss because Slice 2's own deliverables don't include it — the lift is a separate slice gated on its own design + review.

---

## 4. Execution envelope — what changes vs what does not

3-10 is broader than 3-9 because it executes real route calls + real adapter HTTP I/O. But the env-var changes are tightly bounded: only `FINANCE_PROVIDER_WRITES_ENABLED` is touched, and only for the §6 step 6 window.

| What changes during 3-10                                                                                                             | When                                                                                                                                                                                                           | Rollback                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tenant_integrations` row insertion for the controlled tenant with sandbox ERPNext credentials                                       | §6 step 2 (one-time during 3-10; the row stays for any future 3-10 re-runs)                                                                                                                                    | `UPDATE tenant_integrations SET is_active=false WHERE …` per §9.4                                                                |
| One HTTP call from operator's workstation to staging backend route: `POST /api/v2/finance/simulate/deal-won`                         | §6 step 4 (writes one `finance.audit_events` row + one `finance.adapter_jobs` row in `status='draft'`)                                                                                                         | The row is part of the proof — kept as evidence; not rolled back                                                                 |
| One HTTP call from operator's workstation to staging backend route: `POST /api/v2/finance/approvals/:id/approve`                     | §6 step 5 (writes one `finance.audit_events` row for `finance.approval.approved` + one for `finance.adapter.sync_queued` via the promoter; mutates the `finance.adapter_jobs` row `status='draft' → 'queued'`) | Same — kept as evidence                                                                                                          |
| `FINANCE_PROVIDER_WRITES_ENABLED=true` set on `staging-finance-adapter-worker` (Doppler `stg_stg`)                                   | §6 step 6, immediately before the operator waits one adapter-worker poll cycle for the queued job to be claimed and processed                                                                                  | §6 step 6 final action: revert to `false` and redeploy. **Mandatory.**                                                           |
| One HTTP call from `staging-finance-adapter-worker` to the sandbox ERPNext: `POST /api/resource/Journal%20Entry` with `docstatus: 0` | §6 step 6 during the brief window writes are enabled                                                                                                                                                           | The ERPNext document is the proof — kept; can be deleted manually via the ERPNext admin console post-evidence-capture if desired |
| Coolify redeploy of `staging-finance-adapter-worker` (twice: once for §6 step 6 enable, once for §6 step 6 revert)                   | §6 step 6                                                                                                                                                                                                      | Both redeploys are part of the procedure                                                                                         |

**What does NOT change during 3-10:**

| What                                                                                                    | 3-10 posture                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FINANCE_ADAPTER_MODE`                                                                                  | **Unchanged.** Stays `draft_only` for the entire 3-10 procedure including step 6. `assertWritePermitted` permits `push_draft` under `draft_only`; finalising ops stay blocked. The ERPNext sandbox adapter throws `AdapterCapabilityError` for `pushFinal` / `voidRecord` regardless of any other config.             |
| `ENABLE_FINANCE_OPS` / `ENABLE_FINANCE_WORKERS` / `ENABLE_FINANCE_ADAPTER_WORKER` on the adapter worker | **Unchanged.** All three stay `true` (Phase 3-9 set them); 3-10 does not touch the gate.                                                                                                                                                                                                                              |
| `ENABLE_FINANCE_OPS` on `staging-backend-heavy`                                                         | **Unchanged.** Stays `true` (Phase 3-7 set it). 3-10 does not flip it.                                                                                                                                                                                                                                                |
| `financeOps` module flag for the controlled tenant                                                      | **Unchanged.** Stays enabled (Phase 3-7 set it).                                                                                                                                                                                                                                                                      |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` on `staging-backend-heavy`                                           | **Unchanged from its 3-10-prerequisite state.** The separate later Slice that lifted the route fail-closed guard must have set this to `true` before 3-10 runs; 3-10 itself does not flip it.                                                                                                                         |
| `FINANCE_ERPNEXT_BASE_URL` / `_API_KEY` / `_API_SECRET` / `_SANDBOX_BASE_URLS` on the adapter worker    | **Unchanged.** All four were set by Phase 3-9; 3-10 does not modify them.                                                                                                                                                                                                                                             |
| `FINANCE_CONTROLLED_TENANT_IDS` on either worker                                                        | **Unchanged.** Both apps still scope to `a11dfb63-4b18-4eb8-872e-747af2e37c46`.                                                                                                                                                                                                                                       |
| QuickBooks / Xero / NetSuite credentials, OAuth flows, adapters                                         | **Unchanged.** None of these are implemented, registered, or contacted at any point.                                                                                                                                                                                                                                  |
| Staging migrations                                                                                      | **Unchanged.** No migration applied by 3-10.                                                                                                                                                                                                                                                                          |
| Production env (Hetzner, `prd_prd` Doppler, production tenants, production providers)                   | **Unchanged.** Never in any Phase 3 packet's scope.                                                                                                                                                                                                                                                                   |
| Journal entry status on the journal created during 3-10                                                 | **Unchanged after the proof.** Stays at `pending_approval` throughout — the Phase 3-8 §5.7 contract is preserved (the route's `approveFinanceAction` does NOT auto-post the journal; only the adapter_job promotes `draft → queued`). 3-10 proves the adapter lifecycle; journal posting is a separate later concern. |

---

## 5. The proof gate — what must be demonstrated

These are the assertions Phase 3-10 must satisfy. Each maps to a 2C-9 §5 sub-gate; together they define "the ERPNext sandbox path is proven end-to-end on staging."

### 5.1 Sandbox connection only (per 2C-9 §5.1)

The adapter constructor at `erpnextSandboxAdapter.js:89-128` accepts `FINANCE_ERPNEXT_BASE_URL` against the built-in sandbox patterns + `FINANCE_ERPNEXT_SANDBOX_BASE_URLS` allowlist. A non-sandbox URL is rejected at adapter registration (Phase 3-9 §6.1 step 3 captures this in the worker logs). 3-10 proves this transitively — if registration succeeded in 3-9, the URL passed the guard.

### 5.2 The adapter satisfies the `AccountingAdapter` interface (per 2C-9 §5.2)

Verified at unit-test level by Slice 2A's `erpnextSandboxAdapter.test.js` (26 tests, all green). 3-10 exercises the required-method surface end-to-end:

- `pushDraft` — §6 step 6.
- (`pushFinal`, `voidRecord` are out of `draft_only` scope and throw `AdapterCapabilityError` if reached; 3-10 never reaches them.)

### 5.3 Draft-only is enforced at all three levels (per 2C-9 §5.3)

- **ERPNext `docstatus = 0`.** §6 step 6 verifies the ERPNext document has `docstatus: 0` (Draft, never Submitted/Cancelled). The adapter's `pushDraft` at `erpnextSandboxAdapter.js` always sends `docstatus: 0` in the POST body and never calls the submit endpoint.
- **`FINANCE_ADAPTER_MODE = draft_only`.** `assertWritePermitted` at `backend/lib/finance/adapterJobProcessor.js` permits `push_draft` and blocks all finalising ops. Stays `draft_only` for the entire 3-10 duration.
- **`FINANCE_PROVIDER_WRITES_ENABLED` kill switch.** False by default. The §6 step 6 controlled flip to `true` is the one explicit, time-bounded exception against the sandbox endpoint only.

### 5.4 Payload mapping is correct and metadata-stripped (per 2C-9 §5.4)

- The adapter's `fromCanonical` (per the `ERPNEXT_PROVIDER_OBJECT_MAP` at `erpnextSandboxAdapter.js:59-82`) maps the canonical `journal_entry` shape (`doc_number`, `txn_date`, `private_note`, `currency`, `lines`) into ERPNext-native fields (`name`, `posting_date`, `user_remark`, `multi_currency`, `accounts`).
- `buildProviderPayload` (Slice 2A) strips the 11-item internal-metadata denylist before the payload reaches the adapter, plus the leading-underscore convention. §6 step 6's evidence capture must verify the ERPNext request body contains ONLY the mapped ERPNext fields plus `doctype: 'Journal Entry'` + `docstatus: 0` — no `tenant_id`, no `braid_trace_id`, no governance fields, no leading-underscore keys.

### 5.5 Adapter events are emitted and replayable (per 2C-9 §5.5)

§6 steps 4 + 5 + 6 produce a full event chain in `finance.audit_events`:

- `finance.draft.created` (from `simulateDealWon`)
- `finance.approval.requested` (from `simulateDealWon`)
- `finance.approval.approved` (from `approveFinanceAction`)
- `finance.adapter.sync_queued` (from the promoter inside `approveFinanceAction`)
- `finance.adapter.sync_succeeded` (from the adapter worker's processor)

All adapter events use the Track A envelope `aggregate_type = 'adapter_job'` + `aggregate_id = <job UUID>` (per `slice-2-adapter-runtime-design.md` §4.7); the envelope columns themselves never carry `object_type` / `object_id`. (Note: the event _payload body_ does include `object_type` / `object_id` fields by current Slice 2 design — `adapterJobProcessor.js:155-156`/`:185-186` for `sync_succeeded` / `sync_failed`, `adapterJobPromoter.js:56-57` for `sync_queued` — duplicating the envelope's aggregate vocabulary as a convenience for downstream payload consumers that do not navigate to `payload.adapter_job.aggregate_type`. The no-drift contract is envelope-level only; payload presence is intentional.) The `adapter_queue` projection rebuilt via `runner.replay` produces the same `completed` bucket entry the live dispatch produced — replayability is proven by the Slice 2D integration test and re-verifiable in 3-10 by running a manual `replay` against the staging projection store.

### 5.6 Producer split holds end-to-end (the Slice 2-0 §4.7 invariant)

- `finance.adapter.sync_queued` comes from the **promoter** (`approveFinanceAction` → `promoteLinkedAdapterJobs`), never from the processor.
- `finance.adapter.sync_succeeded` / `sync_failed` come from the **processor** (`runAdapterPollCycle`), never from the promoter.

§6 step 7's evidence capture must confirm the source of each emission by correlating the event timestamps against the route call timestamps and the worker poll cycle timestamps.

### 5.7 Journal entry stays at `pending_approval` throughout (per Phase 3-8 §5.7)

The journal created by `simulateDealWon` is in `status = 'pending_approval'` from the start. `approveFinanceAction` mutates ONLY the approval row and the adapter_job row — it does NOT auto-post the journal. The adapter worker processes the adapter_job to push a draft ERPNext document; that does NOT post the journal either. After §6 completes, the journal's `status` must still be `pending_approval`. §6 step 8 verifies this.

### 5.8 No live customer accounting write (the 2C-9 §3 "Not allowed" contract)

- No QuickBooks OAuth configured / activated.
- No Xero OAuth configured / activated.
- No NetSuite integration of any kind.
- No payment movement.
- No write to a production ERPNext.
- The sandbox ERPNext write is the only provider write that occurs — and it's `docstatus: 0`, not finalising, on a sandbox instance reserved for this purpose.

---

## 6. Proof procedure (the steps the operator WOULD execute — NOT executed by this task)

The operator runs these steps in order, in staging only. **None of them ran by this Phase 3-10 task.** Each step lists prerequisites, exact commands, expected outcome, evidence to capture, and rollback for that step.

### 6.1 Preflight (no mutation)

- [ ] Re-confirm every item in §3 is still true. If anything has drifted (`git status` shows uncommitted changes, the adapter worker is no longer healthy, the route smoke tests no longer pass, the persistent-events lift got reverted, etc.), halt and remediate before proceeding.
- [ ] Confirm the sandbox ERPNext instance is reachable from VPS-1: `ssh andreibyf@147.189.173.237 'curl -sI "$FINANCE_ERPNEXT_BASE_URL" | head -3'` should return a 200/301/302 (any 2xx/3xx) within 5 s. A timeout or 4xx/5xx is a stop condition — the §6 step 6 `pushDraft` cannot succeed if the endpoint is unreachable.
- [ ] Confirm the sandbox ERPNext API key + secret are valid by making a single read-only call from a workstation (not from VPS-1): `curl -H "Authorization: token <key>:<secret>" "$FINANCE_ERPNEXT_BASE_URL/api/method/ping"` should return `{"message":"pong"}` within 5 s. **This counts as a proof-procedure read; record the result as evidence for §13 step 6.1.**
- [ ] Confirm no production action is implied at any step.

### 6.2 Insert the `tenant_integrations` row for the controlled tenant

From the staging Supabase SQL editor (service_role):

```sql
insert into tenant_integrations (tenant_id, integration_type, is_active, api_credentials, config, sync_status, integration_name)
values (
  'a11dfb63-4b18-4eb8-872e-747af2e37c46',
  'finance.erpnext',
  true,
  jsonb_build_object(
    'api_key', '<SANDBOX-API-KEY-FROM-DOPPLER-stg_stg-DO-NOT-PASTE-VALUE-HERE>',
    'api_secret', '<SANDBOX-API-SECRET-FROM-DOPPLER-stg_stg-DO-NOT-PASTE-VALUE-HERE>',
    'base_url', '<SANDBOX-BASE-URL>',
    'environment', 'sandbox'
  ),
  jsonb_build_object('mode', 'draft_only'),
  'pending',
  'ERPNext sandbox (Phase 3-10 proof)'
)
on conflict (tenant_id, integration_type) do update
  set is_active = excluded.is_active,
      api_credentials = excluded.api_credentials,
      config = excluded.config,
      sync_status = excluded.sync_status,
      integration_name = excluded.integration_name,
      updated_at = now();
```

**Operator must paste real credentials into the SQL editor at execution time (never commit credentials to git, never embed in this runbook). The Doppler-stored credentials in Doppler `stg_stg` are the source of truth — the operator copies them from Doppler into the SQL editor for this single insert.**

Per 2C-9 §6 step 2 + decision E4: plain JSONB is acceptable for the POC. A future credential-encryption migration is designed but not applied; the ERPNext POC uses plain JSONB.

**Rollback for 6.2:** `update tenant_integrations set is_active = false where tenant_id = 'a11dfb63-...' and integration_type = 'finance.erpnext';` or hard-delete the row. The worker reads ERPNext credentials from process env (not from `tenant_integrations`) so this row is informational only for Slice 2; making it the canonical credential location is the future per-tenant-credential-router work. Deleting / deactivating the row does NOT disable the worker's ERPNext adapter — that's a Phase 3-9 env-var concern.

### 6.3 Snapshot pre-proof state

Capture the baseline so §6 step 8's evidence shows exactly what changed.

```sql
-- Snapshot finance.adapter_jobs for the controlled tenant
select id, provider, operation, mode, status, attempts, created_at
from finance.adapter_jobs
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
order by created_at desc
limit 20;

-- Snapshot finance.audit_events count by event_type
select event_type, count(*) as n
from finance.audit_events
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
group by event_type
order by event_type;

-- Snapshot finance.projection_state (the projection worker writes here)
select projection_name, status, cursor_event_id, cursor_created_at, updated_at
from finance.projection_state
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
order by projection_name;

-- Snapshot adapter_queue projection live store (this is the worker-managed read model)
-- Exact query depends on the projection store backend; for the memory store it's a Map; for the pg store it's a row in finance.projection_state.state_json
-- The Slice 2D test demonstrates the bucketsOf() helper - that's the in-process API; for staging, query the projection_state.state_json directly:
select state_json
from finance.projection_state
where projection_name = 'adapter_queue'
  and tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
```

Save outputs to the evidence pack (§13). These are the baseline against which §6 step 8 measures the delta.

**Rollback for 6.3:** none — this is a read-only snapshot.

### 6.4 Trigger `simulateDealWon` via the backend route

From the operator's workstation (NOT from VPS-1):

```bash
curl -sX POST \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: a11dfb63-4b18-4eb8-872e-747af2e37c46" \
  -H "Authorization: Bearer <STAGING-CONTROLLED-TENANT-USER-JWT>" \
  -d '{
    "actor": { "id": "operator-3-10", "type": "human" },
    "payload": { "provider": "erpnext", "amount_cents": 12345 }
  }' \
  https://staging-api.aishacrm.com/api/v2/finance/simulate/deal-won \
| tee /tmp/3-10-simulate-deal-won.json
```

**Expected response (HTTP 201):**

```json
{
  "journal_entry": { "id": "<je-uuid>", "status": "pending_approval", ... },
  "approval": { "id": "<approval-uuid>", "status": "pending", "target_type": "journal_entry", "target_id": "<je-uuid>", ... },
  "adapter_job": { "id": "<job-uuid>", "provider": "erpnext", "operation": "push_draft", "mode": "draft_only", "status": "draft", "aggregate_type": "journal_entry", "aggregate_id": "<je-uuid>", ... }
}
```

**Critical assertion at this step:** `adapter_job.status` is `"draft"`, NOT `"queued"`. The draft-before-approval semantics from the Slice 2-0 §4.1 / §5.2 lifecycle correction require that `simulateDealWon` create the row in `'draft'`; no `finance.adapter.sync_queued` event is emitted yet. If the response shows `"queued"`, halt — the producer split is broken upstream.

Record the three returned UUIDs (`journal_entry.id`, `approval.id`, `adapter_job.id`) for the next steps.

**Verify in Postgres:**

```sql
select count(*) from finance.audit_events
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and event_type like 'finance.adapter.%';
```

**Pass:** zero new `finance.adapter.*` rows. **Fail:** any new `finance.adapter.sync_queued` row at this point — would mean the producer split is broken (the promoter ran before approval).

**Rollback for 6.4:** the inserted rows are part of the proof; not rolled back. If 3-10 is abandoned mid-way, the rows can be hard-deleted via SQL or left in place (they're benign).

### 6.5 Approve the action via the backend route

```bash
curl -sX POST \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: a11dfb63-4b18-4eb8-872e-747af2e37c46" \
  -H "Authorization: Bearer <STAGING-CONTROLLED-TENANT-USER-JWT>" \
  -d '{ "actor": { "id": "approver-3-10", "type": "human" } }' \
  "https://staging-api.aishacrm.com/api/v2/finance/approvals/<approval-uuid-from-step-6.4>/approve" \
| tee /tmp/3-10-approve.json
```

**Expected response (HTTP 200):**

```json
{
  "approval": { "id": "<approval-uuid>", "status": "approved", "approved_by": "approver-3-10", "approved_at": "<timestamp>", ... },
  "governance_decision": { ... },
  "promoted_adapter_jobs": [{ "id": "<job-uuid>", "provider": "erpnext", "operation": "push_draft", "mode": "draft_only" }]
}
```

**Critical assertion:** `promoted_adapter_jobs` has exactly one entry, matching the adapter_job UUID from step 6.4.

**Verify in Postgres** (immediately, before the projection worker has had time to dispatch the new event):

```sql
-- The adapter_job should now be 'queued'
select id, status from finance.adapter_jobs
where id = '<job-uuid-from-step-6.4>';

-- Exactly one finance.adapter.sync_queued event for the controlled tenant
select event_type, aggregate_type, aggregate_id, created_at
from finance.audit_events
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and event_type = 'finance.adapter.sync_queued'
order by created_at desc
limit 5;
```

**Pass:**

- `finance.adapter_jobs.status = 'queued'`.
- Exactly one new `finance.adapter.sync_queued` row.
- Envelope columns are `aggregate_type = 'adapter_job'` + `aggregate_id = <job-uuid>` (the envelope itself never carries `object_type` / `object_id` columns — that's the Track A no-drift contract). The payload body may carry `object_type` / `object_id` as a duplicate-for-convenience pair; that's expected per the current Slice 2 design and is not a drift violation.

**Fail:** any of the above wrong → halt; the promoter or the event envelope is broken.

**Verify projection has picked it up** (after one projection-worker poll cycle, ~5 s):

```sql
select state_json
from finance.projection_state
where projection_name = 'adapter_queue'
  and tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
```

**Pass:** `state_json` contains the adapter_job in its `queued` bucket with `provider: 'erpnext'`, `operation: 'push_draft'`, `mode: 'draft_only'`, `aggregate_type: 'journal_entry'`. **Fail:** projection still empty after 30 s → projection worker has stalled; halt.

**Rollback for 6.5:** same as 6.4 — rows are part of the proof; not rolled back.

### 6.6 The controlled `FINANCE_PROVIDER_WRITES_ENABLED=true` proof window (the one ERPNext HTTP call)

**This is the most sensitive step in the entire Phase 3 + Slice 2 arc. Read this section in full before executing it.**

#### 6.6.a Pre-flip baseline (read-only)

```bash
# Confirm the worker shows the queued job is waiting
ssh andreibyf@147.189.173.237 'docker logs --tail 20 staging-finance-adapter-worker | grep "poll cycle complete"'
```

**Pass:** recent `poll cycle complete` lines show `claimed_count: 0` repeatedly — the queued job exists in `finance.adapter_jobs` but the worker's kill switch is `false`, so it claims the job, hits the §4.6 code gate, records `dry_run: true` succeeded, and emits `sync_succeeded` with `provider_id: null`. Wait — that's NOT what we want for the proof. Re-check: with the kill switch `false`, the processor at `backend/lib/finance/adapterJobProcessor.js:332-345` IS executed and DOES emit `sync_succeeded` as `dry_run` — it just skips the HTTP call. So the queued job would already have been processed-as-dry-run by the time we reach 6.6.

**Important clarification.** Between §6.5 completing and the operator reading this section, the adapter worker has been polling and will have already claimed + processed-as-dry-run the queued job. The `adapter_queue` projection will show the job in `completed` with `dry_run: true`. **The kill-switch flip in 6.6.c needs a fresh queued job, not the one from §6.5.**

So the proper §6.6 sequence is:

- 6.6.a Verify the §6.5 job ended up in `completed` (dry-run) via the projection.
- 6.6.b Create a SECOND queued job by repeating §6.4 + §6.5 with a different `actor.id`.
- 6.6.c Flip `FINANCE_PROVIDER_WRITES_ENABLED=true` BEFORE the worker's next poll cycle claims the new job (timing window: < 5 s by default `poll_interval_ms`).
- 6.6.d Wait one poll cycle and observe the real HTTP call to ERPNext.
- 6.6.e IMMEDIATELY revert `FINANCE_PROVIDER_WRITES_ENABLED=false` and redeploy.

**Or — preferred** — change the approach to bracket the kill-switch window around the entire §6.4 + §6.5 + §6.6 sequence:

- 6.6.a Flip `FINANCE_PROVIDER_WRITES_ENABLED=true` BEFORE the §6.4 route call.
- 6.6.b Run §6.4 + §6.5 inside the window.
- 6.6.c Wait one poll cycle for the worker to claim + push.
- 6.6.d IMMEDIATELY revert `FINANCE_PROVIDER_WRITES_ENABLED=false` and redeploy.

The second approach is cleaner because there's exactly one queued job at the moment of the kill switch flip — no ambiguity about which job triggered the real call. **Re-sequence §6.4 / §6.5 / §6.6 accordingly when the operator authorizes execution: enable, route, wait, observe, revert.**

#### 6.6.b Authorization confirmation (no mutation)

Before flipping the kill switch, the operator MUST:

- [ ] Re-confirm `FINANCE_ERPNEXT_BASE_URL` on the adapter worker is the sandbox endpoint (not a production endpoint that someone changed).
- [ ] Re-confirm the sandbox ERPNext instance is the intended target (admin console reachable, expected ERPNext user is the API-key owner).
- [ ] Note the exact wall-clock time the flip will happen, for evidence correlation.
- [ ] Have the revert step (6.6.e) command pre-typed in a terminal, ready to fire.

#### 6.6.c Flip `FINANCE_PROVIDER_WRITES_ENABLED=true`

In Coolify, set on `staging-finance-adapter-worker`:

```
FINANCE_PROVIDER_WRITES_ENABLED=true
```

Redeploy. **Expected log line on the new container:** none specific to the flag itself (the processor reads `process.env.FINANCE_PROVIDER_WRITES_ENABLED` at every job per `adapterJobProcessor.js:332-345`; there's no startup log of the flag value). The behavioral signal is the next poll cycle's outcome.

#### 6.6.d Run §6.4 + §6.5 (or wait for the existing queued job to be claimed)

Per the "bracket the window around the route calls" sequence in §6.6.a:

- Re-run §6.4 (`simulateDealWon`) with a fresh `actor.id` so a new draft + approval are created.
- Re-run §6.5 (`approve`) so the new adapter_job promotes `draft → queued` and `sync_queued` is emitted.
- Wait one adapter-worker poll cycle (~5 s default).

**Expected worker log lines:**

```
[finance-adapter-worker] poll cycle complete
  { tenant_count: 1, claimed_count: 1, succeeded_count: 1, failed_count: 0, skipped_count: 0 }
```

The `succeeded_count: 1` here is a **real** success — the adapter made the HTTP call. The processor emits `finance.adapter.sync_succeeded` with `provider_id` set to the ERPNext document's `name` (e.g., `ACC-JV-2026-00001`) — NOT `null` as in the dry-run case.

**Expected ERPNext-side state:** the sandbox ERPNext admin console shows a new Journal Entry document with:

- `docstatus: 0` (Draft, never Submitted).
- Posting date matching the canonical `txn_date`.
- `accounts` rows matching the canonical `lines` (account, debit_in_account_currency / credit_in_account_currency, party / party_type if present).
- `user_remark` matching the canonical `private_note`.
- `multi_currency` matching the canonical `currency`.
- NO trace of `tenant_id`, `braid_trace_id`, `correlation_id`, `causation_id`, `governance_decision`, `policy_decision`, or any leading-underscore key (E6 metadata stripping enforced by `buildProviderPayload`).

**Capture as evidence:**

- Worker log line with the cycle counters.
- ERPNext document screenshot or `GET /api/resource/Journal Entry/<name>` JSON response showing `docstatus: 0` and the mapped fields.
- The `finance.audit_events` row for `finance.adapter.sync_succeeded` showing `payload.provider_id: <name>` and `payload.dry_run: false`.
- The `adapter_queue` projection's `completed` bucket entry for this job.

#### 6.6.e IMMEDIATELY revert `FINANCE_PROVIDER_WRITES_ENABLED=false` and redeploy

This is **mandatory and time-bounded**. The window between §6.6.c flip-up and §6.6.e flip-down should be as short as possible — ideally < 60 s wall-clock from the operator's perspective (one route call sequence + one poll cycle + the revert + Coolify redeploy time).

```
FINANCE_PROVIDER_WRITES_ENABLED=false   # or unset
```

Trigger Coolify redeploy. Verify on the new container:

```bash
ssh andreibyf@147.189.173.237 'docker exec staging-finance-adapter-worker env | grep FINANCE_PROVIDER_WRITES_ENABLED'
```

**Pass:** prints `FINANCE_PROVIDER_WRITES_ENABLED=false` (or no output if unset entirely). **Fail:** still `true` → halt and re-revert immediately.

Wait one more adapter-worker poll cycle and observe:

```bash
ssh andreibyf@147.189.173.237 'docker logs --tail 5 staging-finance-adapter-worker | grep "poll cycle complete"'
```

**Pass:** `claimed_count: 0` — no more queued jobs to process. The kill switch is closed; the adapter is back to the safest default.

#### 6.6.f Negative-proof verification (no further env mutation)

Per 2C-9 §6 step 8: a `pushDraft` attempt with `FINANCE_PROVIDER_WRITES_ENABLED=false` must be a no-op (recorded as `dry_run: true` succeeded with `provider_id: null`, no HTTP call). To verify this in 3-10:

- Re-run §6.4 + §6.5 one more time (third invocation). This produces a third adapter_job in `queued`.
- Wait one adapter-worker poll cycle.
- Verify the worker log shows `claimed_count: 1, succeeded_count: 1`.
- Verify the `finance.audit_events` row for the new `sync_succeeded` shows `payload.provider_id: null` and `payload.dry_run: true`.
- Verify the sandbox ERPNext admin console shows NO new Journal Entry created during this poll cycle.

**Pass:** worker processed the queued job as dry-run; no ERPNext doc created. **Fail:** worker made an HTTP call → kill switch isn't actually `false`; halt and audit.

**Rollback for 6.6:** the revert in 6.6.e IS the rollback for the entire 6.6 window. If anything goes wrong before 6.6.e, the operator's pre-typed revert command in 6.6.b fires immediately. If the worker logs show unexpected behavior in 6.6.d, revert first then investigate.

### 6.7 Producer-split + envelope verification

Read the `finance.audit_events` rows produced by the three §6.4 + §6.5 + §6.6 sequences (now three iterations of the lifecycle):

```sql
select event_type, aggregate_type, aggregate_id, payload, created_at
from finance.audit_events
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and event_type like 'finance.%'
order by created_at desc
limit 50;
```

**Per-iteration verification (3 iterations expected):**

| Event order | Event type                       | Aggregate type  | Produced by                                                                                                                          |
| ----------- | -------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1           | `finance.draft.created`          | `journal_entry` | Backend route, `simulateDealWon`                                                                                                     |
| 2           | `finance.approval.requested`     | `approval`      | Backend route, `simulateDealWon`                                                                                                     |
| 3           | `finance.approval.approved`      | `approval`      | Backend route, `approveFinanceAction`                                                                                                |
| 4           | `finance.adapter.sync_queued`    | `adapter_job`   | **Promoter** (`promoteLinkedAdapterJobs` inside `approveFinanceAction`) — NOT the processor                                          |
| 5           | `finance.adapter.sync_succeeded` | `adapter_job`   | **Processor** (`runAdapterPollCycle` in the adapter worker) — `dry_run: true` for iterations 1 + 3, `dry_run: false` for iteration 2 |

**Critical invariants to verify:**

- **Producer split:** every `sync_queued` precedes the corresponding `sync_succeeded` for the same `aggregate_id`. The `sync_queued` row's `created_at` is within ~1 s of the `approval.approved` row (promoter ran inside the approval transaction). The `sync_succeeded` row's `created_at` is later, on a worker-poll-cycle boundary.
- **Envelope:** every `finance.adapter.*` row has envelope columns `aggregate_type = 'adapter_job'` and `aggregate_id = <job-uuid>`. The envelope itself never carries `object_type` / `object_id` columns — that's the Track A no-drift contract (`slice-2-adapter-runtime-design.md` §4.7), and the Slice 2D `ENVELOPE` test (`adapterQueueProjection.integration.test.js:485-487`) is the in-process assertion of exactly this property. **The payload body is a different matter:** by current Slice 2 design, every `finance.adapter.*` payload includes `object_type` and `object_id` as a duplicate-for-convenience pair (`adapterJobProcessor.js:155-156`/`:185-186` for `sync_succeeded` / `sync_failed`; `adapterJobPromoter.js:56-57` for `sync_queued`). That payload-side presence is **not** a drift violation; the no-drift contract is envelope-only. Operators evaluating this step should verify with a query that inspects the envelope columns directly (e.g. `select event_type, aggregate_type, aggregate_id from finance.audit_events where event_type like 'finance.adapter.%' and (aggregate_type <> 'adapter_job')` returns zero rows), not the payload body.
- **Embedded snapshot:** every `finance.adapter.*` event payload contains an `adapter_job` snapshot matching the contemporaneous adapter_job state.

### 6.8 Final-state verification (the journal-stays-`pending_approval` contract + no production action)

After §6.6.e completes and the worker has had time to fully drain any remaining queued jobs:

```sql
-- The journals must STILL be pending_approval (no auto-posting)
select id, status from finance.journal_entries
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and id in ('<je-uuid-iter-1>', '<je-uuid-iter-2>', '<je-uuid-iter-3>');

-- All three adapter_jobs are in 'succeeded' (or 'failed' for one if step 6.6 went sideways)
select id, status, attempts, last_provider_id, last_error from finance.adapter_jobs
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and id in ('<job-uuid-iter-1>', '<job-uuid-iter-2>', '<job-uuid-iter-3>');

-- The adapter_queue projection's completed bucket contains all three jobs
select state_json
from finance.projection_state
where projection_name = 'adapter_queue'
  and tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
```

**Pass:**

- All three journals at `pending_approval` (Phase 3-8 §5.7 contract preserved).
- Iteration 2's `last_provider_id` is the ERPNext document name (the proof of the real HTTP call); iterations 1 + 3's `last_provider_id` is `null` (dry-run).
- All three jobs in `completed` bucket of `adapter_queue` projection.

**Fail:** any journal at `posted` → halt; auto-posting was introduced somewhere it shouldn't be. Any job stuck in `queued` / `running` → worker hung; halt.

**Verify NO production action:**

- Production ERPNext admin console (if accessible) shows no new docs created during the 3-10 window.
- Production Supabase shows no `finance.audit_events` activity for any tenant (3-10 was staging-only).
- Hetzner backend container shows no restarts.

### 6.9 Record evidence

Per [`staging-activation-review.md`](./staging-activation-review.md) (2C-14), capture for each step:

- Step number, executor, wall-clock UTC time, PASS/FAIL/DEFERRED.
- Verbatim command output.
- Worker log excerpts.
- ERPNext document JSON or screenshot.
- SQL query results (especially the snapshot deltas from §6.3 → §6.8).

Save to `docs/architecture/finance/phase-3-evidence/` or to the §13 evidence pack table below.

---

## 7. Proof gate — exit criteria

Phase 3-10 passes only when every item in §6.4 through §6.8 passes, AND:

- [ ] The connection targeted a sandbox / local ERPNext only; the URL guard at `erpnextSandboxAdapter.js:89-128` accepted the configured base URL.
- [ ] The adapter's `pushDraft` created an ERPNext document with `docstatus: 0`; the ERPNext document was never submitted/finalised.
- [ ] `toCanonical` / `fromCanonical` mapping is correct end-to-end (verified by the ERPNext doc matching the canonical journal entry's fields).
- [ ] The ERPNext-bound payload contained ZERO internal runtime metadata (`tenant_id`, `braid_trace_id`, `correlation_id`, `causation_id`, governance/policy fields, leading-underscore keys).
- [ ] Adapter events (`sync_queued`, `sync_succeeded`) emitted with the Track A envelope (`aggregate_type='adapter_job'`, no `object_*` columns at envelope level — payload-body `object_*` duplicates are expected per §5.5); replay reconstructs the `adapter_queue` projection identically.
- [ ] The negative tests passed (`pushFinal` / `voidRecord` unreachable under `draft_only`; dry-run mode with `FINANCE_PROVIDER_WRITES_ENABLED=false` did not call the HTTP endpoint).
- [ ] Producer split holds: `sync_queued` always from the promoter, `sync_succeeded` / `sync_failed` always from the processor.
- [ ] No QuickBooks / Xero / NetSuite OAuth was configured.
- [ ] No payment movement occurred.
- [ ] No production provider was contacted.
- [ ] Every journal entry created during 3-10 remained at `pending_approval` (no auto-posting).
- [ ] `FINANCE_PROVIDER_WRITES_ENABLED` is back to `false` (unset) at task end.
- [ ] No tenant other than `a11dfb63-4b18-4eb8-872e-747af2e37c46` was processed.

---

## 8. Verification commands (operator instructions only — NOT executed by this task)

Beyond the inline verification in §6, post-execution checks:

### 8.1 ERPNext sandbox final state

Via the sandbox ERPNext admin UI or `/api/resource/Journal Entry?limit_start=0&limit_page_length=20&filters=[["modified",">","<3-10-start-time>"]]`:

- Exactly one new Journal Entry document created during the §6.6 window.
- `docstatus: 0` (Draft).
- Posting date, accounts, remark, currency match the canonical inputs.
- No documents in `Submitted` or `Cancelled` state.

### 8.2 Doppler kill switch confirmed reverted

```bash
ssh andreibyf@147.189.173.237 'docker exec staging-finance-adapter-worker env' | grep -E "FINANCE_PROVIDER_WRITES_ENABLED|FINANCE_ADAPTER_MODE"
```

**Pass:** `FINANCE_PROVIDER_WRITES_ENABLED=false` (or absent) AND `FINANCE_ADAPTER_MODE=draft_only`. **Fail:** anything else → revert immediately.

### 8.3 No production action confirmation

Same as Phase 3-9 §8.7 — verify no Hetzner / production change happened.

### 8.4 Replay determinism check (optional, mirrors Slice 2D test 9)

Have an operator invoke `runner.replay('adapter_queue', 'a11dfb63-...')` against the projection store (via the same Phase 3-6 path or a one-off `docker exec` Node snippet). The rebuilt projection state should equal the pre-replay state byte-identically. **Pass:** `JSON.stringify(before) === JSON.stringify(after)`. **Fail:** divergence → projection determinism is broken; this is a Slice 2D regression and a stop condition.

---

## 9. Rollback behavior

Phase 3-10 rollback is mostly **config-only**, with one data-side knob (the `tenant_integrations` row).

### 9.1 Kill-switch rollback (the in-step rollback)

§6.6.e IS the rollback for the controlled-flip window. The runbook's design is "the kill switch is closed by default, briefly opened, immediately closed again." If 6.6.e succeeds, no further rollback is needed for the flag itself.

### 9.2 Worker rollback (back to Phase 3-9 disabled-and-healthy state)

If 3-10 needs to be abandoned entirely:

- Per Phase 3-9 §9: unset `ENABLE_FINANCE_ADAPTER_WORKER` and redeploy.
- The worker returns to the disabled-and-idling state.
- Queued jobs in `finance.adapter_jobs` stay where they are (the projection worker still sees the events that were emitted; the `adapter_queue` projection retains its rows).

### 9.3 Route rollback (back to Phase 3-7 disabled state)

If the route activation needs to be undone (which would un-do 3-10's ability to run too):

- Per [`staging-route-activation-log.md`](./staging-route-activation-log.md): unset `ENABLE_FINANCE_OPS` on `staging-backend-heavy` and redeploy. Or flip the per-tenant `financeOps` module flag back to `false`.

### 9.4 `tenant_integrations` rollback

```sql
update tenant_integrations
   set is_active = false,
       sync_status = 'inactive'
 where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
   and integration_type = 'finance.erpnext';
```

Or hard-delete. Either is reversible (re-run §6.2). The row is informational only for Slice 2; the worker reads ERPNext credentials from process env, not from this row.

### 9.5 Event-store rollback (NOT recommended)

The `finance.audit_events` rows produced by §6.4 + §6.5 + §6.6 + §6.6.f are append-only and immutable by design (migration 173 triggers). Removing them would require dropping + recreating the immutability triggers, which is itself a Phase 3-2 rollback action and far beyond 3-10's scope. **Do not attempt this rollback.** If 3-10 needs to be re-run cleanly, the new iterations will produce additional rows alongside the old ones — that's the append-only contract.

### 9.6 ERPNext sandbox cleanup (optional)

The Journal Entry document created in §6.6 can be deleted via the ERPNext admin console after evidence capture. Or left in place as a record. ERPNext document deletion is reversible by re-running §6.6. Production ERPNext was never touched, so no production cleanup is needed.

---

## 10. Stop conditions

Phase 3-10 stop conditions are extensive because 3-10 is the most consequential Phase 3 packet. Any of the following triggers an immediate halt; revert to the safest state per §9.

- **Any HTTP request reaches a production ERPNext / QuickBooks / Xero / NetSuite endpoint.** Immediate halt; this is the most critical 3-10 safety violation. Audit how the request was generated. Production credentials must not be in any staging Doppler config; if they are, that is the root cause and must be removed.
- **Any payment movement is initiated.** Immediate halt; 3-10's contract is no payment movement under any circumstance.
- **`FINANCE_PROVIDER_WRITES_ENABLED=true` is set anywhere outside the §6.6 window.** Immediate halt; revert to `false` and audit.
- **`FINANCE_ADAPTER_MODE` is set to anything other than `draft_only`.** Immediate halt; revert. The ERPNext sandbox adapter only supports `draft_only`; any other mode would route to `pushFinal` / `voidRecord`, which throw `AdapterCapabilityError` — but the principle is to never set it.
- The sandbox ERPNext document is created with `docstatus: 1` (Submitted). Halt; the adapter is broken or the wrong code path ran.
- ERPNext document contains any internal AiSHA metadata (`tenant_id`, `braid_trace_id`, etc.). Halt; the `buildProviderPayload` boundary is broken.
- `finance.audit_events` shows `finance.adapter.sync_queued` emitted by the processor (not the promoter). Halt; producer split is broken.
- `finance.audit_events` shows `finance.adapter.sync_succeeded` or `sync_failed` emitted before approval. Halt; the processor processed an unapproved draft.
- Any `finance.adapter.*` event has `object_type` / `object_id` as _envelope columns_ (the envelope must carry only `aggregate_type` / `aggregate_id` per the Track A contract). Halt; envelope drift. Payload-body `object_type` / `object_id` are expected per the current Slice 2 design and are **not** a stop condition.
- Any journal entry transitions to `posted` during 3-10. Halt; auto-posting was introduced and must be removed.
- Adapter worker logs `[finance-adapter-worker] poll cycle crashed` during the §6.6 window. Halt; revert the kill switch immediately, then investigate.
- ERPNext sandbox endpoint becomes unreachable during the §6.6 window. Halt; revert the kill switch (no point waiting if the HTTP call would fail).
- Coolify redeploy of the adapter worker takes longer than 60 s during the §6.6.e revert. Halt operations using the worker; manually verify the env is reverted via `docker exec env`.
- Any tenant other than the controlled `a11dfb63-4b18-4eb8-872e-747af2e37c46` appears in the worker logs or in any `finance.*` row. Halt; tenant scoping is broken.
- The persistent-events route lift prerequisite turns out to be unmet (events from the route never appear in Postgres `finance.audit_events`). Halt 3-10 entirely; this is a prerequisite gap that must be fixed in a separate slice before 3-10 can be re-attempted.

---

## 11. Hard constraints (explicit restatement)

| Constraint                                                                                                                                                                                                                                                                                                                                                                                                                           | Source                                               | Status this task          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------- |
| **No actual ERPNext proof executed by this task.** This document is the runbook; execution is a separately authorized operator action.                                                                                                                                                                                                                                                                                               | 3-10 scope                                           | Confirmed — runbook only. |
| **No HTTP request to any ERPNext / QuickBooks / Xero / NetSuite endpoint by this task.**                                                                                                                                                                                                                                                                                                                                             | 3-10 acceptance                                      | Confirmed.                |
| **No `FINANCE_PROVIDER_WRITES_ENABLED` flip by this task.** The §6.6 controlled flip is described, not performed.                                                                                                                                                                                                                                                                                                                    | 3-10 acceptance                                      | Confirmed.                |
| **No Doppler / env var changes on staging by this task.**                                                                                                                                                                                                                                                                                                                                                                            | 3-10 acceptance                                      | Confirmed.                |
| **No Coolify mutation by this task.**                                                                                                                                                                                                                                                                                                                                                                                                | 3-10 acceptance                                      | Confirmed.                |
| **No `tenant_integrations` row insertion by this task.** §6.2 describes the SQL the operator will run; this task does not execute it.                                                                                                                                                                                                                                                                                                | 3-10 acceptance                                      | Confirmed.                |
| **No migration application.**                                                                                                                                                                                                                                                                                                                                                                                                        | 3-2 scope                                            | Confirmed.                |
| **Sandbox ERPNext only.** Production ERPNext is never contacted; the adapter constructor's URL guard at `erpnextSandboxAdapter.js:89-128` is the structural enforcement. `FINANCE_ERPNEXT_SANDBOX_BASE_URLS` (if used) lists sandbox/local FQDNs only.                                                                                                                                                                               | 2C-9 §5.1 / `slice-2-adapter-runtime-design.md` §4.4 | Confirmed.                |
| **Sandbox credentials only.** API key + secret are sandbox-generated, stored in Doppler `stg_stg`, never in `prd_prd`, never committed to git.                                                                                                                                                                                                                                                                                       | 2C-9 §5.1 / E4                                       | Confirmed.                |
| **Draft-only at three levels.** ERPNext `docstatus: 0`; `FINANCE_ADAPTER_MODE=draft_only`; `FINANCE_PROVIDER_WRITES_ENABLED=false` by default with a single controlled flip window in §6.6.                                                                                                                                                                                                                                          | 2C-9 §5.3 / `slice-2-adapter-runtime-design.md` §4.6 | Confirmed.                |
| **`FINANCE_ADAPTER_MODE=draft_only` preserved throughout.** Never set to anything else.                                                                                                                                                                                                                                                                                                                                              | 2C-9 §5.3                                            | Confirmed.                |
| **Producer split preserved.** `sync_queued` only from the promoter; `sync_succeeded` / `sync_failed` only from the processor. §6.7 evidence confirms.                                                                                                                                                                                                                                                                                | `slice-2-adapter-runtime-design.md` §4.7 / Slice 2D  | Confirmed.                |
| **Draft-before-approval semantics preserved.** `simulateDealWon` creates `adapter_job.status='draft'` with no `sync_queued` event. The promoter inside `approveFinanceAction` is what emits `sync_queued`.                                                                                                                                                                                                                           | `slice-2-adapter-runtime-design.md` §4.1 / Slice 2D  | Confirmed.                |
| **Event envelope (columns only): `aggregate_type='adapter_job'`, no `object_*` envelope columns.** Per `slice-2-adapter-runtime-design.md` §4.7 and the Slice 2D `ENVELOPE` test (`adapterQueueProjection.integration.test.js:485-487`). The no-drift contract is envelope-level; payload-body `object_type` / `object_id` are present by current design and are not a drift violation. §6.7 evidence confirms the envelope columns. | Track A freeze / Slice 2D                            | Confirmed.                |
| **Provider payload contains zero internal metadata.** `buildProviderPayload` boundary strips the 11-item denylist; `assertNoInternalMetadata` would assert this in tests. §6.6.d evidence confirms.                                                                                                                                                                                                                                  | `slice-2-adapter-runtime-design.md` §4.5 / E6        | Confirmed.                |
| **No `ENABLE_FINANCE_PERSISTENT_EVENTS` flip by this task.** The lift to `true` on the backend is a prerequisite (per §3) that must already be in place before 3-10 runs; 3-10 itself doesn't touch the flag.                                                                                                                                                                                                                        | Phase 3-1 §7 / separate later slice                  | Confirmed.                |
| **No QuickBooks / Xero / NetSuite live integration.** Neither adapter is implemented; neither is registered.                                                                                                                                                                                                                                                                                                                         | E5                                                   | Confirmed.                |
| **No production action.** Hetzner is not touched; `prd_prd` Doppler is not opened; production tenants are not queried; production providers are not contacted.                                                                                                                                                                                                                                                                       | Phase 3-1 §8 / 2C-9 §3                               | Confirmed.                |
| **No payment movement.** No finalised ledger, no posted journal, no submitted ERPNext doc, no money movement of any kind.                                                                                                                                                                                                                                                                                                            | 2C-9 §3                                              | Confirmed.                |
| **Journal stays `pending_approval` throughout.** No auto-posting introduced. §6.8 verifies post-execution.                                                                                                                                                                                                                                                                                                                           | Phase 3-8 §5.7                                       | Confirmed.                |
| **`ENABLE_FINANCE_OPS` / `ENABLE_FINANCE_WORKERS` / `ENABLE_FINANCE_ADAPTER_WORKER` unchanged from Phase 3-9 enabled state.** The worker stays enabled throughout 3-10; only the kill switch is touched in §6.6.                                                                                                                                                                                                                     | 3-9 / 3-10 reconciliation                            | Confirmed.                |
| **`FINANCE_CONTROLLED_TENANT_IDS` unchanged.** Both workers stay scoped to `a11dfb63-4b18-4eb8-872e-747af2e37c46`. No implicit "all tenants" fall-through.                                                                                                                                                                                                                                                                           | 3-5 / 3-9 / 3-10 scope                               | Confirmed.                |

---

## 12. Acceptance for Phase 3-10 (this task)

This document is the Phase 3-10 deliverable when paired with the matching CHANGELOG entry and the scaffold update. Acceptance for the **runbook** (this task):

- [x] End-to-end lifecycle described with the §1 chain showing producer/promoter/processor split (and the events each emits)
- [x] Proof gate sub-assertions enumerated (§5 — 8 sub-gates mapped to 2C-9 §5)
- [x] Step-by-step proof procedure documented as a dry run (§6 — 9 steps with rollback per step)
- [x] The single `FINANCE_PROVIDER_WRITES_ENABLED=true` controlled-flip window is explicit, scoped, and time-bounded (§6.6 with sub-steps a/b/c/d/e/f, pre-flip / authorization / flip / observe / revert / negative-proof sequence)
- [x] `FINANCE_ADAPTER_MODE=draft_only` and ERPNext `docstatus: 0` enforcement called out at every relevant step (§5.3, §6.6.d, §11)
- [x] Sandbox-only ERPNext base URL constraint with the structural guard at `erpnextSandboxAdapter.js:89-128` (§3, §11)
- [x] Sandbox credential storage in Doppler `stg_stg` (§3, §6.2, §11)
- [x] `tenant_integrations` row procedure documented but NOT executed (§6.2)
- [x] Backend route calls (`simulateDealWon`, `approveFinanceAction`) documented but NOT executed (§6.4, §6.5)
- [x] Producer split end-to-end (§5.6, §6.7 with per-event-type producer attribution)
- [x] Adapter event envelope columns (`aggregate_type='adapter_job'`, no `object_*` envelope columns) verified at §5.5, §6.7, §11; payload-body `object_*` presence acknowledged as expected per the current Slice 2 design (§5.5)
- [x] Internal metadata stripped from ERPNext-bound payload (§5.4, §6.6.d evidence capture)
- [x] `adapter_queue` projection state expectations described for queued / completed / failed buckets (§5.5, §6.5 verification, §6.8)
- [x] Journal stays `pending_approval` end-to-end (§5.7, §6.8 verification, §11)
- [x] Rollback is config-only, with the kill-switch revert as the in-step rollback (§9)
- [x] Stop conditions cover all sensitive boundaries (§10 — 14 specific halt conditions)
- [x] No QuickBooks / Xero / NetSuite (§5.8, §11)
- [x] No payment movement (§5.8, §11)
- [x] No production action (§2, §6.8, §8.3, §11)
- [x] No proof was executed by this task — §2 explicit "None" row for every modality
- [x] CHANGELOG entry recording Phase 3-10 (separate change)
- [x] Scaffold updated with commit hash, next active item

Acceptance for the **execution** (a future, separately-authorized action by the deploy owner): every check in §6 + §8 PASS, the §6.6 controlled-flip window opened and closed cleanly with `FINANCE_PROVIDER_WRITES_ENABLED` back to `false` at task end, exactly one ERPNext Journal Entry document was created with `docstatus: 0`, the producer split held across all three iterations, no production action occurred, no payment movement, no QuickBooks/Xero/NetSuite contact.

---

## 13. Evidence pack (populated on execution)

When the proof is executed, capture verbatim outputs here (or in a linked evidence record under `docs/architecture/finance/phase-3-evidence/`). Until execution, the table below is empty.

| Step   | Run at (UTC) | Operator | Result (PASS / FAIL / DEFERRED) | Output / evidence link | Notes |
| ------ | ------------ | -------- | ------------------------------- | ---------------------- | ----- |
| §6.1   |              |          |                                 |                        |       |
| §6.2   |              |          |                                 |                        |       |
| §6.3   |              |          |                                 |                        |       |
| §6.4   |              |          |                                 |                        |       |
| §6.5   |              |          |                                 |                        |       |
| §6.6.a |              |          |                                 |                        |       |
| §6.6.b |              |          |                                 |                        |       |
| §6.6.c |              |          |                                 |                        |       |
| §6.6.d |              |          |                                 |                        |       |
| §6.6.e |              |          |                                 |                        |       |
| §6.6.f |              |          |                                 |                        |       |
| §6.7   |              |          |                                 |                        |       |
| §6.8   |              |          |                                 |                        |       |
| §6.9   |              |          |                                 |                        |       |
| §8.1   |              |          |                                 |                        |       |
| §8.2   |              |          |                                 |                        |       |
| §8.3   |              |          |                                 |                        |       |
| §8.4   |              |          |                                 |                        |       |

Next packet (once §6 + §8 PASS): **Phase 3-11 — Observability / alerts / degraded-state / rollback verification** ([`staging-observability-verification.md`](./staging-observability-verification.md)), which now has real adapter worker activity to observe (signals 5 + 6 in `slice-2-adapter-runtime-design.md` §4.9 become measurable), followed by **staging activation review** ([`staging-activation-review.md`](./staging-activation-review.md), 2C-14) consolidating the Phase 3 evidence.
