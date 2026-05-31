# Finance Ops RBAC and Access Matrix design freeze (Track E)

**Status:** Design / documentation only. No code change. No backend route mounted. No env-var change. No migration applied. No role gate that does not exist at the backend today is documented as if it does.
**Branch:** `docs/finance-ops-rbac-access-matrix` (cut from `main`).
**Companion to:** `finance-ui-slice-1-read-only-console-design.md` (§11 access posture), `phase-4-1-persistent-events-projection-reads-design.md` (route lift + projection-backed reads), and the Track C operator copy guide (which surfaces what each role sees, not what each role is allowed to do).
**Live-execution posture:** None across the board (see §2).

---

## 1. Purpose and scope

The Finance Operations surface is governed by three orthogonal gates (process-level `ENABLE_FINANCE_OPS`, the `validateTenantAccess` middleware, and the per-tenant `financeOps` module gate) plus a frontend `hasPageAccess` mirror. The gate stack has **no finance-specific role check today** — every authenticated user of an enrolled tenant clears the route. That posture is by design per Slice 1 §11.3 (frontend matches backend; no frontend role gate that diverges), but it is also easy to misremember as "we already enforce finance-admin / finance-viewer separation," which we do not.

This packet is the design freeze for the access model. It is the single source of truth for:

- The role taxonomy used to discuss Finance Ops permissions (§4).
- How the `financeOps` Module Settings toggle and tenant module rows (canonical + legacy alias) interact with each role (§5).
- A role × surface matrix that names every cell as Implemented, Deferred, or N/A (with the formerly "on-branch" cells now merged to `main` via #624) and cites the gate that enforces it (§6).
- The frontend ↔ backend parity rules that prevent drift between the two layers (§7).
- The list of deferred role-gates / permissions plus the binding rule that any future role gate must land at the backend route layer first, then the frontend mirror — never frontend-only (§8).

**Scope:**

- Documentation / design only.
- Applies to Finance Ops surfaces (`backend/routes/finance.v2.js`, `src/components/finance/*`, `src/pages/FinanceOps.jsx`, Module Settings, per-user navigation permission editors).
- Reflects the current code on `main` (HEAD `34e7c0a`), which now includes the Finance Read API Slice 1 (#623, `40ccb7e8`) and the selective `feat/finance-ops-ux-preview` reconciliation (#624, `4487acec`). The UI / nav / seed work this doc originally tracked as "Impl on-branch" has therefore **merged to `main`** and is labelled **Impl** below; the `feat/finance-ops-ux-preview` branch itself was abandoned after the reconciliation.

**Scope-boundary — explicit non-goals:**

- No code change. No `backend/routes/finance.v2.js`, no `src/utils/permissions.js`, no `src/components/shared/ModuleManager.jsx` edits in this packet.
- No documenting of a role gate that does not exist at the backend as if it does. A finance-admin / finance-viewer split is **not** enforced today and this guide marks it Deferred everywhere.
- No `ENABLE_FINANCE_PERSISTENT_EVENTS` flip. No `FINANCE_PROVIDER_WRITES_ENABLED` flip. No `ENABLE_FINANCE_OPS` flip.
- No migration application. No staging / Coolify / Doppler mutation. No provider writes. No production action.
- No push without Andrei's explicit authorisation.

---

## 2. Live-execution posture

| What                                                                | Status                                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Code change                                                         | None.                                                                                                                               |
| Backend semantic change                                             | None.                                                                                                                               |
| New POST / PATCH / DELETE helper                                    | None.                                                                                                                               |
| Approve / reject / reverse / replay / sync / retry / cancel control | None.                                                                                                                               |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` flip                             | None — boot-time split-brain guard at `backend/routes/finance.v2.js:108-116` (throws at startup, not a request-time 404) preserved. |
| `FINANCE_PROVIDER_WRITES_ENABLED` flip                              | None — default-closed kill switch preserved.                                                                                        |
| `ENABLE_FINANCE_OPS` flip                                           | None — process-level mount gate unchanged.                                                                                          |
| Migration application                                               | None.                                                                                                                               |
| Staging / Coolify / Doppler mutation                                | None.                                                                                                                               |
| Provider write (ERPNext / any tier)                                 | None.                                                                                                                               |
| Production / staging action                                         | None.                                                                                                                               |
| Implies backend enforcement that does not exist                     | No (this guide is the rule that prevents that implication).                                                                         |

All 16 Phase 3-13 §7 safety guardrails are preserved end-to-end by this packet.

---

## 3. Prerequisites

- Slice 1 access contract (`finance-ui-slice-1-read-only-console-design.md` §11.3) — the frontend matches the backend; no frontend role gate that diverges.
- The three-gate access stack, plus a **separate** boot-time safety guard (do not conflate the mount flag with the persistent-events guard — they are different env vars with different failure modes):
  1. **Mount gate — `ENABLE_FINANCE_OPS`** (`backend/server.js:531-543`): the Finance v2 router is mounted only when `isFinanceRuntimeEnabled()` (i.e. `ENABLE_FINANCE_OPS === 'true'`). When it is not set, the routes are **entirely absent** and `/api/v2/finance/*` returns **404 at request time**.
  2. `validateTenantAccess` middleware (`backend/middleware/validateTenant.js`) — authenticated tenant + tenant match. Superadmin reads pass for any tenant.
  3. Per-tenant `financeOps` module gate (`backend/lib/finance/financeModuleGate.js`) — checks the `modulesettings` row. Canonical-wins resolution between `financeOps` and the legacy `enterpriseFinance` alias at `financeModuleGate.js:40-48`.
  - **Separate split-brain guard (not an access gate) — `ENABLE_FINANCE_PERSISTENT_EVENTS`** (`backend/routes/finance.v2.js:108-116`): when the router is being constructed (only happens under `ENABLE_FINANCE_OPS=true`), `createFinanceV2Routes` **throws at startup** if `ENABLE_FINANCE_PERSISTENT_EVENTS === 'true'`. This is a loud **boot-time failure, not a request-time 404**, and exists because writes would persist to Postgres while reads still hit the in-memory bucket. Lifted when projection-backed reads land (Slice 2).
- Frontend `hasPageAccess` mirror (`src/utils/permissions.js`) — three checks: `crm_access`, `moduleSettings` matching via `moduleMapping` + `moduleAliases`, then a role-default table. The module-gate and role-default checks mirror the backend. **The `crm_access === false` check is frontend-only, though** (`permissions.js:306` — `FinanceOps` is not in `pagesAllowedWithoutCRM`): the backend stack (`validateTenantAccess` + the `financeOps` module gate) **never inspects `crm_access`** (it appears nowhere in `finance.v2.js` / `validateTenant.js` / `financeModuleGate.js`). So for a `crm_access:false` user the mirror is _stricter_ than the backend — it hides the nav entry, but that user can still call `/api/v2/finance/*` directly and the backend will serve them. The divergence is fail-closed on the frontend (safe for UX), but the backend, not the mirror, is the real access boundary. See §7.6.
- The UI / nav / seed additions originally authored on `feat/finance-ops-ux-preview` are **now on `main`** (merged via #624, `4487acec`):
  - `src/utils/permissions.js` role defaults include `FinanceOps: true` for all four roles (`:473`, `:511`, `:548`, `:582` — the Codex UI-1D P1 fix).
  - `src/components/settings/UserFormWizard.jsx` `NAV_MODULES` / `DEFAULT_NAV_PERMISSIONS` include `FinanceOps` (`:151`, `:275`) so admins can grant / revoke per user.
  - `src/components/shared/ModuleManager.jsx` exposes a Finance Operations toggle keyed by the canonical `financeOps` key via `moduleKey` (`:376-381`, `moduleKeyOf` at `:400`).
  - `backend/routes/tenants.js` exports `DEFAULT_DISABLED_MODULES = ['financeOps']` (`:222`), `buildDefaultModuleRows` (`:269`), `MODULESETTINGS_ALIASES` (`:232`), and the alias-aware `selectMissingDefaultRows` (`:247`). The backfill script (`backend/scripts/debug/backfill-module-settings.js`) uses the alias-aware filter so legacy-enrolled tenants are not silently revoked.
- The four Phase 3-13 §7 safety guardrails (persistent-events fail-closed, provider-writes default-closed, sandbox-only ERPNext, production-not-authorized) are preserved end-to-end across the whole access model.

---

## 4. Role taxonomy

For each role: how it is identified in the data model, the expected behaviour at every layer, and Implemented today vs Deferred (with file:line citations for Implemented).

### 4.1 Superadmin

- **Identification:** `users.role === 'superadmin'` OR `users.metadata.is_superadmin === true` OR `users.role` normalises to `superadmin` (case-insensitive) — `backend/middleware/validateTenant.js:18-20` (`isSuperadminUser`).
- **Process-level mount gate (`ENABLE_FINANCE_OPS`):** Like every role, requires the env-var to be `'true'` for the route to register. **Implemented** (`backend/routes/finance.v2.js` route registration only when the env-var is set).
- **`validateTenantAccess`:** Cross-tenant reads pass automatically. **Implemented** at `backend/middleware/validateTenant.js:105-110` (read methods early-return next for superadmin).
- **Per-tenant `financeOps` module gate:** No bypass. Even superadmin reads of a tenant that has the `financeOps` row disabled get a 403. **Implemented** — the gate runs after `validateTenantAccess` and applies to every request including superadmin's. Test coverage (`src/utils/__tests__/permissions.financeOps.test.js`, now on `main` via #624) locks the "superadmin still respects a disabled per-tenant `financeOps` row when a tenant is selected" assertion.
- **Frontend nav visibility:** Visible in global view (no tenant selected) by `hasPageAccess` line 291. Visible per-tenant only when the module gate would clear; the frontend mirror does not bypass. **Implemented** (`src/utils/permissions.js:291`).
- **Write actions:** The six mutating routes that already exist (§6 ¹) carry **no role check** — only the tenant + module gate — so superadmin reaches them by default today; the genuinely-future actions (reject / replay / adapter retry / cancel / provider-sync) have no route yet. **Deferred** — any role-restricted write action must land its role check at the backend route layer per §8.

### 4.2 Tenant admin

- **Identification:** `users.role === 'admin'` OR `employees.role === 'admin'` (case-normalised). `backend/middleware/validateTenant.js:4-16` (`normalizeRole`).
- **Process-level mount gate:** Same — needs `ENABLE_FINANCE_OPS=true`.
- **`validateTenantAccess`:** Must have a `tenant_id` assigned and the requested tenant must match. **Implemented** at `backend/middleware/validateTenant.js:138-165`.
- **Per-tenant `financeOps` module gate:** Same per-tenant rule. **Implemented**.
- **Module Settings:** A tenant admin can toggle the `financeOps` module on or off for their own tenant via the existing admin-gated `POST /api/modulesettings` route (auth: `requireAdminRole` at `backend/middleware/validateTenant.js:192-223`). **Implemented** on `main` — the canonical-key entry merged via #624; the row mutation itself is in the existing admin API.
- **Frontend nav visibility:** Subject to the same module gate + the `crm_access` precondition + the role-default table. The role-default table includes `FinanceOps: true` for admin (`src/utils/permissions.js:473`). **Implemented** (on `main` via #624).
- **Write actions:** No backend role check on the six existing write routes (§6 ¹); reachable by the tenant + module gate alone, like every other enrolled-tenant caller. Role differentiation **Deferred** per §8.

### 4.3 Finance admin / operator

- **Identification:** No dedicated role exists today. A "finance admin" is operationally a tenant admin who happens to focus on finance; the data model carries no `finance_admin` role and the backend enforces none.
- **Process-level mount gate, `validateTenantAccess`, per-tenant module gate:** Same as every other role — pass if and only if the three gates clear.
- **Frontend nav visibility:** Equal to any other role of an enrolled tenant — Slice 1 §11.3 binds "surfaced to any user of an enrolled tenant." **Implemented** (on `main` via #624) via the `FinanceOps: true` role defaults.
- **Write actions:** The six write routes that already exist — create/update draft invoice, create journal draft, simulate deal-won, **reverse**, **approve** (`finance.v2.js:492-580`) — are reachable by this role today with **no dedicated finance-admin role check** (§6 ¹); reject / replay / adapter retry / cancel / provider-sync have no route yet. A finance-admin role check must be **retrofitted** onto the live routes (backend-first, §8), not just added to future ones. **Deferred.**

### 4.4 Finance viewer

- **Identification:** No dedicated role exists today.
- **Process-level mount gate, `validateTenantAccess`, per-tenant module gate:** Same.
- **Frontend nav visibility:** Equal to any other role; no read-only-vs-read-write distinction is enforced.
- **Write actions:** No role gate exists, so a finance viewer can currently reach the six existing write routes (§6 ¹) exactly like any enrolled-tenant caller — the read-only intent is **not enforced** at the backend today. A real finance-viewer role would explicitly DENY them; that gate is **Deferred** and must land backend-first (§8), the frontend hiding the affordance only as a UX mirror.

### 4.5 Non-finance user (any other employee of the tenant)

- **Identification:** `employees.role` is any of `employee`, `manager`, or an industry-specific role (e.g., `worker`, `support`) AND `crm_access !== false`.
- **Process-level mount gate, `validateTenantAccess`, per-tenant module gate:** Same.
- **Frontend nav visibility:** **Implemented** (on `main` via #624). The Codex UI-1D P1 fix added `FinanceOps: true` to all four role-default tables in `src/utils/permissions.js` (`:473`, `:511`, `:548`, `:582`), mirroring the backend's "any enrolled-tenant user passes" contract. (Before #624 this was Deferred / implicit-deny on `main`, because the role-default tables did not list `FinanceOps` and the nav fell through to `false`.)
- **Backend reach:** If they hit `/api/v2/finance/runtime/status` directly (e.g., via developer tools), the route clears them so long as the tenant module gate is enabled. This is by design per Slice 1 §11.3 — the access decision is made by the backend, not by the navigation menu.
- **Write actions:** Same as finance viewer — the six existing write routes are reachable with no role gate today (§6 ¹); a future role split would DENY them, gated backend-first. **Deferred.**

### 4.6 Dev-mode mock superadmin

- **Identification:** When `process.env.NODE_ENV === 'development'` AND `req.user` is unset, `validateTenantAccess` injects `{ id: 'local-dev-superadmin', email: 'dev@localhost', role: 'superadmin', tenant_id: null }` — `backend/middleware/validateTenant.js:53-61`. The same mock fires for `requireAdminRole` (lines 195-204), `requireAdminOrManagerRole` (lines 235-244), and `requireSuperAdminRole` (lines 320-329).
- **Behaviour:** All Finance Ops reads pass at the tenant + module layer when the dev DB has an enabled `financeOps` row for the selected tenant; same per-tenant rule applies (the dev-mock does not bypass the module gate).
- **Production posture:** This injection ONLY fires when `NODE_ENV === 'development'`. Production deployments never trigger it. **Implemented** at the exact lines cited.
- **Operator-facing note:** This is a development convenience, not a production behaviour. Track C operator copy must not surface this to a customer-side finance admin.

---

## 5. Module gating interactions

### 5.1 The `financeOps` Module Settings toggle

- The toggle lives in `src/components/shared/ModuleManager.jsx` (`:376-381`). It carries an explicit `moduleKey: 'financeOps'` (resolved by `moduleKeyOf` at `:400`) so the row written to `modulesettings.module_name` matches the backend gate's canonical key exactly (not the display name). **Implemented** (on `main` via #624).
- Authorisation: the toggle's mutation route (`POST /api/modulesettings`) requires `requireAdminRole` (`backend/middleware/validateTenant.js:192-223`) — admin or superadmin only. **Implemented** on `main`.
- Default state for new tenants: the `financeOps` row is seeded `is_enabled: false` via `DEFAULT_DISABLED_MODULES` (`backend/routes/tenants.js:222`) + `buildDefaultModuleRows` (`:269`). This preserves the per-tenant gate's meaning — Finance Ops stays off until an admin turns it on. **Implemented** (on `main` via #624).

### 5.2 Canonical vs alias resolution

- Backend gate: `financeOps` is the canonical key; `enterpriseFinance` is the legacy alias. When both rows exist with conflicting `is_enabled`, the canonical wins (`backend/lib/finance/financeModuleGate.js:40-48`). **Implemented**.
- Frontend mirror: `src/utils/permissions.js:362-378` mirrors the canonical-wins rule.
- Auto-seed / backfill alias-aware filter: `selectMissingDefaultRows` (`backend/routes/tenants.js:247`) + `MODULESETTINGS_ALIASES` (`:232`) + the matching `computeMissingModules` in `ModuleManager.jsx` (`:418`) prevent the auto-create path from inserting a disabled canonical row when only the legacy alias exists. Without this, alias-enrolled tenants would silently lose Finance Ops on Settings open or on backfill. **Implemented** (on `main` via #624 — the Codex P1 fix).

### 5.3 First-user / superadmin dev access

- Dev container: `ENABLE_FINANCE_OPS=true` is set at the process level so the Finance v2 route registers. The dev-container DB has the tenant rows seeded; the dev-mock superadmin clears `validateTenantAccess`; the only remaining gate is whether the tenant's `financeOps` row is enabled.
- Supported dev enablement options (no production shortcut implied):
  - POST `/api/modulesettings` as the authenticated dev superadmin with `{ tenant_id, module_name: 'financeOps', is_enabled: true }` — the existing admin-gated upsert.
  - `npm run db:exec` with an idempotent SQL upsert against the dev DB (`backend/.env` `DATABASE_URL`).
  - The Module Settings UI toggle (on `main` via #624).
- Production posture: none of the above shortcuts are authorised for production. Production activation remains gated by Phase 4-20 / Phase 4-21 per the Phase 4 production-pilot freeze.

---

## 6. Role × surface matrix

Rows = roles. Columns = surfaces. Cells use four legends:

- **Impl** — Implemented today on `main` with file:line citation.
- **Impl (#624)** — Implemented; merged to `main` through the selective `feat/finance-ops-ux-preview` reconciliation (#624, `4487acec`). This doc originally labelled these cells "Impl on-branch"; that branch has since merged (and was then abandoned), so **no cell is "on-branch" any more**.
- **Defer** — Not implemented; the matrix records that no enforcement exists. A future implementation packet must land its enforcement at the backend route layer first per §8.
- **N/A** — The surface does not apply to this role (e.g., dev-mock-superadmin's data-model identity).

**Write surfaces are split into two groups, because some already exist.** `backend/routes/finance.v2.js` already mounts six mutating routes in the same commit tree — `POST /draft-invoices` (`:492`), `PATCH /draft-invoices/:id` (`:508`), `POST /journal-drafts` (`:525`), `POST /simulate/deal-won` (`:541`), `POST /journal-entries/:id/reverse` (`:557`), and `POST /approvals/:id/approve` (`:574`). These are **Impl**, not Defer, but they carry **no role-differentiated authorization**: they share the exact gate stack as the reads (`router.use(validateTenantAccess)` then the `financeOps` module gate, `:127-145`), and `buildActor(req)` derives identity for audit/AI-governance only — it does not authorize. So any caller who clears those two gates (including a finance _viewer_ or a non-finance _employee_ of an enrolled tenant) can reach approve / reverse / create today. The genuinely-future write actions (reject / replay / adapter retry / cancel / provider-sync) have **no backend route** yet and stay **Defer** for every role. Both groups appear below so the matrix is the true single source of truth for the write surface, not just forward-compatible.

| Surface ↓ / Role →                                                  | Superadmin                                              | Tenant admin                        | Finance admin / operator                                                 | Finance viewer      | Non-finance user (employee) | Dev-mock superadmin                           |
| ------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ | ------------------- | --------------------------- | --------------------------------------------- |
| Backend route mount (`ENABLE_FINANCE_OPS=true`)                     | Impl (route registration)                               | Impl                                | Impl                                                                     | Impl                | Impl                        | Impl (only when `NODE_ENV=development`)       |
| `validateTenantAccess` — read methods                               | Impl (`validateTenant.js:105-110` superadmin GET pass)  | Impl (`:138-165` tenant match)      | Impl (same as tenant admin)                                              | Impl (same)         | Impl (same)                 | Impl (mock injection at `:53-61`)             |
| Per-tenant `financeOps` module gate (canonical)                     | Impl (no bypass — `finance.v2.js:69-85`)                | Impl                                | Impl                                                                     | Impl                | Impl                        | Impl (no bypass — the dev-mock does not skip) |
| Per-tenant gate — alias-aware lookup                                | Impl (`financeModuleGate.js:40-48` canonical-wins)      | Impl                                | Impl                                                                     | Impl                | Impl                        | Impl                                          |
| Per-tenant gate — alias-aware **auto-seed**                         | Impl #624 (`tenants.js:247` `selectMissingDefaultRows`) | Impl #624                           | Impl #624                                                                | Impl #624           | Impl #624                   | Impl #624                                     |
| Frontend nav visibility (no tenant selected)                        | Impl (`permissions.js:291` superadmin global)           | N/A (admins are scoped to a tenant) | N/A                                                                      | N/A                 | N/A                         | Impl (when `NODE_ENV=development`)            |
| Frontend nav visibility (tenant selected)                           | Impl #624 (role-default + module-gate mirror)           | Impl #624                           | Impl #624                                                                | Impl #624           | Impl #624                   | Impl #624                                     |
| `crm_access` precondition (**frontend-only** ²)                     | FE-only (`permissions.js:306`)                          | FE-only                             | FE-only                                                                  | FE-only             | FE-only                     | FE-only                                       |
| Page render (`/FinanceOps`) — runtime overview                      | Impl                                                    | Impl                                | Impl                                                                     | Impl                | Impl                        | Impl                                          |
| Ledger summary read (`/ledger`/`/profit-loss`/`/balance-sheet`)     | Impl                                                    | Impl                                | Impl                                                                     | Impl                | Impl                        | Impl                                          |
| Journal entries read (`/journal-entries`)                           | Impl                                                    | Impl                                | Impl                                                                     | Impl                | Impl                        | Impl                                          |
| Runtime/status read (`/runtime/status`)                             | Impl                                                    | Impl                                | Impl                                                                     | Impl                | Impl                        | Impl                                          |
| **Write routes that already exist** (no role gate — see ¹)          |                                                         |                                     |                                                                          |                     |                             |                                               |
| Create draft invoice (`POST /draft-invoices`, `:492`)               | Impl, no role gate¹                                     | Impl, no role gate¹                 | Impl, no role gate¹                                                      | Impl, no role gate¹ | Impl, no role gate¹         | Impl (dev)¹                                   |
| Update draft invoice (`PATCH /draft-invoices/:id`, `:508`)          | Impl, no role gate¹                                     | Impl, no role gate¹                 | Impl, no role gate¹                                                      | Impl, no role gate¹ | Impl, no role gate¹         | Impl (dev)¹                                   |
| Create journal draft (`POST /journal-drafts`, `:525`)               | Impl, no role gate¹                                     | Impl, no role gate¹                 | Impl, no role gate¹                                                      | Impl, no role gate¹ | Impl, no role gate¹         | Impl (dev)¹                                   |
| Simulate deal-won (`POST /simulate/deal-won`, `:541`)               | Impl, no role gate¹                                     | Impl, no role gate¹                 | Impl, no role gate¹                                                      | Impl, no role gate¹ | Impl, no role gate¹         | Impl (dev)¹                                   |
| Reverse journal entry (`POST /journal-entries/:id/reverse`, `:557`) | Impl, no role gate¹                                     | Impl, no role gate¹                 | Impl, no role gate¹                                                      | Impl, no role gate¹ | Impl, no role gate¹         | Impl (dev)¹                                   |
| Approve finance action (`POST /approvals/:id/approve`, `:574`)      | Impl, no role gate¹                                     | Impl, no role gate¹                 | Impl, no role gate¹                                                      | Impl, no role gate¹ | Impl, no role gate¹         | Impl (dev)¹                                   |
| **Write actions with no backend route today** (genuinely future)    |                                                         |                                     |                                                                          |                     |                             |                                               |
| Reject finance action                                               | Defer (no route)                                        | Defer (no route)                    | Defer (no route)                                                         | Defer (no route)    | Defer (no route)            | Defer (no route)                              |
| Replay                                                              | Defer (no route)                                        | Defer (no route)                    | Defer (no route)                                                         | Defer (no route)    | Defer (no route)            | Defer (no route)                              |
| Adapter retry / cancel                                              | Defer (no route)                                        | Defer (no route)                    | Defer (no route)                                                         | Defer (no route)    | Defer (no route)            | Defer (no route)                              |
| Provider-sync trigger                                               | Defer (no route)                                        | Defer (no route)                    | Defer (no route)                                                         | Defer (no route)    | Defer (no route)            | Defer (no route)                              |
| Module Settings toggle (`POST /api/modulesettings`)                 | Impl (`requireAdminRole`)                               | Impl                                | Defer (no dedicated finance-admin role check today; falls back to admin) | Defer               | Defer                       | Impl (mock fires for `requireAdminRole`)      |
| Per-user `navigation_permissions` edit                              | Impl (`requireAdminRole`)                               | Impl                                | Defer                                                                    | Defer               | Defer                       | Impl                                          |
| Tenant-default `navigation_permissions` edit                        | Impl (`requireAdminRole`)                               | Impl                                | Defer                                                                    | Defer               | Defer                       | Impl                                          |

¹ **No role-differentiated authorization exists at the route layer for the six existing write routes.** They share the exact gate stack as the reads above (`router.use(validateTenantAccess)` then the `financeOps` module gate, `finance.v2.js:127-145`); `buildActor(req)` derives the actor identity for audit / AI-governance only — it does not authorize. Any caller who clears those two gates can reach create / reverse / approve, including a finance _viewer_ or a non-finance _employee_ of an enrolled tenant. "Impl (dev)" marks that in `NODE_ENV=development` the dev-mock superadmin clears `validateTenantAccess` the same way. The finance-admin vs finance-viewer split (§8.1) must **retrofit** a role check onto these existing routes — not merely gate new ones — and back it with route tests that assert a viewer/employee is denied.

² **The `crm_access` precondition is enforced only in the frontend** (`permissions.js:306`; `FinanceOps` is absent from `pagesAllowedWithoutCRM`, so a `crm_access:false` user is denied the nav entry — coverage in `permissions.financeOps.test.js:229-234`). The backend Finance Ops stack never inspects `crm_access`, so that same user can still call `/api/v2/finance/*` directly and be served. The cell is therefore `FE-only`, not `Impl`: it is a UX-only, fail-closed mirror with **no backend enforcement behind it**. A future role-gate packet that wants `crm_access` to actually block API access must add a backend check (§7.6, §8.2).

Notes on the matrix:

- The alias-aware auto-seed and tenant-selected nav-visibility cells (previously "Impl on-branch") **merged to `main` via #624** (`4487acec`) and are now **Impl**; the `feat/finance-ops-ux-preview` branch was abandoned after the reconciliation. No matrix cell is "on-branch" any more.
- The six existing write routes are **Impl with no role gate** (¹), not Defer — a prior version of this matrix incorrectly listed all write actions as future-only. Only reject / replay / adapter retry / cancel / provider-sync have no backend route today and remain "Defer (no route)". The §8 binding rule names how the no-route cells become "Impl" when those routes land, and how the existing routes acquire a role gate.
- The matrix does NOT separate "ledger read" from "P&L read" or "balance-sheet read" because the three GETs share the same gate stack and shipping branch; treating them as one row is honest.
- "N/A" cells reflect a structural fact (e.g., admins are always scoped to a tenant; there is no "global view" for them), not a permissions denial.

---

## 7. Frontend ↔ backend parity rules

### 7.1 No frontend role gate that diverges from the backend

- The backend route stack has no finance-specific role check today. The frontend `hasPageAccess` mirror does not invent a finance _role_ gate either.
- One non-role precondition does diverge: the frontend `crm_access` check has no backend counterpart (§7.6). It is fail-closed (the frontend denies more than the backend), so it cannot grant what the backend denies — but it is documented so it is not mistaken for server-side enforcement.
- Slice 1 §11.3 binds this rule: any future role gate (or a real `crm_access` block) must land at the backend route layer before any frontend mirror.

### 7.2 Canonical-wins resolution parity

- Backend: `financeOps` row's `is_enabled` decides; the alias row only decides when no canonical row exists (`financeModuleGate.js:40-48`).
- Frontend: `src/utils/permissions.js:362-378` mirrors this exact rule for `hasPageAccess`.

### 7.3 Alias-aware seed rule

- The frontend auto-create-on-Settings-load path and the backend backfill script MUST both treat the presence of either the canonical key OR a registered alias as "module already configured" so they do not insert a disabled canonical row that would override an alias-enabled tenant. **Implemented** (on `main` via #624) as `computeMissingModules` (`ModuleManager.jsx:418`) + `selectMissingDefaultRows` (`tenants.js:247`).

### 7.4 The exact module-gate denial message is part of the contract

- The backend returns 403 with the exact message `Finance Ops is not enabled for this tenant` (`backend/routes/finance.v2.js:78-82`) and the frontend matches that exact string to decide whether to render "Tenant not enrolled" vs "generic error" (`src/pages/FinanceOps.jsx:91-97`). Any future change to the gate's message must be coordinated across both sides in the same commit.

### 7.5 Mirror everything; enforce nothing in the mirror

- The frontend mirror exists to avoid a confusing UX (showing a nav entry that the backend would 403). It is not an enforcement boundary. Removing the mirror would weaken UX, not security; weakening the backend stack would weaken security regardless of any mirror.

### 7.6 The `crm_access` gate is frontend-only (a fail-closed divergence)

- `hasPageAccess` denies `FinanceOps` to any `crm_access:false` user (`permissions.js:306`), but the backend Finance Ops stack (`validateTenantAccess` + the `financeOps` module gate) **does not check `crm_access`**. The mirror is therefore _stricter_ than the backend for this case — a divergence from the §7.1 "no diverging frontend gate" rule, but a **fail-closed** one: the frontend hides more than the backend blocks, so it cannot grant access the backend would deny.
- The risk is the inverse: a `crm_access:false` user who bypasses the nav (curl / devtools / direct URL) **will be served** by `/api/v2/finance/*`, because the backend never consulted `crm_access`. Today every Finance Ops route is read-only, so this exposes reads only — but it must be recorded here so future role-gate/audit work does not assume `crm_access` is enforced server-side.
- To make `crm_access` a real access boundary, add the check at the backend route layer first (per §8.2), then keep the existing frontend mirror. Until then, this matrix labels the `crm_access` cell `FE-only` (§6 ²), not `Impl`.

---

## 8. Deferred items and the future-implementation rule

### 8.1 Deferred role gates / permissions

- Dedicated **finance-admin** vs **finance-viewer** split. Today both roles are equivalent at the backend (an enrolled tenant's user clears reads). A real split requires:
  - A backend route check (e.g., `requireFinanceAdmin` middleware that reads a per-tenant role assignment table).
  - A migration that introduces that assignment store with RLS.
  - A frontend mirror in `hasPageAccess` plus a per-action gate in the future write UI.
- Role-gated **approve / reverse / create-draft-invoice / update-draft-invoice / create-journal-draft / simulate-deal-won** actions. **These mutating endpoints already exist** (`finance.v2.js:492-580`) but carry no role check beyond the shared enable + tenant + module gate (§6 ¹). The deferred work here is **retrofitting** a finance-admin role gate onto these live routes — backend-first per §8.2 — and proving with route tests that a finance-viewer/employee is denied. Until that lands, the access model for these routes is "any enrolled-tenant caller", and that is documented as the current truth, not hidden as future-only.
- Role-gated **reject / replay / adapter retry / cancel / provider-sync** actions. These mutating endpoints do not exist today. Each lands its role check at the backend route layer when the slice that owns it dispatches.
- Evidence-pack **export** / download role check. The list endpoint is read-only and gated only by the existing three-gate stack; an export action (out of scope per Track B §14) would carry an export role check at the backend.
- A **dev-only "first-user superadmin enrollment"** affordance. The Module Settings toggle (now on `main` via #624) already serves this purpose for dev environments; no additional bootstrap route is planned.

### 8.2 The binding rule for any future role gate

**Any new role gate for Finance Ops MUST land at the backend route layer first, then the frontend mirror — never frontend-only.** The rule has three parts:

1. **Backend first.** The middleware or route handler must check the role on every request. Bypassing the frontend (curl, devtools, Postman) cannot grant access.
2. **Frontend mirrors the backend.** The frontend may hide affordances to avoid a confusing UX, but the frontend mirror does not change the access decision. If the frontend is wrong, the backend still denies.
3. **Tests cover both layers.** Backend route tests must include a role-denied case. Frontend tests must include both the role-denied UI behaviour and the explicit "the backend is the source of truth" assertion (i.e., the frontend mirror does not allow what the backend would deny).

A frontend role gate without a matching backend gate is **rejected by this design**. It would create a false sense of security, would weaken UX without weakening the access decision, and would drift the moment a future implementor adjusts one layer without touching the other.

### 8.3 The previously "Impl on-branch" rows are now merged

- The `feat/finance-ops-ux-preview` UI / nav / seed work merged to `main` via #624 (`4487acec`), so the cells this matrix once marked "Impl on-branch" are now **Impl** (see §6 legend and the `Impl #624` cells). The branch itself was abandoned after the reconciliation.
- No retroactive change is required to existing tenants beyond running the alias-aware backfill once on `main` (it is idempotent and alias-aware, so it is safe to re-run).

---

## 9. Hard constraints (explicit restatement)

- No code change. No `backend/routes/finance.v2.js`, no `backend/middleware/validateTenant.js`, no `backend/lib/finance/financeModuleGate.js`, no `src/utils/permissions.js`, no `src/components/shared/ModuleManager.jsx` edits in this packet.
- No role gate documented as if implemented when it is not. Every Deferred cell stays Deferred until a backend route check ships for it.
- No `ENABLE_FINANCE_PERSISTENT_EVENTS` flip. No `FINANCE_PROVIDER_WRITES_ENABLED` flip. No `ENABLE_FINANCE_OPS` flip.
- No migration application. No staging / Coolify / Doppler mutation. No provider writes. No production action.
- No push without Andrei's explicit authorisation.

---

## 10. Acceptance for this packet

- §4 names six roles and for each gives the data-model identification, the expected behaviour at every layer, and Implemented today vs Deferred with file:line citations for every Implemented claim.
- §5 documents the `financeOps` Module Settings toggle, the canonical-wins alias resolution, the alias-aware seed rule, and the first-user / superadmin dev access path — without inventing a production shortcut.
- §6 provides a role × surface matrix where every cell is labelled Impl / Impl #624 (merged from `feat/finance-ops-ux-preview`) / Defer / N/A and cites the gate (or absence of gate) that justifies the label. The six write routes that already exist (`finance.v2.js:492-580`) are labelled **Impl with no role gate** (¹) — reachable by any enrolled-tenant caller — while reject / replay / adapter retry / cancel / provider-sync are honestly **Defer (no route)** across all roles.
- §7 binds the frontend ↔ backend parity rules.
- §8 enumerates the Deferred items and binds the rule that any future role gate must land at the backend route layer first.
- §9 restates every guardrail.
- No code is changed.

---

## 11. Sign-off and posture

- Fail-closed `ENABLE_FINANCE_PERSISTENT_EVENTS` preserved end-to-end.
- Default-closed `FINANCE_PROVIDER_WRITES_ENABLED` preserved end-to-end.
- Sandbox-only ERPNext URL guard at `erpnextSandboxAdapter.js:89-128` preserved.
- No production action; no provider writes; no migration application; no env-var change; no staging / Coolify / Doppler mutation by this packet.
- The 16 Phase 3-13 §7 safety guardrails are preserved end-to-end.
- The six mutating Finance v2 endpoints remain absent from `src/api/finance.js`.
- The Slice 1 read-only constraint is preserved; this guide adds no affordance.
- The canonical-wins module-gate resolution is preserved; the alias-aware seed rule (merged to `main` via #624) applies.

Anchored on `main` (HEAD `34e7c0a`, includes #623 + #624); branch `docs/finance-ops-rbac-access-matrix`.
