# Doppler Runtime Secret Injection - Testing Guide

## Overview

This guide helps you test the Doppler runtime secret injection implementation to ensure secrets are properly loaded at container startup, not baked into Docker images.

## What Changed

### Before (Incorrect)
- Secrets passed as Docker build arguments
- Secrets baked into image layers (security risk)
- No runtime flexibility

### After (Correct)
- Secrets injected at container runtime via environment variables
- Doppler CLI fetches secrets when container starts
- Graceful fallback when Doppler unavailable
- Secrets never in image layers

## Prerequisites

1. Docker and Docker Compose installed
2. `.env` file with `DOPPLER_TOKEN` set (for Doppler tests)
3. Alternative `.env` without `DOPPLER_TOKEN` (for fallback tests)

## Test Scenarios

### Test 1: Backend with Doppler (Runtime Injection)

**Setup:**
```bash
# Ensure DOPPLER_TOKEN is set in .env
grep DOPPLER_TOKEN .env
# Should output: DOPPLER_TOKEN=dp.st.xxx...
```

**Run:**
```bash
docker compose build backend
docker compose up backend
```

**Expected Output:**
```
aishacrm-backend | Starting backend with Doppler...
aishacrm-backend | [Doppler secret loading messages]
aishacrm-backend | Server starting on port 3001
```

**Verify:**
- Container starts successfully
- Logs show "Starting backend with Doppler..."
- No build errors about missing Doppler at build time
- Health check passes: `curl http://localhost:4001/health`

---

### Test 2: Backend without Doppler (Fallback)

**Setup:**
```bash
# Temporarily remove DOPPLER_TOKEN from .env
cp .env .env.backup
sed -i '/DOPPLER_TOKEN/d' .env
```

**Run:**
```bash
docker compose build backend
docker compose up backend
```

**Expected Output:**
```
aishacrm-backend | WARNING: DOPPLER_TOKEN not set, starting without Doppler
aishacrm-backend | Server starting on port 3001
```

**Verify:**
- Container still starts (graceful fallback)
- Uses environment variables from `.env` file directly
- Warning message appears in logs
- Health check passes (may fail if missing required secrets)

**Cleanup:**
```bash
mv .env.backup .env
```

---

### Test 3: Frontend with Doppler (Runtime Injection)

**Setup:**
```bash
# Ensure DOPPLER_TOKEN is set in .env
grep DOPPLER_TOKEN .env
```

**Run:**
```bash
docker compose build frontend
docker compose up frontend
```

**Expected Output:**
```
aishacrm-frontend | Fetching frontend secrets from Doppler...
aishacrm-frontend | Doppler secrets loaded successfully
aishacrm-frontend | frontend start | build=dev-local | started=2024-XX-XXTXX:XX:XXZ
aishacrm-frontend | Serving static files on port 3000
```

**Verify:**
- Container starts successfully
- Logs show "Fetching frontend secrets from Doppler..."
- `env-config.js` generated with correct values
- Access frontend: `http://localhost:4000`
- Check browser console for `window._env_` object

---

### Test 4: Frontend without Doppler (Fallback)

**Setup:**
```bash
# Temporarily remove DOPPLER_TOKEN
cp .env .env.backup
sed -i '/DOPPLER_TOKEN/d' .env
```

**Run:**
```bash
docker compose build frontend
docker compose up frontend
```

**Expected Output:**
```
aishacrm-frontend | WARNING: DOPPLER_TOKEN not set, using environment variables directly
aishacrm-frontend | frontend start | build=dev-local | started=2024-XX-XXTXX:XX:XXZ
aishacrm-frontend | Serving static files on port 3000
```

**Verify:**
- Container still starts
- Uses `.env` file variables directly
- Warning appears in logs
- Frontend may show errors if critical env vars missing

**Cleanup:**
```bash
mv .env.backup .env
```

---

### Test 5: Build-Time Secret Exclusion (Security Check)

**Purpose:** Verify secrets are NOT in Docker image layers

**Run:**
```bash
docker compose build backend
docker history aishacrm-backend:latest | grep -i "doppler\|supabase\|secret"
```

**Expected Result:**
- No sensitive values visible in image history
- Only references to Doppler CLI installation
- No `DOPPLER_TOKEN`, `SUPABASE_*` values in layers

**Also check frontend:**
```bash
docker compose build frontend
docker history aishacrm-frontend:latest | grep -i "doppler\|supabase\|vite_"
```

**Expected Result:**
- No `VITE_SUPABASE_*` or other secrets in layers
- Only Doppler CLI installation and static file copy

---

### Test 6: Full Stack with Doppler

**Run:**
```bash
docker compose down -v
docker compose build
docker compose up
```

**Verify:**
- Both backend and frontend start successfully
- Both show Doppler secret loading messages
- Health checks pass for both services
- Frontend can communicate with backend
- No secret values in `docker compose logs`

---

### Test 7: CI/CD Build (No Doppler Required)

**Purpose:** Verify images can be built without Doppler CLI installed

**Run:**
```bash
# Simulate CI environment (no doppler command available)
export PATH="/usr/bin:/bin"  # Exclude doppler from PATH
docker compose build --no-cache
```

**Expected Result:**
- Builds complete successfully
- No errors about missing `doppler` command during build
- Only runtime will require Doppler (not build time)

---

## Validation Checklist

- [ ] Backend starts with Doppler token → shows "Starting backend with Doppler..."
- [ ] Backend starts without Doppler token → shows warning, uses fallback
- [ ] Frontend starts with Doppler token → shows "Fetching frontend secrets from Doppler..."
- [ ] Frontend starts without Doppler token → shows warning, uses fallback
- [ ] Docker image history contains no secret values
- [ ] Health checks pass when secrets properly loaded
- [ ] Full stack works end-to-end with Doppler
- [ ] Images can be built without Doppler CLI present

---

## Troubleshooting

### Issue: "doppler: command not found" during build

**Cause:** Build step trying to use Doppler (incorrect)

**Fix:** Secrets should only be fetched at runtime, not build time. Check:
- `docker-compose.yml` has no `DOPPLER_TOKEN` in `build.args`
- Dockerfile CMD/entrypoint uses Doppler at runtime only

### Issue: Container exits immediately with "DOPPLER_TOKEN not set"

**Cause:** Backend CMD requires Doppler but token missing

**Fix:** The CMD should have a fallback. Check `backend/Dockerfile` line 74:
```dockerfile
CMD ["sh", "-c", "if [ -n \"$DOPPLER_TOKEN\" ]; then ...; else exec node server.js; fi"]
```

### Issue: Frontend env-config.js has undefined values

**Cause:** Secrets not loaded before entrypoint generates config

**Fix:** Check `frontend-entrypoint.sh` order:
1. Fetch Doppler secrets first
2. Then generate env-config.js (uses exported env vars)

### Issue: Pre-push hook fails with "doppler: not found"

**Cause:** Hook tries to run `npm run build` which requires Doppler

**Fix:** Already fixed in `.husky/pre-push` - uses `build:ci` when Doppler unavailable

---

## Production Deployment Notes

1. **Set Doppler Token in Production:**
   - Ensure `DOPPLER_TOKEN` environment variable is set in production `.env`
   - Use `DOPPLER_CONFIG=prd` for production config

2. **Health Monitoring:**
   - Monitor container logs for "Starting with Doppler..." messages
   - Alert on "WARNING: DOPPLER_TOKEN not set" in production

3. **Secrets Rotation:**
   - When rotating secrets in Doppler, restart containers to fetch new values
   - No rebuild required (secrets fetched at runtime)

4. **Fallback Strategy:**
   - Keep critical env vars in `.env` as fallback
   - Doppler should be primary, `.env` is backup

---

## Security Notes

✅ **What's Protected:**
- Secrets never committed to Git
- Secrets never in Docker image layers
- Secrets only in memory at runtime
- Secrets fetched just-in-time

✅ **Best Practices:**
- Rotate `DOPPLER_TOKEN` regularly
- Use separate Doppler configs per environment (dev/staging/prd)
- Audit Doppler access logs
- Never log secret values

---

## Additional Resources

- [Doppler CLI Documentation](https://docs.doppler.com/docs/cli)
- [Docker Secrets Management Best Practices](https://docs.docker.com/engine/swarm/secrets/)
- Project-specific docs: `COMPOSE_ENV_MAPPING.md`

---

**Testing Date:** _[Add date when tested]_  
**Tested By:** _[Add your name]_  
**Environment:** _[dev/staging/production]_  
**Status:** _[Pass/Fail]_
