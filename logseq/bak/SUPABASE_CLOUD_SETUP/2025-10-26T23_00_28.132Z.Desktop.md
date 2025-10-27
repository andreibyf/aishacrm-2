# Supabase Cloud Setup Guide

## Overview

This guide walks you through setting up **two separate Supabase Cloud databases**:
- **DEV/QA** - For development and testing (set up now)
- **Production** - For live data (set up when ready to launch)

## Step 1: Create Supabase DEV/QA Project

1. **Go to Supabase Dashboard**
   - Visit https://app.supabase.com
   - Sign in with your account

2. **Create New Project**
   - Click "New Project"
   - **Name**: `ai-sha-crm-dev` (or your preferred name)
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose closest to your location
   - **Pricing Plan**: Free tier is fine for DEV/QA
   - Click "Create new project"

3. **Wait for provisioning** (takes 1-2 minutes)

4. **Save Connection Details**
   From the project settings (Settings → Database):
   - **Host**: `db.[YOUR_PROJECT_REF].supabase.co`
   - **Database name**: `postgres`
   - **Port**: `5432`
   - **User**: `postgres`
   - **Password**: [Your database password]
   - **Connection String**: `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`

## Step 2: Configure Backend for Supabase Cloud

Create/update your `.env.local` file in the **backend/** directory:

```env
# Supabase DEV/QA Database Connection
NODE_ENV=development
PORT=3001

# Supabase Cloud DEV Connection
DB_HOST=db.[YOUR_PROJECT_REF].supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=[YOUR_DATABASE_PASSWORD]
DB_SSL=true

# Alternative: Use connection string
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require

# Supabase Project Details
SUPABASE_URL=https://[YOUR_PROJECT_REF].supabase.co
SUPABASE_ANON_KEY=[YOUR_ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[YOUR_SERVICE_KEY]
```

## Step 3: Update Backend Database Connection

The backend/server.js should detect Supabase Cloud automatically if you use DATABASE_URL.

Verify your `backend/server.js` has SSL configuration:

```javascript
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});
```

## Step 4: Apply Migrations to Supabase Cloud

You can apply migrations via:

### Option A: Supabase SQL Editor (Easiest)

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of each migration file in order:
   - `backend/migrations/001_init.sql`
   - `backend/migrations/007_crud_enhancements.sql`
   - `backend/migrations/003_create_apikey.sql` (if needed)
3. Click "Run" for each migration

### Option B: psql Command Line

```bash
# Using the connection string
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" < backend/migrations/001_init.sql
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" < backend/migrations/007_crud_enhancements.sql
```

### Option C: Node.js Migration Script

Run the existing migration script (update connection string first):
```bash
cd backend
node scripts/run_migrations.js
```

## Step 5: Enable Row Level Security (RLS)

For security in the cloud, enable RLS on all tables.

Run this SQL in Supabase SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulesettings ENABLE ROW LEVEL SECURITY;
ALTER TABLE apikey ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for backend service role access
-- These policies allow the backend (using service role key) full access

-- Accounts policies
CREATE POLICY "Backend full access to accounts" ON accounts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Contacts policies
CREATE POLICY "Backend full access to contacts" ON contacts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Leads policies
CREATE POLICY "Backend full access to leads" ON leads
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Opportunities policies
CREATE POLICY "Backend full access to opportunities" ON opportunities
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Activities policies
CREATE POLICY "Backend full access to activities" ON activities
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Employees policies
CREATE POLICY "Backend full access to employees" ON employees
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Notifications policies
CREATE POLICY "Backend full access to notifications" ON notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- System logs policies
CREATE POLICY "Backend full access to system_logs" ON system_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Module settings policies
CREATE POLICY "Backend full access to modulesettings" ON modulesettings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- API keys policies
CREATE POLICY "Backend full access to apikey" ON apikey
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

**Note**: These policies allow full access to the service role. In production, you'd want more restrictive policies based on tenant_id and user permissions.

## Step 6: Update Frontend Configuration

Update your frontend `.env.local`:

```env
# Use backend which connects to Supabase Cloud
VITE_AISHACRM_BACKEND_URL=http://localhost:3001

# Keep local-dev mode to use backend instead of Base44
VITE_USE_BASE44_AUTH=false

# Optional: Direct Supabase connection (for future features)
VITE_SUPABASE_URL=https://[YOUR_PROJECT_REF].supabase.co
VITE_SUPABASE_ANON_KEY=[YOUR_ANON_KEY]
```

## Step 7: Test the Setup

1. **Start the backend**:
   ```bash
   cd backend
   npm run dev
   ```

2. **Check for "Database: Connected"** in the startup logs

3. **Test CRUD operations**:
   ```bash
   # Create a contact
   curl -X POST http://localhost:3001/api/contacts \
     -H "Content-Type: application/json" \
     -d '{
       "tenant_id": "test-tenant",
       "first_name": "Test",
       "last_name": "User",
       "email": "test@example.com",
       "status": "active"
     }'

   # List contacts
   curl "http://localhost:3001/api/contacts?tenant_id=test-tenant"
   ```

4. **Run Unit Tests** in the app (Settings → Unit Tests)

5. **Verify in Supabase Dashboard**:
   - Go to Table Editor
   - Check that records are created

## Step 8: Future - Create Production Database

When ready for production:

1. Create new Supabase project: `ai-sha-crm-prod`
2. Apply same migrations
3. Set up more restrictive RLS policies
4. Use different connection string in production environment
5. Keep DEV/QA for testing, PROD for live data

## Environment Variables Summary

### Backend (.env.local or .env.development)
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[DEV_PROJECT_REF].supabase.co:5432/postgres?sslmode=require
DB_SSL=true
```

### Backend (.env.production) - For later
```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROD_PROJECT_REF].supabase.co:5432/postgres?sslmode=require
DB_SSL=true
```

### Frontend (.env.local)
```env
VITE_AISHACRM_BACKEND_URL=http://localhost:3001
VITE_USE_BASE44_AUTH=false
```

## Monitoring & Maintenance

### Check Database Health
- Supabase Dashboard → Database → Health
- Monitor query performance
- Check connection count

### Backup Strategy
- Supabase automatically backs up DEV database
- Consider periodic manual backups before major changes
- Use SQL exports for migration testing

### Cost Management
- DEV/QA: Free tier (500MB database, 2GB bandwidth)
- Monitor usage in Supabase Dashboard
- Upgrade to Pro ($25/mo) when needed

## Troubleshooting

### Connection Issues
```bash
# Test connection directly
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
```

### SSL Errors
Ensure `?sslmode=require` is in connection string

### RLS Blocking Access
Temporarily disable for debugging:
```sql
ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;
```

### View Logs
- Supabase Dashboard → Logs → Postgres Logs
- Backend console output

## Next Steps

✅ After setup:
1. Test all CRUD operations
2. Run full Unit Test suite
3. Verify data persistence
4. Monitor performance
5. Document any issues
6. Continue development with confidence!

🚀 When ready for production:
1. Create production Supabase project
2. Apply tested migrations
3. Set up restrictive RLS policies
4. Configure production environment variables
5. Deploy backend with production config
