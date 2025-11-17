# Braid MCP Node.js Server (Dockerized)

This package provides a production-ready Node.js + TypeScript HTTP server that exposes
a Braid v0 executor over a simple JSON API, serving as the central AI operations hub for Aisha CRM.

## 🚀 Features

- **Braid v0 Framework** - Unified action-based interface for AI operations
- **Multi-Adapter Architecture** - CRM, Web, GitHub, LLM, and Mock adapters
- **Direct Supabase Access** - Optional direct database queries for performance
- **OpenAI Integration** - Smart key resolution from tenant settings or system config
- **Docker Ready** - Full containerization with docker-compose integration
- **Type-Safe** - Written in TypeScript with comprehensive type definitions

## 📦 Included Adapters

### CRM Adapter (`system: "crm"`)
Connects to Aisha CRM database via Supabase for all CRM operations.

**Supported Kinds:**
- `accounts` - Account management
- `leads` - Lead tracking
- `contacts` - Contact management
- `opportunities` - Sales pipeline
- `activities` - Activity logging

**Supported Verbs:**
- `read` - Get single record by ID
- `search` - Query records with filters
- `create` - Create new records
- `update` - Update existing records
- `delete` - Delete records

**Direct Supabase Mode:**
Set `USE_DIRECT_SUPABASE_ACCESS=true` to bypass backend API and query Supabase directly for improved performance.

### Web Adapter (`system: "web"`)
Wikipedia research tools for market intelligence and context gathering.

**Supported Kinds:**
- `wikipedia-search` / `search_wikipedia` - Search Wikipedia articles
- `wikipedia-page` / `get_wikipedia_page` - Fetch full article content

### LLM Adapter (`system: "llm"`)
OpenAI integration with intelligent API key resolution.

**Supported Kinds:**
- `generate-json` / `generate_json` - Generate structured JSON from prompts

**Key Resolution Priority:**
1. Explicit `api_key` in payload
2. Tenant integration (`tenant_integrations` table)
3. System settings (`system_settings` table)

### GitHub Adapter (`system: "github"`)
GitHub API integration for repository and user operations.

**Supported Kinds:**
- `repos` / `list_repos` - List user repositories
- `user` / `get_user` - Get authenticated user info

**Requires:** `GITHUB_TOKEN` or `GH_TOKEN` environment variable

### Mock Adapter (`system: "mock"`)
Testing and development adapter with simulated responses.

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
NODE_ENV=production
PORT=8000

# Backend API (fallback for CRM operations)
CRM_BACKEND_URL=http://localhost:3001

# Supabase (direct database access)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
USE_DIRECT_SUPABASE_ACCESS=true

# OpenAI
DEFAULT_OPENAI_MODEL=gpt-4o-mini

# GitHub
GITHUB_TOKEN=your-github-token
```

See `.env.example` for a complete template.

## 🚀 Getting Started

### Local Development

```bash
npm install
npm run build
npm start
# server listens on http://localhost:8000
```

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Docker

Build and run directly:

```bash
docker build -t braid-mcp-node-server .
docker run -p 8000:8000 \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=your-key \
  --name braid-mcp braid-mcp-node-server
```

### Docker Compose

The server is integrated into the main Aisha CRM docker-compose setup:

```bash
docker compose -f braid-mcp-node-server/docker-compose.yml up -d --build
```

Service will be available at `http://localhost:8000`.

## 📡 API Contract

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "braid-mcp-node-server"
}
```

### POST /mcp/run

Execute a Braid action envelope.

**Request body:** `BraidRequestEnvelope` (JSON)

```ts
interface BraidRequestEnvelope {
  requestId: string;
  actor: {
    id: string;
    type: "user" | "agent" | "system";
    roles?: string[];
  };
  actions: BraidAction[];
  createdAt: string;
  client?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}
```

**Response body:** `BraidResponseEnvelope`

```ts
interface BraidResponseEnvelope {
  requestId: string;
  results: BraidActionResult[];
  startedAt: string;
  finishedAt: string;
  metadata?: Record<string, unknown>;
}
```

## 💡 Usage Examples

### Example 1: Search CRM Accounts

```bash
curl -X POST http://localhost:8000/mcp/run \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "req-001",
    "actor": {"id": "agent:sales-ai", "type": "agent"},
    "createdAt": "2025-11-14T00:00:00.000Z",
    "actions": [{
      "id": "action-1",
      "verb": "search",
      "actor": {"id": "agent:sales-ai", "type": "agent"},
      "resource": {"system": "crm", "kind": "accounts"},
      "metadata": {"tenant_id": "your-tenant-uuid"},
      "options": {"maxItems": 10}
    }]
  }'
```

### Example 2: Create CRM Activity

```bash
curl -X POST http://localhost:8000/mcp/run \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "req-002",
    "actor": {"id": "user:123", "type": "user"},
    "createdAt": "2025-11-14T00:00:00.000Z",
    "actions": [{
      "id": "action-1",
      "verb": "create",
      "actor": {"id": "user:123", "type": "user"},
      "resource": {"system": "crm", "kind": "activities"},
      "metadata": {"tenant_id": "your-tenant-uuid"},
      "payload": {
        "type": "call",
        "subject": "Follow-up call",
        "body": "Discussed Q4 roadmap",
        "related_id": "contact-uuid-123"
      }
    }]
  }'
```

### Example 3: Search Wikipedia

```bash
curl -X POST http://localhost:8000/mcp/run \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "req-003",
    "actor": {"id": "agent:research", "type": "agent"},
    "createdAt": "2025-11-14T00:00:00.000Z",
    "actions": [{
      "id": "action-1",
      "verb": "search",
      "actor": {"id": "agent:research", "type": "agent"},
      "resource": {"system": "web", "kind": "wikipedia-search"},
      "payload": {"q": "artificial intelligence"}
    }]
  }'
```

### Example 4: Generate JSON with LLM

```bash
curl -X POST http://localhost:8000/mcp/run \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "req-004",
    "actor": {"id": "agent:analyzer", "type": "agent"},
    "createdAt": "2025-11-14T00:00:00.000Z",
    "actions": [{
      "id": "action-1",
      "verb": "run",
      "actor": {"id": "agent:analyzer", "type": "agent"},
      "resource": {"system": "llm", "kind": "generate-json"},
      "metadata": {"tenant_id": "your-tenant-uuid"},
      "payload": {
        "prompt": "Analyze this lead and suggest next steps",
        "context": "Lead: John Doe, Company: Acme Corp, Status: Interested",
        "schema": {
          "type": "object",
          "properties": {
            "priority": {"type": "string", "enum": ["high", "medium", "low"]},
            "next_steps": {"type": "array", "items": {"type": "string"}},
            "estimated_value": {"type": "number"}
          }
        }
      }
    }]
  }'
```

### Example 5: List GitHub Repos

```bash
curl -X POST http://localhost:8000/mcp/run \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "req-005",
    "actor": {"id": "agent:devtools", "type": "agent"},
    "createdAt": "2025-11-14T00:00:00.000Z",
    "actions": [{
      "id": "action-1",
      "verb": "search",
      "actor": {"id": "agent:devtools", "type": "agent"},
      "resource": {"system": "github", "kind": "repos"},
      "payload": {"per_page": 10}
    }]
  }'
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│      Aisha CRM Frontend (React)         │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │   AI Assistant Components          │ │
│  │   - Market Insights                │ │
│  │   - Lead Scoring                   │ │
│  │   - Activity Suggestions           │ │
│  └────────────────────────────────────┘ │
└───────────────┬─────────────────────────┘
                │ HTTP API calls
                ▼
┌─────────────────────────────────────────┐
│   Braid MCP Server (Port 8000)          │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │   Braid Executor & Registry        │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌─────┬──────┬─────────┬────┬───────┐ │
│  │ CRM │ Web  │ GitHub  │LLM │ Mock  │ │
│  │     │      │         │    │       │ │
│  └─────┴──────┴─────────┴────┴───────┘ │
└────┬──────────┬──────────┬──────────────┘
     │          │          │
     ▼          ▼          ▼
┌─────────┐  ┌────────┐  ┌──────────┐
│Supabase │  │Wikipedia│  │GitHub API│
│Database │  │   API   │  │OpenAI API│
└─────────┘  └────────┘  └──────────┘
```

## 🔐 Security Considerations

- **Service Role Key**: The Braid server uses `SUPABASE_SERVICE_ROLE_KEY` for direct database access, bypassing RLS. Ensure this key is kept secure and never exposed to clients.
- **API Key Management**: OpenAI keys are resolved from tenant settings when possible, preventing key exposure in frontend code.
- **Tenant Isolation**: All CRM operations require `tenant_id` in metadata/payload to ensure proper data isolation.
- **Rate Limiting**: Consider adding rate limiting middleware for production deployments.

## 🧪 Testing

### Quick Test

```bash
# Health check
curl http://localhost:8000/health

# Test CRM search
curl -X POST http://localhost:8000/mcp/run \
  -H "Content-Type: application/json" \
  -d @test-mcp.json
```

### Integration with Aisha CRM

The Braid server is designed to be called from:
1. **Frontend AI Components** - Market insights, lead scoring, activity suggestions
2. **Backend Cron Jobs** - Automated data enrichment and analysis
3. **Custom Agents** - External AI agents and workflows

## 📊 Monitoring

Check container logs:

```bash
docker logs braid-mcp-node-server --tail 50 -f
```

Health endpoint monitoring:

```bash
watch -n 5 'curl -s http://localhost:8000/health | jq'
```

## 🛠️ Development

### Adding a New Adapter

1. Create adapter file in `src/braid/adapters/your-adapter.ts`
2. Implement `BraidAdapter` interface with `handleAction` method
3. Register in `src/server.ts`:
   ```typescript
   import { YourAdapter } from "./braid/adapters/your-adapter";
   registry.registerAdapter(YourAdapter);
   ```

### Project Structure

```
braid-mcp-node-server/
├── src/
│   ├── server.ts          # Express server & MCP endpoint
│   ├── lib/
│   │   └── supabase.ts    # Supabase client & key resolution
│   └── braid/
│       ├── index.ts       # Braid exports
│       ├── types.ts       # TypeScript types
│       ├── registry.ts    # Adapter registry
│       ├── executor.ts    # Action executor
│       ├── policy.ts      # Authorization policies
│       └── adapters/
│           ├── crm.ts     # CRM adapter (Supabase)
│           ├── web.ts     # Wikipedia adapter
│           ├── github.ts  # GitHub API adapter
│           ├── llm.ts     # OpenAI adapter
│           └── mock.ts    # Mock adapter (testing)
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README-braid-mcp-node.md
```

## 🚢 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure all required environment variables
- [ ] Set up proper logging and monitoring
- [ ] Enable CORS restrictions if exposing externally
- [ ] Add authentication middleware
- [ ] Configure rate limiting
- [ ] Set up health check monitoring
- [ ] Review and restrict service role key usage

### Scaling

The Braid server is stateless and can be scaled horizontally:

```bash
docker compose -f braid-mcp-node-server/docker-compose.yml up -d --scale braid-mcp-node-server=3
```

Consider adding a load balancer for production deployments.

## 🤝 Integration with Aisha CRM

### From Frontend

```typescript
// src/api/braidClient.js
export async function executeBraidAction(action) {
  const response = await fetch('http://localhost:8000/mcp/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: `req-${Date.now()}`,
      actor: { id: 'user:current', type: 'user' },
      createdAt: new Date().toISOString(),
      actions: [action]
    })
  });
  return response.json();
}
```

### From Backend

```javascript
// backend/lib/braidClient.js
const fetch = require('node-fetch');

async function executeBraidEnvelope(envelope) {
  const response = await fetch('http://braid-mcp-node-server:8000/mcp/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope)
  });
  return response.json();
}
```

## 📝 License

MIT

## 👥 Authors

Dre' + Claude (Anthropic AI)

---

**For questions or issues, see the main Aisha CRM documentation or contact the development team.**
