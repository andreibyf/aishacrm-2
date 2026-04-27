# Staging — Coolify Deployment (On-Demand)

> **Status: all 6 Coolify staging resources are stopped by default.**
>
> Maintaining an always-on staging environment proved low-value for this project — disciplined CI tests, Doppler-centralized secrets, and Coolify's fast tag-pin rollback already cover most of staging's purpose, and an always-on staging duplicate of every prod service contributed to the OOM incident on the App VPS in late April 2026. The Coolify resources, compose files, and `aishacrm-2-calcom-db` GHCR image remain in the repo so the staging stack can be spun up on demand for specific exercises (deploy-pipeline migration, integration changes that touch multiple services, demo-to-stakeholder runs).
>
> **To bring staging up:** Coolify UI → start the resources you need → tear back down when done.
>
> See [Wind-down rationale](#wind-down-rationale) below.

This folder defines the AiSHA CRM staging environment, deployed via **GitHub → Coolify VPS → App VPS**. It does **not** replace the existing GHCR-based production deploy in `/opt/aishacrm` — they coexist when staging is up.

## Wind-down rationale

Captured here so the next time someone considers running staging full-time, the reasoning is explicit:

- **Solo / small team** — every commit gets reviewed before push; PR-level integration risk is low.
- **CI tests already cover the code paths that matter** — pre-push runs the full backend suite (~2,500 tests) and the build.
- **Doppler centralizes secrets** so env-config drift between staging and prod is small.
- **Coolify provides fast rollback** — pin a service to a previous image tag in seconds, no separate environment needed for "is this version safe."
- **Most pipeline issues resolved during the staging buildout were one-time plumbing** (Coolify v4 bind-mount path stripping, Cal.com manifest-schema deprecation, ALLOWED_HOSTNAMES quote stripping, dockerignore filtering) — they won't recur once Coolify-build is the production deploy path.
- **Resource cost on shared VPS** — running staging duplicates of backend, frontend, redis pair, MCP cluster, plus build churn from repeated tag pushes, contributed to an OOM-class incident that took down both prod and staging containers simultaneously.

Substitutes that capture most of staging's value at a fraction of the cost:

1. **Canary deploys in prod** — pin one service to a new tag via Coolify, watch logs/health, roll forward or back.
2. **Local docker-compose dry-run** — full stack on dev machine via the root `docker-compose.yml`.
3. **Feature flags** for risky paths (already in use: `CARE_SHADOW_MODE`, `LITELLM_ENABLED`, etc.).
4. **Ephemeral staging on demand** — Coolify resources defined, started only when a deploy-pipeline change needs validation.

## Quick start (on-demand)

## Layout

```
staging/
├── 01-backend-heavy/       # backend + redis-memory + redis-cache
├── 02-app-fast/            # frontend + comms worker
├── 03-ai-infra/            # litellm + ollama
├── 04-braid/               # braid-mcp-server + 2 worker nodes
├── 05-scheduling-rare/     # cal.com + dedicated postgres  (OPT-IN, paused by default)
├── scripts/
│   ├── validate-compose.sh # local lint — run before pushing
│   └── post-deploy-check.sh# post-deploy smoke tests on App VPS
└── .env.example            # required Coolify env-var reference
```

### Group 5 (scheduling-rare) is opt-in

Cal.com is third-party infrastructure with its own release cadence, image schema quirks, env-var parsing rules, and bootstrap behavior. Maintaining a healthy staging instance has high friction (per-release manifest schema changes, ALLOWED_HOSTNAMES quote handling, postgres init-script bind-mount workarounds) and adds nothing to validating the AiSHA deploy pipeline itself — backends just talk to it via HTTP, and a missing scheduler is a valid staging state.

The Coolify resource for `staging-scheduling-rare` is therefore **paused by default**. The compose file, the custom `aishacrm-2-calcom-db` GHCR image, and the env wiring all remain in the repo so you can resume any time:

1. Coolify UI → `staging-scheduling-rare` → Start
2. Set the required Doppler secrets (CALCOM*DB_PASSWORD, CALCOM_NEXTAUTH_SECRET, CALCOM_ENCRYPTION_KEY, CALCOM_SMTP*\*) in `stg_stg`
3. First boot will run postgres `initdb` + Cal.com Prisma migrations (~60–90s) — give the calcom service `start_period` time to pass

Production keeps Cal.com behind the same `profiles: [scheduling]` opt-in pattern in `docker-compose.prod.yml`.

Each group is **one Coolify "Docker Compose" resource** pointing at its respective `docker-compose.yml`. Coolify clones this repo, substitutes env vars, and runs `docker compose up` on the App VPS.

## Container & port map

All container names are prefixed `staging-`. All inter-service traffic flows over the `staging-aishanet` external network — **no host ports** are used for cross-service calls.

| Group | Container                       | Internal port | Host port         | Public URL                               |
| ----- | ------------------------------- | ------------- | ----------------- | ---------------------------------------- |
| 1     | `staging-aishacrm-redis-memory` | 6379          | `127.0.0.1:6479`  | (loopback, debug only)                   |
| 1     | `staging-aishacrm-redis-cache`  | 6379          | `127.0.0.1:6480`  | (loopback, debug only)                   |
| 1     | `staging-aishacrm-backend`      | 3001          | (none — Traefik)  | `https://staging-api.aishacrm.com`       |
| 2     | `staging-aishacrm-frontend`     | 3000          | (none — Traefik)  | `https://staging-app.aishacrm.com`       |
| 2     | `staging-aishacrm-comms`        | n/a           | (none — worker)   | n/a                                      |
| 3     | `staging-aishacrm-litellm`      | 4000          | (none — internal) | n/a                                      |
| 3     | `staging-aishacrm-ollama`       | 11434         | (none — internal) | n/a                                      |
| 4     | `staging-braid-mcp-server`      | 8000          | (none — internal) | n/a                                      |
| 4     | `staging-braid-mcp-1`           | 8000          | (none — internal) | n/a                                      |
| 4     | `staging-braid-mcp-2`           | 8000          | (none — internal) | n/a                                      |
| 5     | `staging-aishacrm-calcom-db`    | 5432          | (none — internal) | n/a                                      |
| 5     | `staging-aishacrm-calcom`       | 3000          | (none — Traefik)  | `https://staging-scheduler.aishacrm.com` |

**No port collides with production** (4000, 4001, 6379, 6380, 8000, 3002, 4002, 11436).

## Prerequisites (one-time, on the App VPS)

```bash
# 1. Create the shared external network
docker network create staging-aishanet

# 2. Verify Coolify can reach it
docker network inspect staging-aishanet
```

## Doppler — clone prd_prd into stg_stg

Verified state of the `aishacrm` Doppler project as of bootstrap design:

- `prd_prd` exists and is the source of truth for production secrets.
- `stg` root environment exists but **no `stg_stg` branch config exists yet**.
- The `DOPPLER_TOKEN` checked into the repo's `.env` is a `dp.st.*` service token scoped read-only to `prd_prd` — it **cannot** create configs or write secrets to other configs. Workplace writes need a personal token (`dp.pt.*`).

Run the bootstrap script **once** from your workstation, after `doppler login`:

```bash
# Pre-req: brew install dopplerhq/cli/doppler && doppler login
chmod +x staging/scripts/bootstrap-stg_stg.sh
./staging/scripts/bootstrap-stg_stg.sh --rotate-calcom
```

What it does (all idempotent — re-runnable):

1. Verifies your Doppler login can read `prd_prd`.
2. Creates `stg_stg` in environment `stg` if it doesn't exist.
3. Clones every secret from `prd_prd` into `stg_stg` (excludes Doppler meta keys).
4. Overrides URL-bearing keys for staging hostnames (`PUBLIC_SCHEDULER_URL`, `ALLOWED_ORIGINS`, `VITE_AISHACRM_BACKEND_URL`, `VITE_CALCOM_URL`, `CALCOM_PUBLIC_URL`, `CALCOM_ALLOWED_HOSTNAMES`) and forces `TELEMETRY_ENABLED=false`.
5. With `--rotate-calcom`: generates fresh `CALCOM_DB_PASSWORD`, `CALCOM_NEXTAUTH_SECRET`, `CALCOM_ENCRYPTION_KEY`. **Always pass this on first bootstrap** — reusing prod Cal.com keys breaks NextAuth isolation and makes prod ciphertext readable in staging.
6. Mints a `coolify-staging-<date>` service token scoped to `stg_stg` only and prints it to stdout.

Paste the printed token into Coolify as `DOPPLER_TOKEN` on every staging resource (along with `DOPPLER_PROJECT=aishacrm` and `DOPPLER_CONFIG=stg_stg`). **Never reuse the prod token.**

## DNS

Point these records at the App VPS public IP (Coolify Traefik handles TLS via Let's Encrypt automatically once the FQDN is set in the resource):

```
staging-app.aishacrm.com        A   <APP_VPS_IP>
staging-api.aishacrm.com        A   <APP_VPS_IP>
staging-scheduler.aishacrm.com  A   <APP_VPS_IP>
```

## Coolify resource setup

For **each group**, in Coolify (on the Coolify VPS):

1. **Project → New Resource → Docker Compose**
2. **Source**: GitHub → `andreibyf/aishacrm-2` → branch `main` (or a dedicated `staging` branch — see Branch strategy below)
3. **Compose file path**: `staging/0X-<group>/docker-compose.yml`
4. **Server**: select the App VPS (already configured per the user's setup)
5. **Domains** (group 1, 2, 5 only): paste the FQDN from the table above
6. **Environment variables**: copy from `staging/.env.example`, fill in real values. **`DOPPLER_TOKEN` is required on all 5.**
7. **Deploy**

## Branch strategy

The compose files live on `main` so production CI keeps working. Coolify can deploy either:

- **`main` directly** — staging tracks `main` continuously. Every PR merge hits staging within 60s.
- **A `staging` branch** — manual cherry-pick / fast-forward when you want to gate what reaches staging. Requires creating the branch (`git checkout -b staging && git push origin staging`) and pointing all 5 Coolify resources at it.

Pick one before the first deploy. The compose files are identical either way.

## Rollout phases

The user wants the simplest possible first deploy to validate the pipeline. The plan:

### Phase 1 — Redis only (group 1, profile-gated)

In Coolify resource for **group 1**:

- Leave `COMPOSE_PROFILES` **unset**.
- Deploy.
- The `backend` service has `profiles: [app]` so it stays dormant; only `redis-memory` + `redis-cache` start.

Verify:

```bash
ssh app-vps
./staging/scripts/post-deploy-check.sh phase1
# Should report: redis-memory healthy, redis-cache healthy, both PONG
```

If both PONG: **GitHub → Coolify → App VPS pipeline is proven**. Move to phase 2.

### Phase 2 — Backend joins group 1

In Coolify resource for **group 1**:

- Set `COMPOSE_PROFILES=app`.
- Confirm Doppler stg_stg has all backend secrets.
- Redeploy.

Verify:

```bash
./staging/scripts/post-deploy-check.sh phase2
curl -sf https://staging-api.aishacrm.com/health
```

### Phase 3 — Group 4 (braid)

Backend depends on the MCP coordinator at `http://staging-braid-mcp-server:8000`. Deploy braid before frontend so AI flows resolve.

### Phase 4 — Group 3 (ai-infra)

LiteLLM and Ollama. Backend will start using them once `LITELLM_ENABLED=true` lands in Doppler stg_stg.

### Phase 5 — Group 2 (app-fast)

Frontend + comms. Once this deploys, `https://staging-app.aishacrm.com` becomes the entry point.

### Phase 6 — Group 5 (scheduling-rare)

Cal.com. Lowest priority because most CRM smoke tests don't exercise scheduling.

## Local validation (run before pushing)

```bash
# Lint all 5 compose files (uses dummy env values)
chmod +x staging/scripts/*.sh
./staging/scripts/validate-compose.sh
```

The script enforces: valid syntax, unique container names, host-port uniqueness, no collision with production ports, every service joined to `staging-aishanet`.

## Coexistence with the existing GHCR workflow

`.github/workflows/docker-release.yml` continues to build and push images on `v*` tags. Staging consumes the **same images** (`ghcr.io/andreibyf/aishacrm-2-{backend,frontend,mcp,litellm}:latest`) — no new build pipeline. Production deploy steps in that workflow remain untouched.

To pin staging at a specific build, set `BACKEND_IMAGE_TAG=v3.0.5` (or whichever) in the Coolify resource. Default is `latest`.

## Cleanup / rollback

To remove a staging group entirely:

```bash
ssh app-vps
docker compose -f /data/coolify/applications/<id>/staging/0X-<group>/docker-compose.yml down -v
# Or in Coolify UI: Resource → Settings → Delete (removes containers + volumes)
```

Rolling back a single deploy: pin `*_IMAGE_TAG` to the prior version in Coolify and redeploy.

## Out of scope

These are explicitly **not** part of the staging split per the user's brief:

- **OpenReplay** (`/opt/openreplay`) — separate deployment lifecycle.
- **Caddy** and **Hawser** — outside Coolify; ingress for production routes through them, staging routes through Coolify Traefik.
- **n8n** — production-only workflows profile.
- **Local Postgres** (migration-testing profile) — local-dev only.
