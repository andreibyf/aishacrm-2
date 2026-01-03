# Copilot Instructions for AiSHA CRM

> **Version:** 3.0.x | December 2025 | AI-Native Executive Assistant CRM

---

## ✅ Test Coverage Matrix (Latest Verification)

| Test Suite | Category | Pass Rate | Status |
|---|---|---|---|
| **AI Tests** | AI/LLM/Memory | `221/221` | ✅ |
| **MCP Integration** | MCP/Braid | `58/58` | ✅ |
| **Accounts Routes** | CRUD | `11/11` | ✅ |
| **Activities Routes** | CRUD | `12/12` | ✅ |
| **Workflows Routes** | Automation | `10/10` | ✅ |
| **Production Endpoints** | Middleware | `3/3` | ✅ |
| | | **TOTAL:** | **325/325** ✅ |

**Test Coverage:**
```
████████████████████████████████████████ 325/325 (100%)
```

📋 **Last Tested:** January 3, 2026 — 13:30 UTC  
🔧 **Recent Fixes:** Logger import, port configuration, config defaults  
📊 **Database:** No regressions post-cleanup  

---

## 🚨 CRITICAL RULES (NO EXCEPTIONS)

### Deployment

1. **NO autonomous git operations:**
   - ❌ NEVER push commits without explicit user approval ("push"/"deploy")
   - ❌ NEVER create/push tags without verification
   - ✅ Stage with `git add`, show status, wait for confirmation
   - Before ANY tag: Run `git tag --list | tail -5` and propose next version

2. **AI Code Changes (MANDATORY):**
   - **BEFORE working on AiSHA AI** → Read `docs/AI_ARCHITECTURE_AISHA_AI.md`
   - **BEFORE working on Developer AI** → Read `docs/AI_ARCHITECTURE_DEVELOPER_AI.md`
   - Test tool chains before deploying

3. **Work Authorization:**
   - Read `orchestra/PLAN.md` — work only on "Active" tasks
   - **Default mode is BUGFIX-FIRST** — no new features unless authorized
   - Keep changes minimal/surgical — see `orchestra/CONVENTIONS.md`

---

## Architecture: The Big Picture

**AiSHA CRM** = React 18 (frontend, 4000) → Node 22 Express (backend, 4001) → Supabase PostgreSQL (RLS-enabled)

### Critical Architectural Decisions

1. **Automatic Failover:** `src/api/fallbackFunctions.js` switches cloud → local backend (5s timeout, 30s cache)
2. **UUID-First Multi-Tenancy:** All queries use `tenant_id` (UUID FK→`tenant(id)`). Legacy `tenant_id_text` deprecated.
3. **Braid SDK:** Custom DSL for AI-database interactions (60+ tools). Two execution modes:
   - In-process: `backend/lib/braidIntegration-v2.js` (primary, low latency)
   - Distributed MCP: `braid-mcp-node-server/` (scaling, parallelism)
4. **Multi-Provider AI Engine:** `backend/lib/aiEngine/` routes to OpenAI/Anthropic/Groq with failover
5. **V1 vs V2 Routes:** V2 (`/api/v2/*`) flattens metadata, AI-ready; V1 legacy only

### Directory Map

```
backend/
  ├── routes/              # Domain-specific routes (60+ files)
  ├── middleware/          # Auth, tenant validation, rate limiting
  ├── services/            # Business logic & Supabase queries
  ├── lib/aiEngine/        # Multi-provider LLM abstraction
  ├── lib/braidIntegration-v2.js  # Braid tool execution engine
  ├── migrations/          # SQL schema (001_init.sql, 014_conversations.sql, etc.)
  └── __tests__/           # Feature-organized tests

src/
  ├── api/fallbackFunctions.js  # ⚠️ CRITICAL: routes all API calls
  ├── components/          # React components
  ├── pages/              # Route-mapped pages
  ├── ai/                 # Chat sidebar, agents
  └── hooks/              # Custom React hooks

braid-llm-kit/examples/assistant/
  ├── accounts.braid      # Account CRUD
  ├── leads.braid         # Lead management
  ├── contacts.braid      # Contact CRUD
  ├── lifecycle.braid     # v3.0.0 promotion/conversion
  ├── conversations.braid # AI conversation tools
  └── workflows.braid     # Automation & agent delegation
```

---

## Schema & Database (CRITICAL)

### Tenant Isolation Pattern

```javascript
// ✅ CORRECT: UUID tenant_id with RLS
const { data } = await supabase
  .from('accounts')
  .select('*')
  .eq('tenant_id', req.tenant.id);  // req.tenant.id is UUID

// ❌ WRONG: Text slug or deprecated columns
.eq('tenant_id_text', 'my-tenant')   // Deprecated!
```

**RLS Policy Pattern:**
```sql
-- Uses tenant_uuid from users table, not text slug
CREATE POLICY select_own_tenant ON accounts
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid()));
```

### Timestamp Column Patterns (Schema-Critical)

**Three distinct patterns exist — routes MUST match exactly:**

| Pattern | Tables | Columns | Migration |
|---------|--------|---------|-----------|
| **Standard** | accounts, leads, contacts, opportunities, activities | `created_at`, `updated_at` | [001_init.sql](backend/migrations/001_init.sql) |
| **Conversations** | conversations, conversation_messages | `created_date`, `updated_date` | [014_conversations.sql](backend/migrations/014_conversations.sql) |
| **API Keys** | apikey | `created_at` + `created_date` (both!) | [003_create_apikey.sql](backend/migrations/003_create_apikey.sql) |

**Common Bugs Prevented:**
- `conversation_messages` has NO `updated_date` (only `created_date`)
- `activities` has `created_at` not `created_date`
- Column name mismatches cause 500 errors in production

**Rule:** Always verify migration file before using timestamp columns in routes.

### UUID-First Rules

1. **Always use `tenant_id` (UUID)** for queries, inserts, joins, RLS
2. **NEVER use deprecated:** `tenant_id_text`, `tenant_id_legacy` (may be removed)
3. **FKs reference** `tenant(id)` (table is singular, use UUID PK)
4. **Index `tenant_id`** on any new table for RLS performance

---

## Route Architecture

### V1 vs V2 API Routes

**Preference:** V2 for new features; V1 for legacy compatibility only

| Aspect | V1 | V2 |
|--------|----|----|
| Path | `/api/accounts` | `/api/v2/accounts` |
| Metadata | Nested JSON | Flattened fields (address_1, tags, etc.) |
| AI Context | Basic data | Includes `buildAccountAiContext()` |
| Use When | Legacy integrations | New features, AI integrations |

**Files:** `backend/routes/accounts.v2.js`, `backend/routes/leads.v2.js`, etc.

### Backend Supabase Pattern

```javascript
// Always use Supabase client, never raw pgPool
import { supabase } from '../services/supabaseClient.js';

const { data, error } = await supabase
  .from('accounts')
  .select('*')
  .eq('tenant_id', req.tenant.id)  // UUID tenant isolation
  .order('created_at', { ascending: false });

if (error) throw error;
return { success: true, data };
```

### Tenant Middleware

```javascript
import { validateTenantAccess } from '../middleware/validateTenant.js';
router.use(validateTenantAccess);  // Enforces tenant isolation on all routes
```

---

## Frontend API Pattern (CRITICAL)

**All frontend API calls MUST route through `src/api/fallbackFunctions.js`**

```javascript
// ✅ CORRECT: Uses automatic failover
import { createAccount, useApiManager } from '@/api/fallbackFunctions';
const account = await createAccount(accountData);

// Cache invalidation after mutations
const { clearCacheByKey } = useApiManager();
await deleteAccount(id);
clearCacheByKey("Account");  // Invalidates all Account cache

// ❌ WRONG: Direct fetch bypasses failover
const resp = await fetch('/api/accounts', { method: 'POST' }).then(r => r.json());
```

**Why?** Failover switches from Base44 cloud → local backend if unhealthy (5s timeout, 30s cache).

### Import Paths

- Use `@/` alias (resolves to `src/`) for all imports
- Debug logging: `if (import.meta.env.DEV) console.log(...)`

---

## Multi-Provider AI Engine

### Usage Pattern

```javascript
import { selectLLMConfigForTenant, resolveLLMApiKey, callLLMWithFailover } from '../lib/aiEngine/index.js';

// 1. Select provider+model for capability
const config = await selectLLMConfigForTenant('chat_tools', tenantId);
// Returns: { provider: 'openai', model: 'gpt-4o', failoverChain: ['openai', 'anthropic', 'groq'] }

// 2. Call with automatic failover (handles all provider differences)
const result = await callLLMWithFailover({ 
  messages, 
  capability: 'chat_tools',
  tenantId,
  temperature: 0.2 
});
```

**Capabilities:** `chat_tools`, `chat_light`, `json_strict`, `brain_read_only`, `brain_plan_actions`, `realtime_voice`

**Providers:** OpenAI (gpt-4o), Anthropic (claude-3-5-sonnet), Groq (llama-3.3-70b), local LLMs

**Per-Tenant Override:** Set `LLM_PROVIDER__TENANT_<id>=anthropic` in env to route specific tenant

---

## Braid SDK Integration

**Braid** is a domain-specific language for safe AI-database interactions. Unlike raw SQL (prone to LLM hallucination of destructive queries) or ORMs (no tenant isolation guarantees), Braid enforces:

**Why Braid Instead of Raw SQL/Schemas:**
- **Type-Safe Tool Definitions:** LLMs cannot hallucinate parameters; tool signatures are strict
- **Automatic Tenant Scoping:** Every operation is cryptographically bound to `tenant_id` — impossible for LLM to query another tenant
- **Effect Declarations:** Side effects (`!net`, `!fs`, `!clock`) are explicit in tool signature; LLM can't accidentally trigger external calls
- **Result Types:** `Result<T, E>` forces error handling; LLM must handle success/failure paths
- **Whitelist Enforcement:** Tools can only access pre-defined endpoints; no "creative" query construction
- **Compact Definitions:** 60+ tools fit in `braid-llm-kit/`, not thousands of JSON schemas

**Example Problem Solved:**
```braid
// ✅ SAFE: LLM cannot cross tenant boundaries, even if it tries
fn getAccountsByTenant(tenant: String, filter: String) -> Result<Account[], Error> !net {
  // tenant parameter is verified, type-checked, and automatically scoped
  // LLM cannot substitute a different tenant UUID
  let response = http.get("/api/v2/accounts", { tenant, filter });
  return match response { ... };
}

// ❌ UNSAFE (what Braid prevents): Raw tool with JSON schema
// LLM could call: GET /api/accounts?tenant_id=attacker-uuid&delete=true
```

### Key Braid Features

- **Type-Safe Parameters:** Prevents LLM hallucination
- **Automatic Tenant Injection:** Every operation scoped to current tenant
- **Effect Declarations:** `!net`, `!fs`, `!clock` make side effects explicit
- **Result Types:** `Result<T, E>` forces explicit error handling
- **Whitelist Enforcement:** Tools access only pre-approved endpoints

### Braid Tool Categories

- `accounts.braid` — Account CRUD operations
- `leads.braid` — Lead management and qualification
- `contacts.braid` — Contact CRUD operations
- `lifecycle.braid` — v3.0.0 promotion/conversion (BizDev→Lead→Contact+Account+Opportunity)
- `conversations.braid` — AI conversation persistence
- `workflows.braid` — Automation, delegation to named agents (Sales Manager, Customer Service)

**Execution Paths:**
1. **In-Process:** `backend/lib/braidIntegration-v2.js` (primary, low latency)
2. **Distributed MCP:** `braid-mcp-node-server/` (scaling, parallelism, Redis job queue)

---

## AI Agent Conversation Requirements

### AiSHA AI (Customer-Facing)

**Required Behaviors in `backend/routes/ai.js`:**

**Session Entity Injection (Line 491):**
```javascript
// Extract sessionEntities from request body
const { sessionEntities } = req.body;  // e.g., { lead_id, account_id, contact_id }

// Inject into system prompt to provide implicit context
const systemPrompt = `You are AiSHA, an Executive Assistant CRM agent.
Current session context: ${JSON.stringify(sessionEntities)}
Use this context to pre-fill related entity lookups.`;
```

**Context Loading (Line 1706):**
```javascript
// Load conversation history: last 50 messages from DB
const { data: historyRows } = await supabase
  .from('conversation_messages')
  .select('*')
  .eq('conversation_id', conversationId)
  .order('created_date', { ascending: true });

// Slice to last 10 for LLM context window (prevent token bloat)
const contextMessages = historyRows.slice(-10);

// Build messages array: [history + current user message]
const messages = [
  ...contextMessages.map(m => ({ role: m.role, content: m.content })),
  { role: 'user', content: userInput }
];
```

**Follow-Up Suggestions & Proactive Actions:**
- ✅ After every response, ALWAYS include 2-4 contextual follow-up suggestions (buttons/chips)
- ✅ When user asks "what should I do next?" or "what are my updates?", call `suggest_next_actions` Braid tool
- ✅ Tool returns prioritized actions (meetings, pending leads, follow-ups) based on timestamp and status
- ✅ Format suggestions as quick-reply buttons for mobile/chat UX

**Database Schema:**
- `conversations` — Multi-turn session container (tenant-isolated, `created_date`/`updated_date`)
- `conversation_messages` — Chat history (role: 'user'/'assistant', `created_date` only, NO `updated_date`)

**Common AiSHA Queries (for Decision Tree):**
- "What's on my agenda today?" → `suggest_next_actions` with filter `type='activity' AND date=TODAY`
- "Do I have any pending items?" → Filter for status='pending' or `due_date <= TODAY`
- "What are my updates since our last conversation?" → Query `created_date > last_message.created_date`

### Developer AI (Superadmin-Only)

- ✅ Request explicit approval for destructive operations (DELETE, UPDATE, schema changes)
- ✅ Provide 2-4 debugging/investigation suggestions after response
- ❌ NEVER read `.env` or execute unauthorized commands
- See `docs/AI_ARCHITECTURE_DEVELOPER_AI.md` for detailed tool patterns

---

## Docker & Environment

### Fixed Ports (Deployment Contract)

| Service | Host Port | Network |
|---------|-----------|---------|
| Frontend | 4000 | http://localhost:4000 |
| Backend | 4001 | http://localhost:4001 |
| Redis Memory | 6379 | Internal only |
| Redis Cache | 6380 | Internal only |

**Between containers:** Use service names (`redis`, `backend`), never `localhost`

### Development Commands

```bash
# Docker
docker compose up -d --build              # Start all services
docker compose up -d --build frontend     # Rebuild frontend only
docker logs aishacrm-backend -f           # Stream backend logs

# Testing
npm run test                              # Frontend tests (watch)
npm run test:run                          # Frontend tests (single run)
npm run test:e2e                          # Playwright E2E
docker exec aishacrm-backend npm test     # Backend tests

# Linting
npm run lint                              # Check
npm run lint:fix                          # Fix

# Database
cd backend && npm run seed                # Seed test data
doppler run -- node backend/run-sql.js    # Execute custom SQL

# AI tools
npm run braid:check                       # Validate Braid registry
npm run braid:sync                        # Sync Braid tools
```

### Doppler Secrets Management

**All environment variables managed through Doppler — never use `.env` directly:**

```bash
doppler run -- npm run build              # Build with secrets
doppler run -- npm test                   # Test with secrets
doppler run -- printenv | grep SUPABASE   # View secrets

# Key env var names
SUPABASE_URL              # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY # Service role key (NOT SUPABASE_SERVICE_KEY)
SUPABASE_ANON_KEY         # Anonymous/publishable key
DATABASE_URL              # Direct PostgreSQL connection
```

---

## Testing Patterns

### Backend Tests (`backend/__tests__/`)

Node.js built-in `node:test`, organized by feature. **Typical execution: 100ms-2 seconds per test** (timeouts prevent hangs, not time limits):

```bash
# Quick unit/validation tests (expected: <1s)
timeout 60 docker exec aishacrm-backend sh -c "cd /app/backend && node --test __tests__/validation/*.test.js"

# Individual route suite (expected: <2s)
timeout 120 docker exec aishacrm-backend sh -c "cd /app/backend && node --test __tests__/routes/accounts.test.js"

# AI integration tests (expected: <500ms)
timeout 60 docker exec aishacrm-backend sh -c "cd /app/backend && node --test __tests__/ai/entityContextExtraction.test.js"

# Full route suite (expected: ~30s)
timeout 180 docker exec aishacrm-backend sh -c "cd /app/backend && node --test __tests__/routes/*.test.js"

# All tests with CI/CD failure on first error
timeout 300 docker exec aishacrm-backend sh -c "cd /app/backend && node --test __tests__/**/*.test.js --bail"
```

**Timeout Strategy:**
- Timeouts prevent hanging tests (safety net, not performance limit)
- 60s: For quick tests (expect <1s actual)
- 120s: For individual route tests (expect <2s actual)
- 180s: For full suite (expect ~30s actual)
- If test hits timeout → something is wrong (likely network/DB connection issue)

**Directory Structure:**
- `__tests__/routes/` — Route handlers (accounts, leads, contacts, opportunities, activities)
- `__tests__/ai/` — AI tools, suggestions, triggers, context loading
- `__tests__/auth/` — Authentication middleware, tenant validation
- `__tests__/integration/` — MCP, Braid integration, external APIs
- `__tests__/system/` — Health checks, server startup, database migrations

**Test Pattern: Database Cleanup & Isolation**
```javascript
import { supabase } from '../services/supabaseClient.js';

// Before each test: create isolated test tenant
beforeEach(async () => {
  testTenant = await supabase.from('tenant').insert({
    tenant_id: `test-${Date.now()}`,
    id: crypto.randomUUID()
  }).select().single();
});

// After each test: clean up test data
afterEach(async () => {
  await supabase.from('tenant').delete().eq('id', testTenant.id);
  // Cascade deletes all related records via FK constraints
});
```

**Test Pattern: UUID Tenant Isolation**
```javascript
// Always mock req.tenant for routes
const mockReq = { tenant: { id: testTenant.id } };
const result = await routeHandler(mockReq, mockRes);

// Verify tenant_id in response matches test tenant
assert.strictEqual(result.data[0].tenant_id, testTenant.id);
```

**Test Pattern: Timestamp Columns (Schema-Dependent)**
```javascript
// For standard tables (accounts, leads, etc.) - use created_at
const result = await routeHandler({
  body: { name: 'Test' },
  tenant: { id: testTenant.id }
});
assert.ok(result.data.created_at);  // created_at, not created_date

// For conversation tables - use created_date
const convResult = await conversationHandler({
  body: { content: 'test' },
  tenant: { id: testTenant.id }
});
assert.ok(convResult.data.created_date);  // created_date, not created_at
```

### Frontend Tests (`src/**/*.test.js`)

Vitest with jsdom:

```bash
npm run test              # Watch mode
npm run test:run         # Single run
npm run test:ui          # Vitest UI
```

---

## Critical Anti-Patterns

| ❌ MISTAKE | ✅ CORRECT | WHY |
|-----------|-----------|-----|
| Query with text slug for `tenant_id` | Use UUID | RLS policies use UUID tenant_id |
| Use deprecated `tenant_id_text` | Use `tenant_id` (UUID) | Column may be removed |
| Use `localhost` between containers | Use service names | Docker network isolation |
| Run `npm run dev` in Docker | Use `docker compose up` | Vite on 4000, not 5173 |
| Assume all tables have `updated_date` | Check migration file first | Column naming varies |
| Push without user permission | Stage & wait for "push" | Deployment contract |
| Modify Supabase extensions | Use `CREATE EXTENSION IF NOT EXISTS` | Extensions only in schema `extensions` |
| Call API directly from frontend | Route through `fallbackFunctions.js` | Automatic failover enabled |

---

## Common Errors & Solutions

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid input syntax for type uuid` | Text slug used as UUID | Use `tenant.id` (UUID), not `tenant.tenant_id` (slug) |
| Backend exits immediately | ESM module error | See `backend/TROUBLESHOOTING_NODE_ESM.md` |
| CORS errors in browser | Wrong origin config | Check `ALLOWED_ORIGINS` in backend env |
| Stale data in UI | Cache not invalidated | Call `clearCacheByKey("Account")` after mutations |
| 500 error on `/api/accounts/create` | Wrong timestamp column | Check `created_at` vs `created_date` for table |

---

## Key Reference Files

| Purpose | Location |
|---------|----------|
| **AI Architecture - AiSHA** | `docs/AI_ARCHITECTURE_AISHA_AI.md` ⚠️ **Required** |
| **AI Architecture - Developer AI** | `docs/AI_ARCHITECTURE_DEVELOPER_AI.md` ⚠️ **Required** |
| **Active Work** | `orchestra/PLAN.md` |
| **Code Standards** | `orchestra/CONVENTIONS.md` |
| **Tenant Middleware** | `backend/middleware/validateTenant.js` |
| **API Failover** | `src/api/fallbackFunctions.js` |
| **Backend Routes** | `backend/routes/*.js` (60+ domain files) |
| **AI Engine** | `backend/lib/aiEngine/` (multi-provider LLM) |
| **Braid Integration** | `backend/lib/braidIntegration-v2.js` |
| **Braid Tools** | `braid-llm-kit/examples/assistant/*.braid` |
| **Docker Config** | `docker-compose.yml` |
| **Migrations** | `backend/migrations/` |

---

## Quick Decision Tree

**User asks: "What's on my agenda today?" / "Do I have pending items?" / "What are my updates?"**
- Route to AiSHA AI (not Developer AI)
- Extract `sessionEntities` (lead_id, account_id) from request context
- Trigger `suggest_next_actions` Braid tool with date/status filters
- Load conversation history (slice to last 10 messages)
- Provide 2-4 calendar/task follow-ups ("Schedule meeting?", "Follow up on lead?", etc.)

**Working on a bug?**
- Read `orchestra/PLAN.md` — is it marked "Active"?
- Read `orchestra/CONVENTIONS.md` — keep it minimal/surgical
- Check `backend/migrations/*.sql` for schema before querying
- After changes: Run tests with quick timeouts:
  ```bash
  timeout 120 docker exec aishacrm-backend sh -c "cd /app/backend && node --test __tests__/routes/*.test.js"
  ```
  (Most tests finish in <2 seconds; timeout is safety valve only)

**Working on AI code?**
- Read `docs/AI_ARCHITECTURE_AISHA_AI.md` or `docs/AI_ARCHITECTURE_DEVELOPER_AI.md`
- Check `backend/lib/braidIntegration-v2.js` for tool execution pattern
- Verify 2-4 follow-up suggestions are implemented
- Test Braid tools with Developer AI before deploying

**Adding an API endpoint?**
- Use V2 route (`/api/v2/*`) for new features
- Always use `req.tenant.id` (UUID) for queries
- Check migration for timestamp column names (`created_at` vs `created_date`)
- Add tests in `backend/__tests__/routes/` with tenant isolation patterns
- Add to Braid tools in `braid-llm-kit/examples/assistant/` if AI-facing

**Frontend change?**
- Use `@/` import alias
- Route API calls through `src/api/fallbackFunctions.js`
- Invalidate cache with `clearCacheByKey()` after mutations
- Use React 18 + Vite conventions
- Test with `npm run test:e2e` for critical flows

---

**Detailed Docs:** `README.md`, `CLAUDE.md`, `docs/AISHA_CRM_DEVELOPER_MANUAL.md`  
**Deployment:** Automated via GitHub Actions → GHCR → VPS (version tag → production)
