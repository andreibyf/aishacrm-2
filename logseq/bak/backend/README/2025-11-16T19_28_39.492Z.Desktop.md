# Aisha CRM Backend Server

Your own independent backend infrastructure - no more dependency on Base44!

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and API keys
   ```

3. **Set up PostgreSQL database:**
   ```sql
   CREATE DATABASE aishacrm;
   ```

4. **Start the server:**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

5. **Verify it's running:**
   ```bash
   curl http://localhost:3001/health
   ```

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
