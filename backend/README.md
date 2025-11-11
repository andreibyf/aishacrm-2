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

## 🧪 Braid Language Endpoints

The backend includes **Braid modules** - custom functions written in the Braid language that are automatically transpiled to JavaScript and exposed as REST endpoints.

### Testing Braid Endpoints

All Braid CRM endpoints are under `/api/braid/crm/...`:

**GET Requests (Query Parameters):**
```powershell
# Simple GET - no params
curl "http://localhost:4001/api/braid/crm/pipeline_stages"

# GET with query params
curl "http://localhost:4001/api/braid/crm/stage_name?stage=3"
curl "http://localhost:4001/api/braid/crm/stage_count"
```

**POST Requests (JSON Body) - PowerShell Pattern:**
```powershell
# Create a JSON file (avoids PowerShell escaping issues)
@'
{"company_size":100,"budget":50000,"urgency":8}
'@ | Out-File -Encoding utf8 test.json

# Use --data-binary to send file
curl -X POST http://localhost:4001/api/braid/crm/score_lead -H "Content-Type: application/json" --data-binary "@test.json"
```

**Example CRM Endpoints:**
```powershell
# Lead scoring
@'
{"company_size":100,"budget":50000,"urgency":8}
'@ | Out-File -Encoding utf8 test.json
curl -X POST http://localhost:4001/api/braid/crm/score_lead --data-binary "@test.json"

# Lead quality classification
@'
{"score":75}
'@ | Out-File -Encoding utf8 test.json
curl -X POST http://localhost:4001/api/braid/crm/lead_quality --data-binary "@test.json"

# Commission calculation
@'
{"deal_value":10000,"rate":5}
'@ | Out-File -Encoding utf8 test.json
curl -X POST http://localhost:4001/api/braid/crm/calculate_commission --data-binary "@test.json"

# Contact formatting
@'
{"first_name":"John","last_name":"Doe","title":"CEO"}
'@ | Out-File -Encoding utf8 test.json
curl -X POST http://localhost:4001/api/braid/crm/format_contact --data-binary "@test.json"

# Composite operation (calls multiple functions)
@'
{"company_size":100,"budget":50000,"urgency":8}
'@ | Out-File -Encoding utf8 test.json
curl -X POST http://localhost:4001/api/braid/crm/evaluate_lead --data-binary "@test.json"
```

**Available CRM Modules:**
- Lead Scoring: `score_lead`, `lead_quality`
- Deal Pipeline: `deal_probability`, `weighted_value`
- Contact Management: `format_contact`, `create_contact`
- Revenue: `calculate_mrr`, `calculate_commission`
- Activity Tracking: `activity_score`, `follow_up_priority`
- Territory: `assign_territory`, `territory_quota`
- Forecasting: `stage_name`, `avg_deal_size`
- Validation: `validate_email`, `validate_deal`
- Arrays: `pipeline_stages`, `stage_at_index`, `stage_count`
- Composite: `evaluate_lead`, `total_pipeline`

**Response Format:**
All Braid endpoints return JSON with a `result` field:
```json
{"result": "Warm"}
{"result": 258}
{"result": ["Prospecting","Qualification","Proposal"]}
```

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
