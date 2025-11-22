# AiSHA CRM – Wave-Orchestra Architecture

This document defines how AI-assisted development operates on AiSHA CRM. It sits *on top of* the existing architecture (React/Vite frontend, Express backend, Supabase/Postgres, dual Redis, Braid SDK, Docker). It does not replace the app; it controls how agents are allowed to touch it. 

## 1. Baseline System Architecture (Ground Truth)

AiSHA CRM is:

- **Frontend:** React 18 SPA running under Vite, using Tailwind, shadcn/ui, React Router, and TanStack Query (optional) for server state. :contentReference[oaicite:2]{index=2}  
- **Backend:** Node 22 / Express API server with ~210+ endpoints organized by domain (accounts, contacts, leads, opportunities, activities, users, tenants, workflows, AI, etc.). :contentReference[oaicite:3]{index=3}  
- **Database:** Supabase/Postgres with RLS and tenant isolation; tenant UUID is the primary isolation key. :contentReference[oaicite:4]{index=4}  
- **Caching & Memory:** Two Redis instances:
  - `REDIS_MEMORY_URL` (ephemeral – presence, session, real-time coordination).
  - `REDIS_CACHE_URL` (persistent cache – activity stats, aggregations, response caching). :contentReference[oaicite:5]{index=5}  
- **AI Layer:** Braid SDK plus OpenAI/GitHub models and MCP tools, hooked through backend AI routes and frontend AI components. :contentReference[oaicite:6]{index=6}  
- **Orchestration/Deployment:** Docker + docker-compose with fixed external ports:
  - Frontend: container 5173 → host 4000
  - Backend: container 3001 → host 4001 :contentReference[oaicite:7]{index=7}  

All AI agents must respect this architecture and never assume a different topology.

## 2. Wave-Orchestra Model

We use a 4-layer orchestra to control AI work:

1. **Layer 1 – Orchestrator**
2. **Layer 2 – Agent Context Hub**
3. **Layer 3 – Specialist Agents**
4. **Layer 4 – Integration Validator**

### 2.1 Layer 1 – Orchestrator

Responsibilities:

- Accept an `OrchestrationGoal`:
  - `type`: `"bugfix"` or `"feature"`
  - `title`, `description`
  - optional metadata (stack traces, logs, affected modules).
- Decompose the goal into **tasks** assigned to specialist agents.
- Group tasks into **waves**:
  - A *wave* is a controlled batch of tasks that execute together, then stop for validation before the next batch.
- Enforce bugfix vs feature rules:
  - **Bugfix mode:** strict, surgical changes only.
  - **Feature mode:** broader changes allowed, but still constrained.

The Orchestrator never edits business code directly. It plans tasks and calls specialists.

### 2.2 Layer 2 – Agent Context Hub

Responsibilities:

- Build minimal, precise context packets per task:
  - Target files (based on routes, components, stack traces, or config).
  - Relevant interface summaries from `orchestra/context/interfaces.md`.
  - Global conventions from `orchestra/CONVENTIONS.md`.
- Avoid full-repo dumps. Each call gets:
  - Only the files it needs.
  - Tenant/security constraints.
  - Caching/Redis usage rules where relevant.

This makes each LLM call stateless and reproducible, independent of any external chat session or Copilot history.

### 2.3 Layer 3 – Specialist Agents

Specialists operate inside their domain and in a specific mode (bugfix vs feature):

- **Backend Agent:**
  - Touches only backend Express routes, services, repositories, and integrations (e.g., Redis memory/cache usage, campaign worker). :contentReference[oaicite:8]{index=8}  
- **Frontend Agent:**
  - Touches React components, hooks, state management, and routing – no backend, no DB.
- **Test Agent:**
  - Adds/updates unit, integration, and E2E tests with a focus on regression coverage.
- **Infra/Performance Agent (optional):**
  - Deals with Redis usage, cache TTLs, performance profiling, Docker settings, and rate limiting. :contentReference[oaicite:9]{index=9}  

Each agent:

- Receives a `Task` + `AgentContextPacket`.
- Returns structured output: patches + notes + optional follow-up tasks.
- Must treat **bugfix-first** policy as hard law (see CONVENTIONS).

### 2.4 Layer 4 – Integration Validator

Responsibilities:

- Run after each wave:
  - Type checks / build.
  - Test suites (unit/integration/E2E as configured).
  - Domain-level sanity checks (e.g., tenant isolation assumptions, Redis usage constraints, rate limits, campaign worker safety). :contentReference[oaicite:10]{index=10}  
- Enforce change-size heuristics:
  - For bugfix goals, flag if too many files changed or diff is too large.
- Produce a **wave report** summarizing:
  - Root cause (if identified).
  - Files touched.
  - Tests added/updated.
  - Known risks.

The validator does not silently “fix” things. It blocks or warns; humans decide.

## 3. Wave Types

### 3.1 Bugfix Wave

Used for resolving defects. Defaults whenever the goal is created from a bug report.

Rules:

- Scope is limited to the smallest set of files that can:
  - Reproduce the bug (tests).
  - Fix the bug.
- No broad refactoring:
  - No mass renames or file moves.
  - No unrelated code style changes.
- Larger structural changes only if required for:
  - Security.
  - Stability (e.g., recurring crashes).
  - Performance.
  - Resource efficiency / race-condition elimination.

Wave flow:

1. Backend/Frontend/Test Agent tasks planned narrowly.
2. Agents propose minimal patches + regression tests.
3. Integration Validator:
   - Runs tests.
   - Checks diff size and blast radius.
4. Human review and merge.

### 3.2 Feature Wave

Used for non-bug feature development.

Additional allowances:

- Refactors permitted when they clearly support the feature and do not break existing behavior.
- Performance/architecture improvements allowed but must be explained in the wave report.

Still constrained by:

- Tenant isolation and RLS policies.
- Security best practices (rate limiting, auth, audit logging).
- Docker port and env layout.

## 4. Relationship to Existing Docs

- The **Developer Manual** remains the canonical description of system architecture, stack, and project structure. The orchestra reads and respects that. :contentReference[oaicite:11]{index=11}  
- The **Admin Guide** remains the canonical source for deployment, tenant management, RLS, and operations. Orchestrated changes may not violate those guarantees (e.g., must not break port mappings or RLS). :contentReference[oaicite:12]{index=12}  

This file is the canonical description of *how AI tools are allowed to collaborate on that system*.
