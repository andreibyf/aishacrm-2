# Braid Quick Reference (v0.5.0)

## Function Syntax

```braid
// Pure function
fn calculate(x: Number, y: Number) -> Number {
  return x + y;
}

// Effectful function with policy
@policy(READ_ONLY)
fn fetchData(tenant_id: String) -> Result<Array, CRMError> !net {
  let response = http.get(`/api/v2/data?tenant_id=${tenant_id}`, {});
  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => CRMError.fromHTTP(url, error.status, "fetch_data"),
    _ => CRMError.network(url, 500, "unknown")
  };
}
```

## Types

| Type | Example | Notes |
|------|---------|-------|
| `String` | `"hello"`, `` `hello ${name}` `` | Template strings supported |
| `Number` | `42`, `3.14` | |
| `Boolean` | `true`, `false` | |
| `Array` | `[1, 2, 3]` | |
| `Object` | `{ key: value }` | |
| `null` | `null` | Prefer `Option<T>` |
| `Result<T, E>` | `Ok(data)`, `Err(error)` | Primary error handling |
| `Option<T>` | `Some(value)`, `None` | Optional values |

## Effects

| Effect | Namespace | Methods |
|--------|-----------|---------|
| `!net` | `http` | `get`, `post`, `put`, `delete`, `patch` |
| `!clock` | `clock` | `now`, `sleep` |
| `!fs` | `fs` | `read`, `write` |
| `!rng` | `rng` | `random`, `uuid` |

## Policies

```braid
@policy(READ_ONLY)         // list, search, get
@policy(WRITE_OPERATIONS)  // create, update
@policy(DELETE_OPERATIONS)  // soft-delete
@policy(ADMIN_OPERATIONS)  // bulk ops, system admin
@policy(SYSTEM)            // internal system ops
```

## Error Constructors

```braid
CRMError.fromHTTP(url, statusCode, operationName)  // primary pattern
CRMError.notFound(entity, id)
CRMError.validation(field, message)
CRMError.forbidden(operation, reason)
CRMError.network(url, code, context)
```

## Pattern Matching

```braid
// Standard response pattern
return match response {
  Ok{value} => Ok(value.data),
  Err{error} => CRMError.fromHTTP(url, error.status, "op_name"),
  _ => CRMError.network(url, 500, "unknown")
};

// Match with block body
match response {
  Ok{value} => {
    let filtered = filter(value.data, isActive);
    return Ok(filtered);
  },
  Err{error} => CRMError.fromHTTP(url, error.status, "op"),
  _ => CRMError.network(url, 500, "unknown")
}
```

## Template Strings

```braid
let url = `/api/v2/leads?tenant_id=${tenant_id}&q=${query}`;
let msg = `Found ${len(results)} results`;
```

## Optional Chaining

```braid
let status = lead?.status;
let city = account?.address?.city;
```

## Pipe Operator

```braid
let result = data |> filter |> map |> len;
```

## Spread

```braid
let combined = [...existing, newItem];
let updated = { ...base, status: "active" };
```

## Control Flow

```braid
// If / else-if / else
if status == "active" {
  return Ok(data);
} else if status == "pending" {
  return Ok([]);
} else {
  return CRMError.notFound("Entity", id);
}

// For..in
for lead in leads {
  let name = lead?.name;
}

// While
let i = 0;
while i < len(items) {
  let item = items[i];
  let i = i + 1;
}
```

## Stdlib

| Function | Description |
|----------|-------------|
| `len(x)` | Length of array or string |
| `map(arr, fn)` | Transform elements |
| `filter(arr, fn)` | Keep matching elements |
| `reduce(arr, fn, init)` | Fold to single value |
| `find(arr, fn)` | First match |
| `some(arr, fn)` | Any match? |
| `every(arr, fn)` | All match? |
| `includes(arr, val)` | Contains? |
| `join(arr, sep)` | Join with separator |
| `sort(arr)` | Sort |
| `reverse(arr)` | Reverse |
| `flat(arr)` | Flatten nested |
| `sum(arr)` | Sum numbers |
| `avg(arr)` | Average |
| `keys(obj)` | Object keys |
| `values(obj)` | Object values |
| `entries(obj)` | Key-value pairs |
| `parseInt(s)` | String → integer |
| `parseFloat(s)` | String → float |
| `toString(x)` | Any → string |

## Immutability

All bindings are immutable. No reassignment:

```braid
let x = 10;
let y = x + 5;     // ✅ new binding

let x = 10;
x = 15;             // ❌ parse error — no reassignment
```

Use spread to create updated copies:
```braid
let base = { q: query, limit: 10 };
let withStatus = { ...base, status: "active" };
```

## Tool Template

```braid
import { Result, Lead, CRMError } from "../../spec/types.braid"

@policy(WRITE_OPERATIONS)
fn createLead(
  tenant_id: String,
  first_name: String,
  last_name: String,
  email: String,
  company: String
) -> Result<Lead, CRMError> !net {
  let url = "/api/v2/leads";
  let body = {
    tenant_id: tenant_id,
    first_name: first_name,
    last_name: last_name,
    email: email,
    company: company,
    status: "new"
  };

  let response = http.post(url, { body: body });

  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => CRMError.fromHTTP(url, error.status, "create_lead"),
    _ => CRMError.network(url, 500, "unknown")
  };
}
```

## File Structure

```
core/                        Language core
├── braid-parse.js           Parser (758 lines)
├── braid-transpile.js       AST → JS (587 lines)
├── braid-ir.js              IR layer (468 lines)
├── braid-emit-js.js         IR → JS (360 lines)
├── braid-emit-py.js         IR → Python (392 lines)
├── braid-rt.js              Runtime (251 lines)
├── braid-sandbox.js         Sandbox (142 lines)
├── braid-lsp.js             LSP server (744 lines)
└── braid-check.js           CLI validator (215 lines)

tools/                       AiSHA adapter
├── braid-adapter.js         Production executor
├── braid-rt.js              Core + CRM policies
├── braid-parse.js           Re-export shim
└── braid-transpile.js       Re-export shim

examples/assistant/          20 .braid files, 119 functions
```

## Tests

```bash
cd core
node --test braid-core.test.js braid-ir.test.js e2e-v05.test.js braid-integration.test.js
# 274 tests, 0 failures
```

## Diagnostic Codes

| Code | Meaning |
|------|---------|
| BRD010 | Missing `@policy` on effectful function |
| BRD011 | Invalid policy name |
| BRD020 | Effect used but not declared |
| BRD021 | Effect declared but not used |
| BRD030 | Missing `tenant_id` first param |
| BRD040 | Match without wildcard arm |
| BRD050 | Unreachable code after return |
| SEC001 | `__proto__`/`constructor`/`prototype` access |

---

*Full spec: [BRAID_SPEC.md](../BRAID_SPEC.md)*
