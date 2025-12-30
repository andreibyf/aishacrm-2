# GitHub Actions Secrets Documentation

This document lists all GitHub Actions secrets required for CI/CD workflows.

## ⚠️ Important: Doppler Migration

**As of December 2025, most secrets have been migrated from GitHub Secrets to Doppler.**

- **Doppler secrets** are fetched at runtime during workflow execution
- **GitHub Secrets** now only contains `DOPPLER_TOKEN` (bootstrap credential)
- **GitHub Variables** contains `DOPPLER_PROJECT` and `DOPPLER_CONFIG` (non-sensitive configuration)

To verify all required Doppler secrets are configured, run:
```bash
.github/scripts/verify-doppler-secrets.sh
```

## Quick Reference

| Secret | Storage Location | Required For | Category |
|--------|------------------|-------------|----------|
| `DOPPLER_TOKEN` | GitHub Secrets | All workflows | Bootstrap |
| `ADMIN_EMAILS` | **Doppler** | docker-release.yml | Build |
| `VITE_AISHACRM_BACKEND_URL` | GitHub Variables | docker-release.yml | Frontend Build |
| `VITE_SUPABASE_URL` | GitHub Variables | docker-release.yml | Frontend Build |
| `VITE_SUPABASE_ANON_KEY` | GitHub Variables | docker-release.yml | Frontend Build |
| `PROD_VPS_HOST` | **Doppler** | docker-release.yml | Deployment |
| `PROD_VPS_USER` | **Doppler** | docker-release.yml | Deployment |
| `PROD_VPS_SSH_KEY` | **Doppler** | docker-release.yml | Deployment |
| `PROD_VPS_PORT` | **Doppler** | docker-release.yml | Deployment (optional, default: 22) |
| `PROD_MCP_GITHUB_TOKEN` | **Doppler** | docker-release.yml | Deployment |
| `DATABASE_URL` | mcp-audit-test.yml | mcp-audit-test.yml | Database |
| `SUPABASE_URL` | mcp-audit-test.yml | mcp-audit-test.yml | Database |
| `SUPABASE_SERVICE_ROLE_KEY` | mcp-audit-test.yml | mcp-audit-test.yml | Database |
| `TENANT_ID` | mcp-audit-test.yml | mcp-audit-test.yml | Testing |
| `RUN_MIGRATIONS` | mcp-audit-test.yml | mcp-audit-test.yml | Testing (optional) |

---

## Detailed Secret Reference

### Frontend Build Secrets

These are injected during Docker image build for the frontend:

#### `VITE_AISHACRM_BACKEND_URL`
- **Used in:** `docker-release.yml`
- **Purpose:** Backend API URL for production frontend
- **Example:** `https://api.yourcrm.com`
- **Note:** Baked into frontend at build time

#### `VITE_SUPABASE_URL`
- **Used in:** `docker-release.yml`
- **Purpose:** Supabase project URL for frontend
- **Example:** `https://xxxx.supabase.co`

#### `VITE_SUPABASE_ANON_KEY`
- **Used in:** `docker-release.yml`
- **Purpose:** Supabase anonymous/public key for frontend auth
- **Note:** This is the PUBLIC key, safe for frontend

---

### Deployment Secrets

These are used to deploy to the production VPS:

#### `PROD_VPS_HOST`
- **Used in:** `docker-release.yml`
- **Purpose:** SSH hostname/IP of production server
- **Example:** `vps.yourserver.com` or `192.168.1.100`

#### `PROD_VPS_USER`
- **Used in:** `docker-release.yml`
- **Purpose:** SSH username for deployment
- **Example:** `deploy` or `ubuntu`

#### `PROD_VPS_SSH_KEY`
- **Used in:** `docker-release.yml`
- **Purpose:** SSH private key for passwordless deployment
- **Format:** Full PEM private key including `-----BEGIN...-----`
- **Security:** Must have newlines preserved

#### `PROD_VPS_PORT`
- **Used in:** `docker-release.yml`
- **Purpose:** SSH port (optional)
- **Default:** `22`

#### `PROD_MCP_GITHUB_TOKEN`
- **Used in:** `docker-release.yml`
- **Purpose:** GitHub token for MCP server to access repos
- **Scope:** `read:packages`, `repo` (if accessing private repos)

---

### Database Secrets

Used for database connectivity in workflows:

#### `DATABASE_URL`
- **Used in:** `mcp-audit-test.yml`
- **Purpose:** PostgreSQL connection string
- **Example:** `postgresql://user:pass@host:5432/dbname`

#### `SUPABASE_URL`
- **Used in:** `mcp-audit-test.yml`
- **Purpose:** Supabase project URL for backend
- **Example:** `https://xxxx.supabase.co`

#### `SUPABASE_SERVICE_ROLE_KEY`
- **Used in:** `mcp-audit-test.yml`
- **Purpose:** Supabase service role key (full access)
- **Security:** Keep this SECRET - bypasses RLS

---

### Testing Secrets

Used for CI/CD test runs:

#### `TENANT_ID`
- **Used in:** `mcp-audit-test.yml`
- **Purpose:** Test tenant UUID for integration tests
- **Example:** `a11dfb63-4b18-4eb8-872e-747af2e37c46`

#### `RUN_MIGRATIONS`
- **Used in:** `mcp-audit-test.yml`
- **Purpose:** Flag to run database migrations
- **Optional:** Set to `true` to enable

---

## How to Configure

### GitHub Secrets (Bootstrap Only)

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add `DOPPLER_TOKEN` with your Doppler service token value

### GitHub Variables (Non-Sensitive Config)

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions** → **Variables** tab
3. Add the following variables:
   - `DOPPLER_PROJECT` - Your Doppler project name (e.g., `aishacrm`)
   - `DOPPLER_CONFIG` - Your Doppler config environment (e.g., `prd`, `dev`)
   - `VITE_AISHACRM_BACKEND_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### Doppler Secrets (Most Secrets)

1. Install Doppler CLI: https://docs.doppler.com/docs/install-cli
2. Login: `doppler login`
3. Select your project and config: `doppler setup`
4. Add secrets using `doppler secrets set SECRET_NAME=value`

Required Doppler secrets for `docker-release.yml`:
- `ADMIN_EMAILS`
- `PROD_VPS_HOST`
- `PROD_VPS_USER`
- `PROD_VPS_SSH_KEY` (full PEM key with newlines)
- `PROD_VPS_PORT`
- `PROD_MCP_GITHUB_TOKEN`

**Verify all required secrets:**
```bash
.github/scripts/verify-doppler-secrets.sh
```

## Verifying Secrets

### GitHub Secrets

Secrets show "❓ Unknown" status in audit reports because GitHub doesn't expose their existence for security reasons. To verify:

1. Check **Settings → Secrets → Actions** - secrets should be listed (only `DOPPLER_TOKEN` should remain)
2. Run a workflow that uses the secret - it will fail if missing
3. Check workflow logs for "secret not found" errors

### Doppler Secrets

Use the provided verification script:
```bash
# With Doppler CLI configured locally
.github/scripts/verify-doppler-secrets.sh

# Or with explicit credentials
DOPPLER_TOKEN=<token> DOPPLER_PROJECT=<project> DOPPLER_CONFIG=<config> .github/scripts/verify-doppler-secrets.sh
```

The script will:
- ✓ Check if all 6 required secrets exist in Doppler
- ✓ Verify secrets are non-empty
- ✗ Report any missing or empty secrets
3. Check workflow logs for "secret not found" errors

## Auto-Provided Secrets

These are automatically available in all workflows:

- `GITHUB_TOKEN` - Auto-generated per workflow run
- `github.token` - Same as above

---

*Last updated: 2025-12-30 (Doppler migration)*
