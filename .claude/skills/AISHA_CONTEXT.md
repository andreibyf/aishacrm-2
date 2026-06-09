# AiSHA CRM — Engineering Context

Shared context for all `engineering:*` skills. Skills reference this instead of asking about the stack. Source of truth for stack, conventions, connectors, and hard-won rules.

**Org:** 4V Data Consulting, LLC · **Product:** AiSHA CRM (multi-tenant SaaS) · **Live:** `app.aishacrm.com` · **Owner/solo dev:** Dre (A. Byfield)

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Data + Auth | Supabase (multi-tenant PostgreSQL + Auth) |
| Queues | Bull + Redis |
| Containers | Docker (39+ containers), ZAP-Hosting VPS → migrating to Coolify |
| CDN/Edge | Cloudflare |
| CI/CD | GitHub Actions + GHCR |
| Secrets | Doppler |
| Telephony | Twilio (Voice + WhatsApp) |
| Scheduling | Cal.com (self-hosted) |
| Billing | Stripe (tiered seat-based) |
| LLM | Self-hosted Ollama (`llama3.1:8b`) + Anthropic + OpenAI |

**Proprietary systems:** AiSHA (AI assistant, 118+ Braid DSL tools) · Braid DSL (AI-native language, VS Code ext v0.7.0) · CARE (Customer Adaptive Response Engine — Bull queue, 8 action types, Autonomy Playbook executor) · PEP (Plain English Programming — NL→SQL with IR compilation) · Dockhand (Docker stack monitoring; Hawser agent on VPS, Dockhand container on laptop).

## Key coordinates

- **Repo:** `andreibyf/aishacrm-2` → `C:\Users\andre\Documents\GitHub\aishacrm-2`
- **Supabase prod:** `ehjlenywplgyiahgxkfj` · **dev/preview:** `efzqxjpfewkrgpdootte`
- **Doppler:** project `aishacrm` · configs `dev_personal`, `prd_prd`, `stg_stg` (staging in setup)
- **Coolify deploy domains:** `aisha-app`, `data-support`, `scheduling`, `ai-runtime`, `ai-infra` (prod + staging compose; staging on `aishanet-staging`, `+100` port offsets, `DOPPLER_TOKEN_STAGING`)

## Connectors mapping (replaces generic placeholders)

| Generic skill term | Our actual tool | How to use |
|--------------------|-----------------|------------|
| source control | GitHub | `gh` CLI; `.bat` wrapper for cmd.exe quoting |
| project tracker | Linear | Linear MCP |
| chat | Slack | Slack MCP |
| monitoring | Dockhand + Cloudflare | container health; Cloudflare dashboard |
| CI/CD | GitHub Actions + GHCR | workflow status, image builds |
| knowledge base | repo `docs/` + project knowledge | session journals, plan docs |
| database | Supabase MCP | `apply_migration`, `execute_sql`, `get_advisors` |

## Non-negotiable rules (apply across all skills)

1. **Investigate before concluding.** Grep the codebase, check schema, verify DB state before suggesting a user-side cause. Assume the bug is in code until proven otherwise.
2. **Dual-Supabase.** Every schema change applies to BOTH projects — **dev (`efzqxjpfewkrgpdootte`) first, then prod (`ehjlenywplgyiahgxkfj`)**. Verify with `information_schema` + `pg_policies` + `pg_proc`.
3. **Tenant table is `tenant` (singular).** Any migration referencing `tenants` (plural) fails.
4. **Migrations:** named dollar-quote delimiters (`$fn$`, `$policy$`), never bare `$$`. `CREATE TYPE IF NOT EXISTS` is invalid — use `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$`. `apply_migration` runs immediately (no dry-run).
5. **Auth:** `COOKIE_DOMAIN` required for cross-subdomain auth. JWTs never use fallback strings in prod. Startup `validateAuthConfig()` must `process.exit(1)` on missing/weak secrets.
6. **Redis cache:** cold-marker pattern after mutations; per-user cache keys (visibility scopes differ). TTLs: list 5s, detail 60s.
7. **CARE:** cooldown state persisted to DB (`generation_skipped` sentinel rows with `expires_at`) — in-memory Map clears on restart and causes CPU storms.
8. **`POST /api/users` footgun:** password is silently discarded; all routes call `inviteUserByEmail()`. Correct fix: branch on password presence → `supabase.auth.admin.createUser({ password, email_confirm: true })`.
9. **Materialized views:** pre-aggregate each table independently before joining; chained LEFT JOINs without pre-aggregation create cartesian products.
10. **Docker:** `docker compose restart` does NOT rebuild. Code change → `docker compose up -d --build --force-recreate <service>`.
11. **No one-time scripts in the repo.** Ops utilities don't belong in the application codebase.
12. **`--dry-run` is not assumed safe** — verify exactly what it gates per script.

## Git & PR workflow

- One branch at a time; sequential atomic PRs; **squash-and-merge**.
- Commit via temp file to avoid shell quoting failures: write message to `.git\COMMIT_MSG_TEMP`, then `git commit -F .git\COMMIT_MSG_TEMP`.
- On PR fixes, always post reply comments on review threads: `gh api /repos/andreibyf/aishacrm-2/pulls/{pr}/comments/{id}/replies -X POST -F body=@file.md`.

## Testing conventions (tests required for every development)

- **Frontend (Vitest):** smoke tests in `src/pages/__tests__/`, filename `*.smoke.test.{jsx,tsx}`.
- **Backend:** `docker compose exec backend node --test lib/path/to/file.test.js` (path inside container has no `backend/` prefix).
- **Test data:** `TestFactory` pattern with `is_test_data: true` metadata flag. Cleanup hooks delete via direct Supabase client (not API DELETE routes — they require auth and fail silently).
- **Stripe CLI:** run OUTSIDE the repo dir (binary conflict in `node_modules/.bin`).

## Environment

- **Shell:** cmd.exe default (`cmd /c "cd /d C:\path && command"`); PowerShell for string interpolation.
- **File edits:** Filesystem MCP first; fall back to Desktop Commander on EPERM. CRLF files need `\r\n` in Python match strings.
