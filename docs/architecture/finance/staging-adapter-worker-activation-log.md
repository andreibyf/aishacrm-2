# Finance Ops — Phase 3-9: Controlled-Tenant Adapter Worker Activation Runbook (Dry Run)

**Phase 3-9 — Controlled Staging Activation, adapter worker enablement for one controlled tenant.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Runbook / dry-run plan. **No live activation was performed by this task.** No Coolify mutation, no Doppler / env var change in staging, no migration applied, no backend route mounted, no ERPNext sandbox endpoint contacted, no provider HTTP write. This document is the exact operator runbook a deploy owner would use; it does not execute the runbook.
**Date:** 2026-05-25
**Related:**
[`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) (3-1, baseline `3c60d9ff`) ·
[`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) (3-4, the deployment package — Slice 2C added the adapter worker service block alongside the projection worker) ·
[`staging-worker-activation-log.md`](./staging-worker-activation-log.md) (3-5, projection worker activation runbook — structural twin for this document) ·
[`slice-2-adapter-runtime-design.md`](./slice-2-adapter-runtime-design.md) (Slice 2-0, the design freeze whose §4.3 + §5.3 define this worker's contract; §5.5 explicitly delegates 3-9 + 3-10 runbook authoring to Slice 2E) ·
[`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) (2C-8, the original adapter-worker sandbox posture) ·
[`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) (2C-13, full enablement procedure — 3-9 is its Step 4 (worker toggles) for the adapter worker only) ·
[`erpnext-staging-sandbox-proof-results.md`](./erpnext-staging-sandbox-proof-results.md) (3-10, the ERPNext sandbox proof runbook that runs against the worker this document activates) ·
[`deploy/coolify/finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml) (Phase 3-4 staging YAML, includes the disabled-by-default `finance-adapter-worker` service block from Slice 2C)

---

## 1. Purpose and scope

Phase 3-9 is the **worker-only enablement** of `finance-adapter-worker` for **exactly one controlled staging tenant**. After 3-9, the worker process satisfies its three-tier gate (`isFinanceAdapterWorkerEnabled` at `backend/workers/financeAdapterWorker.js:116-122`), starts its poll loop, registers the ERPNext sandbox adapter from environment, and is scoped to the single controlled tenant via `FINANCE_CONTROLLED_TENANT_IDS`.

3-9 is **not** the ERPNext proof execution. The actual `simulateDealWon → approveFinanceAction → runAdapterPollCycle → adapter_queue` end-to-end demonstration against sandbox ERPNext is **Phase 3-10**. 3-9 stops at "the worker is alive, enabled, idle, and ready to poll" — proven by the heartbeat-file healthcheck flipping to `healthy` and the `[finance-adapter-worker] poll cycle complete` log line.

3-9 is also **not** the `FINANCE_PROVIDER_WRITES_ENABLED` flip. The activation runs with `FINANCE_PROVIDER_WRITES_ENABLED=false` and `FINANCE_ADAPTER_MODE=draft_only` — the two-layer safety per [`slice-2-adapter-runtime-design.md`](./slice-2-adapter-runtime-design.md) §4.6 stays at its safest default. The one-time provider-writes flip is **Phase 3-10 §6 step 6**, executed deliberately against the sandbox instance and reverted immediately after.

**Why 3-9 still has operational value before 3-10:**

- It proves the worker's tenant configuration is correct (`FINANCE_CONTROLLED_TENANT_IDS` correctly targets the controlled tenant; the DB connection works as `service_role` against `finance.adapter_jobs` and `finance.audit_events`; the heartbeat-file healthcheck transitions to healthy under load).
- It proves the ERPNext sandbox adapter registers correctly at boot (entry block at `backend/workers/financeAdapterWorker.js:439-516` reads `FINANCE_ERPNEXT_BASE_URL`/`_API_KEY`/`_API_SECRET`, constructs `createErpnextSandboxAdapter`, and registers it under the `'erpnext'` provider slot — or logs and continues with an empty registry if any of the three env vars is missing).
- It does so **without exposing any tenant-visible side effect** — no events are emitted (the poll cycle finds zero queued jobs because no approved adapter_jobs exist yet — those require 3-7 route activation + the approval flow + Slice 2's lift of `ENABLE_FINANCE_PERSISTENT_EVENTS`), no provider HTTP write occurs (the kill switch is `false`), no journal posts.
- Failure to reach healthy-enabled-idle is a worker-config bug, caught in isolation before Phase 3-10 stacks a proof procedure on top.

**This document and the matching env-change list are runbook only.** No flag is flipped, no Doppler config is mutated, no Coolify redeploy is triggered by this task. Executing the runbook is a separately authorized operator action covered by §5.

---

## 2. Live-activation posture

**Default for this task: no activation was performed.**

| What                                                                                                                                                | Status this task                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doppler `stg_stg` env var changed (any worker-tier flag, `FINANCE_CONTROLLED_TENANT_IDS`, `FINANCE_ERPNEXT_*`, `FINANCE_PROVIDER_WRITES_ENABLED`)   | None.                                                                                                                                                                                                                                                         |
| Coolify worker app redeploy                                                                                                                         | None.                                                                                                                                                                                                                                                         |
| Coolify worker app creation (`staging-finance-adapter-worker`)                                                                                      | None by this task. Slice 2C added the YAML service block in [`deploy/coolify/finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml); creating the actual Coolify app on VPS-1 is the Phase 3-9 prerequisite §3.5. |
| SSH session to VPS-1 (`andreibyf@147.189.173.237`)                                                                                                  | None.                                                                                                                                                                                                                                                         |
| Staging Supabase migration applied                                                                                                                  | None.                                                                                                                                                                                                                                                         |
| Backend `/api/v2/finance` route mounted in staging                                                                                                  | None — `ENABLE_FINANCE_OPS` on the backend app remains unset (route activation is Phase 3-7).                                                                                                                                                                 |
| Per-tenant `financeOps` module flag flipped                                                                                                         | None — `financeOps` for `a11dfb63-4b18-4eb8-872e-747af2e37c46` remains unset. The adapter worker reads `finance.adapter_jobs` directly via `service_role`; the module flag gates route requests, not the worker.                                              |
| `tenant_integrations` row inserted with ERPNext sandbox credentials                                                                                 | None — sandbox credential insertion is part of Phase 3-10 §6 step 2.                                                                                                                                                                                          |
| Production environment touched in any way                                                                                                           | None.                                                                                                                                                                                                                                                         |
| Provider HTTP write (QuickBooks / Xero / ERPNext)                                                                                                   | None — `FINANCE_PROVIDER_WRITES_ENABLED=false` is preserved as the safest default throughout 3-9. The one-time flip is Phase 3-10 §6 step 6, against the sandbox endpoint only, reverted immediately after.                                                   |
| `FINANCE_PROVIDER_WRITES_ENABLED` set to `'true'` anywhere                                                                                          | None — leaving this `false` (or unset) keeps the §4.6 code gate at its safest layer.                                                                                                                                                                          |
| `FINANCE_ADAPTER_MODE` set to anything other than `draft_only`                                                                                      | None — `draft_only` is the safest §4.6 mode and the only mode the ERPNext sandbox adapter supports.                                                                                                                                                           |

A live execution requires the deploy owner's explicit authorization. When authorized, the procedure in §5 is run **in the order listed** and outputs are captured per §13.

---

## 3. Prerequisites — what must be true before 3-9 runs

Each prerequisite is a previous Phase 3 packet's deliverable or a Slice 2 implementation packet; this list is a single place an operator can scan before running §5.

- [ ] **Phase 3-1 baseline.** Branch `feat/finance-ops-runtime` at a descendant of `3c60d9ff` per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §2.1.
- [ ] **Phase 3-2 migrations applied to staging.** At minimum 168 (`finance` schema + 8 tables including `finance.adapter_jobs`), 169 (`finance.audit_events` append-only triggers), 170 (`finance.projection_state`), and 171 (RLS policies on all 9 tables + no-hard-delete triggers) — so the adapter worker's `service_role` reads/writes against `finance.adapter_jobs` and `finance.audit_events` succeed. Per [`staging-migration-application-log.md`](./staging-migration-application-log.md).
- [ ] **Phase 3-3 verification execution.** §4.1 (PostgREST exclusion), §4.2 (`auth.role()` from worker connection), §4.3.a (scratch-table RLS rehearsal), and §4.4.a (RLS catalog inventory) all PASS in staging. Per [`staging-rls-verification-results.md`](./staging-rls-verification-results.md).
- [ ] **Phase 3-4 worker apps deployed disabled.** The projection worker is already covered by Phase 3-4 / 3-5. The adapter worker requires either creating a new Coolify app `staging-finance-adapter-worker` on VPS-1 (Coolify server UUID `f7uzrwlbqjtx6qamppma5xsz`) from the Slice 2C-added YAML service block in [`deploy/coolify/finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml), OR confirming an already-created app is in the disabled-and-idling state. In either case the three enable flags must be unset/`'false'`; `FINANCE_CONTROLLED_TENANT_IDS` empty; `FINANCE_PROVIDER_WRITES_ENABLED=false`; `FINANCE_ADAPTER_MODE=draft_only`; the container reports `running` (and `unhealthy` is acceptable while disabled per [`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) §8.2, carried over from the projection worker pattern); the single log line `[finance-adapter-worker] disabled — idling` is present.
- [ ] **Slice 2A landed.** ERPNext sandbox adapter exists at `backend/lib/finance/accountingAdapters/erpnextSandboxAdapter.js` and exports `createErpnextSandboxAdapter`; provider payload boundary at `backend/lib/finance/accountingAdapters/providerPayloadBuilder.js` exports `buildProviderPayload` and `assertNoInternalMetadata`. Verified by commit `27ae09fc`.
- [ ] **Slice 2B landed.** Adapter job processor exists at `backend/lib/finance/adapterJobProcessor.js` and exports `runAdapterPollCycle` with the §4.2 contract `{ pool, adapters, tenantIds, eventStore, now, buildProviderPayload, backoffOpts, providerWritesEnabled }`; promoter exists at `backend/lib/finance/adapterJobPromoter.js` and exports `promoteLinkedAdapterJobs`; `approveFinanceAction()` in `backend/lib/finance/financeDomainService.js` invokes the promoter on the `draft → queued` transition. Verified by commits `e66538f0`, `d671d816`, `1d2b41e6`.
- [ ] **Slice 2C landed.** `finance-adapter-worker` process shell exists at `backend/workers/financeAdapterWorker.js` with the three-tier gate, entry block, and `worker:finance-adapter` npm script registered in `backend/package.json`. The staging YAML service block exists in [`deploy/coolify/finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml). Verified by commit `95f65144`.
- [ ] **Slice 2D landed.** End-to-end integration proof exists at `backend/__tests__/lib/finance/projections/adapterQueueProjection.integration.test.js` and proves the full lifecycle locally with mocked HTTP. Verified by commit `af8f71bc`.
- [ ] **Doppler `stg_stg` secrets present.** `FINANCE_DB_URL` (or `DATABASE_URL`) pointing at the staging Supabase project, and `DOPPLER_TOKEN` for the worker app's service account. These are needed for the worker process to **boot at all**, not just to run — the entry block at `backend/workers/financeAdapterWorker.js:439-453` exits the process if neither DB URL var is set, **before** the disabled gate runs.
- [ ] **ERPNext sandbox endpoint reachable from VPS-1.** A sandbox or local ERPNext instance must exist and be reachable from VPS-1's network position (either a self-hosted instance on the AiSHA network, a `*.local` instance reachable via VPS-1's DNS, or a `sandbox.*` instance reachable over the public internet). 3-9 itself does NOT make an HTTP call against this endpoint — Phase 3-10 §6 step 3 is the first `checkHealth()` call — but the worker's adapter-registration log at boot proves the constructor accepted the base URL against the sandbox allowlist. If the endpoint is unreachable, that becomes a Phase 3-10 problem, not a 3-9 blocker.
- [ ] **Backend `ENABLE_FINANCE_OPS` unset on `staging-backend-heavy`.** The backend's route mount and Phase 3-7 are out of 3-9 scope; do not pre-emptively flip the backend's env to advance Phase 3-7. The worker's `ENABLE_FINANCE_OPS` (on the worker app) is independent of the backend's (on the backend app).
- [ ] **`ENABLE_FINANCE_PERSISTENT_EVENTS` unset on `staging-backend-heavy`.** The Slice 1 fail-closed route-mount guard at `backend/routes/finance.v2.js:48` makes the backend refuse to start with this flag true; Slice 2 (as a whole) builds the adapter runtime but does NOT lift this route-mount guard — that's a separate later slice. The worker does **not** read this flag (`buildProjectionRunner()` and the adapter worker's event-store wiring at `backend/workers/financeAdapterWorker.js:519-520` unconditionally use `createFinancePgEventStore`). Keep it unset on both apps for environment-parity clarity.
- [ ] **No production action.** `prd_prd` Doppler config is not opened; Hetzner is not touched; no production tenant is queried.

If any prerequisite fails, **halt** 3-9 and remediate before continuing. None of these checks mutates anything; they confirm the state required for the activation to be meaningful.

---

## 4. Activation envelope — what changes vs what does not

3-9 is intentionally minimal but slightly broader than 3-5 because the adapter worker has additional safety knobs the projection worker doesn't. The complete diff between "before 3-9" and "after 3-9" is six to nine env-var values on **one** Coolify app (`staging-finance-adapter-worker`).

| Env var (worker app `staging-finance-adapter-worker`)  | Before 3-9                      | After 3-9                                                                                                                                                                                                       |
| ------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENABLE_FINANCE_OPS`                                   | unset (or any value ≠ `'true'`) | `true` — tier 1 of the three-tier worker gate. Note: this is set on the **adapter worker app**, independent of the **backend app**'s `ENABLE_FINANCE_OPS` (route mount, Phase 3-7) and of the **projection worker app**'s `ENABLE_FINANCE_OPS` (Phase 3-5). |
| `ENABLE_FINANCE_WORKERS`                               | unset                           | `true` — tier 2 of the three-tier gate. Master switch for the whole worker tier on this app.                                                                                                                    |
| `ENABLE_FINANCE_ADAPTER_WORKER`                        | unset                           | `true` — tier 3, the per-worker flag for the adapter worker (analogous to `ENABLE_FINANCE_PROJECTION_WORKER` on the projection worker app).                                                                     |
| `FINANCE_CONTROLLED_TENANT_IDS`                        | `""` (empty)                    | `a11dfb63-4b18-4eb8-872e-747af2e37c46` — the single controlled staging tenant UUID per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3.                                         |
| `FINANCE_ERPNEXT_BASE_URL`                             | `""` (empty)                    | Sandbox URL, e.g. `https://sandbox.aishacrm.com:8443` or `http://erpnext.local:8000`. Must match a built-in sandbox pattern (localhost / `*.local` / `sandbox.*`) OR appear in `FINANCE_ERPNEXT_SANDBOX_BASE_URLS`. Constructor rejects anything else (`erpnextSandboxAdapter.js:89-128`). |
| `FINANCE_ERPNEXT_API_KEY`                              | `""` (empty)                    | Sandbox ERPNext API key. **Sandbox credential only.** Generated against the sandbox ERPNext user, not any production ERPNext instance.                                                                          |
| `FINANCE_ERPNEXT_API_SECRET`                           | `""` (empty)                    | Sandbox ERPNext API secret. **Sandbox credential only.** Stored in Doppler `stg_stg` (encrypted at rest); never committed to git, never referenced from `prd_prd`.                                              |
| `FINANCE_ERPNEXT_SANDBOX_BASE_URLS` (optional)         | `""` (empty)                    | Comma-separated explicit FQDN allowlist beyond the built-in `localhost` / `*.local` / `sandbox.*` patterns. Set ONLY if the sandbox endpoint sits at an FQDN those patterns don't match.                       |

**Sandbox / draft-only safety gates stay at their safest default.** These are NOT changed by 3-9 — they remain at the values Slice 2C set in the YAML:

| Env var                              | Posture for 3-9             | Reason                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FINANCE_PROVIDER_WRITES_ENABLED`    | `false` (unset)             | Code-side kill switch per `slice-2-adapter-runtime-design.md` §4.6. When `false`, the processor skips the adapter HTTP call entirely and records the job as `dry_run: true` succeeded. The 3-9 activation runs with the kill switch closed — the worker is alive and ready, but cannot make a provider write even if a job appears. The one-time flip is Phase 3-10 §6 step 6 only. |
| `FINANCE_ADAPTER_MODE`               | `draft_only`                | Mode-side guard per §4.6. With `draft_only`, `assertWritePermitted` permits `push_draft` and blocks every finalising op (`pushFinal`, `voidRecord`, `reconcile`). The ERPNext sandbox adapter's `pushDraft` always sets `docstatus: 0` and never calls submit. 3-9 does not promote to `approval_required_write` or any other mode. |

**Nothing else changes.** The following are explicitly **unchanged** by 3-9:

| Env var / app                                                                  | 3-9 posture                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENABLE_FINANCE_OPS` / `ENABLE_FINANCE_WORKERS` / `ENABLE_FINANCE_PROJECTION_WORKER` on `staging-finance-projection-worker` | **Unchanged.** Projection worker activation is Phase 3-5 (separate app, separate runbook, separate authorization).                                                                                                                                                                                                                     |
| `ENABLE_FINANCE_OPS` on `staging-backend-heavy`                                | **Unchanged** (unset). Backend route mount is Phase 3-7. 3-9 does not pre-stage the backend.                                                                                                                                                                                                                                            |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` (any app)                                   | **Unchanged** (unset / false). The adapter worker doesn't read it; the backend route refuses to start with it true (`backend/routes/finance.v2.js:48`). Lifting that guard is a separate later slice.                                                                                                                                  |
| `financeOps` module flag for `a11dfb63-4b18-4eb8-872e-747af2e37c46`            | **Unchanged** (unset). The module flag gates **route requests**, not worker poll loops — the adapter worker reads `finance.adapter_jobs` directly via `service_role` connection. Module flag flip is Phase 3-7's prerequisite for tenant access on the route.                                                                          |
| `financeOps` module flag for any other tenant                                  | **Unchanged** (unset). Per [`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) §2: "one tenant only" is structurally enforced by setting `financeOps` for exactly one `tenant_id`. 3-9 doesn't even touch this flag for the one controlled tenant; 3-7 will.                                                        |
| `tenant_integrations` row for the controlled tenant with ERPNext credentials   | **Unchanged.** The Slice 2C worker entry block reads ERPNext credentials from process env (`FINANCE_ERPNEXT_*`), not from `tenant_integrations`. Per-tenant credential routing via `tenant_integrations.api_credentials` is a future packet; 3-9 + 3-10 run against a single process-wide sandbox configuration.                       |
| Staging migrations                                                             | **Unchanged.** No migration applied by 3-9.                                                                                                                                                                                                                                                                                             |
| Production env (Hetzner, `prd_prd` Doppler, production tenants)                | **Unchanged.** Never in any Phase 3 packet's scope.                                                                                                                                                                                                                                                                                     |

---

## 5. Dry-run activation sequence (the env changes the operator WOULD make — NOT executed by this task)

The operator runs these steps in order, in staging only. **None of them ran by this Phase 3-9 task.** Each step lists prerequisites, the exact env-var change, expected outcome, and rollback for that step.

### 5.1 Preflight (no mutation)

- [ ] Re-confirm every item in §3 is still true. If anything has drifted (`git status` shows uncommitted changes, the worker app is no longer `running`, `ENABLE_FINANCE_PERSISTENT_EVENTS` got set somewhere, etc.), halt and remediate.
- [ ] Confirm VPS-1 utilization is normal via `ssh andreibyf@147.189.173.237 'top -bn1 | head -5'` — the adapter worker activation adds a poll loop plus an idle ERPNext sandbox adapter; load should be minimal. The 2026-05-10 incident is the reason this check is in every Phase 3 packet.
- [ ] Confirm the controlled tenant `tenant_id` `a11dfb63-4b18-4eb8-872e-747af2e37c46` is still the chosen staging tenant per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3. If it changed, update 3-1 first.
- [ ] Confirm the projection worker (Phase 3-5) is healthy on its own Coolify app. The adapter worker activation does not depend on the projection worker being enabled, but if 3-5 is in a broken state that's worth knowing before stacking 3-9 on top.
- [ ] Confirm the ERPNext sandbox endpoint chosen for `FINANCE_ERPNEXT_BASE_URL` matches a built-in sandbox pattern OR is enumerated in the planned `FINANCE_ERPNEXT_SANDBOX_BASE_URLS` value. If the endpoint is at e.g. `https://erpnext-staging.example.com:8443` (no `sandbox.` prefix, not `*.local`), the explicit allowlist MUST list `erpnext-staging.example.com:8443` — otherwise the adapter constructor will throw `AdapterConfigError` at worker boot and the registration log line will be `[finance-adapter-worker] failed to register erpnext sandbox adapter — continuing with empty registry`.
- [ ] Confirm no production action is implied: `prd_prd` Doppler config is not opened, Hetzner backend (`backend.aishacrm.com`) is not touched, production ERPNext is not contacted.

### 5.2 Update the worker app env (Coolify UI / API)

In Coolify (control plane on VPS-2, targeting the `staging-finance-adapter-worker` app on VPS-1 server UUID `f7uzrwlbqjtx6qamppma5xsz`), open the app's environment editor and set the values per §4:

```
ENABLE_FINANCE_OPS=true
ENABLE_FINANCE_WORKERS=true
ENABLE_FINANCE_ADAPTER_WORKER=true
FINANCE_CONTROLLED_TENANT_IDS=a11dfb63-4b18-4eb8-872e-747af2e37c46
FINANCE_ERPNEXT_BASE_URL=<sandbox URL — see §4>
FINANCE_ERPNEXT_API_KEY=<sandbox API key from Doppler stg_stg>
FINANCE_ERPNEXT_API_SECRET=<sandbox API secret from Doppler stg_stg>
# Optional, only if the base URL doesn't match a built-in pattern:
FINANCE_ERPNEXT_SANDBOX_BASE_URLS=<comma-separated FQDN allowlist>
```

**LEAVE THESE AT THEIR SAFEST VALUES — DO NOT SET ANYTHING ELSE:**

```
FINANCE_PROVIDER_WRITES_ENABLED=false   # ← MUST stay false; Phase 3-10 §6 step 6 is the only authorized flip
FINANCE_ADAPTER_MODE=draft_only         # ← MUST stay draft_only
```

**Strict-equality reminder** (matches `isFinanceAdapterWorkerEnabled()` at `backend/workers/financeAdapterWorker.js:116-122`): the three enable flags must be the literal lowercase string `'true'`. Anything else — `'TRUE'`, `'1'`, the boolean `true`, the string `'yes'` — leaves the gate closed. This prevents accidental enablement from typos / coerced values.

**Tenant-id reminder** (matches `parseControlledTenantIds()` in `backend/lib/finance/financeWorkerCommon.js`, re-exported at `backend/workers/financeAdapterWorker.js:132`): `FINANCE_CONTROLLED_TENANT_IDS` is comma-separated, whitespace tolerated, trailing commas tolerated. Empty / unset / whitespace-only ⇒ `[]` ⇒ poll cycle iterates zero tenants. **There is no implicit "all tenants" fall-through.** A typo in the tenant UUID becomes an empty-array silent no-op, not a wide-open processing of every tenant. The §8 verification reads the worker logs to confirm the configured-tenant-count is `1`.

**ERPNext credentials reminder.** The worker entry block at `backend/workers/financeAdapterWorker.js:484-516` registers the ERPNext sandbox adapter ONLY when all three of `FINANCE_ERPNEXT_BASE_URL`, `FINANCE_ERPNEXT_API_KEY`, `FINANCE_ERPNEXT_API_SECRET` are set. If any one is missing, the worker logs `[finance-adapter-worker] erpnext credentials not configured — provider not registered (worker will skip erpnext jobs)` and boots with an empty adapter registry. That is a stop condition for 3-9 — the activation hasn't fully succeeded if ERPNext isn't registered.

**Rollback for 5.2:** revert any of the four core env vars (the three enable flags or `FINANCE_CONTROLLED_TENANT_IDS`) to its pre-3-9 value (cleanest: unset `ENABLE_FINANCE_ADAPTER_WORKER` or set it `false`) and redeploy. Per §9. Clearing the ERPNext credentials does not disable the worker — it just leaves the adapter registry empty, so the worker is alive but cannot service erpnext jobs.

### 5.3 Redeploy the worker app

Trigger a Coolify redeploy on `staging-finance-adapter-worker` so the container restarts with the new env. Coolify will:

1. Stop the existing container (which was idling in the disabled state).
2. Pull the existing image (the image itself is unchanged; only the env block differs).
3. Start a fresh container with the new env block.

The new container goes through the boot sequence in §6, but this time the three-tier gate is satisfied, so the worker proceeds to start its poll loop and register the ERPNext adapter instead of returning the idle stub.

**Rollback for 5.3:** same as 5.2 — flip a flag and redeploy. No DB rollback, no migration rollback, no code revert.

### 5.4 Do NOT touch other apps in 3-9

The backend `staging-backend-heavy` env is **not** modified. The `financeOps` module flag for the controlled tenant is **not** flipped. The projection worker app `staging-finance-projection-worker` is **not** modified. Those are all separate packets (3-7 for the backend route, 3-5 for the projection worker). Pre-emptively bundling them collapses the isolated-worker-config-failure signal that 3-9 is designed to give.

### 5.5 Do NOT flip `FINANCE_PROVIDER_WRITES_ENABLED` in 3-9

The activation runs with `FINANCE_PROVIDER_WRITES_ENABLED=false`. This means: even if a queued adapter_job somehow exists at activation time, the processor will record it as `dry_run: true` succeeded and emit `finance.adapter.sync_succeeded` with `provider_id: null` — **no HTTP call to ERPNext is made**. That's the correct 3-9 behavior. Phase 3-10 §6 step 6 is the only authorized place to flip this flag, against the sandbox endpoint only, reverted immediately after the proof step completes.

---

## 6. Expected worker behavior after activation

After §5 completes, the worker container reaches **healthy enabled idle** state. The full sequence:

### 6.1 Boot and gate-satisfied path

1. Container starts.
2. Entry block at `backend/workers/financeAdapterWorker.js:439-516` reads `FINANCE_DB_URL || DATABASE_URL` (Doppler-injected); constructs `pg.Pool` (lazy — no TCP connection yet); reads `FINANCE_ERPNEXT_BASE_URL` / `_API_KEY` / `_API_SECRET` / `_SANDBOX_BASE_URLS`.
3. **Adapter registration.** If all three ERPNext credential env vars are set, the entry block lazy-imports `createErpnextSandboxAdapter` from `backend/lib/finance/accountingAdapters/erpnextSandboxAdapter.js`, constructs the adapter, and registers it under the `'erpnext'` provider slot in the adapters Map. The constructor validates `baseUrl` against `BUILTIN_SANDBOX_HOST_PATTERNS` + the explicit allowlist (`erpnextSandboxAdapter.js:89-128`); a non-sandbox URL throws `AdapterConfigError` at this point. On success: `[finance-adapter-worker] registered erpnext sandbox adapter` with structured fields `provider: 'erpnext'` and `base_url: <FINANCE_ERPNEXT_BASE_URL>`. On constructor failure: `[finance-adapter-worker] failed to register erpnext sandbox adapter — continuing with empty registry` with structured `error` + `code`. If any of the three credential env vars is missing: `[finance-adapter-worker] erpnext credentials not configured — provider not registered (worker will skip erpnext jobs)` (this is a stop condition for 3-9 — see §11).
4. Event store wiring: `createFinancePgEventStore({ pool })` from `backend/lib/finance/financeEventStore.pg.js`.
5. `parseControlledTenantIds()` returns `['a11dfb63-4b18-4eb8-872e-747af2e37c46']` — array length 1.
6. `startFinanceAdapterWorker({ pool, adapters, eventStore, tenantIds })` is called.
7. `isFinanceAdapterWorkerEnabled()` returns `true` (all three gates satisfied).
8. Worker logs `[finance-adapter-worker] starting finance adapter worker` with structured fields `poll_interval_ms: 5000` (default), `tenant_count: 1`, `adapter_count: 1` (assuming ERPNext registered successfully).
9. Worker writes an initial heartbeat with `status: 'starting'`, `poll_interval_ms`, `tenant_count`, `adapter_count` to `/tmp/finance-adapter-worker-heartbeat.json`.
10. `setImmediate(runCycle)` queues the first poll cycle.

### 6.2 First and subsequent poll cycles

Each cycle calls `runAdapterPollCycle({ pool, adapters, tenantIds, eventStore, now })` from Slice 2B's `backend/lib/finance/adapterJobProcessor.js`. For the controlled tenant:

1. Processor runs a per-tenant single-row claim via `SELECT ... FROM finance.adapter_jobs WHERE tenant_id = $1 AND status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= now()) FOR UPDATE SKIP LOCKED LIMIT 1 → UPDATE status = 'running'` (in persistent mode — `slice-2-adapter-runtime-design.md` §4.1).
2. **At this point the result set is expected to be empty.** Reason: no `finance.adapter_jobs` rows in `status = 'queued'` exist for the controlled tenant yet. Reaching `queued` requires:
   - The backend route to be mounted (`ENABLE_FINANCE_OPS=true` on `staging-backend-heavy`) — that's Phase 3-7.
   - The backend to call `simulateDealWon()` (which creates an adapter_job in `status = 'draft'`) — that requires a route call to `/api/v2/finance/simulate/deal-won` from the controlled tenant.
   - Someone to call `approveFinanceAction()` (which promotes the linked adapter_job `draft → queued` and emits `finance.adapter.sync_queued`) — that also requires the route mounted and tenant module flag flipped.
   - Slice 2 to lift the `ENABLE_FINANCE_PERSISTENT_EVENTS` fail-closed guard so the route can actually persist events through the existing in-memory `financeDomainService` — that's a separate later slice, not part of Slice 2's adapter-runtime build-out.

   So during the 3-9 steady state, `finance.adapter_jobs` is empty for the controlled tenant and `runAdapterPollCycle` consistently returns `{ claimed_count: 0, succeeded_count: 0, failed_count: 0, skipped_count: 0, summary: [] }`.

3. Cycle complete: worker logs `[finance-adapter-worker] poll cycle complete` with `tenant_count: 1, claimed_count: 0, succeeded_count: 0, failed_count: 0, skipped_count: 0` (the typical 3-9 steady-state numbers).
4. Worker writes a heartbeat update with the same fields to `/tmp/finance-adapter-worker-heartbeat.json`. **The healthcheck transitions from `unhealthy` (the disabled-state limitation carried over from Phase 3-4 §8.2) to `healthy`** — heartbeat file present and freshly written, `mtime` well within the 45 s recency threshold.
5. `setTimeout(runCycle, 5000)` schedules the next cycle (default `FINANCE_ADAPTER_WORKER_POLL_MS` or `FINANCE_WORKER_POLL_INTERVAL_MS` fallback).

### 6.3 What does NOT happen in 3-9 steady state

- **No provider HTTP write.** `FINANCE_PROVIDER_WRITES_ENABLED=false` is the code-side kill switch (the §4.6 layer that lives in the processor at `backend/lib/finance/adapterJobProcessor.js:332-345`). Even if a queued job somehow existed, the processor's `writesEnabled` check would record `dry_run: true` succeeded with `provider_id: null` and emit `sync_succeeded` — the adapter's `pushDraft` method is never invoked, no `httpClient.post()` call is made against the sandbox endpoint, no ERPNext document is created.
- **No adapter execution against ERPNext sandbox.** The ERPNext sandbox adapter is registered and ready, but the kill switch prevents any actual call. The `httpClient` is constructed during adapter registration but never invoked during 3-9.
- **No `finance.adapter_jobs` mutations.** With zero queued rows, no `UPDATE` SQL runs.
- **No `finance.audit_events` writes.** With no queued jobs, no `sync_queued` / `sync_succeeded` / `sync_failed` events are emitted by 3-9 itself. (The Slice 1 invariant on the backend side — that the route is the only writer — also holds: route is unmounted, so no upstream `finance.draft.created` / `finance.approval.requested` / `finance.approval.approved` events are written either.)
- **No journal mutations.** The processor's path is gated on a queued `adapter_job` existing, which it doesn't. The journal-stays-at-`pending_approval` invariant from Phase 3-8 §5.7 is preserved trivially.
- **No `finance.projection_state` writes.** The adapter worker doesn't drive projections (that's the projection worker's job in Phase 3-5); the projection worker, on its own poll loop, sees the same empty `finance.audit_events` stream and writes nothing either.
- **No backend route activity.** `/api/v2/finance/*` returns `404` (route unmounted; Phase 3-7).
- **No tenant-facing change.** The controlled tenant's `financeOps` module flag is still unset; even if the route were mounted, the module gate would reject every request from that tenant.

---

## 7. Health, log, and heartbeat expectations after activation

Three surfaces are observable, mirroring the projection worker's Phase 3-5 pattern (the adapter worker uses the same `financeWorkerCommon.js` helpers).

### 7.1 Container liveness (Coolify built-in)

| When           | Expected                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| Before 5.3     | `running`                                                                                 |
| After 5.3 boot | `running` (unchanged — the container restarts but stays alive throughout the redeploy)    |

### 7.2 Heartbeat-file healthcheck (Docker `HEALTHCHECK`)

| When           | Expected                                                                                                                                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before 5.3     | `unhealthy` — acceptable while disabled per the carried-over Phase 3-4 §8.2 limitation. The disabled return path at `backend/workers/financeAdapterWorker.js:255-269` does not write a heartbeat.                                                                                                                                |
| After 5.3 boot | First poll-cycle completes → heartbeat file written → Docker healthcheck **transitions to `healthy`** within one cycle (≤ 5 s + healthcheck interval). This transition is the primary "the worker enabled successfully" signal an operator should look for.                                                                       |
| Steady state   | `healthy` — heartbeat refreshed on every poll cycle (default 5 s); `mtime` recency threshold is 45 s (3 × default `FINANCE_WORKER_HEARTBEAT_MS=15000`), so even a one-poll-cycle delay does not trip the check. If the healthcheck flips to `unhealthy` post-activation, the worker is stuck or crash-looping — investigate via logs. |

**Disabled-state heartbeat limitation, carried over from Phase 3-4 §8.2 and applied to the adapter worker the same way** — if 3-9 is rolled back (§9), the worker returns to the disabled state and the heartbeat-file healthcheck will flip back to `unhealthy`. That `unhealthy` is the expected rollback state, not a new failure. Same follow-up tracked for both workers (a one-time `writeWorkerHeartbeat({ status: 'disabled' })` on the idle return path), **not a 3-9 blocker**.

### 7.3 Pino log lines (the operational signal)

The activation produces these new log lines, in order:

1. `[finance-adapter-worker] registered erpnext sandbox adapter` with structured `provider: 'erpnext'` and `base_url: <FINANCE_ERPNEXT_BASE_URL>` — confirms the adapter constructor accepted the sandbox URL and the credentials wire correctly. **If you see this line, the §5.2 ERPNext env vars were set and the URL passed the sandbox-allowlist guard.**
2. `[finance-adapter-worker] starting finance adapter worker` (once at startup) — structured `poll_interval_ms`, `tenant_count`, `adapter_count`. Confirms the three-tier gate is satisfied. **If you see this line, §5.2's flag flips reached the process.**
3. `[finance-adapter-worker] poll cycle complete` (once per poll cycle, ~every 5 s) — structured `tenant_count: 1`, `claimed_count: 0`, `succeeded_count: 0`, `failed_count: 0`, `skipped_count: 0`. **`tenant_count: 1` confirms `FINANCE_CONTROLLED_TENANT_IDS` parsed as expected; any other value means the env var is mis-set. The four counters all `0` confirms the steady-state expectation in §6.2.**
4. **If any counter is > 0** in any cycle, jobs are being processed — which in 3-9 (before 3-7 / Slice 2's route-side persistent-events lift) would indicate either pre-existing dev/seed data in `finance.adapter_jobs` or some path I haven't accounted for. Worth investigating, not failing.

**Error log lines that would indicate trouble** (none expected in 3-9 steady-state):

- `[finance-adapter-worker] failed to register erpnext sandbox adapter — continuing with empty registry` — adapter constructor threw, likely a non-sandbox base URL or a missing field. Halt; the worker is alive but cannot service erpnext jobs. Stop condition per §11.
- `[finance-adapter-worker] erpnext credentials not configured — provider not registered` — one or more of the three credential env vars is missing. Same stop condition.
- `[finance-adapter-worker] cannot start without { pool, eventStore } wiring` — DB pool or event store construction failed. Halt; check `FINANCE_DB_URL`.
- `[finance-adapter-worker] poll cycle crashed` — defense-in-depth catch around the cycle (`backend/workers/financeAdapterWorker.js:371-385`). Investigate immediately; this catches programming errors in the Slice 2B processor or unhandled exceptions in the adapter.
- `[finance-adapter-worker] enabled but no FINANCE_CONTROLLED_TENANT_IDS configured — poll cycles will be no-ops` — the env-var flip was incomplete (`ENABLE_FINANCE_ADAPTER_WORKER=true` but `FINANCE_CONTROLLED_TENANT_IDS=` still empty). Set the tenant id and redeploy.

### 7.4 Alerting

Phase 3-9 doesn't add new alert rules. The Uptime Kuma / Coolify status surfaces continue to read the heartbeat-file healthcheck. Adding adapter-worker-specific alerting (queue depth, sync failure rate, dead-letter count) is part of the Phase 3-11 observability follow-up ([`observability-alerting.md`](./observability-alerting.md), 2C-11), not 3-9 itself. Per `slice-2-adapter-runtime-design.md` §4.9 the observability signals 5 (adapter sync failure rate) and 6 (dead-letter count) become measurable now that the adapter worker exists; wiring those into Uptime Kuma is a separate Phase 3-11 follow-up.

---

## 8. Verification commands (operator instructions only — NOT executed by this task)

After §5 completes, the operator runs these checks in order. **None ran by this 3-9 task.** Capture every output as evidence per §13.

### 8.1 Container and healthcheck status

```bash
ssh andreibyf@147.189.173.237 'docker ps --filter "name=staging-finance-adapter-worker" --format "{{.Status}}"'
```

**Pass:** output starts with `Up <duration>` and ends with `(healthy)` once the first cycle has completed. **Fail (or timeout to healthy >> 60 s):** investigate via logs (§8.2).

### 8.2 Log lines confirm enabled + tenant-configured + adapter-registered

```bash
ssh andreibyf@147.189.173.237 'docker logs --tail 100 staging-finance-adapter-worker'
```

**Pass:** logs contain (in order):
1. `[finance-adapter-worker] registered erpnext sandbox adapter` with `provider: 'erpnext'` and the expected `base_url`.
2. `[finance-adapter-worker] starting finance adapter worker` with `tenant_count: 1`, `adapter_count: 1`.
3. One or more `[finance-adapter-worker] poll cycle complete` lines reporting `tenant_count: 1`, all four counters at `0`.

**Fail:** any of the §7.3 error log lines, or any line containing `disabled — idling` (means the gate isn't satisfied — go back and verify the three enable flags per §4 are the literal string `'true'`), or `adapter_count: 0` (means ERPNext registration failed — check §7.3 error lines for the registration-failure or credentials-not-configured message), or the steady-state cycle reports nonzero `claimed_count` (means jobs are flowing that shouldn't be in 3-9 — investigate).

### 8.3 Heartbeat file present and fresh (read from inside the container)

```bash
ssh andreibyf@147.189.173.237 'docker exec staging-finance-adapter-worker cat /tmp/finance-adapter-worker-heartbeat.json'
ssh andreibyf@147.189.173.237 'docker exec staging-finance-adapter-worker stat /tmp/finance-adapter-worker-heartbeat.json'
```

**Pass:** file contains valid JSON with `worker: "finance-adapter-worker"`, `tenant_count: 1`, `claimed_count: 0`, `succeeded_count: 0`, `failed_count: 0`, `skipped_count: 0`, `pid: <number>`, `updated_at` within the last 60 s. **Fail:** file absent, JSON malformed, `tenant_count` ≠ 1, any counter nonzero, or `updated_at` older than 60 s.

### 8.4 No new `finance.adapter_jobs` rows (because the upstream route is still unmounted)

From the staging Supabase SQL editor (service_role):

```sql
select status, count(*) as n
from finance.adapter_jobs
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
group by status
order by status;
```

**Pass:** zero rows OR only rows in `status = 'draft'` (which means pre-existing dev/seed data — record the pre- and post-activation counts; they should be equal). **Fail:** any row appearing in `status = 'queued'` / `'running'` / `'succeeded'` / `'failed'` that wasn't there pre-3-9. The route is still unmounted; new queued rows shouldn't materialize.

### 8.5 No new `finance.audit_events` rows for the controlled tenant

From the staging Supabase SQL editor (service_role):

```sql
select event_type, count(*) as n
from finance.audit_events
where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  and event_type like 'finance.adapter.%'
group by event_type
order by event_type;
```

**Pass:** zero rows for any `finance.adapter.*` event (the adapter worker would be the producer of `sync_succeeded` / `sync_failed`; the promoter on the backend side would be the producer of `sync_queued` — neither runs in 3-9). **Fail:** any `sync_queued` row (route is unmounted, so the promoter cannot have run) or any `sync_succeeded` / `sync_failed` row (the worker ran the processor against a queued job — investigate which job + why).

### 8.6 ERPNext sandbox endpoint NOT contacted

From the operator's local machine or the sandbox ERPNext admin console, confirm no API calls have arrived from the worker:

- Check the sandbox ERPNext server's access log for entries from the worker's source IP / API key. Pass: no entries during the 3-9 activation window.
- Check the sandbox ERPNext for any newly-created `Journal Entry` or `Account` docs. Pass: none created during the 3-9 window.

**Fail:** any API request from the worker, any new ERPNext doc — `FINANCE_PROVIDER_WRITES_ENABLED` was somehow set to `true` and the processor made a call; halt and verify.

### 8.7 No production action confirmation

```bash
# Verify no Hetzner backend change
ssh root@178.156.140.86 'docker ps --filter "name=backend" --format "{{.Status}}"' 2>/dev/null \
  || echo "Hetzner access not opened — expected, production is out of scope"
```

**Pass:** either the SSH connection isn't open (expected; we don't open production for 3-9) OR if it is, the backend container shows no recent restart triggered by anything 3-9 did.

---

## 9. Disabled-state and rollback behavior

Phase 3-9 rollback is **config-only**. No code revert, no schema rollback, no data migration, no Coolify app recreation.

### 9.1 Rollback to the Phase 3-4 disabled state (adapter worker)

The cleanest rollback: unset `ENABLE_FINANCE_ADAPTER_WORKER` (or set it to anything other than the literal string `'true'`) on the `staging-finance-adapter-worker` Coolify app, and redeploy.

What happens on the next container start:

1. The container boots, reads `FINANCE_DB_URL`, constructs the `pg.Pool` (no TCP connection — lazy).
2. `isFinanceAdapterWorkerEnabled()` returns `false` because tier 3 is now unsatisfied.
3. Worker logs `[finance-adapter-worker] disabled — idling` and returns an idle stub.
4. Heartbeat file is **not** written (the carried-over limitation from Phase 3-4 §8.2); the heartbeat file from before the redeploy ages out within 45 s; Docker healthcheck flips back to `unhealthy`. **`unhealthy` is the expected rollback state**, matching the Phase 3-4 disabled-and-idling posture.
5. Operator differentiates "rolled back correctly" from "unexpectedly failed" by reading the `disabled — idling` log line and confirming the env-var flip in Coolify.

**No data is lost or corrupted.** `finance.adapter_jobs` is untouched (the worker is a pure reader+writer of it via the optimistic-lock claim; with zero queued rows during 3-9 there was nothing to mutate). `finance.audit_events` is untouched (no `sync_*` events emitted during 3-9). The sandbox ERPNext endpoint is untouched (no HTTP write occurred).

### 9.2 Coarser rollback options

If the per-worker flag is unreliable for some reason, the broader rollback options work the same way:

- **Worker-tier rollback:** unset `ENABLE_FINANCE_WORKERS`. Same effect for the adapter worker; would also disable any future workers sharing the worker tier on this app.
- **Whole-Finance-Ops rollback (worker side):** unset `ENABLE_FINANCE_OPS` on the worker app. Tier 1 fails; same effect on the worker. Does **not** affect the backend's `ENABLE_FINANCE_OPS` (different app, different env block) or the projection worker's (different app, different env block).
- **Tenant-list rollback (no flag change):** clear `FINANCE_CONTROLLED_TENANT_IDS` to `""`. The worker stays enabled but processes zero tenants — poll cycles iterate the empty array, heartbeat is still written on every cycle, log line shows `tenant_count: 0`. Healthcheck stays `healthy`. Useful for "pause processing without flipping enable flags" if you want to preserve the enabled state for a quick re-enable.
- **Credentials-only rollback:** clear `FINANCE_ERPNEXT_BASE_URL` / `_API_KEY` / `_API_SECRET`. The worker stays enabled and continues poll cycles, but the adapter registry becomes empty and any queued erpnext job is skipped at the processor's `adapters.get('erpnext')` lookup. Useful for "disable ERPNext specifically without disabling the worker entirely."

### 9.3 Removing the worker entirely

If 3-9 was a mistake and the worker app should not exist at all, delete the Coolify app — that returns to the state before Slice 2C's YAML was used to create the app (i.e., the pre-Slice-2 state). No DB rollback; `finance.adapter_jobs` and `finance.audit_events` are untouched; no provider write was ever made.

### 9.4 Rollback is config-only

- **No code revert required.** All Phase 3 activation is environment-variable driven on top of code already merged and verified at the Phase 3 baseline `3c60d9ff` + the Slice 2 commits (`27ae09fc`, `e66538f0`, `d671d816`, `1d2b41e6`, `95f65144`, `af8f71bc`). A Phase 3-9 rollback does not require reverting any commit.
- **No schema rollback required.** No migration was applied by 3-9; rolling back the worker doesn't roll back migrations 168/169/170/171.
- **No customer impact.** No tenant-facing surface was activated by 3-9 (the route is still unmounted; the module flag is still unset; no ERPNext write occurred). Rollback affects only the worker's poll loop on staging.

---

## 10. Stop conditions

Phase 3-9 stop conditions are the subset of the Phase 3 scaffold stop conditions ([`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §10.3) plus adapter-specific conditions. Any of the following triggers an immediate halt; rollback per §9.

- Worker fails to reach `[finance-adapter-worker] starting finance adapter worker` after §5.3 redeploy — the three-tier gate is not satisfied; verify §5.2 env-var literal-string `'true'` semantics.
- Worker logs `[finance-adapter-worker] failed to register erpnext sandbox adapter — continuing with empty registry` — adapter constructor threw. Halt; check the `error` and `code` structured fields. Most common cause: non-sandbox `FINANCE_ERPNEXT_BASE_URL` rejected by the URL guard; verify the sandbox-allowlist patterns.
- Worker logs `[finance-adapter-worker] erpnext credentials not configured — provider not registered (worker will skip erpnext jobs)` — one or more of the three `FINANCE_ERPNEXT_*` env vars is empty. Halt; complete the credential set in Doppler.
- Worker logs `enabled but no FINANCE_CONTROLLED_TENANT_IDS configured — poll cycles will be no-ops` — `FINANCE_CONTROLLED_TENANT_IDS` is unset/empty. Set it and redeploy.
- Worker reaches enabled state but logs report `tenant_count` other than `1` — env var parsed differently than expected; check for typos, extra commas, etc.
- Worker logs `[finance-adapter-worker] poll cycle complete` with `adapter_count: 0` — the gate is satisfied but no adapters registered. Halt; this means 3-9 succeeded the gate but cannot fulfill its purpose of preparing for the Phase 3-10 ERPNext proof. Investigate registration failure logs.
- Worker logs `[finance-adapter-worker] poll cycle crashed` — defense-in-depth catch fired. Investigate; this is the processor or adapter throwing unexpectedly.
- Healthcheck stays `unhealthy` for more than 2 × poll interval after §5.3 — heartbeat file not being written despite the worker being enabled. Investigate.
- `finance.adapter_jobs` rows transition to `running` / `succeeded` / `failed` for the controlled tenant — this should be impossible because no queued jobs should exist; if it happens, halt and audit. Either upstream data leaked in or the worker is processing something it shouldn't.
- `finance.audit_events` contains any `finance.adapter.sync_*` event for the controlled tenant — adapter events shouldn't be emitted in 3-9 steady state; halt and check whether jobs are flowing.
- Sandbox ERPNext endpoint shows any inbound API call or any newly-created doc — `FINANCE_PROVIDER_WRITES_ENABLED` is somehow set to `true`. **Immediate halt — this is the most critical 3-9 safety violation.** Revert the kill switch to `false` and audit how it got flipped.
- Production env is touched in any way — instant halt.
- `ENABLE_FINANCE_OPS=true` is set on `staging-backend-heavy` as part of 3-9 — this conflates 3-9 with 3-7 and is out of scope. Halt; revert the backend env to unset before continuing.
- `ENABLE_FINANCE_PERSISTENT_EVENTS=true` is set anywhere — the backend would refuse to start; halt and revert.
- `FINANCE_ADAPTER_MODE` set to anything other than `draft_only` — out of scope for 3-9 / 3-10; halt.
- Any tenant other than the controlled `a11dfb63-4b18-4eb8-872e-747af2e37c46` appears in worker logs — `FINANCE_CONTROLLED_TENANT_IDS` is mis-set. Halt and correct.

---

## 11. Hard constraints (explicit restatement)

These constraints are non-negotiable for Phase 3-9 and the rest of the Phase 3 arc. Each maps to a hard rule in [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) or [`slice-2-adapter-runtime-design.md`](./slice-2-adapter-runtime-design.md) §7.

| Constraint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Source                                  | Status this task          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------- |
| **No actual staging activation performed by this task.** This document is the runbook; execution is a separately authorized operator action.                                                                                                                                                                                                                                                                                                                                                                                     | 3-9 scope                               | Confirmed — runbook only. |
| **No Coolify/VPS mutation by this task.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 3-9 acceptance                          | Confirmed.                |
| **No Doppler / env var changes on staging by this task.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 3-9 acceptance                          | Confirmed.                |
| **No migration application.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 3-2 scope                               | Confirmed.                |
| **No route activation.** Backend `staging-backend-heavy` `ENABLE_FINANCE_OPS` remains unset; `/api/v2/finance` route stays unmounted. Phase 3-7 is the route activation packet, not 3-9.                                                                                                                                                                                                                                                                                                                                         | 3-9 scope                               | Confirmed.                |
| **No provider writes.** `FINANCE_PROVIDER_WRITES_ENABLED=false` throughout 3-9. The processor's code-side kill switch at `backend/lib/finance/adapterJobProcessor.js:332-345` prevents any HTTP call. The one-time flip is Phase 3-10 §6 step 6, sandbox endpoint only, reverted immediately after — never in 3-9.                                                                                                                                                                                                                | `slice-2-adapter-runtime-design.md` §4.6 | Confirmed.                |
| **`FINANCE_ADAPTER_MODE=draft_only` is preserved.** The adapter is only ever asked to do `pushDraft`; `pushFinal` / `voidRecord` are unreachable under this mode (the ERPNext sandbox adapter throws `AdapterCapabilityError` for both per `erpnextSandboxAdapter.js`).                                                                                                                                                                                                                                                          | `slice-2-adapter-runtime-design.md` §4.6 | Confirmed.                |
| **ERPNext sandbox / local endpoints only.** The adapter constructor at `erpnextSandboxAdapter.js:89-128` rejects production-looking `base_url` values. `FINANCE_ERPNEXT_SANDBOX_BASE_URLS` (if used) must list sandbox/local FQDNs only.                                                                                                                                                                                                                                                                                          | `slice-2-adapter-runtime-design.md` §4.4 / 2C-9 §5.1 | Confirmed.                |
| **Sandbox ERPNext credentials only.** `FINANCE_ERPNEXT_API_KEY` / `_API_SECRET` are sandbox-generated, not production-generated. Stored in Doppler `stg_stg` (encrypted at rest), never `prd_prd`.                                                                                                                                                                                                                                                                                                                                | 2C-9 §5.1 / E4                          | Confirmed.                |
| **No QuickBooks / Xero live integration.** Neither adapter is implemented; neither is registered in the worker entry block.                                                                                                                                                                                                                                                                                                                                                                                                       | E5                                      | Confirmed.                |
| **No production action.** Hetzner is not touched; `prd_prd` Doppler config is not opened; production tenants are not queried.                                                                                                                                                                                                                                                                                                                                                                                                     | Phase 3-1 §8                            | Confirmed.                |
| **`ENABLE_FINANCE_PERSISTENT_EVENTS` remains `false`** (unset) on both apps. Backend route-mount guard at `backend/routes/finance.v2.js:48` is structurally fail-closed until a separate later Slice lifts it.                                                                                                                                                                                                                                                                                                                    | Phase 3-1 §7                            | Confirmed.                |
| **`FINANCE_CONTROLLED_TENANT_IDS` required, empty = no-op.** §4 / §5.2 / §6.2 all state this. Enforced by `parseControlledTenantIds()` in `backend/lib/finance/financeWorkerCommon.js` (re-exported at `financeAdapterWorker.js:132`). No implicit "process all tenants" fall-through.                                                                                                                                                                                                                                            | 3-5 / 3-9 scope                         | Confirmed.                |
| **No payment movement.** No operation that moves money or finalises a ledger; the journal stays at `pending_approval` throughout (Phase 3-8 §5.7 contract); `pushFinal` and `voidRecord` throw `AdapterCapabilityError`; the processor never invokes finalising operations under `draft_only` mode.                                                                                                                                                                                                                              | 2C-9 §3                                 | Confirmed.                |
| **Producer split preserved.** The adapter worker's processor emits ONLY `finance.adapter.sync_succeeded` / `sync_failed`. The `finance.adapter.sync_queued` event is exclusively the responsibility of the backend-side `approveFinanceAction()` promoter (`adapterJobPromoter.js`), not the worker. Verified by the Slice 2D integration test at `adapterQueueProjection.integration.test.js`.                                                                                                                                  | `slice-2-adapter-runtime-design.md` §4.7 / Slice 2D | Confirmed.                |
| **Heartbeat / log expectations consistent with the projection worker.** §7.2 carries over the disabled-state heartbeat limitation and frames the disabled-state `unhealthy` as expected — both for the pre-5.3 state and for any post-rollback state. §7.3 references the exact log lines emitted by `backend/workers/financeAdapterWorker.js`.                                                                                                                                                                                  | 3-4 / 3-5 / 3-9 reconciliation          | Confirmed.                |
| **Do not imply standalone audit worker exists.** `audit_timeline` projection runs inside `finance-projection-worker` via `auditTimelineProjection` registered in `buildProjectionRunner({ includeInfrastructureEvents: true })` (`backend/workers/financeProjectionWorker.js:194`). No standalone `finance-audit-worker` module is implemented.                                                                                                                                                                                   | 3-4 / 3-5 / 3-9 reconciliation          | Confirmed.                |

---

## 12. Acceptance for Phase 3-9 (this task)

This document is the Phase 3-9 deliverable when paired with the matching CHANGELOG entry and the scaffold update. Acceptance for the **runbook** (this task):

- [x] Adapter-worker activation sequence documented as a dry run (§5, six sub-steps with rollback per step)
- [x] Required env changes listed but not made (§4 change table, §5.2 exact env block)
- [x] Three-tier gate behavior documented (`ENABLE_FINANCE_OPS` / `ENABLE_FINANCE_WORKERS` / `ENABLE_FINANCE_ADAPTER_WORKER`) with strict-equality semantics (§4, §5.2 with strict-equality note, §11)
- [x] `FINANCE_CONTROLLED_TENANT_IDS` required to contain the single controlled tenant id (§4, §5.2)
- [x] Empty `FINANCE_CONTROLLED_TENANT_IDS` = no tenants/no-op restated (§4 table, §5.2 tenant-id reminder, §11)
- [x] ERPNext sandbox credential env vars documented + sandbox-only constraint stated (§4, §5.2 ERPNext credentials reminder, §11)
- [x] `FINANCE_PROVIDER_WRITES_ENABLED=false` preserved throughout 3-9 (§4 safety table, §5.5 explicit, §11)
- [x] `FINANCE_ADAPTER_MODE=draft_only` preserved throughout 3-9 (§4 safety table, §11)
- [x] `ENABLE_FINANCE_PERSISTENT_EVENTS` kept false/unset for backend route safety (§4 unchanged-things table, §11, cross-references to `backend/routes/finance.v2.js:48`)
- [x] Expected worker behavior after activation documented (§6 — adapter registration, empty poll cycles, no provider writes)
- [x] Producer split preserved (§6.3 + §11 — processor emits only `sync_succeeded` / `sync_failed`; `sync_queued` is the promoter's)
- [x] Disabled-state and rollback behavior documented (§9 — config-only, returns to Phase 3-4 disabled state)
- [x] Health/log/heartbeat expectations documented, including disabled-state heartbeat limitation carried over from Phase 3-4 (§7.2)
- [x] Verification commands as operator instructions only (§8 — seven command groups, none executed)
- [x] adapter_queue projection state expectations covered transitively (§6.2 — empty stream, projection bucket unchanged; for the populated case Phase 3-10 §6 step 7 is the explicit projection observation)
- [x] No live activation performed by this task — §2 explicit "None" row for every modality
- [x] CHANGELOG entry recording Phase 3-9 (separate change)
- [x] Scaffold updated with commit hash, next active item (Phase 3-10 ERPNext sandbox proof)

Acceptance for the **execution** (a future, separately-authorized action by the deploy owner): every check in §8 PASS, worker is in `running, healthy, enabled` state with `adapter_count: 1`, logs report `tenant_count: 1`, no production action occurred, no ERPNext API call landed.

---

## 13. Evidence pack (populated on execution)

When the activation is executed, capture verbatim outputs here (or in a linked evidence record under `docs/architecture/finance/phase-3-evidence/`). Until execution, the table below is empty.

| Step | Run at (UTC) | Operator | Result (PASS / FAIL / DEFERRED) | Output / evidence link | Notes |
| ---- | ------------ | -------- | ------------------------------- | ---------------------- | ----- |
| §5.1 |              |          |                                 |                        |       |
| §5.2 |              |          |                                 |                        |       |
| §5.3 |              |          |                                 |                        |       |
| §8.1 |              |          |                                 |                        |       |
| §8.2 |              |          |                                 |                        |       |
| §8.3 |              |          |                                 |                        |       |
| §8.4 |              |          |                                 |                        |       |
| §8.5 |              |          |                                 |                        |       |
| §8.6 |              |          |                                 |                        |       |
| §8.7 |              |          |                                 |                        |       |

Next packet (once §5 + §8 PASS): **Phase 3-10 — Execute ERPNext sandbox proof against the activated adapter worker** ([`erpnext-staging-sandbox-proof-results.md`](./erpnext-staging-sandbox-proof-results.md)).
