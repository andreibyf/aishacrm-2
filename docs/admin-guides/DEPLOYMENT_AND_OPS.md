# Deployment and Operations Guide

**Updated:** 2026-05-02
**Owner:** Dre
**Audience:** Anyone deploying, debugging, or operating AiSHA CRM in any environment.

This is the single source of truth for "what runs where" across all AiSHA environments. If a statement here conflicts with another doc, this file wins. Other deployment notes in `docs/deployment/` and `docs/operations/` are now historical.

---

## 1. TL;DR — Server Topology

Four physical (or virtual) hosts. Coolify is the deploy control plane on VPS-2 and reaches every server via SSH.

| Role             | Host alias               | Provider    | IP                | Coolify server uuid                                 | Cloudflared tunnel name     |
| ---------------- | ------------------------ | ----------- | ----------------- | --------------------------------------------------- | --------------------------- |
| Staging          | `beige-koala`            | Zap-Hosting | `147.189.173.237` | `f7uzrwlbqjtx6qamppma5xsz`                          | `aishacrm-tunnel` (host)    |
| Services tier    | (Coolify host)           | Zap-Hosting | `147.189.168.164` | `wrkskvdu8tsnp8si53fm135k` (`localhost` in Coolify) | `aishacrm-vps2` (container) |
| Production       | (Hetzner CCX13, Ashburn) | Hetzner     | `178.156.140.86`  | `o1en79sodcmr7zhq5844ynrr`                          | `aishacrm-prod-hetzner`     |
| Developer laptop | localhost                | (Dre's box) | `164.68.231.123`  | not in Coolify                                      | n/a                         |

**One-line summary of what runs where:**

| Workload                                           | VPS-1 Staging | VPS-2 Services | Hetzner Prod  |
| -------------------------------------------------- | ------------- | -------------- | ------------- |
| Backend / Frontend / Comms                         | yes (Coolify) | no             | yes (GHCR)    |
| Braid MCP + workers                                | yes (Coolify) | no             | yes (GHCR)    |
| LiteLLM                                            | yes (Coolify) | no             | yes (Coolify) |
| Redis pair (memory + cache)                        | yes (manual)  | no             | yes (manual)  |
| Cal.com prod (`scheduler.aishacrm.com`)            | no            | yes (manual)   | no            |
| Cal.com staging (`staging-scheduler.aishacrm.com`) | no            | yes (Coolify)  | no            |
| Coolify control plane                              | no            | yes (manual)   | no            |
| Gitea (`gitea.aishacrm.com`)                       | no            | yes (manual)   | no            |
| Uptime Kuma                                        | no            | yes (manual)   | no            |
| Cloudflared (host systemd)                         | yes           | no             | no            |
| Cloudflared (container)                            | no            | yes            | yes           |
| Landing page (`aishacrm.com`)                      | yes (manual)  | no             | no            |
| Hawser agent                                       | no            | no (planned)   | yes           |

---

## 2. The Dual Deployment State

AiSHA is mid-migration from a GHCR-based deploy pipeline to **Coolify-native local builds**. The two environments are at different stages and the difference is operationally important.

### 2.1 Staging (VPS-1) — fully Coolify-native

Every staging application service is a Coolify Application that builds locally on VPS-1 from a Gitea clone. No registry round-trip.

| Coolify app             | Compose path                                  | What it runs                                |
| ----------------------- | --------------------------------------------- | ------------------------------------------- |
| `staging-litellm`       | `staging/services/litellm/docker-compose.yml` | LiteLLM router                              |
| `staging-braid`         | `staging/04-braid/docker-compose.yml`         | Braid MCP server + 2 worker nodes           |
| `staging-backend-heavy` | `staging/01-backend-heavy/docker-compose.yml` | Backend container only (Redis stays manual) |
| `staging-app-fast`      | `staging/02-app-fast/docker-compose.yml`      | Frontend + aisha-comms                      |

Source of truth: `gitea.aishacrm.com/aishacrm/aishacrm-2`. Coolify's per-app `watch_paths` decide which app rebuilds when files change.

### 2.2 Production (Hetzner) — mostly GHCR, partially Coolify

Only `prod-litellm` is Coolify-native today. Everything else still pulls pre-built images from GHCR:

| Container                       | Source                                          |
| ------------------------------- | ----------------------------------------------- |
| `aishacrm-backend`              | `ghcr.io/andreibyf/aishacrm-2-backend:v7.1.31`  |
| `aishacrm-comms`                | `ghcr.io/andreibyf/aishacrm-2-comms:v7.1.31`    |
| `aishacrm-frontend`             | `ghcr.io/andreibyf/aishacrm-2-frontend:v7.1.31` |
| `braid-mcp-server` (+2 workers) | `ghcr.io/andreibyf/aishacrm-2-braid:v7.1.31`    |
| `prod-litellm`                  | Coolify-native build from Gitea                 |

**Phase 2 plan (queued, not done):** convert each prod compose entry from `image: ghcr.io/...` to `build: { context: ..., dockerfile: ... }`, run side-by-side with the GHCR-pulled instance for at least one week, then cut traffic. Recommended order: litellm (done), mcp, frontend, calcom-db, backend last (largest build).

**Hardening required before starting Phase 2 on prod:**

1. Every prod compose service must have `mem_limit`. Total budget under 6144 MB (75% of 8 GB) — enforced by `backend/__tests__/routes/prod-compose-mem-limits.test.js`.
2. Coolify build concurrency capped at 1 to avoid stacking parallel builds.
3. Cal.com pin bumped past the v5-era `0aca8203...` digest (works only because cached on VPS).

---

## 3. Per-Server Inventory

### 3.1 VPS-1 — Staging (`beige-koala`, `147.189.173.237`)

**Coolify-managed (4 applications):** the four staging applications listed in section 2.1, each with its own webhook URL and `watch_paths`.

**Manual stack (not Coolify-managed):**

| Container / service          | Notes                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `redis-memory` (port 6379)   | Ephemeral: presence, session, real-time                                         |
| `redis-cache` (port 6380)    | Persistent: stats, aggregations, response caches                                |
| `cloudflared` (host systemd) | `aishacrm-tunnel` — `/usr/bin/cloudflared --config /etc/cloudflared/config.yml` |
| `aisha-landing-page`         | Serves `aishacrm.com` / `www.aishacrm.com` on `localhost:3050`                  |

**Network topology:** Coolify cannot route `staging-backend` and `staging-frontend` through `coolify-proxy` Traefik because the auto-generated routers have no service binding. The proven workaround binds host ports and lets cloudflared route there directly:

| Public hostname                    | Cloudflared destination | Coolify app             |
| ---------------------------------- | ----------------------- | ----------------------- |
| `staging-app.aishacrm.com`         | `localhost:5000`        | `staging-app-fast`      |
| `staging-api.aishacrm.com`         | `localhost:5001`        | `staging-backend-heavy` |
| `aishacrm.com`, `www.aishacrm.com` | `localhost:3050`        | landing-page (manual)   |

Compose service binds use the `127.0.0.1:host:container` pattern (e.g. `127.0.0.1:5001:3001`) so the host port is reachable only by cloudflared on the same box.

**Memory budget (5.6 GB cap on a ~30 GB nominal box, throttled by Zap):**

| Service                   | mem_limit   |
| ------------------------- | ----------- |
| Backend                   | 3072 MB     |
| Comms                     | 768 MB      |
| Frontend                  | 256 MB      |
| Braid MCP server          | 512 MB      |
| Braid worker 1 / worker 2 | 384 MB each |
| LiteLLM                   | 768 MB      |

**Where data lives:** Redis volumes on the host filesystem under `/opt/aishacrm/redis-*`. No application data lives on staging — Supabase is the source of truth.

### 3.2 VPS-2 — Services (`147.189.168.164`)

Hosts the Coolify control plane itself plus the long-running services that benefit from being on a separate box.

**Coolify-managed:**

| Application      | Public URL                       |
| ---------------- | -------------------------------- |
| `staging-calcom` | `staging-scheduler.aishacrm.com` |

`staging-calcom` runs in a dedicated deploy directory `/opt/staging-calcom/` with explicit `--project-name staging-calcom` on every compose command — see the postmortem in section 7.2 for why this is non-negotiable.

**Manual stack:**

| Container / service         | Public URL               | Notes                                                                |
| --------------------------- | ------------------------ | -------------------------------------------------------------------- |
| Coolify (control plane)     | `deploy.aishacrm.com`    | Reaches every other server via SSH                                   |
| `aishacrm-calcom` (prod)    | `scheduler.aishacrm.com` | Production Cal.com, lives in `/opt/aishacrm/`                        |
| `aishacrm-calcom-db` (prod) | (internal)               | Postgres for prod calcom; volume `aishacrm_calcom_db_data`           |
| `gitea`                     | `gitea.aishacrm.com`     | Source of truth Git host                                             |
| `uptime-kuma`               | (internal monitoring UI) | Synthetic monitoring                                                 |
| `cloudflared` (container)   | n/a                      | `aishacrm-vps2` tunnel (uuid `ecff23d3-890e-4bea-b59e-aacbafae4b9c`) |

**Cloudflared routes from `aishacrm-vps2` tunnel:**

| Hostname                         | Backend                                            |
| -------------------------------- | -------------------------------------------------- |
| `gitea.aishacrm.com`             | `gitea:3000`                                       |
| `deploy.aishacrm.com`            | `coolify:8080`                                     |
| `scheduler.aishacrm.com`         | `calcom:3000` (prod)                               |
| `staging-scheduler.aishacrm.com` | `aishacrm-calcom-staging:3000`                     |
| `repo.aishacrm.com`              | `coolify-proxy:80` (legacy OneDev — to be retired) |

**SSH access to VPS-2:**

```bash
# Non-root user (uses VPS_2_PWD from .env)
ssh andreibyf@147.189.168.164

# Root via plink (Windows)
plink -hostkey "ssh-ed25519 255 SHA256:myUaNEo+cBfg+ziVzNB5GZMNOF80ToSWuYKF9f66u8A" root@147.189.168.164
```

### 3.3 Hetzner — Production (`178.156.140.86`)

Hetzner CCX13 in Ashburn, monthly subscription. 8 GB RAM total. Production traffic, real customer data.

**Coolify-managed:**

| Application    | Notes                                    |
| -------------- | ---------------------------------------- |
| `prod-litellm` | Only Coolify-native build on prod so far |

**Manual / GHCR-pulled stack:**

| Container                      | Source / role                                           |
| ------------------------------ | ------------------------------------------------------- |
| `aishacrm-backend`             | GHCR `:v7.1.31` — Express API behind `api.aishacrm.com` |
| `aishacrm-frontend`            | GHCR `:v7.1.31` — Vite SPA behind `app.aishacrm.com`    |
| `aishacrm-comms`               | GHCR `:v7.1.31` — comms worker                          |
| `braid-mcp-server` + 2 workers | GHCR `:v7.1.31` — Braid MCP                             |
| `redis-memory` / `redis-cache` | Manual, same pattern as staging                         |
| `aishacrm-cloudflared-hetzner` | Cloudflared tunnel for prod                             |
| `hawser`                       | Dockhand monitoring agent                               |

**Public URLs:**

| Hostname           | Backend            |
| ------------------ | ------------------ |
| `app.aishacrm.com` | frontend (Hetzner) |
| `api.aishacrm.com` | backend (Hetzner)  |

**Memory budget:** sum of `mem_limit` across services must stay under 6144 MB so Coolify has build headroom on the 8 GB box. Enforced in CI by `backend/__tests__/routes/prod-compose-mem-limits.test.js`.

---

## 4. Deploy Workflow

The pipeline is **push → mirror → webhook → Coolify build → Traefik / cloudflared → public URL**.

```
                       +------------------+
local push  ------>    |  Gitea (origin)  |  <----- GitHub Action mirror
                       +--------+---------+         (.github/workflows/
                                |                    mirror-to-gitea.yml,
                                |  push webhook      force-push on every
                                v                    push to main)
                       +------------------+
                       |  Coolify on VPS-2|
                       |  (per-app webhook|
                       |   matches        |
                       |   watch_paths)   |
                       +--------+---------+
                                |  SSH
                                v
                  +-------------+-------------+
                  |                           |
                  v                           v
        VPS-1 (staging)              Hetzner (prod-litellm only;
        builds locally,              other apps still pulled
        starts container             from GHCR by manual compose)
                  |                           |
                  v                           v
        cloudflared (host          cloudflared (container)
        systemd)                   on Hetzner
                  |                           |
                  v                           v
        staging-app/api/           app.aishacrm.com /
        scheduler                  api.aishacrm.com
        .aishacrm.com
```

**Two Git remotes from the laptop:**

```bash
git remote -v
# origin  https://gitea.aishacrm.com/aishacrm/aishacrm-2.git (push/fetch)
# github  https://github.com/andreibyf/aishacrm-2.git        (push/fetch)
```

A push to `main` on either remote ends up on Gitea: `origin` directly, `github` via the mirror workflow. Coolify only watches Gitea.

**Discord notifications fire on every Coolify deploy event** (start, success, fail) — wired to the deploy-events Discord channel. If a deploy looks stuck, check Discord first.

---

## 5. Operational Runbooks

### 5.1 Redeploy a single Coolify application

Three paths, in order of preference:

```bash
# 1. Coolify dashboard
#    deploy.aishacrm.com -> Applications -> <app> -> Redeploy
#    Use this if you want to see the build log streamed in the UI.

# 2. Coolify API (programmatic)
curl -X POST \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "https://deploy.aishacrm.com/api/v1/deploy?uuid=<application_uuid>&force=true"

# 3. Trigger via Gitea push to a watched path
git commit --allow-empty -m "redeploy: bump <app>"
git push origin main
```

Note: Coolify's `force=true` does not add `--pull always` to compose-up. Cached images persist. If a service uses an external `image:` tag, manually `docker pull` on the target VPS or pin to a versioned tag instead of `:latest`.

### 5.2 Roll back a deploy

**Coolify-native apps (staging, prod-litellm):** in the Coolify dashboard, open the app, go to **Deployments**, find the last green deploy, and click **Redeploy**. Coolify checks out that exact commit from Gitea and rebuilds.

**GHCR-pulled prod apps:** edit `docker-compose.prod.yml` on Hetzner to pin the previous version tag (e.g. `v7.1.30` instead of `v7.1.31`), then:

```bash
ssh andreibyf@178.156.140.86
cd /opt/aishacrm
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Always update `CHANGELOG.md` with the rollback target tag and the reason.

### 5.3 Access container logs

```bash
# Coolify dashboard
#    deploy.aishacrm.com -> Applications -> <app> -> Logs
#    Streams stdout/stderr live. Best first stop.

# SSH to the host
ssh andreibyf@147.189.173.237                   # staging
ssh andreibyf@147.189.168.164                   # services tier
ssh andreibyf@178.156.140.86                    # prod
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker logs --tail=200 -f <container_name>

# Coolify API (returns last N lines as JSON)
curl -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "https://deploy.aishacrm.com/api/v1/applications/<uuid>/logs?lines=200"
```

### 5.4 Recovering from a Zap CPU eviction (VPS-1)

Zap-Hosting throttles or hard-evicts the staging VPS under sustained CPU pressure. Recovery sequence:

```bash
# 1. Confirm the box is reachable and check load
ssh andreibyf@147.189.173.237
uptime
docker ps -a

# 2. If containers are stopped, start them in dependency order
cd /opt/aishacrm
docker compose -f docker-compose.staging-redis.yml up -d
# Coolify will reconcile the application containers automatically once
# the box is responsive again.

# 3. If the box is unresponsive, request a hard reboot from the Zap panel.
#    Containers come back via `restart: unless-stopped`.

# 4. After recovery, find the workload that pushed CPU over the line:
docker stats --no-stream
ps aux --sort=-%cpu | head -20

# 5. Audit cron + systemd timers for runaway recursive grep / find jobs
sudo systemctl list-timers
crontab -l && sudo crontab -l
```

The single highest-impact fix shipped 2026-05-02 was bumping `CAMPAIGN_WORKER_INTERVAL_MS` from 5000 ms to 60000 ms (commit `20604195`), eliminating ~17 K phantom Supabase queries/day from idle backends. If a box is in eviction loops, double-check that this value is in effect on the running container.

### 5.5 Health checks

```bash
# Production
curl https://api.aishacrm.com/api/system/health
curl https://app.aishacrm.com/

# Staging
curl https://staging-api.aishacrm.com/api/system/health
curl https://staging-app.aishacrm.com/

# Local Docker
curl http://localhost:4001/api/system/health
```

---

## 6. Cal.com Hardening

Cal.com is sensitive in two ways: a build-time URL leaks if you build the frontend wrong, and the prod and staging deployments will collide if you put them in the same compose project.

### 6.1 Build-time vs runtime configuration

`VITE_*` variables are baked into the frontend bundle at build time. Runtime env injection (Doppler, container env) does **not** rewrite already-built `/app/dist` assets.

Required at build time:

```
VITE_CALCOM_URL=https://scheduler.aishacrm.com
```

Post-deploy, prove the bundle is clean:

```bash
docker exec aishacrm-frontend sh -lc "grep -R -n 'localhost:3002' /app/dist || true"
# Expected: no matches.
```

CI fails if the prod frontend dist contains `localhost:3002`.

### 6.2 Deployment policy

Use immutable image tags for releases, never floating `:latest`:

- Do: `ghcr.io/.../aishacrm-2-frontend:v7.1.31`
- Avoid: `ghcr.io/.../aishacrm-2-frontend:latest`

### 6.3 Verification checklist after a Cal.com deploy

1. Frontend bundle is free of `localhost:3002` (command above).
2. Tenant integrations list:
   - `GET /api/tenantintegrations?tenant_id=<tenant>` returns rows regardless of `is_active`.
   - `?is_active=true` returns active rows only.
   - `?is_active=false` returns inactive rows only.
3. Shortlink canonicalization:
   - Create a shortlink with a localhost-origin destination.
   - Persisted destination and the redirect `Location` header use `scheduler.aishacrm.com`.
   - No redirect `Location` header to localhost.

### 6.4 Rollback

1. Revert `docker-compose.prod.yml` (or the Coolify app pin) to the previous immutable tag.
2. `docker compose pull && docker compose up -d`.
3. Re-run the verification checklist above.
4. Record incident in `CHANGELOG.md` with: change deployed, exact rollback target tags, remediation ETA.

### 6.5 Hard rules

- Never deploy frontend from floating `:latest`.
- Production Cal.com (`/opt/aishacrm/`) and staging Cal.com (`/opt/staging-calcom/`) must live in **separate directories** with **separate compose project names**. See section 7.2.

---

## 7. Postmortem Lessons

Two production-impacting incidents have shaped current ops. Both are summarized below; the action items have already been implemented.

### 7.1 VPS crash from runaway grep — 2026-04-23

**Impact:** ~3 hours of staging-VPS unresponsiveness (21:30 → 00:37 UTC). A post-deploy validation script ran `grep -r "localhost:3000" apps/web/.next/`, looking for a Next.js path that does not exist (AiSHA is Vite, output `/app/dist`). With no timeout and no early exit, grep consumed 21.5% CPU continuously for hours.

**What changed:**

- Every grep/find in CI is now wrapped with `run_timed 60s ...`.
- Validation paths are checked with `[ -d /app/dist ]` before searching.
- Recursive grep on the production VPS is forbidden in deploy scripts; use `find -maxdepth N -type f -name '*.js' -exec grep -l ... {} +` patterns instead, with `head -N` early exit.
- A `monitor_cpu.sh` systemd timer auto-kills any grep above 20% CPU for >5 minutes.

**Lesson:** know the build system. Do not paste validation snippets from other stacks.

### 7.2 Staging Cal.com cutover took prod calcom down — 2026-05-01

**Impact:** ~3 minutes of prod Cal.com downtime during the staging cutover to VPS-2. The first attempt placed the staging compose in `/opt/aishacrm/` on VPS-2, alongside prod's compose. Both files declared service names `calcom` and `calcom-db`. Compose v2 derived the project name `aishacrm` from the directory and matched the existing prod containers by `(project, service)`, recreating them under the staging definition.

**Recovery:** `docker compose up -d --no-deps calcom calcom-db cloudflared` in the prod directory. Volume `aishacrm_calcom_db_data` was untouched.

**What changed:**

- Staging Cal.com lives in a dedicated directory `/opt/staging-calcom/`.
- Every compose command for staging Cal.com uses an explicit `--project-name staging-calcom`.
- Both rules are documented in the header of `staging/services/calcom/docker-compose.yml`.

**Lesson:** Compose v2 matches `(project, service)` tuples; identical service names in the same project name silently take over existing containers. Always use distinct project names for distinct deployments on the same host.

---

## 8. Doppler Configuration Conventions

Doppler is the single source of runtime secrets. Local `.env` files are dev-only conveniences.

**Project:** `aishacrm`

| Config         | Used by                                                        |
| -------------- | -------------------------------------------------------------- |
| `dev`          | Root dev config (shared dev defaults)                          |
| `dev_personal` | Developer-laptop overrides (each engineer has their own clone) |
| `stg`          | Root staging config                                            |
| `stg_stg`      | Staging runtime — what containers on VPS-1 actually see        |
| `prd`          | Root production config                                         |
| `prd_prd`      | Production runtime — what containers on Hetzner actually see   |

**How containers consume secrets:**

The backend container's entrypoint is `doppler run -- node server.js`, with `DOPPLER_TOKEN`, `DOPPLER_PROJECT=aishacrm`, and `DOPPLER_CONFIG=stg_stg|prd_prd` set in the Coolify app env or `.env.local` on the host. Doppler injects the runtime secrets at process start.

**Per-tenant LLM overrides** still go through Doppler (e.g. `LLM_PROVIDER__TENANT_<UUID>=anthropic`).

**Never commit a `.env`** that contains a Doppler token, Supabase service key, or any provider API key.

---

## 9. What This Document Does Not Cover

- **Database schema, migrations, RLS policies** — see `docs/reference/DATABASE_REFERENCE.md` and `docs/developer-docs/DATABASE_GUIDE.md`.
- **Braid DSL tool authoring** — see `CLAUDE.md` (Braid section) and `braid-llm-kit/`.
- **Local dev setup, Vite/nodemon ports, lint/test commands** — see `CLAUDE.md` and `docs/developer-docs/DEVELOPER_MANUAL.md`.
- **AI Engine provider routing and capability tiers** — see `backend/lib/aiEngine/` and `CLAUDE.md`.
- **Security review, RLS rules, JWT** — see `docs/admin-guides/SECURITY_GUIDE.md`.
- **OneDev** — retired 2026-05-02. Gitea is the source of truth Git host. Any reference to `repo.aishacrm.com` or OneDev in older docs is stale.
- **GitHub Actions deploy workflows** — `docker-release.yml` is still active for prod GHCR images; tests/lint workflows stay regardless of build source. Once Phase 2 prod migration completes, the build matrix portion of `docker-release.yml` will be retired.
