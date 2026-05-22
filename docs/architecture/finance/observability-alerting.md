# Finance Ops — Phase 2C-11: Observability, Logs, Metrics, and Alerts

**Phase 2C-11 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Observability plan. No code, no activation. Documents what must be observable before staging activation.
**Date:** 2026-05-22
**Related:** [`worker-service-topology.md`](./worker-service-topology.md) §8 · [`finance-worker-deployment-config.md`](./finance-worker-deployment-config.md) (2C-5) · [`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md) (2C-6) · [`dead-letter-retry-verification.md`](./dead-letter-retry-verification.md) (2C-10) · [`../DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md)

---

## 1. Goal

Make Finance Ops **operable** before staging activation: every failure mode that
matters must be detectable, attributable to a tenant where safe, and actionable.
This document maps each required signal to a source, a surface, and an alert,
using the observability stack the repo already has.

No new finance semantics; this is an operations plan.

---

## 2. The Stack We Have

Finance Ops observability fits the existing stack — it does not introduce a new
monitoring system.

| Capability | What exists | Where |
| ---------- | ----------- | ----- |
| Structured logging | **Pino** — JSON logs, automatic secret redaction, `LOG_LEVEL` control | `backend/lib/logger.js` |
| Log capture | Docker `json-file` driver (`max-size 10m`, `max-file 3`) | `docker-compose.yml`, `prod/*` compose, `finance-workers.example.yml` |
| Container/app logs | Coolify per-app log view | Coolify (VPS-1 / VPS-2 / Hetzner) |
| Service health monitoring | **Uptime Kuma** | VPS-2 (`DEPLOY_TOPOLOGY.md`) |
| Worker health surface | `GET /health` (liveness) + `GET /ready` (readiness) on `FINANCE_WORKER_HEALTH_PORT` | each finance worker (`worker-service-topology.md` §8) |
| Backend health | `GET /health`, `GET /api/system/health` | main backend |
| Worker heartbeat | in-process heartbeat **timer** (`FINANCE_WORKER_HEARTBEAT_MS`) feeding `GET /health` — finance workers do **not** write to `system_logs` | each finance worker (`worker-service-topology.md` §8.1) |
| Main-backend heartbeat | `system_logs` heartbeat rows — **main backend only**, unrelated to finance workers | backend |

**Not present:** Prometheus / Grafana are **not** in the repo today. This plan
therefore does **not** depend on them — signals are delivered through Pino logs,
the worker `/ready` JSON, and Uptime Kuma. A Prometheus `/metrics` endpoint per
worker is noted as a clean future enhancement (§5), not a Phase 2C requirement.

---

## 3. Required Signals

Each signal below must be observable before staging activation. "Surface" is
where the signal is read; "Alert" is how an operator is notified.

| # | Signal | Source | Surface | Alert |
| - | ------ | ------ | ------- | ----- |
| 1 | **Worker up/down** | process liveness; heartbeat timer | worker `GET /health`; container state in Coolify | Uptime Kuma monitor on `/health` → down alert |
| 2 | **Worker lag** | max age across `(projection, tenant)` cursors vs newest event; oldest unclaimed `queued` adapter job | worker `GET /ready` JSON | Uptime Kuma keyword/JSON check on `/ready` → `503` alert when lag exceeds threshold |
| 3 | **Replay failure** | a `replay()` that throws → projection set `degraded` | `finance.projection_state.status='degraded'` + `degraded_reason`; Pino `error` log | log-based alert on `degraded_reason`; surfaces via signal 4 |
| 4 | **Degraded projection** | count of `(projection, tenant)` pairs in `degraded` | `GET /ready` degraded count; `finance.projection_state` | Uptime Kuma → `503`; alert when count > 0 |
| 5 | **Adapter sync failure** | `finance.adapter.sync_failed` events; `finance.adapter_jobs.status='failed'` | event stream; `adapter_queue` projection; Pino `warn` log | log-based alert; rate alert on repeated failures |
| 6 | **Dead-letter count** | terminal `failed` jobs + `pending` `adapter_job` approvals (2C-10 §5) | `GET /ready` dead-letter count; `finance.approvals` | Uptime Kuma → `503`; alert when count > 0 |
| 7 | **Audit evidence build failure** | `buildEvidencePack` throw, or malformed-lineage `warn` (2C-7 §9) | audit worker `GET /ready`; Pino `error`/`warn` log | log-based alert; `/ready` `503` on repeated build failure |
| 8 | **RLS / tenant mismatch error** | a query that returns the wrong/zero tenant rows, or `validateTenantAccess` rejection on a finance route | Pino `error`/`warn` log with `tenant_id`; backend logs | log-based alert — any finance RLS/tenant-mismatch error is high-severity |
| 9 | **Finance route 401/403 spikes** | auth/module-gate rejections on `/api/v2/finance/*` | backend access logs; Pino logs with status code | rate alert on 401/403 volume per route |

Signals 1–2, 4, 6, 7 are read primarily from the worker `/ready` endpoints —
which is why every finance worker exposes a structured readiness surface
(`worker-service-topology.md` §8.2). Signals 3, 5, 8, 9 are primarily
log-derived.

---

## 4. Logging Conventions

### 4.1 Structured, tenant-attributed

- All finance worker and route logs use the existing **Pino** logger — JSON,
  one event per line, captured by the `json-file` driver and visible in Coolify.
- **`tenant_id` is included on every finance log line where it is known and safe**
  — it is a UUID, not sensitive, and is the primary filter for triaging a
  per-tenant issue. Worker logs carry `tenant_id` per `(projection, tenant)` or
  per job; route logs carry `req.financeTenantId`.
- Recommended structured fields: `tenant_id`, `worker` (`finance-projection-worker`
  / `finance-adapter-worker` / `finance-audit-worker`), `projection` /
  `adapter_job_id` where applicable, `event_id`, `correlation_id`, and a stable
  `msg`. Stable field names make log-based alerts (signals 3, 5, 7, 8, 9) simple
  keyword/JSON matches.
- `FINANCE_WORKER_LOG_LEVEL` controls verbosity (default `info`).

### 4.2 No secrets in logs

- The Pino logger **already redacts** sensitive fields (passwords, tokens, API
  keys, Supabase keys, DB URLs, auth headers, emails) — `backend/lib/logger.js`.
- Finance-specific rule: **never log** raw JWT contents,
  `tenant_integrations.api_credentials` (provider API keys/secrets/OAuth tokens),
  or full request bodies that may carry them. Log the **fact** of an event and
  its identifiers (`tenant_id`, `adapter_job_id`, `error_code`), never the
  credential material.
- `tenant_id` (a UUID) is safe to log and is required (§4.1). An actor `email`
  is redacted by the existing logger; prefer `actor_id` (UUID) in finance logs.
- This satisfies the 2C-11 "no secrets in logs" criterion at two layers: the
  global redaction list, plus the finance-specific never-log rule.

---

## 5. Metrics

In the absence of Prometheus/Grafana, finance metrics are delivered as:

- **Counts on `GET /ready`** — each worker's readiness JSON carries the live
  numbers behind signals 2, 4, 6, 7 (cursor lag, degraded count, dead-letter
  count, oldest unclaimed work). This is the canonical machine-readable metric
  surface for Phase 2C.
- **Log-derived counts** — failure signals (3, 5, 8, 9) are counted by matching
  stable Pino fields over a window.
- **Worker heartbeat** — each finance worker runs an **in-process heartbeat
  timer** (`FINANCE_WORKER_HEARTBEAT_MS`) that feeds its `GET /health` endpoint
  (`worker-service-topology.md` §8.1); `/health` returns `200` only while that
  timer is firing within threshold. This is what backs signal 1. Finance workers
  do **not** write heartbeat rows to `system_logs` — that table's heartbeat is
  the main backend's and is unrelated to finance-worker liveness.

**Future enhancement (not Phase 2C):** each worker could additionally expose a
Prometheus `/metrics` endpoint (gauge per signal) scraped by a Grafana stack on
VPS-2. This is purely additive — it changes no signal definition — and is
recorded here as the natural next step once a metrics backend exists.

---

## 6. Alerts

Alerting for Phase 2C staging uses what is already operational:

- **Uptime Kuma (VPS-2)** monitors each finance worker's `GET /health` (liveness,
  signal 1) and `GET /ready` (readiness — signals 2, 4, 6, 7; a `503` or a
  failing JSON keyword check raises the alert). Uptime Kuma already monitors
  AiSHA services per `DEPLOY_TOPOLOGY.md`; finance workers are added as monitors.
- **Log-based alerts** cover signals 3, 5, 8, 9 — a Coolify log search or a small
  log-watch over the stable Pino fields. Signal 8 (RLS/tenant mismatch) is
  treated as **high-severity**: any finance tenant-isolation error pages
  immediately.
- **Disabled is healthy.** A worker idling because Finance Ops is disabled
  reports healthy on `/health` and `/ready` (`worker-service-topology.md` §8.3) —
  monitors must treat the default disabled posture as green, not as an outage.

For Phase 2C, alerts that cannot yet be fully automated (e.g. log-rate alerts
without a log aggregator) are **documented as runbook checks** — the staging
activation review (2C-14) confirms each signal is either alerting or has a
documented manual check. The acceptance bar is "alerts exist **or are
documented**," and every signal in §3 meets it.

---

## 7. Actionability

Every signal in §3 is actionable — it names a condition an operator can resolve,
not just a number:

| Signal | Operator action |
| ------ | --------------- |
| Worker up/down | Restart via Coolify; check logs for the crash cause. |
| Worker lag | Check DB reachability and event volume; confirm the worker is enabled and polling. |
| Replay failure / degraded projection | Inspect `degraded_reason`; fix the handler defect or data issue; trigger an operator `replay` (`projection-runtime.md` §11 — recovery is operator-only). |
| Adapter sync failure | Inspect `error_message`/`error_code`; transient → let retry run; systemic → pause the worker. |
| Dead-letter count | Follow the 2C-10 §6 recovery steps — inspect, decide, re-queue/cancel/escalate. |
| Audit evidence build failure | Inspect the malformed-lineage `warn`; identify the upstream emitter. |
| RLS / tenant mismatch | **Halt** — treat as a potential isolation breach; investigate before continuing (a stop condition, `phase-2c-rls-application-plan.md`). |
| 401/403 spike | Check auth/module-gate config; distinguish a misconfiguration from probing. |

Degraded projections and dead-lettered jobs are **operator-resolved by design**
(`projection-runtime.md` §11; `dead-letter-retry-verification.md` §6) — the
observability layer reports them; it never auto-recovers.

---

## 8. Acceptance Criteria — Self-Check

| 2C-11 acceptance criterion | Status |
| -------------------------- | ------ |
| Alerts exist or are documented for staging | ✅ Sections 3, 6 — every required signal mapped to an Uptime Kuma monitor or a documented log-based/runbook alert. |
| Log fields include `tenant_id` where safe | ✅ Section 4.1 — `tenant_id` (a UUID) required on every finance log line where known. |
| No secrets in logs | ✅ Section 4.2 — global Pino redaction + finance-specific never-log rule (no JWT contents, no `api_credentials`). |
| Failures are actionable | ✅ Section 7 — each signal mapped to a concrete operator action / runbook step. |

---

_Part of the Finance Ops architecture suite. Related: `worker-service-topology.md`
(2B-13), `finance-worker-deployment-config.md` (2C-5), `projection-worker-staging-plan.md`
(2C-6), `audit-worker-staging-plan.md` (2C-7), `dead-letter-retry-verification.md`
(2C-10), `../DEPLOY_TOPOLOGY.md`._
