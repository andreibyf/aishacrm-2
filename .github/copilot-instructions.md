# Copilot Instructions for AiSHA CRM

> **v3.0.x** | AI-Native Executive Assistant CRM | React 18 + Node 22 + Supabase

## 🚨 Critical Rules

1. **No autonomous git push/tag** — stage changes, wait for explicit "push" approval
2. **Regression testing required** — run `docker exec aishacrm-backend npm test` after ANY change; verify nothing broke
3. **Tests for new features** — every new feature/endpoint MUST include tests in `backend/__tests__/` or `src/**/*.test.js`
4. **Bugfix-first mode** — check [orchestra/PLAN.md](../orchestra/PLAN.md) for active tasks
5. **Before AI changes** — read `docs/AI_ARCHITECTURE_AISHA_AI.md` or `docs/AI_ARCHITECTURE_DEVELOPER_AI.md`

## Architecture Overview

```
React (4000) → Express (4001) → Supabase PostgreSQL (RLS)
                    ↓
           Braid SDK (60+ AI tools)
```

**Key patterns:**
- **Multi-tenancy**: Always use `req.tenant.id` (UUID), never `tenant_id_text`
- **Frontend API**: Route ALL calls through [src/api/fallbackFunctions.js](../src/api/fallbackFunctions.js) (circuit breaker + failover)
- **AI Engine**: [backend/lib/aiEngine/](../backend/lib/aiEngine/) → OpenAI/Anthropic/Groq with automatic failover
- **Braid tools**: [braid-llm-kit/examples/assistant/*.braid](../braid-llm-kit/examples/assistant/) — type-safe AI-database operations

## Database Rules

```javascript
// ✅ CORRECT: UUID tenant isolation
const { data } = await supabase.from('accounts').select('*').eq('tenant_id', req.tenant.id);

// ❌ WRONG: deprecated text slug
.eq('tenant_id_text', 'slug')  // Never use!
```

**Timestamp columns vary by table** — verify in [backend/migrations/](../backend/migrations/):
- Standard tables: `created_at`, `updated_at`
- Conversations: `created_date`, `updated_date` (messages have NO `updated_date`)

## Routes: V1 vs V2

| V1 `/api/accounts` | V2 `/api/v2/accounts` |
|---|---|
| Nested metadata | Flattened fields |
| Legacy only | **New features here** |

## Development Commands

```bash
docker compose up -d --build                     # Start all
docker exec aishacrm-backend npm test            # Backend tests
npm run test:e2e                                 # Playwright E2E
doppler run -- node backend/run-sql.js           # Run SQL with secrets
```

**Ports:** Frontend=4000, Backend=4001, Redis Memory=6379, Redis Cache=6380

## Common Pitfalls

| Error | Fix |
|-------|-----|
| `invalid input syntax for type uuid` | Use `tenant.id` (UUID), not `tenant.tenant_id` (slug) |
| Stale UI data | Call `clearCacheByKey("Entity")` after mutations |
| 500 on timestamp | Check migration for `created_at` vs `created_date` |

## Key Files

| Purpose | Location |
|---------|----------|
| API failover | [src/api/fallbackFunctions.js](../src/api/fallbackFunctions.js) |
| Tenant middleware | [backend/middleware/validateTenant.js](../backend/middleware/validateTenant.js) |
| AI tools (Braid) | [braid-llm-kit/examples/assistant/](../braid-llm-kit/examples/assistant/) |
| Work queue | [orchestra/PLAN.md](../orchestra/PLAN.md) |

See [CLAUDE.md](../CLAUDE.md) for extended documentation.
