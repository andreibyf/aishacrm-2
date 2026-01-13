# 401 Error Fix Summary

## Issue
Production API returns `401 Unauthorized` for `/api/ai/conversations` endpoint.

Error message from issue:
```
api.aishacrm.com/api/ai/conversations: 1 Failed to load resource: the server responded with a status of 401 ()
```

## Root Cause

The error message reveals the problem: **Frontend is calling `api.aishacrm.com`** instead of the recommended `app.aishacrm.com/api`.

### Why This Causes 401 Errors

1. **Cookie Domain Mismatch**:
   - Authentication cookies are set for `app.aishacrm.com`
   - Frontend is calling `api.aishacrm.com`
   - Browser won't send cookies from `app.X` to `api.X` with `sameSite: 'lax'`

2. **No Authentication Context**:
   - Backend receives request without `aisha_access` cookie
   - `authenticateRequest` middleware can't populate `req.user`
   - `validateUserTenantAccess` function returns 401 (production requires auth)

## Solution

### Immediate Fix (Option A - RECOMMENDED)

Update the production environment variable to use the same domain:

```bash
# In production .env or environment configuration:
VITE_AISHACRM_BACKEND_URL=https://app.aishacrm.com/api
```

**After changing:**
1. Restart the backend service
2. Clear browser cookies
3. Log in again
4. Test the endpoint

**Why this works:**
- Frontend and backend on same domain → cookies sent automatically
- No CORS complications
- Matches `.env.production.recommended` configuration
- No additional environment variables needed

### Alternative Fix (Option B - Cross-Subdomain)

If infrastructure requires `api.aishacrm.com`, add cookie domain configuration:

```bash
# Add to production .env:
COOKIE_DOMAIN=.aishacrm.com  # Note the leading dot!
```

**After changing:**
1. Restart the backend service (cookies need to be reissued with new domain)
2. Clear browser cookies (old cookies won't have the domain attribute)
3. Log in again (get new cookies with `.aishacrm.com` domain)
4. Test the endpoint

**Why this works:**
- Cookies with domain `.aishacrm.com` are sent to all `*.aishacrm.com` subdomains
- Browser will send `aisha_access` cookie from `app.X` to `api.X`
- Authentication context is established

## Code Changes Made

### 1. Enhanced Diagnostics (`backend/routes/ai.js`)

Added detailed logging when authentication fails in production:

```javascript
logger.warn('[AI Security] Authentication required but no user context found', {
  path: req.path,
  origin: req.headers.origin,
  hasCookie: !!req.cookies?.aisha_access,
  hasAuthHeader: !!req.headers.authorization,
  cookieDomain: process.env.COOKIE_DOMAIN || '(not set - cookies may not work across subdomains)',
  hint: 'If using separate subdomains (api.X vs app.X), set COOKIE_DOMAIN=.X in .env'
});
```

**Benefit**: Helps diagnose authentication issues by showing exactly what's missing.

### 2. Documentation (`backend/routes/auth.js`)

Added comments explaining cookie domain requirements:

```javascript
// IMPORTANT: If using separate subdomains (e.g., api.aishacrm.com and app.aishacrm.com),
// set COOKIE_DOMAIN=.aishacrm.com in .env to share cookies across subdomains.
// Without this, cookies set on app.X won't be sent to api.X, causing 401 errors.
// Recommended: Use same domain for frontend and backend (e.g., app.X/api) to avoid this issue.
```

**Benefit**: Future developers will understand the cookie domain requirement.

### 3. Configuration Template (`.env.production.recommended`)

Added `COOKIE_DOMAIN` documentation and example:

```bash
# IMPORTANT: Set COOKIE_DOMAIN if using subdomains (e.g., api.aishacrm.com and app.aishacrm.com)
# Use .aishacrm.com (with leading dot) to share cookies across all *.aishacrm.com subdomains
# Leave unset if frontend and backend are on the same domain (recommended: app.aishacrm.com/api)
# COOKIE_DOMAIN=.aishacrm.com
```

**Benefit**: Clear guidance for production deployment.

### 4. Troubleshooting Guide (`docs/TROUBLESHOOTING_401_ERRORS.md`)

Created comprehensive documentation covering:
- Problem explanation
- Root cause analysis
- Step-by-step solutions (same-domain vs cross-subdomain)
- Verification procedures
- Common mistakes
- Testing instructions

**Benefit**: Complete reference for diagnosing and fixing 401 errors.

## Verification Steps

### Check Current Configuration

```bash
# In production, check the backend URL
echo $VITE_AISHACRM_BACKEND_URL
# Should be: https://app.aishacrm.com/api
# NOT: https://api.aishacrm.com

# Check cookie domain (if using cross-subdomain)
echo $COOKIE_DOMAIN
# Should be: .aishacrm.com (with leading dot)
```

### Test in Browser

1. **Open DevTools** (F12)
2. **Network tab**: Make request to `/api/ai/conversations`
3. **Check request headers**: Should include `Cookie: aisha_access=...`
4. **Application tab → Cookies**: Check `aisha_access` cookie domain

Expected cookie properties:
- **Same-domain**: Domain = `app.aishacrm.com`
- **Cross-subdomain**: Domain = `.aishacrm.com` (with dot)

### Check Backend Logs

After login, when making a request that returns 401:

```json
{
  "level": "warn",
  "message": "[AI Security] Authentication required but no user context found",
  "hasCookie": false,  // <-- Should be true if cookie is being sent
  "cookieDomain": "(not set - cookies may not work across subdomains)"  // <-- Shows config
}
```

If `hasCookie: false`, the cookie isn't being sent → configuration issue.

## Impact

### No Code Changes to Application Logic
- Authentication flow unchanged
- Security model unchanged
- API behavior unchanged
- Only diagnostics and documentation improved

### Requires Environment Configuration
The actual fix is in the **production environment setup**, not the code:
- Either change `VITE_AISHACRM_BACKEND_URL` (recommended)
- Or add `COOKIE_DOMAIN` (if cross-subdomain required)

### Development Unchanged
- Development mode allows unauthenticated access (existing behavior)
- Tests pass without changes
- Local development workflow unaffected

## Why This Wasn't Caught Earlier

1. **Development Mode**: Allows unauthenticated requests (by design for easier testing)
2. **Environment Specific**: Issue only appears when:
   - `NODE_ENV=production` (enforces authentication)
   - Frontend and backend on different subdomains
   - `COOKIE_DOMAIN` not configured

3. **Tests Run in Development**: Existing tests work because they run with `NODE_ENV=development`

## Conclusion

This is a **production configuration issue**, not a code bug. The code changes provide:
- Better diagnostic logging
- Clear documentation
- Configuration examples

The actual fix requires updating the production environment to either:
- Use same-domain setup (recommended): `VITE_AISHACRM_BACKEND_URL=https://app.aishacrm.com/api`
- Or configure cookie domain: `COOKIE_DOMAIN=.aishacrm.com`

See `docs/TROUBLESHOOTING_401_ERRORS.md` for complete details.
