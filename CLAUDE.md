# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AiSHA CRM** is an AI-native Executive Assistant CRM system built with React + Vite frontend and Node.js backend. The AI capabilities are powered by **Braid** — a custom domain-specific language created specifically for secure AI-database interactions.

**Current Version:** 3.0.x (December 2025)

### Key Architecture

| Component | Technology |
|-----------|------------|
| **Frontend** | React 18 + Vite, TailwindCSS, shadcn/ui |
| **Backend** | Node.js + Express, 210+ API endpoints |
| **Database** | PostgreSQL 15+ on Supabase, 50+ tables with RLS |
| **AI Tools** | Braid DSL (60+ tools in `braid-llm-kit/`) |
| **Secrets** | Doppler for production, `.env` for local |
| **Containers** | Docker Compose with health checks |

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [docs/USER_GUIDE.md](./docs/USER_GUIDE.md) | End-user guide for CRM operations |
| [docs/ADMIN_GUIDE.md](./docs/ADMIN_GUIDE.md) | System administration, deployment |
| [docs/AI_ASSISTANT_GUIDE.md](./docs/AI_ASSISTANT_GUIDE.md) | AiSHA AI assistant features |
| [docs/DEVELOPER_MANUAL.md](./docs/DEVELOPER_MANUAL.md) | Development setup, architecture |
| [docs/DATABASE_GUIDE.md](./docs/DATABASE_GUIDE.md) | Database schema, migrations |
| [docs/SECURITY_GUIDE.md](./docs/SECURITY_GUIDE.md) | Security, RLS, authentication |
| [docs/BRANDING_GUIDE.md](./docs/BRANDING_GUIDE.md) | Brand assets, colors |

Legacy documentation is archived in `docs/archive/`.

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

2. **Distributed MCP**: Tools execute via `braid-mcp-node-server/` over HTTP
   - Used for external integrations, scaling
   - Redis job queue for high concurrency

### Key Braid Files

- `backend/lib/braidIntegration-v2.js` — Tool registry, system prompt, execution
- `backend/lib/entityLabelInjector.js` — Custom entity terminology
- `backend/lib/tenantContextDictionary.js` — Tenant context for AI
- `backend/routes/ai.js` — AI chat endpoint (lines 491, 1706 load context)

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

```powershell
# MANDATORY - Verify location before ANY command
Get-Location

# Navigate if needed
cd C:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53
```

### Docker vs Local Development

| Mode | Frontend | Backend |
|------|----------|---------|
| **Local Dev** | http://localhost:5173 | http://localhost:3001 |
| **Docker** | http://localhost:4000 | http://localhost:4001 |

**Docker Mode:**
```bash
docker compose up -d --build
```

**Local Dev Mode:**
```bash
npm run dev                    # Frontend (port 5173)
cd backend && npm run dev      # Backend (port 3001)
```

---

## Essential Commands

### Development

```powershell
npm run dev           # Frontend with HMR
cd backend && npm run dev  # Backend with auto-restart
```

### Docker

```powershell
docker compose up -d --build      # Start all
docker compose logs -f backend    # View logs
docker compose down               # Stop all
```

### Testing

```powershell
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright E2E
npm run lint          # ESLint
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
│   └── hooks/              # Custom React hooks
├── backend/                # Node.js API server
│   ├── routes/             # Express routes (28 categories)
│   ├── lib/                # Core libraries
│   │   ├── braidIntegration-v2.js  # Braid tool execution
│   │   ├── entityLabelInjector.js  # Custom terminology
│   │   └── tenantContextDictionary.js
│   └── migrations/         # Database migrations
├── braid-llm-kit/          # Braid DSL tools
│   └── examples/assistant/ # AI tool definitions
├── braid-mcp-node-server/  # Distributed MCP server
├── docs/                   # Documentation (7 core guides)
├── scripts/                # Utility scripts
└── docker-compose.yml      # Container orchestration
```

---

## Backend Route Organization

**Core CRM:**
- `accounts.js`, `contacts.js`, `leads.js`, `opportunities.js`
- `activities.js`, `notes.js`, `bizdevsources.js`

**AI & Automation:**
- `ai.js` — AI chat, summarization, tools
- `aicampaigns.js` — AI campaigns
- `workflows.js` — Workflow automation

**System:**
- `system.js` — Health checks, diagnostics
- `reports.js` — Dashboard stats
- `tenants.js`, `users.js`, `permissions.js`

---

## AI Engine Architecture

**Location:** `backend/lib/aiEngine/`

**Exports:**
- `selectLLMConfigForTenant()` — Get provider/model for tenant
- `resolveLLMApiKey()` — Resolve API key hierarchy
- `generateChatCompletion()` — Call LLM with failover

**Providers:** OpenAI (gpt-4o), Anthropic (claude-3-5-sonnet), Groq (llama-3.3-70b)

---

## Testing Strategy

### Unit Tests (Vitest)
- Location: `src/**/*.test.{js,jsx}`
- Run: `npm run test`

### E2E Tests (Playwright)
- Location: `tests/e2e/`
- Run: `npm run test:e2e`

---

## Security & Performance

**Security:**
- Row-Level Security (RLS) on all tables
- JWT authentication via Supabase Auth
- Helmet.js security headers
- Rate limiting

**Performance:**
- Redis caching (memory + cache layers)
- Tenant context dictionary caching
- Dashboard bundle RPC for single-query stats

---

## Troubleshooting

### Backend Not Restarting
1. Use `npm run dev` (not `npm start`)
2. Check terminal for errors
3. Manual restart: `Ctrl+C` then `npm run dev`

### Frontend Not Updating
1. Check browser console
2. Hard refresh: `Ctrl+Shift+R`
3. Clear Vite cache: Delete `.vite/`

### Port Conflicts
```powershell
Get-NetTCPConnection -LocalPort 3001 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## Orchestra Control Layer (MANDATORY FOR AI)

Before modifying code, read:

1. `orchestra/ARCHITECTURE.md`
2. `orchestra/CONVENTIONS.md`
3. `orchestra/PLAN.md` — Current active goal/tasks
4. `orchestra/context/interfaces.md` — Key contracts

**Rules:**
- Only work on tasks listed as **Active** in `PLAN.md`
- Default mode is **BUGFIX-FIRST** — no new features unless explicitly marked
- Keep changes small and localized
- Preserve Docker ports, Supabase setup, tenant isolation

If `PLAN.md` is empty or ambiguous, **ask the user** before making changes.
