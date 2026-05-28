# Finance Ops — Phase 3-7: Controlled-Tenant Finance v2 Route Activation Plan (Dry Run)

**Phase 3-7 — Controlled Staging Activation, route mount + per-tenant module enablement.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Activation plan / dry run. **No route activation was performed by this task.** No `ENABLE_FINANCE_OPS` change on `staging-backend-heavy`, no `financeOps` module flag flip for any tenant, no Coolify mutation, no Doppler / env var change in staging, no migration applied, no worker change, no provider HTTP write. This document is the exact operator runbook a deploy owner would use; it does not execute the runbook.
**Date:** 2026-05-24
**Related:**
[`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) (3-1, baseline `3c60d9ff`) ·
[`staging-migration-application-log.md`](./staging-migration-application-log.md) (3-2) ·
[`staging-rls-verification-results.md`](./staging-rls-verification-results.md) (3-3) ·
[`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) (3-4) ·
[`staging-worker-activation-log.md`](./staging-worker-activation-log.md) (3-5) ·
[`staging-replay-drill-results.md`](./staging-replay-drill-results.md) (3-6) ·
[`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) (2C-13, full enablement procedure — 3-7 is its Steps 2 + 3) ·
`backend/lib/finance/financeRuntimeGate.js` (route-mount gate code) ·
`backend/lib/finance/financeModuleGate.js` (per-tenant module gate code) ·
`backend/routes/finance.v2.js` (the route module being mounted)

---

## 1. Purpose and scope

Phase 3-7 is the **route-mount + per-tenant module enablement** for `/api/v2/finance/*` against the one controlled staging tenant (`a11dfb63-4b18-4eb8-872e-747af2e37c46`). After 3-7, the route surface is mounted on `staging-backend-heavy`, and the controlled tenant is the **only** tenant that passes the `financeOps` module gate. All other staging tenants reach the route surface but are rejected by the module gate.

3-7 maps directly to Steps 2 + 3 of [`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) (2C-13):

- **Step 2 — Enable the runtime gate**: set `ENABLE_FINANCE_OPS=true` on the **backend app** (`staging-backend-heavy`) and redeploy. This mounts the `/api/v2/finance` route surface. **At this point no tenant has access** — the module gate still rejects every request.
- **Step 3 — Enable the `financeOps` module for the one tenant**: set `modulesettings.financeOps` enabled for `a11dfb63-4b18-4eb8-872e-747af2e37c46` only. This grants access to exactly one tenant.

3-7 is **not** the worker enablement (that's Phase 3-5 — the worker app's `ENABLE_FINANCE_OPS` is independent of the backend app's). 3-7 is **not** the smoke test (that's Phase 3-8 — which runs against the route surface that 3-7 mounts). 3-7 is **not** the persistent-events lift (that's Slice 2 — `ENABLE_FINANCE_PERSISTENT_EVENTS` remains structurally fail-closed at route mount via `backend/routes/finance.v2.js:48` throughout 3-7).

**This document and the matching env / module-flag changes are runbook only.** No env var is flipped, no module flag is set, no Coolify redeploy is triggered by this task. Executing the runbook is a separately authorized operator action covered by §5.

---

## 2. Live-activation posture

**Default for this task: no route was activated.**

| What                                                                        | Status this task                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ENABLE_FINANCE_OPS` set on `staging-backend-heavy` (the backend app)       | None.                                                                                    |
| `financeOps` module flag flipped for `a11dfb63-4b18-4eb8-872e-747af2e37c46` | None — `modulesettings.financeOps` remains unset for the controlled tenant.              |
| `financeOps` module flag flipped for any other tenant                       | None — remains unset for every tenant.                                                   |
| Coolify redeploy of `staging-backend-heavy`                                 | None.                                                                                    |
| SSH session to VPS-1 (`andreibyf@147.189.173.237`)                          | None.                                                                                    |
| Staging Doppler (`stg_stg`) env var changed                                 | None.                                                                                    |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` changed anywhere                         | None — remains unset (fail-closed at route mount via `backend/routes/finance.v2.js:48`). |
| Worker app (`staging-finance-projection-worker`) configuration changed      | None — Phase 3-5 is independent.                                                         |
| Staging Supabase migration applied                                          | None.                                                                                    |
| Provider HTTP write (QuickBooks / Xero / ERPNext)                           | None — no adapter worker exists.                                                         |
| Production environment touched in any way                                   | None.                                                                                    |

A live execution requires the deploy owner's explicit authorization. When authorized, the procedure in §5 is run **in the order listed** and outputs are captured per §13.

---

## 3. Prerequisites — what must be true before 3-7 runs

- [ ] **Phase 3-1 baseline.** Branch `feat/finance-ops-runtime` at a descendant of `3c60d9ff`; 278/278 finance + projection + worker + route tests passing.
- [ ] **Phase 3-2 migrations applied to staging.** At minimum 172 + 173 + 174 + 175.
- [ ] **Phase 3-3 RLS verification PASS** in staging.
- [ ] **Phase 3-4 worker app exists on VPS-1** (`staging-finance-projection-worker`), at minimum in disabled state. Whether Phase 3-5 has activated the worker doesn't matter for 3-7 — the route and worker are independent surfaces.
- [ ] **Phase 3-6 drill plan committed** as the operational replay contract — execution can occur after 3-7 or in parallel; not a hard prereq for 3-7.
- [ ] **Doppler `stg_stg` secrets present** on the backend app for the database connection.
- [ ] **`ENABLE_FINANCE_PERSISTENT_EVENTS` unset on `staging-backend-heavy`.** The Slice 1 fail-closed route-mount guard at `backend/routes/finance.v2.js:48` throws at construction time if this flag is true; backend startup would fail loud. 3-7 leaves this unset. Slice 2 lifts the guard; persistent-events activation is a separate later decision, not 3-7's.
- [ ] **The controlled staging tenant `a11dfb63-4b18-4eb8-872e-747af2e37c46` is the chosen tenant** per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3.
- [ ] **No production action.** `prd_prd` Doppler config is not opened; Hetzner is not touched; production tenants are not queried; `modulesettings.financeOps` is never set for a production tenant.

If any prerequisite fails, **halt** 3-7 and remediate before continuing.

---

## 4. Activation envelope — what changes vs what does not

3-7 is two env-level / DB-level changes, in two layers:

| Change                                                                                          | Layer                             | Effect                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENABLE_FINANCE_OPS=true` on **`staging-backend-heavy`** Coolify app + redeploy                 | Backend app environment           | Mounts the `/api/v2/finance/*` route surface. Until this is set, `isFinanceRuntimeEnabled()` at `backend/lib/finance/financeRuntimeGate.js:22` returns `false`, the conditional `app.use(...)` block in `server.js` is skipped, and Express returns `404` for any `/api/v2/finance/*` request. |
| `modulesettings.financeOps.is_enabled = true` for tenant `a11dfb63-4b18-4eb8-872e-747af2e37c46` | Database (`modulesettings` table) | Grants the controlled tenant access through the per-tenant module gate at `backend/routes/finance.v2.js:69-90`. Every other tenant still gets `403 "Finance Ops is not enabled for this tenant"` from that gate.                                                                               |

**Nothing else changes.** The following are explicitly **unchanged** by 3-7:

| Env var / setting                                                                            | 3-7 posture                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` on `staging-backend-heavy`                                | **Unchanged** (unset). The Slice 1 fail-closed guard at `backend/routes/finance.v2.js:48` throws `Error` at `createFinanceV2Routes` construction time if this flag is true — backend startup fails. Lifting this guard is gated on projection-backed reads landing in Slice 2. |
| `ENABLE_FINANCE_OPS` on the **worker app** (`staging-finance-projection-worker`)             | **Independent.** Whether Phase 3-5 has flipped this on the worker is irrelevant to 3-7's backend-side route activation. Both apps have their own env block; the `ENABLE_FINANCE_OPS` they read is per-app.                                                                     |
| `FINANCE_CONTROLLED_TENANT_IDS` on the worker app                                            | **Unchanged.** That's a worker-tier env var (Phase 3-5). 3-7 doesn't touch the worker.                                                                                                                                                                                         |
| `modulesettings.financeOps` for any tenant other than `a11dfb63-4b18-4eb8-872e-747af2e37c46` | **Unchanged** (unset). "One tenant only" is structurally enforced by 3-7 setting the flag for exactly one tenant; every other tenant remains gated.                                                                                                                            |
| Staging migrations                                                                           | **Unchanged.** No migration applied by 3-7.                                                                                                                                                                                                                                    |
| Production env (Hetzner, `prd_prd` Doppler, production `modulesettings.financeOps`)          | **Unchanged.** Never in any Phase 3 packet's scope.                                                                                                                                                                                                                            |

---

## 5. Dry-run activation sequence (NOT executed by this task)

The operator runs these steps in order, in staging only. **None of them ran by this Phase 3-7 task.**

### 5.1 Preflight (no mutation)

- [ ] Re-confirm every prerequisite in §3 is still true. Specifically re-verify `ENABLE_FINANCE_PERSISTENT_EVENTS` is **unset** on `staging-backend-heavy` — if it's accidentally set, backend startup will fail loud per the §3 fail-closed guard, halting the deploy mid-way.
- [ ] Confirm the controlled tenant `tenant_id` `a11dfb63-4b18-4eb8-872e-747af2e37c46` is still the chosen staging tenant per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3. If it changed, update 3-1 first.
- [ ] Confirm no production action is implied: `prd_prd` Doppler config is not opened, Hetzner backend (`backend.aishacrm.com`) is not touched, no production tenant `modulesettings` row is queried or modified.
- [ ] Confirm VPS-1 utilization via `ssh andreibyf@147.189.173.237 'top -bn1 | head -5'`. Route activation triggers a backend redeploy; confirm no other Coolify deploy is in flight (the 2026-05-10 incident).

### 5.2 Set `ENABLE_FINANCE_OPS=true` on the **backend app** + redeploy

In Coolify (control plane on VPS-2, targeting the `staging-backend-heavy` app on VPS-1 Coolify server UUID `f7uzrwlbqjtx6qamppma5xsz`), open the app's environment editor and set:

```
ENABLE_FINANCE_OPS=true
```

**Strict-equality reminder** (matches `isFinanceRuntimeEnabled()` at `backend/lib/finance/financeRuntimeGate.js:22`): the value must be the literal lowercase string `'true'`. Anything else — `'TRUE'`, `'1'`, the boolean `true` — leaves the gate closed and the route surface unmounted. This prevents accidental mount from typos / coerced values.

Trigger a Coolify redeploy on `staging-backend-heavy`. On boot:

1. `server.js` evaluates `isFinanceRuntimeEnabled()` → `true`.
2. The conditional block mounts the route: `app.use('/api/v2/finance', defaultLimiter, authenticateRequest, createFinanceV2Routes(measuredPgPool))`.
3. `createFinanceV2Routes` reaches its constructor-time `ENABLE_FINANCE_PERSISTENT_EVENTS` check (`backend/routes/finance.v2.js:48`). Because that flag is unset (§3 prereq, §4 unchanged-things), the check passes and the route is constructed against the in-memory event store.
4. The route surface is live. **No tenant has access yet** — every request from every tenant is rejected by the per-tenant module gate at `backend/routes/finance.v2.js:69-90` until §5.3 enables the flag for the controlled tenant.

Outcome: `staging-backend-heavy` is `running, healthy`; `/api/v2/finance/runtime/status` returns `403 "Finance Ops is not enabled for this tenant"` for any authenticated request from any tenant (because no tenant has the module flag yet); requests with no auth return `401`.

**Rollback for 5.2:** unset `ENABLE_FINANCE_OPS` on the backend app and redeploy. The route unmounts; Express returns `404` for every `/api/v2/finance/*` request, regardless of tenant. Single-step config rollback; no DB rollback; no data loss.

### 5.3 Enable the `financeOps` module flag for the controlled tenant

In the staging Supabase SQL editor (service_role connection), upsert the module flag row for **only** `a11dfb63-4b18-4eb8-872e-747af2e37c46`:

```sql
insert into modulesettings (tenant_id, module_name, is_enabled, created_at, updated_at)
values ('a11dfb63-4b18-4eb8-872e-747af2e37c46', 'financeOps', true, now(), now())
on conflict (tenant_id, module_name) do update
  set is_enabled = excluded.is_enabled,
      updated_at = excluded.updated_at;
```

(If the `modulesettings` table's primary-key / unique constraint shape differs, adjust the `on conflict` clause accordingly — verify against the staging DB schema before running. The intent is "ensure exactly one row exists for this tenant + module, with `is_enabled = true`.")

**Strict scope reminder:** the canonical module key is `'financeOps'` per `FINANCE_MODULE_KEYS.CANONICAL` at `backend/lib/finance/financeModuleGate.js:12`. The alias `'enterpriseFinance'` is treated as equivalent by `isFinanceOpsEnabled()` at line 29 (per R-6 deduplication logic, canonical wins on conflict). 3-7 sets the canonical key — do not add a new alias row for any tenant. **Note on tolerated legacy state:** if a staging tenant already carries an `enterpriseFinance` alias row from prior dev work, the runtime still behaves correctly because the gate code resolves canonical-vs-alias conflicts in favor of `financeOps`. A pre-existing alias row for the controlled tenant is tolerated; 3-7 does not require deleting it (though after 3-7 the canonical row is what governs). The §8 inventory query treats an alias row as informational, not as a 3-7 failure.

**Tenant isolation reminder:** the `where` / `tenant_id` in the SQL is `a11dfb63-4b18-4eb8-872e-747af2e37c46` and nothing else. The drill must NOT touch `modulesettings.financeOps` for any other tenant. Per [`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) §2, "one tenant only" is structurally enforced by setting the flag for exactly one `tenant_id`.

**Rollback for 5.3:** flip the row's `is_enabled` to `false` (or `delete` the row):

```sql
update modulesettings
  set is_enabled = false, updated_at = now()
  where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
    and module_name = 'financeOps';
```

Effect: the controlled tenant immediately loses access on the next request; the module gate returns `403`. The route surface remains mounted (5.2 not rolled back); but no tenant has access. No data is lost. Single-statement config rollback.

### 5.4 Confirm the controlled tenant reaches the route

From an authenticated session as a user belonging to the controlled tenant (whatever staging auth flow the operator uses — typically Supabase auth + a known test user), issue:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <controlled-tenant-user-jwt>" \
  -H "X-Tenant-Id: a11dfb63-4b18-4eb8-872e-747af2e37c46" \
  https://staging-api.aishacrm.com/api/v2/finance/runtime/status
```

Expected: `200`. The response body contains the tenant-scoped runtime status (mock state, since `ENABLE_FINANCE_PERSISTENT_EVENTS=false` keeps the route on the in-memory event store).

**If 401:** auth header is missing or invalid; fix the test session and retry. **If 403:** module gate rejected — check that §5.3 ran correctly and the row's `is_enabled = true` for the canonical module key. **If 404:** route surface isn't mounted — check that §5.2 ran (`ENABLE_FINANCE_OPS=true` in Coolify env on the **backend** app, not the worker app) and the backend redeployed successfully.

### 5.5 Confirm other tenants are rejected by the module gate

From an authenticated session as a user belonging to **any other staging tenant** (whichever staging test tenant is convenient, NOT the controlled tenant), issue:

```bash
curl -s -w "%{http_code}\n" \
  -H "Authorization: Bearer <other-tenant-user-jwt>" \
  -H "X-Tenant-Id: <other-tenant-uuid>" \
  https://staging-api.aishacrm.com/api/v2/finance/runtime/status
```

Expected: `403` with the JSON body `{ "status": "error", "message": "Finance Ops is not enabled for this tenant" }`. This proves the module gate is rejecting every tenant whose `modulesettings.financeOps.is_enabled` is not `true`. The exact error message matches `backend/routes/finance.v2.js:80`.

**If 200:** the other tenant somehow has the module flag enabled. **Stop condition** — investigate immediately; the "one tenant only" invariant is violated.

### 5.6 Do NOT touch `ENABLE_FINANCE_PERSISTENT_EVENTS`

The persistent-events flag stays unset on `staging-backend-heavy` throughout 3-7. The route activation only mounts the route surface; the route still serves business reads from the in-memory event store inside `financeDomainService` (because of the Slice 1 split-brain-prevention contract). Enabling persistent events is Slice 2, structurally enforced by the constructor-time throw at `backend/routes/finance.v2.js:48`.

If an operator accidentally sets `ENABLE_FINANCE_PERSISTENT_EVENTS=true` during 3-7, the next backend redeploy will fail loud with a descriptive `Error` at `createFinanceV2Routes` construction. That's the intended fail-closed behavior — backend startup is blocked rather than allowing the split-brain state. Remediation: unset the flag and redeploy.

---

## 6. Expected route behavior (the post-activation status-code matrix)

Once §5.2 + §5.3 complete and the controlled tenant has been verified via §5.4, the deployed behavior is:

| Request                                                                                        | Auth state          | Tenant                                     | Module flag                                               | Expected response                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v2/finance/runtime/status`                                                           | unauthenticated     | (n/a)                                      | (n/a)                                                     | **`401`** from `authenticateRequest` middleware (server.js, wraps the entire route mount).                                                                                                                                                                              |
| `GET /api/v2/finance/runtime/status`                                                           | authenticated       | `a11dfb63-4b18-4eb8-872e-747af2e37c46`     | `financeOps = true` (set in §5.3)                         | **`200`** with the tenant-scoped runtime status payload. The runtime status is mock/in-memory because `ENABLE_FINANCE_PERSISTENT_EVENTS=false` — that's the intended state through Slice 1.                                                                             |
| `GET /api/v2/finance/runtime/status`                                                           | authenticated       | any other staging tenant                   | `financeOps` unset / false                                | **`403`** with `{ status: 'error', message: 'Finance Ops is not enabled for this tenant' }` from the module gate at `backend/routes/finance.v2.js:78-82`.                                                                                                               |
| `GET /api/v2/finance/runtime/status` with `X-Tenant-Id` header pointing at a foreign tenant    | authenticated       | mismatch (session tenant ≠ request tenant) | (n/a — `validateTenantAccess` rejects before module gate) | **`400`/`403`** from `validateTenantAccess` middleware (`backend/middleware/validateTenant.js`). Per the Phase 3-3 §4.4 description — the exact status depends on whether the mismatch is "tenant not assigned" (403) or "tenant_id missing/malformed" (400).           |
| `POST /api/v2/finance/draft-invoices` (etc., any handler)                                      | authenticated       | `a11dfb63-4b18-4eb8-872e-747af2e37c46`     | `financeOps = true`                                       | Handler runs; expected per [`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) §5 smoke-test sequence (Phase 3-8 verifies these — out of 3-7 scope).                                                                                                 |
| `POST /api/v2/finance/approvals/:id/approve` from an `ai_agent` actor on the controlled tenant | authenticated as AI | `a11dfb63-4b18-4eb8-872e-747af2e37c46`     | `financeOps = true`                                       | **`403`** from the actor-identity check at `backend/routes/finance.v2.js` (the session-derived `actor_type` block — AI actors cannot approve regardless of body spoofing). This is the long-standing actor-spoofing prevention from commit `04a76bae`. Verified in 3-8. |
| `GET /api/v2/finance/runtime/status` after §5.3 rollback (module flag flipped back to false)   | authenticated       | `a11dfb63-4b18-4eb8-872e-747af2e37c46`     | `financeOps = false`                                      | **`403`** with the same module-gate message — module gate now rejects the previously-allowed tenant. Single-request rollback, no caching to wait on (the gate hits the DB per request).                                                                                 |
| `GET /api/v2/finance/runtime/status` after §5.2 rollback (`ENABLE_FINANCE_OPS` unset)          | authenticated       | any tenant including the controlled one    | (n/a — route doesn't exist)                               | **`404`** from Express — the route surface is unmounted entirely.                                                                                                                                                                                                       |

The smoke-test sequence in [`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) §5 (auth + module-gate-denied + module-gate-allowed + runtime status + draft invoice + balanced/unbalanced journal + AI approval block) is Phase 3-8 territory. 3-7 verifies only §5.4 (controlled-tenant 200) and §5.5 (other-tenant 403) — enough to confirm the activation worked; 3-8 expands to the full smoke matrix.

---

## 7. The auth + tenant + module-gate chain — MANDATORY

The three controls below run on every `/api/v2/finance/*` request and must **remain mandatory** through 3-7. Removing any one of them would expose tenant data; Codex catches and rejects any doc / code change that weakens them.

| Layer | Mechanism                                                                                           | Code location                                                                                                                                           | Rejection behavior                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Authentication** — JWT verified, user identity established                                        | `backend/middleware/authenticate.js` (server.js wraps the route mount with it)                                                                          | `401 Unauthorized` for missing / invalid JWT.                                                                                         |
| 2     | **Tenant validation** — request's tenant matches the user's assigned tenant                         | `backend/middleware/validateTenant.js` → `validateTenantAccess`, applied via `router.use(validateTenantAccess)` at `backend/routes/finance.v2.js:67`    | `400` for missing / malformed `tenant_id`; `403` for tenant-mismatch (request tenant ≠ session tenant) per the middleware's contract. |
| 3     | **Per-tenant module gate** — `modulesettings.financeOps.is_enabled = true` for the request's tenant | Inline middleware at `backend/routes/finance.v2.js:69-90` calling `checkFinanceOpsEnabled({ tenantId, getSupabaseClient })` from `financeModuleGate.js` | `403` with `{ status: 'error', message: 'Finance Ops is not enabled for this tenant' }` for tenant without the flag set.              |

Plus the route-mount gate itself (`ENABLE_FINANCE_OPS=true` on the backend app) — when off, Express returns `404` because the routes aren't registered.

Plus the per-actor controls (governance decision + session-derived actor identity at `backend/routes/finance.v2.js`) that block AI actors from approval / posting / refund / money movement regardless of body-spoofed `actor_type`. The actor-spoofing prevention has its own regression coverage in `backend/__tests__/routes/finance.v2.routes.test.js`.

**3-7 does not modify any of these layers.** It only flips two flags (env + module DB row) that gate access through the existing chain. The chain runs unchanged.

---

## 8. Verification commands (operator instructions only)

The §5 procedure already inlines the key commands. This section consolidates them as the operator's checklist for §13 evidence capture.

```bash
# §5.2 confirm ENABLE_FINANCE_OPS set on the backend app (via SSH + container env inspection):
ssh andreibyf@147.189.173.237 'docker exec staging-backend-heavy printenv ENABLE_FINANCE_OPS'
# Expected: "true" exactly.

# §5.2 confirm backend booted with route mounted (via SSH + log inspection):
ssh andreibyf@147.189.173.237 'docker logs --tail 100 staging-backend-heavy 2>&1 | grep -i "finance"'
# Expected: backend startup log lines indicating the finance route was mounted; NO log line about the
# createFinanceV2Routes constructor throwing (which would indicate ENABLE_FINANCE_PERSISTENT_EVENTS=true).

# §5.3 confirm the module flag inventory for the controlled tenant only:
# (run from the staging Supabase SQL editor as service_role)
select tenant_id, module_name, is_enabled
from modulesettings
where module_name in ('financeOps', 'enterpriseFinance')
  and is_enabled = true
order by tenant_id, module_name;
# Expected (pass condition):
#   - The controlled tenant (a11dfb63-4b18-4eb8-872e-747af2e37c46) MUST have a
#     canonical 'financeOps' row with is_enabled = true.
#   - No other tenant_id may appear in the result — no other tenant has either
#     'financeOps' or 'enterpriseFinance' enabled.
# Tolerated (not a failure):
#   - The controlled tenant may additionally have an 'enterpriseFinance' alias
#     row with is_enabled = true from legacy dev work. The gate code at
#     financeModuleGate.js:29 resolves canonical-vs-alias conflicts in favor of
#     the canonical 'financeOps' row, so the runtime is unaffected.
# Fail:
#   - The controlled tenant is missing the canonical 'financeOps' row → access
#     is denied; rerun §5.3 SQL.
#   - Any other tenant appears in the result → one-tenant-only invariant
#     violated; halt per §10 and investigate.

# §5.4 controlled-tenant 200 check (curl as the controlled-tenant test user):
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <controlled-tenant-user-jwt>" \
  https://staging-api.aishacrm.com/api/v2/finance/runtime/status

# §5.5 other-tenant 403 check:
curl -s -w "%{http_code}\n%{response_body}\n" \
  -H "Authorization: Bearer <other-tenant-user-jwt>" \
  https://staging-api.aishacrm.com/api/v2/finance/runtime/status
# Expected: 403 + JSON body {"status":"error","message":"Finance Ops is not enabled for this tenant"}.

# Unauthenticated 401 check (defense-in-depth):
curl -s -o /dev/null -w "%{http_code}\n" \
  https://staging-api.aishacrm.com/api/v2/finance/runtime/status
# Expected: 401.
```

All read-only against the route surface. The only mutations are §5.2 (env var on Coolify) and §5.3 (one row in `modulesettings`) — both single-step and fully reversible per §9.

---

## 9. Rollback / disable procedure

Per [`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) §6, rollback is **a single config change** at the appropriate scope. **No code revert, no schema rollback, no data migration.**

### 9.1 Per-tenant rollback (precise — recommended)

Flip the controlled tenant's `financeOps` module flag to `false`:

```sql
update modulesettings
  set is_enabled = false, updated_at = now()
  where tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
    and module_name = 'financeOps';
```

Effect: the controlled tenant immediately loses access on the next request. The module gate returns `403` per §6. The route surface remains mounted (every other request that authenticates and reaches the route gets rejected by the module gate same as before §5.3). This is the targeted "turn it off for the one tenant" action. **No data is lost** — `finance.audit_events`, `finance.projection_state`, the worker's poll loop, the worker's heartbeat all continue unchanged.

### 9.2 Environment kill switch (full — coarser)

Unset `ENABLE_FINANCE_OPS` (or set it to anything other than the literal string `'true'`) on `staging-backend-heavy` in Coolify and redeploy:

Effect: the entire `/api/v2/finance/*` surface unmounts. Express returns `404` for any request, regardless of tenant or auth. The worker is unaffected (separate Coolify app, separate env block).

**Use 9.1 by default.** Use 9.2 only when the route surface itself is the problem (a bug in `createFinanceV2Routes`, a leaking gate, an unexpected log signal).

### 9.3 Rollback is config / module-toggle only

- **No code revert required.** All Phase 3 activation is environment-variable + module-flag driven on top of code already merged and verified at the Phase 3 baseline `3c60d9ff`. A Phase 3-7 rollback does not require reverting any commit.
- **No schema rollback required.** No migration was applied by 3-7; rolling back the route or the module flag doesn't roll back migrations 172/173/174/175 (which 3-2 applied).
- **No customer impact.** The controlled tenant is staging-only; no production tenant ever had access; rollback affects only the controlled staging tenant's access to the staging route.

---

## 10. Stop conditions

Phase 3-7 stop conditions are the subset of the Phase 3 scaffold stop conditions ([`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §10.3) that apply to route activation. Any of the following halts and triggers rollback per §9:

- §5.2 backend redeploy fails with the `createFinanceV2Routes` constructor `Error` about `ENABLE_FINANCE_PERSISTENT_EVENTS` — the flag is accidentally set; unset it on `staging-backend-heavy` and redeploy.
- §5.2 backend redeploy fails for any other reason (image pull failure, DB connection refused, etc.) — investigate via Coolify deploy log; the route mount didn't succeed.
- §5.4 controlled-tenant request returns `403` after §5.3 ran — module flag isn't set correctly; re-run the SQL and verify the row.
- §5.4 controlled-tenant request returns `404` after §5.2 ran — route surface didn't mount; check `ENABLE_FINANCE_OPS` value (literal `'true'`) and confirm the backend redeploy actually happened.
- §5.5 a non-controlled tenant gets `200` instead of `403` — **critical**: "one tenant only" invariant is violated. Halt; verify §5.3 SQL didn't accidentally touch another tenant's row; verify `modulesettings.financeOps` flag is only set for `a11dfb63-...`.
- A production tenant's `modulesettings.financeOps` row is touched — instant halt; production is out of scope for the entire Phase 3 arc.
- Production env (`prd_prd` Doppler, Hetzner backend, production tenants) is touched in any way — instant halt.
- `ENABLE_FINANCE_PERSISTENT_EVENTS` is set anywhere — backend startup refuses; halt and revert.
- The actor-spoofing prevention regression test (`backend/__tests__/routes/finance.v2.routes.test.js`) fails — code-level guarantee is broken; halt before any further activation.

---

## 11. Hard constraints (explicit restatement)

| Constraint                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Source                     | Status this task          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------- |
| **No actual route activation performed by this task.** This document is the runbook; execution is a separately authorized operator action.                                                                                                                                                                                                                                                                                                                                | 3-7 scope                  | Confirmed — runbook only. |
| **No env var changes.** §2 explicit "None" row for `ENABLE_FINANCE_OPS`, `ENABLE_FINANCE_PERSISTENT_EVENTS`, and Doppler `stg_stg` in general.                                                                                                                                                                                                                                                                                                                            | 3-7 acceptance             | Confirmed.                |
| **No tenant / module flag changes.** §2 explicit "None" row for `modulesettings.financeOps` on the controlled tenant and on every other tenant.                                                                                                                                                                                                                                                                                                                           | 3-7 acceptance             | Confirmed.                |
| **No Coolify / VPS mutation.**                                                                                                                                                                                                                                                                                                                                                                                                                                            | 3-7 acceptance             | Confirmed.                |
| **No migration application.**                                                                                                                                                                                                                                                                                                                                                                                                                                             | 3-2 scope                  | Confirmed.                |
| **No worker changes.** Phase 3-5 (worker activation) and 3-7 (route activation) are independent. 3-7 does not modify `staging-finance-projection-worker` env or restart it.                                                                                                                                                                                                                                                                                               | 3-7 scope                  | Confirmed.                |
| **No provider writes.** No adapter worker exists (deferred until adapter Slice 2). The route mounting does not write to any provider.                                                                                                                                                                                                                                                                                                                                     | Phase 3-1 §9               | Confirmed.                |
| **No production action.** Hetzner is not touched; `prd_prd` Doppler is not opened; no production tenant's `modulesettings.financeOps` row is queried or modified.                                                                                                                                                                                                                                                                                                         | Phase 3-1 §8               | Confirmed.                |
| **`ENABLE_FINANCE_PERSISTENT_EVENTS` remains `false` (unset) on the backend.** The Slice 1 fail-closed guard at `backend/routes/finance.v2.js:48` enforces this structurally — backend startup throws if it's true. Lifting this guard is gated on projection-backed reads landing in Slice 2, not 3-7.                                                                                                                                                                   | Phase 3-1 §7               | Confirmed.                |
| **Route persistent-events writes do NOT activate in 3-7.** The route's business reads continue to come from the in-memory event store inside `financeDomainService`. Activating persistent writes requires both the Slice 2 guard lift AND a separate `ENABLE_FINANCE_PERSISTENT_EVENTS=true` decision — neither is in 3-7 scope.                                                                                                                                         | Slice 1 / Slice 2 boundary | Confirmed.                |
| **One controlled tenant only.** `modulesettings.financeOps` is set for `a11dfb63-4b18-4eb8-872e-747af2e37c46` and **no other tenant**. The "one tenant only" invariant is structurally enforced by the per-tenant module gate at `backend/routes/finance.v2.js:69-90` — every other tenant is rejected with `403`.                                                                                                                                                        | Phase 3-1 §3 / 2C-13 §2    | Confirmed.                |
| **Auth + tenant + module-gate chain remains mandatory.** §7 explicitly enumerates the three controls and the route-mount gate; 3-7 does not modify any of them.                                                                                                                                                                                                                                                                                                           | 3-7 scope                  | Confirmed.                |
| **Rollback is config / module-toggle only.** §9 documents both per-tenant (preferred) and environment kill switch (coarser); neither requires code revert, schema rollback, or data migration.                                                                                                                                                                                                                                                                            | 3-7 acceptance             | Confirmed.                |
| **Lines up with Phase 3-8 smoke-test prerequisites without creating the smoke-test doc yet.** §6 explicitly delegates the broader smoke matrix (draft invoice, balanced/unbalanced journal, AI approval block) to 3-8 per [`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) §5. 3-7 verifies only §5.4 (controlled-tenant 200) and §5.5 (other-tenant 403) to confirm the activation worked; the full smoke test runs in 3-8 against the same route. | 3-7 / 3-8 boundary         | Confirmed.                |

---

## 12. Acceptance for Phase 3-7 (this task)

This document is the Phase 3-7 deliverable when paired with the matching CHANGELOG entry and the scaffold update. Acceptance for the **runbook** (this task):

- [x] Exact route activation sequence documented as a dry run (§5 — 6 sub-steps with rollback per step)
- [x] No route activation performed by this task — §2 explicit "None" for every modality
- [x] `ENABLE_FINANCE_PERSISTENT_EVENTS` kept `false`/unset and fail-closed via the constructor throw at `backend/routes/finance.v2.js:48` (§3 prereq, §4 unchanged-things, §5.6 explicit "do NOT touch", §11)
- [x] `ENABLE_FINANCE_OPS=true` documented as the route-mount gate but NOT changed (§4 change table, §5.2 procedure, §11)
- [x] `financeOps` module enablement for the controlled tenant only documented but NOT changed (§4 change table, §5.3 procedure with strict-scope reminder, §11)
- [x] Expected disabled-tenant behavior documented (§6 status-code matrix — `404` route-unmounted, `403` module-gate-rejection, `401` unauthenticated, `400`/`403` tenant-mismatch)
- [x] Expected controlled-tenant behavior post-activation documented (§6 — `200` from runtime status, smoke matrix delegated to 3-8)
- [x] Auth + tenant + module-gate chain documented as mandatory (§7 — three layers + route-mount + actor-identity)
- [x] Rollback / disable procedure documented as config / module-toggle only (§9 — per-tenant preferred, environment kill switch coarser, neither requires code or schema change)
- [x] Operator-only verification commands included (§5 inline + §8 consolidated)
- [x] Lines up with Phase 3-8 smoke-test prerequisites without creating the smoke-test doc yet (§6 + §11)
- [x] CHANGELOG entry recording Phase 3-7 (separate change)
- [x] Scaffold updated with commit hash and next active item

Acceptance for the **execution** (a future, separately-authorized operator action): every check in §5 + §8 PASS, the route surface is mounted on `staging-backend-heavy`, the controlled tenant gets `200`, every other tenant gets `403`, no production action occurred, no persistent-events flag was set.

---

## 13. Evidence pack (populated on execution)

When the activation is executed, capture verbatim outputs here (or in a linked evidence record under `docs/architecture/finance/phase-3-evidence/`). Until execution, the table below is empty.

| Step                          | Run at (UTC) | Operator | Result (PASS / FAIL / DEFERRED)            | Output / evidence link | Notes |
| ----------------------------- | ------------ | -------- | ------------------------------------------ | ---------------------- | ----- |
| §5.1                          |              |          |                                            |                        |       |
| §5.2                          |              |          |                                            |                        |       |
| §5.3                          |              |          |                                            |                        |       |
| §5.4                          |              |          |                                            |                        |       |
| §5.5                          |              |          |                                            |                        |       |
| §5.6                          |              |          | N/A (confirms absence; no positive action) |                        |       |
| §8 — backend env confirm      |              |          |                                            |                        |       |
| §8 — backend log confirm      |              |          |                                            |                        |       |
| §8 — modulesettings inventory |              |          |                                            |                        |       |
| §8 — controlled tenant 200    |              |          |                                            |                        |       |
| §8 — other tenant 403         |              |          |                                            |                        |       |
| §8 — unauthenticated 401      |              |          |                                            |                        |       |

Next packet (once §5 + §8 PASS): **Phase 3-8 — Execute staging smoke tests for Finance Ops route/runtime** (the full 8-check sequence from [`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) §5).
