# Cloudflare Tunnel Configuration for AiSHA CRM

## Problem Statement

Production Settings page returns HTML instead of JSON because Cloudflare Tunnel is not properly routing `/api/*` requests to the backend service.

**Error:** `SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`

**Root Cause:** All requests (including `/api/*`) are being routed to the frontend container, which returns `index.html` for unmatched routes (SPA behavior).

---

## Solution: Path-Based Routing

Configure Cloudflare Tunnel to route requests based on URL path:

- `/api/*` → Backend (port 4001)
- `/*` (all other paths) → Frontend (port 4000)

---

## Configuration Methods

### Method 1: Via Cloudflare Dashboard (Recommended)

1. **Navigate to Cloudflare Zero Trust Dashboard:**
   - Go to: https://one.dash.cloudflare.com/
   - Select your account → **Access** → **Tunnels**

2. **Find Your Tunnel:**
   - Locate the tunnel connected to `app.aishacrm.com`
   - Click **Configure**

3. **Edit Public Hostname:**
   - Go to **Public Hostname** tab
   - Click on the existing hostname (`app.aishacrm.com`)

4. **Configure Path-Based Routing:**

   **Add API Route (Priority 1 - Higher priority):**
   ```
   Subdomain: app
   Domain: aishacrm.com
   Path: /api/*
   
   Service:
     Type: HTTP
     URL: localhost:4001
   ```

   **Add Frontend Route (Priority 2 - Lower priority):**
   ```
   Subdomain: app
   Domain: aishacrm.com
   Path: /*
   
   Service:
     Type: HTTP
     URL: localhost:4000
   ```

5. **Save Configuration**

6. **Verify Order:**
   - Ensure `/api/*` route is listed BEFORE `/*` route
   - Cloudflare evaluates routes in order - first match wins

---

### Method 2: Via Cloudflare CLI (`cloudflared`)

Edit your tunnel configuration file (usually `~/.cloudflared/config.yml` or `/etc/cloudflared/config.yml`):

```yaml
tunnel: <your-tunnel-id>
credentials-file: /path/to/credentials.json

ingress:
  # API Route - Must come FIRST
  - hostname: app.aishacrm.com
    path: /api/*
    service: http://localhost:4001
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
      
  # Health check endpoints (optional but recommended)
  - hostname: app.aishacrm.com
    path: /health
    service: http://localhost:4001
    
  # Frontend Route - Must come AFTER /api/*
  - hostname: app.aishacrm.com
    service: http://localhost:4000
    originRequest:
      noTLSVerify: false
      
  # Catch-all rule (required by cloudflared)
  - service: http_status:404
```

**Apply Configuration:**
```bash
# Validate configuration
cloudflared tunnel ingress validate

# Restart tunnel service
sudo systemctl restart cloudflared

# Or if running manually
cloudflared tunnel run <tunnel-name>
```

---

### Method 3: Advanced Configuration with Additional Services

If you need to expose other services (MCP, n8n, etc.):

```yaml
tunnel: <your-tunnel-id>
credentials-file: /path/to/credentials.json

ingress:
  # API Backend
  - hostname: app.aishacrm.com
    path: /api/*
    service: http://localhost:4001
    
  # Health Check
  - hostname: app.aishacrm.com
    path: /health
    service: http://localhost:4001
    
  # MCP Server (optional - only if exposing externally)
  - hostname: mcp.aishacrm.com
    service: http://localhost:4002
    
  # n8n Workflows (optional - only if exposing externally)  
  - hostname: n8n.aishacrm.com
    service: http://localhost:5678
    
  # Frontend (catch-all for main domain)
  - hostname: app.aishacrm.com
    service: http://localhost:4000
    
  # Default catch-all
  - service: http_status:404
```

---

## Verification Steps

### 1. Test API Endpoint Directly

```bash
# From production server
curl -v http://localhost:4001/health

# Should return backend health response, not HTML
```

### 2. Test via Cloudflare Tunnel

```bash
# From any machine
curl -v https://app.aishacrm.com/health

# Should return backend health response
# Check response headers for correct content-type: application/json
```

### 3. Test Frontend

```bash
curl -v https://app.aishacrm.com/

# Should return HTML with <!DOCTYPE html>
```

### 4. Test Settings Page API Call

Open browser console on `https://app.aishacrm.com/settings` and run:

```javascript
// Should fetch JSON successfully
fetch('/api/modulesettings?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46', {
  credentials: 'include',
  headers: {
    'Authorization': 'Bearer ' + (await supabase.auth.getSession()).data.session.access_token
  }
})
.then(r => r.json())
.then(console.log)
```

Expected: JSON object with `{status: 'success', data: {...}}`  
Not: `SyntaxError: Unexpected token '<'`

---

## Common Issues & Solutions

### Issue: 404 on API Requests

**Cause:** Path pattern not matching  
**Fix:** Ensure path uses `/api/*` not `/api*` (the slash matters!)

### Issue: Still Getting HTML

**Cause:** Route priority wrong  
**Fix:** Move `/api/*` route ABOVE `/*` route in configuration

### Issue: CORS Errors

**Cause:** Backend ALLOWED_ORIGINS not including tunnel domain  
**Fix:** Update backend `.env`:
```env
ALLOWED_ORIGINS=https://app.aishacrm.com,http://localhost:4000
```

### Issue: 502 Bad Gateway

**Cause:** Backend service not running or wrong port  
**Fix:** Verify backend container health:
```bash
docker ps | grep aishacrm-backend
docker logs aishacrm-backend --tail=50
```

---

## Production Checklist

- [ ] Cloudflare Tunnel configured with path-based routing
- [ ] `/api/*` route points to `localhost:4001`
- [ ] `/*` route points to `localhost:4000`
- [ ] Route priority correct (`/api/*` before `/*`)
- [ ] Backend `ALLOWED_ORIGINS` includes `https://app.aishacrm.com`
- [ ] Backend container healthy and listening on port 4001
- [ ] Frontend container healthy and listening on port 4000
- [ ] API health check returns JSON: `curl https://app.aishacrm.com/health`
- [ ] Frontend loads correctly: `curl https://app.aishacrm.com/`
- [ ] Settings page loads without JSON parse error
- [ ] Browser console shows no CORS errors

---

## Monitoring

After configuration, monitor for:

1. **Application Logs:**
   ```bash
   docker logs aishacrm-backend --follow
   docker logs aishacrm-frontend --follow
   ```

2. **Cloudflare Analytics:**
   - Check request distribution between frontend and backend
   - Verify `/api/*` requests are reaching backend

3. **Error Tracking:**
   - Monitor for JSON parse errors in browser console
   - Check backend logs for 404s or auth failures

---

## Rollback Plan

If issues persist after configuration:

1. **Revert Cloudflare Config:**
   - Remove path-based routing
   - Point all traffic to frontend temporarily
   - Investigate localhost port accessibility

2. **Check Docker Network:**
   ```bash
   # Verify services are accessible from tunnel host
   curl http://localhost:4000/
   curl http://localhost:4001/health
   ```

3. **Verify Environment Variables:**
   ```bash
   # Check backend knows its external URL
   docker exec aishacrm-backend env | grep ALLOWED_ORIGINS
   ```

---

## Additional Resources

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Path-Based Routing Examples](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/routing-to-tunnel/)
- [Ingress Rules Reference](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/local/local-management/ingress/)

---

## Support

After applying this configuration:

1. Test immediately with the verification steps above
2. If Settings page still shows JSON parse error, check browser Network tab:
   - What URL is being requested?
   - What response is returned (HTML or JSON)?
   - What are the response headers?

3. Update BUG-PROD-001 in `orchestra/BUGS.md` with:
   - Configuration applied
   - Test results
   - Status (Resolved or still investigating)
