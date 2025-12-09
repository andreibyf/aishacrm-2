# Copilot Instructions for Aisha CRM

## ⚠️ Before Making ANY Changes

1. **Read `orchestra/PLAN.md`** - Only work on tasks marked "Active"
2. **Default mode is BUGFIX-FIRST** - No new features unless explicitly authorized
3. **Keep changes minimal and surgical** - See `orchestra/CONVENTIONS.md`

## Architecture Overview

**Aisha CRM** = React 18 + Vite frontend → Node.js 22 Express backend → Supabase PostgreSQL

```
Frontend (4000)  →  Backend (4001)  →  Supabase (RLS enabled)
     ↓                   ↓
src/api/          backend/routes/     50+ tables, UUID PKs
fallbackFunctions.js   (60+ route files)
```

### Key Architectural Decisions
- **Automatic Failover:** `src/api/fallbackFunctions.js` switches from Base44 cloud → local backend if unhealthy (5s timeout, 30s cache)
- **UUID-First Multi-Tenancy:** Always use `tenant_id` (UUID) for foreign keys and RLS, referencing `tenant(id)`. Legacy `tenant_id_text` is deprecated.
- **Dual Redis:** Memory (6379) for ephemeral/sessions, Cache (6380) for persistent/aggregations
- **Braid SDK:** 27+ AI tools in `braid-llm-kit/` with MCP server integration
- **Multi-Provider AI Engine:** `backend/lib/aiEngine/` with automatic failover (OpenAI → Anthropic → Groq)

### Tenant UUID Migration (CRITICAL)

**Schema overview:**
- `tenant` table: `id` (UUID PK), `tenant_id` (TEXT unique slug for legacy/human-readable)
- Domain tables (`accounts`, `contacts`, `leads`, etc.): `tenant_id` (UUID FK → `tenant(id)`)
- `users` table: `tenant_uuid` (UUID FK → `tenant(id)`), legacy `tenant_id` (TEXT) still present

**Rules for new code:**
1. **Always use `tenant_id` (UUID)** for queries, inserts, joins, RLS
2. **Never use `tenant_id_text`** - it's deprecated and read-only
3. **RLS policies** must use `tenant_uuid` from users table: `SELECT tenant_uuid FROM users WHERE id = auth.uid()`
4. **FKs reference `tenant(id)`** not `tenants` (table is singular)
5. **Index `tenant_id`** on any new table for RLS performance

**Migration rules:**
- Do NOT drop columns until confirmed cutover
- Add/keep indexes on `tenant_id` used by RLS and joins
- Create policies using `tenant_id` (UUID) and auth context
- Avoid DROP/ALTER of extensions; only `CREATE EXTENSION IF NOT EXISTS` in schema `extensions`

### API Route Versioning (V1 vs V2)
Routes have two versions - **prefer V2 for new development:**

| Version | Path | Purpose | When to Use |
|---------|------|---------|-------------|
| **V2** | `/api/v2/accounts` | AI Agent-ready, flattened metadata | ✅ New features, AI integrations |
| **V1** | `/api/accounts` | Legacy compatibility | Fallback only, existing integrations |

**V2 differences:**
- Flattens `metadata` JSON into top-level fields (address_1, tags, etc.)
- Includes `buildAccountAiContext()` for AI agent consumption
- Streamlined response shape for autonomous AI actions

**Files:** `accounts.v2.js`, `leads.v2.js`, `contacts.v2.js`, `opportunities.v2.js`, `activities.v2.js`

## 🐳 Docker Environment (CRITICAL)

**Ports are FIXED - do not change:**
| Service | Host Port | Access |
|---------|-----------|--------|
| Frontend | 4000 | http://localhost:4000 |
| Backend | 4001 | http://localhost:4001 |

```bash
# Development
docker compose up -d --build          # Start all
docker compose up -d --build frontend # Rebuild frontend only
docker logs aishacrm-backend -f       # Debug backend

# Inter-container: use service names (redis, backend), not localhost
```

**Common mistakes:**
- ❌ Assuming Vite runs on 5173 (it's 4000 in Docker)
- ❌ Using `localhost` between containers (use service names)
- ❌ Suggesting `npm run dev` without Docker context

## Production Deployment

**FULLY AUTOMATED - never suggest `git pull` on production:**
1. Push version tag: `git push origin v1.0.76`
2. GitHub Actions builds + pushes to GHCR
3. Workflow SSHs to VPS, deploys new images

Production server has NO source code, only `docker-compose.prod.yml` + `.env`.

## Code Patterns

### Frontend
```javascript
// Always use @/ alias (resolves to src/)
import { Component } from '@/components/shared/Component';

// API calls go through fallbackFunctions
import { createAccount } from '@/api/fallbackFunctions';

// Debug logging
if (import.meta.env.DEV) console.log('debug info');

// Cache invalidation after mutations
const { clearCacheByKey } = useApiManager();
await deleteAccount(id);
clearCacheByKey("Account");
```

### Backend
```javascript
// All routes use Supabase client, never raw pgPool
const { data, error } = await supabase
  .from('accounts')
  .select('*')
  .eq('tenant_id', req.tenant.id);  // Always UUID!

// Middleware for tenant isolation
import { validateTenantAccess } from '../middleware/validateTenant.js';
router.use(validateTenantAccess);
```

### Database (UUID Critical!)
```sql
-- CORRECT: Use UUID tenant_id for all queries
SELECT * FROM accounts WHERE tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

-- CORRECT: Join through tenant table
SELECT a.* FROM accounts a
JOIN tenant t ON a.tenant_id = t.id
WHERE t.tenant_id = 'my-tenant-slug';  -- tenant.tenant_id is the TEXT slug

-- WRONG: Never use deprecated tenant_id_text
SELECT * FROM accounts WHERE tenant_id_text = 'local-tenant-001';  -- Deprecated!

-- RLS Policy pattern (uses tenant_uuid from users table)
CREATE POLICY example_policy ON my_table
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid()));
```

## Essential Commands

```bash
# Docker workflows
docker compose up -d --build      # Start/rebuild
docker ps                         # Check status
docker logs aishacrm-backend -f   # Debug

# Testing
npm run lint                      # Frontend linting
cd backend && npm test            # Backend tests
npm run test:e2e                  # Playwright E2E

# Database
cd backend && npm run seed        # Seed data
# Migrations in backend/migrations/
```

## Key Files

| Purpose | Location |
|---------|----------|
| API failover logic | `src/api/fallbackFunctions.js` |
| Backend routes | `backend/routes/*.js` (60+ files) |
| AI engine | `backend/lib/aiEngine/` |
| Braid SDK tools | `braid-llm-kit/` |
| Tenant middleware | `backend/middleware/validateTenant.js` |
| Docker config | `docker-compose.yml` |

## AI Engine (Multi-Provider LLM)

The `backend/lib/aiEngine/` provides unified AI infrastructure with automatic failover:

```javascript
import { selectLLMConfigForTenant, resolveLLMApiKey, callLLMWithFailover } from '../lib/aiEngine/index.js';

// 1. Get provider+model for a capability
const config = await selectLLMConfigForTenant('chat_tools', tenantId);
// → { provider: 'openai', model: 'gpt-4o', failoverChain: ['openai', 'anthropic', 'groq'] }

// 2. Resolve API key (tenant → user → system → env)
const apiKey = await resolveLLMApiKey({ tenantSlugOrId, provider: config.provider });

// 3. Call with automatic failover
const result = await callLLMWithFailover({ messages, capability: 'chat_tools', tenantId });
```

**Capabilities:** `chat_tools`, `chat_light`, `json_strict`, `brain_read_only`, `brain_plan_actions`, `realtime_voice`

**Providers:** OpenAI (gpt-4o), Anthropic (claude-3-5-sonnet), Groq (llama-3.3-70b), Local LLMs

**Per-tenant override:** Set `LLM_PROVIDER__TENANT_<id>=anthropic` in env to route specific tenants

## Common Issues

| Problem | Solution |
|---------|----------|
| `invalid input syntax for type uuid` | Using text slug instead of UUID for tenant_id |
| Backend exits immediately | ESM error - see `backend/TROUBLESHOOTING_NODE_ESM.md` |
| CORS errors | Check `ALLOWED_ORIGINS` in `backend/.env` |
| Stale frontend data | Call `clearCacheByKey()` after mutations |

---
**Detailed docs:** `README.md`, `CLAUDE.md`, `docs/AISHA_CRM_DEVELOPER_MANUAL.md`
