# Braid + PEP Journal

## Purpose

This document tracks the architectural decisions, completed phases, and forward state
of the PEP (Plain English Programming) pipeline as it is built on top of the existing
Braid language infrastructure in AiSHA CRM.

Each entry records: what was built, what decisions were made, why, and what the next
phase inherits.

---

## Phase 1 — PEP Foundation

**Branch:** `feature/pep-foundation`
**Merged:** February 2026
**Auditor:** Claude (Anthropic)
**Status:** ✅ Complete — all 14 Definition of Done items passed

### What Was Built

| Artifact                 | Location                                          | Description                                                                         |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| PEP compiler             | `pep/compiler/`                                   | Three-phase pipeline: parser → resolver → emitter                                   |
| Entity catalog           | `pep/catalogs/entity-catalog.yaml`                | `CashFlowTransaction` entity with AiSHA binding (YAML)                              |
| Capability catalog       | `pep/catalogs/capability-catalog.yaml`            | 4 capabilities: `persist_entity`, `read_entity`, `notify_role`, `compute_next_date` |
| First PEP program        | `pep/programs/cashflow/source.pep.md`             | Recurring transaction policy in plain English                                       |
| Compiled artifacts       | `pep/programs/cashflow/`                          | `semantic_frame.json`, `braid_ir.json`, `plan.json`, `audit.json`                   |
| PEP runtime adapter      | `pep/runtime/pepRuntime.js`                       | Thin bridge to `backend/lib/braid/execution.js`                                     |
| Cash flow Braid tools    | `braid-llm-kit/examples/assistant/cashflow.braid` | 5 functions: list, get, create, update, summary                                     |
| CashFlowTransaction type | `braid-llm-kit/spec/types.braid`                  | Added after audit — was missing from types file                                     |
| 15 unit tests            | `pep/tests/compiler.test.js`                      | All passing — `node --test pep/tests/compiler.test.js`                              |
| Documentation            | `pep/README.md`                                   | Pipeline overview, CLI, catalog extension guide                                     |

### The First PEP Program

```
When a cash flow transaction is marked as recurring,
automatically create the next transaction based on the recurrence pattern.
If creation fails, notify the owner.
```

This compiles deterministically to a 5-instruction Braid IR, a `semantic_frame` with
full intent annotation, an ordered `plan`, and an `audit` with risk flags and cost estimate.

### Architectural Decisions Made

**1. PEP lives at the top level (`pep/`), not inside `backend/lib/`**

The compiler is a development-time tool, not a backend service. Only `pep/runtime/`
touches the backend infrastructure. This keeps the language concern separate from the
application concern. Future: `pep/` could become its own package.

**2. Phase 1 compiler uses no LLM**

All resolution is deterministic rule-based matching against YAML catalogs. The LLM
is not involved in compilation at all in Phase 1. This was a deliberate choice:
prove the pipeline shape works deterministically before introducing LLM-assisted
parsing in Phase 2. Cost: zero inference per compile. Reliability: 100% reproducible.

**3. Fail-closed everywhere**

The compiler never guesses. If any phase cannot resolve a term against its catalog,
it returns `{ status: "clarification_required", reason: "..." }` immediately. It
never partially emits and never throws. This is the core safety property of PEP.

**4. The IR is the stable interface**

`braid_ir.json` is the contract between the compiler and the runtime. The compiler
can change (better parsing, LLM augmentation, new grammar patterns) without touching
the runtime, as long as the IR shape is preserved. The runtime can change (different
execution engine, distributed mode) without touching the compiler.

**5. Braid was not forked**

PEP sits above Braid, not inside it. The existing `.braid` files, runtime, sandbox,
and policies are all unchanged. PEP compiles to Braid IR; Braid executes it.
The fork question will be revisited when PEP needs first-class `entity`/`event`/`goal`
syntax added to the Braid grammar itself — that is not yet needed.

**6. `CashFlowTransaction` type added to `types.braid`**

Identified during audit: `cashflow.braid` imported a type that did not exist in
`spec/types.braid`. Fixed by adding the type definition. All future Braid tools
for new entities must add their type to `spec/types.braid` before the tool file
is written.

### Defect Found During Audit (Resolved)

`cashflow.braid` imported `CashFlowTransaction` from `spec/types.braid` but the type
was not defined there. `braid-check` would have exited with an error. Fix: added the
type definition to `spec/types.braid`. Verified before merge approval.

### What Phase 1 Does NOT Do

- No API endpoint for PEP (no `POST /api/braid/compile`)
- No frontend integration
- No C.A.R.E. integration
- No LLM in the compiler
- No runtime execution of the cashflow program (runtime adapter exists but is not wired to a trigger)
- No database migration

These are all intentional. Phase 1 proves the pipeline shape. Phases 2+ wire it in.

---

## Phase 1-A — Catalog Migration from JSON to YAML

**Branch:** `feature/pep-1a-yaml-catalogs`
**Date:** February 2026
**Auditor:** Claude (Anthropic)
**Status:** ✅ Complete

### What Changed

| Before                               | After                             | Reason                                      |
| ------------------------------------ | --------------------------------- | ------------------------------------------- |
| `entity-catalog.json`                | `entity-catalog.yaml`             | Human-authored config belongs in YAML       |
| `capability-catalog.json`            | `capability-catalog.yaml`         | Comments, cleaner diffs, better readability |
| `JSON.parse()` in `index.js`         | `parseYaml()` from `yaml` package | Reads YAML catalogs                         |
| `JSON.parse()` in `compiler.test.js` | `parseYaml()` from `yaml` package | Test catalog loading                        |

### Format Decision and Rationale

Catalogs are **human-authored configuration** — they are hand-edited every time a new
domain entity or capability is added to PEP. YAML is the correct format for this use
case because:

1. **Comments** — YAML supports inline and block comments. JSON does not. Catalogs need
   explanatory comments (e.g. ISO-8601 duration values like `P7D # 7 days`).
2. **Readability** — YAML has cleaner syntax for nested structures. No braces, no quotes
   on keys, no trailing commas to manage.
3. **Git diffs** — YAML produces smaller, more readable diffs when fields are added or
   changed. JSON diffs are noisier due to structural punctuation.
4. **Convention** — Configuration-as-code tools (Kubernetes, GitHub Actions, Docker Compose)
   universally use YAML for human-authored config. This aligns PEP catalogs with industry
   convention.

The **compiled artifacts** (`semantic_frame.json`, `braid_ir.json`, `plan.json`, `audit.json`)
stay JSON. They are machine-generated output, never hand-edited, and consumed programmatically.
JSON is the correct format for machine-generated data.

### Dependency

The `yaml` package (v2.8.2) was already installed in the repo as a `devDependency` in
`backend/package.json`. No new packages were added.

### Files Changed

- `pep/catalogs/entity-catalog.yaml` — created (YAML conversion of JSON)
- `pep/catalogs/capability-catalog.yaml` — created (YAML conversion of JSON)
- `pep/catalogs/entity-catalog.json` — deleted
- `pep/catalogs/capability-catalog.json` — deleted
- `pep/compiler/index.js` — added `import { parse as parseYaml } from 'yaml'`; updated `loadDefaultCatalogs()`
- `pep/tests/compiler.test.js` — added `import { parse as parseYaml } from 'yaml'`; updated catalog loading
- `pep/README.md` — updated all catalog references from `.json` to `.yaml`; added format decision note
- `BRAID_PEP_JOURNAL.md` — this entry

### Verification

- All 15 PEP tests pass (`node --test pep/tests/compiler.test.js`)
- `node pep/programs/cashflow/generate.js` exits 0 — compiled artifacts regenerated successfully
- No references to `.json` catalog files remain in `pep/`
- YAML catalogs parse to identical JavaScript objects as the JSON originals

---

## Phase 2 — Planned (Not Started)

### Proposed Scope

**LLM-assisted parsing**

The Phase 1 CBE grammar is rigid (`When ... is ... automatically ... based on ... If ... notify ...`).
Phase 2 replaces `pep/compiler/parser.js` with an LLM call that normalizes free-form
English into the CBE pattern object. The rest of the pipeline (resolver, emitter, runtime)
is unchanged. The LLM becomes the parser, not the executor.

Key constraint: the LLM must return a structured CBE pattern object, not free text.
If it cannot confidently produce the pattern, it returns `clarification_required`.
The existing fail-closed contract is preserved.

**Cash flow program execution trigger**

Wire the compiled cashflow recurring transaction program to an actual trigger:
when `POST /api/cashflow` receives a record with `is_recurring = true`, the PEP
runtime executes the compiled program to schedule the next transaction.

This requires:

- A thin middleware hook in `backend/routes/cashflow.js` (additive, no existing behavior changed)
- `pepRuntime.executePepProgram()` called with the new record as context
- The `createCashFlowTransaction` Braid tool (already exists in `cashflow.braid`) as the executor

**API endpoint**

`POST /api/braid/compile` — accepts `{ english_source, context }`, returns the four
compiled artifacts. Enables future UI workflow builder integration.

### Catalog Extension Needed for Phase 2

Add to `entity-catalog.json`:

- `Notification` entity — needed for `notify_role` to resolve completely at runtime

Add to `capability-catalog.json`:

- `schedule_event` capability — for time-based triggers beyond recurrence patterns

### Open Questions for Phase 2

1. **LLM provider for parsing**: which provider/model from the existing AI engine should
   handle CBE normalization? Recommend `json_strict` capability routing (already exists
   in `backend/lib/aiEngine/`) — it is designed for structured JSON output.

2. **Program versioning**: when a PEP program source changes, do the compiled artifacts
   get regenerated automatically (CI step) or manually (`generate.js`)? Recommend
   a `npm run pep:compile` script that regenerates all programs in `pep/programs/`.

3. **Tenant-scoped programs**: Phase 1 programs are global (same program for all tenants).
   Phase 2 should consider whether some programs should be tenant-configurable
   (e.g. tenant A wants weekly recurrence default, tenant B wants monthly).

---

## Catalog State (Current)

### Entities

| ID                    | AiSHA Table | Route           | Events                                                                |
| --------------------- | ----------- | --------------- | --------------------------------------------------------------------- |
| `CashFlowTransaction` | `cash_flow` | `/api/cashflow` | `TransactionCreated`, `TransactionUpdated`, `RecurringTransactionDue` |

### Capabilities

| ID                  | Abstract          | Policy             | Effects  | Entity Bindings                                      |
| ------------------- | ----------------- | ------------------ | -------- | ---------------------------------------------------- |
| `persist_entity`    | `StoreRecord`     | `WRITE_OPERATIONS` | `!net`   | `CashFlowTransaction` (create, update)               |
| `read_entity`       | `ReadRecord`      | `READ_ONLY`        | `!net`   | `CashFlowTransaction` (list, get)                    |
| `notify_role`       | `SendMessage`     | `WRITE_OPERATIONS` | `!net`   | owner, manager                                       |
| `compute_next_date` | `TimeCalculation` | `READ_ONLY`        | `!clock` | weekly→P7D, monthly→P1M, quarterly→P3M, annually→P1Y |

### Braid Tools Added

| Function                    | File             | Policy             |
| --------------------------- | ---------------- | ------------------ |
| `listCashFlowTransactions`  | `cashflow.braid` | `READ_ONLY`        |
| `getCashFlowTransaction`    | `cashflow.braid` | `READ_ONLY`        |
| `createCashFlowTransaction` | `cashflow.braid` | `WRITE_OPERATIONS` |
| `updateCashFlowTransaction` | `cashflow.braid` | `WRITE_OPERATIONS` |
| `getCashFlowSummary`        | `cashflow.braid` | `READ_ONLY`        |

---

## Rules for Future PEP Work

1. **Every new entity requires three things**: entry in `entity-catalog.yaml`, type definition
   in `braid-llm-kit/spec/types.braid`, and at minimum a `create`/`list` Braid tool in a
   `.braid` file.

2. **Every new capability requires a binding**: abstract capabilities with no entity binding
   will fail at resolve time. Always add at least one binding before using a capability in
   a program.

3. **Compiled artifacts are version-controlled**: `pep/programs/<domain>/` files are committed.
   They represent the verified, audited state of each program. Regenerate with `generate.js`
   after any source or catalog change, and re-run the audit.

4. **The IR is immutable across minor versions**: adding new `op` types to the IR is fine.
   Changing the shape of existing ops requires a version bump and migration of existing
   compiled programs.

5. **`pepRuntime.js` is the only PEP file that imports from `backend/`**: all other
   `pep/` files are pure Node.js with no application dependencies. Keep it that way.

6. **Audit before merge**: every PEP phase must pass a full Definition of Done audit
   before merging to main. The audit is recorded in this journal.
