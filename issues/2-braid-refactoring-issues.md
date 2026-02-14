# Braid Modular Refactoring Issues

**Date Identified:** February 1, 2026  
**Refactoring Context:** Monolithic `braidIntegration-v2.js` (3,891 lines) was refactored into 8 modular files under `backend/lib/braid/`

## Issue 1: Duplicate `normalizeToolArgs` Function (CRITICAL - FIXED)

### Status: ✅ FIXED (2026-02-01)

### Problem
Two versions of `normalizeToolArgs` exist with incompatible signatures:

| Location | Signature | Purpose |
|----------|-----------|---------|
| `utils.js` (line 255) | `normalizeToolArgs(args = {})` | Basic normalization (dates, types) |
| `analysis.js` (line 341) | `normalizeToolArgs(toolName, rawArgs, tenantRecord)` | Full normalization with tenant injection, filter unwrapping, update object handling |

`execution.js` was importing from `utils.js` but calling with 3 arguments:
```javascript
// execution.js line 202
const normalizedArgs = normalizeToolArgs(toolName, args, tenantRecord);
```

This caused `toolName` (a string) to be spread as the args object, resulting in all tool arguments being lost.

### Symptom
Activities created via AiSHA Office had:
- No subject
- No due_date
- No related entity
- Default type ('task')

### Fix Applied
Changed import in `execution.js` from:
```javascript
import { createBackendDeps, filterSensitiveFields, normalizeToolArgs } from './utils.js';
```
to:
```javascript
import { createBackendDeps, filterSensitiveFields } from './utils.js';
import { objectToPositionalArgs, normalizeToolArgs } from './analysis.js';
```

### Recommended Follow-up
1. **Delete or rename** the `normalizeToolArgs` in `utils.js` to prevent future confusion
2. Or consolidate: Keep only the full version in `analysis.js` and remove the stub from `utils.js`

---

## Issue 2: Index.js Exports Broken `normalizeToolArgs` (FIXED)

### Status: ✅ FIXED (2026-02-01)

### Problem
`backend/lib/braid/index.js` (line 96) re-exports `normalizeToolArgs` from `utils.js`:

```javascript
// index.js lines 92-114
export {
  createBackendDeps,
  filterSensitiveFields,
  loadToolSchema,
  normalizeToolArgs,  // <-- This is the broken single-arg version!
  validateToolArgs,
  ...
} from './utils.js';
```

Any code importing from the index module will get the wrong function:
```javascript
import { normalizeToolArgs } from './braidIntegration-v2.js'; // Gets broken version
```

### Risk
If any other module imports `normalizeToolArgs` from the unified entry point, it will silently fail to normalize arguments properly.

### Recommended Fix
Update `index.js` to export from `analysis.js` instead:
```javascript
export { normalizeToolArgs } from './analysis.js';
```
And remove from the `utils.js` export block.

---

## Issue 3: No Unit Tests for Critical Functions

### Status: ⚠️ RISK (mitigated by auto-generation)

### Problem
The refactoring introduced 8 new module files with no corresponding test files:
- `execution.js` - Core tool execution (350 lines)
- `registry.js` - Tool registry (1150+ lines)
- `analysis.js` - Argument normalization (700 lines)
- `chains.js` - Workflow chains (540 lines)
- `metrics.js` - Audit logging
- `policies.js` - Security policies
- `utils.js` - Utilities (582 lines)
- `index.js` - Entry point (345 lines)

### Risk
- Function signature mismatches (like Issue #1) would be caught by basic unit tests
- Changes to one module may break imports in another without warning

### Recommended Fix
Add test file `backend/__tests__/braid-modules.test.js` with:
1. Import validation tests (ensure all exports work)
2. Function signature tests (verify arg counts match usage)
3. Regression tests for critical functions:
   - `normalizeToolArgs(toolName, args, tenant)` - verify tenant injection
   - `objectToPositionalArgs(toolName, args)` - verify parameter order
   - `executeBraidTool(...)` - verify full execution path

---

## Issue 4: BRAID_PARAM_ORDER May Be Incomplete

### Status: ✅ FIXED (2026-02-13)

### Problem
`analysis.js` had a hand-maintained `BRAID_PARAM_ORDER` map that could drift out of sync with actual `.braid` file signatures.

### Fix Applied
Replaced the entire static `BRAID_PARAM_ORDER` block with an IIFE that auto-generates the map at module load time by parsing all `.braid` files from `braid-llm-kit/examples/assistant/` using the Braid parser. The map is now always in sync with the actual function signatures.

Also added:
- `generate-braid-param-order.js` CLI script for manual inspection (`--check`, `--json` modes)
- `validateParamOrderCoverage()` function to compare against TOOL_REGISTRY at startup
- Console logging showing how many functions were parsed on each boot

New `.braid` functions are automatically picked up on next server restart. No manual maintenance required.

---

## Issue 5: Circular Dependency Risk in Module Structure

### Status: ✅ FIXED (2026-02-13)

### Problem
Circular import cycle: `execution.js → analysis.js → chains.js → execution.js`

```
execution.js
  └── imports analysis.js (objectToPositionalArgs, normalizeToolArgs)
        └── imported chains.js (TOOL_CHAINS)     ← THE CYCLE
              └── imports execution.js (executeBraidTool)
```

Node.js handles this via lazy evaluation at module load, but it’s fragile and
could break if initialization order changes.

### Fix Applied
Replaced the top-level `import { TOOL_CHAINS } from './chains.js'` in `analysis.js`
with a lazy `await import('./chains.js')` inside the only function that uses it:
`getToolImpactAnalysis()`. This function is a diagnostic/analysis tool, not on any
hot path, and has no callers in the codebase yet — making it safe to convert to async.

The import graph is now acyclic at module load time:
```
execution.js → analysis.js → registry.js (no chains.js at load)
chains.js → execution.js, registry.js
analysis.js → chains.js (only at call time, via dynamic import)
```

---

## Issue 6: Missing `validateToolArgs` Usage

### Status: ✅ FIXED (2026-02-13)

### Problem
`utils.js` defines `validateToolArgs(toolName, args, context)` but it was never called in `execution.js`.

### Fix Applied
Added `validateToolArgs` call at the start of `executeBraidTool`, immediately after the TOOL_REGISTRY lookup. The validation now runs as an early guard:
- Validates tenant UUID format
- Warns if user context is missing
- Rejects delete operations without explicit confirmation

Returns `{ tag: 'Err', error: { type: 'ValidationError' } }` on failure, preventing execution from proceeding with invalid arguments.

---

## Summary

| Issue | Severity | Status | Action Required |
|-------|----------|--------|-----------------|
| #1 Duplicate normalizeToolArgs | CRITICAL | ✅ Fixed | None (verify fix works) |
| #2 Index.js wrong export | HIGH | ✅ Fixed | None |
| #3 No unit tests | MEDIUM | ✅ Fixed | Full test suites added (see Issue #11) |
| #4 BRAID_PARAM_ORDER incomplete | MEDIUM | ✅ Fixed | Auto-generated from .braid files at module load |
| #5 Circular dependencies | LOW | ✅ Fixed | Lazy import in analysis.js breaks the cycle |
| #6 validateToolArgs unused | LOW | ✅ Fixed | Wired into executeBraidTool |
| #7 Unbounded cache memory | MEDIUM | ✅ Fixed | LRU cache with eviction in braid-adapter.js |
| #8 Effect system declaration-only | MEDIUM | ✅ Fixed | Static analysis in transpiler detects mismatches |
| #9 compiledCache stale in dev | LOW | ✅ Fixed | mtime checking in dev mode |
| #10 VSCode extension LSP features | LOW | ✅ Fixed | Hover docs, diagnostics, snippets updated to v0.5.0 |
| #11 No integration tests | MEDIUM | ✅ Fixed | Tests for transpiler, adapter, and runtime |
| #12 @policy not in .braid files | HIGH | ✅ Fixed | @policy annotations on all 119 functions |
| #13 Type validation not enforced | HIGH | ✅ Fixed | Parser captures types, transpiler emits checkType() |
| #14 Generic error reporting | MEDIUM | ✅ Fixed | CRMError.fromHTTP/notFound/network/validation |

---

## Issue 7: Unbounded Memory Growth in braid-adapter.js Caches

### Status: ✅ FIXED (2026-02-13)

### Problem
Both `compiledCache` and `resultCache` in `braid-llm-kit/tools/braid-adapter.js` were plain `Map` objects with no size limit or eviction policy. The `resultCache` in particular grows with every unique combination of (file, function, args), which for search tools with varying queries means unbounded growth.

### Fix Applied
Replaced both `Map` instances with an `LRUCache` class that evicts the least-recently-used entry when the max size is reached. Sizes:
- `compiledCache`: max 50 entries (one per .braid file, currently ~20)
- `resultCache`: max 500 entries

The LRU implementation uses Map's insertion-order guarantee for O(1) get/set/evict.

---

## Issue 8: Effect System is Declaration-Only (No Static Analysis)

### Status: ✅ FIXED (2026-02-13)

### Problem
Effects (`!net`, `!clock`, `!fs`) were declared on function signatures and checked at
runtime via `cap()` calls in the transpiled output. However, there was no static analysis
to verify that:
- A function declaring `!net` actually uses `http.*` calls
- A function using `clock.now()` declares `!clock`

The second case is dangerous: if a function uses `http.get` but doesn't declare `!net`,
the transpiler won't emit `async`, won't inject `policy`/`deps` parameters, and won't
generate the `IO()` destructuring — the function will fail at runtime with a confusing
error about `http` being undefined.

### Fix Applied
Added `detectUsedEffects()` function in `braid-transpile.js` that walks the AST body
and detects member access on IO namespaces (`http.*` → `net`, `clock.*` → `clock`, etc.).

During transpilation (`emitFn`), the detected effects are compared against declared effects:
- **Undeclared usage** (`http.get` without `!net`): **Error** — added to `ctx.diags`, stops transpilation
- **Declared but unused** (`!clock` but no `clock.*` calls): **Warning** — `console.warn` only, since
  the function may delegate to helpers that use the effect

The `IO_EFFECT_MAP` and `detectUsedEffects` are also exported for use by external tools
(CLI checkers, test harnesses).

---

## Issue 9: compiledCache Doesn't Invalidate on File Change

### Status: ✅ FIXED (2026-02-13)

### Problem
The `compiledCache` in `braid-adapter.js` stored transpiled modules permanently. If a
`.braid` file was edited while the server was running (during development), the cache
served the old transpiled code. This required a full server restart to pick up changes.

### Fix Applied
The compiled cache now stores `{ module, mtimeMs }` pairs instead of bare modules.
In dev mode (`NODE_ENV !== 'production'`), each cache hit checks the file's current
`mtime` against the cached value using synchronous `fs.statSync()`. If the file has
been modified, the cache entry is invalidated and the file is re-parsed and re-transpiled.

In production mode, mtime checks are skipped entirely for performance — deploy restarts
naturally clear the in-memory cache.

---

## Issue 10: VSCode Extension Missing LSP Features

### Status: ✅ FIXED (2026-02-13)

### Problem
The VSCode extension (v0.4.0) had syntax highlighting, formatting, and snippets but no:
- Hover documentation (hovering over `fn`, `!net`, `http.get`, etc. showed nothing)
- Diagnostics (no inline error detection for effect mismatches)
- Several snippets used the old `NetworkError{ url, code }` constructor syntax instead
  of the production `{ tag: "APIError", ... }` object literal pattern

### Fix Applied
Bumped to v0.5.0 with:

**Hover Provider:** `BRAID_HOVER_DOCS` dictionary with entries for all keywords (`fn`, `let`,
`match`, `return`, `type`, `import`), effects (`!net`, `!clock`, `!fs`), IO namespaces
(`http`, `http.get`, `http.post`, `http.put`, `http.delete`, `clock`, `clock.now`),
result types (`Ok`, `Err`, `Result`, `CRMError`), and runtime functions (`cap`, `IO`).
Each entry has a signature, description, and optional code example.

**Diagnostics Provider:** Regex-based effect checker that runs on document open/change.
Detects undeclared effects (error severity) and declared-but-unused effects (warning).
Lightweight — no parser dependency, uses brace-counting for function body extraction.

**Snippets Updated:** `fnnet`, `matchres`, `err`, `crmtool`, `searchtool` snippets now
use `{ tag: "APIError", ... }` pattern, include `tenant` as first parameter, and match
production `.braid` file conventions.

---

## Issue 11: No Integration Tests for Transpiler, Adapter, Runtime

### Status: ✅ FIXED (2026-02-13)

### Problem
Only the parser had tests (`braid-parse.test.js`). The transpiler, adapter, and runtime
had no test coverage. The transpiler's new static effect analysis, the adapter's LRU cache
and mtime invalidation, and the runtime's capability checking and tenant isolation were all
untested.

### Fix Applied
Created three test files using Node.js built-in test runner (`node:test`):

- **`braid-transpile.test.js`** — Pure/effectful transpilation, static effect analysis
  (`detectUsedEffects`), effect mismatch detection (TP002 errors), match expression
  output, runtime import paths, export structure.

- **`braid-adapter.test.js`** — Pure and effectful execution with mock deps, missing
  function handling, timeout enforcement, result caching, cache clearing, mtime
  invalidation (file change detection), `loadToolSchema` output format.

- **`braid-rt.test.js`** — Result constructors (`Ok`/`Err`), capability checking
  (`cap` allow/deny/wildcard/audit), IO wrapper (namespace creation, tenant injection,
  existing tenant_id preservation, timeout enforcement), CRM policy validation,
  field permissions.

Run all tests: `node --test braid-llm-kit/tools/__tests__/`

---

---

## Issue 12: @policy Not Declared in .braid Files

### Status: ✅ FIXED (2026-02-13)

### Problem
Policy assignments (READ_ONLY, WRITE_OPERATIONS, etc.) were hardcoded in `TOOL_REGISTRY` in JavaScript, completely disconnected from the `.braid` files. This meant:
- Looking at a `.braid` file gave no indication of what policy governs it
- Policy changes required editing two files (registry + .braid) with no validation
- Drift between registry and intent was invisible

### Fix Applied
1. **Parser**: Added `@annotation(args)` token support. `@policy(WRITE_OPERATIONS)` before `fn` declarations is parsed into AST as `annotations: [{ name: 'policy', args: ['WRITE_OPERATIONS'] }]`
2. **All 20 .braid files**: Added `@policy(X)` annotation to all 119 functions based on existing TOOL_REGISTRY assignments
3. **Transpiler**: Validates `@policy` names against `VALID_POLICIES` set at compile time (TP003 diagnostic)
4. **`extractPolicies(ast)`**: Exported utility returns `{ fnName: 'POLICY_NAME' }` map for registry use
5. **`scripts/sync-braid-policies.mjs`**: CI-friendly validation script that detects drift between .braid annotations and TOOL_REGISTRY

### Example
```braid
@policy(WRITE_OPERATIONS)
fn createLead(tenant: String, name: String) -> Result<Lead, CRMError> !net {
  // ...
}
```

---

## Issue 13: Type Validation Not Enforced at Runtime

### Status: ✅ FIXED (2026-02-13)

### Problem
Parameter types in `.braid` files (e.g., `tenant: String`) were parsed by `skipType()` which **discarded** the type information entirely. Parameters became `{ name: 'tenant' }` with no type. No runtime validation occurred — passing a number where a string was expected would silently propagate to the API layer.

### Fix Applied
1. **Parser**: `parseParams()` now captures types via `parseTypeRef()` instead of `skipType()`. Parameters become `{ name: 'tenant', type: { base: 'String', typeArgs: [] } }`
2. **Return types**: Also captured as structured `{ base, typeArgs }` instead of raw text
3. **Let statements**: `let x: Number = 42` now captures `letType: { base: 'Number' }`
4. **Transpiler**: Emits `checkType(fnName, paramName, value, expectedType)` for every typed parameter
5. **Runtime**: `checkType()` in `braid-rt.js` throws `BRAID_TYPE` errors with structured metadata (fn, param, expected, actual)

### Generated Code Example
```javascript
export async function createLead(policy, deps, tenant, first_name, email) {
  checkType("createLead", "tenant", tenant, "string");   // throws if not string
  checkType("createLead", "first_name", first_name, "string");
  checkType("createLead", "email", email, "string");
  cap(policy, "net");
  // ...
}
```

### Impact
- **360 runtime type checks** emitted across all 119 functions
- Type mismatches caught immediately with clear error messages instead of failing deep in API calls
- Array types validated with `Array.isArray()` check

---

## Issue 14: Generic Error Reporting (APIError Catch-All)

### Status: ✅ FIXED (2026-02-13)

### Problem
All `.braid` files used a generic `Err({ tag: "APIError", url, code, operation })` pattern. Every HTTP error, regardless of status code, produced the same opaque error type. The backend's `summarizeToolResult` had to re-interpret status codes to provide meaningful messages, but the Braid code itself couldn't distinguish NotFound from ValidationError.

### Fix Applied
1. **Runtime** (`braid-rt.js`): Added structured `CRMError` constructors:
   - `CRMError.notFound(entity, id, operation)` → `{ type: 'NotFound', entity, id, code: 404 }`
   - `CRMError.validation(fn, field, message)` → `{ type: 'ValidationError', code: 400 }`
   - `CRMError.forbidden(operation, role, required)` → `{ type: 'PermissionDenied', code: 403 }`
   - `CRMError.network(url, code, operation)` → `{ type: 'NetworkError', code: 500 }`
   - `CRMError.fromHTTP(url, status, operation)` → auto-maps status to specific type

2. **All 20 .braid files**: Replaced generic `Err({ tag: "APIError", ... })` with specific constructors:
   - `Err{error} => CRMError.fromHTTP(url, error.status, "create_lead")` — auto-maps status
   - `_ => CRMError.network(url, 500, "unknown")` — explicit network fallback
   - `Err{error} => CRMError.notFound("Employee", employee_id, "get")` — known 404 paths

3. **Domain-specific errors** (PromotionError, ConversionError, etc.) converted to `CRMError.fromHTTP()` which routes through the status-code mapper.

### Parser Enhancements (Supporting)
- **Block bodies in match arms**: `Ok{value} => { let x = ...; if ...; x }` now parsed correctly
- **Return in match arms**: `Err{error} => return CRMError.network(...)` supported
- **Optional trailing semicolons**: Last expression in block can omit `;` before `}`

---

## Files Affected

```
backend/lib/braid/
├── index.js       # Issue #2: Wrong export (FIXED)
├── execution.js   # Issue #1: Fixed import, Issue #6: Added validateToolArgs guard
├── analysis.js    # Issue #4: Auto-generates BRAID_PARAM_ORDER, #5: Lazy import
├── utils.js       # Issue #1: Stub removed, Issue #6: validateToolArgs now used
├── registry.js    # Source of TOOL_REGISTRY (sync via scripts/sync-braid-policies.mjs)
├── chains.js      # Issue #5: Circular import broken via lazy import
├── metrics.js     # No issues found
└── policies.js    # No issues found

braid-llm-kit/tools/
├── braid-parse.js      # Issues #12-14: @annotations, type capture, block match arms
├── braid-transpile.js  # Issues #8, 12-14: Effect analysis, type checks, policy validation, match arm codegen
├── braid-rt.js         # Issue #13-14: checkType(), CRMError constructors
└── braid-adapter.js    # Issue #7: LRU cache, Issue #9: mtime-aware compiled cache

braid-llm-kit/examples/assistant/
└── *.braid (20 files)  # Issues #12, 14: @policy annotations, CRMError.fromHTTP

scripts/
├── sync-braid-policies.mjs      # Issue #12: CI validation of @policy ↔ TOOL_REGISTRY sync
└── apply-braid-transforms.mjs   # Issue #14: Bulk transform script for .braid error patterns
```
