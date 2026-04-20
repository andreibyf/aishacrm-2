# Coolify migration plan

This document describes **why** the current deployment workflow is being
split, **what** the target domains look like, and **how** to migrate in a
low-risk order. It does **not** yet introduce Coolify platform-specific
config — the first step is separation of surfaces.

## Scope

The split covers only **aishacrm**. The production VPS (`/opt`) also runs:

- `/opt/aisha-landing` — marketing site (separate deployment, out of scope)
- `/opt/openreplay` — self-managed OpenReplay stack with its own auto-created
  edge (out of scope)
- `containerd` and related helpers — infrastructure (out of scope)

None of those are bundled into this split. See `deploy/coolify/support-infra/README.md`.

## Validation strategy — parallel staging lane, not in-place replacement

**Cutover is the last step, not the first.** Before any prod container is
touched, the full split is validated on the same VPS as a parallel staging
lane with disjoint names, ports, network, and Doppler config. See
`deploy/coolify/STAGING.md` for the complete strategy and the Phase A/B/C
rollout sequence. The short version:

- **Phase A (smoke).** Deploy `data-support/docker-compose.staging.yml`
  then `aisha-app/docker-compose.staging.yml` (frontend + backend only).
  Point at `staging-app.aishacrm.com` / `staging-api.aishacrm.com`.
  Validate mechanics end to end.
- **Phase B.** Uncomment `aisha-comms` in the aisha-app staging compose
  once you've confirmed it will not process live prod queues.
- **Phase C.** Deploy scheduling, ai-runtime, ai-infra staging files one at
  a time — each has its own staging compose already prepared.
- **Only after all three phases pass** does cutover become a conversation,
  and cutover itself is a separate PR.

Each staging lane uses its own Doppler config (`stg_stg`) — prod secrets
(`prd_prd`) are never touched by the staging deploy.

## Why the current workflow is too bundled

1. **Single compose file carries the whole runtime.**
   `docker-compose.prod.yml` at the repo root defines the core app (frontend,
   backend, aisha-comms), the Redis tier, LiteLLM, and Cal.com behind a
   profile. Any change — app, LiteLLM, Cal.com — touches the same file and
   is deployed with the same pipeline.

2. **Blast radius is wider than the change surface.** The app releases on
   every tag. Redis, LiteLLM, and Cal.com do not. Bundling them means a bad
   app release risks disturbing services that did not need to roll.

3. **Rollback is all-or-nothing.** Rolling back the app today can pull Cal.com
   or Redis config along with it, because they share a compose file and often
   share `${VARS}`.

4. **Support/edge containers are implicit.** Ollama runs outside the compose
   (standalone Dockhand). Hawser is a VPS facility. Nothing captures the
   change-cadence difference between Braid MCP (mid) and LiteLLM/Ollama
   (rare), so they end up being deployed with similar urgency despite
   different risk profiles.

## Target deployment domains

Single rule: **deployment domains reflect what changes together, fails
together, and should roll back together.**

| Domain        | Services                                   | Cadence             | Ownership implication                     |
| ------------- | ------------------------------------------ | ------------------- | ----------------------------------------- |
| aisha-app     | frontend, backend, aisha-comms             | fast (every tag)    | App team — release-tag driven             |
| data-support  | redis-memory, redis-cache                  | very rare           | Infra — version bumps only                |
| scheduling    | calcom, calcom-db                          | mid (quarterly-ish) | App team — image digest bumps, SMTP, keys |
| ai-runtime    | braid-mcp-server, braid-mcp-1, braid-mcp-2 | mid                 | Braid team — registry/DSL driven          |
| ai-infra      | ollama, litellm                            | rare                | Infra — image/model bumps                 |
| support-infra | (docs only — hawser, landing, openreplay)  | n/a                 | Infra — **not Coolify-managed**           |

Each domain has both a production compose (`docker-compose.yml`) and a
staging compose (`docker-compose.staging.yml`). Staging lives on the same
VPS as prod but is fully isolated (see `STAGING.md`).

## Migration order (lowest risk first)

Each step is validated on the staging lane first, then promoted.

1. **aisha-app.** Move the fast-change path first. Phase A smoke test is
   frontend+backend only. This is the domain with the highest deploy
   frequency, so getting its split right has the best payoff and exposes
   the most friction early.
2. **data-support.** Standalone Redis. Already part of Phase A (backend's
   staging compose depends on staging Redis). No app dependencies to
   untangle.
3. **scheduling.** Cal.com is already the most isolated piece of the current
   runtime (own DB, own profile). Lowest coupling to the rest — easy move.
4. **ai-runtime.** Braid MCP already ships from its own image and its own
   compose file today (`braid-mcp-node-server/docker-compose.prod.yml`).
   Cutting it over to `deploy/coolify/ai-runtime/` is mostly a path change.
5. **ai-infra.** Ollama and LiteLLM. Ollama is the tricky one because its
   model-data volume must be preserved across the cutover — plan the volume
   migration before stopping the standalone Dockhand container.

## Guardrails honored by this refactor

- **Additive only.** No existing compose files were removed. `docker-compose.yml`,
  `docker-compose.prod.yml`, and `braid-mcp-node-server/docker-compose.prod.yml`
  remain authoritative until cutover.
- **No Coolify lock-in yet.** No platform secrets, no Coolify-specific glue.
- **No repo multiplication.** Single repo, new subtree.
- **No behavioral changes to app code.**
- **No n8n in future planning.** Existing compose entries left in place
  (additive rule), but the planning artifacts do not carry n8n forward.
- **Scope discipline.** Caddy, OpenReplay, the landing page, and Hawser are
  all out of scope. Not bundled, not referenced as deployment domains,
  not assumed.
- **Staging never touches prod resources.** Separate network, ports,
  container names, volumes, and Doppler config. Enforced by
  `tests/deployment/compose-topology.test.js`.

## Items requiring manual confirmation

1. **Create the `stg_stg` Doppler config** (new `stg` environment) before
   deploying any staging lane. Start as a copy of `prd_prd` and override
   URLs, outbound keys, and tenant scoping. See `STAGING.md`.
2. **Create a `DOPPLER_TOKEN_STAGING` service token** scoped to `stg_stg`.
   Do not reuse `DOPPLER_TOKEN_PROD`.
3. **Create the `aishanet-staging` Docker network** on the VPS:
   `docker network create aishanet-staging`.
4. **Add DNS** for `staging-app`, `staging-api`, `staging-scheduler`. Do not
   reassign existing prod records.
5. **Ollama volume cutover.** The standalone `aishacrm-ollama` Dockhand
   container mounts a volume with pulled model weights. Confirm the volume
   name and mount path before replacing the container via the new compose.
6. **Model preload for Ollama.** Current entrypoint preloads `llama3.2:3b`
   and `qwen2.5-coder:3b`. Production uses `llama3.1:8b` for summaries
   (`SUMMARY_LLM_MODEL` in Doppler `prd_prd`). Decide whether to update the
   entrypoint or add a post-start pull hook in Coolify.
7. **Cal.com init script path.** The scheduling compose bind-mounts
   `../../../scripts/calcom-db-init.sql` (repo-root relative). Confirm Coolify
   launches compose with the repo root as build context.
8. **`CALCOM_*` secrets (prod and staging).** Cal.com requires
   `CALCOM_NEXTAUTH_SECRET` and `CALCOM_ENCRYPTION_KEY` to be available at
   compose-up time (Cal.com's pre-built image does not run Doppler inside
   it). Coolify secret injection must be set up for both prod and staging
   scheduling domains before each cutover.
9. **External network provisioning.** Both `aishanet` and `aishanet-staging`
   must exist on the host before any domain is started.
10. **Braid MCP duplicate compose.** `braid-mcp-node-server/docker-compose.prod.yml`
    still exists and is authoritative for the current deployment. Keep it in
    sync with `deploy/coolify/ai-runtime/docker-compose.yml` manually until
    cutover, then retire the old file in a dedicated PR.

## When to retire the root compose files

Only after:

- Every domain above has been deployed via Coolify on the staging lane
  successfully
- At least one staging Phase A → B → C cycle has completed end-to-end
- A cutover dry run has been performed on the staging lane (redeploy from
  scratch with Coolify only)
- All `docs/deployment/env-matrix.md` entries have owners assigned in Coolify
