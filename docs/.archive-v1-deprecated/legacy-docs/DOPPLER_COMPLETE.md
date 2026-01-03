# Doppler Migration - COMPLETE ✅

**Date:** December 8, 2025  
**Status:** All 5 phases complete and operational

---

## Overview

Successfully migrated all environment variable management from manual `.env` files to Doppler Community Edition, eliminating the need to maintain secrets in 3 locations (dev .env, prod .env, GitHub secrets).

## What Was Accomplished

### Phase 1: Local Setup ✅
- Installed Doppler CLI v3.75.1
- Authenticated with personal account (andreibyf)
- Created project `aishacrm` with environments: dev, stg, prd
- Uploaded 74 dev secrets to `dev` config

### Phase 2: Local Development ✅
- Created `doppler.yaml` for automatic project detection
- Updated `package.json` scripts to use `doppler run --`
- Verified local dev works: `npm run dev`, `npm run dev:backend`
- Added `BACKEND_PORT=3001` and `FRONTEND_PORT=3000`

### Phase 3: Docker Integration ✅
- Modified `docker-compose.yml` to use Doppler via `env_file`
- Backend: Uses `BACKEND_PORT` from Doppler (3001 internal, 4001 host)
- Frontend: Uses `FRONTEND_PORT` from Doppler (3000 internal, 4000 host)
- Added proxy service (port 8080) for dev environment consistency
- Backend container: Healthy, listening on port 3001
- Frontend container: Healthy, serving on port 3000

### Phase 4: GitHub Actions ✅
- Renamed GitHub-incompatible secrets:
  - `GITHUB_REPO_OWNER` → `REPO_OWNER`
  - `GITHUB_REPO_NAME` → `REPO_NAME`
  - `GITHUB_TOKEN` → `GH_TOKEN`
  - `GITHUB_WORKFLOW_FILE` → `WORKFLOW_FILE`
- Updated backend code with fallbacks to old names
- Synced 96 production secrets from Doppler `prd_prd` → GitHub Actions
- Workflow uses `${{ secrets.* }}` which automatically pulls Doppler secrets
- No workflow changes needed - existing references work with synced secrets

### Phase 5: Production VPS ✅
- Installed Doppler CLI v3.75.1 on VPS (147.189.173.237)
- Uploaded 193 production secrets to `prd_prd` config
- Created `.doppler-token` file with production service token
- Downloaded secrets to `.env.from-doppler` on VPS
- Updated `docker-compose.prod.yml` to use `env_file: .env.from-doppler`
- Updated MCP `docker-compose.prod.yml` to use Doppler secrets
- All containers healthy and operational:
  - aishacrm-backend
  - aishacrm-frontend
  - aishacrm-proxy
  - aishacrm-redis-memory
  - aishacrm-redis-cache
  - braid-mcp-server
  - braid-mcp-1
  - braid-mcp-2
- Backend API responding on https://app.aishacrm.com

---

## Architecture

### Port Configuration
**Dev (native - no Docker):**
- Frontend: 3000
- Backend: 3001

**Docker (local development):**
- Frontend: 3000 (container) → 4000 (host)
- Backend: 3001 (container) → 4001 (host)
- Proxy: 80 (container) → 8080 (host)

**Production (VPS Docker):**
- Frontend: 3000 (container) → 4000 (host via proxy)
- Backend: 3001 (container) → 4001 (host)
- Proxy: 80 (container) → 4000 (host - public entry point)

### Doppler Configs
- **dev**: Local development secrets (74 variables)
- **prd_prd**: Production secrets (198 variables)

### Secret Naming Conventions
- **Backend ports:** `BACKEND_PORT=3001` (container internal)
- **Frontend ports:** `FRONTEND_PORT=3000` (container internal)
- **GitHub-safe:** No `GITHUB_*` prefixes (use `GH_TOKEN`, `REPO_OWNER`, etc.)
- **Backward compatible:** Code has fallbacks to old names

---

## Tokens & Access

### Service Tokens (stored in `.env.docker`, gitignored)
```bash
# Dev token (read-write, 30-day)
DOPPLER_TOKEN=<REDACTED_DEV_TOKEN>

# Production token (read-write)
DOPPLER_TOKEN_PRD=<REDACTED_PROD_TOKEN>
```

### Production VPS Token Location
```bash
/opt/aishacrm/.doppler-token
/opt/aishacrm/.env.from-doppler (downloaded secrets)
/opt/aishacrm/braid-mcp-node-server/.env.from-doppler
```

### Backups
```bash
# Local
c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53\backend\.env.backup

# Production VPS
/opt/aishacrm/env-backups/pre-doppler-20251208-1729/
/opt/aishacrm/braid-mcp-node-server/.env.backup-20251208
```

---

## Daily Operations

### Update a Secret
```bash
# Update in Doppler dashboard or CLI
doppler secrets set API_KEY=new_value --config prd_prd

# Refresh production VPS (automated via cron or manual)
ssh andreibyf@147.189.173.237
cd /opt/aishacrm
export DOPPLER_TOKEN=$(cat .doppler-token)
doppler secrets download --config prd_prd --no-file --format env > .env.from-doppler
docker compose -f docker-compose.prod.yml up -d --force-recreate

# GitHub Actions automatically gets updated secrets
```

### Add a New Secret
```bash
# Add to Doppler
doppler secrets set NEW_SECRET=value --config prd_prd

# It automatically syncs to GitHub Actions
# Update VPS as shown above
```

### Rotate Doppler Token
```bash
# Generate new token
doppler configs tokens create vps-prod-rotated --config prd_prd --plain

# Update VPS
ssh andreibyf@147.189.173.237
cd /opt/aishacrm
echo "new_token_here" > .doppler-token
chmod 600 .doppler-token

# Test
export DOPPLER_TOKEN=$(cat .doppler-token)
doppler secrets --config prd_prd | head -5

# Redeploy
doppler secrets download --config prd_prd --no-file --format env > .env.from-doppler
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

---

## Benefits Achieved

1. **Single Source of Truth** - All secrets managed in Doppler dashboard
2. **Zero Manual Copying** - No more syncing dev → prod → GitHub
3. **Automatic GitHub Sync** - Doppler integration syncs 96 secrets to GitHub Actions
4. **Audit Trail** - Every secret change logged with who/when/what
5. **Easy Rotation** - Update once, deploy everywhere
6. **Team Collaboration** - Proper access controls per environment
7. **Backup & Recovery** - Secrets versioned in Doppler
8. **No Committed Secrets** - `.env.docker` and `.doppler-token` are gitignored

---

## Files Changed

### Created
- `doppler.yaml` - Project configuration
- `.env.docker` - Local Doppler tokens (gitignored)
- `docs/DOPPLER_MIGRATION.md` - Migration guide
- `docs/DOPPLER_STATUS.md` - Phase 1 & 2 status
- `docs/PHASE3_COMPLETE.md` - Phase 3 summary
- `docs/DOPPLER_COMPLETE.md` - Final summary (this file)

### Modified
- `package.json` - Scripts use `doppler run --`
- `backend/server.js` - Uses `BACKEND_PORT` || `PORT`
- `frontend-entrypoint.sh` - Uses `FRONTEND_PORT`
- `docker-compose.yml` - Backend uses Doppler via env_file, added proxy
- `docker-compose.prod.yml` - Uses `.env.from-doppler` (no Doppler CLI in containers)
- `backend/routes/github-issues.js` - Prioritizes `GH_TOKEN`, `REPO_OWNER`, `REPO_NAME`
- `backend/routes/testing.js` - Prioritizes `GH_TOKEN`, `REPO_OWNER`, `REPO_NAME`, `WORKFLOW_FILE`
- `backend/routes/mcp.js` - Prioritizes `GH_TOKEN` (3 locations)
- `backend/.env.example` - Updated with new variable names
- `.gitignore` - Added `.env.docker`, `.doppler-token`, `*.backup`

### Backed Up
- `backend/.env.backup` - Original dev secrets
- `braid-mcp-node-server/.env.backup` - Original MCP secrets
- VPS: `/opt/aishacrm/env-backups/pre-doppler-20251208-1729/`

---

## Troubleshooting

### Backend shows wrong port
```bash
# Check Doppler config
doppler secrets get BACKEND_PORT --config dev --plain
# Should be 3001

# Update if wrong
doppler secrets set BACKEND_PORT=3001 --config dev
```

### VPS containers not starting
```bash
# Check if secrets downloaded
ssh andreibyf@147.189.173.237
cd /opt/aishacrm
wc -l .env.from-doppler  # Should be ~198 lines

# Redownload
export DOPPLER_TOKEN=$(cat .doppler-token)
doppler secrets download --config prd_prd --no-file --format env > .env.from-doppler

# Restart
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### GitHub Actions failing
- Check that Doppler integration is active (GitHub repo → Settings → Secrets and variables → Actions)
- Verify 96 secrets are present
- Check workflow logs for specific missing secrets

---

## Next Steps (Optional)

1. **Automate VPS Secret Refresh**
   - Add cron job to pull Doppler secrets hourly
   - Or set up Doppler webhook to trigger deployment on secret change

2. **Team Onboarding**
   - Invite team members to Doppler workspace
   - Grant appropriate environment access (dev read/write, prd read-only)

3. **Staging Environment**
   - Create `stg` config in Doppler
   - Deploy staging VPS with staging secrets

4. **Secret Rotation Policy**
   - Set up quarterly rotation for API keys
   - Document rotation procedures per service

---

## Rollback Plan (Emergency)

If Doppler has issues, you can revert to `.env` files:

```bash
# Local Dev
cp backend/.env.backup backend/.env

# Production VPS
ssh andreibyf@147.189.173.237
cd /opt/aishacrm
cp env-backups/pre-doppler-20251208-1729/.env .env
cp env-backups/pre-doppler-20251208-1729/mcp.env braid-mcp-node-server/.env

# Restore docker-compose.prod.yml
git checkout HEAD -- docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

---

## Support & Resources

- **Doppler Dashboard:** https://dashboard.doppler.com/workplace/projects/aishacrm
- **Doppler Docs:** https://docs.doppler.com
- **GitHub Actions Secrets:** https://github.com/andreibyf/aishacrm-2/settings/secrets/actions
- **Production VPS:** ssh andreibyf@147.189.173.237 (password: andreibyf)

---

**Migration completed successfully on December 8, 2025.**  
**All 5 phases operational. Zero downtime. 198 production secrets + 74 dev secrets managed centrally.**
