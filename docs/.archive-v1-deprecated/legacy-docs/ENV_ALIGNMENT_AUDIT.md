# Environment Variable Alignment Audit

**Generated:** December 8, 2025  
**Purpose:** Identify misalignment between code, Git secrets, and production .env files

## Executive Summary

### Critical Issues Found:
1. ❌ **GITHUB_TOKEN in wrong location** - Backend .env has it but MCP server needs it
2. ⚠️ **Missing Git Secret** - No `SUPABASE_SERVICE_ROLE_KEY` in GitHub secrets
3. ⚠️ **Production injection risk** - Workflow doesn't inject most vars into production .env
4. ❌ **MCP .env not synced** - Production MCP .env only has 4 vars, code expects ~15+

---

## Production Environment Files

### `/opt/aishacrm/.env` (Main frontend/backend)
**Contains 93 variables:**
- Database: `DATABASE_URL`, `USE_SUPABASE_PROD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- Auth: `JWT_SECRET`, `SESSION_SECRET`, `SYSTEM_TENANT_ID`
- Redis: `REDIS_MEMORY_URL`, `REDIS_CACHE_URL`
- AI/LLM: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `LLM_PROVIDER`, `MODEL_*`
- Workers: `CAMPAIGN_WORKER_ENABLED`, `AI_TRIGGERS_WORKER_ENABLED`
- Security: `IDR_*`, `RATE_LIMIT_*`, `ABUSEIPDB_API_KEY`
- n8n: `N8N_BASE_URL`, `N8N_API_KEY`, `N8N_BASIC_AUTH_*`
- Voice: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
- GitHub: `GITHUB_TOKEN` (❌ **WRONG - should be in MCP .env**)
- MCP: `BRAID_MCP_URL`, `USE_BRAID_MCP_TRANSCRIPT_ANALYSIS`
- Frontend: `VITE_*` vars (13 total)

### `/opt/aishacrm/braid-mcp-node-server/.env` (MCP server)
**Contains ONLY 4 variables:**
- ✅ `USE_SUPABASE_PROD`
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `GITHUB_TOKEN` (just added)

**❌ MISSING CRITICAL VARS:**
- `REDIS_URL` - Used by memory.ts (line 10)
- `OPENAI_API_KEY` - Used by supabase.ts (line 91-92)
- `DEFAULT_OPENAI_MODEL` - Used by llm.ts (line 91)
- `CRM_BACKEND_URL` or `BACKEND_URL` - Used by crm.ts (line 23-24)
- `DEFAULT_TENANT_ID` - Used by crm.ts (line 37)
- `USE_DIRECT_SUPABASE_ACCESS` - Used by crm.ts (line 374)
- `NODE_ENV` - Standard Node.js var
- `PORT` - Used by server.ts (line 131)

---

## GitHub Secrets Inventory

### Available Secrets (18 total):
1. ✅ `ANTHROPIC_API_KEY` - AI provider key
2. ✅ `ANTHROPIC_BASE_URL` - Typo: should be `ANTHROPIC_BASE_URL`
3. ✅ `ANTHROPIC_VERSION` - API version
4. ✅ `GROQ_API_KEY` - Fast inference provider
5. ✅ `GROQ_MODEL_JSON_STRICT` - Model override
6. ✅ `INTERNAL_AI_TEST_KEY` - Test API key
7. ✅ `OPENAI_API_KEY` - Primary AI provider
8. ✅ `PROD_MCP_GITHUB_TOKEN` - GitHub token for MCP (just added)
9. ✅ `PROD_VPS_HOST` - Deployment target
10. ✅ `PROD_VPS_SSH_KEY` - SSH credentials
11. ✅ `PROD_VPS_USER` - SSH user
12. ✅ `SUPABASE_URL` - Database URL
13. ✅ `SUPERADMIN_EMAIL` - Admin account
14. ✅ `SUPERADMIN_PASSWORD` - Admin password
15. ✅ `VITE_AISHACRM_BACKEND_URL` - Frontend API endpoint
16. ✅ `VITE_CURRENT_BRANCH` - Git branch info
17. ✅ `VITE_SUPABASE_ANON_KEY` - Public Supabase key
18. ✅ `VITE_SUPABASE_URL` - Frontend database URL
19. ✅ `VITE_SYSTEM_TENANT_ID` - System tenant UUID

### ❌ Missing Critical Secrets:
- `SUPABASE_SERVICE_ROLE_KEY` - **CRITICAL** - Required by backend and MCP
- `JWT_SECRET` - **CRITICAL** - Required for auth
- `SESSION_SECRET` - **CRITICAL** - Required for sessions
- `SYSTEM_TENANT_ID` - Backend needs this (different from VITE_ version)
- `N8N_API_KEY` - Workflow automation
- `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD` - n8n auth
- `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` - Voice features
- `ABUSEIPDB_API_KEY` - Threat intel
- `IDR_EMERGENCY_SECRET` - Security unlock
- `REDIS_MEMORY_URL` / `REDIS_CACHE_URL` - Cache layer
- `DATABASE_URL` - Direct Postgres connection
- `SMTP_*` - Email sending (if used)

---

## Code Usage Analysis

### Backend (`backend/server.js` + routes)
**Uses 50+ environment variables:**

**Critical (must be set):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `DATABASE_URL` (fallback to direct Postgres)
- `JWT_SECRET` (auth)
- `SYSTEM_TENANT_ID` (tenant resolution)
- `REDIS_MEMORY_URL`, `REDIS_CACHE_URL`

**Highly Recommended:**
- `OPENAI_API_KEY` (AI features)
- `N8N_BASE_URL`, `N8N_API_KEY` (workflow integration)
- `BRAID_MCP_URL` (AI assistant tools)
- `RATE_LIMIT_*` (security)
- `FRONTEND_URL` (CORS)
- `ALLOWED_ORIGINS` (CORS)

**Optional:**
- `ANTHROPIC_API_KEY`, `GROQ_API_KEY` (alternative LLM providers)
- `ELEVENLABS_API_KEY` (TTS)
- `ABUSEIPDB_API_KEY` (threat intel)
- `CAMPAIGN_WORKER_ENABLED` (background jobs)
- `GITHUB_TOKEN` (CI integration)

### MCP Server (`braid-mcp-node-server/src/`)
**Uses 15+ environment variables:**

**Critical (must be set):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (database)
- `REDIS_URL` (memory/sessions)
- `CRM_BACKEND_URL` (API calls)
- `DEFAULT_TENANT_ID` (tenant context)

**Highly Recommended:**
- `OPENAI_API_KEY` (AI tool execution)
- `GITHUB_TOKEN` (GitHub adapter)
- `NODE_ENV` (environment mode)
- `PORT` (server port, default 8000)

**Optional:**
- `USE_DIRECT_SUPABASE_ACCESS` (bypass backend)
- `DEFAULT_OPENAI_MODEL` (model override)
- `BACKEND_URL` (alias for CRM_BACKEND_URL)

---

## GitHub Workflow Analysis

### Build Args (passed to Docker build):
```yaml
VITE_APP_BUILD_VERSION=${{ github.ref_name }}
VITE_CURRENT_BRANCH=${{ github.ref_name }}
VITE_SUPABASE_URL=${{ secrets.VITE_SUPABASE_URL }}
VITE_SUPABASE_ANON_KEY=${{ secrets.VITE_SUPABASE_ANON_KEY }}
VITE_AISHACRM_BACKEND_URL=${{ secrets.VITE_AISHACRM_BACKEND_URL }}
PUPPETEER_SKIP_DOWNLOAD=1
USE_SYSTEM_CHROMIUM=false
```

### Runtime Injection (written to production .env):
```bash
# Only 3 variables are injected:
VITE_APP_BUILD_VERSION=$VERSION_TAG
VITE_N8N_URL=http://147.189.173.237:5679  # (if missing)
GITHUB_TOKEN=$MCP_GITHUB_TOKEN  # (if provided)
```

### ❌ **CRITICAL ISSUE:**
**The workflow does NOT inject:**
- Database credentials
- API keys (OpenAI, Anthropic, etc.)
- Auth secrets (JWT_SECRET, SESSION_SECRET)
- Redis URLs
- n8n credentials
- Security tokens

**This means production .env must be manually maintained with ~90 variables.**

---

## Alignment Issues

### 1. GITHUB_TOKEN Location Confusion
- ❌ Backend `.env` has `GITHUB_TOKEN` but backend doesn't use it (except for CI dispatch)
- ✅ MCP server `.env` now has `GITHUB_TOKEN` (just added)
- ⚠️ Workflow injects it into **main .env** not MCP .env
- **Fix:** Remove from backend .env, ensure MCP .env gets it in workflow

### 2. Missing Git Secrets
Production requires ~15 critical secrets that aren't in GitHub:
- `SUPABASE_SERVICE_ROLE_KEY` (highest priority)
- `JWT_SECRET`, `SESSION_SECRET`
- `REDIS_MEMORY_URL`, `REDIS_CACHE_URL`
- `N8N_API_KEY`, `N8N_BASIC_AUTH_*`
- `ELEVENLABS_API_KEY`
- `SYSTEM_TENANT_ID` (non-VITE version)

### 3. MCP Server Environment Gap
Current production MCP .env has 4 vars, needs ~15:
```bash
# Currently has:
USE_SUPABASE_PROD=true
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GITHUB_TOKEN=...

# Needs to add:
NODE_ENV=production
PORT=8000
REDIS_URL=redis://aishacrm-redis-memory:6379
OPENAI_API_KEY=...
DEFAULT_OPENAI_MODEL=gpt-4o
CRM_BACKEND_URL=http://aishacrm-backend:3001
DEFAULT_TENANT_ID=a11dfb63-4b18-4eb8-872e-747af2e37c46
USE_DIRECT_SUPABASE_ACCESS=false
```

### 4. Workflow Only Injects 3 Variables
Workflow deployment writes version, n8n URL, and GitHub token but nothing else.
**Production .env must contain all 93 variables before first deployment.**

---

## Recommended Fixes

### Priority 1: Add Missing GitHub Secrets
```bash
# Critical secrets to add:
gh secret set SUPABASE_SERVICE_ROLE_KEY -b "..."
gh secret set JWT_SECRET -b "..."  # Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
gh secret set SESSION_SECRET -b "..."
gh secret set SYSTEM_TENANT_ID -b "a11dfb63-4b18-4eb8-872e-747af2e37c46"
gh secret set REDIS_MEMORY_URL -b "redis://aishacrm-redis-memory:6379"
gh secret set REDIS_CACHE_URL -b "redis://aishacrm-redis-cache:6379"
gh secret set N8N_API_KEY -b "..."
gh secret set N8N_BASIC_AUTH_USER -b "..."
gh secret set N8N_BASIC_AUTH_PASSWORD -b "..."
```

### Priority 2: Fix MCP .env Deployment
Modify workflow to inject all MCP variables:
```yaml
# In deploy-production job, after line 174:
# Update MCP .env with all required variables
if [ -n "$MCP_GITHUB_TOKEN" ]; then
  sed -i "s/^GITHUB_TOKEN=.*/GITHUB_TOKEN=$MCP_GITHUB_TOKEN/" .env
fi
# Add missing vars:
grep -q "^REDIS_URL=" .env || echo "REDIS_URL=redis://aishacrm-redis-memory:6379" >> .env
grep -q "^OPENAI_API_KEY=" .env || echo "OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}" >> .env
grep -q "^CRM_BACKEND_URL=" .env || echo "CRM_BACKEND_URL=http://aishacrm-backend:3001" >> .env
grep -q "^DEFAULT_TENANT_ID=" .env || echo "DEFAULT_TENANT_ID=${{ secrets.SYSTEM_TENANT_ID }}" >> .env
grep -q "^NODE_ENV=" .env || echo "NODE_ENV=production" >> .env
```

### Priority 3: Remove GITHUB_TOKEN from Backend .env
```bash
# Local and production backend/.env:
# Remove: GITHUB_TOKEN=...
# (Only MCP server needs it)
```

### Priority 4: Create .env Templates
**backend/.env.production.template:**
```bash
# All 93 variables with placeholder values
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:5432/postgres
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=CHANGE_ME
# ... etc
```

**braid-mcp-node-server/.env.production.template:**
```bash
# All 15 MCP variables
NODE_ENV=production
PORT=8000
REDIS_URL=redis://aishacrm-redis-memory:6379
# ... etc
```

### Priority 5: Document Production Setup
Create `docs/PRODUCTION_DEPLOYMENT.md` with:
1. Initial production .env setup checklist
2. GitHub secrets configuration guide
3. Container restart procedures
4. Environment variable validation commands

---

## Validation Commands

### Check Production Main .env:
```bash
ssh user@147.189.173.237
cat /opt/aishacrm/.env | grep -c "=" # Should show ~93
```

### Check Production MCP .env:
```bash
ssh user@147.189.173.237
cat /opt/aishacrm/braid-mcp-node-server/.env | grep -c "=" # Should show ~15
```

### Verify Container Environment:
```bash
# Backend:
docker exec aishacrm-backend printenv | grep SUPABASE_URL

# MCP Server:
docker exec braid-mcp-server printenv | grep GITHUB_TOKEN
```

### Test MCP GitHub Integration:
```bash
curl -X POST http://localhost:4001/api/mcp/run-proxy \
  -H "Content-Type: application/json" \
  -d '{"requestId":"test","actor":{"id":"user:test","type":"user"},"createdAt":"2025-12-08T14:00:00Z","actions":[{"id":"action-1","verb":"read","actor":{"id":"user:test","type":"user"},"resource":{"system":"github","kind":"repos"},"payload":{"per_page":1}}]}'
```

---

## Summary

**Current State:**
- ✅ Local dev environment has all vars
- ⚠️ Production .env manually maintained (93 vars)
- ❌ MCP .env incomplete (4/15 vars)
- ❌ Git secrets incomplete (18/33 needed)
- ⚠️ Workflow injects only 3 vars

**Risk Level:** **HIGH**
- Container restarts may use stale environment
- MCP server missing critical vars
- No validation that production .env matches code expectations

**Next Steps:**
1. Add missing GitHub secrets (Priority 1)
2. Expand MCP .env in production (Priority 2)
3. Update workflow to inject all secrets (Priority 3)
4. Create .env validation script (Priority 4)
5. Document production setup procedure (Priority 5)
