# aisha-app (fast-change app path)

**Services:** `frontend`, `backend`, `aisha-comms`

**Change cadence:** every release tag. This is the domain that receives all
day-to-day feature work. Failures here should not take down data, scheduling,
AI, or observability stacks.

## Cross-domain dependencies at runtime

| Depends on                                      | From domain  | How                                       |
| ----------------------------------------------- | ------------ | ----------------------------------------- |
| `aishacrm-redis-memory`, `aishacrm-redis-cache` | data-support | `REDIS_URL`, `REDIS_CACHE_URL`            |
| `braid-mcp-server`                              | ai-runtime   | `BRAID_MCP_URL`, `MCP_NODE_HEALTH_URL`    |
| `litellm`                                       | ai-infra     | `LITELLM_BASE_URL`                        |
| `calcom` (browser URL only)                     | scheduling   | `VITE_CALCOM_URL`, `PUBLIC_SCHEDULER_URL` |

All cross-domain resolution is by **container name on the `aishanet` external
Docker network**. Every domain that this one depends on must attach to the same
external network.

## Secrets

- All runtime secrets are injected by Doppler (`prd_prd` config) via the
  backend/frontend entrypoint scripts. This file intentionally does **not**
  enumerate secrets.
- `.env.example` in this folder lists only the compose-substitution variables
  (things like `DOPPLER_TOKEN`, `VITE_AISHACRM_BACKEND_URL`) that are resolved
  at `docker compose up` time, not runtime.

## Not in this domain

- No Redis (→ `data-support`)
- No Cal.com (→ `scheduling`)
- No Ollama / LiteLLM / Braid MCP (→ `ai-infra` / `ai-runtime`)
- No OpenReplay (→ `observability`)
- No landing page, Hawser, Caddy (→ `support-infra` notes)

## Relationship to current deployment

Today, production is served by `docker-compose.prod.yml` at the repo root. That
file is still authoritative. This file is a **prepared split** for the Coolify
migration and is not wired into CI yet. See
`docs/deployment/coolify-migration.md`.
