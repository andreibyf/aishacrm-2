# CI/CD Integration for API Schema Validation Tests

## Overview

The API schema validation tests are integrated into the CI/CD pipeline through two workflows:

1. **Automated Workflow (`api-schema-tests.yml`)** - Runs automatically on push/PR
2. **Manual Workflow (`e2e.yml`)** - Can be triggered manually with the `schema-validation` suite option

---

## 1. Automated Workflow: `api-schema-tests.yml`

### Triggers

The workflow runs automatically on:
- **Push** to `main` or `develop` branches when these paths change:
  - `tests/api-schema-validation.spec.js`
  - `backend/routes/**`
  - `backend/migrations/**`
  - `.github/workflows/api-schema-tests.yml`
- **Pull Requests** targeting `main` or `develop` with changes to the same paths
- **Manual dispatch** via GitHub Actions UI

### What It Does

1. **Sets up test environment:**
   - Spins up PostgreSQL 15 container for isolated testing
   - Installs Node.js 22 and all dependencies
   - Runs database migrations to create test schema

2. **Starts backend server:**
   - Launches backend on `http://localhost:4001`
   - Waits for health check to pass (30 retries, 2s intervals)
   - Validates backend is responding before running tests

3. **Runs tests:**
   - Executes all 27 API schema validation tests
   - Uses Playwright's `request` context for direct HTTP calls
   - Tests against test tenant `6cb4c008-4847-426a-9a2e-918ad70e7b69`

4. **Reports results:**
   - Uploads test results and Playwright report as artifacts
   - Comments on PRs with test summary and coverage breakdown
   - Shows pass/fail status with detailed metrics

### Configuration Options

**Environment Variables:**
- `PLAYWRIGHT_BACKEND_URL` - Backend URL to test (default: `http://localhost:4001`)
- `USE_SUPABASE_PROD` - Use Supabase production database instead of local PostgreSQL

**Workflow Inputs (Manual Dispatch):**
- `backend_url` - Custom backend URL to test against
- `use_supabase` - Boolean flag to use Supabase production database

### Setup Requirements

**No GitHub Secrets Required** for basic operation with local PostgreSQL.

**Optional Secrets** (for Supabase testing):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin access

### Example PR Comment

```
## 🧪 API Schema Validation Results

✅ **All tests passed!** (27 tests)

### Coverage
- ✅ Employees (7 tests)
- ✅ Accounts (3 tests)
- ✅ Contacts (4 tests)
- ✅ Leads (4 tests)
- ✅ Opportunities (4 tests)
- ✅ Email Uniqueness (3 tests)

[View full report in artifacts](../actions/runs/123456789)
```

---

## 2. Manual Workflow: `e2e.yml` (Enhanced)

### New Option

Added `schema-validation` to the suite dropdown menu:
- **metrics** - API metrics smoke tests
- **rls** - Row-level security enforcement
- **rate-limit** - Rate limiting tests
- **notifications** - Notification system tests
- **tenant** - Tenant switching tests
- **crud** - CRUD operations tests
- **schema-validation** - API schema validation (27 tests) ← NEW
- **all** - All E2E tests (excludes schema-validation)

### How to Use

1. Go to **Actions** → **E2E Tests** in GitHub
2. Click **Run workflow**
3. Select **schema-validation** from the suite dropdown
4. Optionally specify:
   - Git ref (branch/tag/commit)
   - Backend URL (if testing against deployed environment)
   - Frontend URL (not used for schema tests, but required by workflow)
5. Click **Run workflow**

### When to Use Manual vs Automated

**Use Automated (`api-schema-tests.yml`):**
- Testing changes during development (PR reviews)
- Continuous validation on every push to main/develop
- Isolated test environment (dedicated PostgreSQL container)
- Fastest feedback loop (~2-3 minutes total)

**Use Manual (`e2e.yml`):**
- Testing against deployed environments (staging, production)
- One-off validation after manual deployments
- Troubleshooting schema issues in specific environments
- Uses self-hosted runner with existing infrastructure

---

## Test Coverage

### Entities Tested (27 Total Tests)

#### Employees (7 tests)
- ✅ Create with minimal required fields (first_name, last_name)
- ✅ Create with all optional fields
- ✅ Store non-core fields in metadata JSONB
- ✅ Create without email (email is optional)
- ✅ Reject missing required fields
- ✅ Accept valid metadata structure
- ✅ Email uniqueness within tenant

#### Accounts (3 tests)
- ✅ Create with minimal required fields (name)
- ✅ Store non-core fields in metadata
- ✅ Reject missing required fields

#### Contacts (4 tests)
- ✅ Create with minimal required fields (first_name, last_name)
- ✅ Store non-core fields in metadata
- ✅ Create without email
- ✅ Reject missing required fields

#### Leads (4 tests)
- ✅ Create with minimal required fields (first_name, last_name, source)
- ✅ Store non-core fields in metadata
- ✅ Create without email
- ✅ Reject missing required fields

#### Opportunities (4 tests)
- ✅ Create with minimal required fields (name, account_id, stage)
- ✅ Store non-core fields in metadata
- ✅ Default amount to 0 if not provided
- ✅ Reject missing required fields

#### Email Uniqueness (3 tests)
- ✅ Prevent duplicate emails in employees
- ✅ Prevent duplicate emails in contacts
- ✅ Prevent duplicate emails in leads

#### UI Documentation (2 tests)
- ✅ Forms indicate required fields with visual cues
- ✅ Backend validates metadata fields appropriately

---

## Performance Metrics

**Test Execution Time:**
- 27 tests complete in ~7 seconds (local)
- Total workflow time: ~2-3 minutes (including setup)

**Resource Usage:**
- PostgreSQL container: ~100MB memory
- Node.js backend: ~150MB memory
- Total CI runner time: ~3 minutes

**Cost Optimization:**
- Only runs when relevant files change (path filters)
- Uses lightweight PostgreSQL container
- Fast test execution minimizes runner time

---

## Troubleshooting

### Common Issues

#### 1. Backend Health Check Fails

**Symptom:** Workflow fails at "Start backend server" step

**Solutions:**
- Check backend dependencies are installed correctly
- Verify database migrations ran successfully
- Review backend logs in workflow output
- Ensure PORT environment variable is set correctly

#### 2. Tests Timeout

**Symptom:** Tests hang or timeout after 30 seconds

**Solutions:**
- Verify backend is listening on correct port (4001)
- Check PLAYWRIGHT_BACKEND_URL has trailing slash (`/api/`)
- Ensure PostgreSQL container is healthy
- Review network connectivity in workflow logs

#### 3. Migration Errors

**Symptom:** Database schema setup fails

**Solutions:**
- Verify all migration files are valid SQL
- Check migrations are in correct order (numbered correctly)
- Ensure PostgreSQL version compatibility (using 15)
- Review migration error messages for syntax issues

#### 4. Test Failures After Schema Changes

**Symptom:** Tests fail after modifying backend routes or database schema

**Solutions:**
- Update tests to match new schema requirements
- Verify route paths haven't changed
- Check response structure matches test assertions
- Run tests locally first before pushing

### Debugging Commands

**Run tests locally:**
```powershell
# Start backend first
cd backend
npm run dev

# In separate terminal, run tests
npx playwright test tests/api-schema-validation.spec.js --reporter=list
```

**Check test tenant data:**
```powershell
# From root directory
node -e "
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
client.from('employees').select('*').eq('tenant_id', '6cb4c008-4847-426a-9a2e-918ad70e7b69').then(console.log);
"
```

**View backend logs in CI:**
- Go to failed workflow run
- Click on "Start backend server" step
- Expand "Run npm run dev" section
- Review startup logs and error messages

---

## Maintenance

### Adding New Tests

1. Edit `tests/api-schema-validation.spec.js`
2. Add new test cases following existing patterns
3. Update coverage counts in this documentation
4. Push changes - workflow will run automatically

### Modifying Workflow Triggers

Edit `.github/workflows/api-schema-tests.yml`:
- Add/remove branches in `push.branches` and `pull_request.branches`
- Add/remove file paths in `push.paths` and `pull_request.paths`
- Adjust timeout in `jobs.api-schema-validation.timeout-minutes`

### Updating Database Schema

After adding migrations:
1. Tests will automatically run new migrations
2. Verify tests still pass with new schema
3. Update tests if new fields affect validation logic

---

## Security Considerations

### Secrets Management

**Not Required:**
- No secrets needed for basic PostgreSQL testing
- Workflow creates ephemeral test database

**Optional:**
- `SUPABASE_URL` - Only if testing against Supabase production
- `SUPABASE_SERVICE_ROLE_KEY` - Only for Supabase production testing

**Best Practices:**
- Use repository secrets, not environment secrets
- Rotate keys regularly
- Limit Supabase key permissions to test operations only
- Never commit secrets to code

### Permissions

Workflow requires:
- `contents: read` - Read repository code
- `pull-requests: write` - Comment on PRs with results

---

## Future Enhancements

### Potential Improvements

1. **Parallel Execution:**
   - Run tests in parallel workers for faster execution
   - Split tests by entity type

2. **Coverage Reporting:**
   - Generate code coverage reports
   - Track API endpoint coverage percentage

3. **Performance Baselines:**
   - Track test execution time trends
   - Alert on performance regressions

4. **Multi-Database Testing:**
   - Test against multiple PostgreSQL versions
   - Verify compatibility with different database configurations

5. **Integration with Monitoring:**
   - Send test results to monitoring dashboard
   - Alert on consecutive failures

---

## Related Documentation

- **Manual Testing:** `MANUAL_TEST_CHECKLIST.md`
- **Form Validation:** `FORM_VALIDATION_ALIGNMENT.md`
- **Backend Routes:** `backend/README.md`
- **Database Schema:** `backend/migrations/README.md`
- **E2E Testing:** `tests/e2e/README.md`

---

## Support

For questions or issues with the CI/CD integration:
1. Check this documentation first
2. Review workflow run logs in GitHub Actions
3. Run tests locally to reproduce issues
4. Check existing GitHub issues or create new one

---

**Last Updated:** 2025-01-20  
**Workflow Version:** 1.0  
**Test Count:** 27 tests across 5 entities
