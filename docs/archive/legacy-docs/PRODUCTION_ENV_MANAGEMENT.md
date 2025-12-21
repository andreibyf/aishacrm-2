# Production Environment Management Guide

## Quick Reference

### Environment Files on Production VPS

| File | Variables | Purpose |
|------|-----------|---------|
| `/opt/aishacrm/.env` | ~93 | Main frontend/backend config |
| `/opt/aishacrm/braid-mcp-node-server/.env` | ~15 | MCP server config |

### Container Restart Procedures

#### When to Recreate vs Restart

**Use `docker compose down && docker compose up -d` when:**
- ✅ You changed `.env` file variables
- ✅ You want to force reload environment
- ✅ You updated compose file configuration

**Use `docker compose restart` when:**
- ❌ **NEVER** - restart doesn't reload `.env` changes
- ✅ Only for code changes in mounted volumes (not applicable to production)

#### Proper Restart Commands

```bash
# Main services (frontend, backend, proxy)
cd /opt/aishacrm
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --force-recreate

# MCP server cluster (3 containers)
cd /opt/aishacrm/braid-mcp-node-server
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

#### Emergency Quick Restart (without .env reload)
```bash
# Only use if you didn't change .env
cd /opt/aishacrm
docker compose -f docker-compose.prod.yml restart proxy frontend backend

cd /opt/aishacrm/braid-mcp-node-server
docker compose -f docker-compose.prod.yml restart
```

---

## Environment Variable Checklist

### Before First Deployment

1. **Create main .env with all 93 variables:**
```bash
ssh user@vps
cd /opt/aishacrm
nano .env  # Paste production values
```

2. **Create MCP .env with all 15 variables:**
```bash
cd /opt/aishacrm/braid-mcp-node-server
nano .env  # Use .env.production.template as guide
```

3. **Verify critical variables are set:**
```bash
# Main .env
grep "SUPABASE_SERVICE_ROLE_KEY" /opt/aishacrm/.env
grep "JWT_SECRET" /opt/aishacrm/.env
grep "OPENAI_API_KEY" /opt/aishacrm/.env
grep "REDIS_MEMORY_URL" /opt/aishacrm/.env

# MCP .env
grep "GITHUB_TOKEN" /opt/aishacrm/braid-mcp-node-server/.env
grep "REDIS_URL" /opt/aishacrm/braid-mcp-node-server/.env
grep "CRM_BACKEND_URL" /opt/aishacrm/braid-mcp-node-server/.env
```

---

## GitHub Secrets Management

### Required Secrets (Production)

**Critical (Application Won't Work Without These):**
```bash
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY  # ⚠️ Currently missing!
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_AISHACRM_BACKEND_URL
OPENAI_API_KEY
PROD_VPS_HOST
PROD_VPS_USER
PROD_VPS_SSH_KEY
```

**Highly Recommended (Features May Fail):**
```bash
JWT_SECRET  # ⚠️ Currently missing!
SESSION_SECRET  # ⚠️ Currently missing!
SYSTEM_TENANT_ID  # ⚠️ Currently missing!
REDIS_MEMORY_URL  # ⚠️ Currently missing!
REDIS_CACHE_URL  # ⚠️ Currently missing!
PROD_MCP_GITHUB_TOKEN  # ✅ Just added
N8N_API_KEY
N8N_BASIC_AUTH_USER
N8N_BASIC_AUTH_PASSWORD
```

**Optional (Enhanced Features):**
```bash
ANTHROPIC_API_KEY  # ✅ Present
GROQ_API_KEY  # ✅ Present
ELEVENLABS_API_KEY
ABUSEIPDB_API_KEY
```

### Adding Missing Secrets

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Add to GitHub
gh secret set SUPABASE_SERVICE_ROLE_KEY -b "YOUR_KEY_HERE"
gh secret set JWT_SECRET -b "GENERATED_SECRET_HERE"
gh secret set SESSION_SECRET -b "ANOTHER_GENERATED_SECRET"
gh secret set SYSTEM_TENANT_ID -b "a11dfb63-4b18-4eb8-872e-747af2e37c46"
gh secret set REDIS_MEMORY_URL -b "redis://aishacrm-redis-memory:6379"
gh secret set REDIS_CACHE_URL -b "redis://aishacrm-redis-cache:6379"
```

---

## Deployment Workflow Behavior

### What Happens on `git push origin vX.X.X`

1. **Build Phase:**
   - GitHub Actions builds 4 images (frontend, backend, proxy, mcp)
   - Bakes in VITE_ variables at build time
   - Pushes to GHCR with version tags

2. **Deploy Phase (SSH to VPS):**
   - Pulls versioned images from GHCR
   - Tags as `:latest` locally
   - **Only injects 3 variables into main .env:**
     - `VITE_APP_BUILD_VERSION` (from tag)
     - `VITE_N8N_URL` (if missing)
     - `GITHUB_TOKEN` (if `MCP_GITHUB_TOKEN` secret set)
   - **Now also updates MCP .env with ~12 variables** (new behavior)
   - Recreates containers with new images

3. **What Workflow Does NOT Do:**
   - ❌ Inject database credentials
   - ❌ Inject API keys (except GITHUB_TOKEN to main .env)
   - ❌ Inject auth secrets
   - ❌ Create .env files from scratch

---

## Troubleshooting

### Container Shows Old Environment Variables

**Problem:** Changed .env but container still uses old values

**Solution:**
```bash
# Must recreate, not restart:
cd /opt/aishacrm  # or /opt/aishacrm/braid-mcp-node-server
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### MCP GitHub Integration Not Working

**Check:**
```bash
# 1. Token exists in MCP .env
grep "GITHUB_TOKEN" /opt/aishacrm/braid-mcp-node-server/.env

# 2. Token loaded in container
docker exec braid-mcp-server printenv | grep GITHUB_TOKEN

# 3. Test endpoint
curl -X POST http://localhost:4001/api/mcp/run-proxy \
  -H "Content-Type: application/json" \
  -d '{"requestId":"test","actor":{"id":"user:test","type":"user"},"actions":[{"id":"1","verb":"read","resource":{"system":"github","kind":"repos"},"payload":{"per_page":1}}]}'
```

### Backend Shows "Signature Invalid" Errors

**Problem:** JWT_SECRET mismatch or missing

**Check:**
```bash
grep "JWT_SECRET" /opt/aishacrm/.env
docker exec aishacrm-backend printenv | grep JWT_SECRET
docker logs aishacrm-backend --tail=100 | grep -i "signature"
```

### Redis Connection Failures

**Check URLs:**
```bash
# Backend should use Docker service names:
grep "REDIS_MEMORY_URL" /opt/aishacrm/.env
# Should be: redis://aishacrm-redis-memory:6379

# MCP should use Docker service names:
grep "REDIS_URL" /opt/aishacrm/braid-mcp-node-server/.env
# Should be: redis://aishacrm-redis-memory:6379

# Verify containers are running:
docker ps --filter "name=redis"
```

---

## Validation Commands

### Check All Environment Files

```bash
# Main .env variable count (expect ~93)
cat /opt/aishacrm/.env | grep -c "^[A-Z]"

# MCP .env variable count (expect ~15)
cat /opt/aishacrm/braid-mcp-node-server/.env | grep -c "^[A-Z]"

# Check for critical vars
cd /opt/aishacrm
grep -E "^(SUPABASE_URL|JWT_SECRET|OPENAI_API_KEY|REDIS_MEMORY_URL)=" .env

cd /opt/aishacrm/braid-mcp-node-server
grep -E "^(GITHUB_TOKEN|REDIS_URL|CRM_BACKEND_URL|DEFAULT_TENANT_ID)=" .env
```

### Verify Container Environment

```bash
# Backend critical vars
docker exec aishacrm-backend printenv | grep -E "(SUPABASE_URL|JWT_SECRET|REDIS_MEMORY_URL)"

# Frontend version
docker exec aishacrm-frontend cat /app/dist/env-config.js | grep VITE_APP_BUILD_VERSION

# MCP server vars
docker exec braid-mcp-server printenv | grep -E "(GITHUB_TOKEN|REDIS_URL|OPENAI_API_KEY)"
```

### Test Services

```bash
# Health checks
curl http://localhost:4001/api/health  # Backend
curl http://localhost:4000/  # Frontend (via proxy)
curl http://localhost:8000/health  # MCP server

# MCP GitHub test
curl -X POST http://localhost:4001/api/mcp/run-proxy \
  -H "Content-Type: application/json" \
  -d '{"requestId":"test-123","actor":{"id":"user:test","type":"user"},"actions":[{"id":"1","verb":"read","resource":{"system":"github","kind":"repos"},"payload":{"per_page":1}}]}'
```

---

## Best Practices

1. **Always recreate containers after .env changes:**
   ```bash
   docker compose down && docker compose up -d
   ```

2. **Keep .env files in sync with templates:**
   - Use `.env.production.template` as reference
   - Document any custom variables

3. **Backup .env files before major changes:**
   ```bash
   cp /opt/aishacrm/.env /opt/aishacrm/.env.backup.$(date +%Y%m%d)
   cp /opt/aishacrm/braid-mcp-node-server/.env /opt/aishacrm/braid-mcp-node-server/.env.backup.$(date +%Y%m%d)
   ```

4. **Validate .env changes before deployment:**
   ```bash
   # Check for syntax errors
   grep -v "^#" .env | grep -v "^$" | grep -v "=" && echo "ERROR: Invalid lines found" || echo "OK"
   ```

5. **Monitor logs after restart:**
   ```bash
   docker logs aishacrm-backend --tail=100 -f
   docker logs braid-mcp-server --tail=100 -f
   ```

---

## Common Mistakes

### ❌ Using `restart` after .env changes
**Wrong:**
```bash
docker compose restart  # Environment not reloaded!
```

**Right:**
```bash
docker compose down && docker compose up -d
```

### ❌ Missing variables in MCP .env
**Symptoms:**
- MCP Monitor shows "Token not configured"
- GitHub integration fails with MISSING_TOKEN
- MCP server can't connect to Redis

**Fix:** Ensure MCP .env has all 15 required variables (use template)

### ❌ GITHUB_TOKEN in wrong .env
**Wrong:** Only in `/opt/aishacrm/.env` (backend doesn't need it)  
**Right:** Must be in `/opt/aishacrm/braid-mcp-node-server/.env` (MCP uses it)

### ❌ Using localhost URLs in .env
**Wrong:**
```bash
REDIS_URL=redis://localhost:6379  # Won't work in Docker!
CRM_BACKEND_URL=http://localhost:3001  # Wrong!
```

**Right:**
```bash
REDIS_URL=redis://aishacrm-redis-memory:6379  # Docker service name
CRM_BACKEND_URL=http://aishacrm-backend:3001  # Docker service name
```

---

## Quick Commands Reference

```bash
# Restart everything (with .env reload)
cd /opt/aishacrm
docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d
cd /opt/aishacrm/braid-mcp-node-server
docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d

# View logs
docker logs aishacrm-backend --tail=100 -f
docker logs aishacrm-frontend --tail=100 -f
docker logs braid-mcp-server --tail=100 -f

# Check container status
docker ps --filter "name=aishacrm"
docker ps --filter "name=braid-mcp"

# Verify environment
docker exec aishacrm-backend printenv | grep SUPABASE_URL
docker exec braid-mcp-server printenv | grep GITHUB_TOKEN

# Test health
curl http://localhost:4001/api/health
curl http://localhost:8000/health
```
