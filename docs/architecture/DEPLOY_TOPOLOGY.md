# Deploy Topology

> Where does each piece of the stack actually run, and which name do I type where? This doc exists because the same component has up to **four** identifiers (server name, server role, Coolify app slug, public FQDN) and confusing two of them has cost real time.

## Why this doc exists

- 2026-05-14 — Coolify marked VPS-1 unreachable (`unreachable_count: 13`) because its server entry had `user: root` but VPS-1 only authorizes `andreibyf`. Fixed by PATCHing the Coolify server record. The Coolify key was already correctly in `andreibyf`'s `authorized_keys` — it was just being presented to the wrong user. **SSH user is now documented in the table above.**
- 2026-05-12 — 30 minutes lost to "is the staging tunnel down?" because `staging-backend.aishacrm.com` doesn't resolve — it's a Coolify app name, not a hostname. The public FQDN is `staging-api.aishacrm.com`.
- 2026-05-10 — A double Coolify deploy on `staging-app-fast` tipped VPS-1 past Zap's 5.5-core cap and locked the host. Manual reboot via Zap's panel was the only recovery.
- Multiple sessions where "deploy to VPS-2" got misread as "deploy app services" — VPS-2 hosts the **control plane** (Coolify itself), never application services.

Each section below states the contract. If you're touching a deploy script, CI workflow, or Coolify mutation, this is the reference.

---

## The five hosts

| Name                | Role         | Provider                | IP                                                 | SSH user    | What runs there                                                                               |
| ------------------- | ------------ | ----------------------- | -------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| **VPS-1**           | Staging      | Zap-Hosting (lifetime)  | `147.189.173.237`                                  | `andreibyf` | Staging app services (frontend, backend, braid-mcp, litellm), coolify-proxy, coolify-sentinel |
| **VPS-2**           | Services     | Zap-Hosting (lifetime)  | `147.189.168.164`                                  | `root`      | Coolify app (control plane), Cal.com, Uptime Kuma, Gitea, OneDev                              |
| **Hetzner**         | Production   | Hetzner Cloud (monthly) | `178.156.140.86`                                   | `root`      | All prod app services                                                                         |
| **Localhost**       | Development  | Dre's laptop            | (varies)                                           | n/a         | Local dev via Docker Compose ports 4000/4001                                                  |
| **AI Cloud Server** | AI Inference | Home (HP Omen 35L)      | LAN: `192.168.7.200` / Tailscale: `100.81.132.118` | `aisha`     | vLLM inference server (Qwen2.5-14B), accessible via Tailscale from all envs                   |

**Rules:**

- "VPS-1" = staging. "VPS-2" = services. They are **not** interchangeable, and there is no IP convention to disambiguate them — only the name.
- App services (backend, frontend, comms, braid-mcp, litellm) deploy to **VPS-1 or Hetzner**, never VPS-2.
- Infra/tooling (Coolify, Cal.com, Uptime Kuma, Gitea) deploys to **VPS-2**, never VPS-1 or Hetzner.
- Coolify on VPS-2 has a server entry pointing at itself (`host.docker.internal`); that's why the Coolify server UUID for VPS-2 is labeled "localhost" inside Coolify. Don't confuse that with Dre's actual laptop.
- AI Cloud Server is the local inference node. It is NOT managed by Coolify. Access via Tailscale (VPS-1, Hetzner) or direct LAN (localhost dev). Hostname: `ai-cloud-server`.

### Coolify server UUIDs (for API calls)

| User-name | Coolify server name | UUID                       |
| --------- | ------------------- | -------------------------- |
| VPS-1     | Staging             | `f7uzrwlbqjtx6qamppma5xsz` |
| VPS-2     | localhost           | `wrkskvdu8tsnp8si53fm135k` |
| Hetzner   | Prod                | `o1en79sodcmr7zhq5844ynrr` |

---

## Source-of-truth Git topology

```
GitHub: andreibyf/aishacrm-2     ← humans review + merge PRs here
   │
   │ mirror-to-gitea.yml (GitHub Actions)
   ▼
Gitea: gitea.aishacrm.com/aishacrm/aishacrm-2     ← Coolify pulls from this
   │
   │ webhook on push to main
   ▼
Coolify (on VPS-2)
   │
   ├─ webhook: deploy "staging-app-fast" → VPS-1
   ├─ webhook: deploy "staging-backend-heavy" → VPS-1
   ├─ webhook: deploy "staging-braid" → VPS-1
   └─ webhook: deploy "staging-litellm" → VPS-1
```

**Important:**

- The GitHub URL is `github.com/andreibyf/aishacrm-2` (Dre's personal account), **not** `4vdataconsulting/aishacrm`. Push scripts and Linear comments often get this wrong.
- **Push to `github` only.** The `mirror-to-gitea` GitHub Action keeps Gitea in sync automatically. Never push to `origin` directly — that bypasses GitHub's secret scanning and breaks the source-of-truth invariant.
- Production on Hetzner uses GHCR images directly — see [Production deploy path](#production-deploy-path) below.

---

## Public FQDNs ↔ Coolify app names

This is the table that comes up most often. The Coolify app names look like they could be hostnames; they're not.

| Public FQDN                      | Coolify app             | Coolify UUID               | What it is                   |
| -------------------------------- | ----------------------- | -------------------------- | ---------------------------- |
| `staging-app.aishacrm.com`       | `staging-app-fast`      | `di7ko49ikfd2mz8yh0q7id8q` | Frontend (Vite/React)        |
| `staging-api.aishacrm.com`       | `staging-backend-heavy` | `d24ro1fqm0zyl7pd72g6snd2` | Backend (Node/Express)       |
| `staging-braid.aishacrm.com`\*   | `staging-braid`         | `tw8zmua5jyzwnhh1oxw15kkm` | Distributed Braid MCP server |
| `staging-litellm.aishacrm.com`\* | `staging-litellm`       | `zsy5fsbw9hccxvoznkbpy1il` | LiteLLM router               |

**Production FQDNs (Hetzner, tunnel `aishacrm-prod-hetzner`, id `a5dcbb7d-672c-447f-b2a5-9aea581b13cb`):**

| Public FQDN          | Container                | What it is                   |
| -------------------- | ------------------------ | ---------------------------- |
| `app.aishacrm.com`   | `aishacrm-frontend:3000` | Frontend (Vite/React)        |
| `api.aishacrm.com`   | `aishacrm-backend:3001`  | Backend (Node/Express)       |
| `braid.aishacrm.com` | `braid-mcp-server:8000`  | Distributed Braid MCP server |

Health endpoint: `https://braid.aishacrm.com/health` — use this in Uptime Kuma (not `localhost:8000`, which is Uptime Kuma's own UI on VPS-2).

\*Internal-only or not always exposed; check Cloudflare DNS if uncertain.

**There is no `staging-backend.aishacrm.com` hostname.** If you `nslookup` it, Cloudflare returns no addresses — looks like a tunnel-detached error but is really just "this hostname doesn't exist." When verifying a staging deploy, hit `staging-api.aishacrm.com`.

**Cross-app dependency:** `staging-app-fast` contains BOTH the `frontend` AND `aisha-comms` services (the latter uses the backend image with a different `command:`). When the backend image is rebuilt, BOTH `staging-backend-heavy` AND `staging-app-fast` must redeploy. The CI deploy step in `.github/workflows/deploy-staging.yml` handles the fan-out and de-dup.

---

## VPS-2 traffic topology (Cloudflare tunnel → Traefik → service)

Public hostnames routed through VPS-2 (anything on `*.aishacrm.com` that resolves to Cloudflare and lands on VPS-2):

```
Client
  ↓ HTTPS
Cloudflare edge
  ↓ Argo Tunnel
aishacrm-vps2  (cloudflared container, TUNNEL_TOKEN env, NO local config.yml)
  ↓ HTTPS to internal hostname
coolify-proxy  (Traefik v3.6, on "coolify" docker bridge network)
  ↓ HTTP to container
<service container>  (must share "coolify" network with Traefik)
```

**Cloudflared ingress is managed in the Cloudflare Zero Trust dashboard.** There is **no** `/etc/cloudflared/config.yml` on disk for VPS-2. To mutate ingress rules, use the Cloudflare API. Tunnel id for `aishacrm-vps2` is `ecff23d3-890e-4bea-b59e-aacbafae4b9c`. Working API call pattern in `scripts/patch-cloudflared-docuseal-sni.ps1`.

VPS-1 uses a host-systemd `cloudflared` (`aishacrm-tunnel`) with a local config; the dashboard-managed ingress is VPS-2 only.

### HTTPS-to-Traefik gotcha

If a cloudflared ingress rule uses `https://coolify-proxy:443` as origin without `originRequest.originServerName: <public-hostname>`, Traefik falls back to its self-signed `*.traefik.default` cert and cloudflared rejects with:

```
x509: certificate is valid for ..., not coolify-proxy
```

**Always set `originServerName`** to the public hostname for any HTTPS-to-Traefik ingress rule on this tunnel. Symptom is a 502 from Cloudflare on a service that responds fine to `curl --resolve` from inside the proxy network.

---

## VPS-1 build cap

VPS-1 is a Zap-Hosting VM with a **5.5-core sustained CPU cap from the hypervisor**. The slice file documents this. The 5-hour reboot cycle that used to plague the host correlated with deploy frequency, not a periodic system event.

### Lockup mechanism (CPU-driven, not memory)

1. Push to main. Coolify webhook fires.
2. Coolify spawns build container(s) for the matching app(s).
3. `npm install` + `vite build` (frontend) and/or backend build wants 8+ cores momentarily.
4. Zap's hypervisor enforces the 5.5-core cap → CPU steal climbs.
5. While the VM is throttled, existing in-slice services miss healthcheck timeouts.
6. Sentinel reacts by restarting things → more CPU demand → more steal → cascade.
7. A process hits D-state (uninterruptible sleep waiting for hypervisor schedule) → kernel softlockup → host wedge.

Recovery is manual reboot via Zap's panel — only Dre can do that.

### What's been done

- **Daemon-level cgroup-parent on VPS-1** (`/etc/docker/daemon.json` `"cgroup-parent": "coolify.slice"`) — scoops up Coolify-spawned build containers into a slice capped at `CPUQuota=150%`, `MemoryMax=2G`. Future builds inherit the cap automatically.
- **Watch paths trimmed** on `staging-backend-heavy` so frontend-only changes don't trigger backend rebuilds (verified 2026-05-05).
- **Auto-deploy disabled** on all 4 staging Coolify apps (`application_settings.is_auto_deploy_enabled = false`) — only the CI deploy workflow fires the webhook, eliminating Coolify's parallel git-push listener.

### What's still risky

Two simultaneous Vite builds for `staging-app-fast` still tip the cap. Coolify's "Stop" button takes 30-60s to propagate, so:

- **Before triggering `POST /api/v1/deploy?uuid=...`**, query `application_deployment_queues` (joined via `applications.uuid`) and confirm any prior `in_progress` deployment for the same app is `cancelled` or `failed`.
- "User clicked Stop in UI" ≠ "deployment is cancelled." Wait at least 60s and re-query before proceeding.
- Backend-only commits are safe to redeploy aggressively (no Vite build, sub-minute). The cap-tripping risk is specifically the frontend.

See [`../../docs/contributing/PARALLEL_AGENTS.md`](../contributing/PARALLEL_AGENTS.md) rule #7.

### Long-term

The ideal posture is **pre-built images in CI, deploy = pull** — eliminates build CPU on VPS-1 entirely. Production on Hetzner is already in that posture (`docker-compose.prod.yml` references `ghcr.io/andreibyf/aishacrm-2-{backend,frontend}:latest`). Migrating staging to the same pattern is on the roadmap.

---

## Coolify v4 mutation quirks

Coolify v4 (deploy.aishacrm.com, version 4.0.0-beta.239) has a fragile mutation surface. Cheat sheet:

### Public REST mutation endpoints HANG ~60s but writes land

- `POST /api/v1/applications/dockercompose` — creates the row server-side, response times out
- `PATCH /api/v1/services/<uuid>/envs` — same
- `POST /api/v1/services/<uuid>/restart` — same

GET endpoints work fine. The 60s hang is consistent — looks like a queued-job race that times out at the proxy layer. **Pattern:** writes land server-side anyway. Fire-and-forget is acceptable (8s timeout, ignore the response). The actual deploy trigger `POST /api/v1/deploy?uuid=<app-uuid>&force=false` works normally.

### Env values are encrypted in DB

`environment_variables.value` is stored as Laravel `Crypt::encryptString` output. Direct `UPDATE environment_variables SET value = '...'` writes plain text, Coolify will then `Crypt::decryptString` on read and crash. **Use Eloquent**:

```bash
docker exec coolify php artisan tinker --execute='
$row = App\Models\EnvironmentVariable::where([
  ["resourceable_type", "App\Models\Service"],
  ["resourceable_id", 20],
  ["key", "HOST"],
])->first();
$row->value = "https://docuseal.aishacrm.com";
$row->save();
'
```

### `service_applications.fqdn` is plain text — direct UPDATE works

```sql
UPDATE service_applications SET fqdn = 'https://...', updated_at = NOW() WHERE uuid = '...';
```

### Post-deploy hooks run **only** from the Coolify UI flow

Things that broke when cutovers were driven via plink + DB or via tinker `dispatch_sync`:

- **Coolify network attachment** (`App\Jobs\ConnectProxyToNetworksJob`) — runs reliably only on UI deploy path. Manually invoking via tinker is unreliable. Recreating containers via `docker compose down/up` strips the proxy network.
- **Traefik route discovery refresh** — UI flow sends a signal/restart to `coolify-proxy`; direct compose recreate doesn't.
- **Let's Encrypt cert provisioning** — depends on (a) container being on `coolify` network and (b) Traefik discovering the route from the labels. If either is missing, no cert request fires.

**Rule:** drive any cutover-class change (FQDN swap, HOST swap that involves cert provision, new app creation) through the **Coolify UI**. UI clicks invoke Livewire actions that do all the post-deploy steps in the right order. The API is fine for low-stakes env edits, deploy-trigger webhooks, and reads.

### Service redeploys regress two things

When you click "Redeploy" on a Coolify **Service** (not Application), the compose at `/data/coolify/services/<id>/docker-compose.yml` is regenerated from the upstream service template. That wipes:

1. Any patched-image swap (e.g. custom image with a CSRF skip).
2. The `coolify` proxy-network attachment when `--no-deps --force-recreate` runs.

Symptom of #2 is a 502 from Traefik. Re-attach with `docker network connect coolify <container>` and codify in a recovery script.

The long-term fix is migrating Coolify Services → "App from Docker Image" so neither regression recurs.

### Daily image cleanup deletes unused local-only images

`server_settings.docker_cleanup_frequency: 0 0 * * *` + `docker_cleanup_threshold: 80` will `docker image prune` images not referenced by any running container. **Never depend on a local-only image for rollback** — push to GHCR so the cleanup can't remove your fallback.

---

## Production deploy path

Production on Hetzner uses pre-built GHCR images:

```
push to v* tag
   ↓
docker-release.yml workflow
   ↓ build + push
ghcr.io/andreibyf/aishacrm-2-{backend,frontend}:latest
   ↓ pull
Hetzner (docker-compose.prod.yml uses `image:` not `build:`)
```

**No build CPU runs on the prod VPS.** Don't propose "prod GHCR migration" as work — it's already in that posture.

The pull-and-recreate is currently manual (SSH to Hetzner, `docker compose pull && up -d`). That's the friction tracked by 4VD-12 (migrate prod to Coolify-native auto-deploy).

`prod-litellm` is already Coolify-native and auto-deploys on main push; the rest of the stack catches up under 4VD-12.

---

## Env var naming gotcha

`.env`'s `VPS_1_PROD` is **misnamed** — it holds the staging IP. New scripts should:

1. Read `VPS_1_STAGING` first.
2. Fall back to `VPS_1_PROD` for back-compat during the .env transition.
3. Never read ONLY `VPS_1_PROD`.

Hetzner prod IP lives in a different variable entirely; check `.env` when prod work resumes. `VPS_2_SERVICES` and `VPS_2_PWD` are correctly named.

Canonical fallback pattern lives in `scripts/inventory-vps.ps1`.

---

## SSH access

From Dre's Windows dev box, Windows OpenSSH `ssh.exe` fails silently (exit 255, empty output) when spawned by Desktop Commander or similar agents. Use **paramiko in Python**, or `plink` invoked via PowerShell scripts.

- **VPS-1** (`147.189.173.237`): user `andreibyf` + `~/.ssh/id_ed25519`. NOPASSWD sudo. No root login.
- **VPS-2** (`147.189.168.164`): user `root` + `~/.ssh/ggitty.pri`. Aggressive sshd rate-limiting if you brute-force probe — pool one connection.
- **Hetzner** (`178.156.140.86`): user `root` + `~/.ssh/coolify_to_hetzner`.

The Cowork sandbox blocks TCP/22 to VPS IPs and most hostnames; agent VPS access goes through `scripts/*.ps1` + plink from Dre's Windows box. Write a script, don't paste a shell block.

---

## Useful Coolify DB queries

Coolify Postgres on VPS-2: container `coolify-db`, db `coolify`, user `coolify`.

```bash
# List the staging applications and their settings
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT a.uuid, a.name, ass.is_auto_deploy_enabled
FROM applications a
JOIN application_settings ass ON ass.application_id = a.id
WHERE a.name LIKE 'staging-%';"

# Recent deploys for a given app
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, status, created_at, finished_at
FROM application_deployment_queues
WHERE application_id = (SELECT uuid FROM applications WHERE name = 'staging-app-fast')
ORDER BY created_at DESC LIMIT 10;"

# Schema inspection
docker exec coolify-db psql -U coolify -d coolify -c "\dt"
docker exec coolify-db psql -U coolify -d coolify -c "\d applications"
docker exec coolify-db psql -U coolify -d coolify -c "\d application_settings"
```

**Schema split to remember:** in Coolify v4, `auto_deploy_enabled` lives in `application_settings.is_auto_deploy_enabled` (joined via `application_id` to `applications.id`), NOT on `applications` directly.

---

## Related

- [`IDENTITY_MODEL.md`](./IDENTITY_MODEL.md) — same docs-the-implicit-contract approach for users/employees
- [`../contributing/PARALLEL_AGENTS.md`](../contributing/PARALLEL_AGENTS.md) — agent coordination, references the VPS-1 cap rule
- [`../developer-docs/COPILOT_PLAYBOOK.md`](../developer-docs/COPILOT_PLAYBOOK.md) — operational procedures (migrations, tests)
- 4VD-12 — Migrate prod backend/frontend/comms/mcp to Coolify auto-deploy on Hetzner
- 4VD-27 — DocuSeal Coolify Service → App from Docker Image (done; same pattern applies to future services)
- 4VD-37 — Coolify v4.3.5 auto-upgrade root cause for `is_auto_deploy_enabled` drift (done)
- 4VD-55 — parent doc-rollout ticket
