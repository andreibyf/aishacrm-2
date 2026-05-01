# prod/01-litellm — Coolify-native LiteLLM on Hetzner

First service migrated under Phase 2 of the GHCR-to-Coolify plan
(see [`docs/deployment/COOLIFY_MIGRATION.md`](../../docs/deployment/COOLIFY_MIGRATION.md)).
Pattern mirrors `staging/services/calcom/`: a per-service compose with a
`build:` directive, deployed by Coolify cloning OneDev directly onto the
Hetzner host instead of pulling a pre-built image from GHCR.

## State diagram

```
                    Backend (GHCR-built, on Hetzner)
                            |
              LITELLM_BASE_URL (Doppler prd_prd)
                            |
                  +---------+---------+
                  |                   |
        BEFORE cutover           AFTER cutover
        http://litellm:4000      http://litellm-coolify:4000
                  |                   |
        aishacrm-litellm         aishacrm-litellm-coolify
        (GHCR :latest pull)      (built from OneDev clone on Hetzner)
                  |                   |
                  +-------+-----------+
                          |
                       aishanet
                  (external Docker network)
```

Both containers run side-by-side on the `aishanet` network during the soak.
Backend reaches whichever one `LITELLM_BASE_URL` points at — that's the
cutover trigger.

## Provisioning

1. Hetzner must be added as a Coolify server first (see
   `scripts/inventory-out/setup-coolify-hetzner-key.sh`).
2. In Coolify dashboard → New Resource → Docker Compose:
   - Name: `prod-litellm`
   - Server: `hetzner-prod`
   - Source: OneDev (`https://repo.aishacrm.com/aishacrm.git`)
   - Branch: `main`
   - Compose file: `/prod/01-litellm/docker-compose.yml`
   - Domains: leave empty (internal-only service, no FQDN)
   - Env vars: `DOPPLER_TOKEN` = the `prd_prd`-scoped service token
3. Deploy.

## Verification

After Coolify reports the application as Running:

```bash
# From Hetzner, both containers should be healthy and on aishanet:
ssh root@178.156.140.86 'docker network inspect aishanet \
  --format "{{range .Containers}}{{.Name}} {{end}}" | tr " " "\n" | sort'
# Expected: aishacrm-backend, aishacrm-cloudflared, aishacrm-frontend,
#           aishacrm-litellm (GHCR), aishacrm-litellm-coolify (NEW), ...

# Direct probe of the new container's health:
ssh root@178.156.140.86 'docker exec aishacrm-litellm-coolify \
  python3 -c "import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:4000/health/liveliness\").read()"'

# Cross-container probe via service-name DNS (proves backend can reach it):
ssh root@178.156.140.86 'docker exec aishacrm-backend wget -qO- \
  http://aishacrm-litellm-coolify:4000/health/liveliness'
```

## Cutover (after ≥48h soak)

The Coolify-built container is reachable at the network alias
`http://litellm-coolify:4000` (Coolify v4 ignores `container_name`, so the
auto-generated name like `litellm-coolify-<app-uuid>-<suffix>` is what
appears in `docker ps`, but the alias on the `aishanet` network is stable).

```bash
# 1. Flip LITELLM_BASE_URL on backend
doppler secrets set LITELLM_BASE_URL=http://litellm-coolify:4000 \
  --project aishacrm --config prd_prd

# 2. Restart prod backend (Doppler is read at startup)
ssh root@178.156.140.86 'cd /opt/aishacrm && \
  docker compose -f docker-compose.yml restart backend aisha-comms'

# 3. Watch backend logs for any provider errors
ssh root@178.156.140.86 'docker logs -f aishacrm-backend' | grep -iE 'litellm|provider'
```

To roll back: revert `LITELLM_BASE_URL` to `http://litellm:4000` and restart
backend. The GHCR-built `litellm` container is still running; the rollback
is just an env var flip.

## Decommission (after ≥48h post-cutover stability)

1. Remove the `litellm:` service block from `docker-compose.prod.yml`.
2. Remove the `LITELLM_BASE_URL=http://litellm:4000` *default* in `docker-compose.prod.yml` backend env (replace with `http://aishacrm-litellm-coolify:4000`).
3. Bring the GHCR-deployed litellm container down: `docker compose -f docker-compose.yml up -d --remove-orphans` from `/opt/aishacrm/`.
4. (Optional) Delete the `ghcr.io/andreibyf/aishacrm-2-litellm` package on GitHub to free GHCR storage.
5. Update CHANGELOG.

## Related files

- `litellm/Dockerfile` — image build context (config baked in)
- `litellm/litellm_config.yaml` — provider routing config
- `docker-compose.prod.yml` — the GHCR-based prod stack (source of the litellm being replaced)
- `docs/deployment/COOLIFY_MIGRATION.md` — full Phase 2 plan
