# Staging Cal.com — runs on VPS-2 ("Services" server)

This is the staging Cal.com (`staging-scheduler.aishacrm.com`). It is co-located
with prod calcom (`scheduler.aishacrm.com`) on **VPS-2** (`147.189.168.164`,
hostname `cyan-falcon-38494`) so that both environments mirror the same
"calcom on the Services server" topology.

## Why on VPS-2 and not on the Staging server (VPS-1)?

Calcom's `next-server` idles at ~680 MiB RSS and peaks ~1.2 GiB. Hosting it on
Staging (VPS-1) alongside the rest of the staging app stack drives the box's
load average above the 5-core slice cap, so the app stack's deploys destabilize
under modest concurrent load. VPS-2 has more headroom (8 cores, dynamic RAM)
and already runs the production calcom; co-locating staging there keeps the
deploy pattern symmetric and frees Staging for the app/api/ai-infra/braid
groups.

## Architecture

```
Staging server (VPS-1)            Services server (VPS-2)
-----------------------           -------------------------
aishacrm-backend-staging          aishacrm-calcom            (prod)
aishacrm-frontend-staging         aishacrm-calcom-db         (prod)
aishacrm-litellm-staging          aishacrm-calcom-staging    (this stack)
aishacrm-braid-mcp-staging        aishacrm-calcom-db-staging (this stack)
aishacrm-redis-{cache,memory}     aishacrm-cloudflared-vps2
                                    (bridges both networks)
        |                                   |
        |       cross-VPS                   |
        |  TCP :5433 (calcom-db)            |
        |  ─────────────────►               |
        |                                   |
        |       Staging frontend ◄──────────┼── Cloudflare DNS
        |                                   |   staging-app  → VPS-1 tunnel
        |                                   |   staging-api  → VPS-1 tunnel
        |                                   |   staging-scheduler → VPS-2 tunnel
```

Both calcoms run on VPS-2 but on separate Docker bridge networks
(`aishacrm_aishanet` for prod, `aishanet-staging-calcom` for staging). The
shared cloudflared container is connected to both networks and routes by
hostname to the correct calcom.

## Deploy (first time)

Prerequisites:

- Doppler `stg_stg` config has the calcom secrets (`CALCOM_DB_PASSWORD`,
  `CALCOM_NEXTAUTH_SECRET`, `CALCOM_ENCRYPTION_KEY`, `CALCOM_SMTP_*`,
  `CALCOM_PUBLIC_URL=https://staging-scheduler.aishacrm.com`).
- `aishacrm-cloudflared-vps2` container is running on VPS-2 (it serves the
  prod scheduler too).
- Cloudflare API token with Zero Trust write scope (in repo `.env` as
  `CLOUDFLARE_ACCESS_TOKEN`).

### **Critical: deploy under an isolated compose project namespace**

This compose declares service names `calcom` and `calcom-db` — the same as
prod's compose at `/opt/aishacrm/docker-compose.yml`. If both files are
deployed under the same compose project namespace, `docker compose up` will
**recreate prod's calcom containers** under the new staging definition,
taking prod down. The 2026-05-01 outage was caused by exactly this. To prevent it:

1. Use a **separate deploy directory** on VPS-2 (`/opt/staging-calcom/`), and
2. Pass **`--project-name staging-calcom`** explicitly on every compose command.

Steps:

```bash
# 1. Make the isolated deploy directory + push compose + env file
ssh root@147.189.168.164 'mkdir -p /opt/staging-calcom'
scp staging/services/calcom/docker-compose.yml \
    root@147.189.168.164:/opt/staging-calcom/docker-compose.yml
scp <local-env-file> root@147.189.168.164:/opt/staging-calcom/.env
ssh root@147.189.168.164 'chmod 600 /opt/staging-calcom/.env'

# 2. Bring up under explicit project namespace
ssh root@147.189.168.164 \
    'cd /opt/staging-calcom && \
     docker compose --project-name staging-calcom -f docker-compose.yml up -d'

# 3. Bridge cloudflared to the new network so staging-scheduler resolves
ssh root@147.189.168.164 \
    'docker network connect aishanet-staging-calcom aishacrm-cloudflared-vps2'

# 4. UFW: allow Staging server to reach calcom-db
ssh root@147.189.168.164 \
    'ufw allow from 147.189.173.237 to any port 5433 proto tcp \
     comment "staging-calcom-db: Staging VPS-1 only"'

# 5. Add Cloudflare tunnel public hostname (via API or dashboard)
#    Tunnel: aishacrm-vps2 (id ecff23d3-890e-4bea-b59e-aacbafae4b9c)
#    Hostname: staging-scheduler.aishacrm.com
#    Service: http://aishacrm-calcom-staging:3000

# 6. Update Cloudflare DNS CNAME staging-scheduler.aishacrm.com:
#    target: ecff23d3-890e-4bea-b59e-aacbafae4b9c.cfargotunnel.com  (proxy on)

# 7. Verify
curl -fLI https://staging-scheduler.aishacrm.com/auth/login
```

The first signup at `https://staging-scheduler.aishacrm.com/signup` creates
the staging admin account. Data persists in `staging_calcom_db_data` volume
on VPS-2 across restarts.

## Teardown

```bash
ssh root@147.189.168.164 \
    'cd /opt/aishacrm && docker compose -f docker-compose.staging-calcom.yml down -v'
ssh root@147.189.168.164 \
    'docker network disconnect aishanet-staging-calcom aishacrm-cloudflared-vps2 || true; \
     docker network rm aishanet-staging-calcom || true'
ssh root@147.189.168.164 \
    'ufw delete allow from 147.189.173.237 to any port 5433 proto tcp'
# Remove Cloudflare public hostname + DNS CNAME for staging-scheduler.aishacrm.com.
```

## Doppler `stg_stg` keys this stack consumes

| Key                      | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| `CALCOM_DB_USER`         | Postgres role (default `calcom`)         |
| `CALCOM_DB_PASSWORD`     | Postgres password — staging-only         |
| `CALCOM_DB_NAME`         | Postgres database (default `calcom`)     |
| `CALCOM_NEXTAUTH_SECRET` | NextAuth signing key — staging-only      |
| `CALCOM_ENCRYPTION_KEY`  | CALENDSO_ENCRYPTION_KEY — staging-only   |
| `CALCOM_PUBLIC_URL`      | `https://staging-scheduler.aishacrm.com` |
| `CALCOM_LICENSE_KEY`     | License (shared with prod)               |
| `CALCOM_EMAIL_FROM`      | From-address for booking emails          |
| `CALCOM_SMTP_HOST`       | SMTP host (shared with prod)             |
| `CALCOM_SMTP_PORT`       | SMTP port (default 587)                  |
| `CALCOM_SMTP_USER`       | SMTP user (shared with prod)             |
| `CALCOM_SMTP_PASSWORD`   | SMTP password (shared with prod)         |

`CALCOM_DB_URL` in `stg_stg` should be set to
`postgresql://calcom:<CALCOM_DB_PASSWORD>@147.189.168.164:5433/calcom`
(used by the Staging server's backend `getCalcomDb()` pool, not by this stack).

## Related files

- `docker-compose.vps2.yml` — prod calcom on the same server
- `cloudflared-config-vps1.yml` — Staging-side cloudflared (no longer routes scheduler after this migration)
- `backend/lib/calcomDb.js` — backend Postgres pool that hits this stack's calcom-db
- `docs/deployment/COOLIFY_MIGRATION.md` — broader migration context
