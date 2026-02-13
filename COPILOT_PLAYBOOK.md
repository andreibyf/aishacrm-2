# Copilot Playbook - AiSHA CRM Operations Guide

> **Critical operational procedures and lessons learned for AI assistants working on this codebase**

**Last Updated**: February 4, 2026  
**Version**: 3.0.x

---

## 🚨 PRE-FLIGHT CHECKLIST (ALWAYS DO THIS FIRST)

### 1. Verify Working Directory Location

```powershell
# ALWAYS verify location before ANY command
Get-Location

# Expected output (Windows):
# Path: C:\Users\andre\Documents\GitHub\aishacrm-2

# If wrong, navigate:
cd C:\Users\andre\Documents\GitHub\aishacrm-2
```

**Why**: Running commands from wrong directory causes mysterious failures, file not found errors, or worse - modifying wrong project files.

### 2. Check Git Branch

```bash
git branch --show-current

# Expected: main (production) or feature/* (preview)
```

**Branch Strategy**:
- `main` - Production deployments, stable code only
- `feature/*` - Preview/development branches
- **NEVER commit directly to main without testing**

### 3. Check Container Status

```bash
# View main application containers
docker compose ps

# Check health of critical services
docker compose ps | grep -E "backend|frontend|redis"

# Expected: 4 containers (backend, frontend, redis-memory, redis-cache)

# CRITICAL: Also check Braid MCP containers (separate docker-compose)
cd braid-mcp-node-server && docker compose ps && cd ..

# Expected: 3 containers (braid-mcp-server, braid-mcp-1, braid-mcp-2)

# CRITICAL: Also check Agent Office containers (addon)
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "aisha-|redpanda"

# Expected: 3 containers (aisha-redpanda, aisha-telemetry-sidecar, aisha-office-viz)
```

**Required Containers** (10 total):

**Main Application** (4):
1. `aishacrm-backend` - Main API server (port 4001)
2. `aishacrm-frontend` - React app (port 4000)
3. `aishacrm-redis-memory` - Ephemeral cache (port 6379)
4. `aishacrm-redis-cache` - Persistent cache (port 6380)

**Braid MCP** (3):
5. `braid-mcp-server` - MCP server main (port 8000)
6. `braid-mcp-1` - MCP worker 1
7. `braid-mcp-2` - MCP worker 2

**Agent Office Addon** (3):
8. `aisha-redpanda` - Event bus (Kafka-compatible, port 9092)
9. `aisha-telemetry-sidecar` - Telemetry collector
10. `aisha-office-viz` - Office visualization UI

**Start Missing Containers**:
```bash
# Main containers
docker compose up -d

# Braid MCP (if missing)
cd braid-mcp-node-server && docker compose up -d && cd ..

# Agent Office (if missing)
cd addons/agent-office && docker compose -f docker-compose.agent-office.yml up -d && cd ../..
```

---

## 🗄️ DATABASE OPERATIONS

### Migration Best Practices

**CRITICAL LESSONS LEARNED (Feb 4, 2026)**:

#### Problem: Finding the RIGHT Function to Fix

**What Went Wrong**:
- Created migration 123 to fix `sync_contact_to_person_profile()` 
- Tests still failed because **triggers called different functions**
- Actual functions: `person_profile_upsert_from_contact()`, `person_profile_after_activity()`

**How to Prevent**:
```sql
-- ALWAYS identify the actual triggered function first
SELECT 
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  tgfoid::regprocedure AS actual_function
FROM pg_trigger 
WHERE tgrelid = 'your_table_name'::regclass;

-- Then inspect that function's code
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'function_name_from_above';
```

#### PostgreSQL Polymorphic Function Type Casting

**Rule 1: NULLIF with search_path**
```sql
-- ❌ FAILS when search_path includes pg_catalog
NULLIF(column, '')                    -- Error: nullif(text, unknown)
pg_catalog.nullif(column, '')         -- Error: nullif(text, unknown)

-- ✅ WORKS - Cast BOTH arguments
NULLIF(column::text, ''::text)        -- Success!
```

**Rule 2: COALESCE on Composite Types**
```sql
-- ❌ NEVER coalesce RECORD types
RETURN COALESCE(NEW, OLD);            -- Error: coalesce(table, table)

-- ✅ Use explicit conditionals
IF TG_OP = 'DELETE' THEN
  RETURN OLD;
ELSE
  RETURN NEW;
END IF;
```

### Migration Workflow

#### Step 1: Create Migration File

```bash
# Naming convention: NNN_descriptive_name.sql
# Examples:
# 123_fix_contact_trigger_nullif.sql
# 126_fix_person_profile_upsert_from_contact.sql

# Location: backend/migrations/
```

#### Step 2: Apply Migration (Doppler for Production DB)

```bash
# ALWAYS use Doppler for production Supabase connection
doppler run -- env NODE_TLS_REJECT_UNAUTHORIZED=0 node backend/apply-single-sql.js backend/migrations/NNN_your_migration.sql

# Success output:
# ✓ Connected. Applying NNN_your_migration.sql ...
# ✓ SQL applied successfully
```

**Why Doppler?**
- Secures DATABASE_URL (Supabase connection string)
- Prevents committing secrets to git
- Consistent across dev/staging/prod environments

#### Step 3: Verify Migration Applied

```bash
# Check function was updated (get actual code)
doppler run -- bash -c 'psql "$DATABASE_URL" -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '\''your_function_name'\'';" | grep -E "YOUR_CHANGE"'

# Check trigger points to correct function
doppler run -- bash -c 'psql "$DATABASE_URL" -c "SELECT tgfoid::regprocedure FROM pg_trigger WHERE tgname = '\''your_trigger'\'';"'
```

#### Step 4: Test Trigger Execution

```bash
# Test directly via psql to avoid caching layers
doppler run -- bash -c 'psql "$DATABASE_URL" -c "INSERT INTO your_table (required_fields) VALUES ('\''test_values'\'') RETURNING id;"'

# If trigger fails, error will show EXACT line number and query
```

### Common Migration Pitfalls

| Pitfall | Symptom | Solution |
|---------|---------|----------|
| **Wrong function fixed** | Tests still fail after migration | Use `pg_trigger` query to find ACTUAL function |
| **Type mismatch** | `function does not exist` error | Cast ALL args: `NULLIF(col::text, ''::text)` |
| **RECORD coalesce** | `coalesce(table, table)` error | Use IF/ELSE, return explicit OLD or NEW |
| **Multiple functions** | Unpredictable behavior | Check `SELECT oid FROM pg_proc WHERE proname=...` |
| **Search path** | Functions not found | Set `search_path = public, pg_catalog` in function |
| **Supabase cache** | Changes not visible | Wait 1-2 min OR use port 6543 (transaction pooler) |

---

## 🧪 TESTING WORKFLOW

### Pre-Test Checklist

```bash
# 1. Ensure backend container is running
docker compose ps backend

# 2. Restart backend after migration
docker compose restart backend && sleep 5

# 3. Check backend logs for startup errors
docker compose logs backend --tail=50 | grep -i error
```

### Running Tests

#### Backend Tests (Node.js native test runner)

```bash
# Full suite
docker exec aishacrm-backend npm test

# Specific test file
docker exec aishacrm-backend node --test __tests__/schema/field-parity.test.js

# With grep filter
docker exec aishacrm-backend sh -c "BACKEND_URL=http://localhost:3001 node --test __tests__/schema/field-parity.test.js 2>&1" | grep -E "^# (tests|pass|fail)"

# Expected output format:
# # tests 26
# # pass 26
# # fail 0
```

#### Frontend Tests (Vitest)

```bash
# Watch mode (for development)
npm run test

# Run once (for CI)
npm run test:run

# Specific file
npm run test:file src/components/ai/__tests__/useSpeechInput.test.jsx
```

#### E2E Tests (Playwright)

```bash
# All E2E tests
npm run test:e2e

# With UI (for debugging)
npm run test:e2e:ui

# Specific test
npx playwright test tests/e2e/assistant-chat.spec.ts
```

### Test Failure Investigation

```bash
# 1. Get detailed error
docker exec aishacrm-backend node --test __tests__/path/to/test.js 2>&1 | grep -A 10 "error"

# 2. Check backend logs during test execution
docker compose logs -f backend &
# (run test in another terminal)

# 3. Test database trigger directly (bypass backend)
doppler run -- bash -c 'psql "$DATABASE_URL" -c "INSERT INTO contacts (...) VALUES (...);"'
```

### Test Success Criteria

| Test Type | Passing Threshold | Notes |
|-----------|-------------------|-------|
| Backend unit tests | 100% | Zero tolerance for failures |
| Field parity tests | 26/26 (100%) | Critical for schema integrity |
| Frontend unit tests | 100% | May skip slow tests in quick mode |
| E2E tests | 95%+ | Flaky network tests acceptable |

---

## 🐳 CONTAINER OPERATIONS

### Starting Services

```bash
# Start all services in background
docker compose up -d --build

# Start with live logs
docker compose up --build

# Start specific service
docker compose up -d backend
```

### Container Health Checks

```bash
# View all container status
docker compose ps

# Check specific container logs
docker compose logs backend --tail=100
docker compose logs frontend --tail=100

# Follow logs in real-time
docker compose logs -f backend

# Check health endpoint
curl http://localhost:4001/api/system/health
```

### Common Container Issues

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| **Port already in use** | `netstat -ano \| findstr "4001"` | Kill process or change port in .env |
| **Container won't start** | `docker compose logs backend` | Check for missing env vars in .env |
| **Database connection fails** | Check DATABASE_URL in Doppler | Verify Supabase project is running |
| **Redis connection fails** | `docker compose ps redis-memory redis-cache` | Restart Redis: `docker compose restart redis-memory redis-cache` |

### Restarting After Code Changes

```bash
# Backend code change (automatic with nodemon in dev)
# OR force restart:
docker compose restart backend

# Frontend code change (automatic with Vite HMR in dev)
# OR force rebuild:
docker compose up -d --build frontend

# Database migration applied
docker compose restart backend  # Clear connection pool
```

---

## 🔐 ENVIRONMENT & SECRETS

### Doppler Usage

```bash
# Login (one-time setup)
doppler login

# Setup project (one-time)
doppler setup

# Run command with secrets injected
doppler run -- your-command-here

# List available secrets
doppler secrets

# Verify connection
doppler --version
```

### Local Development (.env files)

**Files**:
- `.env` - Frontend config
- `backend/.env` - Backend config
- `.env.local` - Docker override (contains DOPPLER_TOKEN)

**Never commit**: `.env.local`, `.env`, `backend/.env`

### Database Connection Strings

```bash
# Production (via Doppler)
DATABASE_URL=postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres

# Port 5432 = Session pooler (more caching)
# Port 6543 = Transaction pooler (less caching, better for migrations)
```

**Recommendation**: Use port 6543 for migration testing to avoid prepared statement cache issues.

---

## 📁 PROJECT STRUCTURE REFERENCE

```
aishacrm-2/
├── backend/
│   ├── migrations/           # ⚠️ CRITICAL: Database migrations
│   │   ├── 123_*.sql        # Numbered migrations
│   │   └── dev_functions_export.sql  # Full schema dump
│   ├── __tests__/           # Backend tests
│   ├── routes/              # API endpoints (28 categories)
│   ├── lib/                 # Core libraries
│   │   ├── aiEngine/        # Multi-provider LLM
│   │   └── braidIntegration-v2.js  # Braid tool registry
│   └── apply-single-sql.js  # Migration runner
├── src/                     # React frontend
│   ├── components/
│   ├── api/
│   └── hooks/
├── braid-llm-kit/           # AI tool definitions (.braid files)
├── docs/                    # Documentation
├── tests/e2e/               # Playwright E2E tests
├── docker-compose.yml       # Local development
├── docker-compose.prod.yml  # Production config
├── CLAUDE.md                # AI assistant guide
└── COPILOT_PLAYBOOK.md      # This file
```

---

## 🎯 COMMON WORKFLOWS

### Adding a New Database Migration

```bash
# 1. Verify location
Get-Location  # Should be project root

# 2. Create migration file
# Name: backend/migrations/NNN_descriptive_name.sql
# Number: Next sequential number (check existing files)

# 3. Write migration SQL
# - Use CREATE OR REPLACE for functions
# - Include comments explaining the change
# - Cast types explicitly for polymorphic functions

# 4. Apply migration
doppler run -- env NODE_TLS_REJECT_UNAUTHORIZED=0 node backend/apply-single-sql.js backend/migrations/NNN_your_file.sql

# 5. Verify in database
doppler run -- bash -c 'psql "$DATABASE_URL" -c "SELECT proname FROM pg_proc WHERE proname = '\''your_function'\'';"'

# 6. Test trigger execution
doppler run -- bash -c 'psql "$DATABASE_URL" -c "INSERT INTO test_table (...) VALUES (...);"'

# 7. Restart backend
docker compose restart backend

# 8. Run affected tests
docker exec aishacrm-backend node --test __tests__/schema/field-parity.test.js

# 9. Commit
git add backend/migrations/NNN_your_file.sql
git commit -m "feat: Add migration NNN - descriptive message"
```

### Debugging a Failed Test

```bash
# 1. Run test with full output
docker exec aishacrm-backend node --test __tests__/path/to/test.js 2>&1 | tee test-output.txt

# 2. Check backend logs during test
docker compose logs backend --tail=200 | grep -i error

# 3. Test database operation directly
doppler run -- bash -c 'psql "$DATABASE_URL" -c "YOUR SQL HERE;"'

# 4. Check function definitions
doppler run -- bash -c 'psql "$DATABASE_URL" -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '\''func_name'\'';"'

# 5. Check trigger configuration
doppler run -- bash -c 'psql "$DATABASE_URL" -c "SELECT tgname, tgfoid::regprocedure FROM pg_trigger WHERE tgrelid = '\''table_name'\''::regclass;"'

# 6. Restart services if needed
docker compose restart backend

# 7. Re-run test
docker exec aishacrm-backend node --test __tests__/path/to/test.js
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] All tests passing locally (26/26 backend, 100% frontend)
- [ ] No uncommitted changes (`git status`)
- [ ] Migrations tested on dev Supabase instance
- [ ] Branch merged to main (if using feature branches)
- [ ] Docker images build successfully
- [ ] No secrets in committed files

### Deployment

```bash
# 1. Tag release
git tag v3.0.x
git push origin v3.0.x

# 2. Production deployment (handled by CI/CD or manual)
# - GitHub Actions automatically deploys on tag push
# - Or manual: doppler run -- docker compose -f docker-compose.prod.yml up -d --build

# 3. Run production migrations (if needed)
doppler run --config prd -- env NODE_TLS_REJECT_UNAUTHORIZED=0 node backend/apply-single-sql.js backend/migrations/NNN_file.sql

# 4. Monitor logs
docker compose -f docker-compose.prod.yml logs -f backend | grep -i error

# 5. Smoke test critical endpoints
curl https://app.aishacrm.com/api/system/health
```

---

## 📊 KEY METRICS TO MONITOR

### Test Health

```bash
# Backend test pass rate
docker exec aishacrm-backend npm test 2>&1 | grep "# pass"
# Target: 100%

# Field parity test (critical)
docker exec aishacrm-backend node --test __tests__/schema/field-parity.test.js 2>&1 | grep "# tests"
# Target: 26/26
```

### Container Health

```bash
# All containers running
docker compose ps | grep -c "Up"
# Target: 5 (backend, frontend, redis-memory, redis-cache, optional: mcp/n8n)

# Backend response time
curl -o /dev/null -s -w '%{time_total}\n' http://localhost:4001/api/system/health
# Target: <0.5s
```

---

## 🤖 C.A.R.E. (COGNITIVE ADAPTIVE RESPONSE ENGINE) CONFIGURATION

### Overview

C.A.R.E. configuration is **100% UI-driven** via Workflow Builder. No manual API calls, SQL inserts, or environment variable setup is required for per-tenant configuration.

### Two-Level Configuration Architecture

**1. System-Wide Settings (One-Time Setup via Doppler)**

Controls global C.A.R.E. behavior across all tenants:

```bash
# Production (prd_prd Doppler config)
AI_TRIGGERS_WORKER_ENABLED=true              # Enable automatic trigger detection
AI_TRIGGERS_WORKER_INTERVAL_MS=15000         # Poll every 15 seconds
CARE_STATE_WRITE_ENABLED=true                # Allow state persistence globally
CARE_WORKFLOW_TRIGGERS_ENABLED=true          # Allow workflow webhook triggers

# Development (dev_personal Doppler config)  
AI_TRIGGERS_WORKER_ENABLED=false             # Disable automatic polling (manual only)
AI_TRIGGERS_WORKER_INTERVAL_MS=15000         # Interval if enabled
CARE_STATE_WRITE_ENABLED=true                # Allow state persistence
CARE_WORKFLOW_TRIGGERS_ENABLED=true          # Allow workflow triggers
```

**2. Per-Tenant Settings (UI-Driven via Workflow Builder)**

Configured through Workflow Builder interface:

1. Navigate to **Workflows** → **Create New Workflow**
2. Drag **"CARE Start"** trigger node onto canvas
3. Configure node settings:
   - **Tenant ID** (required): Tenant UUID
   - **Enabled**: Toggle on/off (default: true)
   - **Shadow Mode**: Observation-only (default: true)
   - **State Write**: Allow state updates (default: false)
   - **Webhook Timeout**: Request timeout in ms (default: 3000)
   - **Max Retries**: Retry attempts (default: 2)
4. Click **"Save Workflow"**
5. Backend automatically syncs to `care_workflow_config` table

### Auto-Sync Mechanism

When you save a workflow with a CARE Start node, the backend automatically:

1. Calls `syncCareWorkflowConfig()` function (in `backend/routes/workflows.js`)
2. Finds CARE Start node in workflow.nodes array
3. Extracts configuration from node.config
4. Upserts `care_workflow_config` table entry
5. Generates webhook URL: `http://backend:3001/api/workflows/{workflow_id}/webhook`

**If you remove the CARE Start node and save**, the config entry is automatically deleted.

### Important Constraints

**One C.A.R.E. Workflow Per Tenant**:
- `care_workflow_config` table has PRIMARY KEY on `tenant_id`
- Each tenant can have MULTIPLE workflows with CARE Start nodes
- Only the MOST RECENTLY SAVED workflow becomes active
- Previous workflows remain but are NOT triggered by C.A.R.E.

### Verification

**Check Database Configuration**:

```sql
SELECT 
  tenant_id, 
  workflow_id, 
  webhook_url, 
  is_enabled, 
  shadow_mode,
  state_write_enabled
FROM care_workflow_config
WHERE tenant_id = 'YOUR_TENANT_UUID';
```

**Integration Test**:

```javascript
import { getCareConfigForTenant } from './lib/care/careTenantConfig.js';
const config = await getCareConfigForTenant('YOUR_TENANT_UUID');
console.log('Config source:', config._source); // Should be "database"
```

### Common Pitfalls

❌ **DON'T**: Manually insert into `care_workflow_config` table  
✅ **DO**: Save workflow with CARE Start node (automatic sync)

❌ **DON'T**: Set per-tenant config via environment variables  
✅ **DO**: Configure CARE Start node in Workflow Builder UI

❌ **DON'T**: Create multiple CARE workflows and expect them all to trigger  
✅ **DO**: Design one comprehensive workflow per tenant with conditional logic

### Complete Documentation

See [docs/CARE_SETUP_GUIDE.md](./docs/CARE_SETUP_GUIDE.md) for complete setup instructions.

---

## 🎓 LESSONS LEARNED ARCHIVE

### Feb 4, 2026: Polymorphic Function Type Resolution

**Problem**: Migration 123 fixed `sync_contact_to_person_profile()` but tests still failed.

**Root Cause**: Triggers called `person_profile_upsert_from_contact()` and `person_profile_after_activity()` instead.

**Investigation Steps**:
1. Direct psql INSERT succeeded → ruled out PostgREST cache theory
2. Error showed actual function: `person_profile_upsert_from_contact()`
3. Query: `SELECT tgfoid::regprocedure FROM pg_trigger` revealed real trigger targets

**Solution**:
- Migration 126: Fixed `person_profile_upsert_from_contact()` with `NULLIF(col::text, ''::text)`
- Migration 127: Fixed `person_profile_after_activity()` with explicit IF/ELSE instead of COALESCE

**Key Takeaway**: Always verify which function a trigger ACTUALLY calls before creating migration.

---

## 🔗 RELATED DOCUMENTATION

- [CLAUDE.md](./CLAUDE.md) - Comprehensive project guide for Claude Code
- [docs/DATABASE_GUIDE.md](./docs/DATABASE_GUIDE.md) - Database schema and architecture
- [docs/DEVELOPER_MANUAL.md](./docs/DEVELOPER_MANUAL.md) - Development setup
- [orchestra/PLAN.md](./orchestra/PLAN.md) - Active task queue and conventions

---

## 📞 TROUBLESHOOTING CONTACTS

**When things break**:
1. Check this playbook first
2. Review [CLAUDE.md](./CLAUDE.md) for architecture details
3. Check [orchestra/PLAN.md](./orchestra/PLAN.md) for known issues
4. Search git history: `git log --all --grep="your error message"`

**Common Support Channels**:
- Supabase: https://supabase.com/dashboard
- Doppler: https://dashboard.doppler.com
- Docker: `docker compose logs service_name`

---

**End of Copilot Playbook** | Version 1.0 | Feb 4, 2026
