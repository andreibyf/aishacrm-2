# Railway Environment Variable Setup Guide

This document lists all required environment variables for deploying Aisha CRM to Railway.

## 🚀 Overview

Your Railway project should have **two services**:
1. **Frontend Service** (serves the React app via `serve`)
2. **Backend Service** (Express API server)

Each service needs its own set of environment variables configured in the Railway dashboard.

---

## 📦 Frontend Service Environment Variables

Navigate to your **frontend service** in Railway → Settings → Variables and add:

### Required Variables

```bash
# Backend API URL - MUST be the HTTPS domain of your backend service
VITE_AISHACRM_BACKEND_URL=https://YOUR-BACKEND-SERVICE.up.railway.app

# Supabase Configuration (for frontend auth)
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here

# Node Environment
NODE_ENV=production
```

### Optional Variables

```bash
# Base44 SDK fallback (if you still use it for some features)
VITE_BASE44_API_KEY=your-base44-api-key
```

### How to Get These Values

- **VITE_AISHACRM_BACKEND_URL**: 
  - Deploy your backend service first on Railway
  - Copy the domain from Railway dashboard (looks like `https://xyz-staging.up.railway.app`)
  - Paste here

- **VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY**:
  - Go to your Supabase project dashboard
  - Settings → API
  - Copy the URL and anon/public key

---

## 🔧 Backend Service Environment Variables

Navigate to your **backend service** in Railway → Settings → Variables and add:

### Database Configuration (Choose ONE method)

#### Option 1: Supabase Cloud (Recommended for Staging/Prod)

You can use either of these Supabase URLs — both are supported:

1) Pooled (recommended for serverless, uses PgBouncer, port 6543)
```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

2) Direct (standard Postgres, port 5432)
```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

Notes:
- SSL is auto-enabled for both `.supabase.co` and `.supabase.com` hosts by the backend.
- Pooled connections are preferred on platforms like Railway to avoid connection limits.

**How to get these:**
1. Supabase Dashboard → Settings → Database
2. For pooled: copy the Connection Pooling (Transaction) URL
3. For direct: copy the standard connection string
4. Insert your database password

#### Option 2: Discrete Supabase Connection Variables (Alternative)

```bash
USE_SUPABASE_PROD=true
SUPABASE_DB_HOST=db.YOUR-PROJECT-REF.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your-database-password
```

### Supabase Auth Configuration (REQUIRED)

```bash
# Supabase Auth for user management
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# JWT Secret for token validation
JWT_SECRET=your-jwt-secret-from-supabase
```

**How to get these:**
1. Supabase Dashboard → Settings → API
2. Copy:
   - Project URL → `SUPABASE_URL`
   - anon/public key → `SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`
   - JWT Secret → `JWT_SECRET`

### CORS Configuration

```bash
# Allowed frontend origins (comma-separated)
# The code defaults to localhost + staging, but you can override:
ALLOWED_ORIGINS=https://aishacrm-2-staging.up.railway.app,http://localhost:5173

# Optional: Disable Railway wildcard matching
# ALLOW_RAILWAY_ORIGINS=false
```

### Optional Backend Variables

```bash
# Node environment
NODE_ENV=production

# Server port (Railway sets this automatically, don't override unless needed)
# PORT=3001

# Frontend URL for password reset emails
FRONTEND_URL=https://aishacrm-2-staging.up.railway.app

# Supabase Storage (for file uploads)
SUPABASE_STORAGE_BUCKET=tenant-assets
```

---

## ✅ Verification Steps

After setting all environment variables:

### 1. Check Backend Health
```bash
curl https://YOUR-BACKEND-SERVICE.up.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-02T...",
  "uptime": 123.456,
  "environment": "production",
  "database": "connected"
}
```

If you see `"database": "not configured"`, your DATABASE_URL or Supabase variables are missing/incorrect.

### 2. Check Frontend Loads
Visit: `https://YOUR-FRONTEND-SERVICE.up.railway.app`

Open DevTools → Network tab:
- Should see HTTPS requests to your backend
- No CORS errors
- No mixed content warnings

### 3. Check CORS
In browser DevTools Console, run:
```javascript
fetch('https://YOUR-BACKEND-SERVICE.up.railway.app/api/status')
  .then(r => r.json())
  .then(console.log)
```

Should return without CORS errors.

---

## 🐛 Common Issues & Fixes

### Issue: "database": "not configured"
**Fix:** Set `DATABASE_URL` in backend service variables. Copy from Supabase → Database → Connection Pooling.

### Issue: Backend 500 errors for /api/employees, /api/notifications
**Cause:** Database not connected or RLS policies blocking access.

**Fix:** 
1. Verify `DATABASE_URL` is set correctly
2. Check Supabase logs for connection errors
3. Verify your database user has proper permissions
4. Check RLS policies are not too restrictive

### Issue: Backend 401 errors (Authentication required)
**Cause:** Supabase auth not configured.

**Fix:** Set all Supabase auth variables in backend:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`

### Issue: CORS errors from frontend
**Cause:** Backend CORS not allowing your frontend origin.

**Fix:** 
1. Set `ALLOWED_ORIGINS` in backend to include your frontend domain
2. Or rely on the default (staging + Railway wildcards are auto-allowed)

### Issue: Mixed Content warnings
**Cause:** Frontend env variable pointing to HTTP instead of HTTPS.

**Fix:** Ensure `VITE_AISHACRM_BACKEND_URL` starts with `https://`

---

## 📋 Quick Checklist

Before deploying, verify you have:

**Frontend:**
- [ ] `VITE_AISHACRM_BACKEND_URL` (HTTPS backend domain)
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `NODE_ENV=production`

**Backend:**
- [ ] `DATABASE_URL` (Supabase connection string with SSL)
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `JWT_SECRET`
- [ ] `ALLOWED_ORIGINS` (optional, has smart defaults)
- [ ] `NODE_ENV=production`

**Both services deployed and showing green status in Railway dashboard**

---

## 🔗 Related Documentation

- [Supabase Database Connection](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Auth Setup](https://supabase.com/docs/guides/auth)
- [Railway Environment Variables](https://docs.railway.app/develop/variables)

---

## 💡 Tips

1. **Use Supabase Connection Pooling** for better performance in serverless environments (Railway).
2. **Never commit `.env` files** - always use Railway's environment variable UI.
3. **Test locally first** - Run backend with production-like env vars before deploying.
4. **Monitor Railway logs** - Check the deployment logs for startup errors.
5. **Check Supabase logs** - Auth and database errors appear in Supabase dashboard logs.

---

Last updated: 2025-11-02
