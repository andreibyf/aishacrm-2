# Finance Ops — Phase 3-1: Staging Activation Plan (Preflight Freeze and Baseline)

**Phase 3-1 — Controlled Staging Activation.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Preflight baseline document. Nothing deployed, nothing applied to staging, no environment variable changes. `ENABLE_FINANCE_OPS` and `ENABLE_FINANCE_PERSISTENT_EVENTS` remain unset/false in every environment.
**Date:** 2026-05-23
**Related:**
[`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) (2C-13) ·
[`staging-activation-review.md`](./staging-activation-review.md) (2C-14) ·
[`finance-worker-deployment-config.md`](./finance-worker-deployment-config.md) (2C-5) ·
[`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md) (2C-6) ·
[`audit-worker-staging-plan.md`](./audit-worker-staging-plan.md) (2C-7) ·
[`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) (2C-8) ·
[`replay-rebuild-operational-drill.md`](./replay-rebuild-operational-drill.md) (2C-12) ·
[`observability-alerting.md`](./observability-alerting.md) (2C-11) ·
[`DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md)

---

## 1. Purpose and scope

This is the **preflight baseline** for Phase 3. It records what exists in the codebase as of the Phase 3 Slice 1 completion, names the controlled staging tenant, names the deploy and rollback owners, captures the staging environment assumptions, and re-asserts the hard constraints that govern the entire Phase 3 activation arc (3-1 through 3-14).

This document **does not** activate anything. It is the source of truth that the subsequent Phase 3 packets (3-2 migrations, 3-3 RLS verification, 3-4 worker deployment, 3-5 controlled-tenant enablement, 3-6 replay drill, 3-7 route activation, 3-8 smoke tests) read from. If any field below changes — branch, baseline commit, controlled tenant, owner, environment target — this document is updated before the next packet runs.

---

## 2. Baseline

### 2.1 Branch and commit

| Field                | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| Branch               | `feat/finance-ops-runtime`                                  |
| Baseline commit      | `3c60d9ff`                                                  |
| Baseline commit kind | Slice 1 P1+P2 review remediation (fail-closed route guard)  |
| Working tree         | Clean at baseline capture (no untracked, no staged changes) |
| Pushed to remote     | Not yet — local-only at baseline; no Phase 3 push performed |

Phase 3 packets must run against this commit or a descendant. If a divergent branch is created for Phase 3 (e.g., `feat/finance-phase-3-staging`), it forks from `3c60d9ff` and this document is updated to record the new branch name.

### 2.2 Verification baseline

| Verification                                                                                                                                                                                                           | Result                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --test backend/__tests__/lib/finance/*.test.js backend/__tests__/lib/finance/projections/*.test.js backend/__tests__/routes/finance.v2.routes.test.js backend/__tests__/workers/financeProjectionWorker.test.js` | **278 / 278 pass** — full Phase 3 verification suite green, zero failures, zero skipped                                                                                                                                                                                                                             |
| `npm run lint -- --quiet`                                                                                                                                                                                              | **Clean** — zero errors                                                                                                                                                                                                                                                                                             |
| Phase 3 Slice 1 acceptance                                                                                                                                                                                             | All seven Slice 1 tasks committed (`1b322a3f`, `03160006`, `cda1dc01`, `7c9187c5`, `fe745500`, `8fb64a8d`, `e3cee604`) plus the P1+P2 remediation (`3c60d9ff`). Slice 1 review blockers cleared (see [scaffold](../../../../Local%20Vault/aishacrm_finance_backend_scaffold.md) §"Phase 3 Slice 1 review blockers") |

Re-run the verification baseline at the start of each subsequent Phase 3 packet (3-2 through 3-14) and record divergence here. A drift from 278/278 is a Phase 3 stop condition.

---

## 3. Controlled staging tenant

| Field         | Value                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| `tenant_id`   | `a11dfb63-4b18-4eb8-872e-747af2e37c46`                                           |
| Source        | Selected by Dre per the criteria in `controlled-tenant-enablement.md` §3         |
| Tenant scope  | Staging-only — never a production-customer tenant                                |
| Module flag   | `financeOps` — **not yet enabled** (enablement is the Phase 3-5 step)            |
| Module key    | Canonical `financeOps`; `enterpriseFinance` is the compatibility alias           |
| Other tenants | The `financeOps` module flag must **not** be set for any other tenant in staging |

**Structural enforcement.** Per `controlled-tenant-enablement.md` §2, "one controlled tenant" is enforced by the conjunction of (a) `ENABLE_FINANCE_OPS=true` in the staging backend environment, which only makes the route surface _exist_, and (b) the `financeOps` module flag on this `tenant_id` and **only** this `tenant_id`. There is no global-enablement switch — every request still passes through the per-tenant `financeModuleGate.js`.

This `tenant_id` is the single referent for Phase 3-5 (controlled enablement), 3-6 (replay drill), 3-7 (route activation), 3-8 (smoke tests), and 3-12 (regression). Recording it now prevents drift across packets.

---

## 4. Owners

| Role           | Owner | Notes                                                                                                                  |
| -------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| Deploy owner   | Dre   | Operates Coolify deploys for the staging Coolify apps listed in §5. Pushes the environment-variable flips for 3-5/3-7. |
| Rollback owner | Dre   | Same person. Single rollback action — disable the per-tenant `financeOps` module flag, or unset `ENABLE_FINANCE_OPS`.  |

A single person on both push and rollback is acceptable for Phase 3 because rollback is a single, non-destructive config change with no schema impact (see §10). If a second person joins ownership at any Phase 3 packet, this table is updated before that packet runs.

---

## 5. Staging environment assumptions

Source of truth: [`DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md). The Phase 3 packets must use these identifiers exactly. Two of them have caused real time loss in the past (the 2026-05-14 SSH-user mismatch and the 2026-05-12 staging FQDN confusion); they are restated here so Phase 3-2 through 3-8 work from a single contract.

### 5.1 Hosts and SSH

| Identifier | Value                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| Host name  | VPS-1                                                                  |
| Role       | Staging app services                                                   |
| Provider   | Zap-Hosting (lifetime)                                                 |
| IP         | `147.189.173.237`                                                      |
| SSH user   | `andreibyf` (**not** `root` — see 2026-05-14)                          |
| What runs  | Frontend, backend, braid-mcp, litellm, coolify-proxy, coolify-sentinel |

Coolify control plane runs on VPS-2 (`147.189.168.164`); Coolify mutations for the staging apps target VPS-2's API but deploy _to_ VPS-1. The Coolify server UUID for VPS-1 is `f7uzrwlbqjtx6qamppma5xsz`.

### 5.2 Staging Coolify apps and public FQDNs

| Public FQDN                      | Coolify app             | Coolify UUID               | What it is                   |
| -------------------------------- | ----------------------- | -------------------------- | ---------------------------- |
| `staging-app.aishacrm.com`       | `staging-app-fast`      | `di7ko49ikfd2mz8yh0q7id8q` | Frontend (Vite/React)        |
| `staging-api.aishacrm.com`       | `staging-backend-heavy` | `d24ro1fqm0zyl7pd72g6snd2` | Backend (Node/Express)       |
| `staging-braid.aishacrm.com`\*   | `staging-braid`         | `tw8zmua5jyzwnhh1oxw15kkm` | Distributed Braid MCP server |
| `staging-litellm.aishacrm.com`\* | `staging-litellm`       | `zsy5fsbw9hccxvoznkbpy1il` | LiteLLM router               |

\*Internal-only or not always exposed; check Cloudflare DNS if uncertain.

The backend app `staging-backend-heavy` is the only target that needs an `ENABLE_FINANCE_OPS=true` environment variable change for Phase 3-7. The frontend and other apps are unaffected by finance gating.

### 5.3 Finance worker apps (not yet deployed)

Phase 3-4 deploys the three finance worker apps per the disabled-by-default template at [`deploy/coolify/finance-workers.example.yml`](../../../deploy/coolify/finance-workers.example.yml). These worker apps **do not exist in Coolify yet** at the Phase 3-1 baseline:

| Worker                      | Tier-gate                                                                                              | Phase 3 packet that creates it                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `finance-projection-worker` | `ENABLE_FINANCE_OPS && ENABLE_FINANCE_WORKERS && ENABLE_FINANCE_PROJECTION_WORKER`                     | 3-4 (deploy disabled), 3-5 (enable for controlled tenant) |
| `finance-audit-worker`      | `ENABLE_FINANCE_OPS && ENABLE_FINANCE_WORKERS && ENABLE_FINANCE_AUDIT_WORKER`                          | 3-4 (deploy disabled), 3-5 (enable for controlled tenant) |
| `finance-adapter-worker`    | `ENABLE_FINANCE_OPS && ENABLE_FINANCE_WORKERS && ENABLE_FINANCE_ADAPTER_WORKER` + adapter safety flags | 3-9 (sandbox/draft-only only)                             |

**Worker placement for Phase 3: VPS-1 (staging).** Per [`DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md) (the named source of truth in §5), app services — including background workers — deploy to **VPS-1 (staging) or Hetzner (production), never VPS-2**. VPS-2 hosts only the control plane (Coolify, Cal.com, Uptime Kuma, Gitea, OneDev). Phase 3 deploys the three finance worker apps as separate Coolify worker apps on **VPS-1**, not in-process with the backend.

This resolves the unresolved tension carried in `finance-worker-deployment-config.md` §8 (lines 195-198), which referenced decision E2 ("VPS-2") but immediately noted "the actual VPS-1-vs-VPS-2 placement must be re-confirmed against DEPLOY_TOPOLOGY.md". `DEPLOY_TOPOLOGY.md` is the named source of truth and wins. Decision E2 in `worker-service-topology.md` (a Phase 2B design doc) predates the topology lockdown documented in `DEPLOY_TOPOLOGY.md` after the 2026-05-14 incidents. A follow-up edit to reconcile `finance-worker-deployment-config.md` §8 and `worker-service-topology.md` to the VPS-1-staging / Hetzner-production placement is outstanding (deferred — neither doc is in the Phase 3-1 baseline scope, and the Phase 3-4 packet operates from this doc).

Worker creation in Coolify is a Phase 3-4 task, not Phase 3-1.

### 5.4 Doppler

| Field             | Value                                          |
| ----------------- | ---------------------------------------------- |
| Project           | `aishacrm`                                     |
| Staging config    | `stg_stg` (per `finance-workers.example.yml`)  |
| Local dev config  | `dev` (per `doppler configure --json`)         |
| Production config | `prd_prd` — **not used by any Phase 3 packet** |

Phase 3 packets that need secrets read them via `doppler run --` against the **staging** config only. No Phase 3 packet reads `prd_prd`.

---

## 6. Migrations

| Migration                                    | What it does                                                                                                         | Status at baseline | Phase 3 packet that may apply it                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| `172_finance_ops_runtime_scaffold.sql`       | Creates the `finance` schema and its core tables (journal entries, invoices, approvals, adapter jobs, audit events). | Dev-only draft     | Phase 3-2 (staging only)                                 |
| `173_finance_event_store_append_only.sql`    | Hardens `finance.audit_events` with append-only immutability trigger + `(tenant_id, created_at, id)` replay index.   | Dev-only draft     | Phase 3-2 (staging only)                                 |
| `174_finance_projection_state_draft.sql`     | Creates `finance.projection_state` with the `BEFORE UPDATE` trigger that maintains `updated_at`.                     | Dev-only draft     | Phase 3-2 (staging only)                                 |
| `175_finance_projection_state_rls_draft.sql` | Companion RLS for `finance.projection_state`. Dev-only draft, applied to nothing.                                    | Dev-only draft     | Phase 3-2 (staging only — gated by 3-3 RLS verification) |

**Phase 3-1 applies no migration.** Migration application is Phase 3-2 and is **staging only** — never production. The migration files keep their dev-only-draft posture until Phase 3-2 runs them against the staging Supabase project (Doppler config `stg_stg`).

If any migration application reveals a divergence from dev (e.g., a column already exists on staging that doesn't exist in dev), the migration is paused and this document is updated with the divergence finding before Phase 3-2 retries.

---

## 7. Persistent-events constraint (hard)

`ENABLE_FINANCE_PERSISTENT_EVENTS` **must remain `false`** (or unset) in every environment throughout Phase 3.

**Why this is non-negotiable in Phase 3:** The Slice 1 P1 review found that with `ENABLE_FINANCE_PERSISTENT_EVENTS=true`, writes would persist to `finance.audit_events` while every business read (`listJournalEntries`, `listApprovals`, `getLedger`, `getProfitLoss`, `getBalanceSheet`) still reads from the in-memory per-process bucket in `financeDomainService`. After a restart, business reads return empty alongside a non-zero `audit_events_count`, and two backend instances behind the same load balancer see divergent views of the same tenant — silent operational corruption.

**Structural enforcement.** The fix in commit `3c60d9ff` makes this structurally impossible to activate on the route surface: `createFinanceV2Routes` throws a descriptive `Error` at construction time when `ENABLE_FINANCE_PERSISTENT_EVENTS=true`. The unguarded `app.use(..., createFinanceV2Routes(measuredPgPool))` call in `backend/server.js` propagates the throw — backend startup fails loud with the descriptive message rather than silently serving split-brain.

**Until when.** The guard is lifted only when projection-backed reads land in **Phase 3 Slice 2**. Slice 2 will replace the in-memory bucket reads with reads from the projection store (already implemented via `projectionStore.pg.js`), at which point persistent events become a usable backend mode. Until then, Phase 3 route activation (3-7) and all downstream packets operate against the in-memory event store, which is correct for that mode.

**Two flags, two scopes.** Note the distinction Phase 3 will rely on:

| Flag                               | Where it's read                  | Effect                                                                                                                                     |
| ---------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ENABLE_FINANCE_OPS`               | `financeRuntimeGate.js`, backend | Mounts the `/api/v2/finance` route surface. Required for Phase 3-7. **OK to set in staging** — does not by itself grant any tenant access. |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` | `routes/finance.v2.js` **only**  | If `true`, `createFinanceV2Routes` throws. **Must stay false/unset everywhere through Phase 3.**                                           |

**Why the worker doesn't read this flag.** `backend/workers/financeProjectionWorker.js` does not read `ENABLE_FINANCE_PERSISTENT_EVENTS`. `buildProjectionRunner` unconditionally constructs the runner with `createFinancePgEventStore({ pool })`; the only env gates the worker reads are `ENABLE_FINANCE_OPS`, `ENABLE_FINANCE_WORKERS`, `ENABLE_FINANCE_PROJECTION_WORKER` (the three-tier enable gate at `isFinanceProjectionWorkerEnabled`), and `FINANCE_CONTROLLED_TENANT_IDS` (the controlled-tenant allow-list).

The practical Phase 3 consequence — with `ENABLE_FINANCE_PERSISTENT_EVENTS=false` the **backend route** does not write events into `finance.audit_events`. The worker still reads from `finance.audit_events`; it just finds the controlled tenant's stream empty (or, post-3-2 migration application, the existing dev stream if any) and its poll cycles are no-ops. That is the expected idle Phase 3 worker behavior. The flag is a **backend-route constraint**, not a worker behavior.

---

## 8. No production activation (hard)

**No Phase 3 packet (3-1 through 3-14) touches production.** The only deploy target for the entire Phase 3 arc is staging (VPS-1 via Coolify on VPS-2).

| Production component                     | Phase 3 posture                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Hetzner backend (`backend.aishacrm.com`) | Unchanged. No `ENABLE_FINANCE_OPS` set. No `ENABLE_FINANCE_PERSISTENT_EVENTS` set. No finance migrations applied. |
| Hetzner Supabase project                 | No finance migrations applied. `finance` schema absent or unchanged.                                              |
| Hetzner finance workers                  | Do not exist. Not deployed.                                                                                       |
| Doppler `prd_prd` config                 | Not read by any Phase 3 packet. `ENABLE_FINANCE_OPS` / `ENABLE_FINANCE_PERSISTENT_EVENTS` not set.                |
| Real customer tenants                    | `financeOps` module flag not touched for any production tenant.                                                   |

Production activation is the subject of **Phase 4**, which is a separate review with separate prerequisites (see `production-readiness-review.md` (2C-15) for the ten prerequisites that must clear before any production activation review begins).

---

## 9. No provider writes (hard)

**No Phase 3 packet performs a live provider write.** Adapter activity in Phase 3-9/3-10 is sandbox/draft-only.

| Layer                                                                  | Phase 3 posture                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `FINANCE_ADAPTER_MODE`                                                 | `draft_only` (default per `finance-workers.example.yml`)                                               |
| `FINANCE_PROVIDER_WRITES_ENABLED`                                      | `false` — the dominant kill switch; no provider HTTP write occurs while it is false regardless of mode |
| `assertWritePermitted` (in-code guard)                                 | Active at the adapter call site as the second independent layer                                        |
| ERPNext (sandbox proof in 3-10)                                        | Sandbox `base_url` only. No QuickBooks/Xero live credentials. `docstatus=0` (draft) — no submit call.  |
| QuickBooks / Xero                                                      | Not used in Phase 3. Sandbox or otherwise.                                                             |
| Tenant `tenant_integrations.api_credentials` for the controlled tenant | Must point at sandbox endpoints only; no live provider credentials are loaded by any Phase 3 packet.   |

The two-layer defense (configuration + code guard) is per `adapter-worker-sandbox-plan.md` (2C-8). The Phase 3 stop condition list in the scaffold names "worker config permits live provider writes" as an immediate-halt trigger.

---

## 10. Rollback / disable posture

Phase 3 rollback is **a single config change** that requires no code deployment, no schema rollback, and no data migration.

### 10.1 Per-packet rollback

| If this packet has activated                         | Rollback action                                                                                                                                                                                                                         | Effect                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 3-5 (controlled-tenant `financeOps` module flag)     | Disable the per-tenant `financeOps` module flag for `a11dfb63-4b18-4eb8-872e-747af2e37c46` in `modulesettings`.                                                                                                                         | Controlled tenant immediately loses route access; module gate returns 403.                 |
| 3-7 (route activation via `ENABLE_FINANCE_OPS=true`) | Unset `ENABLE_FINANCE_OPS` (or set to anything other than the literal string `'true'`) in `staging-backend-heavy` Coolify env and redeploy.                                                                                             | Route surface unmounts; `/api/v2/finance/*` returns 404 across all tenants.                |
| 3-4 / 3-5 (worker enablement)                        | Set any of `ENABLE_FINANCE_OPS`, `ENABLE_FINANCE_WORKERS`, or the per-worker flag to anything other than `'true'` in the worker app's Coolify env.                                                                                      | Worker logs "finance ops disabled — worker idling" and returns to no-op state immediately. |
| 3-9 (adapter worker)                                 | Same per-worker rollback as above. Independently, `FINANCE_PROVIDER_WRITES_ENABLED=false` is the dominant kill switch.                                                                                                                  | Adapter ceases polling; no provider writes possible.                                       |
| 3-2 (migrations applied to staging)                  | Migrations are additive and reversible-by-design (174 has the `BEFORE UPDATE` trigger that is safely droppable; 173's append-only trigger is droppable). Migration rollback is **last resort** — disable the runtime flags above first. | No staging-tenant data loss; finance tables empty until re-enabled.                        |

### 10.2 Rollback non-requirements

- **No code rollback.** All Phase 3 activation is environment-variable driven on top of code that is already merged and verified at baseline commit `3c60d9ff`. A Phase 3 rollback does not require reverting any commit.
- **No schema rollback** under normal rollback. The migrations are additive and tenant-scoped via RLS; an empty `finance.*` table for the controlled tenant is the rollback-target state, not a dropped table.
- **No customer impact.** Production is untouched throughout (§8); rollback affects only the controlled staging tenant.

### 10.3 Stop conditions inherited from the scaffold

The Phase 3 stop conditions in the scaffold (immediate-halt triggers) are restated here for the deploy owner's reference:

- finance schema is exposed through public PostgREST
- tenant isolation is uncertain
- service-role behavior contradicts assumptions
- any route bypasses auth, tenant, or module gate
- any AI actor can approve, post ledger truth, refund, or move money
- worker config permits live provider writes
- ERPNext adapter can reach production credentials or production endpoint
- replay/rebuild produces divergent projection state
- degraded projections cannot be observed
- rollback requires code changes instead of config disablement
- staging tenant activation expands beyond the controlled tenant

A stop condition triggers immediate rollback per §10.1 and a Phase 3 review before any further packet runs.

---

## 11. Acceptance for Phase 3-1

This document is the Phase 3-1 deliverable. Phase 3-1 is complete when:

- [x] Branch and baseline commit recorded (§2.1 — `feat/finance-ops-runtime` @ `3c60d9ff`)
- [x] Verification baseline recorded (§2.2 — 278/278 pass, lint clean)
- [x] Controlled staging `tenant_id` named (§3 — `a11dfb63-4b18-4eb8-872e-747af2e37c46`)
- [x] Deploy owner named (§4 — Dre)
- [x] Rollback owner named (§4 — Dre)
- [x] Staging environment assumptions recorded (§5)
- [x] Migrations that may later be applied listed (§6 — 172/173/174/175, staging only)
- [x] `ENABLE_FINANCE_PERSISTENT_EVENTS` constraint stated explicitly (§7)
- [x] Persistent-events route block stated until Slice 2 (§7)
- [x] No production activation stated explicitly (§8)
- [x] No provider writes stated explicitly (§9)
- [x] Rollback / disable posture documented (§10)
- [x] CHANGELOG entry recording Phase 3-1 (separate change)

Phase 3-1 has produced this document and the CHANGELOG entry. No environment variable was changed, no migration was applied, nothing was deployed.

Next packet: **Phase 3-2 — Apply finance migrations to staging only.**
