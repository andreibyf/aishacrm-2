# PLAN

## Feature Identity

- **Name**: PEP Foundation — Plain English Programming Pipeline (Phase 1)
- **Description**: Establish the PEP (Plain English Programming) infrastructure and deliver the first working end-to-end program: a cash flow recurring transaction policy expressed in plain English, compiled to a deterministic Braid execution plan.
- **Value**: Proves the full PEP pipeline works — English source → semantic frame → Braid IR → executable Braid tool — without touching any existing functionality. Establishes the folder structure, catalog schema, and compiler contract that all future PEP programs will build on.
- **In-scope**:
  - `pep/` top-level directory and all subdirectories
  - `pep/compiler/` — stub compiler: CBE parser, entity/capability resolver, semantic frame emitter
  - `pep/catalogs/` — `entity-catalog.json` and `capability-catalog.json` (cash flow scoped, minimal)
  - `pep/programs/cashflow/` — compiled artifacts for the first PEP program
  - `pep/runtime/pepRuntime.js` — thin adapter over existing `backend/lib/braid/execution.js`
  - `braid-llm-kit/examples/assistant/cashflow.braid` — new Braid tool file for cash flow operations
  - `pep/README.md` — pipeline documentation
  - Unit tests for the compiler (fail-closed, entity resolution, ambiguity detection)
- **Out-of-scope**:
  - No changes to existing `.braid` files
  - No changes to `backend/lib/braid/` (runtime untouched)
  - No changes to `backend/routes/cashflow.js`
  - No frontend changes
  - No database migrations
  - No C.A.R.E. integration
  - No API endpoint for PEP (that is Phase 2)
  - No LLM call in the compiler (Phase 1 compiler is deterministic rule-based only)

---

## The First PEP Program

**English source (the program):**

```
When a cash flow transaction is marked as recurring,
automatically create the next transaction based on the recurrence pattern.
If creation fails, notify the owner.
```

**What this exercises:**

- Entity resolution: `cash flow transaction` → `CashFlowTransaction` in catalog → `cash_flow` table in AiSHA
- Event trigger: `is marked as recurring` → `is_recurring = true` on create/update
- Capability invocation: `create the next transaction` → `persist_entity(CashFlowTransaction)`
- Time resolution: `recurrence pattern` → `weekly | monthly | quarterly | annually` → next `transaction_date`
- Fallback policy: `If creation fails, notify the owner` → `notify_role(owner)` capability
- Fail-closed: if any term cannot be resolved against catalogs, compiler returns `clarification_required`

---

## Folder Structure to Create

```
pep/
├── README.md
├── compiler/
│   ├── index.js          ← Entry point: compile(source, context) → { semantic_frame, braid_ir, plan, audit }
│   ├── parser.js         ← CBE grammar: normalize English → structured pattern object
│   ├── resolver.js       ← Resolve entities + capabilities against catalogs
│   └── emitter.js        ← Emit semantic_frame.json + braid.ir.json from resolved pattern
├── catalogs/
│   ├── entity-catalog.json
│   └── capability-catalog.json
├── programs/
│   └── cashflow/
│       ├── source.pep.md              ← The English source (version controlled)
│       ├── semantic_frame.json        ← Compiler output: normalized intent
│       ├── braid_ir.json              ← Compiler output: execution graph
│       ├── plan.json                  ← Compiler output: ordered steps
│       └── audit.json                 ← Compiler output: risk flags + cost estimate
├── runtime/
│   └── pepRuntime.js     ← Thin adapter: execute compiled PEP program via Braid runtime
└── tests/
    └── compiler.test.js  ← Unit tests for all compiler phases
```

---

## Catalog Schemas

### entity-catalog.json

```json
{
  "version": "1.0.0",
  "entities": [
    {
      "id": "CashFlowTransaction",
      "description": "A financial transaction record (income or expense)",
      "aisha_binding": {
        "table": "cash_flow",
        "route": "/api/cashflow"
      },
      "attributes": {
        "id": { "type": "String", "required": false },
        "tenant_id": { "type": "String", "required": true },
        "transaction_type": { "type": "String", "enum": ["income", "expense"], "required": true },
        "amount": { "type": "Number", "required": true },
        "transaction_date": { "type": "String", "format": "date", "required": true },
        "category": { "type": "String", "required": true },
        "description": { "type": "String", "required": true },
        "is_recurring": { "type": "Boolean", "default": false },
        "recurrence_pattern": {
          "type": "String",
          "enum": ["weekly", "monthly", "quarterly", "annually"]
        },
        "status": { "type": "String", "enum": ["actual", "projected", "pending", "cancelled"] },
        "entry_method": {
          "type": "String",
          "enum": ["manual", "crm_auto", "document_extracted", "recurring_auto"]
        }
      },
      "events": {
        "TransactionCreated": "Fired when a new cash_flow record is inserted",
        "TransactionUpdated": "Fired when a cash_flow record is updated",
        "RecurringTransactionDue": "Fired when is_recurring=true and next date has been reached"
      }
    }
  ]
}
```

### capability-catalog.json

```json
{
  "version": "1.0.0",
  "capabilities": [
    {
      "id": "persist_entity",
      "abstract": "StoreRecord",
      "description": "Create or update a business entity record",
      "bindings": {
        "CashFlowTransaction": {
          "create": { "braid_tool": "createCashFlowTransaction", "http": "POST /api/cashflow" },
          "update": { "braid_tool": "updateCashFlowTransaction", "http": "PUT /api/cashflow/:id" }
        }
      },
      "effects": ["!net"],
      "policy": "WRITE_OPERATIONS"
    },
    {
      "id": "read_entity",
      "abstract": "ReadRecord",
      "description": "Read or list business entity records",
      "bindings": {
        "CashFlowTransaction": {
          "list": { "braid_tool": "listCashFlowTransactions", "http": "GET /api/cashflow" },
          "get": { "braid_tool": "getCashFlowTransaction", "http": "GET /api/cashflow/:id" }
        }
      },
      "effects": ["!net"],
      "policy": "READ_ONLY"
    },
    {
      "id": "notify_role",
      "abstract": "SendMessage",
      "description": "Notify a role or actor about an event",
      "bindings": {
        "owner": { "braid_tool": "notifyOwner", "http": "POST /api/notifications" },
        "manager": { "braid_tool": "notifyManager", "http": "POST /api/notifications" }
      },
      "effects": ["!net"],
      "policy": "WRITE_OPERATIONS"
    },
    {
      "id": "compute_next_date",
      "abstract": "TimeCalculation",
      "description": "Calculate the next occurrence date from a recurrence pattern",
      "bindings": {
        "weekly": { "duration": "P7D" },
        "monthly": { "duration": "P1M" },
        "quarterly": { "duration": "P3M" },
        "annually": { "duration": "P1Y" }
      },
      "effects": ["!clock"],
      "policy": "READ_ONLY"
    }
  ]
}
```

---

## Compiler Contract

### Input

```javascript
compile(englishSource, context);
// englishSource: String — the plain English program
// context: { tenant_id, entity_catalog, capability_catalog, policy_catalog? }
```

### Output (always one of these two shapes)

**Success:**

```json
{
  "status": "compiled",
  "semantic_frame": { ... },
  "braid_ir": { ... },
  "plan": { ... },
  "audit": { ... }
}
```

**Failure (fail-closed):**

```json
{
  "status": "clarification_required",
  "reason": "Entity 'invoice' not found in entity catalog. Did you mean 'CashFlowTransaction'?",
  "unresolved": ["invoice"],
  "partial_frame": { ... }
}
```

### CBE Grammar (Phase 1 — supported patterns only)

```
TRIGGER   ::= "When" ENTITY_REF "is" STATE_CHANGE
ACTION    ::= "automatically" CAPABILITY_REF ENTITY_REF "based on" ATTRIBUTE_REF
FALLBACK  ::= "If" OUTCOME_CONDITION "," CAPABILITY_REF ROLE_REF
```

If the input does not match any supported pattern: return `clarification_required`. Do not guess.

---

## Compiler Phases (inside `compiler/index.js`)

```
compile(source, context)
  │
  ├─ Phase 1: parser.js
  │    normalize(source) → pattern object
  │    If no CBE pattern match → clarification_required
  │
  ├─ Phase 2: resolver.js
  │    resolveEntities(pattern, entity_catalog) → annotated pattern
  │    If entity not in catalog → clarification_required
  │    resolveCapabilities(pattern, capability_catalog) → annotated pattern
  │    If capability has no binding → clarification_required
  │    resolveTimeExpressions(pattern) → ISO-8601 durations
  │    If time expression ambiguous → clarification_required
  │
  ├─ Phase 3: emitter.js
  │    emitSemanticFrame(resolved) → semantic_frame.json
  │    emitBraidIR(resolved) → braid_ir.json
  │    emitPlan(resolved) → plan.json
  │    emitAudit(resolved) → audit.json
  │
  └─ Return { status, semantic_frame, braid_ir, plan, audit }
```

**All phases are deterministic and synchronous in Phase 1. No LLM calls.**

---

## cashflow.braid — New Tool File

**Location:** `braid-llm-kit/examples/assistant/cashflow.braid`

Must implement these functions (in order):

```
listCashFlowTransactions(tenant_id, limit, offset)       @policy(READ_ONLY)   !net
getCashFlowTransaction(tenant_id, transaction_id)         @policy(READ_ONLY)   !net
createCashFlowTransaction(tenant_id, transaction_type,    @policy(WRITE_OPERATIONS) !net
  amount, transaction_date, category, description,
  is_recurring, recurrence_pattern, status, entry_method)
updateCashFlowTransaction(tenant_id, transaction_id,      @policy(WRITE_OPERATIONS) !net
  updates)
getCashFlowSummary(tenant_id, start_date, end_date)       @policy(READ_ONLY)   !net
```

All functions follow the standard Braid pattern: typed parameters, `CRMError.fromHTTP()` error handling, `Result<T, CRMError>` return type, `tenant_id` as first parameter.

---

## pepRuntime.js Contract

```javascript
// pep/runtime/pepRuntime.js
// Thin adapter — no business logic

export async function executePepProgram(compiledProgram, runtimeContext) {
  // compiledProgram: output of compile() with status === "compiled"
  // runtimeContext: { tenant_id, actor, policy }
  // Returns: { success, result, audit_trail }
}

export function validateCompiledProgram(compiledProgram) {
  // Returns { valid: Boolean, errors: [] }
  // Checks: status === "compiled", required fields present, IR is well-formed
}
```

`pepRuntime.js` imports from `../../backend/lib/braid/execution.js` (existing, untouched).

---

## Source Files to Create

| File                                              | Type | Notes                                                         |
| ------------------------------------------------- | ---- | ------------------------------------------------------------- |
| `pep/README.md`                                   | Doc  | Pipeline overview, how to write a PEP program, how to compile |
| `pep/compiler/index.js`                           | New  | Entry point, orchestrates phases                              |
| `pep/compiler/parser.js`                          | New  | CBE grammar, pattern matcher                                  |
| `pep/compiler/resolver.js`                        | New  | Entity + capability + time resolution                         |
| `pep/compiler/emitter.js`                         | New  | Four artifact emitters                                        |
| `pep/catalogs/entity-catalog.json`                | New  | CashFlowTransaction entity                                    |
| `pep/catalogs/capability-catalog.json`            | New  | 4 capabilities                                                |
| `pep/programs/cashflow/source.pep.md`             | New  | The English source program                                    |
| `pep/programs/cashflow/semantic_frame.json`       | New  | Compiled artifact                                             |
| `pep/programs/cashflow/braid_ir.json`             | New  | Compiled artifact                                             |
| `pep/programs/cashflow/plan.json`                 | New  | Compiled artifact                                             |
| `pep/programs/cashflow/audit.json`                | New  | Compiled artifact                                             |
| `pep/runtime/pepRuntime.js`                       | New  | Runtime adapter                                               |
| `pep/tests/compiler.test.js`                      | New  | Unit tests                                                    |
| `braid-llm-kit/examples/assistant/cashflow.braid` | New  | Braid tool file                                               |

**Files NOT to touch:**

- `backend/lib/braid/*` — unchanged
- `backend/routes/cashflow.js` — unchanged
- Any existing `.braid` file — unchanged
- Any frontend file — unchanged
- Any migration — unchanged

---

## Ordered Implementation Steps

| #   | Step                                                                                                                                                                           | Verifiable Output                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Create `pep/` directory tree (all folders, empty files with headers)                                                                                                           | `ls pep/` shows all directories; no errors                                                                                  |
| 2   | Write `pep/catalogs/entity-catalog.json` with `CashFlowTransaction` entity exactly as specified above                                                                          | JSON parses without error; contains `CashFlowTransaction` with all attributes and events                                    |
| 3   | Write `pep/catalogs/capability-catalog.json` with 4 capabilities exactly as specified above                                                                                    | JSON parses without error; contains `persist_entity`, `read_entity`, `notify_role`, `compute_next_date`                     |
| 4   | Write `pep/compiler/parser.js` — implements CBE grammar pattern matching for TRIGGER/ACTION/FALLBACK patterns; returns structured pattern object or `{ match: false, reason }` | Unit test: first PEP program source parses to expected pattern object                                                       |
| 5   | Write `pep/compiler/resolver.js` — implements entity resolution, capability resolution, time expression → ISO-8601; fails closed with `clarification_required` on any miss     | Unit test: `CashFlowTransaction` resolves; `invoice` does not resolve and returns `clarification_required`                  |
| 6   | Write `pep/compiler/emitter.js` — implements four emitters producing `semantic_frame`, `braid_ir`, `plan`, `audit` from resolved pattern                                       | Unit test: emitter output contains required top-level keys; IR contains at least one instruction node                       |
| 7   | Wire phases in `pep/compiler/index.js` — `compile(source, context)` calls parser → resolver → emitter in order; returns correct shape on success and on each failure mode      | Unit test: full compile of first PEP program source returns `{ status: "compiled", semantic_frame, braid_ir, plan, audit }` |
| 8   | Run compiler against first PEP program source; write output files to `pep/programs/cashflow/`                                                                                  | All four JSON artifact files exist and are valid JSON                                                                       |
| 9   | Write `braid-llm-kit/examples/assistant/cashflow.braid` with all 5 functions following standard Braid patterns                                                                 | `node braid-llm-kit/core/braid-check.js braid-llm-kit/examples/assistant/cashflow.braid` exits clean (0 errors)             |
| 10  | Write `pep/runtime/pepRuntime.js` with `executePepProgram` and `validateCompiledProgram`                                                                                       | `validateCompiledProgram(compiled)` returns `{ valid: true }` for cashflow compiled output                                  |
| 11  | Write `pep/tests/compiler.test.js` covering all test cases below                                                                                                               | All tests pass; `node --test pep/tests/compiler.test.js` exits 0                                                            |
| 12  | Write `pep/README.md`                                                                                                                                                          | Readable; contains pipeline diagram, example compile invocation, catalog extension guide                                    |
| 13  | Run `npm run braid:check` (or equivalent) to verify cashflow.braid is registered                                                                                               | No errors; cashflow tools appear in tool list                                                                               |

---

## Test Cases (`pep/tests/compiler.test.js`)

| #   | Test                                                                | Expected                                                              |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | Parse the first PEP program source                                  | Returns pattern with `trigger`, `action`, `fallback` keys populated   |
| 2   | Parse unrecognized English ("Make it so")                           | Returns `{ match: false }` — does not guess                           |
| 3   | Resolve `"cash flow transaction"` against entity catalog            | Returns `CashFlowTransaction` binding                                 |
| 4   | Resolve `"invoice"` against entity catalog                          | Returns `clarification_required` with suggestion                      |
| 5   | Resolve `"recurring"` recurrence pattern                            | Returns all 4 patterns (weekly/monthly/quarterly/annually) as options |
| 6   | Resolve `"monthly"` to ISO-8601 duration                            | Returns `"P1M"`                                                       |
| 7   | Resolve `"create the next transaction"` against capability catalog  | Returns `persist_entity.create` binding for `CashFlowTransaction`     |
| 8   | Resolve `"notify the owner"` against capability catalog             | Returns `notify_role.owner` binding                                   |
| 9   | Full compile of first PEP program                                   | Returns `{ status: "compiled" }` with all four artifacts              |
| 10  | Compile with missing capability (e.g. `"send an invoice"`)          | Returns `{ status: "clarification_required" }` — never throws         |
| 11  | `validateCompiledProgram` on valid compiled output                  | Returns `{ valid: true, errors: [] }`                                 |
| 12  | `validateCompiledProgram` on malformed object                       | Returns `{ valid: false, errors: [...] }`                             |
| 13  | Emitter produces `braid_ir` with at least one instruction node      | `braid_ir.instructions.length >= 1`                                   |
| 14  | Emitter produces `audit` with `risk_flags` and `cost_estimate` keys | Both keys present                                                     |
| 15  | Emitter produces `plan` with `steps` array                          | `plan.steps` is an array with at least 2 steps                        |

---

## Expected Compiled Artifacts (reference — Copilot should match this shape)

### semantic_frame.json

```json
{
  "version": "1.0.0",
  "program_id": "cashflow-recurring-policy-v1",
  "intent": "AutomateRecurringTransaction",
  "trigger": {
    "entity": "CashFlowTransaction",
    "event": "RecurringTransactionDue",
    "condition": { "field": "is_recurring", "operator": "eq", "value": true }
  },
  "action": {
    "capability": "persist_entity",
    "operation": "create",
    "entity": "CashFlowTransaction",
    "derived_from": "trigger.entity",
    "date_offset": { "field": "recurrence_pattern", "resolve": "compute_next_date" }
  },
  "fallback": {
    "condition": "action.failed",
    "capability": "notify_role",
    "target": "owner"
  },
  "policies": ["WRITE_OPERATIONS", "DataScope"],
  "effects": ["!net", "!clock"]
}
```

### braid_ir.json

```json
{
  "version": "1.0.0",
  "program_id": "cashflow-recurring-policy-v1",
  "instructions": [
    {
      "op": "load_entity",
      "entity": "CashFlowTransaction",
      "binding": "trigger.entity",
      "assign": "__t0"
    },
    {
      "op": "check_condition",
      "field": "__t0.is_recurring",
      "operator": "eq",
      "value": true,
      "assign": "__t1"
    },
    {
      "op": "call_capability",
      "capability": "compute_next_date",
      "args": { "pattern": "__t0.recurrence_pattern" },
      "assign": "__t2"
    },
    {
      "op": "call_capability",
      "capability": "persist_entity",
      "operation": "create",
      "entity": "CashFlowTransaction",
      "derive_from": "__t0",
      "overrides": { "transaction_date": "__t2", "entry_method": "recurring_auto" },
      "assign": "__t3"
    },
    {
      "op": "match",
      "input": "__t3",
      "arms": [
        { "pattern": "Ok", "assign": "__t4", "instructions": [] },
        {
          "pattern": "Err",
          "assign": "__t5",
          "instructions": [
            {
              "op": "call_capability",
              "capability": "notify_role",
              "target": "owner",
              "message": "Recurring transaction creation failed",
              "assign": "__t6"
            }
          ]
        }
      ]
    }
  ],
  "effects": ["!net", "!clock"],
  "policy": "WRITE_OPERATIONS"
}
```

### plan.json

```json
{
  "version": "1.0.0",
  "program_id": "cashflow-recurring-policy-v1",
  "steps": [
    { "order": 1, "op": "load_entity", "description": "Load the triggering CashFlowTransaction" },
    { "order": 2, "op": "check_condition", "description": "Verify is_recurring is true" },
    {
      "order": 3,
      "op": "compute_next_date",
      "description": "Calculate next transaction_date from recurrence_pattern"
    },
    {
      "order": 4,
      "op": "create_entity",
      "description": "Create new CashFlowTransaction with entry_method=recurring_auto"
    },
    { "order": 5, "op": "on_failure", "description": "Notify owner if creation failed" }
  ],
  "estimated_steps": 5,
  "reversible": false,
  "requires_confirmation": false
}
```

### audit.json

```json
{
  "version": "1.0.0",
  "program_id": "cashflow-recurring-policy-v1",
  "compiled_at": "<ISO timestamp>",
  "source_hash": "<sha256 of source.pep.md>",
  "risk_flags": [
    {
      "severity": "low",
      "flag": "WRITE_CAPABILITY",
      "detail": "Program creates new database records"
    },
    {
      "severity": "info",
      "flag": "NOTIFICATION_CAPABILITY",
      "detail": "Program may send notifications on failure"
    }
  ],
  "cost_estimate": {
    "db_writes": 1,
    "db_reads": 1,
    "notifications": "0-1",
    "llm_calls": 0
  },
  "policy_check": { "passed": true, "policies_applied": ["WRITE_OPERATIONS", "DataScope"] },
  "unresolved": [],
  "warnings": []
}
```

---

## Definition of Done

- [ ] `pep/` directory exists with all subdirectories and files listed in the file table
- [ ] `entity-catalog.json` and `capability-catalog.json` are valid JSON matching the schemas above
- [ ] `compile(source, context)` called with the first PEP program source returns `{ status: "compiled" }` with all four artifacts present
- [ ] `compile()` called with unrecognized English returns `{ status: "clarification_required" }` — never throws, never guesses
- [ ] All 15 test cases in `compiler.test.js` pass: `node --test pep/tests/compiler.test.js` exits 0
- [ ] `braid-llm-kit/examples/assistant/cashflow.braid` exists with all 5 functions
- [ ] `node braid-llm-kit/core/braid-check.js braid-llm-kit/examples/assistant/cashflow.braid` exits with 0 errors
- [ ] All four artifact files exist in `pep/programs/cashflow/` and are valid JSON
- [ ] `validateCompiledProgram()` returns `{ valid: true }` for the cashflow compiled output
- [ ] No existing tests broken: `docker exec aishacrm-backend npm test` exits 0
- [ ] No existing `.braid` files modified
- [ ] No existing backend routes modified
- [ ] `pep/README.md` exists and describes the pipeline

---

## Notes for Copilot

1. **All compiler code is pure Node.js** — no framework dependencies, no imports from `backend/`, no Supabase, no Redis. The compiler is a standalone module.
2. **The compiler in Phase 1 uses no LLM** — all resolution is rule-based matching against the JSON catalogs. Pattern matching in `parser.js` uses string normalization (lowercase, trim, stem key terms). This is intentional — determinism first, LLM augmentation in Phase 2.
3. **Fail closed always** — if any catalog lookup returns nothing, the compiler returns `clarification_required`. It never fills in a guess and continues.
4. **`pepRuntime.js` imports from `../../backend/lib/braid/execution.js`** — use a relative path. Do not copy or re-implement execution logic.
5. **`cashflow.braid` must follow the exact same patterns as `accounts.braid`** — same `@policy` annotations, same `CRMError.fromHTTP()` error handling, `tenant_id` as first param, `Result<T, CRMError>` return type.
6. **The artifact JSON files in `pep/programs/cashflow/`** should be generated by running the compiler, not hand-written. Step 8 in the ordered steps calls the compiler to produce them.
7. **Test runner**: use Node.js native test runner (`node --test`) consistent with the rest of the backend test suite.
