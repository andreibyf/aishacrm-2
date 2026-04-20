# ai-runtime (Braid MCP tier)

**Services:** `braid-mcp-server`, `braid-mcp-1`, `braid-mcp-2`

**Change cadence:** mid — Braid is actively developed. The tool registry and
DSL evolve independently of the core CRM release cycle, but more often than
AI infrastructure (Ollama, LiteLLM).

**Why this is separate from `ai-infra`:** Ollama and LiteLLM are stable
infrastructure that rarely change. Braid MCP ships new tools, adapters, and
runtime behaviors routinely. Coupling them to the same deployment domain would
force unnecessary infra rollouts on every Braid change.

## Topology

- `braid-mcp-server` — coordinator. Port `8000` published on loopback.
- `braid-mcp-1`, `braid-mcp-2` — worker nodes. No published ports; reachable
  only inside `aishanet`.

## Cross-domain dependencies

| Depends on              | From domain  | Variable          |
| ----------------------- | ------------ | ----------------- |
| `aishacrm-backend`      | aisha-app    | `CRM_BACKEND_URL` |
| `aishacrm-redis-memory` | data-support | `REDIS_URL`       |

## Consumers

- `aishacrm-backend` → `BRAID_MCP_URL`, `MCP_NODE_HEALTH_URL`

## Relationship to existing compose

This file is a **parallel definition** of what already exists at
`braid-mcp-node-server/docker-compose.prod.yml`. Do not remove that file. It
remains the source of truth for the current deployment pipeline until Coolify
migration cuts over. Keep the two in sync manually until the switch.

## Image

`ghcr.io/andreibyf/aishacrm-2-mcp:latest` — built by `docker-release.yml` on
version-tag push. Same image for `server` and `node` roles; behavior is
selected by the `MCP_ROLE` env var.
