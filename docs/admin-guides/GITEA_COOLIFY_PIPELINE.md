# Gitea + Coolify CI/CD Pipeline

**Updated:** 2026-05-02
**Audience:** Admins and senior engineers operating the AiSHA CRM deploy pipeline.
**Scope:** End-to-end push-to-deploy mechanics: laptop -> Gitea -> Coolify -> VPS containers, plus the GitHub mirror loop and the `@claude` PR review path.
**Quick reference:** `docs/admin-guides/DEPLOYMENT_PIPELINE_FLOW_QUICK_REFERENCE.md`

---

## 1. TL;DR — Pipeline at a glance

```
local laptop  ──git push──▶  Gitea (origin)             ──webhook──▶  Coolify
                          │                                            │
                          ├─git push──▶ GitHub (mirror)               ▼
                          │                                       per-app
                          │                                    docker build
                          │                                            │
                          │                                            ▼
                          │                                      run on VPS
                          │                                            │
                          │                                            ▼
                          │                                  Discord notification
                          │
                          └──.github/workflows/mirror-to-gitea.yml── (when PR merges on GitHub side)
                              fires when GitHub-side push happens
                              force-pushes to Gitea
                              re-triggers the Gitea→Coolify chain
```

**Three-bullet flow summary:**

- **Gitea is canonical.** Every Coolify Application has Gitea configured as its `git_repository`. Coolify only watches Gitea push webhooks; nothing in the deploy path consults GitHub directly.
- **GitHub is a redundant mirror + a workflow runner.** We push to both manually, and a workflow on the GitHub side force-pushes back to Gitea on every GitHub-side push (which catches PR merges done via the Claude Code Action).
- **Each Coolify app filters by Watch Paths.** A push touching only `litellm/**` rebuilds `staging-litellm` and `prod-litellm`; it does not trigger `staging-app-fast` or `staging-backend-heavy`. This is what makes the monorepo cost-efficient on Coolify.

---

## 2. Why this architecture

Coolify v4 ships first-class native webhook handlers for GitHub, GitLab, Bitbucket, and Gitea — but not OneDev or other self-hosted alternatives. We needed a self-hosted, cloud-independent canonical Git host (data sovereignty, no per-seat fees, no sudden API limits) that Coolify could trigger from natively. Gitea was the only option that met both. GitHub stays in the picture for two reasons: (a) it's a free off-site backup if VPS-2 burns down, and (b) GitHub Actions hosts the Claude Code Action and the mirror-back workflow, which we don't want to self-host. Gitea Actions is intentionally **disabled** for this repo — without a registered runner, jobs queue forever, and Coolify is already the deploy engine.

---

## 3. Component inventory

| Component              | URL / Location                                               | Role                                                         | Auth                                                                              |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Gitea (origin)         | `https://gitea.aishacrm.com`                                 | Canonical Git host; sole webhook source for Coolify          | Admin user `aishacrm`; PAT in Doppler `dev_personal` as `GITEA_TOKEN`             |
| Gitea container        | VPS-2, network `coolify`, alias `gitea`                      | Runs the Gitea web app + SSH; persistent volume for repos    | Coolify Application UUID `mdeub00h17g1nj5dzvc1bzfr`                               |
| Cloudflare DNS         | CNAME `gitea.aishacrm.com` -> `ecff23d3-...cfargotunnel.com` | Public TLS-terminated entry; proxied                         | Cloudflare account                                                                |
| `aishacrm-vps2` tunnel | cloudflared on VPS-2                                         | Bridges Cloudflare edge -> Docker network alias `gitea:3000` | cloudflared service token                                                         |
| Coolify                | `https://deploy.aishacrm.com` (VPS-2)                        | Pulls from Gitea, builds Docker images, runs containers      | Coolify API token (Doppler `dev_personal`); per-app `manual_webhook_secret_gitea` |
| GitHub mirror          | `git@github.com:andreibyf/aishacrm-2.git`                    | Off-site backup + Actions runner host                        | SSH key on laptop; `ANTHROPIC_API_KEY` + `GITEA_TOKEN` in Actions secrets         |
| Mirror workflow        | `.github/workflows/mirror-to-gitea.yml`                      | Force-pushes GitHub `main` back to Gitea after PR merges     | `GITEA_TOKEN` Actions secret                                                      |
| Claude Code Action     | `.github/workflows/claude.yml`                               | PR review and `@claude`-triggered code edits                 | `ANTHROPIC_API_KEY` Actions secret                                                |

**Critical secret names** (do not paraphrase; downstream configs reference them verbatim):

- `GITEA_TOKEN` — laptop `.env`, Doppler `dev_personal`, GitHub Actions secrets
- `ANTHROPIC_API_KEY` — GitHub Actions secrets (used by `claude.yml`)
- `manual_webhook_secret_gitea` — exposed per-Application by Coolify API; one per app

---

## 4. The push-to-deploy lifecycle

When you run `git push origin main` from the laptop:

1. **Local push to Gitea.** Origin remote is `https://gitea.aishacrm.com/aishacrm/aishacrm-2.git`. Authentication is via the Git credential helper using `GITEA_TOKEN`.
2. **Gitea fans out webhooks.** The repo has six push webhooks registered (one per Coolify Application). Each webhook is `POST` with `content_type=json` and an HMAC SHA-256 signature using that app's `manual_webhook_secret_gitea`.
3. **Coolify ingress.** Each webhook lands at `https://deploy.aishacrm.com/webhooks/source/gitea/events/manual?app_uuid=<APP_UUID>`. Coolify validates the HMAC against the stored `manual_webhook_secret_gitea` for that `app_uuid`.
4. **Watch-path filter.** Coolify diffs the pushed commit range against the Application's `watch_paths` glob list. If no matched files changed, the webhook is recorded but no build is queued.
5. **Pull from Gitea.** If matched, Coolify clones / fetches via the embedded credential URL `https://x-access-token:${GITEA_TOKEN}@gitea.aishacrm.com/aishacrm/aishacrm-2.git`. The `GITEA_TOKEN` here is the Coolify-side Application Source secret.
6. **Build.** Coolify runs the Application's configured build command (typically `docker compose -f <compose path> build`) on the assigned server.
7. **Deploy.** New container(s) replace the old per the compose file's restart policy. Old images are pruned per Coolify's retention setting.
8. **Discord notification.** Coolify's project-level Discord webhook fires with deploy status (success / failure / build log link).

---

## 5. The PR-merge lifecycle (GitHub-side)

When a PR is merged on GitHub (e.g., after `@claude` finished its work and the human approved):

1. **GitHub records the merge commit on `main`.**
2. **`mirror-to-gitea.yml` triggers** on the `push` event to `main` (also exposed as `workflow_dispatch` for manual reruns).
3. **Workflow body** (running on `ubuntu-latest`):
   - Checks out the repo with `fetch-depth: 0`.
   - Reads the `GITEA_TOKEN` Actions secret and **strips trailing whitespace**: `TOKEN=$(printf '%s' "${{ secrets.GITEA_TOKEN }}" | tr -d '\r\n\t ')`. This is non-negotiable — see Section 9.
   - Adds Gitea as a remote: `git remote add gitea https://x-access-token:${TOKEN}@gitea.aishacrm.com/aishacrm/aishacrm-2.git`.
   - **Force-pushes**: `git push --force gitea HEAD:main`. GitHub is canonical for this branch direction. If someone pushed to Gitea directly between the last sync and this run, those commits are lost.
4. **Gitea receives the push.** Push webhooks fire as in Section 4, step 2.
5. **Coolify deploys** the matching apps. From Coolify's perspective, this is indistinguishable from a direct laptop push to Gitea.

The `claude.yml` workflow is independent of the deploy path: it only modifies the PR branch (commits to the PR head), and the PR merge into `main` is what kicks off the mirror -> Gitea -> Coolify chain.

---

## 6. Coolify Application config matrix

| Name                    | UUID                       | Server                       | Compose path                                  | Watch paths                                                                                                                 |
| ----------------------- | -------------------------- | ---------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `staging-litellm`       | `zsy5fsbw9hccxvoznkbpy1il` | Staging                      | `staging/services/litellm/docker-compose.yml` | `litellm/**`, `staging/services/litellm/**`                                                                                 |
| `staging-braid`         | `tw8zmua5jyzwnhh1oxw15kkm` | Staging                      | `staging/04-braid/docker-compose.yml`         | `braid-mcp-node-server/**`, `staging/04-braid/**`                                                                           |
| `staging-backend-heavy` | `d24ro1fqm0zyl7pd72g6snd2` | Staging                      | `staging/01-backend-heavy/docker-compose.yml` | `backend/**`, `staging/01-backend-heavy/**`, `Dockerfile`, `package.json`, `braid-mcp-node-server/**`                       |
| `staging-app-fast`      | `di7ko49ikfd2mz8yh0q7id8q` | Staging                      | `staging/02-app-fast/docker-compose.yml`      | `src/**`, `public/**`, `index.html`, `package.json`, `vite.config.js`, `Dockerfile`, `backend/**`, `staging/02-app-fast/**` |
| `prod-litellm`          | `b69h38exrt96qqsokdneckt3` | Prod (Hetzner)               | `prod/01-litellm/docker-compose.yml`          | `litellm/**`, `prod/01-litellm/**`                                                                                          |
| `gitea`                 | `mdeub00h17g1nj5dzvc1bzfr` | Services (VPS-2 / localhost) | `vps2/services/gitea/docker-compose.yml`      | `vps2/services/gitea/**`                                                                                                    |

All apps belong to Coolify project **ZAP Apps** (`umivri5h12ih2ukb00hjdfar`). All use Gitea as `git_repository`, branch `main`.

Note that `staging-backend-heavy` includes `braid-mcp-node-server/**` because the backend image bundles the Braid runtime; the same path also rebuilds `staging-braid` since it ships the standalone MCP server. This double-rebuild is intentional.

---

## 7. Webhook setup

Each Coolify Application exposes four webhook secrets on its API record: `manual_webhook_secret_bitbucket`, `manual_webhook_secret_gitea`, `manual_webhook_secret_github`, `manual_webhook_secret_gitlab`. We use the `gitea` one.

**Pulling the secret via Coolify API:**

```bash
curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
  https://deploy.aishacrm.com/api/v1/applications/${APP_UUID} \
  | jq -r '.manual_webhook_secret_gitea'
```

**Registering the webhook in Gitea via API:**

```bash
curl -s -X POST \
  -H "Authorization: token ${GITEA_TOKEN}" \
  -H "Content-Type: application/json" \
  https://gitea.aishacrm.com/api/v1/repos/aishacrm/aishacrm-2/hooks \
  -d "$(jq -n \
    --arg url "https://deploy.aishacrm.com/webhooks/source/gitea/events/manual?app_uuid=${APP_UUID}" \
    --arg secret "${WEBHOOK_SECRET}" \
    '{
      type: "gitea",
      active: true,
      events: ["push"],
      config: {
        url: $url,
        content_type: "json",
        secret: $secret,
        http_method: "post"
      }
    }')"
```

**Registering via the Gitea UI:** Repo -> Settings -> Webhooks -> Add Webhook -> Gitea. Paste the URL, set Content Type to `application/json`, paste the secret into the Secret field, leave Trigger On at "Push Events", check Active. Save.

**Verifying the webhook fired:** Repo -> Settings -> Webhooks -> click the hook -> Recent Deliveries. A green check + 200/202 response from Coolify means the HMAC validated. A red X with a body like `Invalid signature` means the secret doesn't match — re-pull from the Coolify API and update the Gitea hook.

---

## 8. Adding a new Coolify app — runbook

Concrete checklist for wiring a new service `<NEW_APP>` into auto-deploy. Replace `<NEW_APP>`, `<COMPOSE_PATH>`, and `<WATCH_GLOBS>` with real values.

1. **Add the compose file to the repo** at `<COMPOSE_PATH>` (e.g. `staging/05-new-service/docker-compose.yml`). Commit and push to Gitea.

2. **Create the Application in Coolify** (UI: Project ZAP Apps -> New Resource -> Docker Compose). Set:
   - **Source:** Gitea (private), repo `aishacrm/aishacrm-2`, branch `main`, base directory `/`.
   - **Compose file:** `<COMPOSE_PATH>` (relative to repo root).
   - **Server:** the target VPS.
   - **Watch Paths:** `<WATCH_GLOBS>`, one per line. Always include the compose file's parent directory plus any source dirs the build depends on.

3. **Capture the new UUID and gitea webhook secret:**

   ```bash
   COOLIFY_API_TOKEN=...   # from Doppler dev_personal
   curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
     https://deploy.aishacrm.com/api/v1/applications \
     | jq '.[] | select(.name=="<NEW_APP>") | {uuid, manual_webhook_secret_gitea}'
   ```

4. **Register the Gitea push webhook** using the API call from Section 7, with the captured `app_uuid` and secret.

5. **Trigger a test deploy.** Touch a file under one of the watch paths and push:

   ```bash
   git commit --allow-empty -m "test: trigger <NEW_APP>"
   git push origin main
   ```

   Confirm the webhook delivery in Gitea (200 response) and the build in Coolify (Application -> Deployments).

6. **Update the Configuration Matrix in this doc** (Section 6) — add a row for the new app.

7. **Update `CHANGELOG.md`** under `### Added` with the new app name, UUID, and watch paths.

---

## 9. Common failure modes + fixes

### 9.1 Cloudflare 100 MB body limit (initial mirror push fails)

**Symptom:** First `git push` to Gitea via `gitea.aishacrm.com` fails partway through with HTTP 413 or a connection reset. Cloudflare proxied tunnels enforce a 100 MB request body cap.

**Fix:** Bypass Cloudflare for the initial seed push.

- Option A (preferred): SSH-tunnel to VPS-2, push via `git push http://localhost:3000/aishacrm/aishacrm-2.git` while a port-forward is open.
- Option B: Temporarily expose the Gitea container's port directly via the VPS firewall, push to `http://<vps2-ip>:3000`, then re-enable the firewall rule.

After the initial push, incremental pushes are well under 100 MB and work fine through the tunnel.

### 9.2 `GITEA_TOKEN` trailing-newline issue

**Symptom:** Mirror workflow fails with `fatal: credential url cannot be parsed: contains a newline`. The token works manually but breaks in CI.

**Cause:** `secrets.GITEA_TOKEN` was added via the GitHub UI by pasting from a terminal; the paste included a trailing `\r` or `\n`. `git remote add` rejects URLs with embedded newlines.

**Fix:** The `mirror-to-gitea.yml` workflow strips whitespace defensively:

```bash
TOKEN=$(printf '%s' "${{ secrets.GITEA_TOKEN }}" | tr -d '\r\n\t ')
```

Always use this pattern when interpolating any secret into a URL. Don't rely on the user pasting cleanly.

### 9.3 Coolify auto-FQDN routing fails for Gitea

**Symptom:** Coolify is configured to assign a domain to the Gitea Application, but requests to `gitea.aishacrm.com` 404 or hit the Coolify proxy default page.

**Cause:** Coolify's Traefik proxy fights with the cloudflared tunnel's `gitea:3000` ingress rule when both try to claim the hostname.

**Fix:** Disable Coolify auto-FQDN for the Gitea Application. Bind the Gitea container's port `3000` to a host port (or rely on the shared `coolify` Docker network alias `gitea`) and let cloudflared route directly:

```yaml
# vps2/services/gitea/docker-compose.yml ingress entry in cloudflared config
ingress:
  - hostname: gitea.aishacrm.com
    service: http://gitea:3000
```

Cloudflared resolves `gitea` via Docker DNS because both containers share the `coolify` network.

### 9.4 Gitea container restart loop on port 22 collision

**Symptom:** Gitea container repeatedly restarts. Logs show `bind: address already in use` for port 22.

**Cause:** Default Gitea image launches an embedded SSH server on port 22, which collides with the host's sshd or with another container on the shared network.

**Fix:** In `vps2/services/gitea/docker-compose.yml`, set:

```yaml
environment:
  GITEA__server__START_SSH_SERVER: 'false'
  GITEA__server__DISABLE_SSH: 'true'
```

Or remap to a non-standard port if SSH access to Gitea is needed. We use HTTPS clone URLs exclusively, so SSH-disabled is the correct choice.

### 9.5 Webhook fires but no deploy happens

**Symptom:** Gitea -> Settings -> Webhooks -> Recent Deliveries shows a 200 response from Coolify, but no build appears in the Application's Deployments list.

**Cause:** Watch-path mismatch. Coolify accepted the webhook, diffed the commit range, and decided no `watch_paths` glob matched any changed file. This is silent by design.

**Debug:**

1. List the changed files in the pushed range:
   ```bash
   git diff --name-only <prev_sha> <new_sha>
   ```
2. Compare against the Application's `watch_paths`:
   ```bash
   curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
     https://deploy.aishacrm.com/api/v1/applications/${APP_UUID} \
     | jq '.watch_paths'
   ```
3. If a path you expected to match isn't in the list, edit Watch Paths in the Coolify UI (or `PATCH /api/v1/applications/${APP_UUID}` with the new array) and trigger a re-push. **Note:** glob syntax is bash-extglob style — `**` matches any depth, but `*.js` does NOT match nested files; you need `**/*.js`.

To bypass watch-path filtering for an emergency rebuild: Coolify UI -> Application -> Deployments -> Manual Redeploy.

---

## 10. Cost notes

| Item                             | Amount                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub Actions minutes (mirror)  | ~10–30 min/month (well under 2000 min/month free tier)                                                                                                                                     |
| GitHub Actions minutes (claude)  | Variable; PR-driven. Typically <100 min/month.                                                                                                                                             |
| Anthropic API tokens (`@claude`) | Pay-per-use, charged against `ANTHROPIC_API_KEY`. Replaces a $19/mo Copilot seat per developer; for a 4-person team, breakeven is roughly $76/mo of Claude usage, which we run well under. |
| Coolify                          | Self-hosted on existing VPS-2. Zero marginal cost.                                                                                                                                         |
| Gitea                            | Self-hosted on existing VPS-2. Zero marginal cost.                                                                                                                                         |
| Cloudflare tunnel                | Free tier.                                                                                                                                                                                 |

The dominant cost is Anthropic API usage, and it's strictly cheaper than Copilot for our team size at current usage levels.

---

## 11. What this doc deliberately does NOT cover

- **Coolify install / VPS-2 bootstrap** — see admin docs for VPS provisioning. This doc assumes Coolify and the `coolify` Docker network already exist.
- **Cloudflare tunnel initial setup** — see `docs/.archive-v1-deprecated/legacy-docs/CLOUDFLARE_TUNNEL_CONFIG.md` for the cloudflared service install. Only the gitea ingress entry is documented here.
- **Application-level runtime config** — see each service's own README and the `staging/` and `prod/` compose files. This doc covers wiring deploys, not what each app does.
- **Doppler secret management** — see `docs/admin-guides/ADMIN_GUIDE.md` for Doppler workflow. This doc only references which secrets live where.
- **Database migrations** — see `docs/developer-docs/COPILOT_PLAYBOOK.md` and `docs/developer-docs/DATABASE_GUIDE.md`. Coolify deploys application code; migrations are out-of-band.
- **Branching strategy / PR conventions** — see `docs/BRANCH_CLEANUP_GUIDE.md` and `orchestra/CONVENTIONS.md`.
- **Rollback procedure** — Coolify retains previous images; rollback is via UI ("Redeploy this version"). A dedicated rollback runbook is TODO.

---

## Appendix A — Useful one-liners

**List all webhooks on the Gitea repo:**

```bash
curl -s -H "Authorization: token ${GITEA_TOKEN}" \
  https://gitea.aishacrm.com/api/v1/repos/aishacrm/aishacrm-2/hooks \
  | jq '.[] | {id, url: .config.url, active}'
```

**Delete a stale webhook:**

```bash
curl -X DELETE -H "Authorization: token ${GITEA_TOKEN}" \
  https://gitea.aishacrm.com/api/v1/repos/aishacrm/aishacrm-2/hooks/${HOOK_ID}
```

**Force a manual mirror sync (when the GitHub workflow is stuck):**

GitHub UI -> Actions -> "Mirror to Gitea" -> Run workflow -> Branch: main.

**Force a Coolify redeploy without a push:**

```bash
curl -X POST -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
  https://deploy.aishacrm.com/api/v1/deploy?uuid=${APP_UUID}&force=true
```

**Tail a Coolify deployment's logs from the CLI:**

```bash
ssh andreibyf@<vps-ip> 'docker logs -f $(docker ps --filter "label=coolify.applicationId=${APP_UUID}" -q | head -n1)'
```
