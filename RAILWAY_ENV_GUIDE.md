# Railway Environment Variables Guide

## Backend Service - Required Environment Variables

Copy these to Railway Dashboard → Backend Service → Variables:

```bash
# Database (Supabase)
DATABASE_URL=postgresql://postgres.[YOUR-PROJECT]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://[YOUR-PROJECT].supabase.co
SUPABASE_ANON_KEY=your-anon-key-from-supabase
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-from-supabase

# Supabase Production Settings
USE_SUPABASE_PROD=true
SUPABASE_DB_HOST=[YOUR-PROJECT].supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your-database-password

# App Settings
NODE_ENV=production
PORT=3001
JWT_SECRET=your-secure-random-string-here-min-32-chars

# Base44 (optional fallback)
BASE44_API_KEY=your-base44-key-if-used
VITE_BASE44_ACCOUNT_ID=your-base44-account-id

# Email (if using)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
```

## Frontend Service - Required Environment Variables

Copy these to Railway Dashboard → Frontend Service → Variables:

```bash
# Backend API URL (will be your Railway backend URL)
VITE_AISHACRM_BACKEND_URL=https://your-backend-service.up.railway.app

# Supabase (frontend needs these for direct auth)
VITE_SUPABASE_URL=https://[YOUR-PROJECT].supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-from-supabase

# Optional
VITE_BASE44_ACCOUNT_ID=your-base44-account-id
```

## How to Set Variables in Railway:

1. Go to https://railway.app/dashboard
2. Select your project
3. Click on the service (Backend or Frontend)
4. Go to "Variables" tab
5. Click "New Variable"
6. Paste each variable name and value
7. Railway will auto-redeploy when you save

## Getting Your Values:

### Supabase:
1. Go to https://supabase.com/dashboard
2. Select your project
3. Settings → Database → Connection String (use "Transaction" pooler)
4. Settings → API → Project URL and anon/service_role keys

### JWT_SECRET:
Generate a secure random string:
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

### Backend URL:
After deploying backend, Railway will give you a URL like:
`https://aishacrm-backend-production-xxxx.up.railway.app`

Copy this URL and use it as VITE_AISHACRM_BACKEND_URL in frontend variables.
