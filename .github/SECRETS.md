# GitHub Actions Secrets Documentation

This document lists all GitHub Actions secrets required for CI/CD workflows.

## Quick Reference

| Secret | Required For | Category |
|--------|-------------|----------|
| `VITE_AISHACRM_BACKEND_URL` | docker-release.yml | Frontend Build |
| `VITE_SUPABASE_URL` | docker-release.yml | Frontend Build |
| `VITE_SUPABASE_ANON_KEY` | docker-release.yml | Frontend Build |
| `PROD_VPS_HOST` | docker-release.yml | Deployment |
| `PROD_VPS_USER` | docker-release.yml | Deployment |
| `PROD_VPS_SSH_KEY` | docker-release.yml | Deployment |
| `PROD_VPS_PORT` | docker-release.yml | Deployment (optional, default: 22) |
| `PROD_MCP_GITHUB_TOKEN` | docker-release.yml | Deployment |
| `DATABASE_URL` | mcp-audit-test.yml | Database |
| `SUPABASE_URL` | mcp-audit-test.yml | Database |
| `SUPABASE_SERVICE_ROLE_KEY` | mcp-audit-test.yml | Database |
| `TENANT_ID` | mcp-audit-test.yml | Testing |
| `RUN_MIGRATIONS` | mcp-audit-test.yml | Testing (optional) |

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

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with its name and value

## Verifying Secrets

Secrets show "❓ Unknown" status in audit reports because GitHub doesn't expose their existence for security reasons. To verify:

1. Check **Settings → Secrets → Actions** - secrets should be listed
2. Run a workflow that uses the secret - it will fail if missing
3. Check workflow logs for "secret not found" errors

## Auto-Provided Secrets

These are automatically available in all workflows:

- `GITHUB_TOKEN` - Auto-generated per workflow run
- `github.token` - Same as above

---

*Last updated: 2025-12-20*
