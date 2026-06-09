---
name: debug
description: Structured debugging session for AiSHA CRM — reproduce, isolate, diagnose, fix. Trigger with an error/stack trace, "works in dev but not prod", "broke after deploy", container/Bull/Supabase/Twilio/Stripe failures, or behavior diverging from expected.
argument-hint: "<error message or problem description>"
---

# /debug (AiSHA CRM)

> Stack, connectors, and non-negotiable rules: see [AISHA_CONTEXT.md](../AISHA_CONTEXT.md).

Run a structured debugging session. **Investigate before concluding** — grep the whole codebase, check schema and DB state, verify config. Assume the bug is in code until proven otherwise; never imply user error before the investigation is complete.

## Process

```
1. REPRODUCE   expected vs actual · exact steps · scope (when started, who/which tenant)
2. ISOLATE     component/route/Bull job/container · recent commits & deploys · logs
3. DIAGNOSE    form hypotheses · trace the path · find root cause, not symptom
4. FIX         change + explanation · side effects · regression test (required)
```

## AiSHA-specific suspects (check these early)

- **Stale image after deploy:** `docker compose restart` does NOT rebuild. Confirm `docker compose up -d --build --force-recreate <service>` was run.
- **"works in dev, not prod":** schema drift between Supabase projects — a migration applied to dev (`efzqxjpfewkrgpdootte`) but not prod (`ehjlenywplgyiahgxkfj`). Verify with `information_schema`/`pg_policies`/`pg_proc` on both.
- **Migration failure:** reference to `tenants` (plural — wrong; it's `tenant`), bare `$$` dollar-quote corruption, or invalid `CREATE TYPE IF NOT EXISTS`.
- **Cross-subdomain auth failures / logged out:** missing `COOKIE_DOMAIN`, or a JWT fallback string in prod.
- **Stale data after a write:** cache cold-marker not set, or a shared (non-per-user) cache key.
- **Data leaking across users/tenants:** missing tenant filter on a v2 route (no longer auto-scoped) or shared cache key.
- **CPU storm / runaway CARE:** in-memory cooldown Map cleared on container restart; must read DB `generation_skipped` sentinels.
- **User created but can't log in / no password set:** `POST /api/users` discards password and calls `inviteUserByEmail()`.
- **Extreme query slowness:** chained LEFT JOINs in a materialized view → cartesian product; pre-aggregate each table first.
- **Cal.com 500:** known `password authentication failed for user "calcom"` — Postgres connection attempt in the `tenantintegrations` route.
- **Secrets/env:** confirm the value exists in the right Doppler config (`dev_personal` / `prd_prd` / `stg_stg`).

## What helps from you
Exact error text (don't paraphrase) · reproduction steps · what changed (deploy, migration, dependency, Doppler var) · which tenant/user/environment · logs.

## Output

```markdown
## Debug Report: <issue>

### Reproduction
- Expected: …
- Actual: …
- Steps / scope: … (env, tenant)

### Investigation
[What was checked: grep results, schema state on both projects, logs, recent commits]

### Root Cause
[Why it happens — mechanism, not symptom]

### Fix
[Exact code/config change]

### Prevention
- Regression test: [exact test, in `src/pages/__tests__/*.smoke.test.jsx` or backend `*.test.js`]
- Guard: [validation / startup check / migration parity]
```

## Connectors
- **Dockhand:** container health, restart loops, resource limits (e.g. `aishacrm-ollama` 8GB).
- **GitHub (`gh`):** `gh pr list`/`git log` for commits touching the path; correlate with onset.
- **Supabase MCP:** `execute_sql` to inspect live state; `get_logs`; `get_advisors`.
- **Cloudflare:** edge/cache errors, 5xx origin correlation.
- **Linear:** search for a prior report; open a ticket once root cause is known.

## Tips
1. Reproduce against dev first; diff dev vs prod schema before blaming code.
2. Rule out the stale-image and schema-drift cases before deeper tracing — they're the most common here.
3. Every fix ships with a regression test.
