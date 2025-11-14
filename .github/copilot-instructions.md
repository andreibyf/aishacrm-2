# Copilot Instructions for AI Agents

## Project Overview
- Aisha CRM: Independent CRM system transitioning from Base44 to your own infrastructure.
- Frontend: Vite + React app with domain-organized components (accounts, activities, ai, etc.).
- Backend: Node.js Express server with 197 API endpoints across 26 categories, using PostgreSQL (Supabase).
- Focus: Zero vendor dependency with automatic Base44 → local backend failover.

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
- **Frontend:** Components in `src/components/` by domain; pages in `src/pages/`; API clients in `src/api/` with fallback logic.
- **Backend:** Express server in `backend/server.js`; routes in `backend/routes/` (26 categories); database via Supabase PostgreSQL.
- **Data Flow:** API calls auto-failover from Base44 SDK to local backend; local functions in `src/functions/` for browser-side fallbacks.
- **Why Independent:** Prevents downtime when Base44 is unavailable; full control over data and functions.

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
- Optimistic updates: For snappy UX, optimistically update local state (e.g., remove deleted item from list) and then revalidate with `load*()` calls.
- Pagination guard: After bulk deletes, ensure page indices are clamped to avoid empty pages.

## Project-Specific Conventions
- Components: Function-based React, domain-grouped; use `ConfirmDialog` instead of `window.confirm()`.
- API Integration: Use `src/api/fallbackFunctions.js` for Base44 → local backend auto-failover.
- Local Functions: Browser-side fallbacks in `src/functions/`; export via `index.js`; avoid Node.js APIs.
- Logging: Wrap debug logs with `import.meta.env.DEV`; error boundaries at root and component-level.
- UI Patterns: AI widgets in `src/components/ai/`; bulk actions/detail panels common; Tailwind utility classes.
- Performance: Use `performanceCache` from `src/components/shared/PerformanceCache.jsx`.

## Integration Points
- **Database:** Supabase PostgreSQL; configure via `DATABASE_URL` or Supabase prod settings; see `backend/DATABASE_UUID_vs_TENANT_ID.md` for critical UUID vs tenant_id distinction.
- **External API:** Base44 SDK for migration/sync; local backend for independence.
- **AI Features:** Custom assistants in `src/components/ai/`; MCP server example in `src/functions/mcpServer.js`.
- **Security:** Helmet.js, CORS, rate limiting in backend; never commit `.env`.

### Tenant Identifiers (UUID-First)
- Source of truth: Use UUIDs for `tenant_id` across backend and frontend; do not convert to or filter by slug.
- Backend routes: All filters and joins must use UUID `tenant_id` (or `tenants.id`). Avoid any UUID→slug mapping.
- Frontend params: Always pass the tenant UUID; do not send legacy slug values.
- Migration note: Legacy `tenant_id` (slug) can exist on records; do not rely on it for filtering.

## Backend Route Categories
The backend exposes 197 API endpoints across 26 categories:
- **accounts** - Account management operations
- **activities** - Activity logging and tracking
- **ai** - AI-powered features and assistants
- **announcements** - System announcements and notifications
- **apikeys** - API key management
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
- **telephony** - Phone and communication features
- **tenant-integrations** - Multi-tenant integrations
- **tenants** - Multi-tenant management
- **testing** - Testing utilities and endpoints
- **users** - User account management
- **utils** - Utility functions
- **validation** - Data validation and duplicate detection
- **webhooks** - Webhook handling
- **workflows** - Workflow automation

## Key Files & Directories
- `src/api/` — API clients with Base44 → local failover (`fallbackFunctions.js`)
- `src/functions/` — 197 browser-side functions; export via `index.js`
- `backend/server.js` — Express server with 197 endpoints
- `backend/routes/` — 26 route categories (accounts.js, leads.js, etc.)
- `backend/migrations/` — Supabase schema migrations
- `src/components/` — Domain-specific React components
- `src/pages/` — Route/view components
- `vite.config.js`, `tailwind.config.js`, `eslint.config.js` — Build, style, lint config

---
**For questions, review README.md or backend/README.md. Contact Base44 at app@base44.com for legacy issues.**
