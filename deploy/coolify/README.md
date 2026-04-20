# deploy/coolify — Deployment split (pre-migration staging area)

This folder is the staging ground for a future Coolify migration. Its purpose
is to **separate deployment surfaces** by blast radius and change cadence,
**without** altering the currently-deployed production path.

## Scope

Only the **aishacrm** application and its direct satellites. The VPS also runs
OpenReplay, a landing page, and containerd helpers — those are **out of scope**
for this split and are not bundled anywhere here.

## Rule

> Deployment domains should reflect what changes together, fails together, and
> should roll back together.

## Domains

| Folder           | Services                                              | Cadence             |
| ---------------- | ----------------------------------------------------- | ------------------- |
| `aisha-app/`     | frontend, backend, aisha-comms                        | fast (every tag)    |
| `data-support/`  | redis-memory, redis-cache                             | very rare           |
| `scheduling/`    | calcom, calcom-db                                     | mid (quarterly-ish) |
| `ai-runtime/`    | braid-mcp-server, braid-mcp-1, braid-mcp-2            | mid                 |
| `ai-infra/`      | ollama, litellm                                       | rare                |
| `support-infra/` | (README only — documents out-of-scope VPS containers) | n/a                 |

## Shared wiring

All domains attach to a single **external** Docker network:

```yaml
networks:
  aishanet:
    external: true
```

Cross-domain resolution is by `container_name`. This preserves the current
topology and avoids the need for a service mesh or shared DNS during the
transition.

## What this folder is NOT

- It is **not wired into CI** yet. The live deployment is still driven by
  `docker-compose.prod.yml` at the repo root and
  `braid-mcp-node-server/docker-compose.prod.yml`.
- It does **not** contain Coolify-specific config, platform secrets, or
  lock-in. Adding Coolify platform glue is a separate, later step.
- It does **not** delete existing deployment files. The refactor is additive
  until someone explicitly retires the old files.
- It does **not** include OpenReplay, Caddy, the landing page, or Hawser.
  See `support-infra/README.md` for why.

## See also

- `docs/deployment/coolify-migration.md` — migration plan, order, risks.
- `docs/deployment/env-matrix.md` — environment variable ownership by domain.
- `tests/deployment/compose-topology.test.js` — validates each compose file
  contains only its domain's services.
