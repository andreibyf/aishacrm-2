# Production Environment Configuration Checklist

## Critical Environment Variables

This document lists all environment variables required for production deployment. **All hardcoded localhost fallbacks have been removed** to ensure production safety.

### Backend (.env file location: `backend/.env`)

#### REQUIRED - Application Will Fail Without These

1. **FRONTEND_URL**
   - Purpose: Password reset emails, user invitations, OAuth redirects
   - Example: `https://app.aishacrm.com`
   - **CRITICAL**: If missing, password reset will throw an error in production
   - Development default: `http://localhost:4000`

2. **ALLOWED_ORIGINS**
   - Purpose: CORS middleware - controls which domains can access the API
   - Format: Comma-separated, no spaces
   - Example: `https://app.aishacrm.com,https://www.aishacrm.com`
   - **CRITICAL**: If missing in production, API will reject all requests
   - Development default: `http://localhost:4000,http://localhost:5173`

3. **JWT_SECRET**
   - Purpose: Signing and verifying authentication tokens
   - Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - **CRITICAL**: Use a strong random value, minimum 32 characters
   - Never reuse across environments

4. **SUPABASE_URL**
   - Purpose: Database and authentication
   - Example: `https://your-project.supabase.co`
   - Get from: Supabase project settings → API

5. **SUPABASE_ANON_KEY**
   - Purpose: Client-side authentication (safe to expose)
   - Get from: Supabase project settings → API → anon/public key

6. **SUPABASE_SERVICE_ROLE_KEY**
   - Purpose: Server-side database access (bypasses RLS)
   - **SECRET**: Never expose to frontend or commit to git
   - Get from: Supabase project settings → API → service_role key

7. **NODE_ENV**
   - Value: `production`
   - Purpose: Enables production safety guards and disables dev fallbacks

#### Recommended

- **PORT**: Server port (default: 3001, Docker: 3001)
- **USE_SUPABASE_PROD**: `true` (use HTTP API instead of direct PostgreSQL)
- **JWT_EXPIRES_IN**: Token expiration (default: 24h)
- **API_RATE_LIMIT_MAX_REQUESTS**: Rate limit (default: 100/minute)

### Frontend (.env file or runtime injection)

#### REQUIRED

1. **VITE_AISHACRM_BACKEND_URL**
   - Purpose: Backend API endpoint
   - Example: `https://api.aishacrm.com`
   - **CRITICAL**: If missing in production, all API calls will fail
   - Development default: `http://localhost:4001`
   - **Docker**: Injected at runtime by `frontend-entrypoint.sh` → `window._env_`

2. **VITE_SUPABASE_URL**
   - Same as backend SUPABASE_URL
   - Example: `https://your-project.supabase.co`

3. **VITE_SUPABASE_ANON_KEY** (or **VITE_SUPABASE_PUBLISHABLE_KEY**)
   - Same as backend SUPABASE_ANON_KEY
   - Frontend uses PUBLISHABLE_KEY variant if available

## Production Deployment Steps

### 1. Backend Configuration

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set:

```env
NODE_ENV=production
FRONTEND_URL=https://app.aishacrm.com
ALLOWED_ORIGINS=https://app.aishacrm.com
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<from supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from supabase dashboard - keep secret>
USE_SUPABASE_PROD=true
```

### 2. Frontend Configuration (Docker)

Frontend uses runtime injection via `frontend-entrypoint.sh`. Create or update `.env` in project root:

```env
VITE_AISHACRM_BACKEND_URL=https://api.aishacrm.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=<from supabase dashboard>
```

These are injected into `window._env_` at container startup.

### 3. Verify Configuration

**Backend startup checks:**
```bash
# Backend will log errors and exit if critical vars missing:
✅ ALLOWED_ORIGINS configured: https://app.aishacrm.com
✅ FRONTEND_URL configured: https://app.aishacrm.com
✅ JWT_SECRET configured (length: 128)

# Or will fail with:
❌ CRITICAL: ALLOWED_ORIGINS not set in production environment
   Set ALLOWED_ORIGINS in .env with your frontend URL(s)
```

**Frontend runtime check:**
Open browser console:
```javascript
// Check injected config
console.log(window._env_);
// Should show: { VITE_AISHACRM_BACKEND_URL: "https://...", ... }

// Test backend connection
import { getBackendUrl } from '@/api/backendUrl';
console.log(getBackendUrl());
// Should return production URL, NOT localhost
```

### 4. Test Critical Flows

1. **Password Reset**
   - Trigger password reset from login page
   - Check email for reset link
   - Verify link points to production domain (not localhost)

2. **User Invitation**
   - Invite a user from Settings → Users
   - Check invitation email
   - Verify link points to production domain

3. **CORS**
   - Open browser dev tools → Network tab
   - Trigger an API call
   - Verify no CORS errors
   - Check response headers: `Access-Control-Allow-Origin` should be your domain

## Docker Compose Configuration

### docker-compose.prod.yml

```yaml
version: '3.8'

services:
  backend:
    image: ghcr.io/andreibyf/aishacrm-backend:latest
    environment:
      - NODE_ENV=production
      - FRONTEND_URL=${FRONTEND_URL}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
      # ... other vars from backend/.env
    ports:
      - "4001:3001"

  frontend:
    image: ghcr.io/andreibyf/aishacrm-frontend:latest
    environment:
      - VITE_AISHACRM_BACKEND_URL=${VITE_AISHACRM_BACKEND_URL}
      - VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
      - VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_ANON_KEY}
    ports:
      - "4000:3000"
```

Load environment variables from `.env`:
```bash
docker-compose --env-file .env -f docker-compose.prod.yml up -d
```

## Cloudflare Tunnel Configuration

If using Cloudflare Tunnel (as in your VPS setup):

```yaml
# /etc/cloudflared/config.yml
tunnel: your-tunnel-id
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: app.aishacrm.com
    service: http://localhost:4000
    originRequest:
      noTLSVerify: true
  - hostname: app.aishacrm.com
    path: /api/*
    service: http://localhost:4001
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

**Important**: 
- Frontend: `app.aishacrm.com` → `localhost:4000`
- Backend API: `app.aishacrm.com/api/*` → `localhost:4001`
- This means backend and frontend share the same domain (no CORS issues)

Set environment variables accordingly:
```env
# Backend .env
FRONTEND_URL=https://app.aishacrm.com
ALLOWED_ORIGINS=https://app.aishacrm.com

# Frontend .env (injected at runtime)
VITE_AISHACRM_BACKEND_URL=https://app.aishacrm.com
```

## Troubleshooting

### "Failed to send reset email" Error

**Symptom**: Password reset fails with network error or "Failed to fetch"

**Causes**:
1. `FRONTEND_URL` not set in backend `.env`
2. `VITE_AISHACRM_BACKEND_URL` not set or not injected properly
3. CORS misconfiguration

**Fix**:
```bash
# Backend - check logs
docker logs aishacrm-backend | grep -E "FRONTEND_URL|ALLOWED_ORIGINS"

# Should see:
# ✅ FRONTEND_URL configured: https://app.aishacrm.com

# Frontend - check runtime config
docker exec aishacrm-frontend cat /usr/share/nginx/html/env-config.js

# Should contain:
# window._env_ = { VITE_AISHACRM_BACKEND_URL: "https://...", ... }
```

### CORS Errors in Browser Console

**Symptom**: `Access to fetch at 'https://...' from origin 'https://...' has been blocked by CORS policy`

**Fix**:
1. Verify `ALLOWED_ORIGINS` in backend `.env` includes your frontend domain
2. Restart backend: `docker-compose restart backend`
3. Check `docker logs aishacrm-backend` for CORS configuration on startup

### "VITE_AISHACRM_BACKEND_URL not configured" Error

**Symptom**: Frontend throws error on page load

**Fix**:
1. Check `.env` in project root has `VITE_AISHACRM_BACKEND_URL`
2. Verify `frontend-entrypoint.sh` is running (should inject `window._env_`)
3. Rebuild frontend: `docker-compose up -d --build frontend`

## Security Best Practices

1. **Never commit `.env` files** - add to `.gitignore`
2. **Rotate secrets regularly** - JWT_SECRET, Supabase service_role key
3. **Use different keys per environment** - dev, staging, production
4. **Audit ALLOWED_ORIGINS** - only include trusted domains
5. **Enable Row Level Security** in Supabase - see `backend/migrations/999_enable_rls_policies.sql`
6. **Monitor logs** for authentication failures and unusual activity

## Related Documentation

- [Backend README](backend/README.md) - Detailed backend configuration
- [Docker Deployment](DOCKER_DEPLOYMENT.md) - Docker-specific setup
- [Environment Variables Reference](ENV_FILE_REFERENCE.md) - Complete variable list
- [Supabase RLS Setup](backend/migrations/999_enable_rls_policies.sql) - Database security

---

**Last Updated**: 2025-11-22
**Version**: 1.0.47 (hardcoded localhost removal)
