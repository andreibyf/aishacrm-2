# Thunder Client Quick Requests (Free Version)

Since Thunder Client's free version doesn't support collections, here are individual requests you can create manually.

## Quick Copy-Paste Requests

### 1. Health Check ✅
**Method:** GET  
**URL:** `http://localhost:8000/health`  
**Headers:** None needed

---

### 2. List Adapters ✅
**Method:** GET  
**URL:** `http://localhost:8000/adapters`  
**Headers:** None needed

---

### 3. Queue Stats ✅
**Method:** GET  
**URL:** `http://localhost:8000/queue/stats`  
**Headers:** None needed

---

### 4. Memory Status ✅
**Method:** GET  
**URL:** `http://localhost:8000/memory/status`  
**Headers:** None needed

---

## POST Requests (Copy Body from Below)

### 5. Search CRM Accounts
**Method:** POST  
**URL:** `http://localhost:8000/mcp/run`  
**Headers:** `Content-Type: application/json`  
**Body (JSON):**
```json
{
  "requestId": "req-accounts-001",
  "actor": {
    "id": "user:test",
    "type": "user"
  },
  "actions": [
    {
      "id": "action-1",
      "verb": "search",
      "actor": {
        "id": "user:test",
        "type": "user"
      },
      "resource": {
        "system": "crm",
        "kind": "accounts"
      },
      "metadata": {
        "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46"
      },
      "options": {
        "maxItems": 10
      }
    }
  ],
  "createdAt": "2024-12-30T12:00:00.000Z"
}
```

---

### 6. Search CRM Leads
**Method:** POST  
**URL:** `http://localhost:8000/mcp/run`  
**Headers:** `Content-Type: application/json`  
**Body (JSON):**
```json
{
  "requestId": "req-leads-001",
  "actor": {
    "id": "user:test",
    "type": "user"
  },
  "actions": [
    {
      "id": "action-1",
      "verb": "search",
      "actor": {
        "id": "user:test",
        "type": "user"
      },
      "resource": {
        "system": "crm",
        "kind": "leads"
      },
      "metadata": {
        "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46"
      },
      "options": {
        "maxItems": 10
      }
    }
  ],
  "createdAt": "2024-12-30T12:00:00.000Z"
}
```

---

### 7. Search CRM Contacts
**Method:** POST  
**URL:** `http://localhost:8000/mcp/run`  
**Headers:** `Content-Type: application/json`  
**Body (JSON):**
```json
{
  "requestId": "req-contacts-001",
  "actor": {
    "id": "user:test",
    "type": "user"
  },
  "actions": [
    {
      "id": "action-1",
      "verb": "search",
      "actor": {
        "id": "user:test",
        "type": "user"
      },
      "resource": {
        "system": "crm",
        "kind": "contacts"
      },
      "metadata": {
        "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46"
      },
      "options": {
        "maxItems": 10
      }
    }
  ],
  "createdAt": "2024-12-30T12:00:00.000Z"
}
```

---

### 8. Search Wikipedia
**Method:** POST  
**URL:** `http://localhost:8000/mcp/run`  
**Headers:** `Content-Type: application/json`  
**Body (JSON):**
```json
{
  "requestId": "req-wiki-001",
  "actor": {
    "id": "user:test",
    "type": "user"
  },
  "actions": [
    {
      "id": "action-1",
      "verb": "search",
      "actor": {
        "id": "user:test",
        "type": "user"
      },
      "resource": {
        "system": "web",
        "kind": "wikipedia-search"
      },
      "payload": {
        "q": "artificial intelligence"
      }
    }
  ],
  "createdAt": "2024-12-30T12:00:00.000Z"
}
```

---

### 9. Create CRM Activity
**Method:** POST  
**URL:** `http://localhost:8000/mcp/run`  
**Headers:** `Content-Type: application/json`  
**Body (JSON):**
```json
{
  "requestId": "req-activity-001",
  "actor": {
    "id": "user:test",
    "type": "user"
  },
  "actions": [
    {
      "id": "action-1",
      "verb": "create",
      "actor": {
        "id": "user:test",
        "type": "user"
      },
      "resource": {
        "system": "crm",
        "kind": "activities"
      },
      "metadata": {
        "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46"
      },
      "payload": {
        "type": "call",
        "subject": "Test call from Thunder Client",
        "body": "Testing Braid MCP API",
        "status": "completed"
      }
    }
  ],
  "createdAt": "2024-12-30T12:00:00.000Z"
}
```

---

### 10. Generate JSON with LLM
**Method:** POST  
**URL:** `http://localhost:8000/mcp/run`  
**Headers:** `Content-Type: application/json`  
**Body (JSON):**
```json
{
  "requestId": "req-llm-001",
  "actor": {
    "id": "user:test",
    "type": "user"
  },
  "actions": [
    {
      "id": "action-1",
      "verb": "run",
      "actor": {
        "id": "user:test",
        "type": "user"
      },
      "resource": {
        "system": "llm",
        "kind": "generate-json"
      },
      "metadata": {
        "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46"
      },
      "payload": {
        "prompt": "Analyze this lead and suggest next steps",
        "context": "Lead: John Doe, Company: Acme Corp, Status: Interested in AI automation",
        "schema": {
          "type": "object",
          "properties": {
            "priority": {
              "type": "string",
              "enum": ["high", "medium", "low"]
            },
            "next_steps": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "estimated_value": {
              "type": "number"
            }
          }
        }
      }
    }
  ],
  "createdAt": "2024-12-30T12:00:00.000Z"
}
```

---

## How to Use (Thunder Client Free Version)

1. **Open Thunder Client** (⚡ icon in VS Code sidebar)
2. **Click "New Request"**
3. **For GET requests:**
   - Paste the URL
   - Click "Send"
4. **For POST requests:**
   - Select "POST" method
   - Paste the URL: `http://localhost:8000/mcp/run`
   - Click "Headers" tab → Add: `Content-Type: application/json`
   - Click "Body" tab → Select "JSON" → Paste the JSON body
   - Click "Send"

---

## Alternative: Use curl (Command Line)

If you prefer command line testing:

### Health Check
```bash
curl http://localhost:8000/health
```

### Search Accounts
```bash
curl -X POST http://localhost:8000/mcp/run \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "req-001",
    "actor": {"id": "user:test", "type": "user"},
    "actions": [{
      "id": "action-1",
      "verb": "search",
      "actor": {"id": "user:test", "type": "user"},
      "resource": {"system": "crm", "kind": "accounts"},
      "metadata": {"tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46"},
      "options": {"maxItems": 10}
    }],
    "createdAt": "2024-12-30T12:00:00.000Z"
  }'
```

---

## Alternative: Use PowerShell (Windows)

### Health Check
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get
```

### Search Accounts
```powershell
$body = @{
  requestId = "req-001"
  actor = @{
    id = "user:test"
    type = "user"
  }
  actions = @(
    @{
      id = "action-1"
      verb = "search"
      actor = @{
        id = "user:test"
        type = "user"
      }
      resource = @{
        system = "crm"
        kind = "accounts"
      }
      metadata = @{
        tenant_id = "a11dfb63-4b18-4eb8-872e-747af2e37c46"
      }
      options = @{
        maxItems = 10
      }
    }
  )
  createdAt = "2024-12-30T12:00:00.000Z"
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:8000/mcp/run" -Method Post -Body $body -ContentType "application/json"
```

---

## Alternative: REST Client Extension (Free)

If you want a better free alternative to Thunder Client:

1. Install "REST Client" extension by Huachao Mao
2. Create `.http` files (see below)
3. Click "Send Request" above each request

---

## Your Configuration

- **Base URL:** `http://localhost:8000`
- **Tenant ID:** `a11dfb63-4b18-4eb8-872e-747af2e37c46`
- **Content-Type:** `application/json`

---

Start with the **Health Check** (GET request) to confirm your server is running! 🚀
