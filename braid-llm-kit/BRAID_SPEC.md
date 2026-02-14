# Braid Language Specification

**Version:** 0.3.0-draft  
**Status:** Evolving - Open for Community Contribution  
**First Production App:** AiSHA CRM (AI Super Hi-performing Assistant)

---

## Overview

Braid is an **AI-native Domain-Specific Language (DSL)** designed for defining type-safe, capability-controlled tools that Large Language Models (LLMs) can execute safely. It bridges the gap between human-readable code and machine-executable actions with first-class support for:

- **Type Safety** - Explicit types with Result/Option for error handling
- **Effect Declarations** - Explicit side-effect tracking (`!net`, `!clock`, `!fs`)
- **Capability Policies** - Fine-grained control over what tools can do
- **Multi-Tenant Isolation** - Built-in tenant context for SaaS applications
- **Audit Logging** - Every execution is traceable

---

## Table of Contents

1. [Lexical Structure](#lexical-structure)
2. [Types](#types)
3. [Functions](#functions)
4. [Effects](#effects)
5. [Pattern Matching](#pattern-matching)
6. [Expressions](#expressions)
7. [Policies](#policies)
8. [Standard Library Types](#standard-library-types)
9. [Tool Registration](#tool-registration)
10. [MCP Integration](#mcp-integration)
11. [Best Practices](#best-practices)
12. [Evolution Roadmap](#evolution-roadmap)

---

## 1. Lexical Structure

### 1.1 Identifiers
```
Ident = Letter { Letter | Digit | "_" }
Letter = "A"…"Z" | "a"…"z"
Digit = "0"…"9"
```

### 1.2 Keywords
```
type enum trait impl fn let mut match return if else 
true false Ok Err Some None
import from as
```

### 1.3 Comments
```braid
// Single-line comment

/* 
   Multi-line comment
   (planned - not yet implemented)
*/
```

### 1.4 Literals
```braid
// Strings
"Hello, World"
"Multi-part " + variable + " string"

// Numbers
42
3.14
1_000_000  // Underscores for readability (planned)

// Booleans
true
false
```

---

## 2. Types

### 2.1 Primitive Types
```braid
String    // UTF-8 text
Number    // Numeric value (integer or float)
Boolean   // true or false
JSONB     // Arbitrary JSON object
```

### 2.2 Type Aliases
```braid
type Email = String
type TenantId = String
type UserId = String
```

### 2.3 Record Types
```braid
type User = {
  id: String,
  name: String,
  email: Email,
  created_at: String
}

type AccountMetadata = {
  num_employees: Number,
  notes: String
}
```

### 2.4 Algebraic Data Types

#### Result Type (for error handling)
```braid
type Result<T, E> = Ok<T> | Err<E>
```

#### Option Type (for nullable values)
```braid
type Option<T> = Some<T> | None
```

#### Union Types (enums)
```braid
enum Auth {
  Anonymous,
  Bearer(token: String),
  ApiKey(key: String)
}

// Shorthand for string unions (planned)
type Status = "new" | "active" | "closed"
```

### 2.5 Generic Types
```braid
// Arrays
Array<Account>
Array<String>

// Generic result
Result<Lead, CRMError>
Result<Array<Activity>, NetworkError>
```

### 2.6 Error Types (Domain-Specific)

Braid defines structured error variants for CRM operations. In practice, `.braid`
files use two primary tags (`APIError` and `NetworkError`) that carry HTTP status
codes. The backend `summarizeToolResult` function maps these status codes to the
appropriate semantic error type for AI-friendly messages.

```braid
// Semantic error variants (used by summarizeToolResult, can be returned directly)
type CRMError = 
  | NotFound { entity: String, id: String }
  | ValidationError { field: String, message: String }
  | PermissionDenied { operation: String, reason: String }
  | NetworkError { url: String, code: Number }
  | DatabaseError { query: String, message: String }
  | PolicyViolation { effect: String, policy: String }
  // Catch-all HTTP error (primary pattern used in .braid files)
  | APIError { url: String, code: Number, operation: String, entity?: String, id?: String, query?: String }
```

**Status code mapping in `summarizeToolResult`:**
- `APIError` with `code: 400` → treated as ValidationError
- `APIError` with `code: 401/403` → treated as PermissionDenied
- `APIError` with `code: 404` → treated as NotFound
- `APIError` with `code: 5xx` → treated as server error

**Common pattern in .braid files:**
```braid
return match response {
  Ok{value} => Ok(value.data),
  Err{error} => Err({ tag: "APIError", url: url, code: error.status, operation: "search_leads" }),
  _ => Err({ tag: "NetworkError", url: url, code: 500 })
};
```

---

## 3. Functions

### 3.1 Function Declaration
```braid
fn functionName(param1: Type1, param2: Type2) -> ReturnType {
  // body
}
```

### 3.2 Pure Functions (No Effects)
```braid
fn calculateTotal(items: Array<Item>) -> Number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

fn validateEmail(email: String) -> Boolean {
  let hasAt = includes(email, "@");
  let hasDot = includes(email, ".");
  return hasAt && hasDot;
}
```

### 3.3 Effectful Functions
```braid
fn fetchAccount(id: String) -> Result<Account, CRMError> !net {
  let url = "/api/v2/accounts/" + id;
  let response = http.get(url);
  
  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => Err({ tag: "APIError", url: url, code: error.status, operation: "get_account", entity: "Account", id: id }),
    _ => Err({ tag: "NetworkError", url: url, code: 500 })
  };
}
```

### 3.4 Multiple Effects
```braid
fn createActivityWithTimestamp(
  subject: String,
  tenant_id: String
) -> Result<Activity, CRMError> !net, clock {
  let timestamp = clock.now();
  let payload = {
    subject: subject,
    tenant_id: tenant_id,
    created_at: timestamp
  };
  
  let response = http.post("/api/v2/activities", { body: payload });
  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => Err(NetworkError{ url: "/api/v2/activities", code: error.status }),
    _ => Err(NetworkError{ url: "/api/v2/activities", code: 500 })
  };
}
```

---

## 4. Effects

Effects declare what capabilities a function requires. They enable:
- **Capability checking** at compile/lint time
- **Policy enforcement** at runtime
- **Audit logging** for security compliance

### 4.1 Built-in Effects

| Effect | Description | Example Usage |
|--------|-------------|---------------|
| `!net` | Network I/O (HTTP calls, API requests) | `http.get()`, `http.post()` |
| `!clock` | Time access | `clock.now()` |
| `!fs` | File system access | `fs.read()`, `fs.write()` |
| `!db` | Direct database access (planned) | `db.query()` |
| `!email` | Send emails (planned) | `email.send()` |

### 4.2 Effect Declaration Syntax
```braid
// Single effect
fn fetchData() -> Result<Data, Error> !net { ... }

// Multiple effects
fn processWithTime() -> Result<Data, Error> !net, clock { ... }

// No effects (pure function)
fn calculate(x: Number) -> Number { ... }
```

### 4.3 Effect Propagation (Planned)
```braid
// Caller must declare at least the effects of callees
fn outerFunction() -> Result<Data, Error> !net, clock {
  let data = fetchData();  // requires !net
  let time = getTime();    // requires !clock
  return process(data, time);
}
```

---

## 5. Pattern Matching

### 5.1 Basic Match
```braid
fn greet(name: String) -> String {
  match name {
    "" => "Hello, stranger",
    n => "Hello, " + n
  }
}
```

### 5.2 Result Pattern Matching
```braid
fn handleResult(result: Result<Account, CRMError>) -> String {
  match result {
    Ok{value} => "Success: " + value.name,
    Err{error} => "Error occurred",
    _ => "Unknown state"
  }
}
```

### 5.3 Enum Pattern Matching
```braid
fn authHeader(auth: Auth) -> String {
  match auth {
    Anonymous => "Authorization: none",
    Bearer(t) => "Authorization: Bearer " + t,
    ApiKey(k) => "X-API-Key: " + k
  }
}
```

### 5.4 Record Destructuring
```braid
fn formatUser(user: User) -> String {
  match user {
    { name: n, email: e } => n + " <" + e + ">"
  }
}
```

---

## 6. Expressions

### 6.1 Let Bindings
```braid
let x: Number = 42;
let mut counter: Number = 0;  // Mutable (planned)
```

### 6.2 Conditionals
```braid
fn checkStatus(status: String) -> String {
  if status == "active" {
    return "User is active";
  } else {
    return "User is inactive";
  }
}

// Early returns for error handling
fn processResponse(response: Result) -> Result {
  if response.tag == "Err" {
    return Err({ message: "Failed" });
  }
  
  let data = response.value.data;
  return Ok(data);
}

// Complex conditions with member access
fn validateLead(lead: Object) -> Boolean {
  if lead.status == "qualified" && lead.score > 50 {
    return true;
  }
  return false;
}
```

### 6.3 HTTP Expressions
```braid
// GET request
let response = http.get(url);
let response = http.get(url, { headers: headers });

// POST request
let response = http.post(url, { body: payload });
let response = http.post(url, { body: payload, headers: headers });

// PUT, DELETE, PATCH
let response = http.put(url, { body: payload });
let response = http.delete(url);
let response = http.patch(url, { body: partial });
```

### 6.4 String Operations
```braid
let combined = "Hello, " + name + "!";
let length = len(text);
let hasValue = includes(text, "search");
```

### 6.5 Result Constructors
```braid
// Success
Ok(accountData)
Ok({ id: newId, name: name })

// Error
Err(ValidationError{ field: "email", message: "Invalid format" })
Err(NetworkError{ url: requestUrl, code: 500 })
```

---

## 7. Policies

Policies control what tools can do at runtime.

### 7.1 Policy Structure
```javascript
// JavaScript representation
const CRM_POLICIES = {
  READ_ONLY: {
    tenant_isolation: true,
    allow_effects: ['net', 'clock'],
    deny_effects: ['fs'],
    max_execution_ms: 30000,
    audit_log: true
  },
  
  WRITE_OPERATIONS: {
    tenant_isolation: true,
    allow_effects: ['net', 'clock'],
    deny_effects: ['fs'],
    max_execution_ms: 60000,
    audit_log: true,
    require_user_id: true
  },
  
  ADMIN_OPERATIONS: {
    tenant_isolation: true,
    allow_effects: ['net', 'clock', 'fs'],
    max_execution_ms: 120000,
    audit_log: true,
    require_role: 'admin'
  }
};
```

### 7.2 Braid Policy Type (Planned)
```braid
type Policy = {
  allow_effects: Array<String>,
  tenant_isolation: Boolean,
  audit_log: Boolean,
  max_execution_ms: Number
}

// Policy annotations (planned)
@policy(READ_ONLY)
fn listAccounts(tenant_id: String) -> Result<Array<Account>, CRMError> !net {
  ...
}
```

---

## 8. Standard Library Types

Located in `spec/types.braid`:

### 8.1 Core Types
```braid
type Result<T, E> = Ok<T> | Err<E>
type Option<T> = Some<T> | None
```

### 8.2 CRM Domain Types
```braid
type Account = { id, name, annual_revenue, industry, ... }
type Lead = { id, first_name, last_name, email, status, ... }
type Contact = { id, first_name, last_name, account_id, ... }
type Opportunity = { id, name, amount, stage, probability, ... }
type Activity = { id, type, subject, body, status, due_date, ... }
```

### 8.3 Error Types

See [Section 2.6](#26-error-types-domain-specific) for the full type definition
including the `APIError` catch-all variant used in production `.braid` files.

---

## 9. Tool Registration

### 9.1 AiSHA Integration Pattern
```javascript
// In braidIntegration-v2.js
const TOOL_REGISTRY = {
  search_leads: {
    braidFile: 'leads.braid',
    fnName: 'searchLeads',
    description: 'Search for leads by name, company, or email',
    paramOrder: ['query']
  },
  create_activity: {
    braidFile: 'activities.braid',
    fnName: 'createActivity',
    description: 'Create a new activity (task, call, meeting, email)',
    paramOrder: ['tenant_id', 'type', 'subject', 'due_date', 'due_time', ...]
  }
};
```

### 9.2 Auto-Schema Generation
Braid function signatures automatically generate OpenAI-compatible tool schemas:

```braid
fn searchLeads(query: String) -> Result<Array<Lead>, CRMError> !net
```
↓ Generates
```json
{
  "name": "search_leads",
  "description": "Search for leads",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search query" }
    },
    "required": ["query"]
  }
}
```

---

## 10. MCP Integration

Braid integrates with the Model Context Protocol (MCP) via `braid-mcp-node-server`.

### 10.1 Request Envelope
```typescript
interface BraidRequestEnvelope {
  requestId: string;
  actor: { id: string, type: "user" | "agent" | "system" };
  actions: BraidAction[];
  createdAt: string;
  client?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}
```

### 10.2 Action Structure
```typescript
interface BraidAction {
  id: string;
  verb: "read" | "search" | "create" | "update" | "delete" | "run";
  actor: BraidActor;
  resource: { system: string, kind: string };
  targetId?: string;
  filters?: BraidFilter[];
  payload?: Record<string, unknown>;
}
```

### 10.3 Adapters
The MCP server routes actions to system-specific adapters:
- `CrmAdapter` - AiSHA CRM operations
- `WebAdapter` - Web scraping/search
- `GitHubAdapter` - Repository operations
- `LlmAdapter` - AI model calls
- `MemoryAdapter` - Context persistence

---

## 11. Best Practices

### 11.1 Always Use Result Types
```braid
// ✅ Good - explicit error handling
fn fetchAccount(id: String) -> Result<Account, CRMError> !net

// ❌ Bad - implicit error handling
fn fetchAccount(id: String) -> Account !net
```

### 11.2 Declare All Effects
```braid
// ✅ Good - effects are explicit
fn createWithTimestamp() -> Result<Lead, CRMError> !net, clock

// ❌ Bad - hidden effects
fn createWithTimestamp() -> Result<Lead, CRMError>
```

### 11.3 Use Descriptive Error Types
```braid
// ✅ Good - specific error with context
Err(NotFound{ entity: "Lead", id: leadId })

// ❌ Bad - generic error
Err("Something went wrong")
```

### 11.4 Tenant Isolation
```braid
// ✅ Good - tenant_id is first parameter
fn listLeads(tenant_id: String, status: String) -> Result<Array<Lead>, CRMError>

// ❌ Bad - tenant_id buried or missing
fn listLeads(status: String) -> Result<Array<Lead>, CRMError>
```

---

## 12. Evolution Roadmap

### Phase 1: Current (v0.2.0) ✅
- Basic type system
- Result/Option types
- Effect declarations
- Pattern matching
- HTTP operations
- AiSHA CRM integration

### Phase 2: Near-Term (v0.3.0)
- [ ] Better error messages with line context
- [ ] VS Code syntax highlighting extension
- [ ] Auto-generate TOOL_REGISTRY from .braid files
- [ ] If/else expressions (not just match)
- [ ] String interpolation: `"Hello ${name}"`

### Phase 3: Medium-Term (v0.4.0)
- [ ] Language Server Protocol (LSP) implementation
- [ ] Browser-based playground
- [ ] Tool composition: `pipeline = searchLeads >> filterActive >> enrich`
- [ ] Automatic retry with backoff: `!net(retry=3)`
- [ ] Caching hints: `!net(cache=60s)`

### Phase 4: Long-Term (v1.0.0)
- [ ] Compile-time effect checking
- [ ] Policy DSL: `policy ReadOnly { allow: [read], deny: [write] }`
- [ ] Streaming support for real-time APIs
- [ ] Multi-language codegen (TypeScript, Python, Go)
- [ ] Community package registry

---

## Appendix A: Grammar (EBNF)

```ebnf
Program     = { Item } ;
Item        = TypeDecl | EnumDecl | TraitDecl | ImplDecl | FnDecl ;

TypeDecl    = "type" Ident "=" TypeExpr ";" ;
EnumDecl    = "enum" Ident "{" { Variant } "}" ;
Variant     = Ident [ "(" TypeExpr { "," TypeExpr } ")" ] ;

FnDecl      = FnSig Block ;
FnSig       = "fn" Ident "(" [ Params ] ")" "->" TypeExpr [ "!" EffectList ] ;
Params      = Param { "," Param } ;
Param       = Ident ":" TypeExpr ;

EffectList  = Ident { "," Ident } ;

TypeExpr    = Ident
            | "[" TypeExpr "]"                   (* slice *)
            | Ident "[" TypeExpr { "," TypeExpr } "]"   (* generic *)
            | "{" Field { "," Field } "}"        (* record *)
            ;

Block       = "{" { Stmt } "}" ;
Stmt        = Let | Expr ";" ;
Let         = "let" [ "mut" ] Ident ":" TypeExpr "=" Expr ";" ;

Expr        = Ident | Literal | Call | Match | Lambda | RecordLit
            | "Ok" "(" Expr ")" | "Err" "(" Expr ")" ;

Match       = "match" Expr "{" { MatchArm } "}" ;
MatchArm    = Pattern "=>" Expr ;
Pattern     = "_" | Literal | Ident | RecordPat ;
```

---

## Appendix B: File Extensions

| Extension | Purpose |
|-----------|---------|
| `.braid` | Braid source files |
| `.braid.json` | Compiled tool schemas |
| `.braid.d.ts` | TypeScript type declarations (planned) |

---

*This specification is a living document. Contributions welcome!*
