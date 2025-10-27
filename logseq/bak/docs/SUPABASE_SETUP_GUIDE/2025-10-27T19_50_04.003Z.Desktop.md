# Supabase Production Database Setup Guide

## Overview
Setting up production Supabase database while still in development phase.
This allows us to test against real production infrastructure before going live.

## Prerequisites
1. Supabase project created at https://supabase.com
2. Project URL and API keys from Supabase dashboard
3. Database password from project settings

## Step 1: Get Supabase Connection Details

From your Supabase Dashboard (https://supabase.com/dashboard):

1. **Project Settings** → **Database**
   - Host: `db.xxx.supabase.co`
   - Database name: `postgres`
   - Port: `5432`
   - User: `postgres`
   - Password: (your database password)

2. **Project Settings** → **API**
   - Project URL: `https://xxx.supabase.co`
   - `anon` public key
   - `service_role` secret key (DO NOT expose to frontend!)

## Step 2: Update Environment Variables

Create/Update `.env` in backend directory:

```bash
# Supabase Production Database
SUPABASE_DB_HOST=db.xxx.supabase.co
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your_database_password
SUPABASE_DB_PORT=5432

# For backend API calls
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key

# Mode switch
USE_SUPABASE_PROD=true  # Set to false to use local Docker
```

## Step 3: Apply Database Schema to Supabase

### Option A: Via Supabase Dashboard (Recommended)

1. Go to **SQL Editor** in Supabase Dashboard
2. Run the migration scripts in order:
   - `001_init.sql`
   - `002_add_created_date.sql` (if needed)
   - `003_create_apikey.sql`
   - `007_crud_enhancements.sql`

### Option B: Via Command Line

```bash
# Using psql
psql "postgresql://postgres:YOUR_PASSWORD@db.xxx.supabase.co:5432/postgres" < backend/migrations/001_init.sql
psql "postgresql://postgres:YOUR_PASSWORD@db.xxx.supabase.co:5432/postgres" < backend/migrations/007_crud_enhancements.sql
```

## Step 4: Enable Row Level Security (RLS)

Run this in Supabase SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulesettings ENABLE ROW LEVEL SECURITY;
ALTER TABLE apikey ENABLE ROW LEVEL SECURITY;

-- Create policies for service role (backend access)
-- Service role bypasses RLS by default, but we can add explicit policies for clarity

-- Policy: Allow backend service role to access all tenant data
CREATE POLICY "Service role has full access" ON contacts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access" ON leads
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access" ON accounts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access" ON opportunities
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access" ON activities
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access" ON employees
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access" ON notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access" ON system_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access" ON modulesettings
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access" ON apikey
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Note: If you want to add user-level RLS later (for direct Supabase client access),
-- you would add policies based on auth.uid() and tenant_id matching
```

## Step 5: Update Backend Connection

The backend `server.js` will need to be updated to use Supabase connection when configured.

See `SUPABASE_BACKEND_CONFIG.md` for implementation details.

## Step 6: Test Connection

```bash
# Test from backend directory
cd backend
npm run dev

# You should see:
# "✓ PostgreSQL connection pool initialized"
# "Database: Connected (Supabase Production)"
```

## Step 7: Verify CRUD Operations

1. Start backend: `cd backend && npm run dev`
2. Test API:
```bash
# Create contact
curl -X POST http://localhost:3001/api/contacts \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"test-tenant","first_name":"John","last_name":"Doe","email":"john@test.com"}'

# List contacts
curl "http://localhost:3001/api/contacts?tenant_id=test-tenant"
```

## Security Considerations

### ✅ Safe for Production Database in Dev Mode:
- Backend uses `service_role` key (server-side only)
- All tenant isolation handled by backend
- RLS enabled as additional security layer
- No sensitive data during testing phase

### ⚠️ Before Going Live:
1. Review all RLS policies
2. Add user-level authentication policies if using Supabase Auth
3. Rotate API keys if they were exposed
4. Review audit logs in Supabase dashboard
5. Set up database backups
6. Configure monitoring and alerts

## Rollback to Local Docker

If you need to switch back to local Docker:

```bash
# In backend/.env
USE_SUPABASE_PROD=false
```

Backend will automatically use local Docker PostgreSQL (localhost:5432).

## Monitoring

- **Supabase Dashboard**: Check Database → Performance, Logs
- **Backend Logs**: All queries logged with execution time
- **Error Tracking**: Backend error logs show DB issues

## Next Steps

1. Apply schema to Supabase
2. Enable RLS policies
3. Update backend connection config
4. Test CRUD operations
5. Run full test suite
6. Monitor performance and errors
7. Document any production-specific configurations

## Troubleshooting

**Connection Issues:**
- Verify IP allowlist in Supabase (Settings → Database → Connection Pooling)
- Check database password is correct
- Ensure SSL mode is enabled

**RLS Blocking Queries:**
- Make sure backend uses `service_role` key (bypasses RLS)
- Check policies are created with `USING (true)`

**Performance:**
- Supabase has connection pooling by default
- Use connection pool URL for better performance
- Monitor query performance in dashboard
