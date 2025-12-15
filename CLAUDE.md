# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aisha CRM is an independent CRM system transitioning from Base44/Ai-SHA to a fully self-hosted infrastructure. The architecture provides automatic failover from Base44 cloud functions to local backend implementations.

**Key Architecture:**
- **Frontend:** React + Vite with domain-organized components
- **Backend:** Node.js Express server with 197 API endpoints across 26+ categories
- **Database:** Supabase PostgreSQL (cloud-hosted)
- **Failover System:** Automatic Base44 → local backend switching via `src/api/fallbackFunctions.js`

## Critical Environment Rules

### Windows PowerShell Development Environment

This project is developed on Windows using PowerShell. **ALWAYS verify directory location before running commands:**

```powershell
# MANDATORY - Run before ANY command
Get-Location

# Navigate if needed
cd C:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53

# Verify again
Get-Location
```

**Terminal Management:**
- Frontend and backend run in SEPARATE terminals
- After starting services with `.\start-all.ps1`, open a NEW terminal for additional commands
- Background processes occupy terminals - spawn new ones for subsequent work

### Docker vs Local Development

**Two deployment modes with different ports:**

| Mode | Frontend | Backend |
|------|----------|---------|
| **Local Dev** (default) | http://localhost:5173 | http://localhost:3001 |
| **Docker** | http://localhost:4000 | http://localhost:4001 |

**Docker Mode:**
- Start: `docker compose up -d --build`
- Frontend rebuild: `docker compose up -d --build frontend`
- Backend rebuild: `docker compose up -d --build backend`
- Environment: `.env` → `VITE_AISHACRM_BACKEND_URL=http://localhost:4001`
- CORS: `backend/.env` → `ALLOWED_ORIGINS` includes `http://localhost:4000`

**Local Dev Mode (Recommended):**
- Start: `.\start-all.ps1` (both frontend + backend with auto-restart)
- Frontend only: `npm run dev` (port 5173, HMR enabled)
- Backend only: `cd backend && npm run dev` (port 3001, auto-restart on file changes)
- Environment: `VITE_AISHACRM_BACKEND_URL=http://localhost:3001`

## Essential Commands

### Development

```powershell
# Start all services (occupies terminal)
.\start-all.ps1

# Stop all services
.\stop-all.ps1

# Check service status
.\status.ps1

# Frontend only (from project root)
npm run dev                # Vite dev server with HMR (port 5173)

# Backend only (from backend/ directory)
cd backend
npm run dev                # Auto-restart on file changes (port 3001)
npm run dev:unlimited      # No restart limits (use cautiously)
```

### Building & Testing

```powershell
# Build frontend for production
npm run build

# Preview production build
npm run preview

# Linting
npm run lint
npm run format          # Auto-fix with Prettier
npm run format:check    # Check formatting only

# Testing
npm run test           # Vitest unit tests (frontend)
npm run test:ui        # Vitest UI mode
npm run test:run       # Run tests once without watch

npm run test:e2e       # Playwright E2E tests
npm run test:e2e:ui    # Playwright UI mode
npm run test:e2e:debug # Debug mode
```

### Database & Utilities

```powershell
# Reset test data
.\clear-test-data.ps1

# Reset all data (keeps superadmin)
.\reset-keep-superadmin.ps1

# Reset user password
.\reset-password.ps1

# Backend seed data
cd backend
npm run seed

# Backend tests
npm test
```

## Architecture Deep Dive

### Automatic Failover System

**How it works:**
1. API calls go through `src/api/fallbackFunctions.js`
2. System checks Base44 health with 30-second cache
3. If Base44 is down/slow (>5s), automatically switches to local backend
4. Local functions in `src/functions/` provide browser-side fallbacks

**Key Files:**
- `src/api/fallbackFunctions.js` - Orchestrates Base44 → local backend failover
- `src/api/functions.js` - Base44/cloud function calls
- `src/api/backendUrl.js` - Backend URL resolution (respects `VITE_AISHACRM_BACKEND_URL`)
- `src/functions/index.js` - Exports all local fallback functions
- `backend/server.js` - Express server with 197 endpoints

### Backend Route Organization

Routes in `backend/routes/` mirror frontend domain structure:

**Core CRM:**
- `accounts.js`, `contacts.js`, `leads.js`, `opportunities.js`
- `activities.js`, `notes.js`, `clients.js`

**AI & Automation:**
- `ai.js` - AI-powered features (chat, sentiment, summarization)
- `aiSummary.js` - AI profile summaries with 24-hour caching
- `aicampaigns.js` - AI campaign management
- `workflows.js`, `workflowexecutions.js`

**Business Operations:**
- `billing.js`, `cashflow.js`
- `bizdev.js`, `bizdevsources.js`
- `employees.js`, `telephony.js`

**System & Infrastructure:**
- `system.js` - Health checks, diagnostics (`/health`, `/api/system/status`)
- `reports.js` - Dashboard stats (`/api/reports/dashboard-stats`)
- `validation.js` - Duplicate detection, data quality
- `database.js` - Sync, archive, cleanup operations
- `metrics.js` - Performance metrics
- `system-logs.js`, `audit-logs.js`

**Configuration:**
- `tenants.js`, `users.js`, `permissions.js`
- `modulesettings.js`, `systembrandings.js`
- `integrations.js`, `tenant-integrations.js`

**Storage & Documents:**
- `storage.js`, `documents.js`, `documentationfiles.js`

**Developer Tools:**
- `testing.js` - Testing utilities
- `mcp.js` - Model Context Protocol server
- `webhooks.js`, `cron.js`

### AI Engine Architecture

The backend uses a **unified multi-provider AI engine** with automatic failover:

**Location:** `backend/lib/aiEngine/`

**Exports:**
- `selectLLMConfigForTenant()` - Get configured provider/model for a tenant and capability
- `resolveLLMApiKey()` - Resolve API key from tenant → user → system hierarchy
- `generateChatCompletion()` - Call LLM with automatic failover (OpenAI → Anthropic → Groq)

**Features:**
- Multi-provider support: OpenAI (gpt-4o), Anthropic (claude-3-5-sonnet), Groq (llama-3.3-70b)
- Automatic failover on API errors
- Tenant-level override: Set `LLM_PROVIDER__TENANT_<id>=provider` to route specific tenants
- Activity logging for monitoring and cost tracking

**Usage Pattern:**
```javascript
const config = selectLLMConfigForTenant({ capability: 'chat_tools', tenantSlugOrId });
const apiKey = await resolveLLMApiKey({ tenantSlugOrId, provider: config.provider });
const result = await generateChatCompletion({ provider: config.provider, model: config.model, messages, apiKey });
```

### AI Profile Summaries (Person Profile Feature)

**Endpoint:** `POST /api/ai/summarize-person-profile`

**Features:**
- Generates AI-powered executive summaries for lead/contact profiles
- **24-hour caching** prevents excessive LLM calls and improves performance
- Stores summaries in `public.ai_person_profile` table
- Uses AI engine with automatic provider failover

**Request Body:**
```json
{ "person_id": "uuid", "person_type": "lead|contact", "profile_data": {...}, "tenant_id": "uuid" }
```

**Caching Strategy:**
- Frontend checks `ai_summary_updated_at` timestamp before calling backend
- Backend queries database for existing summary before generating new one
- Only regenerates if summary missing or older than 24 hours
- Logs indicate cache hits vs. fresh generation

**Context Included in Summary:**
- Name, position, company, status
- Contact info (email, phone)
- Last activity date
- Open opportunities and stages
- Recent notes and activities
- Assignment and relevant metadata

### Frontend Component Structure

Components in `src/components/` organized by domain:
- `accounts/`, `activities/`, `contacts/`, `leads/`, `opportunities/`
- `ai/` - AI widgets and assistants
- `shared/` - Reusable components (`PerformanceCache.jsx`, `ConfirmDialog.jsx`)
- `ui/` - shadcn/ui components (Radix UI primitives)

**Important Patterns:**
- Use `ConfirmDialog` instead of `window.confirm()`
- Wrap debug logs: `if (import.meta.env.DEV) console.log(...)`
- Performance cache: `import { performanceCache } from '@/components/shared/PerformanceCache'`

### Standalone Lead Profile Page

**Component:** `src/pages/LeadProfilePage.jsx`

**Route:** `GET /leads/:leadId?tenant_id=<tenantId>` (public, no Layout wrapper)

**Features:**
- Professional report-style layout (not CRM interface)
- Fetches profile from Supabase Edge Function (`person-refresh`)
- Resolves employee UUIDs to human-readable names via database lookups
- Includes AI-generated executive summary with caching
- Displays comprehensive profile sections:
  - Header: Name, status, company, assigned employee
  - Contact Info: Email, phone
  - Key Dates: Created, last updated, last activity
  - AI Summary: Auto-generated from profile context
  - Notes: Recent notes with timestamps
  - Activities: Recent activities with type, status, priority, due dates
  - Opportunities: Related opportunities by stage

**API Integrations:**
- Supabase Edge Function: `GET /rest/v1/person-refresh?person_id=...` (with auth headers)
- Backend AI endpoint: `POST /api/ai/summarize-person-profile` (generates + caches summary)

**Authentication:**
- Uses user JWT from `supabase.auth.getSession()`
- Includes tenant_id in all API calls for RLS isolation
- Headers: `Authorization: Bearer {userJWT}`, `apikey: {anonKey}`, `x-tenant-id: {tenantId}`

### Path Aliases

```javascript
// vite.config.js and jsconfig.json define '@' alias
import { Component } from '@/components/shared/Component'
import { localFunction } from '@/functions'
import { apiCall } from '@/api/functions'
```

## Database Configuration

**Critical: Supabase Cloud Only**
- Production database: Supabase PostgreSQL (cloud-hosted)
- Local PostgreSQL (Docker) is DISABLED by default (migration testing only)
- Connection: Via `DATABASE_URL` in `backend/.env` or Supabase client config
- Migrations: `backend/migrations/`

**Important Documentation:**
- `backend/DATABASE_UUID_vs_TENANT_ID.md` - UUID vs tenant_id distinction
- `backend/DATABASE_CONFIGURATION.md` - Database setup details

## Testing Strategy

### Unit Tests (Vitest)
- Location: `src/**/*.test.{js,jsx}`
- Config: `vitest.config.js`
- Setup: `src/test/setup.js`
- Run: `npm run test`

### E2E Tests (Playwright)
- Location: `tests/e2e/`
- Config: `playwright.config.js`
- Auth setup: `tests/e2e/auth.setup.js` (creates superadmin session)
- Storage state: `playwright/.auth/superadmin.json`
- Run: `npm run test:e2e`

**E2E Test URLs:**
- Uses `PLAYWRIGHT_FRONTEND_URL` (fallback: `VITE_AISHACRM_FRONTEND_URL` → `http://localhost:4000`)
- Uses `PLAYWRIGHT_BACKEND_URL` (fallback: `VITE_AISHACRM_BACKEND_URL` → `http://localhost:4001`)

## Auto-Restart & Hot Reload

### Backend Auto-Restart
- Script: `backend/dev-server.js` (wrapper around `server.js`)
- Trigger: Any `.js` file change in `backend/`
- Limits: Max 10 restarts/min with 2-second cooldown
- Behavior: Auto-exits if limit exceeded (forces issue resolution)
- Override: `npm run dev:unlimited` (no limits, not recommended)

### Frontend HMR
- Vite Hot Module Replacement
- Instant updates on component/CSS changes
- Crash recovery: Auto-restarts if Vite crashes (max 5/min)
- Direct Vite: `npm run dev:vite` (no crash recovery wrapper)

## Code Quality & Git Hooks

### Pre-commit Hooks (Husky + lint-staged)
- Auto-format with Prettier: `*.{js,jsx,json,css,md}`
- Auto-fix with ESLint: `*.{js,jsx}`
- Config: `package.json` → `lint-staged`

### GitHub Workflows
- **Copilot PR Reviews:** Auto-requests review on PRs to `main`
- Skip with label: `no-copilot`
- Workflow: `.github/workflows/copilot-review.yml`

## Common Development Patterns

### Adding a New Backend Endpoint

1. Create/edit route file in `backend/routes/`
2. Export router and mount in `backend/server.js`
3. Backend auto-restarts (~2 seconds)
4. Test: `Invoke-RestMethod http://localhost:3001/api/your-endpoint`

### Adding a New Frontend Component

1. Create component in appropriate domain folder (`src/components/`)
2. Import and use in parent component
3. Save → Vite HMR updates browser instantly
4. Verify in browser DevTools

### Working with Fallback Functions

```javascript
// In src/api/fallbackFunctions.js
export const myFunction = createFallback(
  'myFunction',           // Function name
  cloudFunctions,         // Base44 cloud functions
  localFunctions          // Local fallback implementations
);

// Usage in components
import { myFunction } from '@/api/fallbackFunctions';
const result = await myFunction({ tenant_id, ...params });
```

### Database Schema Changes

1. Create migration file in `backend/migrations/`
2. Manually restart backend (schema changes need fresh connection)
3. Verify with Supabase dashboard or database client

## Security & Performance

**Security Measures:**
- Helmet.js security headers (backend)
- CORS configuration (backend: `ALLOWED_ORIGINS`)
- Rate limiting (built-in)
- Environment variable protection (never commit `.env`)
- API key validation for webhooks

**Performance:**
- `performanceCache` component for expensive operations
- Base44 health check cached for 30 seconds
- Vite code splitting and vendor chunk optimization
- Backend compression middleware

## Troubleshooting

### Backend Not Restarting
1. Verify using `npm run dev` (not `npm start`)
2. Check terminal for error messages
3. Manual restart: `Ctrl+C` then `npm run dev`

### Frontend Not Updating
1. Check browser console for errors
2. Hard refresh: `Ctrl+Shift+R`
3. Clear Vite cache: Delete `.vite/` folder and restart

### Port Conflicts
```powershell
# Kill process on port 3001 (backend)
Get-NetTCPConnection -LocalPort 3001 | Select-Object OwningProcess | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Kill process on port 5173 (frontend)
Get-NetTCPConnection -LocalPort 5173 | Select-Object OwningProcess | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### ESM Issues (Backend)
See `backend/TROUBLESHOOTING_NODE_ESM.md` for ESM-specific debugging if server exits immediately.

## Key Documentation Files

- `README.md` - Project overview and setup
- `TERMINAL_RULES.md` - MANDATORY terminal & directory verification rules
- `DEV_QUICK_START.md` - Development workflow guide
- `backend/README.md` - Backend setup and API documentation
- `backend/DATABASE_UUID_vs_TENANT_ID.md` - Critical UUID vs tenant_id distinction
- `backend/TROUBLESHOOTING_NODE_ESM.md` - ESM debugging
- `.github/copilot-instructions.md` - Detailed conventions and workflows

## Orchestra Control Layer (MANDATORY FOR AI)

This project uses an internal **orchestra** control system to prevent AI from making uncontrolled changes.

Before writing or modifying ANY code, you MUST:

1. Read `orchestra/ARCHITECTURE.md`
2. Read `orchestra/CONVENTIONS.md`
3. Read `orchestra/PLAN.md` to see the current active goal and tasks
4. Read `orchestra/context/interfaces.md` for key contracts and boundaries

Rules:

- You may ONLY work on tasks listed as **Active** in `orchestra/PLAN.md`.
- Default mode is **BUGFIX-FIRST**:
  - No new features unless explicitly marked as a `feature` goal.
  - No broad refactors or rewrites unless required for security, stability, performance, or race-condition fixes.
- Keep changes as small and localized as possible.
- Preserve Docker ports, Supabase setup, Base44 failover logic, and tenant isolation as documented elsewhere in this file.

If `PLAN.md` is empty or ambiguous:
- Ask the user to clarify the active task **before** making any code changes.

