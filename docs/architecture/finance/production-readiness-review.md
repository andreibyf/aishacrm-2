# Finance Ops — Phase 2C-15: Production-Readiness Review

**Phase 2C-15 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Forward-looking review. **Production is NOT activated.** This document defines what must be true before production is ever considered.
**Date:** 2026-05-22
**Related:** [`staging-activation-review.md`](./staging-activation-review.md) (2C-14) — staging gate, separate from this.

---

## 1. Goal

**Do not activate production.** This document does not enable, prepare, or
schedule a production rollout. It records — explicitly — what must be true
*before* production activation can be considered, so that the production gate is
a deliberate, separate decision and never a drift from staging activation.

---

## 2. Production Remains Disabled

- `ENABLE_FINANCE_OPS` is **unset** in the production (Hetzner) environment and
  stays that way. The `/api/v2/finance` route surface does not exist in
  production.
- No finance worker is deployed or enabled in production.
- No finance migration (168 / 169 / 170 / the companion RLS migration) is
  applied to the production database.
- No provider connection — sandbox or live — exists for any production tenant.
- The `financeOps` module flag is not set for any production tenant.

Phase 2C changes none of this. Staging activation (2C-14) changes none of this.
Production activation is a **future, separate gate** with its own review.

---

## 3. Future Production Requirements

Each item below must be satisfied — and explicitly reviewed — before a production
activation gate may even be opened. None is in scope for Phase 2C.

### 3.1 Provider sandbox maturity

The ERPNext sandbox proof (2C-9) must have **passed** and run stably over a
meaningful period. Any provider intended for production use must first have a
proven sandbox adapter; live (finalising) writes — `pushFinal` / `void` /
`approval_required_write` — require their own separate gate beyond the
draft-only sandbox proof. QuickBooks / Xero OAuth adapters, if in scope, must
each have completed an equivalent sandbox proof.

### 3.2 Tenant billing implications

Finance Ops as a product surface has billing consequences — module pricing,
per-tenant entitlement, metering. The commercial model (what a tenant is charged
for Finance Ops, and how `financeOps` entitlement maps to billing) must be
defined and implemented before production tenants are enabled.

### 3.3 Backup and restore readiness

The `finance` schema must be covered by the production backup policy with a
**tested** restore. The append-only `finance.audit_events` event store is the
source of truth — its backup, point-in-time-recovery, and restore must be
verified. `finance.projection_state` is a rebuildable cache (replay restores it)
but its backup is still desirable to avoid cold-rebuild storms after a restore.

### 3.4 Observability maturity

The Phase 2C observability plan (2C-11) is fitted to the current stack (Pino,
Coolify logs, Uptime Kuma). For production, the maturity bar is higher: a metrics
backend (the future Prometheus `/metrics` enhancement noted in 2C-11 §5),
automated alerting for **every** signal (not documented-runbook fallbacks), and
dashboards. Alert fatigue and on-call routing must be considered.

### 3.5 Audit retention

The audit retention policy (`audit-evidence-layer.md` §8) — recommended minimum
7 years for financial records, monthly range partitioning for high-volume
tenants, cold-storage archival to R2 with verified hashes — must be implemented
and operational before production finance data accumulates.

### 3.6 Incident response

A finance-specific incident runbook: how to respond to a tenant-isolation
breach, a divergent projection, a dead-letter backlog, a provider outage, or a
suspected audit-trail integrity issue. Severity classification, escalation, and
communication templates must exist.

### 3.7 External provider credential storage

Plain JSONB in `tenant_integrations.api_credentials` is acceptable only for the
ERPNext sandbox POC (decision E4). Before any production provider credential —
especially QuickBooks / Xero OAuth tokens — is stored, **app-level encryption**
must be added: encrypt-before-write / decrypt-after-read with a Doppler-managed
key (`FINANCE_ADAPTER_ENCRYPTION_KEY`), plus a token-rotation/refresh story
(`adapter-runtime-contract.md` §6).

### 3.8 SLO / SLA expectations

Define the service levels Finance Ops commits to: projection freshness /
worker-lag bounds, adapter sync latency, evidence-pack generation time, and
availability targets. These drive worker sizing, scaling, and the production
observability thresholds.

### 3.9 Support procedure

A support procedure for Finance Ops tenants: how support staff inspect a tenant's
finance state, triage an operator-resolved condition (degraded projection,
dead-lettered job), and escalate to engineering — without bypassing tenant
isolation or the audit trail.

### 3.10 Carried-forward engineering prerequisites

Beyond the operational items above, two engineering items already flagged in the
2C documents are production prerequisites:

- The incremental "events after cursor" event-store query
  (`projection-worker-staging-plan.md` §3.1) — required before the projection
  worker runs at production event volumes.
- The `audit_pack_requests` request-log table + migration
  (`audit-worker-staging-plan.md` §8) — required when evidence-pack generation
  is exposed in production.

---

## 4. The Production Gate Is Separate

The production-activation gate is **distinct from** the staging-activation gate
(2C-14):

- Staging activation is governed by 2C-14 and may proceed when its conditional-GO
  steps pass. It does **not** imply or authorise any production change.
- Production activation requires a **separate review** that confirms every §3
  item is satisfied, plus a fresh pass of the staging-style checks
  (RLS / PostgREST / `service_role` / tenant claim) against the **production**
  environment.
- Production activation is a deliberate decision recorded in its own future
  document — it is never reached by extending or rolling forward the staging
  activation.

---

## 5. Acceptance Criteria — Self-Check

| 2C-15 acceptance criterion | Status |
| -------------------------- | ------ |
| Production remains disabled | ✅ Section 2 — `ENABLE_FINANCE_OPS` unset in production; no migration, no worker, no provider connection, no tenant flag. |
| Requirements are explicit | ✅ Section 3 — ten production prerequisites enumerated, each scoped out of Phase 2C. |
| Future production gate is separate from staging activation | ✅ Section 4 — production gate is a distinct, future review; staging activation confers no production authority. |

---

_Part of the Finance Ops architecture suite. Related: `staging-activation-review.md`
(2C-14), `adapter-runtime-contract.md` (Track E), `audit-evidence-layer.md`
(Track D), `observability-alerting.md` (2C-11)._
