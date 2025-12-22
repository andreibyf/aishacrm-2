# Why Braid? A Type-Safe Language for AI Tool Calling

**TL;DR:** If you're building AI-powered SaaS, you need type safety, audit trails, and multi-tenant isolation for your tool calls. Braid provides all three in a clean, AI-friendly syntax.

---

## The Problem

When building AI assistants that can take actions (create records, send emails, modify data), you face three critical challenges:

### 1. 🔒 Type Safety
LLMs generate tool calls, but how do you ensure the parameters are correct?

```javascript
// What if the AI passes a string where you expect a number?
// What if required fields are missing?
// What if the response is an error?
tool.createLead({ name: undefined, email: 12345 }) // 💥
```

### 2. 📊 Effect Tracking
Which tools can access the network? Which can write to disk? Which need audit logging?

```javascript
// Is this tool safe to auto-execute?
// Does it modify data or just read it?
// Should we log this for compliance?
tool.executeAction("dangerousTool", params) // 🤷
```

### 3. 🏢 Multi-Tenant Isolation
In SaaS, tenant A should never see tenant B's data. But AI doesn't know about tenants.

```javascript
// Will this leak data across tenants?
// Who enforces the isolation?
ai.fetchLeads({ name: "John" }) // Could return ANY tenant's leads!
```

---

## The Solution: Braid

Braid is a Domain-Specific Language (DSL) designed specifically for AI tool calling. It solves all three problems with first-class language features.

### 1. Type Safety with Result Types

```braid
fn createLead(
  tenant_id: String,  // Required
  name: String,       // Required
  email: String       // Required
) -> Result<Lead, CRMError> !net {
  // Types are checked at schema generation
  // Result type forces error handling
  // No uncaught exceptions
}
```

The AI receives a strongly-typed schema:
```json
{
  "name": "create_lead",
  "parameters": {
    "type": "object",
    "properties": {
      "tenant_id": { "type": "string" },
      "name": { "type": "string" },
      "email": { "type": "string" }
    },
    "required": ["tenant_id", "name", "email"]
  }
}
```

### 2. Explicit Effect Declarations

```braid
// Pure function - no side effects, safe to memoize
fn calculateScore(lead: Lead) -> Number {
  return lead.activity_count * 10;
}

// Network effect - needs HTTP access
fn fetchLead(id: String) -> Result<Lead, CRMError> !net {
  return http.get("/api/leads/" + id);
}

// Multiple effects - needs network AND time
fn createActivityNow() -> Result<Activity, CRMError> !net, clock {
  let timestamp = clock.now();
  return http.post("/api/activities", { created_at: timestamp });
}
```

Effects are:
- **Visible** in function signatures
- **Enforced** by policy at runtime
- **Logged** for audit compliance

### 3. Built-in Tenant Isolation

```braid
fn listLeads(tenant_id: String, status: String) -> Result<Array<Lead>, CRMError> !net {
  // tenant_id is the FIRST parameter by convention
  // Policy enforcement ensures tenant_id matches the calling context
  let url = "/api/v2/leads?tenant_id=" + tenant_id + "&status=" + status;
  return http.get(url);
}
```

Runtime policies:
```javascript
const POLICY = {
  tenant_isolation: true,  // Enforced automatically
  require_user_id: true,   // Who is making this call?
  audit_log: true          // Log every execution
};
```

---

## How Braid Works

### 1. You Write Tools in Braid

```braid
// leads.braid
import { Result, Lead, CRMError } from "../spec/types.braid"

fn searchLeads(query: String) -> Result<Array<Lead>, CRMError> !net {
  let url = "/api/v2/leads/search?q=" + query;
  let response = http.get(url);
  
  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => Err(NetworkError{ url: url, code: error.status }),
    _ => Err(NetworkError{ url: url, code: 500 })
  };
}
```

### 2. The SDK Generates AI Schemas

```javascript
import { loadToolSchema } from '@braid/sdk';

const schema = await loadToolSchema('leads.braid', 'searchLeads');
// Returns OpenAI-compatible tool definition
```

### 3. The AI Calls Your Tool

```javascript
// AI generates: tool_call("search_leads", { query: "John" })

const result = await executeBraid(
  'leads.braid',
  'searchLeads',
  POLICY.READ_ONLY,
  deps,
  ['John']
);

if (result.tag === 'Ok') {
  sendToAI(result.value);
} else {
  sendToAI(`Error: ${result.error.message}`);
}
```

---

## Compared to Alternatives

| Feature | Raw JSON Schema | OpenAPI | Braid |
|---------|----------------|---------|-------|
| Type safety | ✅ Schema | ✅ Schema | ✅ Language-level |
| Effect tracking | ❌ | ❌ | ✅ `!net, clock, fs` |
| Error handling | ❌ Ad-hoc | ❌ Status codes | ✅ `Result<T, E>` |
| Tenant isolation | ❌ Manual | ❌ Manual | ✅ Policy-enforced |
| Audit logging | ❌ Manual | ❌ Manual | ✅ Automatic |
| AI-optimized | ❌ | ❌ | ✅ Designed for LLMs |

---

## Real-World Example: AiSHA CRM

Braid powers AiSHA (AI Super Hi-performing Assistant), a multi-tenant CRM with:

- **27 production tools** (Accounts, Leads, Contacts, Activities, Opportunities)
- **Voice-enabled AI assistant** using the same tool definitions
- **Full audit logging** of every AI action
- **Zero cross-tenant data leaks** via policy enforcement

Example tool from production:

```braid
fn createActivity(
  tenant_id: String,
  type: String,
  subject: String,
  due_date: String,
  due_time: String,
  related_to: Option<String>,
  related_id: Option<String>
) -> Result<Activity, CRMError> !net, clock {
  
  let timestamp = clock.now();
  
  let payload = {
    tenant_id: tenant_id,
    type: type,
    subject: subject,
    due_date: due_date,
    due_time: due_time,
    related_to: related_to,
    related_id: related_id,
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

## Getting Started

### 1. Install the SDK
```bash
npm install @braid/sdk
# or
npm link ../braid-llm-kit
```

### 2. Create Your First Tool
```braid
// hello.braid
fn greet(name: String) -> String {
  match name {
    "" => "Hello, World!",
    n => "Hello, " + n + "!"
  }
}
```

### 3. Execute It
```javascript
import { executeBraid, CRM_POLICIES } from '@braid/sdk';

const result = await executeBraid(
  'hello.braid',
  'greet',
  CRM_POLICIES.READ_ONLY,
  deps,
  ['Alice']
);

console.log(result); // "Hello, Alice!"
```

---

## The Vision

Braid is evolving toward:

1. **Compile-time effect checking** - Catch capability violations before runtime
2. **Tool composition** - Chain tools: `searchLeads >> filterActive >> enrichData`
3. **Multi-language codegen** - Generate TypeScript, Python, Go from .braid files
4. **Community registry** - Share and discover Braid tools

---

## Contributing

Braid is open for community contribution. We're specifically looking for:

- **Syntax improvements** - How can we make Braid more expressive?
- **IDE tooling** - VS Code extension, LSP implementation
- **Error messages** - More helpful diagnostics
- **Use cases** - How are you using AI tool calling?

---

*Braid: Type-safe AI tool calling for the rest of us.*
