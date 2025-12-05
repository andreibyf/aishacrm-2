# Aisha CRM

**AI-SHA CRM: AI Super Hi-performing Assistant** - Comprehensive Executive Assistant powered by Braid SDK.

Built with React + Vite frontend and Node.js backend, featuring 27+ AI-native tools for full CRM lifecycle management.

## ✨ What Makes AI-SHA Special

### 🤖 Executive Assistant, Not Just CRM
AI-SHA isn't a traditional CRM with AI features bolted on. It's an **Executive Assistant** that manages your entire business workflow:

- **Create & Update Records:** Accounts, leads, contacts, opportunities
- **Calendar Management:** Schedule meetings, detect conflicts, suggest alternatives
- **Note Taking:** Capture meeting notes, search across all records
- **Sales Pipeline:** Track opportunities, forecast revenue, manage stages
- **Web Research:** Search companies, enrich data, validate information

### 🚀 Powered by Braid SDK
Braid is an **AI-native language designed by LLMs, for LLMs** with:

- **Type Safety:** LLMs generate correct tool calls (no parameter hallucination)
- **Capability Enforcement:** Explicit effect declarations (`!net`, `!clock`, `!fs`)
- **Tenant Isolation:** Automatic `tenant_id` injection prevents data leaks
- **Audit Logging:** Every action tracked for compliance
- **Result Types:** `Result<T, E>` for explicit error handling

**27 Production Tools** across 7 domains - see [EXECUTIVE_ASSISTANT_TRANSFORMATION.md](./EXECUTIVE_ASSISTANT_TRANSFORMATION.md) for full details.

## 🚨 Critical: Read This First

**Before running ANY commands, read:**
- [TERMINAL_RULES.md](./TERMINAL_RULES.md) - **MANDATORY** terminal & directory rules
- [DEV_QUICK_START.md](./DEV_QUICK_START.md) - Development workflow guide

**API Documentation:**
- [API_V2_MIGRATION_GUIDE.md](./API_V2_MIGRATION_GUIDE.md) - v2 AI-enhanced endpoints
- [DEPRECATION_HEADERS.md](./DEPRECATION_HEADERS.md) - v1 sunset timeline
- [API_HEALTH_MONITORING.md](./API_HEALTH_MONITORING.md) - Self-healing API monitoring

**TL;DR:**
1. ALWAYS run `Get-Location` before executing commands
2. Use separate terminals for backend, frontend, and your work
3. Verify directory location - never assume where you are

## Getting Started

### Initial Setup

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

3. **Set up your backend server**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit backend/.env with your database credentials
   npm run dev  # Starts with auto-restart enabled
   ```

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

## Building the app

```bash
npm run build
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint
- `npm audit` - Check for security vulnerabilities

## Project Structure

### Frontend
- `src/api/` - API clients with automatic Ai-SHA → Your Backend fallback
- `src/functions/` - 197 business functions organized in 26 categories
- `src/entities/` - 47 data entity schemas
- `src/components/` - Reusable React components organized by domain
- `src/pages/` - Page-level components and routes
- `src/utils/` - Utility functions and helpers
- `src/hooks/` - Custom React hooks

### Backend
- `backend/server.js` - Express server with 197 API endpoints
- `backend/routes/` - API route handlers (26 categories)
- `backend/.env` - Backend configuration

See also:
- `docs/AI_CONVERSATIONS.md` — AI chat conversations: titles, topics, and Supabase-backed routes

## 🎯 Why Your Own Backend?

**The Problem:** When Ai-SHA went down, your entire app was inaccessible.

**The Solution:** Your own independent backend server that:
- ✅ Hosts all 197 functions locally
- ✅ Stores data in your own PostgreSQL database
- ✅ Auto-failover from Base44 to your backend
- ✅ Complete control - no vendor lock-in
- ✅ Can run on-premise or your own cloud

See `backend/README.md` for backend setup details.

## Security Notes

⚠️ **Important**: Never commit your `.env` file to version control. It contains sensitive configuration.

See `SECURITY_PERFORMANCE_REVIEW.md` for detailed security and performance guidelines.

---

## 📁 Documentation Organization

**66 Active Documents** organized by category:

### Core Manuals
- `AISHA_CRM_USER_GUIDE.md` - End-user documentation
- `AISHA_CRM_ADMIN_GUIDE.md` - Administrator guide
- `AISHA_CRM_DEVELOPER_MANUAL.md` - Developer reference (incl. v2 APIs)
- `AISHA_CRM_DATABASE_MANUAL_PART1/2.md` - Schema documentation
- `AISHA_CRM_SECURITY_MANUAL_PART1/2.md` - Security architecture

### API & Integration
- `API_V2_MIGRATION_GUIDE.md` - v2 AI-enhanced endpoints ⭐ **NEW**
- `DEPRECATION_HEADERS.md` - v1 sunset timeline ⭐ **NEW**
- `API_HEALTH_MONITORING.md` - Self-healing API system
- `API_ERROR_TYPES.md` - Error handling patterns

### Database & Setup
- `SUPABASE_SETUP_GUIDE.md` - Database setup (consolidated)
- `SUPABASE_AUTH_GUIDE.md` - Authentication (consolidated)
- `DATABASE_UUID_vs_TENANT_ID.md` - Tenant identification
- `DATABASE_CONFIGURATION.md` - Connection settings

### Infrastructure
- `DOCKER_DEPLOYMENT.md` - Docker deployment guide
- `DOCKER-SETUP.md` - Local Docker setup
- `CLOUDFLARE_TUNNEL_CONFIG.md` - Tunnel configuration
- `CI_CD_SCHEMA_VALIDATION.md` - CI/CD pipeline

### Archive
Historical and completed work documentation is preserved in `docs/archive/` (46 files) for reference.

---

*Last Updated: December 4, 2025*

