# PEP — Plain English Programming

PEP is the infrastructure layer that makes English the source language for business
logic in AiSHA CRM. A developer writes a rule in plain English. The PEP compiler
translates it into a deterministic execution plan. The Braid runtime executes that
plan under existing policy and sandbox guarantees.

**Phase 1 is fully deterministic** — no LLM calls anywhere in the compiler or runtime.

---

## The Pipeline

```
English source (the program)
        │
        ▼  pep/compiler/parser.js
Controlled Business English (CBE) pattern — fails closed if no match
        │
        ▼  pep/compiler/resolver.js
Resolved entities + capabilities (from YAML catalogs) — fails if unknown
        │
        ▼  pep/compiler/emitter.js
semantic_frame.json + braid_ir.json + plan.json + audit.json
        │
        ▼  pep/runtime/pepRuntime.js
Braid execution under existing policy/sandbox (via backend/lib/braid/execution.js)
```

All three compiler phases are **deterministic and synchronous**. Resolution is
rule-based matching against the YAML catalogs in `pep/catalogs/`. The compiled
artifacts are version-controlled in `pep/programs/<domain>/`.

> **Format decision (Phase 1-A):** Catalogs are YAML; compiled artifacts are JSON.
> YAML is the right format for human-authored config — it supports comments, has
> cleaner syntax, and produces more readable Git diffs. The compiled artifacts
> (`semantic_frame.json`, `braid_ir.json`, `plan.json`, `audit.json`) stay JSON
> because they are machine-generated output, not hand-edited.

---

## Directory Structure

```
pep/
├── README.md                          ← This file
├── compiler/
│   ├── index.js                       ← Entry point: compile(source, context) → artifacts
│   ├── parser.js                      ← CBE grammar: normalize English → structured pattern
│   ├── resolver.js                    ← Resolve entities + capabilities against catalogs
│   └── emitter.js                     ← Emit semantic_frame, braid_ir, plan, audit
│
├── catalogs/
│   ├── entity-catalog.yaml            ← Domain entities mapped to AiSHA bindings (YAML)
│   └── capability-catalog.yaml        ← Abstract capabilities mapped to Braid tools (YAML)
│
├── programs/
│   └── cashflow/
│       ├── source.pep.md              ← The English source (version controlled)
│       ├── semantic_frame.json        ← Compiled: normalized intent
│       ├── braid_ir.json              ← Compiled: execution graph
│       ├── plan.json                  ← Compiled: ordered steps
│       └── audit.json                 ← Compiled: risk flags + cost estimate
│
├── runtime/
│   └── pepRuntime.js                  ← Thin adapter: PEP IR → Braid execution engine
│
└── tests/
    └── compiler.test.js               ← Unit tests (node --test)
```

---

## CBE Grammar (Phase 1 — Supported Patterns)

```
TRIGGER   ::= "When" ENTITY_REF "is" STATE_CHANGE
ACTION    ::= "automatically" CAPABILITY_REF ENTITY_REF "based on" ATTRIBUTE_REF
FALLBACK  ::= "If" OUTCOME_CONDITION "," CAPABILITY_REF ROLE_REF
```

If the English source does not match these patterns, the compiler returns
`{ status: "clarification_required", reason: "..." }` and does **not** produce artifacts.

---

## How to Compile a PEP Program

### Programmatic API

```javascript
import { compile } from './compiler/index.js';

const source = `When a cash flow transaction is marked as recurring,
automatically create the next transaction based on the recurrence pattern.
If creation fails, notify the owner.`;

const result = compile(source);

if (result.status === 'compiled') {
  console.log(result.semantic_frame);
  console.log(result.braid_ir);
  console.log(result.plan);
  console.log(result.audit);
} else {
  console.log('Clarification needed:', result.reason);
}
```

### CLI

```bash
node pep/compiler/index.js --source pep/programs/cashflow/source.pep.md
```

### Generate Artifacts to Disk

```bash
node pep/programs/cashflow/generate.js
```

---

## How to Extend the Catalogs

### Adding a New Entity

Edit `pep/catalogs/entity-catalog.yaml` and add to the `entities` list:

```yaml
- id: YourEntity
  description: What this entity represents
  aisha_binding:
    table: your_table
    route: /api/your-route
  attributes:
    field_name:
      type: String
      required: true
  events:
    EntityCreated: Fired when a new record is inserted
```

### Adding a New Capability

Edit `pep/catalogs/capability-catalog.yaml` and add to the `capabilities` list:

```yaml
- id: your_capability
  abstract: AbstractName
  description: What this capability does
  bindings:
    YourEntity:
      create:
        braid_tool: createYourEntity
        http: POST /api/your-route
  effects: ['!net']
  policy: WRITE_OPERATIONS
```

---

## Compiler Contract

### Success Output

```json
{
  "status": "compiled",
  "semantic_frame": { "version": "1.0.0", "intent": "...", ... },
  "braid_ir": { "version": "1.0.0", "instructions": [...], ... },
  "plan": { "version": "1.0.0", "steps": [...], ... },
  "audit": { "version": "1.0.0", "risk_flags": [...], "cost_estimate": {...}, ... }
}
```

### Failure Output (Fail-Closed)

```json
{
  "status": "clarification_required",
  "reason": "Entity 'invoice' not found in entity catalog. Did you mean 'CashFlowTransaction'?",
  "unresolved": ["invoice"],
  "partial_frame": null
}
```

---

## Key Constraints

- The compiler **never executes** capabilities — it only produces artifacts
- The compiler **always fails closed** on ambiguity — returns `clarification_required`, never guesses
- The runtime **never calls the LLM** — execution is fully deterministic from the IR
- Tenant isolation is enforced by the existing Braid policy layer, not by PEP programs
- All artifacts are auditable and version-controlled
- Phase 1 compiler depends only on the `yaml` package (already installed in the repo) for catalog parsing

---

## Running Tests

```bash
node --test pep/tests/compiler.test.js
```

15 tests covering: parser matching, fail-closed behavior, entity resolution,
capability resolution, time expressions, full compilation, runtime validation,
and emitter output shape verification.
