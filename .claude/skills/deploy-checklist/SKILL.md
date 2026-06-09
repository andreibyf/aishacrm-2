---
name: deploy-checklist
description: Pre-deployment verification for AiSHA CRM. Use before shipping a release, deploying with a Supabase migration, rebuilding Docker containers, registering a Stripe webhook, or rolling a Coolify domain. Verifies CI, dual-Supabase schema parity, Doppler config, and rollback triggers.
argument-hint: "[service or release name]"
---

# /deploy-checklist (AiSHA CRM)

> Stack, connectors, and non-negotiable rules: see [AISHA_CONTEXT.md](../AISHA_CONTEXT.md).

Generate a pre-deployment checklist tailored to our Docker/Coolify + dual-Supabase + Doppler pipeline.

## Usage
```
/deploy-checklist <service or release>
```
Tell me what's in the release (migration? Doppler change? Stripe? new container?) and I'll prune/extend the checklist.

## Output

```markdown
## Deploy Checklist: <service/release>
**Date:** … | **Deployer:** Dre | **Target:** prod / staging

### Pre-Deploy
- [ ] All tests passing in CI (GitHub Actions green; GHCR image built)
- [ ] PR reviewed, squash-merged to main
- [ ] No known critical bugs in release
- [ ] Migration applied to **dev (efzqxjpfewkrgpdootte) first**, verified, then **prod (ehjlenywplgyiahgxkfj)** — both projects in parity
- [ ] Migration uses named dollar-quotes; references `tenant` (singular); idempotent
- [ ] Doppler vars present in target config (dev_personal / prd_prd / stg_stg); no secrets in code
- [ ] `validateAuthConfig()` will pass (JWT secret, COOKIE_DOMAIN set for target domain)
- [ ] Rollback plan documented (previous GHCR image tag noted)

### Deploy
- [ ] Rebuild, do NOT restart: `docker compose up -d --build --force-recreate <service>`
- [ ] On Coolify: correct deploy domain (aisha-app / data-support / scheduling / ai-runtime / ai-infra), correct network (`aishanet` prod / `aishanet-staging`)
- [ ] Smoke test: login, tenant data loads, one write path, AiSHA summarise, a Bull-backed action
- [ ] Watch Dockhand container health + Cloudflare 5xx for 15 min

### Post-Deploy
- [ ] Metrics nominal (error rate, latency); Ollama warm (~4s summaries)
- [ ] Update changelog / session journal
- [ ] Close linked Linear issue
- [ ] Post status in Slack

### Rollback Triggers
- Error rate exceeds [X]% over baseline
- Auth failures spike (COOKIE_DOMAIN / JWT regression)
- Tenant data isolation anomaly (any cross-tenant read) → immediate rollback
- Bull queue backlog growing unbounded / CARE CPU storm
- Rollback = redeploy previous GHCR image tag + (if migration is reversible) down-migration on prod then dev
```

## Release-type add-ons (auto-included when relevant)

- **Stripe billing change:** register live webhook in Stripe Dashboard → update `STRIPE_PLATFORM_WEBHOOK_SECRET` in Doppler `prd_prd` → redeploy backend container → verify subscription lifecycle events land. Run Stripe CLI from OUTSIDE the repo.
- **Breaking API change:** notify tenant integrations; check Braid tool schema consumers.
- **New table:** RLS policies + advisors clean on BOTH projects.
- **LLM/provider change:** verify per-tenant spend caps (Doppler) and routing (Ollama/Haiku/Sonnet) before enabling.

## Connectors
- **GitHub Actions/GHCR:** confirm pipeline green and image published before deploy.
- **Supabase MCP:** verify schema parity (`information_schema`, `pg_policies`) on both projects; `get_advisors`.
- **Dockhand / Cloudflare:** post-deploy watch.
- **Slack / Linear:** notify + close tickets.

## Tips
1. Run before every deploy, routine ones included.
2. Schema parity check is the single highest-value gate — never deploy prod ahead of a verified dev migration.
3. Decide rollback criteria before deploying, not during.
