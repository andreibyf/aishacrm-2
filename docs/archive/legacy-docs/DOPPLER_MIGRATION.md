# Doppler Migration Guide for AishaCRM

**Complete step-by-step guide to migrate from manual .env management to Doppler**

**Estimated Time:** 2 hours  
**Difficulty:** Easy  
**Cost:** $0/month (Community tier)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 1: Doppler Setup](#phase-1-doppler-setup-30-min)
3. [Phase 2: Local Development](#phase-2-local-development-15-min)
4. [Phase 3: Docker Integration](#phase-3-docker-integration-30-min)
5. [Phase 4: GitHub Actions](#phase-4-github-actions-30-min)
6. [Phase 5: Production Deployment](#phase-5-production-deployment-15-min)
7. [Verification](#verification)
8. [Rollback Plan](#rollback-plan)

---

## Prerequisites

✅ **Before starting:**
- [ ] Backup all .env files:
  ```bash
  cp backend/.env backend/.env.backup
  cp braid-mcp-node-server/.env braid-mcp-node-server/.env.backup
  ```
- [ ] Commit and push all current changes
- [ ] Have production VPS access ready
- [ ] Note: Keep .env files during migration for fallback

---

## Phase 1: Doppler Setup (30 min)

### Step 1.1: Install Doppler CLI

**Windows (PowerShell):**
```powershell
# Using Scoop
scoop install doppler

# Or download installer
# https://docs.doppler.com/docs/install-cli#windows
```

**Verify installation:**
```bash
doppler --version
# Should show: doppler version X.X.X
```

### Step 1.2: Create Doppler Account & Login

```bash
# Login via browser
doppler login

# Or use access token
doppler configure set token dp.ct.xxxx
```

### Step 1.3: Create Project & Environments

```bash
# Initialize project in repo root
cd c:/Users/andre/Documents/GitHub/ai-sha-crm-copy-c872be53
doppler setup

# When prompted:
# Project name: aishacrm
# Config: dev

# Create production environment
doppler environments create production

# List environments
doppler environments
# Output:
# ├── dev (development)
# └── production
```

### Step 1.4: Import Development Secrets

```bash
# Import backend/.env to dev environment
doppler secrets upload backend/.env --project aishacrm --config dev

# Verify import
doppler secrets --config dev
# Should show all your secrets
```

### Step 1.5: Add Production Secrets

**Option A: Via Web UI (Recommended for first time)**
1. Go to https://dashboard.doppler.com
2. Select `aishacrm` → `production`
3. Click "Add Secret"
4. Copy-paste from your production .env file
5. Use "Bulk Add" for faster input

**Option B: Via CLI**
```bash
# Switch to production config
doppler setup --config production

# Set secrets individually
doppler secrets set SUPABASE_URL="https://..." --config production
doppler secrets set SUPABASE_SERVICE_ROLE_KEY="..." --config production
doppler secrets set OPENAI_API_KEY="..." --config production
# ... etc

# Or bulk upload from file
doppler secrets upload /path/to/prod.env --config production
```

### Step 1.6: Add MCP-Specific Secrets

```bash
# In dev config, add MCP secrets
doppler secrets set DEFAULT_TENANT_ID="a11dfb63-4b18-4eb8-872e-747af2e37c46" --config dev
doppler secrets set USE_SUPABASE_PROD="true" --config dev
doppler secrets set DEFAULT_OPENAI_MODEL="gpt-4o" --config dev

# Repeat for production
doppler secrets set DEFAULT_TENANT_ID="a11dfb63-4b18-4eb8-872e-747af2e37c46" --config production
# ... etc
```

### Step 1.7: Use Secret References (DRY)

**In Doppler UI, update frontend variables to reference backend:**

```bash
# Instead of duplicating, reference:
VITE_SUPABASE_URL = ${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY = ${SUPABASE_ANON_KEY}
VITE_SYSTEM_TENANT_ID = ${SYSTEM_TENANT_ID}

# Now changing SUPABASE_URL updates both automatically!
```

---

## Phase 2: Local Development (15 min)

### Step 2.1: Create Doppler Config File

**Create `doppler.yaml` in project root:**

```yaml
# doppler.yaml
setup:
  project: aishacrm
  config: dev
```

**Commit this file to Git** (it's safe, contains no secrets)

### Step 2.2: Update NPM Scripts

**Edit `package.json`:**

```json
{
  "scripts": {
    "dev": "doppler run -- node scripts/copy-docs-to-public.js && doppler run -- vite",
    "dev:backend": "cd backend && doppler run -- node dev-server.js",
    "build": "doppler run -- node scripts/copy-docs-to-public.js && doppler run -- vite build",
    "test:e2e": "doppler run -- playwright test"
  }
}
```

### Step 2.3: Test Local Development

```bash
# Test that secrets are loaded
doppler run -- node -e "console.log('SUPABASE_URL:', process.env.SUPABASE_URL)"
# Should print your Supabase URL

# Start frontend
npm run dev
# Should work exactly as before

# Start backend (separate terminal)
npm run dev:backend
# Should connect to Supabase with secrets from Doppler
```

### Step 2.4: Create Helper Scripts

**Create `scripts/dev-with-doppler.sh`:**

```bash
#!/bin/bash
# Start all services with Doppler

echo "Starting AishaCRM with Doppler..."

# Start backend
cd backend
doppler run -- node dev-server.js &
BACKEND_PID=$!

# Start frontend
cd ..
doppler run -- npm run dev:vite &
FRONTEND_PID=$!

# Start MCP server
cd braid-mcp-node-server
doppler run -- docker compose up &
MCP_PID=$!

echo "Started:"
echo "  Backend PID: $BACKEND_PID"
echo "  Frontend PID: $FRONTEND_PID"
echo "  MCP PID: $MCP_PID"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait and cleanup
trap "kill $BACKEND_PID $FRONTEND_PID $MCP_PID 2>/dev/null" EXIT
wait
```

Make executable:
```bash
chmod +x scripts/dev-with-doppler.sh
```

---

## Phase 3: Docker Integration (30 min)

### Step 3.1: Update Main Docker Compose

**Edit `docker-compose.yml`:**

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    # REMOVE: env_file: - ./backend/.env
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN}
    # Wrap entrypoint with doppler run
    entrypoint: >
      sh -c "
      if [ -z \"$DOPPLER_TOKEN\" ]; then
        echo 'ERROR: DOPPLER_TOKEN not set';
        exit 1;
      fi;
      doppler run --token $DOPPLER_TOKEN --mount /app/.env.doppler -- node server.js
      "
    # ... rest of config

  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    # REMOVE: env_file: - .env
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN}
    entrypoint: >
      sh -c "
      doppler run --token $DOPPLER_TOKEN --mount /app/.env.doppler -- /app/entrypoint.sh
      "
    # ... rest of config
```

### Step 3.2: Update MCP Docker Compose

**Edit `braid-mcp-node-server/docker-compose.yml`:**

```yaml
services:
  braid-mcp-server:
    build: .
    # REMOVE: env_file: - ./.env
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN}
      - NODE_ENV=production
      - MCP_ROLE=server
      - CRM_BACKEND_URL=http://aishacrm-backend:3001
      - REDIS_URL=redis://aishacrm-redis-memory:6379
    entrypoint: >
      sh -c "
      doppler run --token $DOPPLER_TOKEN --mount /app/.env.doppler -- node dist/server.js
      "
    # ... rest of config

  braid-mcp-1:
    # Similar changes
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN}
      - NODE_ENV=production
      - MCP_ROLE=node
      - MCP_NODE_ID=1
      # ... rest
    entrypoint: >
      sh -c "
      doppler run --token $DOPPLER_TOKEN -- node dist/server.js
      "
```

### Step 3.3: Add Doppler to Dockerfiles

**Edit `backend/Dockerfile`:**

```dockerfile
FROM node:22-alpine

# Install Doppler CLI
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler

WORKDIR /app

# ... rest of dockerfile

# Entrypoint will use doppler run
CMD ["node", "server.js"]  # Wrapped by doppler in compose
```

**Edit `Dockerfile` (frontend):**

```dockerfile
FROM node:22-alpine AS builder

# Install Doppler in builder stage
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler

# ... build steps with doppler run if needed

FROM nginx:alpine
# Install Doppler in runtime stage
RUN apk add --no-cache wget && \
    wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler

# ... rest of dockerfile
```

### Step 3.4: Generate Service Tokens

**Create tokens for each environment:**

```bash
# Development token (for local Docker)
doppler configs tokens create docker-dev --config dev --max-age 30d
# Save output: dp.st.dev.xxxxx

# Production token (for production Docker)
doppler configs tokens create docker-prod --config production --max-age 0  # No expiry
# Save output: dp.st.prod.yyyyy
```

### Step 3.5: Test Docker Locally

```bash
# Set dev token
export DOPPLER_TOKEN="dp.st.dev.xxxxx"

# Rebuild and start
docker compose down
docker compose build --no-cache
docker compose up -d

# Check logs
docker logs aishacrm-backend --tail=50
# Should see: "Doppler loaded X secrets"

# Verify secrets
docker exec aishacrm-backend printenv | grep SUPABASE_URL
# Should show your Supabase URL
```

---

## Phase 4: GitHub Actions (30 min)

### Step 4.1: Add Doppler to GitHub Secrets

```bash
# Create service token for CI/CD
doppler configs tokens create github-actions --config production --max-age 0
# Copy the token: dp.st.prod.zzzzz

# Add to GitHub
gh secret set DOPPLER_SERVICE_TOKEN -b "dp.st.prod.zzzzz"
```

**That's it! Just ONE GitHub secret instead of 18!**

### Step 4.2: Update GitHub Workflow

**Edit `.github/workflows/docker-release.yml`:**

```yaml
name: Docker Release (GHCR)

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read
  packages: write

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - service: frontend
            context: .
            dockerfile: Dockerfile
            image: ghcr.io/${{ github.repository }}-frontend
          - service: backend
            context: .
            dockerfile: backend/Dockerfile
            image: ghcr.io/${{ github.repository }}-backend
          - service: proxy
            context: ./nginx-proxy
            dockerfile: nginx-proxy/Dockerfile
            image: ghcr.io/${{ github.repository }}-proxy
          - service: mcp
            context: ./braid-mcp-node-server
            dockerfile: braid-mcp-node-server/Dockerfile
            image: ghcr.io/${{ github.repository }}-mcp
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      # Install Doppler CLI
      - name: Install Doppler CLI
        uses: dopplerhq/cli-action@v3

      # Download secrets as .env for build args (frontend only)
      - name: Download secrets for build
        if: matrix.service == 'frontend'
        run: |
          doppler secrets download --no-file --format docker > .env.build
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_SERVICE_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags, labels)
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ matrix.image }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest

      # Build with DOPPLER_TOKEN as build arg
      - name: Build and push ${{ matrix.service }}
        uses: docker/build-push-action@v5
        with:
          context: ${{ matrix.context }}
          file: ${{ matrix.dockerfile }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            APP_BUILD_VERSION=${{ github.ref_name }}
            DOPPLER_TOKEN=${{ secrets.DOPPLER_SERVICE_TOKEN }}

  deploy-production:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      # Install Doppler
      - name: Install Doppler CLI
        uses: dopplerhq/cli-action@v3

      # Download secrets and deploy
      - name: Deploy Compose File to VPS
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.PROD_VPS_HOST }}
          username: ${{ secrets.PROD_VPS_USER }}
          key: ${{ secrets.PROD_VPS_SSH_KEY }}
          port: ${{ secrets.PROD_VPS_PORT || 22 }}
          source: "docker-compose.prod.yml,nginx-n8n.conf,nginx-proxy/nginx.conf,braid-mcp-node-server/docker-compose.prod.yml"
          target: "/opt/aishacrm/"

      - name: Deploy to Production VPS
        uses: appleboy/ssh-action@v1.0.3
        env:
          VERSION_TAG: ${{ github.ref_name }}
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_SERVICE_TOKEN }}
        with:
          host: ${{ secrets.PROD_VPS_HOST }}
          username: ${{ secrets.PROD_VPS_USER }}
          key: ${{ secrets.PROD_VPS_SSH_KEY }}
          port: ${{ secrets.PROD_VPS_PORT || 22 }}
          envs: VERSION_TAG,DOPPLER_TOKEN
          script: |
            set -e
            cd /opt/aishacrm
            
            # Export Doppler token for docker compose
            export DOPPLER_TOKEN="$DOPPLER_TOKEN"
            
            # Write version
            echo "VITE_APP_BUILD_VERSION=$VERSION_TAG" > .env.version
            
            # Cleanup
            docker compose -f docker-compose.prod.yml down --remove-orphans
            docker container prune -f
            
            # Ensure network
            docker network inspect aishanet >/dev/null 2>&1 || docker network create aishanet
            
            # Pull images
            docker pull ghcr.io/andreibyf/aishacrm-2-frontend:$VERSION_TAG
            docker pull ghcr.io/andreibyf/aishacrm-2-backend:$VERSION_TAG
            docker pull ghcr.io/andreibyf/aishacrm-2-proxy:$VERSION_TAG
            docker pull ghcr.io/andreibyf/aishacrm-2-mcp:$VERSION_TAG
            
            # Tag as latest
            docker tag ghcr.io/andreibyf/aishacrm-2-frontend:$VERSION_TAG ghcr.io/andreibyf/aishacrm-2-frontend:latest
            docker tag ghcr.io/andreibyf/aishacrm-2-backend:$VERSION_TAG ghcr.io/andreibyf/aishacrm-2-backend:latest
            docker tag ghcr.io/andreibyf/aishacrm-2-proxy:$VERSION_TAG ghcr.io/andreibyf/aishacrm-2-proxy:latest
            docker tag ghcr.io/andreibyf/aishacrm-2-mcp:$VERSION_TAG ghcr.io/andreibyf/aishacrm-2-mcp:latest
            
            # Start main services
            docker compose -f docker-compose.prod.yml up -d --force-recreate proxy frontend backend
            
            # Deploy MCP
            cd /opt/aishacrm/braid-mcp-node-server
            docker compose -f docker-compose.prod.yml down --remove-orphans
            docker compose -f docker-compose.prod.yml up -d --force-recreate
            
            echo "Deployment completed: $VERSION_TAG"
```

### Step 4.3: Remove Old Secrets from GitHub

```bash
# List current secrets
gh secret list

# Delete all individual secrets (keep only DOPPLER_SERVICE_TOKEN and VPS creds)
gh secret delete OPENAI_API_KEY
gh secret delete ANTHROPIC_API_KEY
gh secret delete GROQ_API_KEY
gh secret delete SUPABASE_URL
gh secret delete VITE_SUPABASE_URL
gh secret delete VITE_SUPABASE_ANON_KEY
gh secret delete VITE_AISHACRM_BACKEND_URL
gh secret delete VITE_SYSTEM_TENANT_ID
# ... delete all except:
# - DOPPLER_SERVICE_TOKEN (new)
# - PROD_VPS_HOST
# - PROD_VPS_USER  
# - PROD_VPS_SSH_KEY
```

---

## Phase 5: Production VPS Integration (15 min)

**IMPORTANT:** Your production stack is already running on VPS at `/opt/aishacrm`. This phase integrates Doppler without disrupting the running services.

### Step 5.1: Connect to Production VPS

```bash
# SSH to beige-koala-18294 (your production VPS)
ssh user@your-vps-ip

# Verify current stack is running
cd /opt/aishacrm
docker ps --filter "name=aishacrm"
# Should show: frontend, backend, redis-memory, redis-cache, proxy, etc.

# Check current .env file location
ls -la .env
ls -la braid-mcp-node-server/.env
```

### Step 5.2: Install Doppler CLI on VPS

```bash
# Install Doppler (Debian/Ubuntu)
sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates curl gnupg
curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | sudo gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/doppler-cli.list
sudo apt-get update && sudo apt-get install doppler

# Verify installation
doppler --version
# Should show: doppler version X.X.X
```

### Step 5.3: Import Current Production Secrets to Doppler

**Do this BEFORE modifying anything on VPS:**

```bash
# On your LOCAL machine (not VPS), import production secrets
# First, get current production .env content (via SSH or secure transfer)

# Option A: Copy from VPS to local
scp user@vps:/opt/aishacrm/.env ./prod.env.backup
scp user@vps:/opt/aishacrm/braid-mcp-node-server/.env ./prod-mcp.env.backup

# Option B: SSH and cat the file, save manually
ssh user@vps "cat /opt/aishacrm/.env" > prod.env.backup

# Import to Doppler production config
doppler secrets upload prod.env.backup --config production --project aishacrm

# Verify all secrets imported
doppler secrets --config production | grep -E "SUPABASE_URL|OPENAI_API_KEY|GITHUB_TOKEN"
# Should show your production values
```

### Step 5.4: Configure Doppler Token on VPS

**Back on VPS:**

```bash
cd /opt/aishacrm

# Create .doppler-token file with your production service token
echo "dp.st.prod.yyyyy" > .doppler-token

# Secure the token file (IMPORTANT)
chmod 600 .doppler-token
sudo chown $(whoami):$(whoami) .doppler-token

# Test that token works
export DOPPLER_TOKEN=$(cat .doppler-token)
doppler secrets --token $DOPPLER_TOKEN | head -10
# Should list your production secrets
```

### Step 5.5: Backup Current VPS Environment

**CRITICAL: Create rollback point before any changes:**

```bash
# Create backup directory
mkdir -p /opt/aishacrm/env-backups/pre-doppler-$(date +%Y%m%d-%H%M)

# Backup all .env files
cp .env env-backups/pre-doppler-$(date +%Y%m%d-%H%M)/.env
cp braid-mcp-node-server/.env env-backups/pre-doppler-$(date +%Y%m%d-%H%M)/mcp.env

# Backup compose files
cp docker-compose.prod.yml env-backups/pre-doppler-$(date +%Y%m%d-%H%M)/
cp braid-mcp-node-server/docker-compose.prod.yml env-backups/pre-doppler-$(date +%Y%m%d-%H%M)/

# Verify backups
ls -lh env-backups/pre-doppler-$(date +%Y%m%d-%H%M)/
```

### Step 5.6: Deploy Updated Compose Files

**The GitHub Actions workflow (Phase 4) will automatically deploy updated compose files.**  
**For manual deployment or testing:**

```bash
# Push updated docker-compose.prod.yml from local to VPS
# (This happens automatically via GitHub Actions, but for manual testing:)

# On LOCAL machine:
scp docker-compose.prod.yml user@vps:/opt/aishacrm/
scp braid-mcp-node-server/docker-compose.prod.yml user@vps:/opt/aishacrm/braid-mcp-node-server/

# Or let GitHub Actions handle it on next deployment
```

### Step 5.7: Gradual Production Cutover (ZERO DOWNTIME)

**Test Doppler WITHOUT stopping production:**

```bash
# On VPS, test that Doppler can provide secrets
cd /opt/aishacrm
export DOPPLER_TOKEN=$(cat .doppler-token)

# Test secret retrieval
doppler run --token $DOPPLER_TOKEN -- node -e "console.log('SUPABASE_URL:', process.env.SUPABASE_URL)" 2>/dev/null | grep SUPABASE_URL
# Should show: SUPABASE_URL: https://efzqxjpfewkrgpdootte.supabase.co

# If successful, proceed with cutover
```

**Cutover Plan (choose your approach):**

**Option A: Wait for Next GitHub Actions Deployment (Recommended)**
- Updated workflow will automatically use Doppler
- Next `git push origin v2.2.15` triggers full deployment
- Zero manual intervention needed
- Safest approach

**Option B: Manual Cutover (Immediate)**
```bash
# On VPS:
cd /opt/aishacrm

# Stop services gracefully
docker compose -f docker-compose.prod.yml down

# Remove old .env (Doppler will provide values)
mv .env .env.OLD  # Keep as backup, don't delete yet
mv braid-mcp-node-server/.env braid-mcp-node-server/.env.OLD

# Deploy updated compose file (with DOPPLER_TOKEN)
# (Ensure docker-compose.prod.yml was updated in Phase 3)

# Set token for docker compose
export DOPPLER_TOKEN=$(cat .doppler-token)

# Start with Doppler
docker compose -f docker-compose.prod.yml up -d

# Watch logs
docker logs aishacrm-backend --tail=50 -f
# Should NOT see any "missing environment variable" errors

# Verify health
curl http://localhost:4001/api/health
# Should return: {"status":"ok"}
```

### Step 5.8: Verify Production with Doppler

```bash
# Check all containers running
docker ps --filter "name=aishacrm"
# All should be "Up"

# Verify secrets loaded (check one from each container)
docker exec aishacrm-backend printenv | grep OPENAI_API_KEY | head -c 30
# Should show: OPENAI_API_KEY=sk-...

docker exec braid-mcp-node-server printenv | grep GITHUB_TOKEN | head -c 40
# Should show: GITHUB_TOKEN=github_pat_...

# Test backend API
curl http://localhost:4001/api/system/health
# Should return full health check with database, redis, etc.

# Test MCP
curl http://localhost:8000/health
# Should return MCP health status

# Check external access (if public)
curl https://your-domain.com/api/health
```

### Step 5.9: Monitor for Issues (First 24 Hours)

```bash
# Watch logs continuously
docker logs aishacrm-backend -f --since 5m | grep -i "error\|warn\|missing"

# Check container restarts
docker ps --filter "name=aishacrm" --format "{{.Names}}\t{{.Status}}"
# All should show "Up X minutes/hours" (not "Restarting")

# If any issues, immediate rollback:
docker compose -f docker-compose.prod.yml down
mv .env.OLD .env
mv braid-mcp-node-server/.env.OLD braid-mcp-node-server/.env
docker compose -f docker-compose.prod.yml up -d
```

---

## Verification

### Local Development Check

```bash
cd c:/Users/andre/Documents/GitHub/ai-sha-crm-copy-c872be53

# Verify Doppler loads secrets
doppler run -- node -e "console.log('Keys loaded:', Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('OPENAI')).length)"
# Should show: Keys loaded: 5+

# Start frontend
npm run dev
# Open http://localhost:4000
# Should work exactly as before

# Start backend
npm run dev:backend
# Should connect to Supabase
```

### Docker Check

```bash
# Local Docker
export DOPPLER_TOKEN="dp.st.dev.xxxxx"
docker compose up -d
docker logs aishacrm-backend --tail=20 | grep -i "supabase\|openai\|doppler"
# Should show connections working

# Test API
curl http://localhost:4001/api/health
# Should return: {"status":"ok"}
```

### Production VPS Check

```bash
# SSH to beige-koala-18294
ssh user@your-vps-ip

# Check all aishacrm containers
docker ps --filter "name=aishacrm"
# Should show: frontend, backend, redis-memory, redis-cache, proxy, braid-mcp-*
# All should be "Up"

# Verify Doppler token is set
cd /opt/aishacrm
cat .doppler-token | head -c 20
# Should show: dp.st.prod...

# Test backend health
curl http://localhost:4001/api/health
# Should return: {"status":"ok"}

# Test backend system health (full diagnostics)
curl http://localhost:4001/api/system/health
# Should return: database, redis, mcp status

# Check MCP cluster
curl http://localhost:8000/health
# Should return MCP health status

# Verify secrets are loaded
docker exec aishacrm-backend printenv | grep -c "SUPABASE\|OPENAI\|GITHUB"
# Should show: 10+ (multiple secret variables)

# Test external access (if applicable)
curl https://your-domain.com/api/health
```

### GitHub Actions Check

```bash
# Create test tag
git tag v2.2.15-doppler-test
git push origin v2.2.15-doppler-test

# Watch workflow
gh run watch

# Should complete successfully
# Check production after ~10 minutes
```

---

## Rollback Plan

**If something goes wrong, quick rollback:**

### Rollback Local Development

```bash
# Stop using Doppler
# Edit package.json, remove "doppler run --"

# Use old .env files
git checkout package.json

# Restore backups
cp backend/.env.backup backend/.env
cp braid-mcp-node-server/.env.backup braid-mcp-node-server/.env

# Start normally
npm run dev
```

### Rollback Docker

```bash
# Local:
export DOPPLER_TOKEN=""
git checkout docker-compose.yml
docker compose down
docker compose up -d

# Production VPS (SSH to beige-koala-18294):
cd /opt/aishacrm

# Find most recent backup
ls -lt env-backups/

# Restore .env files
cp env-backups/pre-doppler-YYYYMMDD-HHMM/.env .env
cp env-backups/pre-doppler-YYYYMMDD-HHMM/mcp.env braid-mcp-node-server/.env

# Restore compose files
cp env-backups/pre-doppler-YYYYMMDD-HHMM/docker-compose.prod.yml .

# Restart services
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# Verify services running
docker ps --filter "name=aishacrm"
curl http://localhost:4001/api/health
```

### Rollback GitHub Actions

```bash
# Restore old workflow
git checkout .github/workflows/docker-release.yml

# Re-add secrets
gh secret set OPENAI_API_KEY -b "..."
# ... etc

# Push
git push origin main
```

---

## Post-Migration Checklist

After successful migration:

- [ ] Local dev working with `npm run dev`
- [ ] Docker containers starting with secrets
- [ ] GitHub Actions deploying successfully
- [ ] Production running with Doppler
- [ ] All services healthy (frontend, backend, MCP)
- [ ] No errors in logs
- [ ] Can add new secrets via Doppler UI
- [ ] Team members can access Doppler (invite via UI)

**Then:**
- [ ] Delete old .env files from repo (keep .env.example)
- [ ] Update README with Doppler instructions
- [ ] Delete old GitHub secrets (except VPS creds)
- [ ] Celebrate! 🎉

---

## Troubleshooting

### "Doppler token is invalid"

```bash
# Regenerate token
doppler configs tokens create new-token --config dev

# Update environment
export DOPPLER_TOKEN="dp.st.dev.xxxxx"
```

### "Secrets not loading in Docker"

```bash
# Check DOPPLER_TOKEN is set
docker exec aishacrm-backend printenv | grep DOPPLER_TOKEN

# Check Doppler installed
docker exec aishacrm-backend which doppler

# Manually test
docker exec aishacrm-backend doppler run -- env | grep OPENAI_API_KEY
```

### "Build fails with 'DOPPLER_TOKEN not found'"

In GitHub Actions, ensure:
```yaml
env:
  DOPPLER_TOKEN: ${{ secrets.DOPPLER_SERVICE_TOKEN }}
```

### "Can't access secrets in production"

```bash
# SSH to beige-koala-18294
cd /opt/aishacrm

# Verify token file exists and has correct permissions
ls -l .doppler-token
# Should show: -rw------- (600 permissions)

cat .doppler-token | head -c 20
# Should show: dp.st.prod...

# Test manually
export DOPPLER_TOKEN=$(cat .doppler-token)
doppler secrets --token $DOPPLER_TOKEN | head
# Should list secrets

# If still failing, regenerate token and update
# On LOCAL machine:
doppler configs tokens create vps-prod --config production --max-age 0
# Copy new token to VPS .doppler-token file
```

---

## Support

**Doppler Documentation:** https://docs.doppler.com  
**Community:** https://community.doppler.com  
**Status:** https://status.doppler.com

**Emergency Support:**
- Keep .env.backup files for 30 days
- Doppler has 90-day secret history (can restore deleted secrets)
- Contact: support@doppler.com

---

## Summary

### What Changed:

**Before:**
- 3 .env files to manually sync
- 18 GitHub secrets to manage
- Copy-paste errors common
- No audit trail
- SSH to production for updates

**After:**
- 1 source of truth (Doppler)
- 1 GitHub secret (DOPPLER_SERVICE_TOKEN)
- No copy-paste (automatic sync)
- Full audit trail
- Update via Doppler UI/CLI

### Time Savings:

- **Per deployment:** 13 minutes saved
- **Per month:** ~50 minutes saved
- **Per year:** ~10 hours saved
- **Mental overhead:** Significantly reduced

### Cost:

- **Doppler Community:** $0/month
- **Migration time:** 2 hours (one-time)
- **ROI:** Positive after ~2 weeks

**You're now ready for professional-grade secrets management!** 🚀
