---
name: code-review
description: Review code changes for security, performance, and correctness in the AiSHA CRM codebase. Trigger with a PR URL or diff, "review this before I merge", "is this safe?", or when checking a change for tenant-isolation leaks, N+1 queries, cache staleness, RLS gaps, or auth regressions.
argument-hint: "<PR number, PR URL, diff, or file path>"
---

# /code-review (AiSHA CRM)

> Stack, connectors, and non-negotiable rules: see [AISHA_CONTEXT.md](../AISHA_CONTEXT.md).

Review code changes in `andreibyf/aishacrm-2` with a structured lens on multi-tenant isolation, security, performance, correctness, and maintainability.

## Usage

```
/code-review <PR number or file path>
```

Pull the diff with `gh pr diff <num> --repo andreibyf/aishacrm-2`. If nothing is provided, ask what to review. Investigate the surrounding code before judging — grep for callers and schema dependencies; do not flag based on the diff alone.

## Review dimensions (AiSHA-specific first)

### Multi-tenant isolation (highest priority)
- Every query reaching tenant data filters by tenant. The canonical table is `tenant` (singular).
- Per-user Redis cache keys — a shared key leaks data across users with different visibility scopes.
- RLS policies present and correct on any new table (`pg_policies`); v2 routes no longer carry `enforceEmployeeDataScope`, so scoping must be in the query/RLS.
- Visibility mode (hierarchical vs shared) respected where `modulesettings` applies.

### Security
- No secrets in code — all via Doppler. JWTs never use fallback strings in prod.
- `validateAuthConfig()` still guards startup (`process.exit(1)` on weak/missing secrets).
- `COOKIE_DOMAIN` not hardcoded or dropped (cross-subdomain auth break).
- SQL injection in PEP NL→SQL paths and any `execute_sql` usage; parameterize.
- Twilio/Stripe webhook signature verification intact.
- `POST /api/users` password footgun: confirm intended `createUser` vs `inviteUserByEmail` branch.

### Performance
- N+1 across entities; Bull jobs not fan-out storming.
- Materialized views pre-aggregate each table before joining (no chained LEFT JOINs → cartesian products).
- Cache cold-marker set after mutations; TTLs honored (list 5s, detail 60s).
- CARE cooldown persisted to DB, not an in-memory Map (restart → CPU storm).
- Unbounded queries/loops; LLM calls routed to the right provider tier (Ollama vs Haiku vs Sonnet).

### Correctness
- Edge cases: empty/null tenant, missing employee↔user link, trial vs paid Stripe state.
- Migrations: named dollar-quotes (`$fn$`/`$policy$`), valid `CREATE TYPE` guard, applied dev-first then prod.
- Race conditions in Bull handlers; idempotency on retried jobs.
- Braid DSL tool schemas match registered tool signatures.

### Maintainability
- No one-time/ops scripts committed to the app codebase.
- Tests present (smoke test for frontend pages, `node --test` for backend lib) — flag any change shipping without them.

## Output

```markdown
## Code Review: PR #<n> — <title>

### Summary
[1-2 sentences: what changed, overall quality]

### Critical Issues
| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| 1 | path | L## | tenant filter missing on … | 🔴 Critical |

### Suggestions
| # | File | Line | Suggestion | Category |
|---|------|------|------------|----------|

### Test Coverage
[What's tested, what's missing, exact test to add]

### What Looks Good
- …

### Verdict
[Approve / Request Changes / Needs Discussion]
```

## Connectors

- **GitHub (`gh`):** `gh pr diff`, `gh pr checks`; on requested fixes, reply on the review thread via `gh api .../pulls/{pr}/comments/{id}/replies -X POST -F body=@file.md`.
- **Supabase MCP:** `get_advisors` for security/performance lint on touched tables; `pg_policies`/`information_schema` to verify schema claims.
- **Linear:** confirm the PR addresses the linked issue's acceptance criteria.

## Tips
1. Name the risk surface — "touches tenant data" / "hot path" / "handles PII" focuses the review.
2. Migrations: confirm dev-first application and both-project parity before approving.
3. Never approve a feature PR with no accompanying tests.
