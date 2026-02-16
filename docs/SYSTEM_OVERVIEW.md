# AiSHA CRM — System Overview

> **Version:** 3.0.x | **Updated:** 2026-02-15 | **Audience:** Developers, AI assistants, onboarding engineers

> This document is an index, not a duplication of logic.
> Always defer to the referenced files for canonical behavior.

## System Identity

AiSHA CRM is a **multi-tenant, AI-native Executive Assistant CRM**. It combines traditional CRM entity management with an AI chat interface powered by **Braid** — a custom DSL for secure AI-database interactions. The system supports multiple LLM providers with automatic failover.

## Runtime Topology

| Service | Container | Host Port | Internal Port | Purpose |
|---------|-----------|-----------|---------------|---------|
| **frontend** | `aishacrm-frontend` | 4000 | 3000 | React/Vite SPA |
| **backend** | `aishacrm-backend` | 4001 | 3001 | Express API server |
| **redis-memory** | `aishacrm-redis-memory` | 6379 | 6379 | Ephemeral: sessions, presence, real-time (256 MB LRU) |
| **redis-cache** | `aishacrm-redis-cache` | 6380 | 6379 | Persistent: stats, aggregations, response caches (512 MB LRU) |
| **db** | `aishacrm-db` | 5432 | 5432 | PostgreSQL 15 (optional, profile `migration-testing`) |
| **n8n** | `aishacrm-n8n` | 5678 | 5678 | Workflow automation (optional, profile `workflows`) |

**Network:** `aishanet` (Docker bridge). Local dev uses ports 5173 (frontend) and 3001 (backend) directly.

## Request Flow

```
Client → frontend (React/Vite :4000)
       → backend (Express :4001)
       → middleware stack (see below)
       → route handler
       → Supabase PostgreSQL (RLS-enforced)
       → response
```

### Middleware Stack (order of execution)

1. `helmet()` — Security headers
2. `compression()` — Response compression
3. `morgan('combined')` — HTTP request logging
4. `cookieParser()` — Cookie parsing
5. `attachRequestContext` — Request-scoped context
6. `rateLimiter` — 120 req/min per IP (configurable)
7. `cors()` — Origin validation with credentials
8. `express.json()` / `express.urlencoded()` — Body parsing (10 MB limit)
9. `performanceLogger()` — API performance tracking
10. `productionSafetyGuard()` — Blocks writes to production unless allowed
11. `intrusionDetection` — IDR system
12. `authenticateRequest` — JWT auth via Supabase Auth

Per-route middleware: `validateTenant`, `routerGuard`, `tenantScopedId`, `deprecation`.

## AI Pipeline

```
Chat request → intentRouter → intentClassifier
             → aiEngine (multi-provider failover)
             → Braid tool execution (braidIntegration-v2.js)
             → Supabase query (tenant-scoped)
             → response
```

### Execution Modes

| Mode | Entry Point | Use Case |
|------|-------------|----------|
| **In-process** (primary) | `backend/lib/braidIntegration-v2.js` | AiSHA chat interface, low latency |
| **Distributed MCP** | `braid-mcp-node-server/` | External integrations, scaling via Redis job queue |

### LLM Providers (failover order configurable per tenant)

| Provider | Models | Capabilities |
|----------|--------|-------------|
| OpenAI | gpt-4o, gpt-4o-mini | `chat_tools`, `json_strict` |
| Anthropic | claude-3-5-sonnet, claude-3-5-haiku | `chat_tools`, `json_strict` |
| Groq | llama-3.3-70b | `brain_read_only`, `brain_plan_actions` |
| Local | ollama, lmstudio | Development/testing |

## Multi-Tenancy Model

- Every table has a `tenant_id UUID` column with RLS policies enforcing isolation.
- `validateTenant` middleware injects `req.tenant.id` (UUID) on every request.
- **Never use `tenant_id_text`** (deprecated slug-based field).
- Per-tenant LLM overrides via `LLM_PROVIDER__TENANT_<UUID>` / `LLM_MODEL__TENANT_<UUID>` env vars.

## Data Layer

- **Primary DB:** Supabase PostgreSQL 15+, 50+ tables, full RLS.
- **Redis Memory** (port 6379): Ephemeral — presence, sessions, real-time state. Managed by `memoryClient.js`.
- **Redis Cache** (port 6380): Persistent — stats, aggregations, response caches. Managed by `cacheManager.js`.
- **Secrets:** Doppler (production), `.env` files (local), `.env.local` with `DOPPLER_TOKEN` (Docker).

## Background Workers

| Worker | File | Purpose |
|--------|------|---------|
| Campaign worker | `backend/lib/campaignWorker.js` | AI campaign processing |
| AI triggers worker | `backend/lib/aiTriggersWorker.js` | C.A.R.E. trigger evaluation |
| Email worker | `backend/workers/emailWorker.js` | Email processing |
| Task workers | `backend/workers/taskWorkers.js` | Background task processing |
| Health monitor | `backend/lib/healthMonitor.js` | Service health monitoring |

All workers are initialized in `backend/server.js` during startup.

## Key Entry Points

| Path | Role |
|------|------|
| `backend/server.js` | Express app bootstrap, worker init, health endpoint |
| `backend/startup/initDatabase.js` | Database connection setup |
| `backend/startup/initMiddleware.js` | Middleware stack registration |
| `backend/startup/initServices.js` | Redis, cache, services init |
| `backend/middleware/` | Auth, tenant, rate limiting, IDR (11 files) |
| `backend/routes/` | Express route handlers (88 files, 210+ endpoints) |
| `backend/lib/aiEngine/` | Multi-provider LLM engine (8 files) |
| `backend/lib/braidIntegration-v2.js` | Braid tool registry, system prompt, execution |
| `backend/lib/braid/` | Braid core: registry, execution, policies, metrics |
| `src/main.jsx` | React 18 app entry, router setup |
| `src/api/` | Frontend API client with circuit breaker failover |
| `braid-llm-kit/examples/assistant/` | Braid tool definitions (20 `.braid` files) |

## CRM Lifecycle (v3.0.0)

```
BizDev Source → promote → Lead → qualify → Lead (qualified) → convert → Contact + Account + Opportunity
```

| Action | API Endpoint | Braid Tool |
|--------|-------------|------------|
| Promote | `POST /api/bizdevsources/:id/promote` | `advanceToLead()` |
| Qualify | `PUT /api/v2/leads/:id` (status=qualified) | `advanceToQualified()` |
| Convert | `POST /api/leads/:id/convert` | `advanceToAccount()` |

## Documentation Index

| Document | Description |
|----------|-------------|
| [COPILOT_PLAYBOOK.md](../COPILOT_PLAYBOOK.md) | Operations guide, testing, migrations — **start here** |
| [DEVELOPER_MANUAL.md](DEVELOPER_MANUAL.md) | Development setup, full architecture |
| [DATABASE_GUIDE.md](DATABASE_GUIDE.md) | Schema, migrations, trigger patterns |
| [SECURITY_GUIDE.md](SECURITY_GUIDE.md) | RLS, authentication, security hardening |
| [AI_ASSISTANT_GUIDE.md](AI_ASSISTANT_GUIDE.md) | AiSHA AI assistant features |
| [AI_ARCHITECTURE_AISHA_AI.md](AI_ARCHITECTURE_AISHA_AI.md) | AI architecture deep-dive |
| [BRAID_ARCHITECTURE.md](BRAID_ARCHITECTURE.md) | Braid DSL architecture |
| [CARE_SETUP_GUIDE.md](CARE_SETUP_GUIDE.md) | C.A.R.E. engine configuration |
| [CARE_CUSTOMER_ADAPTIVE_RESPONSE_ENGINE.md](CARE_CUSTOMER_ADAPTIVE_RESPONSE_ENGINE.md) | C.A.R.E. engine overview |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | System administration, deployment |
| [USER_GUIDE.md](USER_GUIDE.md) | End-user CRM operations |
| [BRANDING_GUIDE.md](BRANDING_GUIDE.md) | Brand assets, colors |
| [CIRCUIT_BREAKER.md](CIRCUIT_BREAKER.md) | Frontend failover patterns |
| [R2_ARTIFACT_STORAGE.md](R2_ARTIFACT_STORAGE.md) | Cloudflare R2 integration |
| [WORKFLOW_FEATURES_IMPLEMENTATION.md](WORKFLOW_FEATURES_IMPLEMENTATION.md) | Workflow implementation details |
| [Intel-iGPU-Local-AI-Development-Guide.md](Intel-iGPU-Local-AI-Development-Guide.md) | Local AI setup with Intel GPU |

**Subdirectories:** `docs/archive/` (legacy), `docs/audits/`, `docs/backend/`, `docs/product/`, `docs/reports/`.

## Orchestra Control Layer

The `orchestra/` directory governs AI-assisted development:

| File | Purpose |
|------|---------|
| `orchestra/PLAN.md` | Active task queue — check before making changes |
| `orchestra/ARCHITECTURE.md` | Wave-orchestra model (4 layers) |
| `orchestra/CONVENTIONS.md` | Change policy: bugfix-first, minimal patches |
| `orchestra/context/interfaces.md` | Key contracts and interface definitions |

**Default mode:** BUGFIX-FIRST. No new features unless explicitly marked active in `PLAN.md`.

## Execution Guardrails for AI Agents

- All data access must be tenant-scoped.
- Never bypass middleware for write operations.
- Use existing service initialization flow.
- Prefer minimal patches over refactors.
