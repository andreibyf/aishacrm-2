# Test Alignment Report Workflow - Required Secrets

## Overview

This document identifies all secrets required for the **Test Alignment Report** workflow (`.github/workflows/test-alignment-report.yml`), which generates weekly reports on test coverage gaps, orphaned tests, and other testing issues.

## Required Secrets

### 1. `GITHUB_TOKEN` (Automatic - No Configuration Required)

**Purpose:** Authenticate GitHub Actions workflows to interact with the GitHub API

**Usage in Test Alignment Workflow:**
- Creating/updating GitHub issues with test alignment reports
- Uploading workflow artifacts
- Accessing repository metadata

**Configuration:** 
- ✅ **Automatically provided** by GitHub Actions
- ⚠️ **No manual configuration needed**
- Scope: Read/write access to the repository

**Permissions Required:**
- `issues: write` - Create and update issues
- `contents: read` - Read repository contents
- `actions: read` - Access workflow run metadata

### How GITHUB_TOKEN Works

```yaml
# In the workflow file
- name: Create or update issue
  uses: actions/github-script@v7
  with:
    script: |
      await github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: '📊 Weekly Test Alignment Report',
        body: reportContent
      })
```

The `actions/github-script@v7` action automatically authenticates using `GITHUB_TOKEN` without requiring explicit secret configuration.

## No Additional Secrets Required

The test alignment workflow **does not require any custom secrets** beyond the automatically provided `GITHUB_TOKEN`.

### What the Workflow Does

1. **Checkout repository** - Uses `GITHUB_TOKEN` automatically
2. **Setup Node.js** - No secrets required
3. **Run test alignment script** - Pure filesystem analysis, no API calls
4. **Generate reports** - Creates JSON and Markdown files locally
5. **Upload artifacts** - Uses `GITHUB_TOKEN` automatically
6. **Create/update issues** - Uses `GITHUB_TOKEN` via `github-script` action

## Comparison with Other Workflows

### Similar Workflow: Security Audit

The security audit workflow (`security-audit.yml`) follows the same pattern:

```yaml
- name: Create GitHub Issue on failure
  if: failure()
  uses: actions/github-script@v7  # Uses GITHUB_TOKEN automatically
  with:
    script: |
      await github.rest.issues.create({...})
```

### Workflows That Require Additional Secrets

Some workflows in the repository require custom secrets:

| Workflow | Custom Secrets | Purpose |
|----------|---------------|---------|
| `docker-release.yml` | `PROD_VPS_HOST`, `PROD_VPS_USER`, `PROD_VPS_KEY` | Deploy to production VPS |
| `docker-release.yml` | `PROD_MCP_GITHUB_TOKEN` | Access private repos for MCP |
| `api-schema-tests.yml` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database integration tests |

**Test Alignment Workflow:** ✅ Requires **no custom secrets**

## Verifying Secrets

### Check if GITHUB_TOKEN is Available

The `GITHUB_TOKEN` is automatically available in all GitHub Actions workflows. You can verify it works by checking the workflow run logs:

```yaml
- name: Verify GITHUB_TOKEN
  run: |
    echo "Token is available: ${{ secrets.GITHUB_TOKEN != '' }}"
```

### Required Workflow Permissions

Ensure the workflow has the necessary permissions in the workflow file:

```yaml
permissions:
  contents: read     # Read repository files
  issues: write      # Create/update issues
  actions: read      # Access workflow metadata
```

## Troubleshooting

### Issue: "Resource not accessible by integration"

**Cause:** Workflow doesn't have sufficient permissions

**Solution:** Add or update permissions in the workflow file:

```yaml
permissions:
  issues: write
  contents: read
```

### Issue: "Bad credentials"

**Cause:** GITHUB_TOKEN expired or misconfigured (rare)

**Solution:** 
1. Re-run the workflow (token auto-regenerates)
2. Check repository settings → Actions → General → Workflow permissions
3. Ensure "Read and write permissions" is enabled

### Issue: Cannot create issues

**Cause:** Repository issues are disabled

**Solution:** Enable issues in repository settings:
- Settings → General → Features → ✅ Issues

## Security Best Practices

### GITHUB_TOKEN Scope

The automatically provided `GITHUB_TOKEN`:
- ✅ Is scoped to the current repository only
- ✅ Expires after the workflow completes
- ✅ Cannot access other repositories (unless explicitly configured)
- ✅ Does not have access to repository secrets

### What GITHUB_TOKEN Cannot Do

- ❌ Trigger other workflows (requires `workflow_dispatch` permissions)
- ❌ Access organization-level settings
- ❌ Perform admin actions (unless workflow has `admin` permissions)
- ❌ Access secrets from other repositories

## Summary

**Required Secrets for Test Alignment Workflow:**

| Secret | Type | Configuration Required | Purpose |
|--------|------|----------------------|---------|
| `GITHUB_TOKEN` | Automatic | ❌ No | Create issues, upload artifacts |

**Total Custom Secrets Required:** `0`

**Setup Steps Required:** `0`

The test alignment workflow is **zero-configuration** from a secrets perspective - it will work out of the box in any GitHub repository with GitHub Actions enabled.

## Related Documentation

- [GitHub Actions: Automatic token authentication](https://docs.github.com/en/actions/security-guides/automatic-token-authentication)
- [github-script action](https://github.com/actions/github-script)
- [Test Alignment Report Script](../../scripts/TEST_ALIGNMENT_README.md)
- [All Workflow Secrets Audit](./SECRETS_AUDIT.md)
