# Phase 5b — PEP Query Node for Workflow Builder

**Branch:** `feature/pep-phase5b-query-node`
**Depends on:** Phase 4 (merged), Phase 3 (compile + query endpoints)
**Status:** Planned

---

## Goal

Add a **PEP Query** node to the Braid workflow builder that lets users write a plain English
query in a workflow step, compile it to IR, execute it at runtime, and feed the results
into downstream nodes via `context.variables.pep_results`.

This enables workflows like:

```
CARE Start → PEP Query → Condition → Send Email
```

Where the CARE system detects an event, the PEP Query enriches it with live data, and
subsequent nodes act on the results — all configured through the UI with no code.

---

## Key Design Decision: Two-Stage Variable Resolution

### The Problem

PEP compiles English to IR at save time. If workflow variables like `{{entity_id}}` are
resolved _before_ compilation, the IR is hardwired to a specific value and must be
recompiled on every execution.

### The Solution

Variables are resolved **after** compilation, not before.

**Stage 1 — Compile time (workflow save / first execution):**
The compiler sees `"show me all activities for lead {{entity_id}}"` and treats
`{{entity_id}}` as an opaque placeholder. The emitted IR contains:

```json
{
  "op": "query_entity",
  "target": "Activity",
  "filters": [{ "field": "related_id", "operator": "eq", "value": "{{entity_id}}" }]
}
```

The `{{...}}` token passes through the PEP resolver untouched because it does not match
any known PEP token pattern (`{{date:...}}`, `{{resolve_employee:...}}`).

**Stage 2 — Execution time (each workflow run):**
The workflow executor's `replaceVariables()` function runs over the IR's filter values
before the query hits the database, substituting `{{entity_id}}` with the actual UUID
from the trigger payload.

### Why This Matters

- The compiled IR is **reusable** across executions — it's a query template, not a one-shot.
- The compiler runs once (or the IR is cached in the node config). No LLM call per execution.
- Consistent with how every other workflow node already handles `{{...}}` variables.
- CARE Start payloads (entity_id, tenant_id, event_type, etc.) flow naturally into PEP queries.

### Example: CARE → PEP Query Pipeline

```
┌──────────────┐     ┌───────────────────────────────────────────┐     ┌──────────────┐
│  CARE Start  │────▶│  PEP Query                                │────▶│  Condition   │
│              │     │  "show me all activities for lead          │     │  pep_results  │
│  payload:    │     │   {{entity_id}} in the last 30 days"      │     │  .count == 0  │
│  entity_id   │     │                                           │     │              │
│  tenant_id   │     │  IR filter: related_id = {{entity_id}}    │     │              │
│  event_type  │     │  At runtime: related_id = abc-123-def     │     │              │
└──────────────┘     └───────────────────────────────────────────┘     └──────┬───────┘
                                                                              │ true
                                                                       ┌──────▼───────┐
                                                                       │  Send Email  │
                                                                       │  "Lead has   │
                                                                       │  no activity │
                                                                       │  in 30 days" │
                                                                       └──────────────┘
```

---

## What Phase 5b Builds

| Component                  | Location                                       | Description                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend executor case      | `backend/routes/workflows.js` → `execNode()`   | New `case 'pep_query'` in the switch — compiles (or uses cached IR), resolves workflow variables in filter values, calls `/api/pep/query` logic inline, stores results in `context.variables.pep_results` |
| Backend executor no-op     | `backend/routes/workflows.js` → `execNode()`   | New `case 'care_trigger'` — no-op passthrough so graph traversal doesn't error if it hits this node type                                                                                                  |
| Frontend NodeLibrary entry | `src/components/workflows/NodeLibrary.jsx`     | New `pep_query` node type with icon, label, description                                                                                                                                                   |
| Frontend WorkflowNode      | `src/components/workflows/WorkflowNode.jsx`    | Icon, color, title, description for `pep_query`                                                                                                                                                           |
| Frontend config panel      | `src/components/workflows/WorkflowBuilder.jsx` | Config panel with: textarea for English query, compile button, IR preview, status indicator                                                                                                               |
| Backend tests              | `backend/tests/` or `pep/tests/`               | Tests for the executor case: compile, variable passthrough, execution, error handling                                                                                                                     |
| Journal entry              | `BRAID_PEP_JOURNAL.md`                         | Phase 5b section                                                                                                                                                                                          |

---

## What Phase 5b Does NOT Build

- No new API endpoints — reuses existing `/api/pep/compile` and `/api/pep/query` logic
- No new database tables or migrations
- No saved-report integration (the query runs live each execution, results are not persisted)
- No multi-step PEP programs — single `query_entity` per node
- No async/streaming — synchronous execution like all other workflow nodes
- No aggregation or GROUP BY (same limitation as Phase 3)
- No frontend visual query builder — the input is a plain English textarea

---

## Detailed Design

### 1. Node Config Shape

```json
{
  "id": "node-123",
  "type": "pep_query",
  "config": {
    "source": "show me all activities for lead {{entity_id}} in the last 30 days",
    "compiled_ir": { ... },
    "compiled_at": "2026-02-21T14:00:00Z",
    "compile_status": "success" | "error" | null,
    "compile_error": null | "reason string"
  }
}
```

- `source` — the plain English query, may contain `{{variable}}` placeholders
- `compiled_ir` — the query_entity IR node, stored at compile time. Contains `{{...}}` tokens in filter values that the workflow executor resolves at runtime.
- `compiled_at` — timestamp of last successful compilation
- `compile_status` — indicates whether the stored IR is valid
- `compile_error` — error message if compilation failed

### 2. Backend Executor (`execNode` switch)

```javascript
case 'pep_query': {
  const source = replaceVariables(cfg.source || '');
  let ir = cfg.compiled_ir;

  // If no cached IR, compile on the fly
  if (!ir) {
    // ... call compile logic (parseLLM + resolveQuery + emitQuery)
    // Store result as ir
  }

  // Deep clone IR to avoid mutating the cached version
  ir = JSON.parse(JSON.stringify(ir));

  // Stage 2: resolve workflow variables in IR filter values
  for (const filter of ir.filters || []) {
    if (typeof filter.value === 'string') {
      filter.value = replaceVariables(filter.value);
    }
  }

  // Resolve PEP-specific tokens (date, employee) same as /api/pep/query
  // ... resolveFilterValue + resolveEmployeeToken for each filter

  // Execute query via Supabase (inline, not HTTP call)
  // tenant_id always injected from workflow.tenant_id
  let query = supabase
    .from(ir.table || ir.target)
    .select('*')
    .eq('tenant_id', workflow.tenant_id);

  // Apply resolved filters, sort, limit ...

  const { data, error } = await query;

  // Store results in context for downstream nodes
  context.variables.pep_results = {
    rows: data || [],
    count: (data || []).length,
    target: ir.target,
    executed_at: new Date().toISOString()
  };

  log.output = {
    query_source: cfg.source,
    target: ir.target,
    result_count: context.variables.pep_results.count
  };
  break;
}
```

Key behaviors:

- `replaceVariables()` runs on filter values **after** IR is loaded but **before** query execution
- `tenant_id` comes from `workflow.tenant_id`, NOT from the IR — enforcing tenant isolation
- PEP tokens (`{{date:...}}`, `{{resolve_employee:...}}`) are resolved at execution time, same as `/api/pep/query`
- Workflow tokens (`{{entity_id}}`, `{{email}}`, etc.) are resolved by `replaceVariables()` from context.payload
- Results go into `context.variables.pep_results` so downstream nodes can reference `{{pep_results.count}}`, `{{pep_results.rows}}`, etc.

### 3. Variable Token Classification

At compile time, the PEP resolver must distinguish three kinds of tokens in filter values:

| Token Pattern                      | Resolved At    | By What                                   |
| ---------------------------------- | -------------- | ----------------------------------------- |
| `{{date: today}}`                  | Execution time | `resolveDateToken()` in pep.js            |
| `{{resolve_employee: James}}`      | Execution time | `resolveEmployeeToken()` in pep.js        |
| `{{entity_id}}`, `{{email}}`, etc. | Execution time | `replaceVariables()` in workflow executor |
| `"open"`, `42`, literal values     | Compile time   | PEP resolver (already works)              |

The PEP resolver already passes through `{{resolve_employee:...}}` and `{{date:...}}` tokens
unresolved. Workflow variable tokens (`{{anything_else}}`) need the same passthrough behavior.

**Implementation:** In the resolver's `resolveQuery()`, any filter value matching
`/^\{\{[^}]+\}\}$/` that is NOT a known PEP token (date or employee) should be passed
through unmodified. This is already the default behavior — the resolver doesn't reject
unknown string values, it just keeps them. No resolver changes needed.

### 4. Frontend Config Panel

The `pep_query` config panel in WorkflowBuilder.jsx:

```
┌─────────────────────────────────────────────────────────┐
│  PEP Query                                              │
│                                                         │
│  English Query:                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ show me all activities for lead {{entity_id}}   │    │
│  │ in the last 30 days                             │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Available variables from trigger:                      │
│  {{entity_id}}  {{tenant_id}}  {{event_type}}          │
│                                                         │
│  [ Compile ]                                            │
│                                                         │
│  ✅ Compiled successfully                               │
│  Target: Activity | Filters: 2 | Last compiled: 2m ago │
│                                                         │
│  ▸ View compiled IR (collapsible)                      │
└─────────────────────────────────────────────────────────┘
```

Elements:

- **Textarea** for the English query source (supports `{{variable}}` placeholders)
- **Variable hint chips** — shows available variables from the trigger payload (hardcoded set for now: `entity_id`, `tenant_id`, `event_type`, `email`, `phone`, `company`)
- **Compile button** — calls `/api/pep/compile` with the source text, stores the returned IR in node config
- **Status indicator** — shows compile result (success with summary, or error with reason)
- **Collapsible IR preview** — shows the raw IR JSON for debugging
- The compile button replaces the previous IR in config; if the source changes the status resets

### 5. `care_trigger` No-Op Case

Add to the executor switch to prevent `Unknown node type` errors:

```javascript
case 'care_trigger': {
  // Configuration-only node — payload validation happens at webhook ingress
  log.output = { config: cfg, payload: context.payload };
  break;
}
```

### 6. NodeLibrary Entry

```javascript
{
  type: 'pep_query',
  label: 'PEP Query',
  icon: Search, // or a new icon like Database
  description: 'Run a plain English query against CRM data',
  color: 'emerald'
}
```

### 7. WorkflowNode Entries

In `WorkflowNode.jsx`:

- `nodeIcons`: `pep_query: Search` (or `Database` from lucide-react)
- `nodeColors`: `pep_query: 'bg-emerald-600'`
- `getNodeTitle`: `case 'pep_query': return 'PEP Query';`
- `getNodeDescription`: show a truncated version of `node.config?.source` or fallback to `'Run a plain English CRM query'`

---

## Modified Files

| File                                           | Change                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `backend/routes/workflows.js`                  | Add `case 'pep_query'` and `case 'care_trigger'` to `execNode()` switch. Import PEP compile/resolve/query helpers at top. |
| `src/components/workflows/NodeLibrary.jsx`     | Add `pep_query` entry to `nodeTypes` array                                                                                |
| `src/components/workflows/WorkflowNode.jsx`    | Add `pep_query` to `nodeIcons`, `nodeColors`, `getNodeTitle()`, `getNodeDescription()`                                    |
| `src/components/workflows/WorkflowBuilder.jsx` | Add `case 'pep_query'` config panel in the node config switch                                                             |
| `BRAID_PEP_JOURNAL.md`                         | Phase 5b entry                                                                                                            |

---

## Ordered Implementation Steps

| #   | Step                                                                                                                                                                                                                                                                                                                                                                   | Verifiable Output                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Add `case 'care_trigger'` no-op to `execNode()` in `workflows.js`                                                                                                                                                                                                                                                                                                      | Executor no longer logs `Unknown node type: care_trigger`                           |
| 2   | Add `case 'pep_query'` executor to `execNode()` in `workflows.js` — import PEP helpers, implement compile-or-cache + variable resolution + query execution + results into `context.variables.pep_results`                                                                                                                                                              | Unit test: PEP query node executes with mocked Supabase, returns results in context |
| 3   | Write backend tests for `pep_query` executor: (a) successful query with literal filters, (b) successful query with `{{variable}}` filters resolved from payload, (c) `{{date:...}}` tokens resolved correctly, (d) missing/invalid IR handled gracefully, (e) tenant_id always injected from workflow not IR, (f) results available in `context.variables.pep_results` | All tests pass                                                                      |
| 4   | Add `pep_query` to `NodeLibrary.jsx`                                                                                                                                                                                                                                                                                                                                   | Node appears in the workflow builder sidebar                                        |
| 5   | Add `pep_query` to `WorkflowNode.jsx` (icon, color, title, description)                                                                                                                                                                                                                                                                                                | PEP Query nodes render with correct styling on the canvas                           |
| 6   | Add `case 'pep_query'` config panel to `WorkflowBuilder.jsx` — textarea, compile button, status indicator, variable hints, collapsible IR preview                                                                                                                                                                                                                      | Config panel renders when PEP Query node is selected                                |
| 7   | Wire compile button to call `/api/pep/compile` and store returned IR in node config                                                                                                                                                                                                                                                                                    | Clicking Compile populates `compiled_ir` in node config, shows success/error        |
| 8   | Write frontend test for config panel: renders textarea, compile button triggers API call, status updates on success/error                                                                                                                                                                                                                                              | vitest test passes                                                                  |
| 9   | Update `BRAID_PEP_JOURNAL.md` with Phase 5b entry                                                                                                                                                                                                                                                                                                                      | Journal updated                                                                     |
| 10  | Run full test suites: `npm test` (backend), `npx vitest run` (frontend)                                                                                                                                                                                                                                                                                                | All tests pass including new ones                                                   |

---

## Definition of Done

- [ ] `pep_query` node type appears in workflow builder NodeLibrary
- [ ] PEP Query config panel has textarea, compile button, status, variable hints, IR preview
- [ ] Clicking "Compile" calls `/api/pep/compile` and stores IR in node config
- [ ] `pep_query` executor in `workflows.js` compiles (or uses cached IR), resolves variables, runs query
- [ ] Workflow `{{variable}}` tokens in IR filter values are resolved at execution time by `replaceVariables()`
- [ ] PEP date/employee tokens in IR filter values are resolved at execution time
- [ ] `tenant_id` is always injected from `workflow.tenant_id`, never from IR
- [ ] Query results stored in `context.variables.pep_results` with `{ rows, count, target, executed_at }`
- [ ] `care_trigger` no-op case added — no `Unknown node type` errors
- [ ] Downstream nodes can reference `{{pep_results.count}}` and `{{pep_results.rows}}`
- [ ] All backend tests pass (including new pep_query executor tests)
- [ ] All frontend tests pass (including new config panel test)
- [ ] `BRAID_PEP_JOURNAL.md` updated with Phase 5b entry
- [ ] No new npm dependencies added

---

## Security Considerations

1. **Tenant isolation** — `tenant_id` is always injected from `workflow.tenant_id` at the executor level. The IR cannot override it. A CARE event for tenant A cannot query tenant B's data.

2. **Read-only** — The PEP query executor only performs SELECT operations via Supabase `.select()`. No INSERT/UPDATE/DELETE. Same read-only contract as Phase 3.

3. **No SQL injection** — All queries go through the Supabase client with parameterized filters. The IR specifies field names that are validated against the entity catalog at compile time.

4. **Variable injection** — Workflow variables in filter values are resolved by `replaceVariables()` which does simple string substitution. The resolved values are then passed to Supabase's parameterized query builder, not interpolated into raw SQL.

5. **LLM not in the hot path** — The LLM is only called at compile time (when the user clicks "Compile" in the config panel). At workflow execution time, the pre-compiled IR is used. This means LLM unavailability does not break workflow execution.
