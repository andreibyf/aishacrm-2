# Finance Ops — Phase 2C-14: Staging Activation Review

**Phase 2C-14 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Readiness review. Records the go/no-go for staging activation. No activation performed by this document.
**Date:** 2026-05-22
**Reviews:** Phases 2C-1 through 2C-13.

---

## 1. Goal

Hold the final staging-readiness review for the Finance Ops runtime: confirm
every Phase 2C deliverable is complete, every stop condition is clear, and record
an explicit go/no-go for staging activation.

This document does not activate anything. It is the gate review that an operator
consults before running the controlled tenant enablement procedure
([`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md), 2C-13).

---

## 2. Review Checklist

Each item maps to the Phase 2C deliverable that satisfies it.

| Review item                         | Satisfied by                                                                                                                                                                        | Status                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| RLS reviewed                        | `phase-2c-rls-application-plan.md` (2C-1) — final tenant expression, `service_role` policies finalize-able now, `authenticated` SELECT policies DRAFT pending the staging JWT check | ✅ Documented                                                  |
| PostgREST isolation verified        | `postgrest-isolation-verification.md` (2C-2) — `finance` absent from `config.toml` exposed schemas; stop condition not triggered                                                    | ✅ Documented (repo); staging re-check pending                 |
| `service_role` behavior understood  | `service-role-tenant-claim-verification.md` (2C-3) — bypass behavior explicit; RLS framed as defense-in-depth, not the primary control                                              | ✅ Documented; staging `auth.role()` check pending             |
| Persistent projection store decided | `persistent-projection-store-plan.md` (2C-4) + migration `170` (DRAFT)                                                                                                              | ✅ Documented                                                  |
| Worker configs disabled-by-default  | `finance-worker-deployment-config.md` (2C-5) + `deploy/coolify/finance-workers.example.yml` — three-tier gate, every flag `false`                                                   | ✅ Documented                                                  |
| Projection worker staging plan      | `projection-worker-staging-plan.md` (2C-6) — no semantic change; `replay`-based catch-up; degraded pause                                                                            | ✅ Documented                                                  |
| Audit/evidence worker staging plan  | `audit-worker-staging-plan.md` (2C-7) — read-only, deterministic packs, explicit infra-event opt-in                                                                                 | ✅ Documented                                                  |
| Adapter worker sandbox-only         | `adapter-worker-sandbox-plan.md` (2C-8) — two enforcement layers; `FINANCE_PROVIDER_WRITES_ENABLED=false`                                                                           | ✅ Documented                                                  |
| ERPNext sandbox proof gate defined  | `erpnext-sandbox-proof.md` (2C-9) — sandbox-only proof gate; adapter code is future scope                                                                                           | ✅ Documented                                                  |
| Dead-letter / retry verified        | `dead-letter-retry-verification.md` (2C-10) — deterministic retry, dead-letter visibility, operator recovery                                                                        | ✅ Documented                                                  |
| Observability active                | `observability-alerting.md` (2C-11) — nine signals mapped to source/surface/alert on the existing stack                                                                             | ✅ Documented; staging alert wiring pending                    |
| Replay drill passed                 | `replay-rebuild-operational-drill.md` (2C-12) — ten-step drill procedure; uses `replayValidationHarness.js`                                                                         | ✅ Procedure documented; drill **execution** pending staging   |
| Rollback plan exists                | `controlled-tenant-enablement.md` (2C-13) §6 — per-tenant module-flag disable + `ENABLE_FINANCE_OPS=false` kill switch                                                              | ✅ Documented                                                  |
| One controlled tenant selected      | `controlled-tenant-enablement.md` (2C-13) §3 — selection criteria defined                                                                                                           | ✅ Procedure documented; tenant **selection** pending operator |

---

## 3. Stop Conditions

The Phase 2C stop conditions, each assessed:

| Stop condition                                                          | State                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A finance route bypasses auth, tenant, or module gating                 | **Clear** — `authenticateRequest` + `validateTenantAccess` + `financeOps` module gate on every route; no bypass introduced.                                                                                                                                                |
| `finance` appears in public PostgREST exposed schemas                   | **Clear** — `config.toml` exposes only `public`, `graphql_public` (2C-2).                                                                                                                                                                                                  |
| RLS tenant claim behavior is uncertain                                  | **Open — by design.** The `authenticated` SELECT policies stay DRAFT until the staging JWT-claim check passes (2C-3 §5). This is a gated verification step, not an unresolved blocker — the `service_role` policies (the only ones the backend needs) do not depend on it. |
| A worker can perform provider writes without a sandbox/draft-only guard | **Clear** — two-layer guard; `FINANCE_PROVIDER_WRITES_ENABLED=false` (2C-8).                                                                                                                                                                                               |
| An AI actor can approve, post ledger truth, refund, or move money       | **Clear** — `finance.ai.no_money_movement`; AI hard-blocks; session-derived actor identity.                                                                                                                                                                                |
| Replay/rebuild produces divergent projection state                      | **Clear** — `replayValidationHarness.js` proves convergence (2B-12); the 2C-12 drill verifies it operationally.                                                                                                                                                            |
| Adapter worker lacks retry/dead-letter visibility                       | **Clear** — three visibility surfaces + `/ready` count (2C-10).                                                                                                                                                                                                            |
| Observability cannot detect degraded projections or failed adapter jobs | **Clear** — both are required, mapped signals (2C-11).                                                                                                                                                                                                                     |

**No unresolved stop condition.** The single "open" item (the JWT-claim
verification) is an explicitly gated staging check with a fail-closed fallback —
it does not block the gate; it is part of executing it.

---

## 4. Documentation vs. Execution

Phase 2C is the staging-readiness **gate** — it produces the plans, configs,
procedures, and the draft migration. It does **not** itself apply migrations,
flip `ENABLE_FINANCE_OPS`, deploy a worker, or contact a provider.

The following remain as **operator execution steps**, each with its procedure
already written:

1. Apply migrations 168 / 169 / 170 + the companion RLS migration to staging
   (gated — 2C-1 §7).
2. Run the staging environment-dependent verifications — PostgREST exclusion
   re-check (2C-2 §3.2), `auth.role()` (2C-3 §3), JWT tenant-claim path
   (2C-3 §5).
3. Select the controlled tenant and run the enablement procedure (2C-13).
4. Execute the replay/rebuild drill against staging (2C-12).
5. Wire the observability alerts / monitors (2C-11).

These are activation actions, not Phase 2C deliverables.

---

## 5. Go / No-Go Decision

**Decision: GO for the staging-readiness gate.**

All fifteen Phase 2C deliverables are complete; no stop condition is unresolved;
every activation step has a written, reviewed procedure; the rollback is a
single config change.

**Staging _activation_ is conditionally GO** — it proceeds when an operator
executes the §4 steps and the environment-dependent verifications pass
(PostgREST exclusion, `auth.role()`, JWT tenant claim, and the replay drill). If
any of those fails against the live staging environment, activation **halts** at
that point and the relevant 2C document's stop condition applies.

**No-go for production.** Production activation is explicitly out of scope and is
governed separately by [`production-readiness-review.md`](./production-readiness-review.md)
(2C-15).

| Decision                        | Value                                                                      |
| ------------------------------- | -------------------------------------------------------------------------- |
| Phase 2C staging-readiness gate | **GO** — complete                                                          |
| Staging activation execution    | **Conditional GO** — pending the §4 operator steps and their verifications |
| Production activation           | **NO-GO** — out of scope; see 2C-15                                        |

---

## 6. Acceptance Criteria — Self-Check

| 2C-14 acceptance criterion            | Status                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Explicit go/no-go recorded            | ✅ Section 5 — gate GO; activation conditional GO; production NO-GO.                                                               |
| No unresolved stop condition          | ✅ Section 3 — every stop condition clear; the one "open" item is a gated verification with a fail-closed fallback, not a blocker. |
| Staging activation can proceed safely | ✅ Sections 2, 4 — every checklist item has a reviewed procedure; activation is a defined, gated, reversible sequence.             |

---

_Part of the Finance Ops architecture suite. Reviews Phases 2C-1 through 2C-13.
Related: `controlled-tenant-enablement.md` (2C-13), `production-readiness-review.md`
(2C-15)._
