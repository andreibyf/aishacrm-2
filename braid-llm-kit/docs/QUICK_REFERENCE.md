# Braid Quick Reference Card

## Function Syntax

```braid
// Pure function (no effects)
fn functionName(param: Type) -> ReturnType {
  // body
}

// Function with effects
fn functionName(param: Type) -> Result<T, E> !net, clock {
  // body
}
```

## Types

| Type | Example | Description |
|------|---------|-------------|
| `String` | `"hello"` | UTF-8 text |
| `Number` | `42`, `3.14` | Numeric value |
| `Boolean` | `true`, `false` | Boolean |
| `Array<T>` | `Array<Lead>` | Array of T |
| `Result<T, E>` | `Result<Lead, CRMError>` | Success or error |
| `Option<T>` | `Option<String>` | Some value or None |
| `JSONB` | Arbitrary JSON | JSON object |

## Effects

| Effect | Access | Example |
|--------|--------|---------|
| `!net` | HTTP/Network | `http.get(url)` |
| `!clock` | Current time | `clock.now()` |
| `!fs` | File system | `fs.read(path)` |

## HTTP Operations

```braid
// GET
let response = http.get(url);
let response = http.get(url, { headers: { ... } });

// POST
let response = http.post(url, { body: payload });

// PUT
let response = http.put(url, { body: payload });

// DELETE
let response = http.delete(url);

// PATCH
let response = http.patch(url, { body: partial });
```

## Pattern Matching

```braid
// Match expression
match value {
  pattern1 => result1,
  pattern2 => result2,
  _ => default
}

// Match Result
match response {
  Ok{value} => handleSuccess(value),
  Err{error} => handleError(error),
  _ => handleUnknown()
}
```

## Result Constructors

```braid
// Success
Ok(value)
Ok({ id: "123", name: "Test" })

// Error
Err(ErrorType{ field: value })
Err(NotFound{ entity: "Lead", id: leadId })
Err(NetworkError{ url: url, code: 500 })
```

## Error Types

```braid
CRMError =
  | NotFound { entity: String, id: String }
  | ValidationError { field: String, message: String }
  | PermissionDenied { operation: String, reason: String }
  | NetworkError { url: String, code: Number }
  | DatabaseError { query: String, message: String }
  | PolicyViolation { effect: String, policy: String }
```

## Type Definitions

```braid
// Type alias
type Email = String

// Record type
type User = {
  id: String,
  name: String,
  email: Email
}

// Enum
enum Status { New, Active, Closed }
enum Auth { Anonymous, Bearer(token: String) }

// Union error type
type MyError =
  | NotFound { id: String }
  | Invalid { reason: String }
```

## Common Patterns

### API Tool Template
```braid
fn toolName(tenant_id: String, param: Type) -> Result<T, CRMError> !net {
  let url = "/api/v2/endpoint";
  let payload = { tenant_id: tenant_id, param: param };
  let response = http.post(url, { body: payload });
  
  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => Err(NetworkError{ url: url, code: error.status }),
    _ => Err(NetworkError{ url: url, code: 500 })
  };
}
```

### Search Tool Template
```braid
fn searchThing(query: String) -> Result<Array<T>, CRMError> !net {
  let url = "/api/v2/things/search?q=" + query;
  let response = http.get(url);
  
  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => Err(NetworkError{ url: url, code: error.status }),
    _ => Err(NetworkError{ url: url, code: 500 })
  };
}
```

### Validation (Pure)
```braid
fn validateEmail(email: String) -> Boolean {
  let hasAt = includes(email, "@");
  let hasDot = includes(email, ".");
  return hasAt && hasDot;
}
```

## Built-in Functions

| Function | Description |
|----------|-------------|
| `len(string)` | String length |
| `includes(string, search)` | Check if contains |
| `clock.now()` | Current ISO timestamp |

## Policies (Runtime)

```javascript
{
  tenant_isolation: true,    // Enforce tenant context
  allow_effects: ['net'],    // Allowed effects
  deny_effects: ['fs'],      // Denied effects
  max_execution_ms: 30000,   // Timeout
  audit_log: true            // Log executions
}
```

## File Structure

```
braid-llm-kit/
├── spec/
│   └── types.braid        # Standard library types
├── examples/
│   └── assistant/         # Production tool definitions
│       ├── leads.braid
│       ├── contacts.braid
│       ├── accounts.braid
│       └── activities.braid
├── sdk/
│   └── braid-sdk.js       # JavaScript SDK
└── tools/
    ├── braid-check        # Syntax checker
    └── braid-fmt          # Formatter
```

---

*Full reference: [BRAID_SPEC.md](../BRAID_SPEC.md)*
