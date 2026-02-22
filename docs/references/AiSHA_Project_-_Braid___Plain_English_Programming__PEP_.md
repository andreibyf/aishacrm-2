#

## Extracted from aishacrm-2 Repository

---

## 1. Braid — Custom DSL for Secure AI-Database Interactions

### Purpose

Braid is a **custom domain-specific language (DSL)** created by Dre and Claude specifically for AiSHA CRM. It solves the fundamental problem of giving AI agents safe, structured access to production databases without risking data integrity or security violations.

Braid is NOT a general-purpose programming language. It is a constraint-based safety layer between AI agents and production data — a tool definition language with TypeScript-like syntax and a tenant-aware execution engine with RLS enforcement.

### Why Braid Was Created

Traditional approaches fail for AI-database integration. Raw SQL lets AI hallucinate destructive queries. ORM wrappers leak cross-tenant data. JSON schemas become unwieldy at scale (1200+ lines for 60 tools). Function calling has no type safety and produces runtime errors. Braid solves all of these with type-safe, tenant-isolated, auditable operations.

### Core Design Principles

1. **Constraint Over Freedom** — Braid intentionally limits what AI agents can do rather than maximizing flexibility. This reduces the attack surface by 95%+ given that AI models hallucinate 15-30% of the time.
2. **Explicit Over Implicit** — Every parameter, type, and operation must be explicitly declared. No `data: Object` catch-alls.
3. **Composability Through Separation** — Braid tools are atomic, single-responsibility operations that compose at the application layer, not within Braid.
4. **Fail-Safe Defaults** — Every tool requires bounded limits. No unbounded queries.

### Language Syntax

Braid uses TypeScript-inspired syntax with `fn` declarations, effect tracking, and structured error handling:

```
fn searchLeads(
  tenant: String,
  query: String,
  limit: Number
) -> Result<Array, CRMError> !net {
  let url = "/api/v2/leads";
  let response = http.get(url, { params: { tenant_id: tenant } });
  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => CRMError.fromHTTP(url, error.status, "search_leads"),
    _ => CRMError.network(url, 500, "unknown")
  };
}
```

Key language features include typed parameters (`String`, `Number`, `Boolean`, `Object`, `Array`, `JSONB`, `Result<T,E>`, `Option<T>`), effect declarations (`!net`, `!clock`, `!fs`), `@policy` annotations (`READ_ONLY`, `WRITE_OPERATIONS`), pattern matching with `match` expressions, and structured `CRMError` constructors.

### Current Scale and Status

- **119 tools** across **20 .braid files** covering accounts, activities, bizdev sources, contacts, documents, employees, leads, lifecycle operations, navigation, notes, opportunities, reports/analytics, snapshots, AI suggestions, telephony, users/permissions, web research, workflow delegation, and workflows.
- **Dual execution modes**: In-process (<50ms latency, used for AI chat) and distributed MCP server (100-200ms, used for workflows/bulk ops/n8n).
- **Full tooling chain**: Parser → Transpiler → Runtime with static effect analysis, type validation (360 runtime type checks across all 119 functions), policy validation, LRU caching, and VS Code extension (v0.5.0 with hover docs, diagnostics, and snippets).
- **14 refactoring issues identified and resolved** including critical duplicate function bugs, circular dependencies, unbounded cache growth, missing type enforcement, and generic error reporting.
- **Version**: 2.1 (February 2026)

### Architecture

```
AI Agent (LLM) → Braid Execution Engine → PostgreSQL with Row-Level Security
                 ├── Parse tool call
                 ├── Validate tenant_id
                 ├── Load tool definition (.braid file)
                 ├── Execute with safety constraints
                 └── Return structured result
```

Security is enforced at three layers: application (Braid requires `tenant_id`), query (`WHERE tenant_id = $1`), and database (RLS policies). All operations are audit-logged to `system_logs`.

---

## 2. PEP — Plain English Programming

### Purpose

PEP is the infrastructure layer that makes English the source language for business logic in AiSHA CRM. A developer (or business user) writes a rule in plain English. The PEP compiler translates it into a deterministic execution plan. The Braid runtime executes that plan under existing policy and sandbox guarantees.

PEP sits **above** Braid — it compiles English down to Braid IR (Intermediate Representation). Braid was not forked; PEP is a layer on top.

### How It Works

```
English source (the program)
        │
        ▼  parser.js (or llmParser.js)
Controlled Business English (CBE) pattern
        │
        ▼  resolver.js
Resolved entities + capabilities (from YAML catalogs)
        │
        ▼  emitter.js
semantic_frame.json + braid_ir.json + plan.json + audit.json
        │
        ▼  pepRuntime.js
Braid execution under existing policy/sandbox
```

### The First PEP Program

```
When a cash flow transaction is marked as recurring,
automatically create the next transaction based on the recurrence pattern.
If creation fails, notify the owner.
```

This compiles deterministically to a 5-instruction Braid IR, a semantic frame with full intent annotation, an ordered plan, and an audit with risk flags and cost estimate.

### Key Architectural Decisions

1. **PEP lives at top level (`pep/`), not inside `backend/lib/`** — The compiler is a development-time tool, not a backend service. Only `pep/runtime/` touches the backend.
2. **Phase 1 compiler uses no LLM** — All resolution is deterministic rule-based matching against YAML catalogs. Zero inference cost, 100% reproducible.
3. **Fail-closed everywhere** — The compiler never guesses. If any phase cannot resolve a term, it returns `{ status: "clarification_required", reason: "..." }` immediately. Never partially emits, never throws.
4. **The IR is the stable interface** — `braid_ir.json` is the contract between compiler and runtime. Either side can change independently.
5. **LLM parser is a compiler dependency, not a runtime dependency** (Phase 2) — The LLM is used only at compile time. Once compiled, IR executes deterministically with no LLM involved.
6. **Date tokens resolve at query time, not compile time** (Phase 3) — A saved report with `start_of_month` always means the current month when re-run.
7. **Tenant isolation is double-enforced** (Phase 3) — `resolveQuery()` rejects explicit `tenant_id` filters AND the endpoint injects `tenant_id` unconditionally.

### Current Status — Phases Completed

**Phase 1 — PEP Foundation** ✅ Complete (February 2026)

- Three-phase compiler pipeline (parser → resolver → emitter)
- Entity catalog and capability catalog (YAML)
- First PEP program (cashflow recurring transactions)
- 15 unit tests, all passing

**Phase 1-A — Catalog Migration** ✅ Complete (February 2026)

- Migrated catalogs from JSON to YAML for better readability, comments, and git diffs

**Phase 2 — LLM Parser + Live Execution** ✅ Complete (February 2026)

- LLM-powered parser using `qwen2.5-coder:3b` via containerized Ollama
- Async compiler with legacy regex fallback
- Live trigger wired to `POST /api/cashflow` (fire-and-forget)
- 8 new LLM parser tests (mocked), all passing
- Env-driven provider config (`PEP_LLM_PROVIDER`, `PEP_LLM_MODEL`)

**Phase 3 — Natural Language Report Queries** ✅ Implementation Complete (February 2026)

- 6 queryable entities (Lead, Contact, Opportunity, Account, Activity, BizDevSource)
- 5 queryable views (unified CRM records, account people, lead details, activity stream, pipeline by stage)
- `POST /api/pep/compile` — parses English query to IR
- `POST /api/pep/query` — executes compiled IR against Supabase
- Frontend CustomQuery component with confirm → results table → save
- 10 compiler tests
- Read-only contract enforced at endpoint boundary
- Employee name resolution with hard-fail on ambiguity

**Phase 4 — Persisted Saved Reports** ✅ Complete (February 2026)

- Database table `pep_saved_reports` with RLS
- 4 new API endpoints (GET, POST, DELETE, PATCH/run)
- IR stored at save time (no recompilation on load)
- Tenant-shared reports (visible to all users within tenant)
- Unique report names per tenant (DB constraint)
- LLM provider switched from local Ollama to Groq (sub-2s compile)
- CSV export added to CustomQuery results toolbar

**Phase 5b — PEP Query Node for Workflow Builder** ✅ Complete (February 2026)

- `pep_query` node type added to Braid workflow builder (NodeLibrary, WorkflowNode, config panel)
- Backend executor in `workflows.js` → `execNode()` compiles IR, resolves variables, executes Supabase query
- Two-stage variable resolution: `{{entity_id}}` passes through compile → resolved at execution time by `replaceVariables()`
- Date tokens (`{{date: last_30_days}}`) and employee tokens (`{{resolve_employee: James}}`) resolved at execution time
- Results stored in `context.variables.pep_results` for downstream nodes (`{{pep_results.count}}`, `{{pep_results.rows}}`)
- `care_trigger` no-op case added to executor to prevent graph traversal errors
- Frontend config panel: textarea, variable hint chips, Compile button, status indicator, collapsible IR preview
- 14 backend tests + 4 frontend tests
- No new API endpoints, no new database tables, no new npm dependencies

### What PEP Does NOT Yet Do

- No aggregations or GROUP BY (pre-aggregated views handle main cases)
- No cross-entity joins beyond views
- No scheduling or recurring queries
- No rename of saved reports
- No permissions model within a tenant for saved reports
- No multi-step PEP programs in workflow nodes (single query_entity per node)
- No visual query builder in workflow config (plain English textarea only)

---

## 3. How Braid and PEP Fit Together

```
┌─────────────────────────────────────────────────────┐
│                    USER LAYER                        │
│  "Show me all qualified leads from Seattle this week"│
│              (Plain English via PEP)                 │
└────────────────────────┬────────────────────────────┘
                         │ PEP Compiler (parse → resolve → emit)
┌────────────────────────▼────────────────────────────┐
│                   BRAID IR LAYER                     │
│  { op: "query_entity", target: "Lead",              │
│    filters: [{ field: "status", op: "eq",           │
│               value: "qualified" }, ...] }           │
└────────────────────────┬────────────────────────────┘
                         │ Braid Execution Engine
┌────────────────────────▼────────────────────────────┐
│                 APPLICATION LAYER                    │
│    AiSHA CRM (Supabase PostgreSQL + RLS)            │
│    119 Braid tools across 20 .braid files           │
└─────────────────────────────────────────────────────┘
```

---

## 4. Future Goals

Based on the Phase 5b "does not do" lists and the journal's forward-looking notes:

1. **CSV/PDF export** — Allow query results to be exported (CSV done in Phase 4; PDF pending)
2. **Scheduled/recurring queries** — Saved reports that run automatically on intervals
3. **Aggregation support** — GROUP BY and computed fields beyond pre-built views
4. **Cross-entity joins** — Richer query capabilities
5. **Per-user permissions on saved reports** — Beyond current tenant-shared model
6. **Frontend PEP editor** — Visual interface for writing and testing PEP programs
7. **Braid CLI** — `@aishacrm/braid-cli` for init, validate, codegen
8. **VS Code Braid extension improvements** — Beyond v0.5.0 with full LSP
9. **Braid grammar expansion** — First-class `entity`/`event`/`goal` syntax (noted as future consideration in Phase 1 journal)
10. **Multi-step PEP programs in workflows** — Chain multiple query_entity nodes, conditional logic within PEP

---

## 5. Project Milestones

### Completed Milestones

| #   | Milestone                                                                                                 | Status  | Date      |
| --- | --------------------------------------------------------------------------------------------------------- | ------- | --------- |
| 1   | Braid DSL v1 — Core language, parser, transpiler, runtime                                                 | ✅ Done | 2024-2025 |
| 2   | Braid tool registry — 119 tools across 20 .braid files                                                    | ✅ Done | 2025      |
| 3   | Dual execution (in-process + MCP server)                                                                  | ✅ Done | Nov 2025  |
| 4   | Braid v2 — Modular refactoring from monolithic 3,891-line file into 8 modules                             | ✅ Done | Feb 2026  |
| 5   | 14 refactoring issues resolved (type validation, effect analysis, policy annotations, error constructors) | ✅ Done | Feb 2026  |
| 6   | VS Code extension v0.5.0 (hover, diagnostics, snippets)                                                   | ✅ Done | Feb 2026  |
| 7   | PEP Phase 1 — Foundation (compiler pipeline, catalogs, first program, 15 tests)                           | ✅ Done | Feb 2026  |
| 8   | PEP Phase 1-A — YAML catalog migration                                                                    | ✅ Done | Feb 2026  |
| 9   | PEP Phase 2 — LLM parser + live execution trigger                                                         | ✅ Done | Feb 2026  |
| 10  | PEP Phase 3 — Natural language report queries (6 entities, 5 views, frontend UI)                          | ✅ Done | Feb 2026  |
| 11  | PEP Phase 4 — Persisted saved reports (DB table, API, frontend, CSV export)                               | ✅ Done | Feb 2026  |
| 12  | PEP Phase 5b — PEP Query Node for Workflow Builder (two-stage variable resolution, CARE integration)      | ✅ Done | Feb 2026  |

### Upcoming Milestones

| #   | Milestone                         | Priority | Description                                                                             |
| --- | --------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| 13  | PEP Phase 6 — Export & scheduling | Medium   | PDF export of query results; recurring saved report execution on cron                   |
| 14  | PEP Phase 7 — Aggregation & joins | Medium   | GROUP BY support, cross-entity joins beyond views, computed fields                      |
| 15  | PEP Phase 8 — Frontend PEP editor | Medium   | Visual editor for writing, testing, and deploying PEP programs from the CRM UI          |
| 16  | Braid CLI (`@aishacrm/braid-cli`) | Medium   | `braid init`, `braid validate`, `braid codegen` for developer workflow                  |
| 17  | Per-user report permissions       | Low      | Role-based access control on saved reports within a tenant                              |
| 18  | Braid grammar expansion           | Low      | First-class `entity`, `event`, `goal` syntax in the Braid language itself               |
| 19  | Production Braid observability    | Medium   | Metrics dashboard, slow-query alerts, usage analytics per tool/tenant                   |
| 20  | PEP multi-domain programs         | High     | Extend PEP beyond cashflow to leads, opportunities, activities with new catalog entries |

---

## 6. Key File Locations

| Component                           | Path                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| Braid tool definitions              | `braid-llm-kit/examples/assistant/*.braid` (20 files, 119 tools)             |
| Braid type spec                     | `braid-llm-kit/spec/types.braid`                                             |
| Braid parser                        | `braid-llm-kit/tools/braid-parse.js`                                         |
| Braid transpiler                    | `braid-llm-kit/tools/braid-transpile.js`                                     |
| Braid runtime                       | `braid-llm-kit/tools/braid-rt.js`                                            |
| Braid adapter                       | `braid-llm-kit/tools/braid-adapter.js`                                       |
| Braid integration (in-process)      | `backend/lib/braid/` (8 modules)                                             |
| Braid MCP server                    | `braid-mcp-node-server/`                                                     |
| Braid architecture doc              | `docs/BRAID_ARCHITECTURE.md`                                                 |
| PEP compiler                        | `pep/compiler/` (index.js, parser.js, llmParser.js, resolver.js, emitter.js) |
| PEP catalogs                        | `pep/catalogs/` (entity-catalog.yaml, capability-catalog.yaml)               |
| PEP programs                        | `pep/programs/cashflow/`                                                     |
| PEP runtime                         | `pep/runtime/pepRuntime.js`                                                  |
| PEP tests                           | `pep/tests/`                                                                 |
| PEP journal                         | `BRAID_PEP_JOURNAL.md`                                                       |
| PEP Phase 5b spec                   | `PHASE_5B_SPEC.md`                                                           |
| Workflow executor (incl. pep_query) | `backend/routes/workflows.js`                                                |
| Workflow NodeLibrary                | `src/components/workflows/NodeLibrary.jsx`                                   |
| Workflow WorkflowNode               | `src/components/workflows/WorkflowNode.jsx`                                  |
| Workflow WorkflowBuilder            | `src/components/workflows/WorkflowBuilder.jsx`                               |
| Refactoring issues                  | `issues/2-braid-refactoring-issues.md`                                       |

---

_Document generated February 21, 2026 from aishacrm-2 repository (github.com/andreibyf/aishacrm-2)_
