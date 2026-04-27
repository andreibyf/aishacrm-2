# Coolify Migration — Goals, Achievements, Next Steps

**Last updated:** 2026-04-26  
**Workstream owner:** Dre  
**Status:** Phase 1 complete (staging POC). Phase 2 (production migration) queued.

---

## Goal

Replace the current GHCR-based deploy pipeline with **Coolify-native deploys** that build images locally on the App VPS, eliminating GitHub Actions build minutes and GHCR storage/bandwidth costs.

### Why

GitHub costs are growing as the project ships frequently:

- **GHA Ubuntu runner minutes** — ~25 min per `v*` tag (5-image matrix × ~5 min each, parallel build-push-action). At ~80 tags/month this exceeds the 2,000 min free tier on private repos.
- **GHCR storage** — every `v*` tag retains 5 images. Litellm and Cal.com images are ~1.5 GB each. Storage grows linearly without retention pruning.
- **Round-trip waste** — every prod deploy currently does `build → push to GHCR → pull on App VPS`. The image is built on a runner that's never going to run it.

Coolify-native deploy eliminates all three: the App VPS clones the repo, builds the image locally, runs it. No registry hop, no GHA minutes for builds (just keep them for tests).

### Constraints from original brief

- **Don't dismantle GHCR yet** — production must stay on GHCR-based deploy until Coolify-built deploys are validated stable.
- **Coolify and the App VPS are separate Zap-Hosting servers.** Coolify (`appspanel-631819.zap.cloud`) is the control plane; App VPS (`beige-koala`, `147.189.173.237`) runs the workloads. SSH from Coolify to App VPS is how the deploy flow reaches the App VPS.
- **Caddy and Cloudflared/"hawser" tunnels are outside Coolify's deployment model** and stay as-is.
- **Doppler is the single source for runtime secrets**, runtime-injected via the existing entrypoint pattern.

---

## What's been achieved

### Phase 1 — Staging proof-of-concept (complete, now wound down to on-demand)

Built `staging/` as a complete Coolify-managed deploy of the AiSHA stack to validate every piece of the GitHub→Coolify→App VPS pipeline before touching production. Full results in `staging/README.md`.

**Working artifacts in the repo (all kept for on-demand use):**

| Artifact                                        | Purpose                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `staging/01-backend-heavy/docker-compose.yml`   | Backend + Redis pair (Coolify resource UUID `kvwa38mel9mt1i1c49wn9t96`)                    |
| `staging/02-app-fast/docker-compose.yml`        | Frontend + comms worker (`q14ihdhjh5szhlaesj82til2`)                                       |
| `staging/03-ai-infra/docker-compose.yml`        | LiteLLM + Ollama (`ue9r079mdtpkmgbbb619f04z`)                                              |
| `staging/04-braid/docker-compose.yml`           | Braid MCP server + 2 worker nodes (`b11ezlw1volbg4ka6vyuy8ac`)                             |
| `staging/05-scheduling-rare/docker-compose.yml` | Cal.com + dedicated postgres — opt-in only                                                 |
| `staging/scripts/bootstrap-stg_stg.sh`          | Doppler stg_stg config bootstrap (clone-from-prd_prd)                                      |
| `staging/scripts/validate-compose.sh`           | Local lint (syntax, port collisions, network membership)                                   |
| `staging/scripts/post-deploy-check.sh`          | Phase-aware smoke tests on the App VPS                                                     |
| `litellm/Dockerfile`                            | LiteLLM image with `litellm_config.yaml` baked in (avoids Coolify v4 bind-mount stripping) |
| `calcom-db/Dockerfile`                          | Postgres + `scripts/calcom-db-init.sql` baked in (same reason)                             |
| `staging-aishanet` external Docker network      | Cross-resource DNS on App VPS (created once, persistent)                                   |

**Pipeline behaviors discovered and documented (these all apply to the prod migration too):**

| Behavior                                                                                                                       | Mitigation                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coolify v4 ignores `container_name` directives and auto-suffixes containers with the app UUID                                  | Use compose service names for cross-stack DNS, not container names                                                                                          |
| Coolify v4 in compose deployment mode renders the compose file but does NOT clone the repo working tree to the app dir         | Bake repo-resident files (config.yaml, init.sql) into custom GHCR images instead of bind-mounting them                                                      |
| Coolify v4 strips `..` segments from compose volume sources, resolving them to a path missing one or more directory components | Same fix — bake into image                                                                                                                                  |
| Coolify's render → .env-file → dotenv-parse pipeline strips outer quotes from env values per dotenv spec                       | YAML single-quote-wrap the entire env entry to preserve literal inner double-quotes (Cal.com `ALLOWED_HOSTNAMES`)                                           |
| Modern Docker (28.2+) rejects legacy v1 manifest schema; Cal.com's pre-v6 images use it                                        | Repinned Cal.com to v6.2.0 digest (`ace3bb12...`); production still on v5-era pin (`0aca8203...`) — **needs same bump**                                     |
| `.dockerignore` `scripts/` + `*.sql` patterns filtered the calcom-db init script out of the build context                      | Append `!scripts/calcom-db-init.sql` re-include after the broad excludes (BuildKit honors negation order)                                                   |
| `force=true` in Coolify's deploy API does NOT add `--pull always` to compose-up; cached images persist                         | Manually `docker pull` on the App VPS after a new image lands on GHCR, or use `image: ...:vX.Y.Z` (versioned tag) instead of `:latest` to force fresh pulls |

**Operational learnings:**

- Heavy concurrent prod + staging containers + GHCR build pulls + parallel test suites OOM'd the App VPS (April 26, ~21:00 UTC). Single VPS hosting both prod and staging without memory caps is fragile. Recovery required Zap-Hosting hard reboot. Containers came back via `restart: unless-stopped`.
- Always-on staging duplicate of every prod service was the proximate cause and didn't earn its keep for a solo-team project (CI tests + Coolify rollback already cover most of staging's value). **Staging wound down to on-demand** — Coolify resources, compose files, GHCR images all retained; resources just stopped.
- Removed home-IP `agreeable-anteater-...` server entry from Coolify (security cleanup — was a deployment target reachable from a leaked Coolify SSH key).
- Netdata polling on App VPS reduced from 1s to 5s (saves ~7.5% of one core continuously).

### What's NOT yet done

- Production has not been migrated to Coolify-native build. It still deploys via `.github/workflows/docker-release.yml` matrix → GHCR → SCP/SSH to `/opt/aishacrm` → `docker compose up`.
- Production `docker-compose.prod.yml` Cal.com image is still pinned to the v5-era `0aca8203...` digest — works only because the image is cached on the VPS. A `docker image prune` would break prod scheduling.
- No memory caps on production compose services. Today's OOM was the warning shot.

---

## Next steps

Migrate production from GHCR-pulled images to Coolify-native local builds, in this order (smallest build first, biggest blast radius last):

### Order

1. **litellm** — small image, well-isolated, already proven the bake-into-image pattern
2. **mcp** — small TypeScript server
3. **frontend** — medium-cost Vite build, well-known
4. **calcom-db** — trivial COPY-only build (could slot anywhere; only matters if Cal.com stays in prod)
5. **backend** — biggest build (puppeteer, Doppler CLI, native deps, full backend tree). Last so we can budget it correctly after tuning concurrency caps with the smaller services.

### Per-service migration recipe

For each service, in order:

1. Convert the production compose entry from `image: ghcr.io/...` to `build: { context: ..., dockerfile: ... }`.
2. Create a new Coolify Docker Compose resource pointing at production compose, on the App VPS server.
3. Run side-by-side with the GHCR-deployed prod for ≥1 week. Compare resource usage, deploy time, reliability.
4. Cutover: stop the GHCR-deployed instance for that one service, route traffic to the Coolify-built one.
5. Validate health for ≥48 hours before moving to the next service.

### Hardening required before starting

These apply regardless of whether you keep GHCR or move to Coolify-build:

- [ ] **Add `mem_limit` to every prod compose service.** Total < 70% of App VPS RAM. Prevents single runaway from OOM-killing the box.
- [ ] **Cap Coolify build concurrency to 1.** Avoids parallel image builds stacking and exhausting RAM during deploy.
- [ ] **Bump production Cal.com pin to v6.2.0** (`calcom/cal.com@sha256:ace3bb1219fb7306585ab9f4d94d41af7ee064c343db0498173436bbe857bd49`). Re-validate Host table, `_user_eventtype`, ALLOWED_HOSTNAMES against the staging compose's working config first.

### After all 5 services migrated

- [ ] Retire `.github/workflows/docker-release.yml` build matrix. Keep test/lint workflows.
- [ ] Either delete the GHCR images (significant storage savings) or set up retention pruning.
- [ ] Update `CLAUDE.md`, `docs/admin-guides/ADMIN_GUIDE.md`, `docs/developer-docs/DEVELOPER_MANUAL.md` to reflect Coolify-native deploy as canonical.
- [ ] Document rollback procedure (Coolify tag/commit pinning).

### Out of scope for the migration

- **Caddy** and **Cloudflared/hawser** ingress — stay outside Coolify per original brief.
- **OpenReplay** at `/opt/openreplay` — separate deployment lifecycle.
- **n8n** workflows — opt-in profile, not in the deploy hotpath.
- **Cal.com** — production already runs it under `profiles: [scheduling]` opt-in. Could stay GHCR-based (uses upstream `calcom/cal.com:vX` images, not built by us) or be removed from compose entirely.

---

## Reference

- `staging/README.md` — on-demand staging quick-start, full list of Coolify v4 quirks discovered
- `CHANGELOG.md` — per-commit detail of every fix shipped today
- `docker-compose.prod.yml` — current production compose (still GHCR-image based)
- `.github/workflows/docker-release.yml` — current GHCR build + SCP/SSH deploy workflow
- Coolify control plane: `https://appspanel-631819.zap.cloud`
- App VPS: `beige-koala` (`147.189.173.237`), accessible as `remoteserver` via the SSH config alias
