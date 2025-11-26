# Authentication Fixes Summary

**Date:** 2025-01-XX  
**Commit:** 0d6e937  
**Branch:** main

## Changes Made

### 1. ✅ Added "Forgot Password" to Login Form

**File:** `src/pages/Layout.jsx`

- Added "Forgot Password?" button after password field (line ~2188)
- Button validates email is entered before proceeding
- Calls `supabase.auth.resetPasswordForEmail()` with redirect to production URL
- Shows user-friendly success/error messages
- Links to existing `ResetPassword.jsx` component

**User Experience:**
1. User enters email address
2. Clicks "Forgot Password?" link
3. Receives reset email at their inbox
4. Email contains link to `/reset-password?token_hash=...`
5. User sets new password via ResetPassword.jsx form
6. Redirected to login page to sign in with new password

---

### 2. ✅ Disabled Dev Auto-Login in Production

**File:** `src/components/shared/tenantContext.jsx`

- Added `import.meta.env.PROD` environment check (line ~271)
- Auto-tenant selection now ONLY runs in development mode
- Production builds will NOT redirect to `?tenant=local-tenant-001`
- Prevents "Dev sign in" issue reported by user

**Before:**
```javascript
// Auto-selected tenant for ALL non-superadmin users
if (role && role !== 'superadmin' && user.tenant_id) {
  setSelectedTenantIdState(user.tenant_id);
  updateUrlTenantParam(user.tenant_id); // Caused auto-redirect
}
```

**After:**
```javascript
// Skip auto-selection in production
if (import.meta.env.PROD) {
  return; // ← NEW: Blocks auto-login in production
}

// Dev-only auto-selection for convenience
if (role && role !== 'superadmin' && user.tenant_id) {
  logTenantEvent('INFO', '[DEV ONLY] Auto-selecting tenant...');
  setSelectedTenantIdState(user.tenant_id);
  updateUrlTenantParam(user.tenant_id);
}
```

---

### 3. ✅ Created Admin User Setup Script

**File:** `backend/scripts/create-admin.js`

Complete admin user creation script with:
- Reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from environment
- Uses Supabase Admin API (service_role key)
- Creates auth user with `email_confirm: true` (skips verification)
- Sets user_metadata with `tenant_id` and `role: 'superadmin'`
- Creates corresponding record in `users` table
- Handles existing user updates (password reset)
- Comprehensive error handling and validation
- User-friendly console output with status messages

**Environment Variables Required:**
```bash
ADMIN_EMAIL=admin@aishacrm.com
ADMIN_PASSWORD=YourSecurePassword123!
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Usage (Docker):**
```bash
docker exec -it aishacrm-backend node /app/scripts/create-admin.js
```

**Usage (Local):**
```bash
cd backend && node scripts/create-admin.js
```

---

### 4. ✅ Comprehensive Setup Documentation

**File:** `PRODUCTION_AUTH_SETUP.md`

Complete production authentication guide covering:

**Section 1-3:** Frontend changes, admin setup, environment config  
**Section 4:** Supabase Site URL configuration via CLI  
**Section 5:** Frontend rebuild instructions for production URLs  
**Section 6:** Complete auth flow testing checklist  
**Section 7:** Email template customization  
**Section 8:** Security best practices  
**Section 9:** Troubleshooting guide  
**Section 10:** Quick reference (commands, files, URLs)

---

## Next Steps for Deployment

### On VPS (/opt/aishacrm)

1. **Pull Latest Code**
   ```bash
   cd /opt/aishacrm
   # If you have a git repo on VPS:
   git pull origin main
   
   # OR manually update files:
   # - src/pages/Layout.jsx (with forgot password)
   # - src/components/shared/tenantContext.jsx (with prod check)
   # - backend/scripts/create-admin.js (new file)
   ```

2. **Add Admin Credentials to .env**
   ```bash
   nano .env
   # Add these lines:
   ADMIN_EMAIL=admin@aishacrm.com
   ADMIN_PASSWORD=YourSecurePassword123!
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```

3. **Rebuild Frontend with Production Env**
   ```bash
   # Ensure .env has production URLs
   # VITE_AISHACRM_BACKEND_URL=https://app.aishacrm.com/api
   
   # Build new image
   docker-compose build frontend
   docker-compose up -d frontend
   ```

4. **Restart Backend to Load New Env Vars**
   ```bash
   docker-compose restart backend
   ```

5. **Create Admin User**
   ```bash
   docker exec -it aishacrm-backend node /app/scripts/create-admin.js
   ```

6. **Update Supabase Site URL**
   ```bash
   # Via Supabase CLI:
   npm install -g supabase
   supabase link --project-ref ehjlenywplgyiahgxkfj
   
   # Edit supabase/config.toml:
   # [auth]
   # site_url = "https://app.aishacrm.com"
   
   supabase db push
   
   # OR via Supabase Dashboard:
   # Authentication → URL Configuration
   # Site URL: https://app.aishacrm.com
   # Redirect URLs: https://app.aishacrm.com/**
   ```

7. **Test Auth Flow**
   - Go to https://app.aishacrm.com
   - Verify NO auto-redirect to `?tenant=local-tenant-001`
   - Sign in with admin@aishacrm.com and password
   - Test "Forgot Password?" flow
   - Test logout and re-login

---

## Breaking Changes

**None.** All changes are backward compatible:
- Dev mode still has auto-tenant selection
- Existing login flow unchanged (just added forgot password)
- New admin script is optional (users can still be created via Supabase Dashboard)

---

## Files Changed

```
modified:   src/pages/Layout.jsx
  + Added "Forgot Password?" button to login form
  + Calls supabase.auth.resetPasswordForEmail()
  
modified:   src/components/shared/tenantContext.jsx
  + Added production environment check
  + Prevents dev auto-tenant selection in prod
  
new file:   backend/scripts/create-admin.js
  + Complete admin user creation script
  + Uses Supabase Admin API
  
new file:   PRODUCTION_AUTH_SETUP.md
  + Comprehensive setup and troubleshooting guide
  + Step-by-step instructions
  
new file:   AUTHENTICATION_FIXES_SUMMARY.md (this file)
```

---

## Testing Checklist

Before deploying to production:

- [ ] Frontend rebuilt with `VITE_AISHACRM_BACKEND_URL=https://app.aishacrm.com/api`
- [ ] Backend .env has ADMIN_EMAIL, ADMIN_PASSWORD, SUPABASE_SERVICE_ROLE_KEY
- [ ] Admin user created via `create-admin.js` script
- [ ] Supabase Site URL updated to `https://app.aishacrm.com`
- [ ] Supabase redirect URLs include `/reset-password` endpoint
- [ ] Login page shows "Forgot Password?" button
- [ ] No auto-redirect to `?tenant=local-tenant-001` occurs
- [ ] Password reset email received with correct production URL
- [ ] Can sign in with admin credentials
- [ ] Can switch tenants (superadmin only)
- [ ] Logout works correctly

---

## Support

For issues or questions:
1. Check `PRODUCTION_AUTH_SETUP.md` for detailed troubleshooting
2. Review Supabase Dashboard → Authentication → Users
3. Check Docker logs: `docker logs aishacrm-backend -f`
4. Verify environment variables: `docker exec -it aishacrm-backend env | grep ADMIN`

---

**Commit:** `feat: Add production authentication setup`  
**Author:** GitHub Copilot  
**Status:** ✅ Committed and Pushed to main
