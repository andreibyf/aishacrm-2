# n8n /n8n/ Path Validation & Rollback Checklist

Use this to verify the path-based embedding (Option A) after adjusting Cloudflare ingress and before relying on it in production workflows.

## 1. Cloudflare Tunnel Ordering
1. Edit `/etc/cloudflared/config.yml` so the `/n8n/*` rule appears **before** the generic frontend rule.
2. Confirm final order:
   - `/api/*` -> backend (4001)
   - `/health` -> backend (4001)
   - `/n8n/*` -> nginx proxy (5679)
   - (no path) -> frontend (4000)
   - catch-all 404
3. Restart tunnel:
```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```
4. Quick routing check:
```bash
curl -I https://app.aishacrm.com/n8n/ | grep HTTP
```

## 2. Nginx Prefix Preservation
Ensure nginx uses:
```nginx
location /n8n/ {
    proxy_pass http://n8n:5678/n8n/;  # prefix preserved upstream
    proxy_hide_header X-Frame-Options;
    proxy_hide_header Content-Security-Policy;
    add_header X-Frame-Options "ALLOWALL";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```
Reload:
```bash
sudo nginx -t && sudo nginx -s reload
```

## 3. Environment Variables
Minimum set in n8n service:
```
N8N_HOST=app.aishacrm.com
N8N_PORT=5678
N8N_EDITOR_BASE_URL=https://app.aishacrm.com/n8n
VUE_APP_URL_BASE_API=https://app.aishacrm.com/n8n
WEBHOOK_URL=https://app.aishacrm.com/
# If supported by version:
N8N_PATH=/n8n
```
Restart container after changes.

## 4. Frontend Iframe Verification
1. Open Settings page inside the CRM.
2. Confirm iframe src ends with `/n8n/`.
3. In DevTools Network (iframe context):
   - Document: 200 from `/n8n/`
   - Assets & XHR: paths prefixed `/n8n/` (e.g. `/n8n/rest/...`).
4. No mixed 404 requests to `/rest` without prefix.

## 5. Cookie & Auth
1. In iframe DevTools Application -> Cookies:
   - Cookies present (Secure, SameSite=lax).
   - No unexpected Basic Auth prompt (unless re-enabled).
2. If workflows require Public API, confirm `N8N_PUBLIC_API_DISABLED=false` (or default) is set.

## 6. Webhook Behavior
1. Create a test workflow with a manual trigger and a webhook node.
2. Copy generated webhook URL.
   - Should be root-based: `https://app.aishacrm.com/webhook/...` (unless you changed endpoint vars).
3. `curl -I` the webhook URL to confirm 200/204 as appropriate.

## 7. Execution Test
1. Run a simple workflow (e.g., Set -> Respond). Confirm success in UI.
2. Check logs (if mounted) in container or via `docker logs aishacrm-n8n --tail=50`.

## 8. Failure Modes & Indicators
| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| Assets 404 under `/n8n/` | Prefix stripped upstream | Use `proxy_pass .../n8n/` variant + set `N8N_PATH` |
| REST calls hitting `/rest` (root) | n8n unaware of prefix | Add `N8N_PATH=/n8n` or switch to prefix-preserving proxy |
| Iframe blocked | Header not removed | Ensure `proxy_hide_header X-Frame-Options` and `Content-Security-Policy` removal |
| Webhooks produce wrong domain | `WEBHOOK_URL` mismatch | Set `WEBHOOK_URL=https://app.aishacrm.com/` |
| Cookie missing | Secure or SameSite mismatch | Verify HTTPS, keep `N8N_SECURE_COOKIE=true` |

## 9. Rollback Plan
If prefix approach causes instability:
1. Change nginx to strip prefix:
```nginx
location /n8n/ {
    proxy_pass http://n8n:5678/;  # strips /n8n
    proxy_hide_header X-Frame-Options;
    proxy_hide_header Content-Security-Policy;
}
```
2. Remove `N8N_PATH` env var.
3. Restart n8n & nginx.
4. Update frontend `VITE_N8N_URL` to `https://app.aishacrm.com/n8n/` (still fine; n8n serves root internally, prefix only external).

## 10. Post-Upgrade Checklist
After updating n8n:
- Re-validate `N8N_PATH` support.
- Re-run Steps 4–7.
- Confirm no new security headers appear (CSP variants, etc.).

## 11. Optional Automation Script
Create `validate-n8n-path.sh` on server:
```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="https://app.aishacrm.com/n8n/"

printf "Checking editor root...\n"
curl -Is "$BASE" | head -n1

printf "Checking REST prefix...\n"
REST=$(curl -s "$BASE" | grep -Eo "/n8n/rest[^"]+" | head -n1 || true)
if [ -z "$REST" ]; then
  echo "WARN: No /n8n/rest reference found (check prefix preservation)."
else
  echo "Found REST reference: $REST"
fi

printf "Testing webhook root (sample path placeholder)...\n"
# Replace with an actual webhook path created in the UI
# curl -Is https://app.aishacrm.com/webhook/TEST_ID | head -n1 || echo "Add a real webhook ID"

echo "Done."
```

Make executable:
```bash
chmod +x validate-n8n-path.sh && ./validate-n8n-path.sh
```

---
Last updated: (insert date on modification)
