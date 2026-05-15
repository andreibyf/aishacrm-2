# Prod Coolify Promotion Runbook

**Linear:** 4VD-12  
**Status:** Draft implementation runbook  
**Last updated:** 2026-05-15

This runbook is the operating contract for moving production from the legacy/manual compose path to Coolify-native production apps without turning production into an automatic `main` deploy target.

## Release posture

Production must use **controlled promotion**.

- Staging may deploy from `main` through the existing GitHub/Gitea/Coolify path.
- Production must deploy only by an explicit Coolify action or a future release-tag workflow.
- Do not enable prod deploy-on-every-main-push.
- Do not migrate multiple prod services in one cutover.
- Do not remove the current compose-managed fallback until the migrated service has a verified rollback path.

## Current repo facts to reconcile

The repo already contains a first prod Coolify artifact:

- `prod/01-litellm/docker-compose.yml`
- `prod/01-litellm/README.md`

The broader `docs/deployment/COOLIFY_MIGRATION.md` still contains older Phase 2 language that says prod migration is queued and that prod remains GHCR/SCP/SSH based. Treat that document as historical unless it agrees with this runbook and the current files under `prod/`.

## Required preflight

Before creating or deploying any additional prod Coolify app:

1. Confirm Coolify compose-loader hardening from 4VD-62 is durable.
   - The deploy path must not depend on an undocumented runtime-only patch inside the Coolify container.
   - The recovery procedure must be available before touching prod.
2. Confirm production server target.
   - Host: Hetzner production server.
   - Coolify server UUID: `o1en79sodcmr7zhq5844ynrr`.
   - SSH user: `root`.
3. Confirm source path.
   - GitHub remains human review source of truth.
   - Gitea is the mirror Coolify pulls from.
   - Coolify production apps should point at the same source mirror pattern as staging unless deliberately changed.
4. Confirm resource envelope.
   - Every prod Coolify compose must set `cgroup_parent: aishacrm.slice` where supported.
   - Every long-running service must declare memory limits/reservations.
   - Do not start builds while another prod deploy is in progress.
5. Confirm rollback.
   - Identify the old compose service/container being replaced.
   - Identify the env var, DNS alias, or route that controls traffic cutover.
   - Document the exact command/env rollback before deploying.

## Inventory checklist

Run this inventory before creating the next prod app.

```bash
ssh root@178.156.140.86 '
set -e
printf "\n== containers ==\n"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
printf "\n== aishanet members ==\n"
docker network inspect aishanet --format "{{range .Containers}}{{.Name}} {{end}}" | tr " " "\n" | sort
printf "\n== prod compose services ==\n"
cd /opt/aishacrm && docker compose -f docker-compose.prod.yml config --services
'
```

Record the output in 4VD-12 before changing prod.

## Service migration order

Use this order unless inventory proves a service is inactive:

1. `prod-litellm` — verify current state only; repo artifacts already exist.
2. `prod-mcp` / Braid MCP — first new migration candidate.
3. `prod-backend-heavy` — only after MCP health is stable.
4. `prod-app-fast` — frontend and comms fan-out; verify whether comms is bundled with frontend as in staging.
5. Scheduling/Cal.com only if current prod inventory shows it remains part of this migration.

## Per-service migration template

For each service, add or update a `prod/NN-service/docker-compose.yml` and a local README before creating the Coolify app.

Minimum compose requirements:

- Uses a Coolify-safe build context.
- Does not depend on `..` parent traversal that Coolify strips or resolves incorrectly.
- Joins the external `aishanet` network; Coolify must not recreate it.
- Uses stable service-name DNS aliases instead of depending on `container_name`.
- Defines `cgroup_parent: aishacrm.slice` where applicable.
- Defines `mem_limit` and `mem_reservation`.
- Defines healthcheck and log rotation.
- Uses `DOPPLER_CONFIG=prd_prd` only for prod.

Minimum README requirements:

- Current state diagram or current/future traffic flow.
- Coolify provisioning settings.
- Verification commands.
- Cutover steps.
- Rollback steps.
- Decommission criteria for the old compose-managed service.

## Coolify app creation contract

Create production apps with these defaults:

- Server: Hetzner / Prod.
- Branch/ref: manual or release tag promotion target; do not enable automatic deploy from every `main` push.
- Compose path: `prod/NN-service/docker-compose.yml`.
- Domain: empty for internal-only services; explicit FQDN only for public entrypoints.
- Env vars: prod-scoped Doppler token only.
- Build/deploy concurrency: one prod deployment at a time.

## Health and rollback gate

A prod service is not considered migrated until all of these are true:

- Coolify deploy succeeds.
- Container is healthy.
- Dependent service can reach it by the intended Docker DNS alias.
- Logs show no repeated restart loop, provider auth failure, route failure, or OOM kill.
- Rollback has been tested or is a single documented env/route flip with old container still running.

## First implementation target after this runbook

Audit the current `prod/01-litellm` state on Hetzner and record whether it is:

- not yet provisioned in Coolify,
- provisioned but not cut over,
- cut over and serving backend traffic, or
- retired/decommissioned.

Only after that should `prod/02-mcp` be created.
