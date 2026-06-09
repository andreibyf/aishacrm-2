---
name: testing-strategy
description: Design test strategies and write test cases for AiSHA CRM. Trigger with "how should we test", "test plan", "write tests for", or any new development — tests are required for every change. Covers Vitest frontend smoke tests, backend node --test, Bull jobs, multi-tenant isolation, and migrations.
---

# Testing Strategy (AiSHA CRM)

> Stack, connectors, and conventions: see [AISHA_CONTEXT.md](../AISHA_CONTEXT.md).

Design tests and produce concrete, runnable test cases. **Every development ships with tests** — this skill always ends with the actual test files to add, not a suggestion to add them.

## Test types & exact harness

| Area | Type | How to run | Location / naming |
|------|------|-----------|-------------------|
| Frontend pages/components | Vitest smoke | `npx vitest run` | `src/pages/__tests__/*.smoke.test.{jsx,tsx}` |
| Backend lib/logic | `node --test` | `docker compose exec backend node --test lib/path/to/file.test.js` (no `backend/` prefix inside container) | colocated `*.test.js` |
| Multi-tenant isolation | integration | backend `node --test` | dedicated isolation test per entity |
| Bull jobs | integration | backend `node --test` | assert idempotency on retry |
| Migrations | verification SQL | Supabase MCP `execute_sql` on dev then prod | `information_schema` / `pg_policies` / `pg_proc` checks |

## Test data hygiene (mandatory)
- Build fixtures with the **`TestFactory`** pattern, tagging rows `is_test_data: true`.
- Cleanup hooks delete via **direct Supabase client**, never API DELETE routes (they require auth and fail silently).
- **Stripe CLI** runs OUTSIDE the repo dir (binary conflict in `node_modules/.bin`).

## What to cover (priority order)
1. **Tenant isolation** — a user from tenant A can never read/write tenant B; per-user cache keys don't leak across visibility scopes.
2. **Auth** — `validateAuthConfig()` exits on weak secrets; cookie set with `COOKIE_DOMAIN`; JWT has no fallback in prod.
3. **Business-critical paths** — entity CRUD across all 6 entities, assignment/team cascade, Stripe subscription lifecycle (trial→paid, seat overage), WhatsApp/Twilio webhook handling.
4. **Cache correctness** — cold-marker invalidation after mutation; correct TTL behavior.
5. **CARE / Bull** — cooldown read from DB sentinel, job idempotency, no fan-out storm.
6. **PEP** — NL→SQL produces parameterized, tenant-scoped SQL; IR compilation round-trips.
7. **Edge cases** — null/empty tenant, missing employee↔user link, `POST /api/users` password-present branch.

Skip: trivial getters, framework code, one-off scripts (which shouldn't be in the repo anyway).

## Output

```markdown
## Test Plan: <feature>

### Coverage map
| Behavior | Test type | File | Status |
|----------|-----------|------|--------|

### Test cases (full source)
[Complete, runnable test files — Vitest smoke and/or backend node --test —
using TestFactory + is_test_data, with cleanup hooks via direct client]

### Gaps in existing coverage
[Concrete list with the file each test belongs in]

### Run commands
[Exact commands for this change]
```

## Connectors
- **Supabase MCP:** seed/verify fixtures and migration assertions on both projects.
- **GitHub Actions:** ensure new tests run in CI before merge.

## Tips
1. Lead with the tenant-isolation test — it's the highest-risk failure mode in a multi-tenant CRM.
2. Co-locate backend tests and run them inside the container (path has no `backend/` prefix).
3. Tag every fixture `is_test_data: true` and clean up via the direct client.
