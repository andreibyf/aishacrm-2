# AiSHA CRM

**AI-SHA CRM: AI Super Hi-performing Assistant** — Executive AI Assistant powered by Braid SDK.

Built with React + Vite frontend and Node.js backend, featuring 126 AI-native tools across 24 Braid modules for full CRM lifecycle management.

> **Version 3.0.x** | December 2025

---

## 📚 Documentation

| Document                                                          | Description                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| [USER_GUIDE.md](./docs/user-guides/USER_GUIDE.md)                 | Complete end-user guide for CRM operations            |
| [ADMIN_GUIDE.md](./docs/admin-guides/ADMIN_GUIDE.md)              | System administration, deployment, tenant management  |
| [AI_ASSISTANT_GUIDE.md](./docs/user-guides/AI_ASSISTANT_GUIDE.md) | AiSHA AI assistant features and capabilities          |
| [DEVELOPER_MANUAL.md](./docs/developer-docs/DEVELOPER_MANUAL.md)  | Development setup, architecture, API reference        |
| [DATABASE_GUIDE.md](./docs/developer-docs/DATABASE_GUIDE.md)      | Database schema, migrations, Supabase configuration   |
| [SECURITY_GUIDE.md](./docs/admin-guides/SECURITY_GUIDE.md)        | Security best practices, RLS policies, authentication |
| [BRANDING_GUIDE.md](./docs/references/BRANDING_GUIDE.md)          | Brand assets, colors, typography                      |

**Legacy docs** are archived in `docs/archive/` for reference.

---

## 🚀 Quick Start

### Docker (Recommended)

```bash
docker compose up -d --build
```

- **Frontend**: http://localhost:4000
- **Backend API**: http://localhost:4001

### Local Development

```bash
# Install dependencies
npm install

# Start frontend (port 5173)
npm run dev

# In another terminal - start backend (port 3001)
cd backend && npm install && npm run dev
```

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

See [ADMIN_GUIDE.md](./docs/admin-guides/ADMIN_GUIDE.md) for complete deployment instructions.

---

## ✨ Key Features

### 🤖 Executive AI Assistant (AiSHA)

AiSHA isn't a traditional CRM with AI bolted on — it's an **Executive Assistant** that manages your entire business workflow:

- **CRM Management**: Create, update, search accounts, leads, contacts, opportunities
- **Calendar & Activities**: Schedule meetings, track tasks, manage deadlines
- **Notes & Documentation**: Create, search, and organize notes across all records
- **Sales Pipeline**: Track opportunities, forecast revenue, manage stages
- **Web Research**: Search for company information, fetch external data
- **AI Calling**: Initiate outbound calls via CallFluent or Thoughtly AI agents
- **CRM Navigation**: Navigate users to any page via voice or chat commands
- **Workflow Automation**: Create workflows from templates with customizable parameters

### 🔧 v3.0.0 CRM Lifecycle

```
BizDev Source → promote → Lead → qualify → Lead (qualified) → convert → Contact + Account + Opportunity
```

- **BizDev Sources**: Raw prospect data from various channels
- **Leads**: Qualified prospects being nurtured
- **Contacts**: Individuals with relationships to accounts
- **Accounts**: Companies/organizations (B2B) or individuals (B2C)
- **Opportunities**: Sales deals with pipeline stages

### 🧠 Braid: AI-Native Database Language

**Braid** is a custom domain-specific language (DSL) created specifically for AiSHA CRM to **enhance and secure AI-database interactions**. Developed collaboratively by the project creator and AI companions, Braid solves the fundamental challenge of giving AI assistants safe, structured access to production databases.

#### Why Braid Was Created

Traditional approaches to AI+database integration have critical flaws:

- **Raw SQL is dangerous**: LLMs can hallucinate destructive queries
- **ORM wrappers are leaky**: No tenant isolation guarantees
- **JSON schemas are verbose**: Tool definitions become unwieldy at scale

Braid addresses these with a purpose-built language:

```braid
// Example: Safe lead creation with automatic tenant isolation
fn createLead(tenant: String, first_name: String, last_name: String, email: String) -> Result<Lead, CRMError> !net {
  let response = http.post("/api/leads", {
    body: { tenant_id: tenant, first_name, last_name, email }
  });
  return match response {
    Ok{value} => Ok(value.data.lead),
    Err{error} => Err({ tag: "CreationError", code: error.status })
  };
}
```

#### Key Braid Features

| Feature                        | Benefit                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| **Type-Safe Parameters**       | LLMs generate correct tool calls — no parameter hallucination |
| **Automatic Tenant Injection** | Every operation is scoped to the current tenant               |
| **Effect Declarations**        | `!net`, `!fs`, `!clock` make side effects explicit            |
| **Result Types**               | `Result<T, E>` forces explicit error handling                 |
| **Whitelist Enforcement**      | Tools can only access pre-approved endpoints                  |
| **126 Production Tools**       | CRM, calendar, notes, telephony, workflows, navigation        |

#### Dual Execution Modes

Braid supports two execution paths:

1. **In-Process (Primary)**: Tools execute directly in the backend via `braidIntegration-v2.js`
   - Used for AiSHA chat interface
   - Low latency, synchronous execution
   - Tools defined in `braid-llm-kit/examples/assistant/*.braid`

2. **Distributed MCP**: Tools execute via HTTP on the Braid MCP Node Server
   - Used for external integrations, parallel execution, scaling
   - Containerized in `braid-mcp-node-server/`
   - Supports multi-tenant job queuing with Redis

#### Braid Tool Categories

```
braid-llm-kit/examples/assistant/
├── accounts.braid        # Account CRUD operations
├── activities.braid      # Calendar and task management
├── bizdev-sources.braid  # BizDev source management
├── contacts.braid        # Contact CRUD operations
├── leads.braid           # Lead management and qualification
├── lifecycle.braid       # v3.0.0 promotion/conversion workflows
├── navigation.braid      # CRM page navigation commands
├── notes.braid           # Note creation and search
├── opportunities.braid   # Sales pipeline management
├── snapshot.braid        # Tenant data overview
├── suggestions.braid     # AI-generated suggestions
├── telephony.braid       # AI calling integration
├── web-research.braid    # External data fetching
└── workflows.braid       # Workflow automation
```

See `braid-llm-kit/README.md` for complete Braid documentation.

### 🏗️ Architecture

| Component      | Technology                                     |
| -------------- | ---------------------------------------------- |
| **Frontend**   | React 18 + Vite, TailwindCSS, shadcn/ui        |
| **Backend**    | Node.js + Express, 210+ API endpoints          |
| **Database**   | PostgreSQL 17+ on Supabase, 88 tables with RLS |
| **AI Tools**   | Braid DSL (`.braid` files in `braid-llm-kit/`) |
| **Secrets**    | Doppler for production, `.env` for local       |
| **Caching**    | Redis (memory + cache layers)                  |
| **Containers** | Docker Compose with health checks              |

---

## 📁 Project Structure

```
├── src/                    # React frontend
│   ├── components/         # UI components by domain
│   ├── pages/              # Page-level components
│   └── hooks/              # Custom React hooks
├── backend/                # Node.js API server
│   ├── routes/             # Express routes (28 categories)
│   ├── lib/                # Core libraries (AI, caching, auth)
│   └── migrations/         # Database migrations
├── braid-llm-kit/          # Braid DSL tools
│   └── examples/assistant/ # AI tool definitions (.braid files)
├── braid-mcp-node-server/  # MCP server for distributed AI
├── docs/                   # Documentation (7 core guides)
├── scripts/                # Utility scripts
└── docker-compose.yml      # Container orchestration
```

---

## 🔒 Security

- **Row-Level Security (RLS)**: Tenant isolation at database level
- **JWT Authentication**: Supabase Auth with bcrypt password hashing
- **Role-Based Access Control**: SuperAdmin, Admin, Manager, Employee
- **Audit Logging**: All actions tracked to `audit_log` table
- **Rate Limiting**: 100 requests/min per IP/user

See [SECURITY_GUIDE.md](./docs/SECURITY_GUIDE.md) for complete security documentation.

---

## 🛠️ Development

### Scripts

```bash
npm run dev       # Start frontend dev server
npm run build     # Production build
npm run lint      # Run ESLint
npm run test      # Run tests
```

### Docker Commands

```bash
docker compose up -d --build     # Start all services
docker compose logs -f backend   # View backend logs
docker compose down              # Stop all services
```

### Port Reference

| Service   | Local Dev | Docker |
| --------- | --------- | ------ |
| Frontend  | 5173      | 4000   |
| Backend   | 3001      | 4001   |
| Braid MCP | —         | 8000   |

---

## 📞 Telephony Integration

AiSHA integrates with AI calling providers:

- **CallFluent**: AI-powered outbound calls
- **Thoughtly**: Conversational AI agents
- **Twilio/SignalWire**: Webhook adapters for call events

See [ADMIN_GUIDE.md](./docs/ADMIN_GUIDE.md) for telephony configuration.

---

## 🔄 Braid MCP Server

The **Braid MCP (Model Context Protocol) Node Server** is the distributed execution engine for Braid tools. Built in TypeScript, it enables remote AI tool execution over HTTP with enterprise features.

### Architecture

```
┌─────────────────┐     HTTP      ┌─────────────────────┐     Redis     ┌──────────────┐
│  AiSHA Backend  │ ───────────►  │  Braid MCP Server   │ ◄───────────► │  Job Queue   │
│  (port 4001)    │               │  (port 8000)        │               │  (BullMQ)    │
└─────────────────┘               └─────────────────────┘               └──────────────┘
                                           │
                                           ▼
                                  ┌─────────────────────┐
                                  │  CRM Adapter        │
                                  │  (crm.ts)           │
                                  └─────────────────────┘
```

### Key Features

- **HTTP API**: RESTful endpoint for tool execution (`POST /mcp/run`)
- **Master-Worker Mode**: Scalable job queue with Redis for high-concurrency workloads
- **Tenant Isolation**: Every request scoped by `tenant_id`
- **Shared Docker Network**: Communicates with backend via `aishanet` bridge network
- **Health Monitoring**: Built-in health checks and metrics

### Running the MCP Server

```bash
# Start MCP server (standalone)
docker compose -f braid-mcp-node-server/docker-compose.yml up -d --build

# Health check
curl http://localhost:8000/health

# Execute a Braid tool
curl -X POST http://localhost:8000/mcp/run \
  -H "Content-Type: application/json" \
  -d '{"tool": "list_leads", "tenant_id": "your-tenant-uuid", "params": {}}'
```

### Directory Structure

```
braid-mcp-node-server/
├── src/
│   ├── server.ts           # Express server with 3 modes: server, node, standalone
│   ├── lib/jobQueue.ts     # BullMQ job queue for master-worker pattern
│   └── braid/adapters/
│       └── crm.ts          # CRM adapter for Supabase operations
├── docker-compose.yml      # Production container config
└── docker-compose.local.yml # Local dev with .env file
```

See `braid-mcp-node-server/README.md` for complete documentation.

---

## 📝 License

Proprietary. All rights reserved.

---

## 🔗 Quick Links

- **Changelog**: [CHANGELOG.md](./CHANGELOG.md)
- **Claude Instructions**: [CLAUDE.md](./CLAUDE.md)
- **Docs Index**: [docs/README.md](./docs/README.md)

# Trigger workflow
