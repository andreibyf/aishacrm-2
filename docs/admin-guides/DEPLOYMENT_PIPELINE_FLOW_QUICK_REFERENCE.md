# Deployment Pipeline Flow (Quick Reference)

This is the short version of how deploys and mirroring work for `aishacrm-2`.
Use this when you need the flow in under 60 seconds.
**Full runbook:** `docs/admin-guides/GITEA_COOLIFY_PIPELINE.md`

## Canonical behavior

- Coolify deploys are triggered by **Gitea push webhooks**.
- The automatic mirror workflow in this repo is **GitHub -> Gitea** (`.github/workflows/mirror-to-gitea.yml`).
- There is **no automatic Gitea -> GitHub mirror** in this setup.

## Diagram

```mermaid
flowchart LR
  A[Developer push to Gitea main] --> C[Gitea main]
  B[GitHub push/PR merge to main] --> D[GitHub Action: mirror-to-gitea.yml]
  D --> C

  C --> E[Gitea push webhooks]
  E --> F[Coolify app endpoint per app_uuid]
  F --> G{watch_paths match changed files?}
  G -- Yes --> H[Build + deploy affected app(s)]
  G -- No --> I[No deployment (expected)]
```

## Practical flow to remember

1. If code reaches **Gitea main**, Gitea can notify Coolify.
2. Coolify only deploys apps whose `watch_paths` match changed files.
3. GitHub-side merges still deploy because GitHub Actions mirrors those commits into Gitea first.

## Quick truth table

- `Gitea push -> Coolify deploy path available`: **Yes**
- `GitHub push -> Gitea automatic mirror`: **Yes**
- `Gitea push -> GitHub automatic mirror`: **No**
- `GitHub push -> Coolify deploy`: **Yes** (after mirror job pushes to Gitea)

## Source of truth docs

- Detailed runbook: `docs/admin-guides/GITEA_COOLIFY_PIPELINE.md`
- Mirror workflow: `.github/workflows/mirror-to-gitea.yml`
