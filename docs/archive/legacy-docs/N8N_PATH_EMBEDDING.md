# n8n Path-Based Embedding (Option A)

This document standardizes running n8n under a path prefix (`/n8n/`) on the primary domain (`https://app.aishacrm.com`) while embedding the editor in the Aisha CRM Settings page.

## Goals
- Serve n8n UI at `https://app.aishacrm.com/n8n/` (not a subdomain)
- Ensure iframe embedding works (no X-Frame-Options / restrictive CSP headers)
- Keep workflow webhooks at root (optional) while editor + REST/API live under the prefix
- Maintain compatibility with future n8n upgrades

## Core Principles
- Cloudflare Tunnel must route `/n8n/*` before the generic frontend rule.
- Nginx proxy must preserve the `/n8n/` prefix (do **not** strip) so asset paths remain consistent.
- n8n should be configured (if version supports) with a base path env var (`N8N_PATH=/n8n`) so internally generated links include the prefix.
- Webhook URLs may remain at root using `WEBHOOK_URL=https://app.aishacrm.com/` unless you intentionally want them under `/n8n/webhook/`.

## Environment Variables (Recommended)
Set these in the n8n service definition (verify availability for current n8n version):
```
N8N_HOST=app.aishacrm.com
N8N_PORT=5678
N8N_EDITOR_BASE_URL=https://app.aishacrm.com/n8n
VUE_APP_URL_BASE_API=https://app.aishacrm.com/n8n
WEBHOOK_URL=https://app.aishacrm.com/
# Path prefix (supported in recent n8n versions)
N8N_PATH=/n8n
# (Optional) If you want REST endpoints explicitly prefixed
# N8N_ENDPOINT_REST=/n8n/rest
# Leave webhooks root-based; do not set path variant unless desired:
# N8N_ENDPOINT_WEBHOOK=/n8n/webhook
```

Notes:
- `N8N_EDITOR_BASE_URL` influences internal link generation & webhook link copying.
- `VUE_APP_URL_BASE_API` is used by the front-end UI to target API endpoints.
- If `N8N_PATH` is unsupported in your current release, rely solely on proxy prefix preservation (still works). Test by inspecting network requests for `/n8n/rest/...`.

## Cloudflare Tunnel Ingress Ordering
Place the `/n8n/*` rule **before** the catch-all frontend rule:
```yaml
ingress:
  - hostname: app.aishacrm.com
    path: /api/*
    service: http://localhost:4001
  - hostname: app.aishacrm.com
    path: /health
    service: http://localhost:4001
  - hostname: app.aishacrm.com
    path: /n8n/*
    service: http://localhost:5679  # nginx proxy
  - hostname: app.aishacrm.com
    service: http://localhost:4000  # frontend
  - service: http_status:404
```
If `/n8n/*` appears after the generic rule, requests will never reach n8n.

## Nginx Proxy (Prefix-Preserving)
Example config preserving `/n8n/`:
```nginx
server {
    listen 5679;
    server_name app.aishacrm.com;

    # Optional convenience redirect for bare path
    location = / { return 301 /n8n/; }

    location /n8n/ {
        # Preserve prefix by mirroring it upstream. Trailing slash on both sides keeps path segments aligned.
        proxy_pass http://n8n:5678/n8n/;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Allow iframe embedding
        proxy_hide_header X-Frame-Options;
        proxy_hide_header Content-Security-Policy;
        add_header X-Frame-Options "ALLOWALL";

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts (long-running executions)
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```
Why mirror prefix upstream? It avoids the UI generating root-relative asset paths when unaware of its base path and aligns with `N8N_PATH=/n8n` if set.

### If `N8N_PATH` Is Not Available
Use a simpler upstream:
```nginx
location /n8n/ {
    proxy_pass http://n8n:5678/;  # Strips prefix
    # Add (experimental) forwarded prefix hint:
    proxy_set_header X-Forwarded-Prefix /n8n;
    ...
}
```
Then confirm n8n respects `X-Forwarded-Prefix` (may not in older versions). If requests show `/rest` (missing prefix) in browser dev tools, switch to the prefix-preserving form above.

## Authentication Considerations
- Path-based same-origin embedding reduces need for Basic Auth; cookies (Secure + SameSite=lax) should work inside iframe.
- If re-enabling Basic Auth: set `N8N_BASIC_AUTH_ACTIVE=true` plus user/password; confirm iframe doesn't trigger repeated browser auth prompts.
- Keep `N8N_SECURE_COOKIE=true` for HTTPS and production security.

## Verification Checklist
1. Load Settings iframe (`/n8n/` document 200 OK).
2. Open DevTools Network: All subsequent API calls should be to `/n8n/rest/...` (or `/rest/...` only if prefix intentionally stripped and working).
3. Check cookies: Scope domain `app.aishacrm.com`, Secure flag present.
4. Copy a test webhook URL from editor: Should use `WEBHOOK_URL` root (unless path-based webhook endpoints configured).
5. Execute a workflow: Ensure logs appear and no mixed-content or 404 asset errors.

## Rollback Strategy
- If asset 404s occur with prefix-preserving proxy, remove `/n8n/` after upstream host in `proxy_pass` (strip prefix) and unset `N8N_PATH`.
- Re-test network paths; choose the configuration that yields stable asset & API resolution.

## Frontend Integration
The CRM front-end uses `VITE_N8N_URL` (currently `https://app.aishacrm.com/n8n/`). The Settings page enforces a trailing slash to avoid relative path issues when n8n generates links like `./rest` vs `rest`.

## Future Notes
- After n8n upgrades, re-verify whether `N8N_PATH` is still supported or renamed.
- Consider adding CSP relaxations explicitly if future versions emit `Content-Security-Policy-Report-Only` headers.
- For performance, you can enable HTTP/2 on the proxy port if fronting with a public listener (not required in current internal mapping).

---
Last updated: (insert date on modification)
