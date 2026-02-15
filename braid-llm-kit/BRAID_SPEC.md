# Braid Language Specification

**Version:** 0.5.0  
**Status:** Active Development  
**First Production App:** AiSHA CRM (AI Super Hi-performing Assistant)

---

## Overview

Braid is a **security-first, target-agnostic DSL** for defining type-safe, capability-controlled tools that LLMs can execute safely. It compiles to multiple backends through an intermediate representation (IR).

**Core guarantees:**

- **Immutable bindings** — all `let` bindings are final; no variable reassignment
- **Effect tracking** — every side effect (`!net`, `!clock`, `!fs`, `!rng`) must be declared
- **Policy enforcement** — `@policy` annotations control what tools can do at compile time and runtime
- **Sandbox isolation** — transpiled code blocks `eval`, `Function`, prototype pollution, and dangerous globals
- **Multi-target compilation** — same `.braid` source compiles to JavaScript, Python, and future backends

**Compilation pipeline:**

```
source.braid → parse() → AST → lower() → IR → emitJS()     → JavaScript
                                             → emitPython()  → Python 3
                                             → emitRust()    → Rust (future)
```

The direct path `AST → transpileToJS()` also exists for the AiSHA CRM integration.

---

## Table of Contents

1. [Lexical Structure](#1-lexical-structure)
2. [Types](#2-types)
3. [Functions](#3-functions)
4. [Effects](#4-effects)
5. [Pattern Matching](#5-pattern-matching)
6. [Expressions](#6-expressions)
7. [Control Flow](#7-control-flow)
8. [Policies](#8-policies)
9. [Standard Library](#9-standard-library)
10. [Error Handling](#10-error-handling)
11. [Security Model](#11-security-model)
12. [Architecture](#12-architecture)
13. [Tooling](#13-tooling)
14. [Best Practices](#14-best-practices)

---

## 1. Lexical Structure

### 1.1 Keywords
```
fn let type import return if else match for in while
break continue true false null
Ok Err Some None
```

### 1.2 Operators
```
// Arithmetic & comparison
+  -  *  /  %  ==  !=  <  >  <=  >=

// Logical
&&  ||  !

// Special
|>    // pipe operator
?.    // optional chaining
...   // spread / rest
```

### 1.3 Comments
```braid
// Single-line comment

/* Multi-line
   block comment */
```

### 1.4 Literals
```braid
// Strings
"Hello, World"

// Template strings (interpolation)
`Hello, ${name}! You have ${count} items.`

// Numbers
42
3.14

// Booleans
true
false

// Null
null
```

### 1.5 Annotations
```braid
@policy(READ_ONLY)
@audit
@deprecated
```

---

## 2. Types

### 2.1 Primitive Types
| Type | Description |
|------|-------------|
| `String` | UTF-8 text |
| `Number` | Integer or float |
| `Boolean` | `true` or `false` |
| `Object` | Key-value map |
| `Array` | Ordered collection |

### 2.2 Algebraic Types
```braid
type Result<T, E> = Ok<T> | Err<E>
type Option<T> = Some<T> | None
```

### 2.3 Record Types
```braid
type Account = {
  id: String,
  name: String,
  annual_revenue: Number,
  industry: String
}
```

### 2.4 Union Types
```braid
type CRMError =
  | NotFound { entity: String, id: String }
  | ValidationError { field: String, message: String }
  | PermissionDenied { operation: String, reason: String }
  | NetworkError { url: String, code: Number }
```

---

## 3. Functions

### 3.1 Pure Functions
```braid
fn validateEmail(email: String) -> Boolean {
  let hasAt = includes(email, "@");
  let hasDot = includes(email, ".");
  return hasAt && hasDot;
}
```

### 3.2 Effectful Functions
```braid
@policy(READ_ONLY)
fn searchAccounts(tenant_id: String, query: String) -> Result<Array, CRMError> !net {
  let url = `/api/v2/accounts?tenant_id=${tenant_id}&q=${query}`;
  let response = http.get(url, {});

  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => CRMError.fromHTTP(url, error.status, "search_accounts"),
    _ => CRMError.network(url, 500, "unknown")
  };
}
```

### 3.3 Typed Parameters
```braid
fn createLead(
  tenant_id: String,
  first_name: String,
  last_name: String,
  email: String,
  company: String
) -> Result<Lead, CRMError> !net {
  // Parameters are runtime-validated via checkType()
}
```

### 3.4 Immutability

All bindings are immutable. There is no variable reassignment:

```braid
// ✅ Correct — new binding
let x = 10;
let y = x + 5;

// ❌ Invalid — reassignment does not exist
let x = 10;
x = 15;  // parse error
```

This is by design. Braid functions are pipelines: bind inputs → call API → match result → return. Immutability guarantees that tenant IDs, policy objects, and security-critical values cannot be overwritten mid-execution.

---

## 4. Effects

Effects declare what capabilities a function requires. The transpiler performs static analysis (`detectUsedEffects`) to catch undeclared or unused effects.

### 4.1 Built-in Effects

| Effect | Namespace | Methods |
|--------|-----------|---------|
| `!net` | `http` | `get`, `post`, `put`, `delete`, `patch` |
| `!clock` | `clock` | `now`, `sleep` |
| `!fs` | `fs` | `read`, `write` |
| `!rng` | `rng` | `random`, `uuid` |

### 4.2 Syntax
```braid
// Single effect
fn fetch() -> Result<Data, Error> !net { ... }

// Multiple effects
fn process() -> Result<Data, Error> !net, clock { ... }

// No effects = pure function
fn calculate(x: Number) -> Number { ... }
```

### 4.3 Static Analysis

The transpiler detects effect mismatches:

- **BRD020** (error): Effect used in body but not declared in signature
- **BRD021** (warning): Effect declared but never used

---

## 5. Pattern Matching

### 5.1 Basic Match
```braid
match value {
  "active" => handleActive(),
  "closed" => handleClosed(),
  _ => handleDefault()
}
```

### 5.2 Result Matching (primary pattern)
```braid
return match response {
  Ok{value} => Ok(value.data),
  Err{error} => CRMError.fromHTTP(url, error.status, "operation_name"),
  _ => CRMError.network(url, 500, "unknown")
};
```

### 5.3 Match with Block Bodies
```braid
match response {
  Ok{value} => {
    let data = value.data;
    let filtered = filter(data, isActive);
    return Ok(filtered);
  },
  Err{error} => CRMError.fromHTTP(url, error.status, "op"),
  _ => CRMError.network(url, 500, "unknown")
}
```

---

## 6. Expressions

### 6.1 Template Strings
```braid
let url = `/api/v2/leads?tenant_id=${tenant_id}&q=${query}`;
let msg = `Found ${len(results)} results for ${query}`;
```

### 6.2 Optional Chaining
```braid
let status = lead?.status;
let city = account?.address?.city;
```

### 6.3 Pipe Operator
```braid
let result = data |> filter |> map |> len;
// Equivalent to: len(map(filter(data)))
```

### 6.4 Spread Operator

In arrays:
```braid
let combined = [...existing, newItem];
```

In objects:
```braid
let updated = { ...base, status: "active", tenant_id: tenant_id };
```

Rest parameters:
```braid
fn process(...args: Array) -> Result { ... }
```

### 6.5 Object and Array Literals
```braid
let payload = {
  tenant_id: tenant_id,
  name: name,
  status: "new",
  metadata: {}
};

let items = [1, 2, 3];
let value = items[0];
```

---

## 7. Control Flow

### 7.1 If / Else-If / Else
```braid
if status == "active" {
  return Ok(data);
} else if status == "pending" {
  return Ok([]);
} else {
  return CRMError.notFound("Entity", id);
}
```

### 7.2 For..In Loops
```braid
for lead in leads {
  let status = lead?.status;
  // process each lead
}
```

### 7.3 While Loops
```braid
let index = 0;
while index < len(items) {
  let item = items[index];
  // process item
  let index = index + 1;
}
```

### 7.4 Break and Continue
```braid
for item in items {
  if item?.skip == true {
    continue;
  }
  if item?.done == true {
    break;
  }
}
```

---

## 8. Policies

### 8.1 Annotations
Every effectful function should have a `@policy` annotation:

```braid
@policy(READ_ONLY)
fn listAccounts(tenant_id: String) -> Result<Array, CRMError> !net { ... }

@policy(WRITE_OPERATIONS)
fn createLead(tenant_id: String, name: String) -> Result<Lead, CRMError> !net { ... }

@policy(DELETE_OPERATIONS)
fn deleteAccount(tenant_id: String, id: String) -> Result<Boolean, CRMError> !net { ... }

@policy(ADMIN_OPERATIONS)
fn purgeAllData(tenant_id: String) -> Result<Boolean, CRMError> !net { ... }
```

### 8.2 Valid Policies

| Policy | Effects Allowed | Use Case |
|--------|----------------|----------|
| `READ_ONLY` | net, clock | List, search, get operations |
| `WRITE_OPERATIONS` | net, clock | Create, update operations |
| `DELETE_OPERATIONS` | net, clock | Soft-delete operations |
| `ADMIN_OPERATIONS` | net, clock, fs | Bulk operations, system admin |
| `SYSTEM` | net, clock, fs, rng | Internal system operations |

### 8.3 Diagnostics

- **BRD010** (warning): Effectful function without `@policy`
- **BRD011** (error): Invalid policy name
- **BRD030** (hint): Effectful function missing `tenant_id` as first parameter

---

## 9. Standard Library

### 9.1 Collection Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `len(x)` | `Array → Number` | Length of array or string |
| `map(arr, fn)` | `Array, Fn → Array` | Transform each element |
| `filter(arr, fn)` | `Array, Fn → Array` | Keep matching elements |
| `reduce(arr, fn, init)` | `Array, Fn, T → T` | Fold to single value |
| `find(arr, fn)` | `Array, Fn → Option` | First matching element |
| `some(arr, fn)` | `Array, Fn → Boolean` | Any element matches |
| `every(arr, fn)` | `Array, Fn → Boolean` | All elements match |
| `includes(arr, val)` | `Array, T → Boolean` | Contains value |
| `join(arr, sep)` | `Array, String → String` | Join with separator |
| `sort(arr)` | `Array → Array` | Sort elements |
| `reverse(arr)` | `Array → Array` | Reverse order |
| `flat(arr)` | `Array → Array` | Flatten nested arrays |
| `sum(arr)` | `Array<Number> → Number` | Sum all values |
| `avg(arr)` | `Array<Number> → Number` | Average of values |

### 9.2 Object Functions

| Function | Description |
|----------|-------------|
| `keys(obj)` | Object keys as array |
| `values(obj)` | Object values as array |
| `entries(obj)` | Key-value pairs as array |

### 9.3 Conversion Functions

| Function | Description |
|----------|-------------|
| `parseInt(s)` | String to integer |
| `parseFloat(s)` | String to float |
| `toString(x)` | Any value to string |

### 9.4 IO Namespaces

```braid
// Network (!net)
http.get(url, options)
http.post(url, options)
http.put(url, options)
http.delete(url, options)
http.patch(url, options)

// Time (!clock)
clock.now()
clock.sleep(ms)

// Files (!fs)
fs.read(path)
fs.write(path, content)

// Random (!rng)
rng.random()
rng.uuid()
```

---

## 10. Error Handling

### 10.1 CRMError Constructors

The preferred error pattern uses `CRMError` constructors:

```braid
// HTTP error mapping (primary pattern)
CRMError.fromHTTP(url, statusCode, operationName)

// Specific constructors
CRMError.notFound(entity, id)
CRMError.validation(field, message)
CRMError.forbidden(operation, reason)
CRMError.network(url, code, context)
```

### 10.2 Standard Response Pattern

Every effectful Braid function follows this pattern:

```braid
@policy(READ_ONLY)
fn getAccount(tenant_id: String, id: String) -> Result<Account, CRMError> !net {
  let url = `/api/v2/accounts/${id}?tenant_id=${tenant_id}`;
  let response = http.get(url, {});

  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => CRMError.fromHTTP(url, error.status, "get_account"),
    _ => CRMError.network(url, 500, "unknown")
  };
}
```

### 10.3 Runtime Error Codes

| Code | Meaning |
|------|---------|
| `BRAID_TYPE` | Runtime type validation failed (`checkType()`) |
| `BRAID_CAP` | Capability check failed (effect not allowed by policy) |
| `BRAID_TIMEOUT` | Function exceeded `max_execution_ms` |
| `BRAID_SANDBOX` | Sandbox blocked dangerous operation |

---

## 11. Security Model

### 11.1 Sandbox

When sandbox mode is enabled (default in production, controlled by `BRAID_SANDBOX` env var), transpiled code:

- Blocks property access to `__proto__`, `constructor`, `prototype` via `safeGet()`
- Blocks global references to `eval`, `Function`, `process`, `require`, `fetch`, `setTimeout` via `guardGlobal()`
- The sandbox module is auto-frozen to prevent runtime tampering

### 11.2 Parser Security Warnings

The parser emits **SEC001** warnings when source code contains suspicious identifiers:
- `__proto__`, `constructor`, `prototype` in member expressions

### 11.3 Capability Enforcement

The runtime `cap()` function checks effects against the active policy before any IO operation:

```javascript
// Emitted by transpiler for effectful functions
cap(policy, "net");  // throws BRAID_CAP if policy denies !net
```

### 11.4 Type Validation

The transpiler emits `checkType()` calls for every typed parameter:

```javascript
// For fn createLead(tenant_id: String, name: String)
checkType(tenant_id, "String", "tenant_id");
checkType(name, "String", "name");
```

---

## 12. Architecture

### 12.1 Core / Adapter Split

```
braid-llm-kit/
├── core/                    ← Language core (target-agnostic)
│   ├── braid-parse.js       Parser (758 lines, error recovery, source positions)
│   ├── braid-transpile.js   Direct AST→JS transpiler (587 lines)
│   ├── braid-ir.js          Intermediate representation (468 lines)
│   ├── braid-emit-js.js     IR→JavaScript emitter (360 lines)
│   ├── braid-emit-py.js     IR→Python 3 emitter (392 lines)
│   ├── braid-rt.js          Runtime kernel (251 lines, zero app-specific code)
│   ├── braid-sandbox.js     Security sandbox (142 lines)
│   ├── braid-check.js       CLI validator (227 lines)
│   ├── braid-lsp.js         Language Server Protocol (987 lines, 8 capabilities)
│   ├── braid-scope.js       Scope indexer for references/rename (382 lines)
│   ├── grammar.ebnf          Formal grammar (105 lines)
│   ├── braid-core.test.js   Core tests (73 passing)
│   ├── braid-ir.test.js     IR + emitter tests (47 passing)
│   ├── e2e-v05.test.js      End-to-end tests (29 passing)
│   ├── braid-integration.test.js  Integration tests (125 passing)
│   ├── braid-scope.test.js  Scope tests (31 passing)
│   ├── braid-lsp-integration.test.js  LSP integration tests (22 passing)
│   └── package.json          @braid-lang/core v0.5.0
│
├── tools/                   ← AiSHA CRM adapter layer
│   ├── braid-rt.js          Re-exports core + CRM policies, field permissions
│   ├── braid-parse.js       Re-export shim → core/braid-parse.js
│   ├── braid-transpile.js   Re-export shim → core/braid-transpile.js
│   └── braid-adapter.js     Production adapter (transpile, cache, execute)
│
├── editor/vscode/           ← VS Code extension (v0.7.0)
│   ├── extension-client.js  LSP client entry point
│   ├── server/              LSP server + bundled core modules
│   ├── syntaxes/            tmLanguage grammar
│   └── snippets/            Code snippets
│
├── examples/assistant/      ← 20 production .braid files (119 functions)
│   ├── accounts.braid
│   ├── leads.braid
│   ├── contacts.braid
│   ├── opportunities.braid
│   └── ...
│
└── spec/                    ← Type definitions and spec documents
```

### 12.2 Compilation Pipelines

**Direct path** (AiSHA production):
```
.braid → parse() → AST → transpileToJS() → JavaScript → data URL → import()
```

**IR path** (multi-target):
```
.braid → parse() → AST → lower() → IR → emitJS()     → JavaScript
                                       → emitPython()  → Python 3
```

### 12.3 IR Design

The IR is a flat list of SSA-like instructions where every intermediate value gets a named temporary. This makes code generation trivial — each IR instruction maps 1:1 to a statement in the target language.

```
fn searchLeads(tenant_id: String, query: String) !net @policy(READ_ONLY)
  let __t0 = template(`/api/v2/leads?tenant_id=`, tenant_id, `&q=`, query)
  let __t1 = member(http, get)
  let __t2 = call(__t1, __t0, {})
  match __t2
    Ok{value} => ...
    Err{error} => ...
```

---

## 13. Tooling

### 13.1 VS Code Extension (v0.7.0)

Install: `code --install-extension braid-language-0.7.0.vsix`

Capabilities:
- Syntax highlighting (tmLanguage)
- Code snippets (40+ snippets for common patterns)
- **LSP — real-time diagnostics** (parse errors, security warnings, policy validation, effect mismatches)
- **Hover documentation** (function signatures, stdlib docs, IO namespace docs)
- **Go-to-definition** (functions, types, variables, cross-file imports)
- **Auto-completion** (keywords, stdlib, IO methods, policies, effects, functions from current file)
- **Signature help** (parameter hints for stdlib and user functions)
- **Document symbols** (outline view of functions and types)
- **Find-all-references** (variables, functions, parameters, cross-file via scope index)
- **Rename symbol** (variables, functions, parameters, cross-file; refuses stdlib and builtins)

### 13.2 CLI Tools

```bash
# Validate .braid files (3-phase: parse → structural → transpiler)
node core/braid-check.js examples/assistant/leads.braid

# Transpile to JavaScript
node tools/braid-transpile.js --file input.braid --out output.js

# Transpile with sandbox guards
node tools/braid-transpile.js --file input.braid --out output.js --sandbox

# Run tests (330 total)
cd core && node --test braid-core.test.js braid-ir.test.js e2e-v05.test.js braid-integration.test.js braid-scope.test.js braid-lsp-integration.test.js
```

### 13.3 Diagnostic Codes

| Code | Severity | Meaning |
|------|----------|---------|
| BRD010 | warning | Effectful function missing `@policy` |
| BRD011 | error | Invalid policy name |
| BRD020 | error | Effect used but not declared |
| BRD021 | warning | Effect declared but not used |
| BRD030 | hint | Missing `tenant_id` as first parameter |
| BRD040 | warning | Match expression without wildcard arm |
| BRD050 | warning | Unreachable code after return |
| BRD002 | warning | `null` literal — prefer `Option<T>` |
| SEC001 | warning | Suspicious identifier (`__proto__`, `constructor`, `prototype`) |
| TP001–TP003 | error | Transpiler errors |

---

## 14. Best Practices

### 14.1 Always use @policy
```braid
// ✅ Policy declared
@policy(READ_ONLY)
fn listLeads(tenant_id: String) -> Result<Array, CRMError> !net { ... }

// ❌ Missing policy
fn listLeads(tenant_id: String) -> Result<Array, CRMError> !net { ... }
```

### 14.2 Tenant-first parameters
```braid
// ✅ tenant_id is first parameter
fn createLead(tenant_id: String, name: String) -> Result<Lead, CRMError> !net

// ❌ tenant_id buried
fn createLead(name: String, tenant_id: String) -> Result<Lead, CRMError> !net
```

### 14.3 Use CRMError constructors
```braid
// ✅ Structured error
Err{error} => CRMError.fromHTTP(url, error.status, "create_lead"),

// ❌ Raw object
Err{error} => Err({ tag: "APIError", url: url, code: error.status }),
```

### 14.4 Declare all effects
```braid
// ✅ Effects match usage
fn process() -> Result<Data, Error> !net, clock {
  let time = clock.now();
  let response = http.get(url, {});
}

// ❌ Missing clock effect
fn process() -> Result<Data, Error> !net {
  let time = clock.now();  // BRD020 error
}
```

### 14.5 Prefer immutable data flow
```braid
// ✅ New bindings, no mutation
let base = { q: query, limit: 10 };
let withStatus = { ...base, status: status };

// ❌ Braid doesn't support reassignment
let payload = { q: query };
payload.status = status;  // parse error
```

---

## Appendix: Grammar (EBNF)

See `core/grammar.ebnf` for the complete formal grammar. Summary:

```ebnf
Program     = { Import | Annotation FnDecl | FnDecl | TypeDecl } ;
Annotation  = "@" Ident "(" Args ")" ;
FnDecl      = "fn" Ident "(" Params ")" "->" TypeExpr [ "!" Effects ] Block ;
TypeDecl    = "type" Ident "=" Variants ;
Import      = "import" "{" Idents "}" "from" StringLit ;
Block       = "{" { Stmt } "}" ;
Stmt        = LetStmt | ReturnStmt | IfStmt | ForStmt | WhileStmt
            | BreakStmt | ContinueStmt | ExprStmt ;
Expr        = PipeExpr ;
PipeExpr    = OrExpr { "|>" OrExpr } ;
Primary     = Ident | Number | String | Template | Bool | Null
            | Array | Object | Match | Lambda | "(" Expr ")" ;
```

---

*Braid v0.5.0 — 330 tests passing, 119 production functions, 20 .braid files*
