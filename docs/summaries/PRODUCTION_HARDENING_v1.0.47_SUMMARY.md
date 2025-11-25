# v1.0.47 Production Hardening Summary

## Overview
This release removes all hardcoded localhost values from production code, ensuring deployments fail fast with clear error messages if environment variables are missing, rather than silently using localhost URLs that would break functionality.

## Critical Changes

### Backend Server (`backend/server.js`)
**BEFORE:**
```javascript
const defaultAllowed = [
  "http://localhost:5173",
  "https://localhost:5173",
  "http://localhost:4000",
  "https://localhost:4000",
];
const allowedOrigins = [...defaultAllowed, ...envAllowed];
```

**AFTER:**
```javascript
// In development, add localhost origins
const devDefaults = process.env.NODE_ENV === 'development' ? [
  "http://localhost:5173",
  "https://localhost:5173",
  "http://localhost:4000",
  "https://localhost:4000",
] : [];

const allowedOrigins = [...envAllowed, ...devDefaults];

// Fail loudly if no origins configured in production
if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  console.error('❌ CRITICAL: ALLOWED_ORIGINS not set in production environment');
  process.exit(1);
}
```

**Impact:** Backend will exit on startup in production if `ALLOWED_ORIGINS` not set.

### Password Reset & User Invites (`backend/lib/supabaseAuth.js`)
**BEFORE:**
```javascript
const resetRedirectUrl = redirectTo || `${
  process.env.FRONTEND_URL || "http://localhost:5173"
}/`;
```

**AFTER:**
```javascript
let resetRedirectUrl;
if (redirectTo) {
  resetRedirectUrl = redirectTo;
} else if (process.env.FRONTEND_URL) {
  resetRedirectUrl = `${process.env.FRONTEND_URL}/`;
} else if (process.env.NODE_ENV === 'development') {
  resetRedirectUrl = 'http://localhost:4000/';
  console.warn('⚠️  FRONTEND_URL not set, using dev default');
} else {
  throw new Error('FRONTEND_URL environment variable is required for password reset in production');
}
```

**Impact:** Password reset and user invitations will throw errors in production if `FRONTEND_URL` not set.

### Frontend Backend URL (`src/api/backendUrl.js`)
**BEFORE:**
```javascript
export function getBackendUrl() {
  if (typeof window !== "undefined" && window._env_?.VITE_AISHACRM_BACKEND_URL) {
    return window._env_.VITE_AISHACRM_BACKEND_URL;
  }
  return "http://localhost:3001";
}
```

**AFTER:**
```javascript
export function getBackendUrl() {
  // 1) Check runtime window._env_ (Docker production)
  if (typeof window !== "undefined" && window._env_?.VITE_AISHACRM_BACKEND_URL) {
    return window._env_.VITE_AISHACRM_BACKEND_URL;
  }
  // 2) Build-time env (Vite dev mode)
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_AISHACRM_BACKEND_URL) {
    return import.meta.env.VITE_AISHACRM_BACKEND_URL;
  }
  // 3) Development fallback only
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.warn('⚠️  VITE_AISHACRM_BACKEND_URL not set, using dev default');
    return 'http://localhost:4001';
  }
  // 4) Fail in production
  throw new Error('VITE_AISHACRM_BACKEND_URL not configured');
}
```

**Impact:** Frontend will throw errors if `VITE_AISHACRM_BACKEND_URL` not configured in production.

## Required Environment Variables

### Backend (`.env` in `backend/` directory)

**CRITICAL - Application will fail without these in production:**
1. `FRONTEND_URL` - Password reset emails, user invitations (e.g., `https://app.aishacrm.com`)
2. `ALLOWED_ORIGINS` - CORS configuration (e.g., `https://app.aishacrm.com`)
3. `NODE_ENV=production` - Enables production safety guards

**Already required:**
- `JWT_SECRET` - Token signing
- `SUPABASE_URL` - Database
- `SUPABASE_ANON_KEY` - Client auth
- `SUPABASE_SERVICE_ROLE_KEY` - Server auth

### Frontend (`.env` in project root, injected at runtime)

**CRITICAL:**
1. `VITE_AISHACRM_BACKEND_URL` - Backend API URL (e.g., `https://api.aishacrm.com`)
2. `VITE_SUPABASE_URL` - Supabase project URL
3. `VITE_SUPABASE_ANON_KEY` - Supabase public key

## Migration Guide

### For Existing Deployments

**VPS with Cloudflare Tunnel (current setup):**

1. **Check your `.env` files exist**
   ```bash
   ssh user@147.189.173.237
   cd /path/to/project
   ls -la .env backend/.env
   ```

2. **Backend `.env` MUST have:**
   ```env
   NODE_ENV=production
   FRONTEND_URL=https://app.aishacrm.com
   ALLOWED_ORIGINS=https://app.aishacrm.com
   ```

3. **Frontend `.env` (root) MUST have:**
   ```env
   VITE_AISHACRM_BACKEND_URL=https://app.aishacrm.com
   VITE_SUPABASE_URL=https://ehjlenywplgyiahgxkfj.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-key>
   ```

4. **Pull and restart:**
   ```bash
   docker-compose -f docker-compose.prod.yml pull
   docker-compose -f docker-compose.prod.yml up -d
   ```

5. **Verify startup:**
   ```bash
   docker logs aishacrm-backend | grep -E "FRONTEND_URL|ALLOWED_ORIGINS"
   # Should show: ✅ FRONTEND_URL configured: https://app.aishacrm.com
   
   docker exec aishacrm-frontend cat /usr/share/nginx/html/env-config.js
   # Should show: window._env_ = { VITE_AISHACRM_BACKEND_URL: "https://...", ... }
   ```

### Expected Startup Behavior

**Backend logs (SUCCESS):**
```
✅ ALLOWED_ORIGINS configured: https://app.aishacrm.com
✅ FRONTEND_URL configured: https://app.aishacrm.com
✅ JWT_SECRET configured (length: 128)
🚀 Backend server starting on port 3001...
```

**Backend logs (FAILURE - will exit):**
```
❌ CRITICAL: ALLOWED_ORIGINS not set in production environment
   Set ALLOWED_ORIGINS in .env with your frontend URL(s)
```

**Frontend runtime (SUCCESS):**
- Open browser console
- Check `window._env_`
- Should see production URLs, NOT localhost

**Frontend runtime (FAILURE):**
- JavaScript error: `VITE_AISHACRM_BACKEND_URL not configured`
- Check browser console and Docker logs

## Testing Checklist

### After Deploying v1.0.47

1. **Backend Startup**
   - [ ] Backend container starts successfully
   - [ ] No exit errors in `docker logs aishacrm-backend`
   - [ ] See ✅ messages for FRONTEND_URL and ALLOWED_ORIGINS

2. **Frontend Configuration**
   - [ ] Frontend serves successfully
   - [ ] `window._env_.VITE_AISHACRM_BACKEND_URL` contains production URL
   - [ ] No localhost references in browser console

3. **Password Reset**
   - [ ] Navigate to login page
   - [ ] Click "Forgot Password"
   - [ ] Enter email and submit
   - [ ] Check email inbox
   - [ ] Verify reset link points to production domain (not localhost)
   - [ ] Click link and verify it works

4. **User Invitation**
   - [ ] Log in as admin
   - [ ] Go to Settings → Users
   - [ ] Invite a new user
   - [ ] Check invitation email
   - [ ] Verify link points to production domain
   - [ ] Click link and verify it works

5. **CORS**
   - [ ] Open browser dev tools → Network tab
   - [ ] Navigate around the app
   - [ ] Check for CORS errors (should be none)
   - [ ] Verify API responses include correct `Access-Control-Allow-Origin`

## Rollback Plan

If v1.0.47 causes issues:

```bash
# Pull previous version
docker-compose -f docker-compose.prod.yml pull ghcr.io/andreibyf/aishacrm-backend:v1.0.46
docker-compose -f docker-compose.prod.yml pull ghcr.io/andreibyf/aishacrm-frontend:v1.0.46

# Or edit docker-compose.prod.yml to pin version:
services:
  backend:
    image: ghcr.io/andreibyf/aishacrm-backend:v1.0.46
  frontend:
    image: ghcr.io/andreibyf/aishacrm-frontend:v1.0.46

# Restart
docker-compose -f docker-compose.prod.yml up -d
```

## Files Changed

- `backend/server.js` - CORS production safety
- `backend/lib/supabaseAuth.js` - Password reset & invites
- `src/api/backendUrl.js` - Frontend URL resolution
- `src/pages/Layout.jsx` - Import getBackendUrl helper
- `backend/.env.example` - Document FRONTEND_URL requirement
- `.env.example` - Emphasize VITE_AISHACRM_BACKEND_URL
- `PRODUCTION_ENV_CHECKLIST.md` - Complete production guide (NEW)
- `package.json` - Version bump to 1.0.47
- `backend/package.json` - Version bump to 1.0.47

## Documentation

- **[PRODUCTION_ENV_CHECKLIST.md](./PRODUCTION_ENV_CHECKLIST.md)** - Complete production configuration guide
- **[backend/.env.example](./backend/.env.example)** - Backend environment variables with detailed comments
- **[.env.example](./.env.example)** - Frontend environment variables

## GitHub Actions

Build is in progress for v1.0.47:
- https://github.com/andreibyf/aishacrm-2/actions

Once complete, Docker images will be available:
- `ghcr.io/andreibyf/aishacrm-backend:latest`
- `ghcr.io/andreibyf/aishacrm-backend:v1.0.47`
- `ghcr.io/andreibyf/aishacrm-frontend:latest`
- `ghcr.io/andreibyf/aishacrm-frontend:v1.0.47`

## Why This Change Was Made

**Original Issue:** Password reset was failing with "Failed to send reset email: Failed to fetch"

**Root Cause Discovery:** During debugging, we found the codebase had hardcoded localhost URLs throughout:
- Backend CORS allowed localhost origins in production
- Password reset emails contained localhost URLs if `FRONTEND_URL` not set
- Frontend had localhost fallbacks masking missing configuration

**User Feedback:** "you are pushing dev parameters into production. ensure you conduct and audit before you push"

**Solution:** Remove all hardcoded localhost fallbacks and fail loudly in production if required environment variables are missing. This prevents silent failures and ensures proper configuration.

---

**Commit:** 9d58f74
**Tag:** v1.0.47
**Date:** 2025-11-22
