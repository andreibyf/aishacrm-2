# prod/02-mcp — Coolify-native MCP/Braid on Hetzner

Phase 2 controlled-promotion migration target for the distributed MCP/Braid runtime.

This migration follows the same architectural pattern as:

- `prod/01-litellm/`
- `staging/04-braid/`

but keeps production under explicit/manual promotion instead of automatic `main`
deploy.

## Purpose

Move MCP/Braid off the legacy standalone deployment path and into a dedicated
Coolify-managed production application while preserving:

- stable Docker DNS aliases on `aishanet`
- rollback capability
- resource caps
- Doppler runtime injection
- independent service promotion

## Topology

```text
backend (docker-compose.prod.yml)
    |
    | BRAID_MCP_URL=http://braid-mcp-server:8000
    v
+-----------------------+
| prod/02-mcp           |
|-----------------------|
| braid-mcp-server      |
| braid-mcp-1           |
| braid-mcp-2           |
+-----------------------+
    |
    v
external Docker network: aishanet
```

The backend continues to use the same DNS name:

```text
http://braid-mcp-server:8000
```

No backend env-var change should be required after cutover IF the old MCP
container is retired before the Coolify deployment claims the alias.

## Provisioning

In Coolify:

- Resource type: Docker Compose
- Name: `prod-mcp`
- Server: `Prod` / Hetzner
- Branch/ref: manual promotion target only
- Compose path: `/prod/02-mcp/docker-compose.yml`
- Domains: none (internal-only service)
- Required env:
  - `DOPPLER_TOKEN`

Do NOT enable automatic deploys from every push to `main`.

## Verification

After deploy:

```bash
ssh root@178.156.140.86 '

docker ps --format "table {{.Names}}\t{{.Status}}"

printf "\n== MCP aliases on aishanet ==\n"
docker network inspect aishanet \
  --format "{{range .Containers}}{{.Name}} {{end}}" \
  | tr " " "\n" | sort | grep braid
'
```

Probe the MCP coordinator directly:

```bash
ssh root@178.156.140.86 '
docker exec prod-braid-mcp-server \
  wget -qO- http://127.0.0.1:8000/health
'
```

Probe from backend → MCP over Docker DNS:

```bash
ssh root@178.156.140.86 '
docker exec aishacrm-backend \
  wget -qO- http://braid-mcp-server:8000/health
'
```

## Cutover

Before cutover:

- confirm no deploy currently running in Coolify
- confirm legacy MCP service/container name
- confirm rollback command

If the legacy MCP runtime already claims the `braid-mcp-server` alias on
`aishanet`, stop it immediately before the first Coolify deployment.

## Rollback

Rollback strategy is intentionally simple:

1. stop the Coolify-managed MCP application
2. restart the legacy MCP deployment
3. verify backend health
4. verify backend → MCP connectivity

Example:

```bash
ssh root@178.156.140.86 '
cd /opt/aishacrm

docker compose -f docker-compose.prod.yml restart backend aisha-comms
'
```

The exact legacy MCP restart command must be recorded during the production
inventory step because the current runtime may not yet be standardized.

## Decommission criteria

Only retire the old MCP runtime after:

- backend stability verified
- no restart loops
- no Redis connectivity failures
- no provider/auth failures
- at least 48h stable runtime
- rollback path validated
