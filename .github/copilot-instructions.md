# Copilot Instructions for AI Agents

## Project Overview
- Aisha CRM: Independent CRM system transitioning from Base44 to your own infrastructure.
- Frontend: Vite + React app with domain-organized components (accounts, activities, ai, etc.).
- Backend: Node.js Express server with 197 API endpoints across 26 categories, using PostgreSQL (Supabase).
- Focus: Zero vendor dependency with automatic Base44 → local backend failover.

## Architecture & Data Flow
- **Frontend:** Components in `src/components/` by domain; pages in `src/pages/`; API clients in `src/api/` with fallback logic.
- **Backend:** Express server in `backend/server.js`; routes in `backend/routes/` (26 categories); database via Supabase PostgreSQL.
- **Data Flow:** API calls auto-failover from Base44 SDK to local backend; local functions in `src/functions/` for browser-side fallbacks.
- **Why Independent:** Prevents downtime when Base44 is unavailable; full control over data and functions.

## Developer Workflows
- **Setup:** `npm install` (root & backend); copy `.env.example` to `.env`; configure `VITE_AISHACRM_BACKEND_URL` and database credentials.
- **Dev Server:** `npm run dev` (frontend); `cd backend && npm run dev` (backend with auto-reload in separate terminal).
- **Build:** `npm run build` (frontend); backend runs via `npm start`.
- **Linting:** `npm run lint` (frontend); check `eslint-results.json` for issues.
- **Database:** Use Supabase; run migrations from `backend/migrations/`; seed with `npm run seed`.
- **Testing:** Custom tests in `src/pages/UnitTests.jsx`; backend tests via `npm test`.
- **Backend Issues:** If server exits immediately, see `backend/TROUBLESHOOTING_NODE_ESM.md` for ESM-specific debugging.

## Project-Specific Conventions
- Components: Function-based React, domain-grouped; use `ConfirmDialog` instead of `window.confirm()`.
- API Integration: Use `src/api/fallbackFunctions.js` for Base44 → local backend auto-failover.
- Local Functions: Browser-side fallbacks in `src/functions/`; export via `index.js`; avoid Node.js APIs.
- Logging: Wrap debug logs with `import.meta.env.DEV`; error boundaries at root and component-level.
- UI Patterns: AI widgets in `src/components/ai/`; bulk actions/detail panels common; Tailwind utility classes.
- Performance: Use `performanceCache` from `src/components/shared/PerformanceCache.jsx`.

## Integration Points
- **Database:** Supabase PostgreSQL; configure via `DATABASE_URL` or Supabase prod settings.
- **External API:** Base44 SDK for migration/sync; local backend for independence.
- **AI Features:** Custom assistants in `src/components/ai/`; MCP server example in `src/functions/mcpServer.js`.
- **Security:** Helmet.js, CORS, rate limiting in backend; never commit `.env`.

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
