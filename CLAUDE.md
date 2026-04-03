# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AiSHA CRM** is an AI-native Executive Assistant CRM system built with React + Vite frontend and Node.js backend. The AI capabilities are powered by **Braid** — a custom domain-specific language created specifically for secure AI-database interactions.

**Current Version:** 3.0.x (December 2025)

**Production VPS:** `ssh andreibyf@147.189.173.237`

### Key Architecture

| Component      | Technology                                                |
| -------------- | --------------------------------------------------------- |
| **Frontend**   | React 18 + Vite, TailwindCSS, shadcn/ui                   |
| **Backend**    | Node.js 22 + Express, 210+ API endpoints                  |
| **Database**   | PostgreSQL 17+ on Supabase, 88 tables with RLS            |
| **AI Tools**   | Braid DSL (126 tools across 24 files in `braid-llm-kit/`) |
| **AI Engine**  | Multi-provider failover: OpenAI, Anthropic, Groq, Local   |
| **Secrets**    | Doppler for production, `.env` for local                  |
| **Caching**    | Redis (memory layer + cache layer)                        |
| **Containers** | Docker Compose with health checks                         |

---

## 📚 Documentation

| Document                                                                                                   | Description                                                             |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [COPILOT_PLAYBOOK.md](./docs/developer-docs/COPILOT_PLAYBOOK.md)                                           | **⭐ START HERE** - Operations guide, testing, migrations               |
| [Intel-iGPU-Local-AI-Development-Guide.md](./docs/developer-docs/Intel-iGPU-Local-AI-Development-Guide.md) | **Local AI Setup** - Twinny with Intel GPU                              |
| [USER_GUIDE.md](./docs/user-guides/USER_GUIDE.md)                                                          | End-user guide for CRM operations                                       |
| [ADMIN_GUIDE.md](./docs/admin-guides/ADMIN_GUIDE.md)                                                       | System administration, deployment                                       |
| [AI_ASSISTANT_GUIDE.md](./docs/user-guides/AI_ASSISTANT_GUIDE.md)                                          | AiSHA AI assistant features                                             |
| [CARE_SETUP_GUIDE.md](./docs/user-guides/CARE_SETUP_GUIDE.md)                                              | **C.A.R.E.** configuration (UI-driven via Workflow Builder)             |
| [DEVELOPER_MANUAL.md](./docs/developer-docs/DEVELOPER_MANUAL.md)                                           | Development setup, architecture                                         |
| [DATABASE_GUIDE.md](./docs/developer-docs/DATABASE_GUIDE.md)                                               | Database schema, migrations, **trigger patterns**                       |
| [SECURITY_GUIDE.md](./docs/admin-guides/SECURITY_GUIDE.md)                                                 | Security, RLS, authentication                                           |
| [BRANDING_GUIDE.md](./docs/references/BRANDING_GUIDE.md)                                                   | Brand assets, colors                                                    |
| [DATABASE_REFERENCE.md](./docs/reference/DATABASE_REFERENCE.md)                                            | **⭐ LIVE REFERENCE** — All tables, columns, RLS policies (prod vs dev) |

**⚠️ IMPORTANT**: Before making ANY changes, read [COPILOT_PLAYBOOK.md](./docs/developer-docs/COPILOT_PLAYBOOK.md) for operational procedures, migration workflows, and critical lessons learned.

Legacy documentation is archived in `docs/archive/`.

---

## 📋 Reference Documents (Check First)

Before running any Supabase queries or making schema-related decisions, **always check the reference documents first**:

| Reference           | Location                               | What to check                                 |
| ------------------- | -------------------------------------- | --------------------------------------------- |
| **Database schema** | `docs/reference/DATABASE_REFERENCE.md` | Tables, columns, RLS policies, prod/dev diffs |

**Rules for reference documents:**

1. **Read before querying** — If the answer is in a reference doc, use it. Only hit the DB if the info is missing or you suspect it's stale.
2. **Update after changes** — Any migration, new table, column add/drop, or RLS policy change must be reflected in the reference doc in the same session.
3. **Annotate diffs** — When prod and dev diverge, document it in the reference doc's diff table.

---

## 📝 CHANGELOG Rules (Mandatory)

**Every session that modifies code or config must update `CHANGELOG.md` before the work is committed.**

Rules:

- Add an entry under `## [Unreleased]` or create a new versioned section if releasing
- Format: `### Added / Changed / Fixed / Removed / Security`
- Be specific: include file names, what changed, and why
- Do NOT skip this step even for "small" changes

---

## 🤖 Local AI Development Tools

**Twinny** (`rjmacarthy.twinny`)

- Fast inline code completions (FIM) via `deepseek-coder:1.3b`
- Real-time code chat via `qwen2.5-coder:3b`
- 100% local, zero telemetry, complete privacy
- Optimized for Intel iGPU acceleration via IPEX-LLM Ollama

**Configuration:**

- `.vscode/settings.json` - Workspace AI settings
- Ollama server on `http://localhost:11434` (Intel GPU)

**Setup Guide:** See [docs/Intel-iGPU-Local-AI-Development-Guide.md](./docs/Intel-iGPU-Local-AI-Development-Guide.md)

---

## Essential Commands

### Development

```bash
# Frontend development (Vite HMR on port 5173)
npm run dev

# Backend development (nodemon auto-restart on port 3001)
cd backend && npm run dev

# Run both frontend and backend together
npm run dev & cd backend && npm run dev
```

### Docker

```bash
# Start all services (recommended for production-like testing)
docker compose up -d --build

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Restart a single service
docker compose restart backend

# Stop all services
docker compose down

# Check service health
curl http://localhost:4001/api/system/health
```

### Testing

```bash
# Frontend unit tests (Vitest)
npm run test              # Run in watch mode
npm run test:run          # Run once
npm run test:ui           # Open Vitest UI
npm run test:quick        # Run with early exit on failure
npm run test:file <path>  # Run specific test file

# Backend tests (Node.js native test runner)
cd backend && npm test                    # All tests
cd backend && npm run test:routes         # Route tests only
cd backend && npm run test:auth           # Auth tests only
cd backend && npm run test:integration    # Integration tests

# E2E tests (Playwright)
npm run test:e2e          # Run all E2E tests
npm run test:e2e:ui       # Open Playwright UI
npm run test:e2e:debug    # Debug mode
npm run test:e2e:report   # View test report

# Regression testing (critical after any change)
docker exec aishacrm-backend npm test
```

### Code Quality

```bash
npm run lint              # Run ESLint
npm run lint:fix          # Auto-fix lint issues
npm run format            # Format with Prettier
npm run format:check      # Check formatting
```

### Braid Tools

```bash
# Verify Braid tool registry is in sync
npm run braid:check

# Sync registry with .braid files
npm run braid:sync

# Generate fresh registry
npm run braid:generate

# Start Braid MCP server (distributed mode)
npm run serve:braid
# OR manually:
docker compose -f ./braid-mcp-node-server/docker-compose.yml up --build
```

### Database

```bash
# Execute SQL file with Doppler secrets
npm run db:exec -- <path-to-sql-file>

# Check database indexes
npm run db:check:idx

# Examples:
npm run db:check:idx:leads
npm run db:show:idx:leads
```

---

## 🧠 Braid: AI-Native Database Language

**Braid** is the custom DSL that powers all AI tool execution in AiSHA. It was created to solve the fundamental challenge of giving AI assistants safe, structured access to production databases.

### Why Braid Exists

- **Raw SQL is dangerous**: LLMs can hallucinate destructive queries
- **ORM wrappers are leaky**: No tenant isolation guarantees
- **JSON schemas are verbose**: Tool definitions become unwieldy at scale

### Braid Tool Locations

```
braid-llm-kit/examples/assistant/  # All Braid tool definitions
├── accounts.braid                 # Account CRUD
├── activities.braid               # Calendar/tasks
├── bizdev-sources.braid           # BizDev sources
├── contacts.braid                 # Contact CRUD
├── leads.braid                    # Lead management
├── lifecycle.braid                # v3.0.0 promotion/conversion
├── navigation.braid               # CRM page navigation
├── notes.braid                    # Note management
├── opportunities.braid            # Sales pipeline
├── snapshot.braid                 # Tenant data overview
├── suggestions.braid              # AI suggestions
├── telephony.braid                # AI calling
├── web-research.braid             # External research
└── workflows.braid                # Workflow automation
```

### Dual Execution Modes

1. **In-Process (Primary)**: Tools execute via `backend/lib/braidIntegration-v2.js`
   - Used for AiSHA chat interface
   - Low latency, synchronous
   - Default for development

2. **Distributed MCP**: Tools execute via `braid-mcp-node-server/` over HTTP
   - Used for external integrations, scaling
   - Redis job queue for high concurrency
   - Requires separate Docker deployment

### Key Braid Files

- `backend/lib/braidIntegration-v2.js` — Tool registry, system prompt (via `getBraidSystemPrompt()` for dynamic dates), execution
- `backend/lib/entityLabelInjector.js` — Custom entity terminology
- `backend/lib/tenantContextDictionary.js` — Tenant context for AI
- `backend/routes/ai.js` — AI chat endpoint (lines 491, 1706 load context)

### When to Modify Braid Tools

**Modify .braid files when:**

- Adding new AI tool capabilities (new CRUD operations, searches, etc.)
- Changing tool parameters or return types
- Adding new entity types for AI to manage

**Modify backend integration when:**

- Changing how tools are loaded or registered
- Adding new system prompts or context (use `getBraidSystemPrompt()` for dynamic content)
- Implementing new MCP server features
- Debugging tool execution or error handling

After modifying `.braid` files, always run `npm run braid:sync` to update the registry.

---

## v3.0.0 CRM Lifecycle

The normalized promotion/conversion workflow:

```
BizDev Source → promote → Lead → qualify → Lead (qualified) → convert → Contact + Account + Opportunity
```

### Key Endpoints

- `POST /api/bizdevsources/:id/promote` — BizDev → Lead
- `PUT /api/v2/leads/:id` — Qualify lead (status=qualified)
- `POST /api/leads/:id/convert` — Lead → Contact + Account + Opportunity

### Braid Tools

- `advanceToLead()` — lifecycle.braid
- `advanceToQualified()` — lifecycle.braid
- `advanceToAccount()` — lifecycle.braid

---

## Critical Environment Rules

### Windows PowerShell Development

**MANDATORY:** This repository is developed on Windows. Always verify your location before running commands:

```powershell
# Verify location before ANY command
Get-Location

# Navigate if needed
cd C:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53
```

### Docker vs Local Development

| Mode          | Frontend              | Backend               |
| ------------- | --------------------- | --------------------- |
| **Local Dev** | http://localhost:5173 | http://localhost:3001 |
| **Docker**    | http://localhost:4000 | http://localhost:4001 |

**Local Dev Mode (faster iteration):**

```bash
npm run dev                    # Frontend (port 5173)
cd backend && npm run dev      # Backend (port 3001)
```

**Docker Mode (production-like):**

```bash
docker compose up -d --build
```

**Doppler Integration:**

- Production uses `doppler run --` prefix for secret injection
- Local development uses `.env` and `backend/.env` files
- Docker uses `.env.local` with DOPPLER_TOKEN

---

## AI Engine Architecture

**Location:** `backend/lib/aiEngine/`

### Multi-Provider Failover

The AI Engine supports automatic failover between multiple LLM providers:

**Exports:**

- `selectLLMConfigForTenant(tenantId, capability)` — Get provider/model for tenant
- `resolveLLMApiKey(provider, tenantId)` — Resolve API key hierarchy
- `generateChatCompletion(messages, tools, config)` — Call LLM with failover

**Providers:**

- OpenAI (gpt-4o, gpt-4o-mini)
- Anthropic (claude-3-5-sonnet, claude-3-5-haiku)
- Groq (llama-3.3-70b)
- Local LLMs (ollama, lmstudio)

**Capability-Based Routing:**

- `chat_tools` — Full tool use support
- `json_strict` — Structured JSON output
- `brain_read_only` — Read-only operations
- `brain_plan_actions` — Planning and orchestration

**Per-Tenant Configuration:**
Override provider/model via environment variables:

```bash
LLM_PROVIDER__TENANT_<UUID>=anthropic
LLM_MODEL__TENANT_<UUID>=claude-3-5-sonnet-20241022
```

---

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # UI components by domain
│   │   ├── ai/             # AI assistant components
│   │   ├── dashboard/      # Dashboard widgets
│   │   └── shared/         # Reusable components
│   ├── pages/              # Page-level components
│   ├── hooks/              # Custom React hooks
│   └── api/                # API client with failover
├── backend/                # Node.js API server
│   ├── routes/             # Express routes (28 categories)
│   ├── lib/                # Core libraries
│   │   ├── aiEngine/       # Multi-provider LLM engine
│   │   ├── braidIntegration-v2.js
│   │   ├── entityLabelInjector.js
│   │   └── tenantContextDictionary.js
│   ├── middleware/         # Auth, tenant, rate limiting
│   ├── migrations/         # Database migrations
│   └── __tests__/          # Backend tests
├── braid-llm-kit/          # Braid DSL tools
│   └── examples/assistant/ # AI tool definitions
├── braid-mcp-node-server/  # Distributed MCP server
├── docs/                   # Documentation (7 core guides)
├── orchestra/              # AI development control layer
│   ├── PLAN.md             # Active task queue
│   ├── ARCHITECTURE.md     # Wave-orchestra model
│   ├── CONVENTIONS.md      # Change policy and rules
│   └── context/            # Interface definitions
├── scripts/                # Utility scripts
└── docker-compose.yml      # Container orchestration
```

---

## Backend Route Organization

**Core CRM:**

- `accounts.js`, `contacts.js`, `leads.js`, `opportunities.js`
- `activities.js`, `notes.js`, `bizdevsources.js`

**AI & Automation:**

- `ai.js` — AI chat, summarization, tools (loads Braid context at lines 491, 1706)
- `aicampaigns.js` — AI campaigns
- `workflows.js` — Workflow automation

**System:**

- `system.js` — Health checks, diagnostics
- `reports.js` — Dashboard stats
- `tenants.js`, `users.js`, `permissions.js`

---

## Security & Performance

**Security:**

- Row-Level Security (RLS) on all tables
- JWT authentication via Supabase Auth
- Helmet.js security headers
- Rate limiting (100 req/min per IP/user)
- Tenant isolation via UUID (never use `tenant_id_text`)

**Performance:**

- Redis caching (memory + cache layers)
  - `REDIS_MEMORY_URL` (port 6379) — ephemeral: presence, session, real-time
  - `REDIS_CACHE_URL` (port 6380) — persistent: stats, aggregations, response caches
- Tenant context dictionary caching
- Dashboard bundle RPC for single-query stats
- Circuit breaker pattern in frontend API (`src/api/fallbackFunctions.js`)

---

## Common Pitfalls & Debugging

### Backend Not Restarting

1. Use `npm run dev` (not `npm start`) — dev mode uses nodemon
2. Check terminal for errors
3. Manual restart: `Ctrl+C` then `npm run dev`

### Frontend Not Updating

1. Check browser console for errors
2. Hard refresh: `Ctrl+Shift+R`
3. Clear Vite cache: Delete `.vite/` directory
4. Restart dev server

### Port Conflicts (Windows)

```powershell
# Find and kill process on port 3001
Get-NetTCPConnection -LocalPort 3001 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Find and kill process on port 5173
Get-NetTCPConnection -LocalPort 5173 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Docker Container Issues

```bash
# Check container status and health
docker compose ps

# View recent logs with errors
docker compose logs --tail=50 backend | grep -i error

# Check health endpoint
curl http://localhost:4001/api/system/health

# Rebuild specific service
docker compose up -d --build backend

# Full reset (nuclear option)
docker compose down -v
docker compose up -d --build
```

### Database Issues

**Common Errors:**

- `invalid input syntax for type uuid` → Use `req.tenant.id` (UUID), not `tenant.tenant_id` (slug)
- Timestamp errors → Check migration files: some tables use `created_at`/`updated_at`, others use `created_date`/`updated_date`
- RLS policy violations → Verify tenant isolation in queries

**Debugging:**

```bash
# Check database connection
docker exec aishacrm-backend node -e "const {supabase}=require('./lib/supabaseAdmin');supabase.from('tenants').select('count').then(console.log)"

# Run SQL diagnostics
npm run db:exec -- backend/migrations/checks/show_idx_leads_tenant_account.sql
```

### API Response Issues

- Stale UI data → Call `clearCacheByKey("EntityName")` after mutations
- Missing fields in response → Check backend serializers/DTOs match frontend expectations
- 500 errors → Check backend logs: `docker compose logs -f backend`

---

## Orchestra Control Layer (MANDATORY FOR AI)

Before modifying code, **always read**:

1. **`orchestra/PLAN.md`** — Current active goal/tasks
2. **`orchestra/ARCHITECTURE.md`** — Wave-orchestra model
3. **`orchestra/CONVENTIONS.md`** — Change policy and rules
4. **`orchestra/context/interfaces.md`** — Key contracts

### Rules

**Default Mode: BUGFIX-FIRST**

- Only work on tasks listed as **Active** in `PLAN.md`
- No new features unless explicitly marked
- Keep changes small and localized
- Prefer minimal patches over broad refactors

**Allowed Exceptions (Security/Stability/Performance):**
Larger rewrites only if **required** for:

- Security: auth, access control, sensitive data handling
- Stability: recurrent crashes, corrupt state
- Performance: existing design cannot meet latency/throughput
- Resource efficiency: race conditions, deadlocks, pathological resource usage

**Constraints:**

- Preserve Docker ports (4000/4001)
- Preserve Supabase setup and RLS policies
- Preserve tenant isolation (always use UUID `tenant_id`)
- Preserve Redis separation (memory vs cache)
- Do not bypass existing middleware (auth, rate limiting, logging)

### Workflow

1. Check `orchestra/PLAN.md` for Active tasks
2. If empty or ambiguous → **ask the user** before making changes
3. Read relevant `orchestra/context/interfaces.md` contracts
4. Make minimal, targeted changes
5. Add/update tests
6. Run regression tests: `docker exec aishacrm-backend npm test`
7. Document changes in wave report (if applicable)
8. **Update `CHANGELOG.md`** before committing — every session's changes must be recorded

**If in doubt, DO NOTHING and ask.**

---

## Routes: V1 vs V2

| V1 `/api/accounts`       | V2 `/api/v2/accounts` |
| ------------------------ | --------------------- |
| Nested metadata          | Flattened fields      |
| Legacy compatibility     | **New features here** |
| May have inconsistencies | Canonical source      |

Always prefer V2 routes for new development. V1 maintained for backwards compatibility only.

---

## Troubleshooting Checklist

When debugging an issue, follow this checklist:

1. **Check Active Services**

   ```bash
   docker compose ps
   curl http://localhost:4001/api/system/health
   ```

2. **Review Recent Logs**

   ```bash
   docker compose logs --tail=50 backend
   docker compose logs --tail=50 frontend
   ```

3. **Verify Environment**

   ```bash
   # Check .env files exist
   ls -la .env backend/.env .env.local

   # In Docker, check Doppler token is set
   docker compose exec backend env | grep DOPPLER
   ```

4. **Test Database Connection**

   ```bash
   # From backend container
   docker exec aishacrm-backend npm run test:auth
   ```

5. **Verify Redis Connection**

   ```bash
   docker exec aishacrm-redis-memory redis-cli ping
   docker exec aishacrm-redis-cache redis-cli ping
   ```

6. **Check Port Availability**

   ```powershell
   # Windows
   netstat -ano | findstr "3001 4001 5173 4000"
   ```

7. **Run Regression Tests**
   ```bash
   docker exec aishacrm-backend npm test
   npm run test:e2e
   ```

---

## API Routes: V1 vs V2

### V1 Routes (`/api/*`)

- **Legacy compatibility layer**
- Nested metadata structures
- May have field inconsistencies
- Use only for backwards compatibility

### V2 Routes (`/api/v2/*`)

- **Canonical source for new features**
- Flattened field structures
- Consistent serialization
- Full field parity with UI

**Migration Path:**
When updating entities, always update V2 routes first, then backport to V1 if needed for compatibility.

---

## Testing Strategy

### Unit Tests (Vitest)

- **Location:** `src/**/*.test.{js,jsx}`
- **Run:** `npm run test`
- **Coverage:** Component logic, hooks, utilities

### Backend Tests (Node.js native)

- **Location:** `backend/__tests__/`
- **Run:** `cd backend && npm test`
- **Coverage:** API routes, middleware, services

### E2E Tests (Playwright)

- **Location:** `tests/e2e/`
- **Run:** `npm run test:e2e`
- **Coverage:** Full user workflows, integrations

### Regression Testing

**CRITICAL:** After ANY change, run:

```bash
docker exec aishacrm-backend npm test
```

---

## Multi-Tenancy Rules

**Always use UUID tenant isolation:**

```javascript
// ✅ CORRECT
const { data } = await supabase
  .from('accounts')
  .select('*')
  .eq('tenant_id', req.tenant.id);

// ❌ WRONG (deprecated)
.eq('tenant_id_text', 'slug')
```

**Tenant Context:**

- Backend: `req.tenant.id` (middleware injected)
- Frontend: `useUser()` hook or `TenantContext`
- Database: All tables have `tenant_id UUID` column with RLS

---

## Version History

- **v3.0.x** (Dec 2025) — Current: Normalized lifecycle, Braid v2, Multi-provider AI
- **v2.x** (2024) — Legacy: Conversational UI, initial Braid integration
- **v1.x** (2023) — Legacy: Traditional CRM

See `CHANGELOG.md` for detailed release notes.
