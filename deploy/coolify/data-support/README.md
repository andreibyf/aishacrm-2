# data-support (Redis tier)

**Services:** `redis-memory`, `redis-cache`

**Change cadence:** very rare. Only touched on Redis major-version bumps or
memory-sizing changes. Failures here take down consumers in `aisha-app`,
`ai-runtime`, and `ai-infra`, so this domain should be deployed first when
standing up an environment and never rolled in lockstep with app code.

## Consumers

| Consumer               | Domain     | Variable                       |
| ---------------------- | ---------- | ------------------------------ |
| `aishacrm-backend`     | aisha-app  | `REDIS_URL`, `REDIS_CACHE_URL` |
| `aishacrm-comms`       | aisha-app  | `REDIS_URL`, `REDIS_CACHE_URL` |
| `braid-mcp-server/1/2` | ai-runtime | `REDIS_URL`                    |

## Endpoints

- `redis://aishacrm-redis-memory:6379` (agent sessions, Bull queues)
- `redis://aishacrm-redis-cache:6379` (API response caching)

## Persistence

Both use named local volumes (`redis_memory_data`, `redis_cache_data`) so data
survives container restarts. `redis-cache` disables RDB (`--save ""`) by design
— it is pure ephemeral cache.

## Not in this domain

No application code, no Postgres (Supabase is managed separately; Cal.com has
its own Postgres in `scheduling`), no search or vector DB.
