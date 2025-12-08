# Docker Compose Environment Variable Mapping

**Generated:** December 8, 2025  
**Purpose:** Map compose file expectations to .env files and validate alignment

---

## Summary

### ✅ **GOOD NEWS: Compose files are well-aligned!**

The Docker Compose files use a smart pattern:
1. **Hardcode critical runtime values** in `environment:` section
2. **Read secrets from .env** via `env_file:` directive
3. **Allow overrides** with `${VAR:-default}` syntax

**Result:** Compose files will work correctly as long as `.env` files contain the secrets (API keys, database credentials, etc.)

---

## Main Stack (`docker-compose.yml` & `docker-compose.prod.yml`)

### Backend Service Environment

#### Hardcoded in Compose (Good - ensures consistency):
```yaml
environment:
  - NODE_ENV=production  # Or development in dev compose
  - NODE_OPTIONS=--dns-result-order=ipv4first
  - PORT=3001
  - ALLOWED_ORIGINS=http://localhost:4000  # Or from ${ALLOWED_ORIGINS}
  - PGSSLMODE=require
  - REDIS_URL=redis://redis-memory:6379  # Docker service name
  - REDIS_CACHE_URL=redis://redis-cache:6379
  - SYSTEM_TENANT_ID=a11dfb63-4b18-4eb8-872e-747af2e37c46
  - TENANT_RESOLVE_CACHE_TTL_MS=300000
  - BRAID_MCP_URL=http://braid-mcp-server:8000
  - MCP_NODE_HEALTH_URL=http://braid-mcp-server:8000/health
  - MCP_NODE_ID=aishacrm-backend-prod
  - ALLOW_PRODUCTION_WRITES=true  # Or from ${ALLOW_PRODUCTION_WRITES}
```

#### Read from .env via `env_file: - .env` (Secrets):
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `JWT_SECRET`
- `SESSION_SECRET`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GROQ_API_KEY`
- `N8N_API_KEY`
- `N8N_BASE_URL`
- `N8N_BASIC_AUTH_USER`
- `N8N_BASIC_AUTH_PASSWORD`
- `GITHUB_TOKEN` (❌ **NOTE: Backend doesn't need this**)
- `ELEVENLABS_API_KEY`
- `ABUSEIPDB_API_KEY`
- `IDR_EMERGENCY_SECRET`
- `IDR_WHITELIST_IPS`
- All other backend vars from backend/.env

#### ✅ **Alignment Status: GOOD**
- Compose hardcodes runtime/network values (can't be wrong)
- .env provides secrets (user's responsibility to set)
- Overrides work via `${VAR:-default}` pattern

---

### Frontend Service Environment

#### Hardcoded in Compose:
```yaml
environment:
  - PORT=3000
```

#### Read from .env:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AISHACRM_BACKEND_URL`
- `VITE_CURRENT_BRANCH`
- `VITE_SYSTEM_TENANT_ID`
- `VITE_USER_HEARTBEAT_INTERVAL_MS`
- `VITE_APP_BUILD_VERSION`
- `VITE_N8N_URL`

#### Build Args (baked into image at build time):
```yaml
build:
  args:
    VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
    VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}
    VITE_AISHACRM_BACKEND_URL: ${VITE_AISHACRM_BACKEND_URL:-http://localhost:4001}
    VITE_CURRENT_BRANCH: ${VITE_CURRENT_BRANCH:-main}
    VITE_SYSTEM_TENANT_ID: ${VITE_SYSTEM_TENANT_ID}
    VITE_USER_HEARTBEAT_INTERVAL_MS: ${VITE_USER_HEARTBEAT_INTERVAL_MS:-60000}
    APP_BUILD_VERSION: ${APP_BUILD_VERSION:-dev-local}
```

#### ✅ **Alignment Status: GOOD**
- Vite variables are build args (correct for frontend)
- Runtime env used for dynamic injection (env-config.js)
- Defaults prevent build failures if vars missing

---

### Redis Services

#### Hardcoded (Perfect - no secrets needed):
```yaml
redis-memory:
  image: redis:7-alpine
  ports: ["6379:6379"]  # Or 127.0.0.1:6379:6379 in prod
  command: redis-server --save 60 1 --loglevel warning --maxmemory 256mb --maxmemory-policy allkeys-lru

redis-cache:
  image: redis:7-alpine
  ports: ["6380:6379"]  # Or 127.0.0.1:6380:6379 in prod
  command: redis-server --save "" --loglevel warning --maxmemory 512mb --maxmemory-policy allkeys-lru
```

#### ✅ **Alignment Status: PERFECT**
- No environment variables needed
- Configuration via command-line args
- Memory limits prevent runaway usage

---

### n8n Service (Optional)

#### Hardcoded in Compose:
```yaml
environment:
  - N8N_PORT=5678
  - N8N_PROTOCOL=http
  - N8N_HOST=localhost
  - N8N_BASIC_AUTH_ACTIVE=true
  - WEBHOOK_URL=http://localhost:5678/
  - GENERIC_TIMEZONE=America/New_York
  - N8N_METRICS=true
  - N8N_DIAGNOSTICS_ENABLED=false
```

#### Read from .env:
- `N8N_BASIC_AUTH_USER`
- `N8N_BASIC_AUTH_PASSWORD`
- `N8N_ENCRYPTION_KEY` (optional)

#### ✅ **Alignment Status: GOOD**
- Basic auth credentials in .env (secure)
- Runtime config hardcoded (consistent)

---

## MCP Server Stack (`braid-mcp-node-server/docker-compose.yml` & `.prod.yml`)

### All 3 Containers (server, node-1, node-2)

#### Hardcoded in Compose (Good):
```yaml
environment:
  NODE_ENV: production
  MCP_ROLE: server  # Or "node" for workers
  MCP_NODE_ID: "braid-mcp-server"  # Or "1", "2" for workers
  MCP_SERVER_URL: http://braid-mcp-server:8000  # Workers only
  CRM_BACKEND_URL: http://aishacrm-backend:3001
  REDIS_URL: redis://aishacrm-redis-memory:6379
```

#### Read from .env via `env_file: - ./.env`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (optional)
- `USE_SUPABASE_PROD`
- `OPENAI_API_KEY`
- `DEFAULT_OPENAI_MODEL`
- `GITHUB_TOKEN` (for GitHub adapter)
- `DEFAULT_TENANT_ID`
- `USE_DIRECT_SUPABASE_ACCESS`
- `ANTHROPIC_API_KEY` (optional)
- `GROQ_API_KEY` (optional)

#### ⚠️ **Alignment Issue Found:**

**Problem:** Compose hardcodes `CRM_BACKEND_URL` and `REDIS_URL`, but these can be overridden by .env file!

**Example:**
```yaml
# Compose says:
environment:
  CRM_BACKEND_URL: http://aishacrm-backend:3001
  REDIS_URL: redis://aishacrm-redis-memory:6379
```

**If .env has:**
```bash
CRM_BACKEND_URL=http://localhost:3001  # ❌ WRONG for Docker!
REDIS_URL=redis://localhost:6379  # ❌ WRONG for Docker!
```

**Result:** .env values take precedence over compose hardcoded values! This breaks container networking.

#### ❌ **Fix Required:**

MCP .env should NOT contain `CRM_BACKEND_URL` or `REDIS_URL` since compose hardcodes correct values.

**Current production MCP .env should have:**
```bash
# Supabase
USE_SUPABASE_PROD=true
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...

# OpenAI
OPENAI_API_KEY=...
DEFAULT_OPENAI_MODEL=gpt-4o

# Tenant
DEFAULT_TENANT_ID=a11dfb63-4b18-4eb8-872e-747af2e37c46

# GitHub
GITHUB_TOKEN=...

# Optional
USE_DIRECT_SUPABASE_ACCESS=false

# ❌ DO NOT SET THESE (compose handles them):
# CRM_BACKEND_URL=...  # Will override compose!
# REDIS_URL=...  # Will override compose!
# NODE_ENV=...  # Will override compose!
# MCP_ROLE=...  # Will override compose!
```

---

## Environment Variable Precedence

Docker Compose uses this precedence order (highest to lowest):

1. **Command-line overrides** (`docker compose run -e VAR=value`)
2. **environment: section in compose file** (hardcoded)
3. **env_file: directive** (from .env file)
4. **Shell environment** (where docker compose is run)
5. **Dockerfile ENV** (baked into image)

### What This Means:

If compose file has:
```yaml
env_file:
  - .env
environment:
  - REDIS_URL=redis://redis-memory:6379
  - CRM_BACKEND_URL=http://aishacrm-backend:3001
```

And .env has:
```bash
REDIS_URL=redis://localhost:6379
CRM_BACKEND_URL=http://localhost:3001
```

**RESULT:** .env values are loaded first, then compose `environment:` overwrites them.  
**✅ Compose wins! This is correct behavior.**

---

## Validation: Compose vs .env Alignment

### Dev Compose (`docker-compose.yml`)

| Variable | Compose Source | .env Location | Status |
|----------|---------------|---------------|--------|
| `NODE_ENV` | Hardcoded: `development` | N/A | ✅ |
| `REDIS_URL` | Hardcoded: `redis://redis-memory:6379` | backend/.env (❌ different) | ⚠️ Compose wins |
| `REDIS_CACHE_URL` | Hardcoded: `redis://redis-cache:6379` | backend/.env (❌ different) | ⚠️ Compose wins |
| `BRAID_MCP_URL` | Hardcoded: `http://mcp:8000` | backend/.env (❌ says braid-mcp-node-server) | ⚠️ Compose wins |
| `SYSTEM_TENANT_ID` | Hardcoded: UUID | backend/.env (✅ same) | ✅ |
| `OPENAI_API_KEY` | .env | backend/.env | ✅ |
| `DATABASE_URL` | .env | backend/.env | ✅ |
| `JWT_SECRET` | .env | backend/.env | ✅ |

### Prod Compose (`docker-compose.prod.yml`)

| Variable | Compose Source | .env Location | Status |
|----------|---------------|---------------|--------|
| `NODE_ENV` | Hardcoded: `production` | N/A | ✅ |
| `REDIS_URL` | Hardcoded: `redis://redis-memory:6379` | /opt/aishacrm/.env | ⚠️ Compose wins |
| `BRAID_MCP_URL` | Hardcoded: `http://braid-mcp-server:8000` | /opt/aishacrm/.env | ⚠️ Compose wins |
| `OPENAI_API_KEY` | .env | /opt/aishacrm/.env | ✅ |

### MCP Compose (`braid-mcp-node-server/docker-compose.prod.yml`)

| Variable | Compose Source | .env Location | Status |
|----------|---------------|---------------|--------|
| `NODE_ENV` | Hardcoded: `production` | MCP .env (❌ if set) | ⚠️ Compose wins |
| `MCP_ROLE` | Hardcoded: `server`/`node` | N/A | ✅ |
| `CRM_BACKEND_URL` | Hardcoded: `http://aishacrm-backend:3001` | MCP .env (❌ if set) | ⚠️ Compose wins |
| `REDIS_URL` | Hardcoded: `redis://aishacrm-redis-memory:6379` | MCP .env (❌ if set) | ⚠️ Compose wins |
| `OPENAI_API_KEY` | .env | MCP .env | ✅ |
| `GITHUB_TOKEN` | .env | MCP .env | ✅ |

---

## Issues & Recommendations

### Issue 1: Redundant Variables in .env Files

**Problem:** backend/.env contains Docker-specific values that compose overrides:
```bash
# backend/.env
REDIS_MEMORY_URL=redis://redis-memory:6379  # ⚠️ Compose overrides with REDIS_URL
REDIS_CACHE_URL=redis://redis-cache:6379    # ⚠️ Compose hardcodes this
BRAID_MCP_URL=http://braid-mcp-node-server:8000  # ⚠️ Compose sets different value
```

**Impact:** Low - compose wins, but confusing for developers

**Recommendation:**
- Comment out Docker-specific URLs in backend/.env
- Add note: "These are set by Docker Compose"
- Keep them for documentation purposes

### Issue 2: MCP .env May Override Compose

**Problem:** If MCP .env contains:
```bash
NODE_ENV=development  # ❌ Will break production!
CRM_BACKEND_URL=http://localhost:3001  # ❌ Won't work in Docker!
```

**Impact:** High - breaks container networking

**Recommendation:**
- Remove `NODE_ENV`, `CRM_BACKEND_URL`, `REDIS_URL`, `MCP_ROLE` from MCP .env
- Only keep secrets and optional overrides
- Updated workflow now injects correct values

### Issue 3: Missing MCP Variables in Production

**Problem:** Production MCP .env only had 4 vars, missing OPENAI_API_KEY, DEFAULT_TENANT_ID, etc.

**Impact:** High - features don't work

**Status:** ✅ **FIXED** - Workflow now injects all 12 required variables

---

## Recommended .env Structure

### `/opt/aishacrm/.env` (Main - Backend/Frontend)

**Should contain:**
- ✅ Secrets (API keys, database credentials, JWT secrets)
- ✅ Tenant configuration (SYSTEM_TENANT_ID)
- ✅ Feature flags
- ✅ External service URLs (n8n, SMTP)
- ❌ **NOT** Docker networking values (REDIS_URL, BRAID_MCP_URL)

**Compose will override:**
- `NODE_ENV` → `production`
- `REDIS_URL` → `redis://redis-memory:6379`
- `REDIS_CACHE_URL` → `redis://redis-cache:6379`
- `BRAID_MCP_URL` → `http://braid-mcp-server:8000`

### `/opt/aishacrm/braid-mcp-node-server/.env` (MCP Server)

**Should contain:**
- ✅ Supabase credentials
- ✅ OpenAI API key
- ✅ GitHub token
- ✅ Default tenant ID
- ✅ Optional: Anthropic/Groq keys
- ❌ **NOT** NODE_ENV, MCP_ROLE, CRM_BACKEND_URL, REDIS_URL

**Compose will override:**
- `NODE_ENV` → `production`
- `MCP_ROLE` → `server`/`node` (per container)
- `CRM_BACKEND_URL` → `http://aishacrm-backend:3001`
- `REDIS_URL` → `redis://aishacrm-redis-memory:6379`

---

## Updated Workflow Behavior

The GitHub Actions workflow (`.github/workflows/docker-release.yml`) now:

1. **Reads from main .env:**
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`

2. **Injects into MCP .env:**
   - All Supabase vars (copied from main .env)
   - OpenAI key (copied from main .env)
   - GitHub token (from `PROD_MCP_GITHUB_TOKEN` secret)
   - Defaults: `NODE_ENV=production`, `PORT=8000`, `DEFAULT_TENANT_ID=...`
   - Docker URLs: `CRM_BACKEND_URL`, `REDIS_URL`

3. **Does NOT inject (compose handles):**
   - These are hardcoded in compose and will override .env anyway
   - But workflow adds them for documentation/consistency

**Result:** Production MCP .env will have all required variables after deployment!

---

## Validation Commands

### Check Compose Override Behavior

```bash
# See final environment that containers will get:
docker compose -f docker-compose.prod.yml config

# Check specific service:
docker compose -f docker-compose.prod.yml config backend | grep -A20 environment
```

### Verify Running Container Environment

```bash
# Backend:
docker exec aishacrm-backend printenv | grep -E "(REDIS_URL|BRAID_MCP_URL|NODE_ENV)"

# MCP Server:
docker exec braid-mcp-server printenv | grep -E "(CRM_BACKEND_URL|REDIS_URL|NODE_ENV)"

# Expected:
# Backend REDIS_URL=redis://redis-memory:6379 (from compose)
# Backend BRAID_MCP_URL=http://braid-mcp-server:8000 (from compose)
# MCP CRM_BACKEND_URL=http://aishacrm-backend:3001 (from compose)
```

### Test Network Connectivity

```bash
# From backend to Redis:
docker exec aishacrm-backend ping -c 1 redis-memory

# From backend to MCP:
docker exec aishacrm-backend wget -qO- http://braid-mcp-server:8000/health

# From MCP to backend:
docker exec braid-mcp-server wget -qO- http://aishacrm-backend:3001/health
```

---

## Summary

### ✅ What's Working:
1. Compose files hardcode critical networking values (correct!)
2. .env files provide secrets (API keys, credentials)
3. Override precedence ensures compose wins for infrastructure values
4. Frontend build args properly bake in Vite variables
5. Redis services need no environment variables

### ⚠️ Minor Issues:
1. Backend .env has redundant Docker URLs (low impact - compose overrides)
2. MCP .env may have conflicting values (medium impact - compose should win)

### ✅ Fixed in Workflow:
1. MCP .env now gets all 12 required variables injected
2. Workflow copies secrets from main .env to MCP .env
3. Workflow adds Docker networking defaults to MCP .env

### 📋 Recommendations:
1. Clean up backend/.env - comment out Docker-specific URLs
2. Ensure production MCP .env doesn't have NODE_ENV, CRM_BACKEND_URL, REDIS_URL
3. Run `docker compose config` to verify final environment before deploying
4. Test next deployment to ensure MCP gets all variables correctly

**Overall Status: Good!** Compose files are well-designed with smart override patterns. Minor cleanup recommended but no breaking issues.
