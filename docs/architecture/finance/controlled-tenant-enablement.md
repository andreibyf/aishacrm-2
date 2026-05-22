# Finance Ops — Phase 2C-13: Controlled Tenant Enablement Procedure

**Phase 2C-13 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Procedure document. Nothing enabled by this document. `ENABLE_FINANCE_OPS` stays disabled until an operator runs this procedure in staging.
**Date:** 2026-05-22
**Related:** [`phase-2c-rls-application-plan.md`](./phase-2c-rls-application-plan.md) (2C-1) · [`finance-worker-deployment-config.md`](./finance-worker-deployment-config.md) (2C-5) · [`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md) (2C-6) · [`audit-worker-staging-plan.md`](./audit-worker-staging-plan.md) (2C-7) · [`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) (2C-8)

---

## 1. Goal and Scope

Define how Finance Ops is enabled for **exactly one controlled staging tenant** —
no global rollout, with a single-action rollback. This document is the
procedure; running it is an operator action in staging, gated by the staging
activation review ([`staging-activation-review.md`](./staging-activation-review.md),
2C-14).

---

## 2. The Enablement Layers

Finance Ops access is the conjunction of independent gates. This is what makes
"one tenant only" structurally true.

| Layer | Scope | Effect | Controlled by |
| ----- | ----- | ------ | ------------- |
| Runtime gate — `ENABLE_FINANCE_OPS` | per **environment** | Mounts the `/api/v2/finance` route surface. While unset, the routes return `404` — they do not exist. | `financeRuntimeGate.js` |
| Module gate — `financeOps` | per **tenant** | Even with routes mounted, a request is authorized only if the **requesting tenant** has the `financeOps` module enabled (`modulesettings.financeOps`). | `financeModuleGate.js` |
| Worker gate — three-tier | per **environment** (worker apps) | `ENABLE_FINANCE_OPS && ENABLE_FINANCE_WORKERS && <per-worker flag>` — runs the background workers. | `finance-worker-deployment-config.md` §3.1 |

**Key point — `ENABLE_FINANCE_OPS` is not global access.** It only makes the
route surface *exist* in staging. *Access* is still per-tenant: every finance
request passes through the `financeOps` module gate. So enabling Finance Ops for
one tenant means: `ENABLE_FINANCE_OPS=true` in staging **plus** the `financeOps`
module flag set for **exactly one** tenant. Every other tenant that reaches the
mounted route is rejected by the module gate. There is no global-enablement
switch in this design.

---

## 3. Tenant Selection

Select **one** staging tenant as the controlled tenant. Selection criteria:

- A **staging / non-production** tenant — never a real customer tenant.
- Low or no real finance data — Finance Ops starts empty for it.
- A known, controllable set of test users, including at least one `human` actor
  and one `ai_agent` actor (to exercise the AI approval block).
- Recorded by `tenant_id` (UUID) in the staging activation review evidence.

The selected `tenant_id` is the only tenant referenced for the rest of this
procedure and for 2C-6/2C-7/2C-8/2C-12 staging activation.

---

## 4. Enablement Procedure

Run in order, in the **staging** environment only.

### Step 1 — Preconditions

- The staging-readiness gate (`phase-2c-rls-application-plan.md` §7) has cleared.
- Migrations 168, 169, 170, and the companion RLS migration are applied to
  staging (gated; 2C-1 §7).
- Observability is in place ([`observability-alerting.md`](./observability-alerting.md), 2C-11).
- The controlled `tenant_id` is selected (§3).

### Step 2 — Enable the runtime gate (environment)

Set `ENABLE_FINANCE_OPS=true` in the **staging** backend environment and
redeploy. The `/api/v2/finance` route surface mounts. At this point **no tenant
has access** — the module gate still rejects everyone.

### Step 3 — Enable the `financeOps` module for the one tenant

Set the `financeOps` module flag for the controlled tenant only —
`modulesettings.financeOps` enabled for that `tenant_id`. The canonical module
key is `financeOps` (`enterpriseFinance` is a compatibility alias). **No other
tenant's module flag is touched.** This step is what grants access, and it
grants it to exactly one tenant.

### Step 4 — Enable the worker toggles (optional, per worker)

If projection / audit / adapter workers are to run in staging, set their
three-tier gate (`finance-worker-deployment-config.md` §3.1):
`ENABLE_FINANCE_WORKERS=true` plus the relevant per-worker flag(s). The adapter
worker keeps `FINANCE_ADAPTER_MODE=draft_only` and
`FINANCE_PROVIDER_WRITES_ENABLED=false` (2C-8). Workers may be enabled
incrementally — projection/audit first, adapter last — or left disabled for an
initial route-only activation.

### Step 5 — Run the smoke test sequence

Run §5 below. All checks must pass before the activation is considered live.

---

## 5. Smoke Test Sequence

Run against the staging environment after Step 3 (and Step 4 if workers were
enabled). Each check has an expected result; any deviation fails the activation.

| # | Check | Request | Expected |
| - | ----- | ------- | -------- |
| 1 | **Route auth** | Any `/api/v2/finance/*` request with no / invalid auth | `401` — `authenticateRequest` rejects it. |
| 2 | **Module gate — denied** | Authenticated request from a tenant **without** `financeOps` | Rejected by the module gate (`403`/`404`) — proves access is per-tenant. |
| 3 | **Module gate — allowed** | Authenticated request from the **controlled** tenant | Passes the module gate. |
| 4 | **Replay / runtime status** | `GET /api/v2/finance/runtime/status` (controlled tenant) | `200`; tenant-scoped runtime posture reported. |
| 5 | **Draft invoice** | `POST /api/v2/finance/draft-invoices` (controlled tenant) | `201`, status `draft`, no provider write, tenant-scoped. |
| 6 | **Journal draft — balanced** | `POST /api/v2/finance/journal-drafts`, balanced lines | `201`, journal draft created. |
| 7 | **Journal draft — unbalanced** | `POST /api/v2/finance/journal-drafts`, unbalanced lines | `400`, rejected, no partial write. |
| 8 | **Approval block** | `ai_agent` actor attempts `POST /api/v2/finance/approvals/:id/approve` | `403` — AI actors cannot approve; the block is session-derived and survives a body-spoofed `actor_type`. |

Checks 1–3 cover route auth and the module gate; 5 the draft invoice; 6–7 the
journal draft; 8 the approval block; 4 the replay/runtime status. Capture every
result as evidence for the staging activation review (2C-14).

---

## 6. Rollback Procedure

Rollback is a **single config change**, and there are two scopes:

- **Per-tenant rollback (precise).** Set the controlled tenant's `financeOps`
  module flag to disabled. That tenant immediately loses access; the route
  surface stays mounted but no tenant can use it (no other tenant ever had the
  flag). This is the targeted "turn it off for the one tenant" action.
- **Environment kill switch (full).** Set `ENABLE_FINANCE_OPS=false` in staging
  and redeploy. The entire `/api/v2/finance` surface unmounts and returns `404`;
  workers idle on their next cycle (the three-tier gate fails at tier 1).

Either is one command/config change. Neither deletes data: migrations and tables
remain; `finance.audit_events` is immutable; `finance.projection_state` is a
rebuildable cache. Re-enabling re-runs Steps 2–5.

---

## 7. Acceptance Criteria — Self-Check

| 2C-13 acceptance criterion | Status |
| -------------------------- | ------ |
| No global enablement | ✅ Section 2 — `ENABLE_FINANCE_OPS` only mounts the route; access is per-tenant via the `financeOps` module gate. |
| One tenant only | ✅ Sections 3–4 — the `financeOps` module flag is set for exactly one selected `tenant_id`; all others are rejected by the module gate. |
| Rollback is one command/config change | ✅ Section 6 — per-tenant module-flag disable, or the `ENABLE_FINANCE_OPS=false` environment kill switch. |
| Smoke tests cover route auth, module gate, draft invoice, journal draft, approval block, replay status | ✅ Section 5 — checks 1–3 (auth + module gate), 5 (draft invoice), 6–7 (journal draft), 8 (approval block), 4 (replay/runtime status). |

---

_Part of the Finance Ops architecture suite. Related: `phase-2c-rls-application-plan.md`
(2C-1), `finance-worker-deployment-config.md` (2C-5), `projection-worker-staging-plan.md`
(2C-6), `audit-worker-staging-plan.md` (2C-7), `adapter-worker-sandbox-plan.md`
(2C-8), `staging-activation-review.md` (2C-14)._
