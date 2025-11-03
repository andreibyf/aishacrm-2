# Deploying Backend to DigitalOcean App Platform

This guide deploys the Aisha CRM backend as a single service using the existing Dockerfile.

## Prereqs
- DigitalOcean account and App Platform access
- doctl installed and authenticated:
  - `doctl auth init`

## App Spec
We added `digitalocean.app.yaml` at the repo root. It points to `backend/Dockerfile`, sets port 3001, health path `/health`, and defines runtime envs (with placeholders for secrets).

Key envs to set:
- NODE_ENV=production
- NODE_OPTIONS=--dns-result-order=ipv4first (forces IPv4-first DNS)
- USE_SUPABASE_PROD=true
- SUPABASE_DB_HOST / PORT / NAME / USER / PASSWORD (secret)
- SUPABASE_URL / SUPABASE_ANON_KEY (secret) / SUPABASE_SERVICE_ROLE_KEY (secret)
- ALLOWED_ORIGINS (comma-separated list; use `*` temporarily for testing)
- DISABLE_DB_LOGGING=false (enables DB-backed audit/system logging)
- PORT=3001

## Create the App
```powershell
# From the repo root
Get-Location
# If needed:
# cd c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53

# Create the app from spec
# You can leave secret values empty here and fill them in via the DO Dashboard after creation
# (Recommended for secrets)

doctl apps create --spec digitalocean.app.yaml
```

After creation, open the App in the DO Dashboard and:
- Set all SECRET env vars (DB password, Supabase keys)
- Click "Deploy" to apply the changes

## Health Verification
Once the app is live, copy the App URL and run our health script:

```powershell
# Replace with your DO App URL
$BackendUrl = "https://your-do-app-url.ondigitalocean.app"

# Run our checker script
./scripts/check-backend-health.ps1 -Url $BackendUrl
```

Expected:
- Status: success
- Database: connected (no IPv6 ENETUNREACH)
- Health endpoint returns `ok`

If metrics endpoints still return 500, re-run the script once DB is stable and share the output.

## Frontend
Update your frontend `.env`:
```env
VITE_AISHACRM_BACKEND_URL=https://your-do-app-url.ondigitalocean.app
```
Then rebuild/redeploy the frontend.

## Notes
- The backend also exposes `/api/status` and `/api-docs` (Swagger) for quick verification.
- DB logging is enabled when `DISABLE_DB_LOGGING=false`; you can confirm `system_logs` entries for startup/heartbeat.
- App Platform sets `PORT` automatically; we pin `3001` for clarity.
