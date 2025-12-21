# Braid LLM Kit (Extended)

# Braid SDK - AI-Native Language for Executive Assistants

**Version:** 0.2.0  
**Status:** Production-Ready for AI-SHA CRM

Braid is an AI-native Domain-Specific Language (DSL) designed by LLMs, for LLMs. It provides **type safety**, **capability enforcement**, and **tenant isolation** for building Executive Assistant tools that LLMs can safely execute.

## 🎯 What Makes Braid Special

### 1. **AI-First Design**
- **Type-Safe Tool Definitions:** Clear function signatures that LLMs understand
- **Effect Declarations:** Explicit `!net`, `!clock`, `!fs` effects for capability control
- **Result Types:** `Result<T, E>` for explicit error handling without exceptions
- **Pattern Matching:** Clean conditional logic that LLMs can reason about

### 2. **Enterprise Security**
- **Tenant Isolation:** Automatic `tenant_id` injection prevents cross-tenant data leaks
- **Capability Policies:** Fine-grained control over network, filesystem, time access
- **Audit Logging:** Every tool execution logged with tenant/user context
- **Timeout Enforcement:** Automatic termination of runaway tools

### 3. **Executive Assistant Ready**
Built specifically for **AI-SHA CRM** - the AI Super Hi-performing Assistant:
- **27 Production Tools:** Accounts, Leads, Contacts, Opportunities, Activities, Notes, Web Research
- **Proactive Intelligence:** Suggest next actions, detect conflicts, forecast revenue
- **Multi-Domain:** Calendar management, sales pipeline, document organization
- **External Integration:** Web search, company lookup, data enrichment

## 📦 Installation

```bash
# In your backend project
cd backend
npm link ../braid-llm-kit

# Or add to package.json
"dependencies": {
	"@braid/sdk": "file:../braid-llm-kit"
}
```

## 🚀 Quick Start

### 1. **Import the SDK**
```javascript
import { 
	executeBraid, 
	loadToolSchema, 
	createBackendDeps, 
	CRM_POLICIES 
} from '@braid/sdk';
```

### 2. **Create Dependencies**
```javascript
const deps = createBackendDeps(
	'http://localhost:3001',  // Backend URL
	'labor-depot',             // Tenant ID
	'user-uuid-123'            // User ID (for audit)
);
```

### 3. **Execute a Tool**
```javascript
const result = await executeBraid(
	'braid-llm-kit/examples/assistant/accounts.braid',
	'createAccount',
	CRM_POLICIES.WRITE_OPERATIONS,
	deps,
	['labor-depot', 'Acme Corp', 'Technology', 5000000, 'https://acme.com', 'owner-uuid'],
	{ cache: false, timeout: 30000 }
);

if (result.tag === 'Ok') {
	console.log('Account created:', result.value);
} else {
	console.error('Error:', result.error);
}
```

### 4. **Generate OpenAI Tool Schemas**
```javascript
const schema = await loadToolSchema(
	'braid-llm-kit/examples/assistant/accounts.braid',
	'createAccount'
);

// Use with OpenAI Chat Completions API
const tools = [schema];
const response = await openai.chat.completions.create({
	model: 'gpt-4o',
	messages: [...],
	tools: tools,
	tool_choice: 'auto'
});
```

### 5. **Calling a Remote MCP Braid Server**

You can also execute Braid actions via the Dockerized MCP server (see `braid-mcp-node-server/` and `tools/mcp-braid-server.json`). It expects a `BraidRequestEnvelope` and returns a `BraidResponseEnvelope`.

**Example `BraidRequestEnvelope` (JSON):**
```json
{
  "requestId": "demo-request-1",
  "actor": { "id": "agent:demo", "type": "agent" },
  "createdAt": "2025-01-01T00:00:00.000Z",
  "client": "aisha-llm-kit",
  "channel": "agent",
  "actions": [
    {
      "id": "action-1",
      "verb": "read",
      "actor": { "id": "agent:demo", "type": "agent" },
      "resource": { "system": "mock", "kind": "example-entity" },
      "targetId": "123"
    }
  ]
}
```

**Example `BraidResponseEnvelope` (JSON):**
```json
{
  "requestId": "demo-request-1",
  "startedAt": "2025-01-01T00:00:00.100Z",
  "finishedAt": "2025-01-01T00:00:00.150Z",
  "metadata": {
    "actorId": "agent:demo",
    "client": "aisha-llm-kit",
    "channel": "agent"
  },
  "results": [
    {
      "actionId": "action-1",
      "status": "success",
      "resource": { "system": "mock", "kind": "example-entity" },
      "data": {
        "echo": true,
        "note": "Mock adapter - replace with real system adapter."
      }
    }
  ]
}
```

## 🛠️ Available Tools (27 Production-Ready)

### **CRM Operations** (6 tools)
- `create_account` - Create new business account
- `update_account` - Modify account details
- `get_account_details` - Fetch single account
- `list_accounts` - Query multiple accounts
- `delete_account` - Remove account
- `fetch_tenant_snapshot` - Get comprehensive CRM snapshot

### **Lead Management** (4 tools)
- `create_lead` - Capture new lead
- `update_lead` - Modify lead status/data
- `convert_lead_to_account` - Promote lead to account
- `list_leads` - Query leads by status

### **Calendar & Activities** (5 tools)
- `create_activity` - Log task/call/email
- `update_activity` - Modify activity
- `mark_activity_complete` - Complete task
- `get_upcoming_activities` - Fetch calendar
- `schedule_meeting` - Book meeting with attendees

### **Notes & Documentation** (5 tools)
- `create_note` - Add note to any record
- `update_note` - Edit existing note
- `search_notes` - Full-text search
- `get_notes_for_record` - Fetch all notes for account/lead/etc
- `delete_note` - Remove note

### **Opportunities** (5 tools)
- `create_opportunity` - New sales opportunity
- `update_opportunity` - Change stage/amount
- `list_opportunities_by_stage` - Pipeline view
- `get_opportunity_forecast` - Revenue forecast
- `mark_opportunity_won` - Close deal

### **Contacts** (4 tools)
- `create_contact` - Add person to account
- `update_contact` - Modify contact
- `list_contacts_for_account` - Get all contacts
- `search_contacts` - Find by name/email

### **Web Research** (3 tools)
- `search_web` - Google/Bing search
- `fetch_web_page` - Scrape URL
- `lookup_company_info` - Enrich company data

## 📝 Writing Braid Tools

### Basic Structure
```braid
// Import types
import { Result, Account, CRMError } from "../../spec/types.braid"

// Declare function with effects
fn createAccount(
	tenant: String,
	name: String,
	annual_revenue: Number
) -> Result<Account, CRMError> !net {
	// HTTP call
	let url = "/api/v2/accounts";
	let body = { tenant_id: tenant, name: name, annual_revenue: annual_revenue };
	let response = http.post(url, { body: body });
  
	// Pattern matching on Result
	return match response {
		Ok{value} => Ok(value.data),
		Err{error} => Err(NetworkError{ url: url, code: error.status }),
		_ => Err(NetworkError{ url: url, code: 500 })
	};
}
```

### Type System
```braid
// Result type for explicit error handling
type Result<T, E> = Ok(T) | Err(E)

// Optional values
type Option<T> = Some(T) | None

// Union types for enums
type Status = "new" | "contacted" | "qualified" | "lost"

// Records with fields
type Account = {
	id: String,
	name: String,
	annual_revenue: Number,
	industry: String,
	metadata: JSONB
}
```

### Effects System
```braid
// Declare capabilities needed
fn fetchData() -> Result<Data, Error> !net, clock {
	let timestamp = clock.now();      // Clock effect
	let response = http.get("/api");  // Network effect
	return Ok(response);
}

// No effects = pure function
fn calculateRevenue(accounts: Array) -> Number {
	// Pure computation, no I/O
	return accounts.reduce((sum, acc) => sum + acc.annual_revenue, 0);
}
```

## 🔒 Security Policies

### READ_ONLY Policy
```javascript
CRM_POLICIES.READ_ONLY = {
	tenant_isolation: true,
	allow_effects: ['net', 'clock'],
	deny_effects: ['fs'],
	max_execution_ms: 30000,
	audit_log: true
};
```

### WRITE_OPERATIONS Policy
```javascript
CRM_POLICIES.WRITE_OPERATIONS = {
	tenant_isolation: true,
	allow_effects: ['net', 'clock'],
	deny_effects: ['fs'],
	max_execution_ms: 60000,
	audit_log: true,
	require_user_id: true  // Mutations must have user context
};
```

## 🎭 Integration Patterns

See `backend/lib/braidIntegration-v2.js` for full integration example with:
- Tool Registry (25+ tools mapped to Braid files)
- Auto-Generate OpenAI Schemas
- Policy-Based Execution Routing
- Post-Tool Summarization

## 🧪 Testing

## Quick use
```bash
cd braid-llm-kit

# format
node tools/braid-fmt < examples/03_result_effects.braid > /tmp/out.braid

# check (JSONL diagnostics, nonzero exit on errors)
node tools/braid-check examples/03_result_effects.braid

# build manifest (mock)
node tools/braid-build templates/web-service

# run (mock event stream)
node tools/braid-run templates/web-service/out/app.wasm --policy templates/web-service/policy.json
```

## LLM self-correction loop
Use `tools/llm_autofix.py` to apply checker-suggested edits automatically:
```bash
python3 tools/llm_autofix.py examples/03_result_effects.braid
```

## Stub generator (hosted LLM)
`tools/agent_stub.py` calls a hosted LLM to produce a Braid file then runs the checker:
```bash
export OPENAI_API_KEY=sk-...   # or set in PowerShell
python3 tools/agent_stub.py "Create a /time endpoint returning epoch" examples/time.braid || true
python3 tools/llm_autofix.py examples/time.braid
```
