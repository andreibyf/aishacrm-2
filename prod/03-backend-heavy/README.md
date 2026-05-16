# prod/03-backend-heavy — Coolify-native backend on Hetzner

Phase 2 controlled-promotion migration target for the production backend API.

This migration follows the same operational pattern as:

- `prod/01-litellm/`
- `prod/02-mcp/`
- `staging/01-backend-heavy/`

while preserving rollback capability and avoiding automatic production deploys
from every push to `main`.

## Purpose

Move the production backend API from the legacy GHCR/compose deployment path to
an independently deployable Coolify-managed production application.

The migration intentionally leaves these services outside this compose:

- `redis-memory`
- `redis-cache`
- frontend
- communications worker
- Cal.com

Those remain on the legacy compose path until individually migrated.

## Topology

```text
Cloudflare / ingress
        |
        v
+-------------------------+
| prod/03-backend-heavy   |
|-------------------------|
| backend                 |
+-------------------------+
        |
        +--> redis-memory
        +--> redis-cache
        +--> braid-mcp-server
        +--> litellm
```

All dependency services are reached through the shared external `aishanet`
Docker network.

## Provisioning

In Coolify:

- Resource type: Docker Compose
- Name: `prod-backend-heavy`
- Server: `Prod` / Hetzner
- Branch/ref: manual promotion target only
- Compose path: `/prod/03-backend-heavy/docker-compose.yml`
- Domains:
  - `https://api.aishacrm.com`
- Required env:
  - `DOPPLER_TOKEN`

Do NOT enable automatic deploys from every push to `main`.

## Verification

After deploy:

```bash
ssh root@178.156.140.86 '
docker ps --format "table {{.Names}}\t{{.Status}}" | grep backend
'
```

Backend health:

```bash
ssh root@178.156.140.86 '
docker exec prod-aishacrm-backend \
  wget -qO- http://127.0.0.1:3001/health
'
```

Backend → MCP:

```bash
ssh root@178.156.140.86 '
docker exec prod-aishacrm-backend \
  wget -qO- http://braid-mcp-server:8000/health
'
```

Backend → LiteLLM:

```bash
ssh root@178.156.140.86 '
docker exec prod-aishacrm-backend \
  wget -qO- http://litellm:4000/health/liveliness
'
```

## Cutover

Before cutover:

- verify no other Coolify deploy is running
- identify the current legacy backend container and ingress route
- verify rollback command
- confirm MCP and LiteLLM are healthy

The legacy backend currently claims the production backend aliases and ingress.
Do not leave both old and new backends serving the same route accidentally.

Expected cutover sequence:

1. stop legacy backend container
2. deploy/restart `prod-backend-heavy`
3. validate `/health`
4. validate frontend → backend traffic
5. validate webhook/event processing
6. validate AI-trigger flows

## Rollback

Rollback strategy:

1. stop Coolify-managed backend
2. restart legacy compose-managed backend
3. validate `/health`
4. validate frontend login/API traffic

Example:

```bash
ssh root@178.156.140.86 '
cd /opt/aishacrm

docker compose -f docker-compose.prod.yml up -d backend
'
```

## Decommission criteria

Only retire the old backend deployment after:

- stable production runtime for at least 48h
- no OOM/restart loop
- no Redis connectivity failures
- no MCP connectivity failures
- no LiteLLM/provider failures
- no webhook processing regression
- rollback path validated
