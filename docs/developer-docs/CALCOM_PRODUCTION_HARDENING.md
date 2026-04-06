# Cal.com Production Hardening Runbook

## Scope

This runbook hardens two production-sensitive paths:

- Tenant integrations GET list filtering when `is_active` is omitted.
- Booking shortlink destination canonicalization to avoid persisted localhost URLs.

## Build-Time vs Runtime Configuration

`VITE_*` variables are build-time only.

- Frontend booking URLs are resolved during image build from `VITE_CALCOM_URL`.
- Runtime env injection (including Doppler values in running containers) does not rewrite already-built `/app/dist` assets.

Required production build variable:

- `VITE_CALCOM_URL=https://scheduler.aishacrm.com`

## Deployment Policy

Use immutable image tags for release deployments.

- Do: `ghcr.io/...-frontend:2026-04-06.1`
- Avoid: floating `:latest` for release orchestration

## Release Steps

1. Set CI build variable:

- `VITE_CALCOM_URL=https://scheduler.aishacrm.com`

2. Build and publish immutable frontend/backend images.

3. Deploy compose manifests pinned to immutable tags.

4. Recreate services.

## Post-Deploy Verification Checklist

1. Confirm frontend dist does not contain localhost scheduler origin:

```bash
docker exec aishacrm-frontend sh -lc "grep -R -n 'localhost:3002' /app/dist || true"
```

Expected: no matches.

2. Confirm tenant integrations list behavior:

- `GET /api/tenantintegrations?tenant_id=<tenant>`
  - Expected: returns existing rows regardless of `is_active` values.
- `GET /api/tenantintegrations?tenant_id=<tenant>&is_active=true`
  - Expected: active rows only.
- `GET /api/tenantintegrations?tenant_id=<tenant>&is_active=false`
  - Expected: inactive rows only.

3. Confirm shortlink canonicalization:

- Create shortlink with localhost-origin destination URL.
- Expected: persisted destination and redirect `Location` host use `scheduler.aishacrm.com`.
- Expected: no redirect `Location` header to localhost.

## Rollback

1. Revert to previous known-good immutable image tags.
2. Redeploy compose with those tags.
3. Re-run verification checklist above.
4. Record incident note with:

- change deployed
- exact rollback target tags
- remediation ETA

## Hard Rules

1. Never deploy frontend from floating `latest`.
2. Fail CI if production frontend dist contains `localhost:3002`.
