# Finance Ops — Phase 2C-7: Audit / Evidence Worker Staging Activation Plan

**Phase 2C-7 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Activation plan — audit worker stays disabled. No staging activation performed by this document.
**Date:** 2026-05-22
**Related:** [`audit-evidence-layer.md`](./audit-evidence-layer.md) (Track D — §7, §9) · [`worker-service-topology.md`](./worker-service-topology.md) §4 · [`finance-worker-deployment-config.md`](./finance-worker-deployment-config.md) (2C-5) · [`projection-worker-staging-plan.md`](./projection-worker-staging-plan.md) (2C-6)

---

## 1. Goal and Scope

Define how `finance-audit-worker` runs **audit and evidence generation safely in
staging** — without changing audit semantics and without any provider write.

The evidence/audit logic already exists and is implemented: `auditEvidenceBuilder.js`
(Phase 2B-11) is a pure, read-only library. This document is the operational plan
for hosting it in a staging worker process. It introduces **no new finance
semantics**.

---

## 2. The Audit Worker Is a Host for an Already-Read-Only Builder

`worker-service-topology.md` §4 defines `finance-audit-worker` as the execution
home for the non-request-path parts of the audit/evidence layer. The work it runs
is `auditEvidenceBuilder.js` — implemented in Phase 2B-11 and documented in
`audit-evidence-layer.md` §9.

That builder is **already, by construction, read-only**:

- It exposes `buildEvidencePack`, `queryAuditTimeline`, `getReversalChain`,
  `isCanonicalFinanceEvent` — all pure functions over an event source.
- It performs **no DB writes, no routes, no provider calls, no network I/O, and
  no mutation of any source record** (a hard Phase 2B-11 constraint —
  `audit-evidence-layer.md` §9, §9.5).

So "running the audit worker in staging" cannot introduce a write path: the
worker is a poll loop and a process around a function library that has no write
capability. The worker adds scheduling and a health surface; it adds no mutation.

---

## 3. Evidence Generation Is Read-Only — Source Events Are Never Mutated

The audit worker reads `finance.audit_events` and never writes it:

- `finance.audit_events` is append-only and immutable at the DB layer — migration
  173 installs `BEFORE` triggers blocking `UPDATE` / `DELETE` / `TRUNCATE` for
  **every** role, including `service_role` (`audit-evidence-layer.md` §2.1).
  Even a defective worker physically cannot mutate a source event.
- `auditEvidenceBuilder.js` operates on **deep-cloned, sorted** event sets; it
  never holds a mutable reference to a source row.
- The worker does **not** write `finance.audit_events`. Its only writes are to
  operational, non-financial-truth state: the `finance.projection_state` row of
  `audit_timeline`, if it hosts that projection (2C-4); and — as a **future
  addition, not yet implemented** (§8) — an `audit_pack_requests` request log.
  Neither is a finance audit event; neither is financial truth.

Evidence generation is therefore read-only with respect to the audit trail,
enforced at the DB layer and the library layer independently.

---

## 4. Deterministic Evidence Packs

`buildEvidencePack` is deterministic by design (`audit-evidence-layer.md` §9.2):

- `pack_id` and `generated_at` are inherently volatile, so they are **injectable**
  (`packId` / `generatedAt`, or `idFactory` / `clock`).
- With those supplied, two builds from the same event stream are
  **byte-identical**, including all three integrity hashes (`events_hash`,
  `approvals_hash`, `pack_hash`).
- The staging audit worker must **always inject** a stable `packId` and
  `generatedAt` per request (derived once when the request is accepted), so a
  pack regenerated for the same request is reproducible and an auditor can
  re-verify it.
- The replay/rebuild drill ([`replay-rebuild-operational-drill.md`](./replay-rebuild-operational-drill.md),
  2C-12) explicitly verifies evidence-pack determinism as one of its checks.

---

## 5. Infrastructure Event Inclusion Is Explicit

`finance.audit.event_appended` is a reserved internal infrastructure event, not a
business event (`audit-evidence-layer.md` §1.2; `projection-runtime.md` §13).
Its handling by the audit worker is **explicit and opt-in**:

- `buildEvidencePack` / `queryAuditTimeline` exclude `finance.audit.event_appended`
  from normal business evidence **unless `includeInfrastructureEvents: true`** is
  passed (default `false`).
- `audit_timeline` is the **only** projection permitted to consume the
  infrastructure event, and only when its worker is configured with
  `includeInfrastructureEvents: true`. Hosting `audit_timeline` in
  `finance-audit-worker` (rather than `finance-projection-worker`) keeps all
  infrastructure-event handling isolated in one worker — see §7.
- An evidence pack built **with** infrastructure events is for proving
  event-store integrity, not normal business review. The audit worker records
  which mode was used so the pack's provenance is unambiguous.

Infrastructure-event inclusion is never implicit and never the default.

---

## 6. Tenant-Scoped Evidence Generation

- Every audit-worker operation is scoped to one `tenant_id`. `buildEvidencePack`
  takes `tenantId` as a required option and is the tenant-isolation boundary:
  a mixed-tenant event array yields a pack containing **zero** other-tenant data
  anywhere — events, approvals, hashes, summary (`audit-evidence-layer.md` §9.4).
- The worker reads the event stream via `financeEventStore.replay(tenantId)` /
  `query({ tenant_id, ... })`, which resolve to `WHERE tenant_id = $1`.
- In staging the worker services only the **one controlled tenant**
  ([`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md), 2C-13).

---

## 7. `audit_timeline` Hosting

`worker-service-topology.md` §4.1 left open whether `audit_timeline` runs inside
`finance-projection-worker` or `finance-audit-worker`. **For staging, host it in
`finance-audit-worker`** with `includeInfrastructureEvents: true`. Rationale:

- It keeps `finance-projection-worker` purely on business projections that never
  see `finance.audit.event_appended` (consistent with `projection-worker-staging-plan.md`
  §7).
- It concentrates all infrastructure-event handling in the one worker whose job
  is audit/evidence — a single place to reason about infrastructure events.

`audit_timeline` is still driven by the same Projection Runner contract; the
audit worker simply hosts that one projection with the opt-in flag set. Its
projection state persists to `finance.projection_state` like any other (2C-4).

---

## 8. No Provider Writes, No New Public Routes

- **No provider writes.** The audit worker never contacts an external accounting
  provider. It has no adapter, no provider client, no provider credentials.
- **No new public routes.** Phase 2C adds no HTTP route. The audit worker exposes
  only the internal `GET /health` / `GET /ready` surface on
  `FINANCE_WORKER_HEALTH_PORT` (`finance-worker-deployment-config.md` §6) — not
  routed through Cloudflare/Traefik, no public FQDN.
- Evidence-pack request logging is a **future worker/persistence requirement,
  not current runtime behavior.** `audit-evidence-layer.md` §7.2 _recommends_
  that pack generation be logged to a separate `audit_pack_requests` table — so
  pack generation does not recursively appear in future packs — and §9.5
  explicitly records that this is **not implemented**: `auditEvidenceBuilder.js`
  performs no writes of any kind, and no `audit_pack_requests` table or migration
  exists today. When the audit worker is built, adding that request log (a table
  migration plus the worker write) is a required deliverable; it is **out of
  scope for Phase 2C**, which deploys nothing. Such a log would be the worker's
  own operational record — distinct from `finance.audit_events`, not financial
  truth. (Whether evidence packs are exposed for download is likewise a future
  route/persistence decision, out of Phase 2C.)

---

## 9. Malformed Lineage Is Surfaced, Not Swallowed

Evidence reconstruction must be robust to imperfect input without corrupting
evidence state. `auditEvidenceBuilder.js` already handles this (Phase 2B-11, and
the malformed-lineage coverage added in commit `79d551e7`):

- **Graceful absence.** No approvals → `approvals: []`; no adapter jobs →
  `adapter_jobs: []`; no reversals → `reversals: { count: 0, entries: [] }`. An
  empty event stream produces a valid empty pack — it never throws
  (`audit-evidence-layer.md` §9.4).
- **Malformed lineage** — a missing `causation_id`, a dangling
  `payload.original_entry_id`, an absent correlation link — is handled without
  throwing and without mutating any source event. The pack is still produced;
  the gap is simply represented as absent lineage rather than fabricated.
- A non-canonical `event_type` (e.g. a command name) fails the `finance.` prefix
  check and is **dropped**, never silently treated as a business event.

**Staging requirement:** when the audit worker encounters malformed lineage it
must (a) still return a valid, hash-consistent pack, and (b) **log the anomaly**
at `warn` with `tenant_id` and the offending `event_id` so an operator can
investigate the upstream emitter. The pack is not corrupted; the anomaly is
observable. Surfacing malformed lineage is an observability signal
([`observability-alerting.md`](./observability-alerting.md), 2C-11), not an
evidence-state failure.

---

## 10. Staging Activation

The worker is enabled by the three-tier gate
(`finance-worker-deployment-config.md` §3.1), set **only** in staging:

```
ENABLE_FINANCE_OPS=true
ENABLE_FINANCE_WORKERS=true
ENABLE_FINANCE_AUDIT_WORKER=true
```

All three default to `false`; the worker **starts disabled** and idles until all
three are explicitly truthy. Production (Hetzner) keeps every flag unset.
Preconditions match `projection-worker-staging-plan.md` §8.1 (gate cleared,
controlled tenant selected, observability in place).

---

## 11. Rollback / Disable

Disabling the audit worker is one non-destructive step: set
`ENABLE_FINANCE_AUDIT_WORKER=false` and redeploy; the worker idles. **No data is
lost** — the worker is a pure reader of `finance.audit_events` (which is immutable
regardless). `audit_timeline` simply stops advancing and can be rebuilt by
`replay`. Evidence packs already generated are unaffected. Re-enabling resumes
normally.

---

## 12. Acceptance Criteria — Self-Check

| 2C-7 acceptance criterion                  | Status                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Evidence generation is read-only           | ✅ Sections 2–3 — pure builder, DB-layer immutability, deep-cloned inputs; no write path exists.          |
| Evidence packs are deterministic           | ✅ Section 4 — injectable `packId`/`generatedAt`; byte-identical rebuilds incl. integrity hashes.         |
| Infrastructure event inclusion is explicit | ✅ Section 5 — `includeInfrastructureEvents` opt-in, default `false`; `audit_timeline` the only consumer. |
| No provider writes                         | ✅ Section 8 — no adapter, no provider client, no credentials.                                            |
| No new public routes                       | ✅ Section 8 — only the internal health surface; Phase 2C adds no HTTP route.                             |

---

_Part of the Finance Ops architecture suite. Related: `audit-evidence-layer.md`
(Track D), `worker-service-topology.md` (2B-13), `finance-worker-deployment-config.md`
(2C-5), `projection-worker-staging-plan.md` (2C-6), `replay-rebuild-operational-drill.md`
(2C-12), `observability-alerting.md` (2C-11)._
