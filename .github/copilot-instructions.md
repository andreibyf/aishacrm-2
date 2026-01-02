# Copilot Instructions for Aisha CRM

## 🚨 DEPLOYMENT RULES (NON-NEGOTIABLE)

**CRITICAL - NO EXCEPTIONS:**

1. **NO GIT DEPLOYMENTS WITHOUT EXPRESS PERMISSION**
   - ❌ NEVER push commits without explicit user approval
   - ❌ NEVER create/push tags without explicit user approval
   - ❌ NEVER run `git push` or `git tag` autonomously
   - ✅ Stage changes with `git add` and show status ONLY
   - ✅ Wait for user to explicitly say "push" or "deploy"

2. **VERSION TAG VERIFICATION (MANDATORY)**
   - BEFORE pushing ANY tag, ALWAYS run: `git tag --list | tail -5`
   - Verify last version pushed (e.g., v3.3.5)
   - Propose next version (bugfix: +0.0.1, feature: +0.1.0)
   - Show user: "Last tag: v3.3.5 → Proposing: v3.3.6 (bugfix)"
   - Wait for confirmation before creating tag

3. **AI CODE MODIFICATIONS (SPECIAL RULES)**
   - BEFORE working on Developer AI code → **Read `docs/AI_ARCHITECTURE_DEVELOPER_AI.md`**
   - BEFORE working on AiSHA AI code → **Read `docs/AI_ARCHITECTURE_AISHA_AI.md`**
   - Follow conversation flow patterns documented in architecture files
   - Ensure follow-up suggestions are implemented per spec
   - Test tool chains with Developer AI before deploying

## ⚠️ Before Making ANY Changes

1. **Read `orchestra/PLAN.md`** - Only work on tasks marked "Active"
2. **Default mode is BUGFIX-FIRST** - No new features unless explicitly authorized
3. **Keep changes minimal and surgical** - See `orchestra/CONVENTIONS.md`
4. **AI Code Changes** - Consult AI architecture docs FIRST (see above)

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
- `users` table: `tenant_uuid` (UUID FK → `tenant(id)`)

**Rules for new code:**
1. **Always use `tenant_id` (UUID)** for queries, inserts, joins, RLS
2. **NEVER use deprecated columns:** `tenant_id_text` and `tenant_id_legacy` are deprecated and may be removed
3. **RLS policies** must use `tenant_uuid` from users table: `SELECT tenant_uuid FROM users WHERE id = auth.uid()`
4. **FKs reference `tenant(id)`** not `tenants` (table is singular)
5. **Index `tenant_id`** on any new table for RLS performance

**Migration status:**
- ✅ All application code uses `tenant_id` (UUID)
- ✅ Legacy columns made nullable (migrations 096, 099)
- ⏳ Pending: Index/RLS migration and final column cleanup (see `TENANT_ID_CLEANUP_PLAN.md`)

**Database modification rules:**
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

## 🔐 Doppler (Secrets Management)

**All environment variables are managed through Doppler** - never use `.env` files directly.

```bash
# Run any command with secrets injected
doppler run -- node script.js
doppler run -- npm test

# View available secrets
doppler run -- printenv | grep SUPABASE

# Key env var names
SUPABASE_URL              # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY # Service role key (not SUPABASE_SERVICE_KEY)
SUPABASE_ANON_KEY         # Anonymous/publishable key
DATABASE_URL              # Direct PostgreSQL connection string
```

**Important:** Docker containers get secrets via `docker-compose.yml` environment mapping, not Doppler directly.

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
SELECT * FROM accounts WHERE tenant_id_text = '6cb4c008-4847-426a-9a2e-918ad70e7b69';  -- Deprecated!

-- RLS Policy pattern (uses tenant_uuid from users table)
CREATE POLICY example_policy ON my_table
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid()));
```

### Timestamp Column Naming Patterns (CRITICAL)

**Three distinct patterns exist across the schema - routes must match exactly:**

| Pattern | Tables | Column Names | Migration Source |
|---------|--------|--------------|------------------|
| **Standard (majority)** | accounts, leads, contacts, opportunities, notifications, system_logs, employees, modulesettings | `created_at`, `updated_at` | [001_init.sql](backend/migrations/001_init.sql) |
| **AI conversations** | conversations, conversation_messages | `created_date`, `updated_date` | [014_conversations.sql](backend/migrations/014_conversations.sql) |
| **API keys (hybrid)** | apikey | `created_at` AND `created_date` (both!) | [003_create_apikey.sql](backend/migrations/003_create_apikey.sql) |

**Rules for route development:**
- ✅ Use `.order('created_at')` for standard tables
- ✅ Use `.order('created_date')` for conversations tables
- ✅ INSERT `{ created_at: nowIso }` for standard tables
- ✅ INSERT `{ created_date: nowIso, updated_date: nowIso }` for conversations
- ✅ INSERT `{ created_at: nowIso, created_date: nowIso }` for apikey table (intentional duplication)
- ❌ NEVER assume column names - verify against migration files first
- ❌ Column name mismatches cause 500 errors in production

**Example bugs prevented:**
- `activities` table has NO `updated_date` column (only `created_at`)
- `notifications` table uses `created_at` not `created_date`

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

## Test Structure

**Backend tests** are organized by feature in `backend/__tests__/`:

| Directory | Tests For |
|-----------|-----------|
| `__tests__/routes/` | Route handlers (accounts, leads, etc.) |
| `__tests__/ai/` | AI tools, suggestions, triggers |
| `__tests__/auth/` | Authentication middleware |
| `__tests__/phase3/` | AI autonomy features |
| `__tests__/integration/` | MCP, external integrations |
| `__tests__/system/` | Health checks, server startup |

**Frontend tests** use Vitest with files alongside source:
- `src/api/entities.test.js` → tests `src/api/entities.js`
- `src/ai/engine/*.test.ts` → tests AI engine modules

**Test framework:**
- Backend: Node.js built-in `node:test`
- Frontend: Vitest with jsdom

**Running tests:**
```bash
# Backend (run in Docker)
docker exec aishacrm-backend sh -c "cd /app/backend && node --test __tests__/**/*.test.js"

# Frontend
npm run test
```

## Key Files

| Purpose | Location |
|---------|----------|
| **AI Architecture - Developer AI** | `docs/AI_ARCHITECTURE_DEVELOPER_AI.md` ⚠️ **Required for AI code** |
| **AI Architecture - AiSHA** | `docs/AI_ARCHITECTURE_AISHA_AI.md` ⚠️ **Required for AI code** |
| API failover logic | `src/api/fallbackFunctions.js` |
| Backend routes | `backend/routes/*.js` (60+ files) |
| AI engine | `backend/lib/aiEngine/` |
| Braid SDK tools | `braid-llm-kit/` |
| Tenant middleware | `backend/middleware/validateTenant.js` |
| Docker config | `docker-compose.yml` |

**⚠️ CRITICAL: Before modifying AI code, read:**
- **Developer AI:** `docs/AI_ARCHITECTURE_DEVELOPER_AI.md`
- **AiSHA AI:** `docs/AI_ARCHITECTURE_AISHA_AI.md`

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

### AI Conversation Flow Requirements

**AiSHA AI (Customer-Facing):**
- **Session Entity Context:** MUST extract sessionEntities from req.body and inject into system prompt
- **Follow-Up Suggestions:** MUST provide 2-4 contextual suggestions after every response
- **Proactive Next Actions:** When user asks "what should I do next?", MUST call `suggest_next_actions` tool
- **Tool Flow:** See `docs/AI_ARCHITECTURE_AISHA_AI.md` for detailed conversation patterns

**Developer AI (Superadmin-Only):**
- **Tool Approval:** Destructive operations MUST request explicit user approval
- **Follow-Up Suggestions:** MUST provide 2-4 debugging/investigation suggestions after every response
- **Security:** NEVER read .env, NEVER execute unauthorized commands
- **Tool Flow:** See `docs/AI_ARCHITECTURE_DEVELOPER_AI.md` for detailed pattern

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
