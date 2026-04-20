# Environment variable matrix by deployment domain

This matrix maps environment variables to the **domain that owns them** and
the **services that consume them**. The goal is to make it obvious which
deployment domain a given secret or config var should be scoped to in Coolify,
so a change in one domain cannot accidentally alter behavior in another.

Conventions used below:

- **Owner** = the domain whose deployment unit a secret/config is defined in.
- **Consumed by** = services that read the variable at runtime.
- **Doppler** = secret is injected from Doppler at container start time
  (via the entrypoint's `doppler run`). Not set directly in compose.
- **Compose** = variable is resolved at `docker compose up` time, from the
  host shell or Coolify's environment panel. Usually a URL, a Doppler token
  bootstrap, or a public identifier.
- **Build** = variable is baked into the frontend bundle at image build time.

## Doppler configs by lane

| Lane    | Doppler config | Service token env var   | Compose file(s)                                                          |
| ------- | -------------- | ----------------------- | ------------------------------------------------------------------------ |
| dev     | `dev_personal` | `DOPPLER_TOKEN`         | root `docker-compose.yml`                                                |
| prod    | `prd_prd`      | `DOPPLER_TOKEN_PROD`    | `deploy/coolify/*/docker-compose.yml` and root `docker-compose.prod.yml` |
| staging | `stg_stg`      | `DOPPLER_TOKEN_STAGING` | `deploy/coolify/*/docker-compose.staging.yml`                            |

Staging tokens and staging configs are **separate from prod** by design — no
re-use, no fallback. Rotation stays blast-radius-scoped.

## aisha-app

| Variable                                      | Type    | Owner     | Consumed by              | Notes                                                                                                                 |
| --------------------------------------------- | ------- | --------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `DOPPLER_TOKEN`, `DOPPLER_TOKEN_PROD`         | Compose | aisha-app | backend, comms, frontend | Bootstrap for runtime Doppler fetch. Rotate per env.                                                                  |
| `DOPPLER_TOKEN_STAGING`                       | Compose | aisha-app | staging backend/frontend | Staging-only token. Scoped to `stg_stg`.                                                                              |
| `DOPPLER_PROJECT`                             | Compose | aisha-app | backend, comms, frontend | Typically `aishacrm`.                                                                                                 |
| `DOPPLER_CONFIG`, `DOPPLER_CONFIG_STAGING`    | Compose | aisha-app | backend, comms, frontend | `prd_prd` in prod, `stg_stg` in staging.                                                                              |
| `IMAGE_TAG`                                   | Compose | aisha-app | staging backend/frontend | Lets you smoke-test a specific build without prod impact. Default `latest`.                                           |
| `NODE_ENV`, `NODE_OPTIONS`                    | Compose | aisha-app | backend, comms           | `NODE_OPTIONS=--dns-result-order=ipv4first` in prod.                                                                  |
| `REDIS_URL`                                   | Compose | aisha-app | backend, comms           | Points at `redis://aishacrm-redis-memory:6379` (prod) / `redis://aishacrm-staging-redis-memory:6379` (staging).       |
| `REDIS_CACHE_URL`                             | Compose | aisha-app | backend, comms           | Same pattern.                                                                                                         |
| `BRAID_MCP_URL`, `MCP_NODE_HEALTH_URL`        | Compose | aisha-app | backend                  | Points at `braid-mcp-server:8000` (prod) / `braid-mcp-staging-server:8000` (staging).                                 |
| `MCP_NODE_ID`                                 | Compose | aisha-app | backend                  | Identifier for CARE/telemetry.                                                                                        |
| `LITELLM_BASE_URL`                            | Compose | aisha-app | backend                  | Internal URL to LiteLLM in the relevant lane.                                                                         |
| `LITELLM_ENABLED`, `LITELLM_MASTER_KEY`       | Doppler | aisha-app | backend                  | Injected at runtime, not in compose.                                                                                  |
| `PEP_LLM_PROVIDER`, `PEP_LLM_MODEL`           | Compose | aisha-app | backend                  | `groq` in both prod and staging.                                                                                      |
| `GROQ_API_KEY`                                | Doppler | aisha-app | backend                  | Injected at runtime.                                                                                                  |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`   | Doppler | aisha-app | backend, comms           | Injected at runtime. Staging may point at the dev Supabase project (`efzqxjpfewkrgpdootte`) via the `stg_stg` config. |
| `SYSTEM_TENANT_ID`, `DEFAULT_TENANT_ID`       | Doppler | aisha-app | backend, comms           | Injected at runtime. Consider a dedicated test tenant in staging.                                                     |
| `TELEMETRY_ENABLED`                           | Compose | aisha-app | backend                  | `false` in both prod and staging.                                                                                     |
| `AI_TRIGGERS_WORKER_ENABLED`                  | Doppler | aisha-app | backend, comms           | Prod: true (or as configured). Staging Phase A: **false**. Flip on only when exercising that path.                    |
| `PUBLIC_SCHEDULER_URL`                        | Compose | aisha-app | backend                  | `https://scheduler.aishacrm.com` / `https://staging-scheduler.aishacrm.com`.                                          |
| `CRM_BACKEND_URL`                             | Compose | aisha-app | comms                    | Internal URL to backend in the relevant lane.                                                                         |
| `COMMUNICATIONS_WORKER_POLL_INTERVAL_MS`      | Compose | aisha-app | comms                    | Defaults to 60000.                                                                                                    |
| `COMMUNICATIONS_WORKER_HEARTBEAT_PATH`        | Compose | aisha-app | comms                    | Used by healthcheck.                                                                                                  |
| `VITE_AISHACRM_BACKEND_URL`                   | Compose | aisha-app | frontend (runtime)       | `https://api.aishacrm.com` / `https://staging-api.aishacrm.com`.                                                      |
| `VITE_CALCOM_URL`                             | Compose | aisha-app | frontend (runtime)       | `https://scheduler.aishacrm.com` / `https://staging-scheduler.aishacrm.com`.                                          |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Build   | aisha-app | frontend (build)         | Baked into dist via Dockerfile.                                                                                       |
| `VITE_OPENREPLAY_*`                           | Compose | aisha-app | frontend (runtime)       | Leave empty to disable the tracker. OpenReplay itself is out of deployment scope. Always empty in staging.            |

## data-support

| Variable | Type | Owner        | Consumed by               | Notes                                                                                                 |
| -------- | ---- | ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| (none)   | —    | data-support | redis-memory, redis-cache | Both Redis instances run with hard-coded CLI flags. No secrets. Staging uses a reduced maxmemory cap. |

## scheduling

| Variable                                | Type    | Owner      | Consumed by       | Notes                                                     |
| --------------------------------------- | ------- | ---------- | ----------------- | --------------------------------------------------------- |
| `CALCOM_DB_USER` / `_STAGING`           | Compose | scheduling | calcom-db, calcom | Defaults to `calcom`.                                     |
| `CALCOM_DB_PASSWORD` / `_STAGING`       | Compose | scheduling | calcom-db, calcom | Must be set. No default.                                  |
| `CALCOM_DB_NAME` / `_STAGING`           | Compose | scheduling | calcom-db, calcom | Prod `calcom`, staging `calcom_staging`.                  |
| `CALCOM_PUBLIC_URL` / `_STAGING`        | Compose | scheduling | calcom            | Must include scheme. Never reuse the prod URL in staging. |
| `CALCOM_NEXTAUTH_SECRET` / `_STAGING`   | Compose | scheduling | calcom            | Required at compose-up. Separate values per lane.         |
| `CALCOM_ENCRYPTION_KEY` / `_STAGING`    | Compose | scheduling | calcom            | Required at compose-up. Separate values per lane.         |
| `CALCOM_ALLOWED_HOSTNAMES` / `_STAGING` | Compose | scheduling | calcom            | Must include surrounding quotes.                          |
| `CALCOM_LICENSE_KEY`                    | Compose | scheduling | calcom            | Shared between lanes.                                     |
| `CALCOM_EMAIL_FROM` / `_STAGING`        | Compose | scheduling | calcom            | Staging defaults to `noreply-staging@aishacrm.com`.       |
| `CALCOM_SMTP_*` / `_STAGING`            | Compose | scheduling | calcom            | Leave staging SMTP blank unless you're exercising mail.   |
| `CALCOM_DB_URL` (consumer)              | Doppler | aisha-app  | backend           | Backend's view of Cal.com DB. Lives in aisha-app secrets. |

## ai-runtime

| Variable                                    | Type    | Owner      | Consumed by                 | Notes                                                    |
| ------------------------------------------- | ------- | ---------- | --------------------------- | -------------------------------------------------------- |
| `DOPPLER_TOKEN_*`                           | Compose | ai-runtime | braid-mcp-\* (server, 1, 2) | Same bootstrap pattern as app.                           |
| `DOPPLER_PROJECT`                           | Compose | ai-runtime | braid-mcp-\*                | `aishacrm`.                                              |
| `DOPPLER_CONFIG` / `DOPPLER_CONFIG_STAGING` | Compose | ai-runtime | braid-mcp-\*                | `prd_prd` / `stg_stg`.                                   |
| `IMAGE_TAG`                                 | Compose | ai-runtime | braid-mcp-\* (staging)      | For pinned smoke tests.                                  |
| `CRM_BACKEND_URL`                           | Compose | ai-runtime | braid-mcp-\*                | Lane-appropriate backend hostname.                       |
| `REDIS_URL`                                 | Compose | ai-runtime | braid-mcp-\*                | Lane-appropriate Redis hostname.                         |
| `MCP_SERVER_URL`                            | Compose | ai-runtime | braid-mcp-1, -2             | Lane-appropriate server hostname.                        |
| `MCP_ROLE`                                  | Compose | ai-runtime | braid-mcp-\*                | `server` or `node`.                                      |
| `MCP_NODE_ID`                               | Compose | ai-runtime | braid-mcp-1, -2             | Prod: `"1"`/`"2"`. Staging: `"staging-1"`/`"staging-2"`. |

## ai-infra

| Variable                                    | Type    | Owner    | Consumed by       | Notes                                               |
| ------------------------------------------- | ------- | -------- | ----------------- | --------------------------------------------------- |
| `OLLAMA_NUM_CTX`                            | Compose | ai-infra | ollama            | Default 1024.                                       |
| `OLLAMA_MAX_LOADED_MODELS`                  | Compose | ai-infra | ollama            | Default 1.                                          |
| `OLLAMA_KEEP_ALIVE`                         | Compose | ai-infra | ollama            | `-1` (keep loaded indefinitely).                    |
| `OLLAMA_NUM_PARALLEL`                       | Compose | ai-infra | ollama            | Prod 2, staging 1 (lower load).                     |
| `DOPPLER_TOKEN_*`                           | Compose | ai-infra | litellm           | Bootstrap only; LiteLLM reads its config from file. |
| `DOPPLER_PROJECT`                           | Compose | ai-infra | litellm           | `aishacrm`.                                         |
| `DOPPLER_CONFIG` / `DOPPLER_CONFIG_STAGING` | Compose | ai-infra | litellm           | `prd_prd` / `stg_stg`.                              |
| `IMAGE_TAG`                                 | Compose | ai-infra | litellm (staging) | For pinned smoke tests.                             |

## support-infra

None. Hawser, the landing page, and OpenReplay are not managed from this
repo and therefore own no variables here.

## Ownership rule of thumb

If changing a variable should force a redeploy of domain X but not domain Y,
the variable belongs in X. If two domains truly need the same value, define
it in **both** domains' Coolify secret stores rather than sharing a single
scope — the short-term duplication is cheaper than the long-term blast
radius of shared state. The same rule applies across lanes: every `_STAGING`
variant is a deliberate second-copy, not a shared value.
