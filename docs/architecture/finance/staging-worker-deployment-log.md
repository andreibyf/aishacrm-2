# Phase 3-4: Finance Worker Staging Deployment Log

> **Status:** PLANNING ONLY — No deployment executed  
> **Phase:** 3-4 of finance-ops staging activation  
> **Created:** 2026-05-25  
> **Branch:** `feat/finance-ops-runtime`

---

## 1. Purpose & Scope

This document defines the deployment plan for disabled-by-default finance workers on staging. It provides:

- Placement rules aligned with [DEPLOY_TOPOLOGY.md](../DEPLOY_TOPOLOGY.md)
- Example configuration following established staging patterns
- Environment variable specifications with safe defaults
- Rollback procedures using config-only toggles

**IMPORTANT:** This document does NOT deploy anything. Actual deployment requires explicit operator authorization. No Coolify mutations, env var changes, or VPS actions have been performed.

---

## 2. Modalities Exercised

| Action | This Session |
|--------|--------------|
| Documentation written | Yes |
| Example config created | Yes |
| Coolify mutation | No |
| Env var change on staging | No |
| VPS SSH | No |
| Migration applied | No |
| Production action | No |

---

## 3. Worker Inventory

| Worker | Status | Implementation | Prerequisite |
|--------|--------|----------------|--------------|
| `finance-projection-worker` | PLANNED | Not yet implemented | Worker code in `backend/workers/` |
| `finance-audit-worker` | DEFERRED | Not yet implemented | `audit_pack_requests` / evidence-pack host infrastructure |
| `finance-adapter-worker` | DEFERRED | Not yet implemented | Adapter Slice 2 completion |

**Note:** Only `finance-projection-worker` is scoped for Phase 3-4 example configuration. The audit and adapter workers are explicitly deferred and have no runtime, config, or deployment artifact in this phase.

---

## 4. Staging Placement Rules

Per [DEPLOY_TOPOLOGY.md](../DEPLOY_TOPOLOGY.md):

| Host | Role | IP | Finance Workers? |
|------|------|----|------------------|
| **VPS-1** | Staging | `147.189.173.237` | YES — all staging app services |
| **VPS-2** | Services | `147.189.168.164` | NO — Coolify control plane only |
| **Hetzner** | Production | `178.156.140.86` | Future — production only |

**Hard rule:** Finance workers deploy to **VPS-1 (staging)** or **Hetzner (production)**, never VPS-2.

---

## 5. Environment Variable Configuration

### 5.1 Finance Worker Variables (Disabled by Default)

| Variable | Default | Purpose |
|----------|---------|---------|
| `FINANCE_PROJECTION_WORKER_ENABLED` | `false` | Master switch for projection worker |
| `FINANCE_CONTROLLED_TENANT_IDS` | (empty) | Comma-separated tenant UUIDs to process |
| `FINANCE_PROJECTION_INTERVAL_MS` | `60000` | Polling interval in milliseconds |
| `FINANCE_PROJECTION_BATCH_SIZE` | `25` | Events processed per tick |

### 5.2 Critical Behavior: Empty Tenant List = No-Op

**`FINANCE_CONTROLLED_TENANT_IDS` semantics:**

- If empty or unset: Worker processes **zero tenants** = effectively disabled even if `ENABLED=true`
- If set: Worker processes **only** the listed tenant UUIDs
- No wildcard or "all tenants" mode exists — explicit tenant IDs required

This provides defense-in-depth: both the enable flag AND tenant list must be configured for any processing to occur.

### 5.3 Unchanged Variables

| Variable | Status | Reason |
|----------|--------|--------|
| `ENABLE_FINANCE_PERSISTENT_EVENTS` | `false`/unset | Backend route safety — fail-closed until Slice 2 projection-backed reads |
| `ENABLE_FINANCE_OPS` | Unchanged | Not modified unless operator activation separately authorized |

---

## 6. Health / Log / Heartbeat Expectations

### 6.1 Healthcheck (When Implemented)

Following the pattern from `staging/04-braid/docker-compose.yml`:

```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3001/health || exit 1"]
  interval: 120s      # Internal worker, not user-facing
  timeout: 3s
  retries: 3
  start_period: 30s
```

**Rationale:** 120s interval matches Braid MCP workers — internal background workers don't need aggressive healthchecks that consume CPU.

### 6.2 Logging Pattern

Following existing worker patterns (`campaignWorker.js`, `aiTriggersWorker.js`):

```javascript
// Startup
logger.info({ intervalMs }, '[finance-projection] Starting');

// Per-tick
logger.info({ 
  tenantCount: N, 
  processedCount: X, 
  errorCount: Y 
}, '[finance-projection] Tick');

// Error
logger.error({ err }, '[finance-projection] processPending error');

// Shutdown
logger.info('[finance-projection] Stopped');
```

**Log rotation** (compose config):
```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

### 6.3 Heartbeat Mechanism

- Per-tick logging provides implicit heartbeat visibility
- Uses `startJitteredInterval()` from `backend/lib/workerScheduling.js` for exponential backoff on failure
- Auto-skips ticks (up to 8x multiplier) if worker throws, preventing runaway resource consumption

---

## 7. Rollback / Disable Procedure

### 7.1 Config-Only Disable (No Redeploy)

**Option A — Disable via enable flag:**
```bash
# In Doppler or env
FINANCE_PROJECTION_WORKER_ENABLED=false
```
Worker stops processing on next tick (within interval period).

**Option B — Clear tenant list:**
```bash
# In Doppler or env
FINANCE_CONTROLLED_TENANT_IDS=
```
Empty list = zero tenants = no-op, even if enabled.

**Note:** If worker checks flag per-tick (recommended pattern), no container restart is required.

### 7.2 Full Rollback (Container Removal)

1. Remove `finance-projection-worker` service from compose file
2. Redeploy compose stack: `docker compose up -d`
3. Worker container is removed

### 7.3 Emergency Stop

```bash
# On VPS-1 via SSH
docker stop staging-finance-projection-worker
```

---

## 8. Example Configuration Reference

See [`deploy/coolify/finance-workers.staging.example.yml`](../../../deploy/coolify/finance-workers.staging.example.yml) for example Coolify compose configuration.

**Key properties of the example:**
- Worker disabled by default (`FINANCE_PROJECTION_WORKER_ENABLED=false`)
- Empty tenant list by default (`FINANCE_CONTROLLED_TENANT_IDS=`)
- Memory cap: 512m limit / 256m reservation
- cgroup_parent: `aishacrm.slice` (VPS-1 CPU cap)
- Network: `aishacrm_aishanet-staging` (shared staging network)

---

## 9. Hard Constraints Checklist

| # | Constraint | Status | Evidence |
|---|------------|--------|----------|
| 1 | No actual deployment | CONFIRMED | §2 modalities table |
| 2 | No Coolify/VPS mutation | CONFIRMED | §2 modalities table |
| 3 | No env var changes on staging | CONFIRMED | Example file only |
| 4 | No migration application | CONFIRMED | Phase 3-2 scope |
| 5 | No provider writes | CONFIRMED | No DB operations |
| 6 | No production action | CONFIRMED | Staging scope only |
| 7 | finance-audit-worker not implied as existing | CONFIRMED | §3 marks DEFERRED |
| 8 | finance-adapter-worker not implied as existing | CONFIRMED | §3 marks DEFERRED |
| 9 | `ENABLE_FINANCE_PERSISTENT_EVENTS` remains false/unset | CONFIRMED | §5.3 |
| 10 | `ENABLE_FINANCE_OPS` unchanged | CONFIRMED | §5.3 |
| 11 | Workers disabled by default | CONFIRMED | §5.1, §8 |
| 12 | Empty `FINANCE_CONTROLLED_TENANT_IDS` = no-op | CONFIRMED | §5.2 |

---

## 10. Stop Conditions

If any of the following are true, **halt and escalate**:

1. Operator attempts to enable workers without explicit tenant IDs
2. Operator attempts to set `ENABLE_FINANCE_PERSISTENT_EVENTS=true` before Slice 2
3. Operator attempts to deploy to VPS-2 (wrong host)
4. Worker code doesn't exist yet but deployment is attempted
5. Migration prerequisites (168, 171) not applied before worker activation

---

## 11. Next Steps

When ready to proceed with actual deployment (requires explicit operator authorization):

1. Implement `finance-projection-worker` in `backend/workers/`
2. Add worker startup logic to `backend/server.js`
3. Copy example config to actual staging compose
4. Set specific `FINANCE_CONTROLLED_TENANT_IDS` in Doppler
5. Set `FINANCE_PROJECTION_WORKER_ENABLED=true` in Doppler
6. Deploy via Coolify to VPS-1
7. Monitor logs and health for first 24h

---

## 12. Related Documents

- [DEPLOY_TOPOLOGY.md](../DEPLOY_TOPOLOGY.md) — Canonical host placement rules
- [phase-3-staging-activation-plan.md](./phase-3-staging-activation-plan.md) — Phase 3 master plan
- [staging-migration-application-log.md](./staging-migration-application-log.md) — Phase 3-2 migration log
- [staging-rls-verification-results.md](./staging-rls-verification-results.md) — Phase 3-3 RLS verification
- [staging/04-braid/docker-compose.yml](../../../staging/04-braid/docker-compose.yml) — Reference worker pattern
