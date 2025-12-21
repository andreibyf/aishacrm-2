# GitHub Actions Workflow Secrets Reference

## Quick Summary

This document provides a quick reference for all secrets used across GitHub Actions workflows in this repository.

## Test Alignment Report Workflow

**File:** `.github/workflows/test-alignment-report.yml`

**Required Secrets:**
- ✅ `GITHUB_TOKEN` (automatically provided by GitHub Actions)

**Custom Secrets:** None required

**Configuration Steps:** Zero - works out of the box

**See:** [Detailed Test Alignment Secrets Documentation](./workflows/TEST_ALIGNMENT_SECRETS.md)

## All Workflows Secrets Overview

### Workflows with No Custom Secrets (GITHUB_TOKEN Only)

| Workflow | Purpose |
|----------|---------|
| `test-alignment-report.yml` | Generate test coverage reports |
| `security-audit.yml` | Run npm security audits |
| `backend-tests.yml` | Run backend unit tests |
| `lint.yml` | Code linting and formatting |
| `pg-import-guard.yml` | Prevent direct PostgreSQL imports |
| `rls-check.yml` | Verify RLS policies |

### Workflows Requiring Custom Secrets

| Workflow | Secrets Required | Purpose |
|----------|-----------------|---------|
| `docker-release.yml` | `PROD_VPS_HOST`<br>`PROD_VPS_USER`<br>`PROD_VPS_KEY`<br>`PROD_MCP_GITHUB_TOKEN` | Production deployment |
| `api-schema-tests.yml` | `SUPABASE_URL`<br>`SUPABASE_SERVICE_ROLE_KEY`<br>`DATABASE_URL` | Database integration tests |
| `e2e.yml` | `VITE_SUPABASE_URL`<br>`VITE_SUPABASE_ANON_KEY`<br>`BASE44_API_KEY` | End-to-end tests |
| `mcp-audit-test.yml` | `SUPABASE_URL`<br>`SUPABASE_SERVICE_ROLE_KEY` | MCP server tests |

## Secret Categories

### 1. Automatic Secrets (No Configuration)

**GITHUB_TOKEN**
- Automatically provided by GitHub Actions
- Scoped to current repository
- Expires after workflow completion
- Used for: Creating issues, uploading artifacts, accessing repo

### 2. Database Secrets

**SUPABASE_URL**
- Supabase project URL
- Example: `https://xxxxx.supabase.co`

**SUPABASE_SERVICE_ROLE_KEY**
- Supabase service role key (bypasses RLS)
- ⚠️ Highly sensitive - only for backend/testing

**SUPABASE_ANON_KEY**
- Supabase anonymous/publishable key
- Used in frontend (less sensitive)

**DATABASE_URL**
- Direct PostgreSQL connection string
- Format: `postgresql://user:pass@host:5432/db`

### 3. Deployment Secrets

**PROD_VPS_HOST**
- Production VPS hostname/IP
- Example: `prod.example.com`

**PROD_VPS_USER**
- SSH username for VPS
- Example: `deploy`

**PROD_VPS_KEY**
- SSH private key for VPS authentication
- ⚠️ Keep secure - full server access

**PROD_MCP_GITHUB_TOKEN**
- GitHub token for accessing private MCP repos
- Scope: `repo` (read access)

### 4. API Keys

**BASE44_API_KEY**
- API key for Base44 cloud service
- Used for AI/LLM features

**VITE_* Prefixed**
- Frontend environment variables
- Exposed in browser (use with caution)

## Setting Up Secrets

### Repository Secrets

1. Go to repository Settings
2. Navigate to Secrets and variables → Actions
3. Click "New repository secret"
4. Add name and value
5. Click "Add secret"

### Environment Secrets

Some workflows use environment-specific secrets:

```yaml
environment: production
# Accesses secrets from "production" environment
```

## Security Best Practices

### ✅ DO

- Use repository secrets for sensitive data
- Rotate secrets regularly
- Use minimal scope for tokens
- Use environment secrets for deployment-specific values
- Audit secret usage with `scripts/audit-github-secrets.js`

### ❌ DON'T

- Commit secrets to code
- Echo secrets in logs
- Use the same secret across multiple purposes
- Share secrets between repositories unnecessarily
- Use `GITHUB_TOKEN` for cross-repo operations

## Auditing Secrets

Run the secrets audit script to verify all workflow secrets are configured:

```bash
# Check which secrets are referenced in workflows
node scripts/audit-github-secrets.js

# Generate report
node scripts/audit-github-secrets.js --format markdown > SECRETS_AUDIT.md

# CI validation (exits 1 if missing secrets)
node scripts/audit-github-secrets.js --check-only
```

## Troubleshooting

### Missing Secret Error

**Error:** `Error: Input required and not supplied: my_secret`

**Solution:** Add the secret in repository settings (see "Setting Up Secrets" above)

### Wrong Secret Name

**Error:** Secret exists but workflow can't find it

**Solution:** Secret names are case-sensitive. Use UPPERCASE_SNAKE_CASE

### Permission Denied

**Error:** `Resource not accessible by integration`

**Solution:** Check workflow permissions:

```yaml
permissions:
  contents: read
  issues: write
```

## Related Documentation

- [Test Alignment Secrets (Detailed)](./workflows/TEST_ALIGNMENT_SECRETS.md)
- [GitHub Actions Security](https://docs.github.com/en/actions/security-guides)
- [Audit Secrets Script](../scripts/audit-github-secrets.js)

## Contact

For questions about secrets configuration, contact the DevOps team or check the repository documentation.
