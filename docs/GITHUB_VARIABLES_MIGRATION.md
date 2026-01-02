# GitHub Variables Migration Guide

This guide provides step-by-step instructions for migrating non-sensitive configuration values from GitHub Secrets to GitHub Variables.

## Table of Contents

- [Overview](#overview)
- [Pre-Migration Checklist](#pre-migration-checklist)
- [Migration Steps](#migration-steps)
- [Doppler Configuration](#doppler-configuration)
- [Testing & Verification](#testing--verification)
- [Rollback Procedures](#rollback-procedures)
- [FAQ](#faq)

## Overview

### Why Migrate?

GitHub Secrets and Variables serve different purposes:

- **GitHub Secrets** - For sensitive data that must remain encrypted (API keys, passwords, tokens)
- **GitHub Variables** - For non-sensitive configuration that benefits from visibility (URLs, public keys, tenant IDs)

### Benefits

✅ **Better Transparency** - Variables are visible in the UI without decryption  
✅ **Easier Management** - No need to re-enter values to view/edit them  
✅ **Clear Intent** - Distinguishes sensitive from non-sensitive config  
✅ **Audit Compliance** - Clear separation helps security audits  

### Values Being Migrated

The following values are **non-sensitive** and safe to migrate to Variables:

| Current Secret | New Variable | Description |
|----------------|--------------|-------------|
| `VITE_SUPABASE_URL` | `vars.VITE_SUPABASE_URL` | Supabase project URL (public) |
| `VITE_SUPABASE_ANON_KEY` | `vars.VITE_SUPABASE_ANON_KEY` | Anonymous/publishable key (public) |
| `VITE_AISHACRM_BACKEND_URL` | `vars.VITE_AISHACRM_BACKEND_URL` | Backend API URL (public) |
| `SUPABASE_URL` | `vars.SUPABASE_URL` | Supabase project URL (non-sensitive) |
| `TENANT_ID` | `vars.TENANT_ID` | Default test tenant ID (non-sensitive) |

### Values Remaining as Secrets

These values **MUST** remain as secrets:

- `SUPABASE_SERVICE_ROLE_KEY` - Admin access key (bypasses RLS)
- `PROD_VPS_SSH_KEY` - SSH private key for deployment
- `PROD_VPS_HOST`, `PROD_VPS_USER`, `PROD_VPS_PORT` - Production server details
- `PROD_MCP_GITHUB_TOKEN` - GitHub authentication token
- `JWT_SECRET`, `SESSION_SECRET` - Encryption keys
- `DATABASE_URL` - Database connection string with credentials
- `GITHUB_TOKEN` - Built-in Actions token (automatic)

## Pre-Migration Checklist

Before starting the migration, verify:

- [ ] GitHub CLI (`gh`) is installed and authenticated
  ```bash
  gh --version
  gh auth status
  ```

- [ ] You have admin access to the repository
  ```bash
  gh repo view andreibyf/aishacrm-2 --json permissions
  ```

- [ ] Current secrets are documented
  ```bash
  gh secret list
  ```

- [ ] You have the secret values available (cannot be retrieved from GitHub)
  - Check Doppler: `doppler secrets`
  - Check local `.env` files
  - Check password manager or secure notes

- [ ] All workflows are passing
  ```bash
  gh run list --limit 5
  ```

- [ ] You have tested the migration script in dry-run mode
  ```bash
  ./scripts/migrate-to-variables.sh --dry-run
  ```

## Migration Steps

### Step 1: Audit Current State

Run the audit script to see current secrets and variables:

```bash
# View current state with colored output
node scripts/audit-github-secrets.cjs

# Generate detailed report
node scripts/audit-github-secrets.cjs --format markdown > pre-migration-audit.md
```

**Expected output:** Should flag 5 values with ⚠️ "should be variable"

### Step 2: Backup Current Configuration

Create a backup of current secrets (values cannot be retrieved, so note them from Doppler or .env):

```bash
# List current secrets
gh secret list > pre-migration-secrets-list.txt

# Backup workflow files
mkdir -p .github/workflows-backup
cp .github/workflows/*.yml .github/workflows-backup/
```

### Step 3: Run Migration Script

#### Option A: Interactive Mode (Recommended)

```bash
./scripts/migrate-to-variables.sh
```

This will:
1. Show the migration plan
2. Prompt for confirmation
3. Ask for each variable value
4. Create the variables in GitHub
5. Verify creation

#### Option B: Non-Interactive Mode

```bash
./scripts/migrate-to-variables.sh --yes
```

**Note:** You'll still need to provide values for each variable when prompted.

### Step 4: Verify Variables Created

Check that variables were created successfully:

```bash
# List all repository variables
gh variable list

# Expected output should include:
# VITE_SUPABASE_URL
# VITE_SUPABASE_ANON_KEY
# VITE_AISHACRM_BACKEND_URL
# SUPABASE_URL
# TENANT_ID
```

### Step 5: Update Workflow Files

The workflow files have already been updated in this PR. They now use:

- `vars.VITE_SUPABASE_URL` instead of `secrets.VITE_SUPABASE_URL`
- `vars.VITE_SUPABASE_ANON_KEY` instead of `secrets.VITE_SUPABASE_ANON_KEY`
- `vars.VITE_AISHACRM_BACKEND_URL` instead of `secrets.VITE_AISHACRM_BACKEND_URL`
- `vars.SUPABASE_URL` instead of `secrets.SUPABASE_URL`
- `vars.TENANT_ID` instead of `secrets.TENANT_ID`

**Changed files:**
- `.github/workflows/docker-release.yml`
- `.github/workflows/backend-tests.yml`
- `.github/workflows/mcp-audit-test.yml`

### Step 6: Test Workflows

Trigger test workflows to ensure they work with the new variables:

```bash
# Trigger backend tests
gh workflow run backend-tests.yml

# Trigger MCP audit test
gh workflow run mcp-audit-test.yml

# Check workflow run status
gh run list --limit 3
gh run view <run-id>
```

### Step 7: Delete Old Secrets (Optional)

Once workflows are confirmed working, you can delete the old secrets:

```bash
# Delete the migrated secrets (optional - they're harmless)
gh secret delete VITE_SUPABASE_URL
gh secret delete VITE_SUPABASE_ANON_KEY
gh secret delete VITE_AISHACRM_BACKEND_URL
gh secret delete SUPABASE_URL
gh secret delete TENANT_ID
```

**⚠️ Warning:** Only do this after confirming workflows work with variables!

### Step 8: Run Post-Migration Audit

Verify the migration is complete:

```bash
# Run audit script
node scripts/audit-github-secrets.cjs

# Expected: No more ⚠️ "should be variable" warnings
# Generate report
node scripts/audit-github-secrets.cjs --format markdown > post-migration-audit.md
```

## Doppler Configuration

### Understanding Doppler's Role

Doppler is used for:
- **Local development** - Injecting secrets into your dev environment
- **Docker containers** - Runtime secret injection
- **GitHub sync** - Automatically syncing secrets to GitHub (one-way)

### Doppler GitHub Integration

**Key Points:**

1. **Doppler only syncs to Secrets** - Not Variables
2. **This is by design** - Doppler treats everything as sensitive
3. **You'll manage Variables manually** - Use `gh` CLI or GitHub UI

### What to Do About Doppler

#### Option 1: Keep Doppler Sync for Secrets Only (Recommended)

Configure Doppler to only sync true secrets:

```bash
# View current Doppler sync configuration
doppler integrations

# You may need to update the Doppler → GitHub sync
# to exclude the 5 migrated values
```

**In Doppler Dashboard:**
1. Go to Integrations → GitHub Actions
2. Update sync rules to exclude:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_AISHACRM_BACKEND_URL`
   - `SUPABASE_URL`
   - `TENANT_ID`

#### Option 2: Keep Values in Doppler, Manually Copy to Variables

If you want to keep all values in Doppler for local dev:

```bash
# Get values from Doppler
doppler secrets get VITE_SUPABASE_URL --plain
doppler secrets get VITE_SUPABASE_ANON_KEY --plain
# etc.

# Set as GitHub Variables
echo "value" | gh variable set VITE_SUPABASE_URL
# etc.
```

### Local Development Unchanged

**Important:** Local development with Doppler continues to work exactly as before!

```bash
# Still works the same
doppler run -- npm run dev
doppler run -- docker compose up
```

Doppler will inject all values (both secrets and non-secrets) for local use.

## Testing & Verification

### Test 1: Workflow Syntax

Validate workflow files:

```bash
# GitHub CLI can validate workflow syntax
gh workflow list

# No errors = syntax is valid
```

### Test 2: Backend Tests

Run backend tests to verify Supabase connection:

```bash
gh workflow run backend-tests.yml --ref main
gh run watch
```

### Test 3: MCP Audit Test

Test MCP server with new variables:

```bash
gh workflow run mcp-audit-test.yml --ref main
gh run watch
```

### Test 4: Docker Release (Dry Run)

Create a test tag to verify Docker builds work:

```bash
# Create and push a test tag
git tag -a v0.0.0-test -m "Test tag for variables migration"
git push origin v0.0.0-test

# Watch the build
gh run list --workflow=docker-release.yml --limit 1
gh run watch

# Delete test tag after verification
git tag -d v0.0.0-test
git push --delete origin v0.0.0-test
```

### Test 5: Full Integration

After confirming individual workflows work:

1. Create a PR with a small change
2. Verify all CI checks pass
3. Merge to main
4. Verify deployment succeeds

## Rollback Procedures

If something goes wrong, you can rollback the migration.

### Quick Rollback

```bash
# Rollback script deletes variables
./scripts/rollback-variables.sh

# With workflow restoration
./scripts/rollback-variables.sh --restore-workflows
```

### Manual Rollback

#### Step 1: Delete Variables

```bash
gh variable delete VITE_SUPABASE_URL
gh variable delete VITE_SUPABASE_ANON_KEY
gh variable delete VITE_AISHACRM_BACKEND_URL
gh variable delete SUPABASE_URL
gh variable delete TENANT_ID
```

#### Step 2: Restore Workflow Files

```bash
# From backup
cp .github/workflows-backup/*.yml .github/workflows/

# Or from git history
git checkout HEAD~1 -- .github/workflows/docker-release.yml
git checkout HEAD~1 -- .github/workflows/backend-tests.yml
git checkout HEAD~1 -- .github/workflows/mcp-audit-test.yml
```

#### Step 3: Re-create Secrets (If Deleted)

```bash
# If you deleted the secrets, re-create them
echo "value" | gh secret set VITE_SUPABASE_URL
# etc.
```

#### Step 4: Test Workflows

```bash
gh workflow run backend-tests.yml
gh run watch
```

## FAQ

### Q: Are anonymous keys really safe to expose?

**A:** Yes! Supabase anonymous keys are designed to be public. They're:
- Embedded in client-side JavaScript (visible to everyone)
- Protected by Row-Level Security (RLS) policies
- Different from the service role key (which is truly sensitive)

See: [Supabase API Keys Documentation](https://supabase.com/docs/guides/api/api-keys)

### Q: Why keep SUPABASE_URL as a variable but SUPABASE_SERVICE_ROLE_KEY as a secret?

**A:** 
- `SUPABASE_URL` - Just a URL, publicly visible anyway
- `SUPABASE_SERVICE_ROLE_KEY` - Admin access key that bypasses RLS

### Q: Will this affect local development?

**A:** No! Doppler continues to inject all values for local development, regardless of how they're stored in GitHub.

### Q: Can I still use Doppler for everything?

**A:** Yes! Keep using Doppler locally. Just manage GitHub Variables separately for CI/CD.

### Q: What if I accidentally commit a variable value to git?

**A:** Variables are non-sensitive, so this is not a security risk. But for cleanliness:
1. Remove the value from git history if desired
2. Keep `.env` files in `.gitignore`

### Q: Do I need to update Doppler configuration?

**A:** Optional. You can:
- **Option 1:** Update Doppler GitHub sync to exclude the 5 variables
- **Option 2:** Leave Doppler syncing everything, manually manage variables

### Q: How do I update a variable value?

**A:** 
```bash
# Using gh CLI
echo "new-value" | gh variable set VARIABLE_NAME

# Or in GitHub UI
# Settings → Secrets and variables → Actions → Variables tab
```

### Q: Can I see variable values in the GitHub UI?

**A:** Yes! That's one of the key benefits. Go to:
```
Settings → Secrets and variables → Actions → Variables tab
```

### Q: What happens if both secret and variable exist with the same name?

**A:** The secret takes precedence. Workflows will use `secrets.NAME` if it exists, even if `vars.NAME` also exists.

### Q: Should I run this migration on production immediately?

**A:** No! Follow this rollout:
1. Test in development/staging first
2. Verify all workflows pass
3. Monitor for 24-48 hours
4. Then apply to production

## Troubleshooting

### Issue: "gh: command not found"

**Solution:** Install GitHub CLI:
```bash
# macOS
brew install gh

# Linux (Debian/Ubuntu)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Windows
choco install gh
```

### Issue: "HTTP 403: Resource not accessible by integration"

**Solution:** Authenticate with sufficient permissions:
```bash
gh auth login
# Choose: GitHub.com → HTTPS → Yes (authenticate Git) → Login with browser
```

### Issue: "Variable already exists"

**Solution:** Delete and recreate:
```bash
gh variable delete VARIABLE_NAME
echo "value" | gh variable set VARIABLE_NAME
```

### Issue: Workflow still using old secret

**Solution:** Check workflow file:
```bash
grep -n "secrets.VITE" .github/workflows/*.yml
# Should show nothing
grep -n "vars.VITE" .github/workflows/*.yml
# Should show the variable references
```

## Support

For questions or issues:

1. Check this documentation
2. Run `node scripts/audit-github-secrets.cjs --help`
3. Run `./scripts/migrate-to-variables.sh --help`
4. Review workflow run logs: `gh run view <run-id>`
5. Open an issue in the repository

## References

- [GitHub Actions: Using secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
- [GitHub Actions: Variables](https://docs.github.com/en/actions/learn-github-actions/variables)
- [Supabase API Keys](https://supabase.com/docs/guides/api/api-keys)
- [Doppler GitHub Integration](https://docs.doppler.com/docs/github-actions)
