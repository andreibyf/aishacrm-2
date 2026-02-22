# Troubleshooting 401 Authentication Errors

## Problem

API endpoints return `401 Unauthorized` errors in production, particularly for routes like `/api/ai/conversations`.

## Root Cause

The most common cause is **cookies not being sent with API requests** due to:

1. **Cross-subdomain configuration**: Frontend on `app.aishacrm.com` calling API on `api.aishacrm.com`
2. **Missing COOKIE_DOMAIN**: Cookies are domain-specific and won't be sent across subdomains without proper configuration
3. **SameSite cookie policy**: Cookies with `sameSite: 'lax'` won't be sent on cross-site requests

## Solution

### Recommended Approach: Same-Domain Setup

Keep frontend and backend on the **same domain** using path-based routing:

```bash
# .env or .env.production
VITE_AISHACRM_BACKEND_URL=https://app.aishacrm.com/api
FRONTEND_URL=https://app.aishacrm.com
```

This is the recommended setup from `.env.production.recommended`. With this configuration:

- Frontend: `https://app.aishacrm.com`
- Backend API: `https://app.aishacrm.com/api/*`
- Cookies work automatically (same domain)
- No CORS issues
- No cookie domain configuration needed

### Alternative: Cross-Subdomain Setup

If you must use separate subdomains (`api.aishacrm.com` and `app.aishacrm.com`), set the cookie domain:

```bash
# .env or .env.production
COOKIE_DOMAIN=.aishacrm.com  # Note the leading dot!
VITE_AISHACRM_BACKEND_URL=https://api.aishacrm.com
FRONTEND_URL=https://app.aishacrm.com
ALLOWED_ORIGINS=https://app.aishacrm.com,https://api.aishacrm.com
```

**Important**: The leading dot (`.aishacrm.com`) allows cookies to be shared across all `*.aishacrm.com` subdomains.

## Verification Steps

### 1. Check Environment Variables

Verify your production environment has:

```bash
# Check if VITE_AISHACRM_BACKEND_URL matches your actual setup
echo $VITE_AISHACRM_BACKEND_URL

# If using subdomains, ensure COOKIE_DOMAIN is set
echo $COOKIE_DOMAIN
```

### 2. Check Browser Cookies

1. Open browser DevTools (F12)
2. Go to Application/Storage → Cookies
3. Look for `aisha_access` cookie
4. Verify its `Domain` attribute:
   - Same-domain setup: Should be `app.aishacrm.com`
   - Cross-subdomain setup: Should be `.aishacrm.com` (with dot)

### 3. Check Network Requests

1. Open browser DevTools (F12) → Network tab
2. Make a request to `/api/ai/conversations`
3. Check the request headers:
   - Should include `Cookie: aisha_access=...`
   - If cookie is missing, authentication will fail with 401

### 4. Check Backend Logs

When NODE_ENV=production and authentication fails, the backend logs:

```json
{
  "level": "warn",
  "message": "[AI Security] Authentication required but no user context found",
  "path": "/api/ai/conversations",
  "hasCookie": false,
  "hasAuthHeader": false,
  "cookieDomain": "(not set - cookies may not work across subdomains)",
  "hint": "If using separate subdomains (api.X vs app.X), set COOKIE_DOMAIN=.X in .env"
}
```

## Common Mistakes

### ❌ Wrong: api.aishacrm.com without COOKIE_DOMAIN

```bash
VITE_AISHACRM_BACKEND_URL=https://api.aishacrm.com
# Missing: COOKIE_DOMAIN=.aishacrm.com
```

**Result**: Cookies won't be sent, 401 errors

### ❌ Wrong: COOKIE_DOMAIN without leading dot

```bash
COOKIE_DOMAIN=aishacrm.com  # Missing the dot!
```

**Result**: Cookies won't work as expected

### ❌ Wrong: Mismatched frontend URL

```bash
VITE_AISHACRM_BACKEND_URL=https://api.aishacrm.com
FRONTEND_URL=https://app.aishacrm.com
ALLOWED_ORIGINS=https://app.aishacrm.com
# Missing: COOKIE_DOMAIN=.aishacrm.com
```

**Result**: CORS headers allow the request, but cookies aren't sent

### ✅ Correct: Same-domain setup (recommended)

```bash
VITE_AISHACRM_BACKEND_URL=https://app.aishacrm.com/api
FRONTEND_URL=https://app.aishacrm.com
ALLOWED_ORIGINS=https://app.aishacrm.com
# No COOKIE_DOMAIN needed
```

### ✅ Correct: Cross-subdomain setup

```bash
VITE_AISHACRM_BACKEND_URL=https://api.aishacrm.com
FRONTEND_URL=https://app.aishacrm.com
ALLOWED_ORIGINS=https://app.aishacrm.com,https://api.aishacrm.com
COOKIE_DOMAIN=.aishacrm.com  # With leading dot!
```

## Development vs Production

### Development (NODE_ENV=development)

- Authentication is **optional** for AI routes
- Mock superadmin user is created if no authentication is present
- Allows testing without login

### Production (NODE_ENV=production)

- Authentication is **required** for AI routes
- Returns 401 if no valid user session is found
- Requires proper cookie/auth token configuration

## Testing the Fix

### In Production

1. Update environment variables (add COOKIE_DOMAIN or fix BACKEND_URL)
2. Restart backend: `docker-compose restart aishacrm-backend`
3. Clear browser cookies and localStorage
4. Log in again
5. Test `/api/ai/conversations` endpoint

### Quick Test via curl

```bash
# Login first to get cookie
curl -c cookies.txt -X POST https://app.aishacrm.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'

# Test conversations endpoint with cookie
curl -b cookies.txt https://app.aishacrm.com/api/ai/conversations?tenant_id=YOUR_TENANT_ID
```

## Related Files

- `.env.production.recommended` - Reference production configuration
- `backend/routes/auth.js` - Cookie configuration (cookieOpts function)
- `backend/middleware/authenticate.js` - Authentication middleware
- `backend/routes/ai.js` - AI routes with validateUserTenantAccess
- `src/api/conversations.js` - Frontend API calls with credentials: 'include'

## Further Reading

- [MDN: SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [MDN: Cookie Domain attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#define_where_cookies_are_sent)
- [CORS with credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#requests_with_credentials)
