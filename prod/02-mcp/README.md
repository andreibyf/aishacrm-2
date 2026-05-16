# prod/02-mcp — Coolify-native MCP/Braid on Hetzner

Controlled-production migration of the Braid MCP cluster from the legacy
GHCR/manual-compose runtime into a Coolify-native build target.

Pattern intentionally mirrors `prod/01-litellm`.

## Provisioning

In Coolify dashboard → New Resource → Docker Compose:

- Name: `prod-mcp`
- Server: `hetzner-prod`
- Source: Gitea (`https://gitea.aishacrm.com/aishacrm/aishacrm-2.git`)
- Branch: `main`
- Compose file: `/prod/02-mcp/docker-compose.yml`
- Domains: leave empty (internal-only service)
- Env vars:
  - `DOPPLER_TOKEN` = prd_prd-scoped service token
- Auto deploy: OFF

## IMPORTANT: Alias collision rule

This stack claims the stable Docker DNS aliases:

- `braid-mcp-server`
- `braid-mcp-1`
- `braid-mcp-2`

The legacy MCP containers currently running on Hetzner already claim those
aliases on `aishanet`.

Do NOT deploy this Coolify app while the legacy containers are still running,
or Docker DNS will round-robin between old/new MCP containers.

## Pre-deploy cutover

On Hetzner:

```bash
docker stop braid-mcp-server braid-mcp-1 braid-mcp-2
```

Do not remove them yet.

## Verification

```bash
# Inventory
ssh root@<hetzner> 'docker ps --format "table {{.Names}}\t{{.Status}}"'

# MCP health
ssh root@<hetzner> 'docker exec aishacrm-backend \
  wget -qO- http://braid-mcp-server:8000/health'
```

Expected:

```json
{"status":"ok"}
```

## Rollback

```bash
# Stop Coolify MCP containers
# (names are Coolify-generated; inspect with docker ps)
docker stop $(docker ps --format '{{.Names}}' | grep -Ei 'mcp|braid')

# Restore legacy containers
docker start braid-mcp-server braid-mcp-1 braid-mcp-2
```

Then verify:

```bash
docker exec aishacrm-backend \
  wget -qO- http://braid-mcp-server:8000/health
```
