# Aisha CRM Backend Server

Your own independent backend infrastructure - no more dependency on Base44!

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   - Ensure `backend/.env` exists and contains your database credentials and API keys.
   - When using Docker Compose, env vars are loaded from `backend/.env` (service env_file) and/or the compose `environment` block.

3. **Set up PostgreSQL database:**
   ```sql
   CREATE DATABASE aishacrm;
   ```

4. **Start the server:**
   ```bash
   # Production mode (manual restart required)
   npm start
   
   # Development mode (auto-restart on file changes)
   npm run dev
   ```

5. **Verify it's running (local dev):**
   ```bash
   curl http://localhost:3001/health
   ```

## 🔄 Development Mode

The backend supports **smart auto-restart** for faster development with safeguards:

```bash
npm run dev
```

This uses a custom wrapper (`dev-server.js`) that:
- ✅ Automatically restarts when `.js` files change
- ✅ **Limits to 10 restarts per minute** (prevents infinite crash loops)
- ✅ **2-second cooldown** between restarts (debounces rapid saves)
- ✅ **Auto-exits** if limit exceeded (forces you to fix the issue)

**Restart Policy:**
- **Safe Mode (default):** `npm run dev` - Max 10 restarts/min, 2s cooldown
- **Unlimited Mode:** `npm run dev:unlimited` - No limits (use with caution)

**Benefits:**
- ✅ Instant feedback - changes apply in ~2 seconds
- ✅ Prevents crash loops from going unnoticed
- ✅ Forces immediate attention to critical errors

## 📡 API Endpoints

The server exposes 197 functions across 26 categories:

- **System:** `/api/system/*` - Health checks, diagnostics
- **Reports:** `/api/reports/*` - Dashboard stats, exports
- **Validation:** `/api/validation/*` - Duplicate detection, data quality
- **Database:** `/api/database/*` - Sync, archive, cleanup
- **Accounts:** `/api/accounts/*` - Account management
- **Leads:** `/api/leads/*` - Lead operations
- **Contacts:** `/api/contacts/*` - Contact management
- ... and 19 more categories

### Key Endpoints

```bash
# Health check
GET /health

# Backend status
GET /api/status

# Dashboard statistics
GET /api/reports/dashboard-stats?tenant_id=YOUR_TENANT_ID

# Find duplicates
POST /api/validation/find-duplicates
{
  "entity": "Contact",
  "tenant_id": "your_tenant_id"
}

# Sync database from Base44
POST /api/database/sync
{
  "tenant_id": "your_tenant_id",
  "entities": ["Contact", "Account", "Lead"]
}
```

### AI Conversations (Chat) — Titles, Topics, Supabase Client

The AI chat endpoints under `/api/ai/*` now use the Supabase JavaScript client for database access (no raw `pgPool.query`), consistent with the rest of the backend. Conversations support user-friendly titles and topic categorization.

- Migration 037 adds `conversations.title` and `conversations.topic` with helpful indexes. Run the SQL in Supabase (see docs below).
- On the first user message in a conversation, the backend:
   - Auto-generates a title from the first ~50 chars of the message
   - Auto-classifies a topic from keywords (leads, accounts, opportunities, contacts, support, general)
   - Never overwrites a non-general, manually set topic
- Frontend sidebar shows titles, topic badges, topic filter, and inline rename.

See: `docs/AI_CONVERSATIONS.md` for migration SQL, endpoints, and testing steps.

### Multi-Provider LLM Engine

The backend supports multiple LLM providers with automatic failover via the `lib/aiEngine/` module:

**Supported Providers:**
- **OpenAI:** gpt-4o, gpt-4o-mini (default)
- **Anthropic:** claude-3-5-sonnet, claude-3-haiku
- **Groq:** llama-3.3-70b, llama-3.1-8b
- **Local:** Any OpenAI-compatible server

**Configuration:**
```bash
# Primary provider
LLM_PROVIDER=openai

# API keys (add keys for providers you want to use)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...

# Failover chain (optional)
LLM_FAILOVER_CHAIN=openai,anthropic,groq
```

**Key Functions:**
- `selectLLMConfigForTenant(capability, tenantId)` - Get provider+model for a task
- `callLLMWithFailover(options)` - Auto-failover across providers
- `resolveLLMApiKey(options)` - Cascading key resolution

See: `lib/aiEngine/README.md` for full documentation.

### LLM Activity Monitor

Real-time monitoring of all LLM calls with token usage tracking.

**API Endpoints:**
- `GET /api/system/llm-activity` - Get recent LLM calls (with filters)
- `GET /api/system/llm-activity/stats` - Aggregated stats (tokens, providers, durations)
- `DELETE /api/system/llm-activity` - Clear activity log

**Query Parameters for `/llm-activity`:**
- `limit` - Max entries (default: 100)
- `provider` - Filter by provider (openai, anthropic, groq)
- `capability` - Filter by capability (chat_tools, json_strict, etc.)
- `status` - Filter by status (success, error, failover)
- `since` - ISO timestamp for incremental fetches

**Stats Response:**
```json
{
  "totalEntries": 42,
  "last5Minutes": 12,
  "requestsPerMinute": 3,
  "avgDurationMs": 1500,
  "byProvider": { "openai": 10, "anthropic": 2 },
  "byStatus": { "success": 11, "error": 1 },
  "tokenUsage": {
    "last5Minutes": { "promptTokens": 5000, "completionTokens": 500, "totalTokens": 5500 },
    "allTime": { "totalTokens": 25000, "entriesInBuffer": 42 }
  }
}
```

**Frontend:** Settings → LLM Monitor tab (auto-refresh, filters, color-coded badges)

### Per-Tenant LLM Configuration

Override provider/model for specific tenants:

```bash
# Tenant "ACME_INC" uses Anthropic
LLM_PROVIDER__TENANT_ACME_INC=anthropic
MODEL_CHAT_TOOLS__TENANT_ACME_INC=claude-3-5-sonnet-20241022

# Tenant "FASTCO" uses Groq for speed
LLM_PROVIDER__TENANT_FASTCO=groq
MODEL_CHAT_TOOLS__TENANT_FASTCO=llama-3.3-70b-versatile
```

**Note:** If only provider is set (no model override), the system automatically selects appropriate models for that provider using `getProviderDefaultModel()`.

## 🔧 Configuration

### Database Setup

The backend uses PostgreSQL for data storage. Make sure to:

1. Create the database: `CREATE DATABASE aishacrm;`
2. Set `DATABASE_URL` in `.env`
3. Run initial sync: `POST /api/database/sync`

### Frontend Integration

Update your frontend `.env` to point to this backend:

```env
VITE_AISHACRM_BACKEND_URL=http://localhost:3001
```

Then use the fallback system in `src/api/fallbackFunctions.js` to automatically switch between Base44 and your backend.

## 📦 Project Structure

```
backend/
├── server.js          # Main Express server
├── routes/            # API route handlers
│   ├── system.js     # Health & diagnostics
│   ├── reports.js    # Dashboard & exports
│   ├── validation.js # Duplicates & quality
│   └── ... (23 more)
├── package.json
└── .env
```

## 🛠️ Development

Watch mode with auto-reload:
```bash
npm run dev
```

## 🔒 Security

- Helmet.js for security headers
- CORS configured for your frontend
- Rate limiting built-in
- API key validation for webhooks
- Environment variable protection

## 📊 Monitoring

View server metrics:
```bash
curl http://localhost:3001/api/system/metrics
```

Run diagnostics:
```bash
curl -X POST http://localhost:3001/api/system/diagnostics
```

## 🚨 Troubleshooting

**Database connection failed:**
- Check `DATABASE_URL` in `.env`
- Verify PostgreSQL is running
- Test connection: `POST /api/system/test-connection`

**Port already in use:**
- Change `PORT` in `.env`
- Or stop the other process on port 3001

**Base44 sync not working:**
- Update `BASE44_APP_ID` in `.env`
- Check Base44 is accessible

## 📝 Next Steps

1. Complete the route implementations in `/routes`
2. Add authentication middleware
3. Implement actual function logic from `../src/functions`
4. Set up production database
5. Deploy to your own server

## 🎯 Your Independence

This backend means:
- ✅ No downtime when Base44 goes down
- ✅ Own your data in your database
- ✅ Full control over all functions
- ✅ Can run on-premise or your own cloud
- ✅ No vendor lock-in

Welcome to true independence! 🎉
