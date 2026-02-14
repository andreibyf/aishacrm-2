# Braid LLM Kit

**Version:** 0.5.0  
**Status:** Active Development  
**Runtime:** Node.js 18+ (JavaScript target), Python 3.10+ (Python target)

Braid is a security-first, target-agnostic DSL for defining type-safe, capability-controlled tools that LLMs execute safely. It compiles to JavaScript and Python through an intermediate representation, with Rust and Go targets planned.

## What Braid Does

Braid constrains what LLM tool calls can do. Every function declares its effects (`!net`, `!clock`, `!fs`), its security policy (`@policy(READ_ONLY)`), and its parameter types — all enforced at both compile time and runtime. A sandbox blocks `eval`, prototype pollution, and dangerous globals in transpiled code. Bindings are immutable by design.

```braid
@policy(READ_ONLY)
fn searchLeads(tenant: String, query: String) -> Result<Array, CRMError> !net {
  let url = `/api/v2/leads?tenant_id=${tenant}&q=${query}`;
  let response = http.get(url, {});

  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => CRMError.fromHTTP(url, error.status, "search_leads"),
    _ => CRMError.network(url, 500, "unknown")
  };
}
```

## Architecture

```
braid-llm-kit/
├── core/                    Language core (target-agnostic, @braid-lang/core)
│   ├── braid-parse.js       Parser with error recovery & source positions (758 lines)
│   ├── braid-transpile.js   AST → JavaScript direct transpiler (587 lines)
│   ├── braid-ir.js          Intermediate representation (468 lines)
│   ├── braid-emit-js.js     IR → JavaScript emitter (360 lines)
│   ├── braid-emit-py.js     IR → Python 3 emitter (392 lines)
│   ├── braid-rt.js          Runtime kernel: ADTs, type checks, errors (251 lines)
│   ├── braid-sandbox.js     Security sandbox (142 lines)
│   ├── braid-lsp.js         Language Server Protocol server (744 lines)
│   └── braid-check.js       CLI validator (215 lines)
│
├── tools/                   AiSHA CRM adapter layer
│   ├── braid-adapter.js     Production executor (transpile → cache → run)
│   ├── braid-rt.js          Re-exports core + CRM-specific policies
│   ├── braid-parse.js       Re-export shim
│   └── braid-transpile.js   Re-export shim
│
├── editor/vscode/           VS Code extension v0.7.0
│   ├── extension-client.js  LSP client
│   ├── server/              Bundled LSP server + core modules
│   ├── syntaxes/            Syntax highlighting (tmLanguage)
│   └── snippets/            40+ code snippets
│
├── examples/assistant/      20 production .braid files (119 functions)
└── spec/                    Type definitions
```

## Compilation Pipelines

**Direct (AiSHA production):** `.braid` → `parse()` → AST → `transpileToJS()` → JavaScript

**Multi-target (IR):** `.braid` → `parse()` → AST → `lower()` → IR → `emitJS()` / `emitPython()`

The direct path exists for backward compatibility and speed. The IR path enables multi-target compilation — same source compiles to both JavaScript and Python.

## Installation

```bash
# Use within AiSHA CRM (already wired)
cd backend
npm link ../braid-llm-kit

# Or as standalone package
npm install @braid-lang/core
```

```javascript
import { parse } from '@braid-lang/core/parser';
import { lower } from '@braid-lang/core/ir';
import { emitJS } from '@braid-lang/core/emit/js';
import { emitPython } from '@braid-lang/core/emit/python';

const ast = parse(braidSource, 'example.braid');
const ir = lower(ast);
const js = emitJS(ir);
const py = emitPython(ir);
```

## Language Features

### Core (v0.2–v0.3)
- Typed parameters with runtime `checkType()` validation
- Result/Option ADTs (`Ok`, `Err`, `Some`, `None`)
- Effect system (`!net`, `!clock`, `!fs`, `!rng`) with static analysis
- Pattern matching with destructuring
- `@policy` annotations (119 across 20 files)
- `CRMError.fromHTTP()` constructors (83 call sites)
- Sandbox mode (blocks eval, prototype pollution)

### v0.4 Language Features
- `for..in` loops: `for item in collection { ... }`
- `while` loops: `while condition { ... }` with `break`/`continue`
- Template strings: `` `Hello ${name}, you have ${count} items` ``
- Optional chaining: `account?.address?.city`
- Pipe operator: `data |> filter |> map |> len`
- Spread operator: `[...items, newItem]`, `{ ...base, key: value }`
- Else-if chains: `if x { } else if y { } else { }`
- Null literal: `null`

### v0.5 Multi-Target Architecture
- Intermediate representation (SSA-like flat instruction list)
- JavaScript emitter with sandbox support
- Python 3 emitter with dataclasses and type annotations
- `extractSignatures()` and `extractTypes()` for cross-file analysis
- `walkIR()` visitor pattern for custom analysis passes

## VS Code Extension (v0.7.0)

```bash
code --install-extension braid-language-0.7.0.vsix
```

- Syntax highlighting with template string and optional chaining support
- 40+ snippets (`@policy`, CRMError constructors, tool templates)
- **LSP: real-time diagnostics** (parse errors, effect mismatches, security warnings)
- **LSP: hover docs** (function signatures, stdlib reference, IO namespace docs)
- **LSP: go-to-definition** (functions, types, variables)
- **LSP: auto-completion** (keywords, stdlib, IO methods, policies, effects)
- **LSP: signature help** (parameter hints)
- **LSP: document symbols** (outline view)

## Security Model

1. **Sandbox** — Transpiled code blocks `eval`, `Function`, `process`, `require`, `fetch`, `setTimeout`, `__proto__`, `constructor`, `prototype`. Enabled by default in production (`BRAID_SANDBOX` env var).
2. **Capability enforcement** — Runtime `cap()` checks effects against active policy. Using `http.get()` without `!net` declared throws `BRAID_CAP`.
3. **Type validation** — `checkType()` emitted for every typed parameter. Wrong types throw `BRAID_TYPE`.
4. **Policy annotations** — `@policy(READ_ONLY)` controls allowed effects, execution timeout, audit logging. The LSP warns on missing policies.
5. **Immutable bindings** — No variable reassignment. Security-critical values (tenant IDs, policies) cannot be overwritten.
6. **Parser security warnings** — SEC001 for `__proto__`/`constructor`/`prototype` access.

## Tests

```bash
cd braid-llm-kit/core

# All tests (149 passing)
node --test braid-core.test.js braid-ir.test.js e2e-v05.test.js

# Core only (73 tests: parser, transpiler, runtime, sandbox)
node --test braid-core.test.js

# IR + emitters (47 tests: lowering, JS emit, Python emit)
node --test braid-ir.test.js

# End-to-end (29 tests: full pipeline with all v0.4/v0.5 features)
node --test e2e-v05.test.js
```

## CLI Tools

```bash
# Validate .braid files (3-phase: parse → structural → transpiler)
node core/braid-check.js examples/assistant/leads.braid

# Transpile to JavaScript
node tools/braid-transpile.js --file input.braid --out output.js --sandbox

# Check diagnostics as JSON
node core/braid-check.js --format json examples/assistant/
```

## Production Integration (AiSHA CRM)

The adapter (`tools/braid-adapter.js`) handles the full execution lifecycle:

1. Read `.braid` source file
2. Parse → transpile with active policy and sandbox mode
3. Cache compiled module (LRU, mtime-aware invalidation in dev)
4. Execute function with timeout enforcement
5. Cache successful results (LRU, bounded at 500 entries)
6. Return `Ok(value)` or structured `Err(CRMError)`

```javascript
import { executeBraid } from './braid-adapter.js';
import { CRM_POLICIES } from './braid-rt.js';

const result = await executeBraid(
  'examples/assistant/leads.braid',
  'searchLeads',
  CRM_POLICIES.READ_ONLY,
  deps,
  [tenantId, 'acme'],
  { cache: true, timeout: 30000 }
);
```

## Specification

See [BRAID_SPEC.md](./BRAID_SPEC.md) for the complete language specification including grammar, type system, effect system, and diagnostic codes.

See `core/grammar.ebnf` for the formal EBNF grammar.

---

*149 tests, 119 production functions, 20 .braid files, 2 compilation targets*
