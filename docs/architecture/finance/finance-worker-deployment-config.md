# Finance Ops — Phase 2C-5: Finance Worker Deployment Manifests / Configuration

**Phase 2C-5 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Deployment configuration prepared — **disabled by default, not deployed in any environment.**
**Date:** 2026-05-22
**Deliverable config:** [`deploy/coolify/finance-workers.example.yml`](../../../deploy/coolify/finance-workers.example.yml)
**Related:** [`worker-service-topology.md`](./worker-service-topology.md) (2B-13 — authoritative worker design) · [`../DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md)

---

## 1. Goal

Prepare the **disabled-by-default deployment configuration** for the three
Finance Ops worker services. Phase 2B-13 ([`worker-service-topology.md`](./worker-service-topology.md))
designed the worker topology but deliberately created no deployment artifact.
2C-5 produces that artifact: a reviewed Coolify-native compose example and this
configuration reference.

This phase introduces **no new finance semantics** and **deploys nothing**. The
example config exists so that, when a future release gate opens, activation is a
review-and-set-flags exercise rather than a from-scratch design.

---

## 2. Worker Services

Three services, exactly as `worker-service-topology.md` defines them:

| Service                     | Role                                                           | Source contract                                                        |
| --------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `finance-projection-worker` | Hosts the Projection Runtime Runner; poll → dispatch / replay. | `projection-runtime.md`, `projection-worker-staging-plan.md` (2C-6)    |
| `finance-audit-worker`      | `audit_timeline` upkeep + evidence-pack generation.            | `audit-evidence-layer.md`, `audit-worker-staging-plan.md` (2C-7)       |
| `finance-adapter-worker`    | Adapter job processor — **sandbox / draft-only**.              | `adapter-runtime-contract.md`, `adapter-worker-sandbox-plan.md` (2C-8) |

Each is a long-running Node process with no public FQDN, reusing the existing
`aishacrm-backend` image with a different `command` — the same pattern the
existing `aisha-comms` communications worker uses
(`prod/04-app-fast/docker-compose.yml`).

> **The worker entry points do not exist yet.** `worker-service-topology.md` §11
> records that no worker process module is implemented. The example compose file
> references the _intended_ `command` for each worker; the npm scripts and entry
> modules are Phase 3 implementation work. The config is a reviewed template, not
> a runnable deployment.

---

## 3. Environment Variables

### 3.1 The three-tier enable gate

A worker runs only when **all three** gates are truthy. Any one unset ⇒ the
worker starts, logs that it is disabled, and idles (it never polls, never claims
a job, never calls a provider).

| Tier            | Variable                                                                                             | Purpose                                                                                                                 | Default |
| --------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| 1 — runtime     | `ENABLE_FINANCE_OPS`                                                                                 | Master Finance Ops gate (`financeRuntimeGate.js`).                                                                      | `false` |
| 2 — worker tier | `ENABLE_FINANCE_WORKERS`                                                                             | Master switch for the **whole worker tier** — one flag to enable/disable all workers without touching per-worker flags. | `false` |
| 3 — per worker  | `ENABLE_FINANCE_PROJECTION_WORKER` / `ENABLE_FINANCE_AUDIT_WORKER` / `ENABLE_FINANCE_ADAPTER_WORKER` | Enables one specific worker.                                                                                            | `false` |

> **Reconciliation with 2B-13.** `worker-service-topology.md` §5 defined a
> two-tier gate (`ENABLE_FINANCE_OPS` + per-worker flag). 2C-5 inserts
> `ENABLE_FINANCE_WORKERS` as the middle tier, so the worker tier can be enabled
> or killed as a unit. The contract is strictly more conservative — it adds a
> gate, never removes one. The effective rule is now:
> `ENABLE_FINANCE_OPS && ENABLE_FINANCE_WORKERS && <per-worker flag>`.

### 3.2 Adapter safety flags

These two flags are the configuration half of the adapter worker's
sandbox-only / no-provider-write posture (the code-guard half is 2C-8).

| Variable                          | Purpose                                                                                                                                                                                         | Default      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `FINANCE_ADAPTER_MODE`            | Caps what the adapter worker may do. Allowed: `read_only`, `draft_only`. **Never** `approval_required_write` in staging config.                                                                 | `draft_only` |
| `FINANCE_PROVIDER_WRITES_ENABLED` | Hard kill switch for **all** outbound provider writes. While `false`, the adapter worker performs no provider HTTP write of any kind — it may only map/validate payloads and advance job state. | `false`      |

`FINANCE_PROVIDER_WRITES_ENABLED=false` is the dominant control: even with
`FINANCE_ADAPTER_MODE=draft_only`, no provider write occurs while it is `false`.
Flipping it requires a separate, explicit decision and a sandbox-only provider
target (2C-8, 2C-9). It is **never** set true in staging worker config.

### 3.3 Polling, batching, connection

| Variable                          | Purpose                                                                 | Default                 |
| --------------------------------- | ----------------------------------------------------------------------- | ----------------------- |
| `FINANCE_WORKER_POLL_INTERVAL_MS` | Idle wait between poll cycles when the last cycle found no work.        | `5000`                  |
| `FINANCE_WORKER_BATCH_SIZE`       | Max events (projection) or jobs (adapter) processed per poll cycle.     | `100`                   |
| `FINANCE_DB_URL`                  | Postgres connection string for the finance schema. Injected by Doppler. | (required when enabled) |
| `FINANCE_DB_POOL_MAX`             | Max connections in the worker's `pg.Pool`.                              | `5`                     |

Per-worker tuning, retry/back-off, and health/observability variables
(`FINANCE_WORKER_HEALTH_PORT`, `FINANCE_ADAPTER_MAX_ATTEMPTS`, etc.) are
enumerated in `worker-service-topology.md` §5 and are not re-listed here; the
example compose file sets the ones needed for a coherent template.

### 3.4 No provider credentials introduced

No OAuth client ID/secret, no provider API key appears in this config. Provider
connection config is loaded per-tenant from `tenant_integrations.api_credentials`
at runtime (`adapter-runtime-contract.md` §6), and only when provider writes are
eventually, explicitly enabled. The staging worker config introduces **zero**
provider secrets.

---

## 4. The Example Compose File

`deploy/coolify/finance-workers.example.yml` is a Coolify-native compose file
modeled on `prod/04-app-fast/docker-compose.yml` (the existing `aisha-comms`
worker is the closest precedent). It defines all three workers with:

- **Every enable flag hard-set to `false`** in the `environment` block — the
  file cannot, as written, start a working worker.
- **`FINANCE_PROVIDER_WRITES_ENABLED=false`** and **`FINANCE_ADAPTER_MODE=draft_only`**
  on the adapter worker.
- **No provider secrets**, no `ports:` mapping (workers have no public FQDN),
  Doppler-injected config (`DOPPLER_TOKEN` / `DOPPLER_PROJECT` / `DOPPLER_CONFIG`).
- Restart policy, health checks, and logging per Sections 5–7.

It is an `.example.yml` — **not referenced by any deployment, CI job, or Coolify
app.** Activating a worker means copying it into a real Coolify app and
deliberately flipping the gate flags, which is gated by the staging activation
review ([`staging-activation-review.md`](./staging-activation-review.md)).

---

## 5. Restart Policy

`restart: unless-stopped` — identical to every existing long-running service in
the repo (`backend`, `aisha-comms`, the Redis services). Rationale:

- A worker that crashes is restarted automatically; a disabled worker that
  idles cleanly is not a crash and is not restarted in a loop.
- `unless-stopped` (not `always`) means an operator who deliberately stops a
  worker — e.g. during an incident — keeps it stopped across a daemon restart.
- A worker that starts with Finance Ops disabled **idles**; it does not exit.
  Idling-not-exiting is what keeps `unless-stopped` from becoming a restart
  loop for the default (disabled) posture.

---

## 6. Health Checks

Each worker exposes a minimal internal HTTP health surface on
`FINANCE_WORKER_HEALTH_PORT` (default `9090`), per `worker-service-topology.md`
§8 — `GET /health` (liveness) and `GET /ready` (readiness). The compose
`healthcheck` polls `GET /health` from inside the container (no host port is
published).

| Check          | Value                                                           |
| -------------- | --------------------------------------------------------------- |
| `test`         | `wget -qO- http://127.0.0.1:$FINANCE_WORKER_HEALTH_PORT/health` |
| `interval`     | `60s`                                                           |
| `timeout`      | `5s`                                                            |
| `retries`      | `3`                                                             |
| `start_period` | `30s`                                                           |

Key behavior (from `worker-service-topology.md` §8.3): a worker that is
**disabled and idling reports healthy** (`200`) — the default disabled posture
is explicitly a healthy state, so a disabled worker does not show as failed in
Coolify or Uptime Kuma. `degraded` projections and dead-lettered adapter jobs
surface through `GET /ready` as `503`/`warn` so monitoring can alert; recovery is
operator-triggered, never automatic. Observability wiring is detailed in
[`observability-alerting.md`](./observability-alerting.md) (2C-11).

---

## 7. Logging

Consistent with every service in `docker-compose.yml` and the `prod/*` compose
files:

```yaml
logging:
  driver: json-file
  options:
    max-size: '10m'
    max-file: '3'
```

Workers log via the existing backend Pino logger (`backend/lib/logger.js`) —
structured JSON to stdout, captured by the `json-file` driver, with the standard
secret redaction. `FINANCE_WORKER_LOG_LEVEL` controls verbosity. No worker logs
provider credentials or raw JWT contents (`observability-alerting.md` §"No
secrets in logs").

---

## 8. Deployment Placement

Per `worker-service-topology.md` §7 and decision E2, the workers are intended as
**separate Coolify worker apps on VPS-2** (the services/control-plane host),
keeping projection-replay and adapter retry/back-off load off the CPU-capped
staging VPS-1. The example compose file is environment-agnostic; the actual
VPS-1-vs-VPS-2 placement must be **re-confirmed against
[`DEPLOY_TOPOLOGY.md`](../DEPLOY_TOPOLOGY.md)** when a worker is first deployed,
and that document updated to record the worker apps in its app↔role table.

The workers join the external `aishanet` Docker network (as the `prod/*` compose
files do) so they resolve `aishacrm-backend`, `redis-memory`, and `redis-cache`
by their stable network aliases.

---

## 9. Acceptance Criteria — Self-Check

| 2C-5 acceptance criterion                | Status                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Workers are disabled by default          | ✅ Section 3.1 three-tier gate; every enable flag `false` in the example file.                                    |
| Config does not activate provider writes | ✅ Section 3.2 — `FINANCE_PROVIDER_WRITES_ENABLED=false`, `FINANCE_ADAPTER_MODE=draft_only`; no provider secrets. |
| Health checks are defined                | ✅ Section 6 — `GET /health` liveness + `GET /ready` readiness; compose `healthcheck` specified.                  |
| Restart policy is documented             | ✅ Section 5 — `restart: unless-stopped`, with rationale.                                                         |
| Logs are routed consistently             | ✅ Section 7 — `json-file` driver (repo convention) + Pino structured logs with redaction.                        |

---

_Part of the Finance Ops architecture suite. Related: `worker-service-topology.md`
(2B-13), `projection-worker-staging-plan.md` (2C-6), `audit-worker-staging-plan.md`
(2C-7), `adapter-worker-sandbox-plan.md` (2C-8), `observability-alerting.md`
(2C-11), `../DEPLOY_TOPOLOGY.md`._
