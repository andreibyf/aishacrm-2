# Copilot Instructions for AI Agents

## Project Overview
- **Aisha CRM:** Independent CRM system with AI Executive Assistant capabilities powered by Braid SDK
- **Architecture:** 
  - Frontend: Vite + React (domain-organized components)
  - Backend: Node.js Express (210+ API endpoints, 28 categories)
  - Database: PostgreSQL via Supabase Cloud (50+ tables, RLS enabled)
  - AI: Braid SDK with 27+ production tools, MCP server for transcript analysis
- **Key Differentiator:** Automatic Base44 → local backend failover ensures zero downtime
- **Multi-Tenant:** UUID-first tenant isolation with row-level security

## 🐳 CRITICAL: Docker Development Environment
**THIS PROJECT RUNS IN DOCKER CONTAINERS - ALWAYS REMEMBER THIS:**

- **Frontend Container:** Runs on `http://localhost:4000` (NOT 5173 or 3000)
- **Backend Container:** Runs on `http://localhost:4001` (NOT 3001)
- **Port Configuration:** NEVER suggest changing ports - they are fixed in Docker setup
- **Environment Files:**
  - Root `.env`: `VITE_AISHACRM_BACKEND_URL=http://localhost:4001`
  - Backend `.env`: `ALLOWED_ORIGINS` includes `http://localhost:4000`, `FRONTEND_URL=http://localhost:4000`
- **Starting Services:** Use `docker-compose up -d` to start both containers (runs in background)
- **Code Changes:** 
  - Frontend changes require rebuild: `docker-compose up -d --build frontend`
  - Backend changes require rebuild: `docker-compose up -d --build backend`
  - Rebuild both: `docker-compose up -d --build`
- **Debugging:** Check `docker ps` for container status; use `docker logs aishacrm-frontend` or `docker logs aishacrm-backend` for output
- **Common Mistakes to Avoid:**
  - ❌ DON'T assume standard Vite port (5173) or Express port (3001)
  - ❌ DON'T suggest `npm run dev` without Docker context
  - ❌ DON'T modify port configuration without explicit user request
  - ✅ DO verify Docker containers are running before troubleshooting
  - ✅ DO use container ports (4000/4001) in all URLs and CORS config

## Architecture & Data Flow

### Frontend Architecture
- **Components:** Domain-organized in `src/components/` (accounts/, activities/, ai/, shared/, ui/)
- **Pages:** Route components in `src/pages/`
- **API Layer:** `src/api/` with automatic Base44 → backend failover via `fallbackFunctions.js`
- **Path Alias:** `@/` resolves to `src/` (configured in vite.config.js, jsconfig.json)
- **State Management:** React hooks + ApiManager for request caching (30s TTL)
- **UI Framework:** Tailwind CSS + shadcn/ui (Radix UI primitives in `src/components/ui/`)

### Backend Architecture
- **Server:** Express in `backend/server.js` with 210+ endpoints across 28 categories
- **Routes:** Organized by domain in `backend/routes/` (accounts.js, leads.js, ai.js, etc.)
- **Database Access:** Supabase JS client (no raw pgPool queries) with RLS enforcement
- **Middleware:** 
  - `tenantScopedId()` - validates tenant access to resources
  - `validateTenantAccess` - enforces tenant isolation
  - Helmet.js security headers, CORS, rate limiting
- **Background Workers:** Campaign execution, call flow processing, memory archival

### Data Flow
1. **Frontend:** Component → `src/api/fallbackFunctions.js` → Base44 health check
2. **Failover Logic:** If Base44 down/slow (>5s), switch to local backend automatically
3. **Backend API:** Express routes → Supabase client → PostgreSQL with RLS
4. **Caching:** ApiManager caches GET requests for 30s, invalidate with `clearCache(pattern)`
5. **AI Tools:** OpenAI Chat → `backend/routes/ai.js` → Braid executor → Backend API

### Why Independent Backend
- ✅ Zero downtime when Base44 is unavailable
- ✅ Full control over data, security, and scaling
- ✅ Can run on-premise or own cloud infrastructure
- ✅ No vendor lock-in or usage limits

## Developer Workflows

### 🚨 CRITICAL: Terminal & Directory Rules
**MUST FOLLOW EVERY TIME - NO EXCEPTIONS:**

1. **Directory Verification (MANDATORY):**
   - ALWAYS run `Get-Location` (PowerShell) or `pwd` (bash) BEFORE executing ANY terminal command
   - NEVER assume your current directory
   - Verify you're in the correct location before running scripts or commands

2. **Terminal Management (MANDATORY):**
   - Frontend and backend MUST run in SEPARATE terminals
   - After starting services with `.\start-all.ps1`, you MUST open a NEW terminal for subsequent commands
   - Background processes occupy the terminal - always spawn a new one for additional work

3. **Command Execution Pattern:**
   ```powershell
   # ALWAYS do this first:
   Get-Location  # Verify current directory
   
   # Then navigate if needed:
   cd c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53
   
   # Then execute your command:
   .\your-script.ps1
   ```

### Standard Workflows
- **Setup:** `npm install` (root & backend); copy `.env.example` to `.env`; configure `VITE_AISHACRM_BACKEND_URL=http://localhost:4001` (Docker backend port) and database credentials.
- **Dev Server (Docker):** `docker-compose up -d --build` starts both containers on ports 4000 (frontend) and 4001 (backend). Runs in background.
- **Dev Server (Alternative):** `npm run dev` (frontend) and `cd backend && npm run dev` (backend) in separate terminals if NOT using Docker.
- **Rebuild After Changes:** `docker-compose up -d --build` (both) or `docker-compose up -d --build frontend` (frontend only) or `docker-compose up -d --build backend` (backend only)
- **Accessing App:** Frontend at `http://localhost:4000`, backend API at `http://localhost:4001/api/*`
- **Build:** `npm run build` (frontend); backend runs via `npm start`.
- **Linting:** `npm run lint` (frontend); check `eslint-results.json` for issues.
- **Database:** Use Supabase; run migrations from `backend/migrations/`; seed with `npm run seed`.
- **Testing:** Custom tests in `src/pages/UnitTests.jsx`; backend tests via `npm test`.
- **Docker Status:** Check `docker ps` to see running containers; `docker logs aishacrm-frontend` or `docker logs aishacrm-backend` for debugging.
- **Backend Issues:** If server exits immediately, see `backend/TROUBLESHOOTING_NODE_ESM.md` for ESM-specific debugging.

### Windows + Git Notes
- Reserved filenames: Avoid adding files named `nul`, `con`, `prn`, etc. If accidentally staged, remove with `git rm --cached --ignore-unmatch nul`.
- PowerShell quoting: When referencing paths with `$` (e.g., `backend/routes/$_`), wrap in single quotes to prevent variable expansion: `'backend/routes/$_'`.
- CRLF warnings: Messages like "CRLF will be replaced by LF" are informational under `.gitattributes` rules and can be ignored. To reduce noise on Windows: `git config core.autocrlf true`.
- Ignored files: `test-results` is intentionally ignored. Only force-add with `git add -f` if truly required.
- Safer staging: Prefer `git add -A` instead of enumerating many paths inline to avoid shell quirks.

### Cache & UI Refresh
- Frontend cache: `useApiManager()` exposes `cachedRequest`, `clearCache`, and `clearCacheByKey` (alias) for cache invalidation. Use `clearCacheByKey("Account")` after mutations.
- Cache TTL: 30 seconds, stored in memory (Map), deduplicated requests via promise tracking
- Optimistic updates: For snappy UX, optimistically update local state (e.g., remove deleted item from list) and then revalidate with `load*()` calls.
- Pagination guard: After bulk deletes, ensure page indices are clamped to avoid empty pages.

### Vite Development Proxy
- **Dev Mode Only:** Vite proxies `/api`, `/health`, `/api-docs` to backend (port 3001 or 4001)
- **Purpose:** Avoids CORS issues during development, frontend can call `/api/*` directly
- **Production:** Frontend must use full `VITE_AISHACRM_BACKEND_URL` (no proxy)
- **Config:** `vite.config.js` → `server.proxy` object

## Project-Specific Conventions
- Components: Function-based React, domain-grouped; use `ConfirmDialog` instead of `window.confirm()`.
- API Integration: Use `src/api/fallbackFunctions.js` for Base44 → local backend auto-failover.
- Local Functions: Browser-side fallbacks in `src/functions/`; export via `index.js`; avoid Node.js APIs.
- Logging: Wrap debug logs with `import.meta.env.DEV`; error boundaries at root and component-level.
- UI Patterns: AI widgets in `src/components/ai/`; bulk actions/detail panels common; Tailwind utility classes.
- Performance: Use `performanceCache` from `src/components/shared/PerformanceCache.jsx`.

## Code Style and Formatting
- **Linting:** Run `npm run lint` before committing; fix all errors and warnings when possible.
- **Formatting:** Use Prettier for consistent formatting; run `npm run format` or enable format-on-save.
- **React:** Functional components only; use hooks for state and effects; PropTypes or TypeScript for type safety.
- **Naming:** camelCase for variables/functions, PascalCase for components, UPPER_SNAKE_CASE for constants.
- **Files:** One component per file; co-locate tests, styles if applicable; max ~300 lines per file.
- **Imports:** Group by: React → external libs → internal modules → styles; sort alphabetically within groups.

## Git and PR Conventions
- **Branches:** Use descriptive names like `feature/add-export` or `fix/login-bug`.
- **Commits:** Write clear, concise messages in present tense: "Add export feature" not "Added export feature".
- **PRs:** Reference issue numbers; describe what changed and why; keep PRs focused and small.
- **Reviews:** Address all comments; use GitHub suggestions when applicable; ask for clarification if needed.
- **Merging:** Squash commits for cleaner history; delete branch after merge.

## Integration Points
- **Database:** Supabase PostgreSQL; configure via `DATABASE_URL` or Supabase prod settings; see `backend/DATABASE_UUID_vs_TENANT_ID.md` for critical UUID vs tenant_id distinction.
- **External API:** Base44 SDK for migration/sync; local backend for independence.
- **AI Features:** Custom assistants in `src/components/ai/`; MCP server example in `src/functions/mcpServer.js`.
- **Security:** Helmet.js, CORS, rate limiting in backend; never commit `.env`.

### Tenant Identifiers (UUID-First)
- **Critical Distinction:** Database has TWO identifier columns:
  - `id` (uuid): Primary key for RLS, foreign keys, database relationships
  - `tenant_id` (text): Business identifier for multi-tenancy (e.g., "local-tenant-001")
- **Source of truth:** Use UUIDs for `tenant_id` across backend and frontend; do not convert to or filter by slug.
- **Backend routes:** All filters and joins must use UUID `tenant_id` (or `tenants.id`). Avoid any UUID→slug mapping.
- **Frontend params:** Always pass the tenant UUID; do not send legacy slug values.
- **Foreign Keys:** ALWAYS use UUIDs (e.g., `contacts.account_id` → `accounts.id`), never text tenant_id
- **Common Error:** `ERROR: invalid input syntax for type uuid: "local-tenant-001"` - using text slug where UUID expected
- **Migration note:** Legacy `tenant_id` (slug) can exist on records; do not rely on it for filtering.
- **Documentation:** See `docs/DATABASE_UUID_vs_TENANT_ID.md` for detailed patterns and examples

## Testing Best Practices
- **Frontend:** Custom tests in `src/pages/UnitTests.jsx`; add tests for new components when possible.
- **Backend:** Run `npm test` in backend directory; test API endpoints and business logic.
- **E2E:** Use Playwright for end-to-end tests; run with `npm run test:e2e`.
- **Coverage:** Aim for critical paths; don't let perfect be the enemy of good.
- **CI/CD:** All tests must pass before merging; check GitHub Actions workflows.

## Common Pitfalls and Solutions
- **Backend exits immediately:** Check ESM syntax errors; see `backend/TROUBLESHOOTING_NODE_ESM.md`.
- **Database connection fails:** Verify `.env` credentials; check Supabase console for issues.
- **Frontend shows "undefined" errors:** Check for null/undefined values; add optional chaining (`?.`).
- **API failover not working:** Verify `VITE_AISHACRM_BACKEND_URL` is set; check `fallbackFunctions.js` logic.
- **Git conflicts:** See `GIT_SOLUTION_SUMMARY.md`; run `\.\cleanup-branches.ps1` or `./cleanup-branches.sh`.
- **Terminal issues:** ALWAYS verify directory with `Get-Location` or `pwd` before commands.
- **Dependencies:** Run `npm install` in both root and `backend/` after pulling changes.

## Backend Route Categories
The backend exposes 210+ API endpoints across 28 categories:
- **accounts** - Account management operations
- **activities** - Activity logging and tracking
- **ai** - AI-powered features and assistants
- **aicampaigns** - AI campaign automation (8 endpoints)
- **announcements** - System announcements and notifications
- **apikeys** - API key management
- **audit-logs** - System audit logging
- **billing** - Billing and payment operations
- **bizdev** - Business development tools
- **bizdevsources** - Business development data sources
- **cashflow** - Cash flow analysis and reporting
- **clients** - Client relationship management
- **contacts** - Contact information handling
- **cron** - Scheduled job management
- **database** - Database operations (sync, archive, cleanup)
- **documents** - Document storage and retrieval
- **employees** - Employee management
- **integrations** - Third-party integrations
- **leads** - Lead generation and management
- **mcp** - Model Context Protocol server
- **metrics** - Performance metrics and analytics
- **modulesettings** - Module configuration
- **notes** - Note-taking and comments
- **notifications** - User notifications
- **opportunities** - Sales opportunity tracking
- **permissions** - Access control and permissions
- **reports** - Dashboard stats and data exports
- **storage** - File storage operations
- **system-logs** - System logging and auditing
- **system** - Health checks, diagnostics, status
- **telephony** - Phone and communication features (8 webhook endpoints)
- **tenant-integrations** - Multi-tenant integrations
- **tenants** - Multi-tenant management
- **testing** - Testing utilities and endpoints
- **users** - User account management
- **utils** - Utility functions
- **validation** - Data validation and duplicate detection
- **webhooks** - Webhook handling
- **workflows** - Workflow automation
- **workflowexecutions** - Workflow execution tracking

## Key Files & Directories
- `src/api/` — API clients with Base44 → local failover (`fallbackFunctions.js`)
- `src/functions/` — 197 browser-side functions; export via `index.js`
- `backend/server.js` — Express server with 210+ endpoints
- `backend/routes/` — 28 route categories (accounts.js, leads.js, telephony.js, etc.)
- `backend/lib/` — Core business logic (callFlowHandler.js, campaignWorker.js)
- `backend/migrations/` — Supabase schema migrations (52+)
- `braid-llm-kit/` — Braid SDK with 27+ AI tools for Executive Assistant
- `braid-mcp-node-server/` — MCP server for transcript analysis (standalone Docker stack)
- `src/components/` — Domain-specific React components
- `src/pages/` — Route/view components
- `vite.config.js`, `tailwind.config.js`, `eslint.config.js` — Build, style, lint config

---
**For questions, review README.md or backend/README.md. Contact Base44 at app@base44.com for legacy issues.**
