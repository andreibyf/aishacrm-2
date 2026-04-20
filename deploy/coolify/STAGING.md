# Staging deployment on the same VPS

This is the **parallel staging lane** strategy for validating the Coolify
split without touching production. It follows the principle: same VPS, new
names, new ports, new network, new Doppler config, **no shared write paths**
with production.

## Prerequisites (one-time)

1. **Create a Doppler config for staging.**
   Recommended: a new environment `stg` with a config `stg_stg`. Copy
   `prd_prd` as the starting template, then override:
   - All URLs to point at `staging-*.aishacrm.com`
   - `ALLOWED_ORIGINS` to include only staging origins
   - Any keys that would trigger real outbound actions (Twilio, SendGrid,
     Cal.com SMTP) — switch to test keys or leave blank
   - Tenant scoping — point at a test tenant if you have one

2. **Create the staging Docker network on the VPS:**

   ```
   docker network create aishanet-staging
   ```

3. **Reserve staging ports.** Every staging service uses a +100 offset from
   its prod counterpart. See port table below.

4. **Add DNS.** Point `staging-app`, `staging-api`, `staging-scheduler` (and
   others as needed) at the VPS. If Cloudflare sits in front, add them there.
   **Do not** reassign existing prod records.

## Staging port map

| Service          | Prod host port | Staging host port |
| ---------------- | -------------- | ----------------- |
| frontend         | 4000           | **4100**          |
| backend          | 4001           | **4101**          |
| redis-memory     | 6379           | **6479**          |
| redis-cache      | 6380           | **6480**          |
| calcom           | 3002           | **3102**          |
| braid-mcp-server | 8000           | **8100**          |
| ollama           | 11434          | **11534**         |
| litellm          | 4002           | **4102**          |

All staging ports bind to `127.0.0.1` (same as prod) — the edge/reverse-proxy
decides what's publicly reachable.

## Staging container names

Production uses `aishacrm-*` and `braid-mcp-*`. Staging uses:

- `aishacrm-staging-frontend`
- `aishacrm-staging-backend`
- `aishacrm-staging-comms` (Phase B)
- `aishacrm-staging-redis-memory`
- `aishacrm-staging-redis-cache`
- `aishacrm-staging-calcom`
- `aishacrm-staging-calcom-db`
- `aishacrm-staging-ollama`
- `aishacrm-staging-litellm`
- `braid-mcp-staging-server`
- `braid-mcp-staging-1`
- `braid-mcp-staging-2`

This guarantees no collision with the running prod containers.

## Staging subdomains

- `staging-app.aishacrm.com` → staging frontend (host port 4100)
- `staging-api.aishacrm.com` → staging backend (host port 4101)
- `staging-scheduler.aishacrm.com` → staging Cal.com (host port 3102)

## Phased rollout

### Phase A — smoke lane (deploy this first)

**Deploy:**

1. `data-support/docker-compose.staging.yml` → ephemeral staging Redis
2. `aisha-app/docker-compose.staging.yml` → frontend + backend only (comms
   is commented out in the file)

**Do NOT deploy yet:** comms, Cal.com, Ollama, LiteLLM, Braid MCP. Leave them
pointed at production (staging backend will have those URLs blank / disabled
via the `stg_stg` Doppler config).

**Validate** (in order):

1. Containers start cleanly
2. Health checks pass on both services
3. `staging-app.aishacrm.com` loads and the bundle reports staging URLs
4. Login works (against Supabase — staging uses the same Supabase by design
   because Supabase is externally managed; the staging URLs ensure no browser
   origin leak)
5. `staging-api.aishacrm.com/health` returns 200
6. Backend can reach `aishacrm-staging-redis-memory` and `…-redis-cache`
7. No prod URLs leak into the staging frontend bundle
   (`grep -r "api.aishacrm.com" dist/` should find nothing)
8. Staging logs are clean under normal usage

### Phase B — add comms

Uncomment the `aisha-comms` block in `aisha-app/docker-compose.staging.yml`
and redeploy that domain.

**Critical:** the staging comms worker must **not** process live production
queues. Either:

- Point staging at a dedicated test queue (separate Redis key namespace,
  different tenant scoping), or
- Set `AI_TRIGGERS_WORKER_ENABLED=false` in the `stg_stg` Doppler config
  until you're ready to exercise it

### Phase C — isolated lower-change stacks

Deploy these only when you're explicitly testing that stack, one at a time:

1. `scheduling/docker-compose.staging.yml` — staging Cal.com
2. `ai-runtime/docker-compose.staging.yml` — staging Braid MCP cluster
3. `ai-infra/docker-compose.staging.yml` — staging Ollama + LiteLLM

Each gets its own staging volume. None share state with production.

## Doppler wiring

Every staging compose file sets `DOPPLER_CONFIG=stg_stg`. The
`DOPPLER_TOKEN_STAGING` service token (you create this in Doppler) is what
Coolify injects at compose-up time. Entrypoints do `doppler run`, so the
staging secrets land in staging containers only.

**Do not reuse the prod service token for staging.** Separate tokens make
rotation safe and audit trails clean.

## Guardrails that stay on for staging

- `TELEMETRY_ENABLED=false` — same as prod, no point adding noise
- `AI_TRIGGERS_WORKER_ENABLED=false` during Phase A
- Cal.com `ALLOWED_HOSTNAMES="staging-scheduler.aishacrm.com"` — Cal.com
  refuses to serve unknown hostnames
- All stateful services use `*_staging` volumes — no way to corrupt prod
  volumes by accident
- No Docker socket mount on staging backend (prod does mount it for the
  Ollama-restart UI; staging doesn't need that and it's a privilege escalator)

## What to never do

- Reuse a prod container name in staging
- Reuse a prod host port in staging
- Point staging frontend at `api.aishacrm.com`
- Let staging comms drain prod queues
- Let staging Cal.com use `CALCOM_PUBLIC_URL=https://scheduler.aishacrm.com`
- Switch Cloudflare routing for `app.aishacrm.com` during initial testing

## When staging is "done"

Staging is done when you've run a full release-tag build through Phase A + B
end-to-end, observed clean logs over a real workday, and confirmed no prod
URL or resource leaked into the staging bundle. Only then does cutover
become a conversation — and even then, cutover is a **separate** PR.
