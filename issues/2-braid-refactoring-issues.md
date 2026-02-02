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

### Status: ⚠️ RISK

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

### Status: ⚠️ NEEDS AUDIT

### Problem
`analysis.js` defines `BRAID_PARAM_ORDER` (lines 210-320) which maps Braid function names to their expected parameter order. If a function is missing from this map, `objectToPositionalArgs` falls back to passing the args as a single object:

```javascript
// analysis.js line 330
if (!paramOrder) {
  console.warn(`[Braid] No param order defined for ${funcName}, passing as object`);
  return [argsObj];  // Fallback - may not work for all functions
}
```

### Risk
New Braid functions added to `.braid` files may not have corresponding entries in `BRAID_PARAM_ORDER`, causing silent failures.

### Recommended Fix
1. Add a startup validation that compares `TOOL_REGISTRY` functions against `BRAID_PARAM_ORDER`
2. Log warnings for any mismatches
3. Consider auto-generating param order from `.braid` file parsing

---

## Issue 5: Circular Dependency Risk in Module Structure

### Status: ⚠️ LOW RISK

### Current Import Graph
```
index.js
├── execution.js
│   ├── policies.js (CRM_POLICIES)
│   ├── registry.js (TOOL_REGISTRY, TOOL_CACHE_TTL)
│   ├── metrics.js (trackRealtimeMetrics, logAuditEntry)
│   ├── utils.js (createBackendDeps, filterSensitiveFields)
│   └── analysis.js (objectToPositionalArgs, normalizeToolArgs)
├── registry.js
├── analysis.js
│   ├── registry.js (TOOL_REGISTRY)
│   └── chains.js (TOOL_CHAINS)
├── chains.js
│   ├── registry.js (TOOL_REGISTRY)
│   └── execution.js (executeBraidTool)
└── ...
```

`chains.js` imports from `execution.js`, and `execution.js` imports from `analysis.js` which imports from `chains.js`. This is a potential circular dependency.

### Current Mitigation
Node.js handles this via lazy evaluation, but it could cause issues if module initialization order changes.

### Recommended Fix
Consider lazy imports in `analysis.js` for `TOOL_CHAINS`:
```javascript
// Instead of top-level import
// import { TOOL_CHAINS } from './chains.js';

// Use dynamic import when needed
async function getToolChains() {
  const { TOOL_CHAINS } = await import('./chains.js');
  return TOOL_CHAINS;
}
```

---

## Issue 6: Missing `validateToolArgs` Usage

### Status: ⚠️ LOW PRIORITY

### Problem
`utils.js` defines `validateToolArgs(toolName, args, context)` (line 281) but it's never called in `execution.js`. The function validates:
- Tenant UUID presence
- User context
- Delete confirmation

### Risk
Validation logic exists but is bypassed, potentially allowing invalid tool calls.

### Recommended Fix
Add call to `validateToolArgs` at the start of `executeBraidTool`:
```javascript
const validation = validateToolArgs(toolName, args, { tenantUuid, userId, confirmDelete: args?.confirmed });
if (!validation.valid) {
  return { tag: 'Err', error: { type: 'ValidationError', message: validation.errors.join(', ') } };
}
```

---

## Summary

| Issue | Severity | Status | Action Required |
|-------|----------|--------|-----------------|
| #1 Duplicate normalizeToolArgs | CRITICAL | ✅ Fixed | None (verify fix works) |
| #2 Index.js wrong export | HIGH | ✅ Fixed | None |
| #3 No unit tests | MEDIUM | ⚠️ Open | Add test file |
| #4 BRAID_PARAM_ORDER incomplete | MEDIUM | ⚠️ Open | Audit and add validation |
| #5 Circular dependencies | LOW | ⚠️ Open | Monitor, fix if issues arise |
| #6 validateToolArgs unused | LOW | ⚠️ Open | Optional enhancement |

---

## Files Affected

```
backend/lib/braid/
├── index.js       # Issue #2: Wrong export
├── execution.js   # Issue #1: Fixed import
├── analysis.js    # Contains correct normalizeToolArgs
├── utils.js       # Issue #1, #6: Broken stub, unused validation
├── registry.js    # Issue #4: Source of TOOL_REGISTRY
├── chains.js      # Issue #5: Potential circular import
├── metrics.js     # No issues found
└── policies.js    # No issues found
```
