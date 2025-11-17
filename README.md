# Aisha CRM

**AI-SHA CRM: AI Super Hi-performing Assistant** - Comprehensive Executive Assistant powered by Braid SDK.

Built with React + Vite frontend and Node.js backend, featuring 27+ AI-native tools for full CRM lifecycle management with **210+ API endpoints** across 28 categories.

---

## 📚 Documentation

Aisha CRM provides comprehensive technical documentation organized into specialized manuals:

### 👥 For End Users
- **[User Guide](./docs/AISHA_CRM_USER_GUIDE.md)** - Complete guide for using Aisha CRM features
  - Dashboard & navigation
  - AI assistant capabilities
  - Contact, account, lead, and opportunity management
  - Activities, workflows, and reporting
  - Troubleshooting common issues

### 🔧 For System Administrators
- **[System Administrator Guide](./docs/AISHA_CRM_ADMIN_GUIDE.md)** - Deployment and operations guide
  - Docker deployment setup
  - Environment configuration
  - User and tenant management
  - Security administration
  - Monitoring, backups, and maintenance

### 👨‍💻 For Developers
- **[Developer Manual](./docs/AISHA_CRM_DEVELOPER_MANUAL.md)** - Contributing to the codebase
  - Development environment setup
  - Architecture overview (frontend, backend, database)
  - API development (197 endpoints)
  - Testing and debugging
  - Code standards and design patterns

### 🔒 For Security Teams
- **[Security & Compliance Manual Part 1](./docs/AISHA_CRM_SECURITY_MANUAL_PART1.md)** - Security architecture & data protection
  - Security overview and threat model
  - Authentication & authorization (Supabase Auth, RBAC)
  - Row-level security (RLS) implementation
  - Permission system architecture
  - API security and rate limiting
  - Data protection and encryption

- **[Security & Compliance Manual Part 2](./docs/AISHA_CRM_SECURITY_MANUAL_PART2.md)** - Monitoring, compliance & incident response
  - Audit logging and compliance (GDPR, CCPA, SOC 2, HIPAA)
  - Security monitoring and intrusion detection
  - Incident response procedures
  - Security testing and penetration testing
  - Production deployment security
  - Security best practices

### 🗄️ For Database Administrators
- **[Database Administration Manual Part 1](./docs/AISHA_CRM_DATABASE_MANUAL_PART1.md)** - Architecture & setup
  - Database architecture (PostgreSQL 15+ on Supabase)
  - Initial setup and configuration
  - Schema design (50+ tables, tenant architecture)
  - Migration management (52+ migrations)
  - Indexing strategy and data integrity

- **[Database Administration Manual Part 2](./docs/AISHA_CRM_DATABASE_MANUAL_PART2.md)** - Operations & maintenance
  - Comprehensive migration history (001-052)
  - Backup and recovery procedures
  - Performance monitoring and optimization
  - Maintenance tasks (VACUUM, ANALYZE, reindexing)
  - Troubleshooting guide
  - Best practices and scaling strategies

### 🚀 Quick Links

| Task | Manual | Chapter |
|------|--------|---------|
| **Get started as a user** | [User Guide](./docs/AISHA_CRM_USER_GUIDE.md) | Ch 1: Getting Started |
| **Deploy to production** | [Admin Guide](./docs/AISHA_CRM_ADMIN_GUIDE.md) | Ch 2: Docker Deployment |
| **Set up dev environment** | [Developer Manual](./docs/AISHA_CRM_DEVELOPER_MANUAL.md) | Ch 2: Development Setup |
| **Apply database migration** | [Database Manual Part 1](./docs/AISHA_CRM_DATABASE_MANUAL_PART1.md) | Ch 4: Migrations Management |
| **Configure security** | [Security Manual Part 1](./docs/AISHA_CRM_SECURITY_MANUAL_PART1.md) | Ch 2: Authentication & Authorization |
| **Troubleshoot connection issues** | [Database Manual Part 2](./docs/AISHA_CRM_DATABASE_MANUAL_PART2.md) | Ch 11: Troubleshooting |
| **Review API endpoints** | [Developer Manual](./docs/AISHA_CRM_DEVELOPER_MANUAL.md) | Appendix B: API Reference |
| **Set up monitoring** | [Admin Guide](./docs/AISHA_CRM_ADMIN_GUIDE.md) | Ch 7: Monitoring & Logging |
| **Handle security incident** | [Security Manual Part 2](./docs/AISHA_CRM_SECURITY_MANUAL_PART2.md) | Ch 9: Incident Response |
| **🆕 Configure call flows** | [Admin Guide](./docs/AISHA_CRM_ADMIN_GUIDE.md) | Ch 9.6: Call Flow System |
| **🆕 Set up AI campaigns** | [User Guide](./docs/AISHA_CRM_USER_GUIDE.md) | Ch 10: AI Campaigns |
| **🆕 Test telephony webhooks** | [CALL_FLOW_QUICK_TEST.md](./CALL_FLOW_QUICK_TEST.md) | All Scenarios |
| **🆕 Validate API endpoints** | [NEW_ENDPOINTS_TEST_GUIDE.md](./NEW_ENDPOINTS_TEST_GUIDE.md) | All Tests |

---

## 🎯 Recent Features & Enhancements

### 📞 AI-Powered Telephony & Call Flow System
Complete telephony integration with intelligent call handling:

- **Multi-Provider Support:** Twilio, SignalWire, CallFluent, Thoughtly webhook adapters
- **Smart Lead Creation:** Auto-creates leads from unknown inbound callers
- **AI Transcript Analysis:** Extracts action items, sentiment, customer requests via Braid MCP
- **Activity Auto-Completion:** Detects fulfillment patterns ("I sent you...") and closes pending tasks
- **Call Context Preparation:** AI agents receive WHO to call, WHAT to say, and conversation history
- **Campaign Integration:** Tracks campaign-triggered calls and progress updates

**Documentation:** [Admin Guide Ch 9.6 - Call Flow System](./docs/AISHA_CRM_ADMIN_GUIDE.md#96-call-flow-system) | [Call Flow Quick Test Guide](./CALL_FLOW_QUICK_TEST.md)

### 🚀 AI Campaign Automation
Intelligent campaign execution with background workers:

- **Multi-Channel Campaigns:** Email and AI-powered call campaigns
- **Background Worker:** Automatic campaign execution with advisory locking for multi-instance safety
- **Progress Tracking:** Real-time campaign status, contact reach, and success metrics
- **Smart Scheduling:** Time-zone aware execution with configurable intervals
- **Tenant Isolation:** Campaigns scoped per tenant with data access controls

**Documentation:** [Admin Guide Ch 9.5 - Campaign Worker](./docs/AISHA_CRM_ADMIN_GUIDE.md#95-campaign-worker-management) | [User Guide Ch 10 - AI Campaigns](./docs/AISHA_CRM_USER_GUIDE.md#chapter-10-ai-campaigns)

### 🩺 API Health Monitoring & Testing
Built-in endpoint validation and diagnostics:

- **Automated Endpoint Testing:** One-click validation of all 13+ new telephony and campaign endpoints
- **Error Tracking:** Monitors 404s, 5xx errors, auth failures, timeouts, rate limits
- **Auto-Fix Suggestions:** Copy-paste solutions for common API issues
- **Visual Dashboard:** Real-time health metrics with pass/fail indicators

**Location:** Settings → API Health | **Test Guide:** [NEW_ENDPOINTS_TEST_GUIDE.md](./NEW_ENDPOINTS_TEST_GUIDE.md)

### 🧠 Braid MCP Server Integration
AI-powered transcript analysis and action extraction:

- **Dual-Mode Analysis:** Braid MCP with GPT-4o-mini or pattern-based fallback
- **Tenant-Specific AI Keys:** Automatic OpenAI key resolution per tenant
- **Structured Action Extraction:** Identifies emails, meetings, proposals with priority assignment
- **Redis Memory:** Multi-turn conversation context for better understanding
- **Activity Auto-Creation:** Generates follow-up tasks from call transcripts

**Documentation:** [Admin Guide Ch 9.7 - Braid MCP Server](./docs/AISHA_CRM_ADMIN_GUIDE.md#97-braid-mcp-server)

### ⚡ Performance Optimizations
Significant performance improvements across the application:

- **User Context Centralization:** Reduced `User.me()` API calls by ~90% (from 6-12 calls to 1 per session)
- **Global UserContext:** Single bootstrap fetch with React Context for all components
- **Tenant Resolution Caching:** In-memory TTL cache (60s default) for tenant lookups with Prometheus metrics
- **Performance Logging:** API endpoint timing tracked in `performance_logs` table
- **Database Indexing:** Strategic indexes on foreign keys for faster JOINs

**Documentation:** [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) | [Database Manual - Migration 025](./docs/AISHA_CRM_DATABASE_MANUAL_PART2.md#73-features--optimization-025-036)

---

## ✨ What Makes AI-SHA Special

### 🤖 Executive Assistant, Not Just CRM
AI-SHA isn't a traditional CRM with AI features bolted on. It's an **Executive Assistant** that manages your entire business workflow:

- **Create & Update Records:** Accounts, leads, contacts, opportunities
- **Calendar Management:** Schedule meetings, detect conflicts, suggest alternatives
- **Note Taking:** Capture meeting notes, search across all records
- **Sales Pipeline:** Track opportunities, forecast revenue, manage stages
- **Web Research:** Search companies, enrich data, validate information
- **🆕 Call Management:** Handle inbound/outbound calls with AI transcript analysis
- **🆕 Campaign Automation:** Execute multi-channel campaigns with AI-powered outreach

### 🚀 Powered by Braid SDK
Braid is an **AI-native language designed by LLMs, for LLMs** with:

- **Type Safety:** LLMs generate correct tool calls (no parameter hallucination)
- **Capability Enforcement:** Explicit effect declarations (`!net`, `!clock`, `!fs`)
- **Tenant Isolation:** Automatic `tenant_id` injection prevents data leaks
- **Audit Logging:** Every action tracked for compliance
- **Result Types:** `Result<T, E>` for explicit error handling
- **🆕 MCP Server Integration:** Remote tool execution via HTTP with transcript analysis

**27+ Production Tools** across 8 domains - see [EXECUTIVE_ASSISTANT_TRANSFORMATION.md](./EXECUTIVE_ASSISTANT_TRANSFORMATION.md) for full details.

---

## 🚨 Critical: Read This First

**Before running ANY commands, read:**
- **[System Administrator Guide - Ch 2: Docker Deployment](./docs/AISHA_CRM_ADMIN_GUIDE.md#chapter-2-docker-deployment)** - Production deployment setup
- **[Developer Manual - Ch 2: Development Setup](./docs/AISHA_CRM_DEVELOPER_MANUAL.md#chapter-2-development-setup)** - Local dev environment
- [TERMINAL_RULES.md](./TERMINAL_RULES.md) - **MANDATORY** terminal & directory rules
- [DEV_QUICK_START.md](./DEV_QUICK_START.md) - Development workflow guide
- **🆕 [CALL_FLOW_QUICK_TEST.md](./CALL_FLOW_QUICK_TEST.md)** - Test telephony integration

**Having Git Issues?**
- [GIT_SOLUTION_SUMMARY.md](./GIT_SOLUTION_SUMMARY.md) - **START HERE** for all git help
- [GIT_QUICK_REFERENCE.md](./GIT_QUICK_REFERENCE.md) - Common git commands & fixes
- [GIT_CONFLICT_RESOLUTION.md](./GIT_CONFLICT_RESOLUTION.md) - Fix merge conflicts & clean up branches
- [EXAMPLE_CONFLICT_RESOLUTION.md](./EXAMPLE_CONFLICT_RESOLUTION.md) - Step-by-step walkthrough

**TL;DR:**
1. ALWAYS run `Get-Location` before executing commands
2. Use separate terminals for backend, frontend, and your work
3. Verify directory location - never assume where you are
 4. See **[User Guide](./docs/AISHA_CRM_USER_GUIDE.md)** for feature documentation
 5. See **[Database Manual](./docs/AISHA_CRM_DATABASE_MANUAL_PART1.md)** for database operations
 6. Having git issues? Run `\.\cleanup-branches.ps1` or `./cleanup-branches.sh`

## Getting Started

### Quick Setup

For **detailed setup instructions**, see:
- **Production Deployment:** [System Administrator Guide - Ch 2: Docker Deployment](./docs/AISHA_CRM_ADMIN_GUIDE.md#chapter-2-docker-deployment)
- **Development Setup:** [Developer Manual - Ch 2: Development Setup](./docs/AISHA_CRM_DEVELOPER_MANUAL.md#chapter-2-development-setup)
- **Database Configuration:** [Database Manual - Ch 2: Initial Setup](./docs/AISHA_CRM_DATABASE_MANUAL_PART1.md#chapter-2-initial-setup)

### Initial Setup (Quick Reference)

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure:
   ```
   VITE_BASE44_APP_ID=your_app_id_here  # For data migration only
   # Backend URL:
   # - Local dev (npm run dev backend):       http://localhost:3001
   # - Docker (recommended for this project): http://localhost:4001
   VITE_AISHACRM_BACKEND_URL=http://localhost:4001
   ```
   
   **⚠️ See [Admin Guide - Ch 3: Environment Configuration](./docs/AISHA_CRM_ADMIN_GUIDE.md#chapter-3-environment-configuration) for complete environment setup.**

3. **Set up your backend server**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit backend/.env with your database credentials
   npm run dev  # Starts with auto-restart enabled
   ```
   
   **⚠️ Database setup required - see [Database Manual - Ch 2: Initial Setup](./docs/AISHA_CRM_DATABASE_MANUAL_PART1.md#chapter-2-initial-setup)**

4. **Run the development server**
   ```bash
   npm run dev  # Frontend with hot module replacement
   ```

### Development vs Docker Ports

To avoid confusion when testing, different ports are used for local development vs Docker containers:

| Service | Local Dev | Docker Container |
|---------|-----------|-----------------|
| Frontend | `http://localhost:5173` (Vite default) | `http://localhost:4000` |
| Backend API | `http://localhost:3001` | `http://localhost:4001` |

**Local Development (non-Docker):**
- Start with `npm run dev` (frontend at 5173) and `cd backend && npm run dev` (backend at 3001)
- Or use `\.\start-all.ps1` to start both in background

Note: This project primarily runs in Docker. When using Docker, always use ports 4000 (frontend) and 4001 (backend), and set `VITE_AISHACRM_BACKEND_URL` accordingly.

**Docker Containers (recommended):**
- Start with `docker compose up -d --build`
- Access frontend at `http://localhost:4000`, backend at `http://localhost:4001`
- Ensure root `.env` has `VITE_AISHACRM_BACKEND_URL=http://localhost:4001`

## Quick Start (All Services)

Use the convenience script to start everything at once:
```bash
.\start-all.ps1  # Starts both backend and frontend with auto-restart
```

## Braid MCP Node Server Integration

This repo includes a Dockerized Node.js MCP-style Braid server under `braid-mcp-node-server/`. It exposes the Braid v0 executor (including the CRM adapter) over HTTP for use as a remote tool.

- Health check: `GET http://localhost:8000/health`
- MCP endpoint: `POST http://localhost:8000/mcp/run` (expects `BraidRequestEnvelope`, returns `BraidResponseEnvelope`)
- **🆕 Transcript Analysis:** AI-powered call transcript analysis with action item extraction
- **🆕 Activity Auto-Creation:** Generates follow-up tasks from customer requests
- **🆕 Tenant-Specific Keys:** Automatic OpenAI API key resolution per tenant

### Running the MCP server

There are two ways to run the MCP server:

- **Standalone (recommended):**
  ```bash
  # From repo root
  docker compose -f braid-mcp-node-server/docker-compose.yml up -d --build
  # Server available at http://localhost:8000
  ```

- **Local dev script (if provided):**
  ```bash
  npm run serve:braid
  ```
  This uses `braid-mcp-node-server/docker-compose.yml` to bind the server to `http://localhost:8000`.

### LLM kit integration

The AiSHA Braid LLM kit can treat the MCP server as a remote tool via:

- `braid-llm-kit/tools/mcp-braid-server.json`:
  ```json
  {
    "toolName": "braid-mcp-node-server",
    "type": "http",
    "endpoint": "http://localhost:8000/mcp/run",
    "requestFormat": "BraidRequestEnvelope",
    "responseFormat": "BraidResponseEnvelope"
  }
  ```

Any Braid action with `resource.system: "crm"` sent to this endpoint will be handled by the CRM adapter in `braid-mcp-node-server`, which delegates to the existing AiSHA CRM backend routes.

## Tenant Resolution & Archival

### Canonical Tenant Resolution
All APIs and internal jobs operate **UUID-first** for tenant identity. A shared resolver normalizes any identifier (UUID, legacy slug, or the special `system` slug) to a canonical form:

- Endpoint (single): `GET /api/tenantresolve/:identifier?stats=true`
- Endpoint (batch): `GET /api/tenantresolve?ids=a,b,c&stats=true`
- Endpoint (reset): `POST /api/tenantresolve/reset` - clear cache and reset counters
- Endpoint (metrics): `GET /api/tenantresolve/metrics` - Prometheus-style metrics
- Response fields: `uuid`, `slug`, `found`, `source` (with `-cache` suffix when served from in-memory cache)
- Environment: Set `SYSTEM_TENANT_ID` in `backend/.env` so `'system'` resolves to a stable UUID.

The resolver includes an in‑memory TTL cache (default 60s, override with `TENANT_RESOLVE_CACHE_TTL_MS`) to reduce repeated Supabase lookups under high concurrency.

**Cache Instrumentation:**
- Pass `?stats=true` to any resolve endpoint to include cache statistics in the response
- Visit `/api/tenantresolve/metrics` for Prometheus-compatible metrics:
  - `tenant_resolve_cache_size` - Current cache entries
  - `tenant_resolve_cache_hits_total` - Total cache hits
  - `tenant_resolve_cache_misses_total` - Total cache misses
  - `tenant_resolve_cache_hit_ratio` - Hit ratio (0-1)
  - `tenant_resolve_cache_ttl_ms` - Cache TTL in milliseconds
- Use `POST /api/tenantresolve/reset` to clear cache and reset counters (useful for testing or after tenant schema changes)

### Memory Archival
Ephemeral agent sessions/events stored in Redis are persisted via the archival job:
- Tables: `agent_sessions_archive`, `agent_events_archive` (migration 075)
- Uniqueness: Migration 076 adds a unique constraint on `(tenant_id, user_id, session_id)` to prevent duplicate session rows.
- Upsert Logic: Archival uses `upsert` (conflict on tenant/user/session) ensuring idempotency.
- Provenance: Each archived record embeds a `_tenant` object: `{ input, slug, uuid, source }` aiding audits and trace reviews.

### Operational Guarantees
- Duplicate archiving attempts are safe (no constraint violation).
- Legacy clients sending slugs can rely on the resolve endpoints before invoking CRUD operations.
- Audit and compliance tooling can batch-resolve historical slugs quickly using the batch endpoint.

### Example Batch Resolve
```bash
curl "http://localhost:4001/api/tenantresolve?ids=system,acme-corp,550e8400-e29b-41d4-a716-446655440000"
```

### Recommended Usage Pattern
1. Resolve all external tenant identifiers once at session start.
2. Cache result locally (frontend or MCP adapter) for duration of interaction.
3. Pass canonical UUID (`tenant_id`) in all mutating API calls.
4. Store slug only for display; never for authorization decisions.


## Development Features

### Auto-Restart
Both frontend and backend automatically restart when you save changes:
- **Frontend**: Vite HMR (Hot Module Replacement) - instant updates in browser
- **Backend**: Node.js `--watch` flag - auto-restarts on file changes

### Development Mode
- Backend: `npm run dev` uses `node --watch` for automatic restart
- Frontend: `npm run dev` uses Vite with HMR enabled
- Production: `npm start` (backend) and `npm run build` (frontend)

### Copilot PR reviews
- This repo auto-requests a GitHub Copilot code review on pull requests to `main` (or the default branch).
- Workflow: `.github/workflows/copilot-review.yml`
- Triggers: PR opened, reopened, synchronized, or marked ready for review (not drafts).
- Skip convention: add label `no-copilot` to a PR to prevent Copilot from being requested.
- Requirements: Copilot for Pull Requests must be enabled for your org/repo. You can also enable the built-in setting at Settings → Copilot → Pull requests → “Automatically request a review from GitHub Copilot”.
- Tweaks: adjust the branch condition in the workflow if you want Copilot on other target branches.

### Copilot Instructions & Tasks
This repository includes comprehensive configuration for GitHub Copilot coding agent:

- **Instructions:** `.github/copilot-instructions.md` - Project-specific guidance covering architecture, workflows, conventions, testing practices, and common pitfalls
- **Tasks:** `.copilot/tasks.yml` - Pre-defined task templates for code refactoring, bug fixes, test improvements, and documentation updates
- **Usage:** Assign issues to Copilot with clear descriptions and it will follow these instructions to maintain code quality and consistency

## Building the app

```bash
npm run build
```

## Scripts

### Development Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint
- `npm audit` - Check for security vulnerabilities

### Utility Scripts
- `.\start-all.ps1` - Start both frontend and backend (PowerShell)
- `.\cleanup-branches.ps1` - Clean up git branches (PowerShell)
- `./cleanup-branches.sh` - Clean up git branches (Bash)
- `.\stop-all.ps1` - Stop all background processes

## Project Structure

**For comprehensive architecture documentation, see:**
- **[Developer Manual - Ch 3: Architecture Overview](./docs/AISHA_CRM_DEVELOPER_MANUAL.md#chapter-3-architecture-overview)** - Complete system architecture
- **[Database Manual - Ch 3: Schema Design](./docs/AISHA_CRM_DATABASE_MANUAL_PART1.md#chapter-3-schema-design)** - Database schema (50+ tables)

### Frontend
- `src/api/` - API clients with automatic Ai-SHA → Your Backend fallback
- `src/functions/` - 197 business functions organized in 26 categories
- `src/entities/` - 47 data entity schemas
- `src/components/` - Reusable React components organized by domain
- `src/pages/` - Page-level components and routes
- `src/utils/` - **NEW:** Shared utility modules (logging, validation, permissions) - See `src/utils/README.md`
- `src/hooks/` - Custom React hooks

**See [Developer Manual - Ch 4: Frontend Development](./docs/AISHA_CRM_DEVELOPER_MANUAL.md#chapter-4-frontend-development) for details.**

### Backend
- `backend/server.js` - Express server with **210+ API endpoints**
- `backend/routes/` - API route handlers (**28 categories**)
- `backend/utils/` - **NEW:** Backend utility modules (logging, error handling)
- `backend/.env` - Backend configuration
- `backend/migrations/` - Database migrations (52+ files)
- **🆕 `backend/lib/callFlowHandler.js`** - Telephony webhook processing
- **🆕 `backend/lib/campaignWorker.js`** - Background campaign execution
- **🆕 `backend/routes/telephony.js`** - 8 telephony webhook endpoints
- **🆕 `backend/routes/aicampaigns.js`** - 8 AI campaign management endpoints

**See [Developer Manual - Ch 5: Backend Development](./docs/AISHA_CRM_DEVELOPER_MANUAL.md#chapter-5-backend-development) for details.**

### Database
- PostgreSQL 15+ hosted on Supabase Cloud
- 50+ tables with row-level security (RLS)
- UUID primary keys with tenant isolation
- JSONB metadata for flexible schema

**See [Database Manual Part 1](./docs/AISHA_CRM_DATABASE_MANUAL_PART1.md) for complete schema documentation.**

See also:
- `docs/AI_CONVERSATIONS.md` — AI chat conversations: titles, topics, and Supabase-backed routes

## 🎯 Why Your Own Backend?

**The Problem:** When Ai-SHA went down, your entire app was inaccessible.

**The Solution:** Your own independent backend server that:
- ✅ Hosts all 197+ business functions locally
- ✅ **210+ API endpoints** across 28 categories
- ✅ Stores data in your own PostgreSQL database (Supabase)
- ✅ Auto-failover from Base44 to your backend
- ✅ Complete control - no vendor lock-in
- ✅ Can run on-premise or your own cloud
- ✅ **🆕 AI-powered telephony** with call flow automation
- ✅ **🆕 Campaign worker** for background email/call execution

**For detailed backend documentation, see:**
- **[Developer Manual - Ch 5: Backend Development](./docs/AISHA_CRM_DEVELOPER_MANUAL.md#chapter-5-backend-development)** - Backend architecture and API development
- **[Developer Manual - Appendix B: API Reference](./docs/AISHA_CRM_DEVELOPER_MANUAL.md#appendix-b-api-reference)** - Complete API endpoint listing (210+ endpoints across 28 categories)
- **[Database Manual Part 1](./docs/AISHA_CRM_DATABASE_MANUAL_PART1.md)** - Database architecture and setup
- **🆕 [CALL_FLOW_QUICK_TEST.md](./CALL_FLOW_QUICK_TEST.md)** - Test telephony webhooks and call flows
- **🆕 [NEW_ENDPOINTS_TEST_GUIDE.md](./NEW_ENDPOINTS_TEST_GUIDE.md)** - Test AI campaigns and telephony endpoints

See `backend/README.md` for legacy backend notes.

## Security Notes

⚠️ **Important**: Never commit your `.env` file to version control. It contains sensitive configuration.

For comprehensive security documentation, see:
- **[Security Manual Part 1](./docs/AISHA_CRM_SECURITY_MANUAL_PART1.md)** - Authentication, RLS, permissions, API security, data protection
- **[Security Manual Part 2](./docs/AISHA_CRM_SECURITY_MANUAL_PART2.md)** - Audit logging, monitoring, incident response, compliance (GDPR, CCPA, SOC 2, HIPAA)
- **[Admin Guide - Ch 6: Security Administration](./docs/AISHA_CRM_ADMIN_GUIDE.md#chapter-6-security-administration)** - Security operations and user management

### Key Security Features
- 🔒 **Row-Level Security (RLS)** - Tenant isolation at database level (48+ tables)
- 🔑 **JWT Authentication** - Supabase Auth with bcrypt password hashing
- 👥 **Role-Based Access Control** - 4 roles: SuperAdmin, Admin, Manager, Employee
- 📊 **Audit Logging** - All actions tracked to `audit_log` table
- 🔐 **API Key Management** - Bcrypt-hashed keys with expiration support
- 🛡️ **Rate Limiting** - 100 requests/min per IP/user
- 🚨 **Security Monitoring** - Intrusion detection, suspicious pattern matching

See `SECURITY_PERFORMANCE_REVIEW.md` for legacy security notes.
