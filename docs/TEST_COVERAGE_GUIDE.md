# Test Coverage Guide - AiSHA CRM

## Overview

This guide documents testing practices, conventions, and coverage status for the AiSHA CRM project.

## Test Infrastructure

### Backend Testing
- **Framework**: Node.js built-in test runner (`node:test`)
- **Coverage Tool**: c8
- **Test Location**: `backend/__tests__/`
- **Test Pattern**: `*.test.js`

### Frontend Testing
- **Framework**: Vitest
- **Test Location**: `src/` (co-located with source)
- **Test Pattern**: `*.test.js`, `*.test.jsx`, `*.test.ts`, `*.test.tsx`

### E2E Testing
- **Framework**: Playwright
- **Test Location**: `tests/e2e/`
- **Test Pattern**: `*.spec.js`, `*.spec.ts`

## Running Tests

### Backend Tests

```bash
# All tests
cd backend && npm test

# Specific categories
npm run test:routes       # Route integration tests
npm run test:ai           # AI feature tests
npm run test:auth         # Authentication tests
npm run test:integration  # Integration tests

# With coverage
npm run test:coverage
```

### Frontend Tests

```bash
# All tests
npm run test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### E2E Tests

```bash
# All E2E tests
npx playwright test

# Specific test
npx playwright test tests/e2e/crud-operations.spec.js

# Headed mode (see browser)
npx playwright test --headed

# Debug mode
npx playwright test --debug
```

## Test Patterns

### Backend Route Tests

All backend route tests follow this pattern:

```javascript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Route Name Routes', { skip: !SHOULD_RUN }, () => {
  test('GET /api/endpoint returns expected response', async () => {
    const res = await fetch(`${BASE_URL}/api/endpoint?tenant_id=${TENANT_ID}`);
    assert.ok([200, 401].includes(res.status), `expected 200/401, got ${res.status}`);
    
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(json, 'expected response data');
    }
  });
});
```

**Key Principles:**
1. Use `fetch` for HTTP requests (not supertest)
2. Test status codes, not exact responses
3. Handle both success and auth-required cases
4. Include tenant isolation with `tenant_id`
5. Make tests CI-aware with `SHOULD_RUN` flag
6. Skip tests gracefully if dependencies unavailable

### Frontend Component Tests

```javascript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Component from './Component';

describe('Component', () => {
  it('renders correctly', () => {
    render(<Component />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### E2E Test Patterns

```javascript
import { test, expect } from '@playwright/test';

test('user can complete workflow', async ({ page }) => {
  await page.goto('/');
  await page.click('button[data-testid="start"]');
  await expect(page.locator('.result')).toBeVisible();
});
```

## Coverage Status

### Backend Routes

**Tested Routes (41):**
- ✅ accounts.js
- ✅ activities.js
- ✅ ai.js
- ✅ aicampaigns.js
- ✅ aiRealtime.js (NEW)
- ✅ aiSettings.js (NEW)
- ✅ announcements.js (NEW)
- ✅ apikeys.js (NEW)
- ✅ audit-logs.js (NEW)
- ✅ auth.js
- ✅ contacts.js
- ✅ cron.js
- ✅ employees.js
- ✅ entitylabels.js
- ✅ leads.js
- ✅ memory-mcp.js
- ✅ metrics.js (NEW)
- ✅ notes.js
- ✅ opportunities.js
- ✅ reports.js
- ✅ security-system.js
- ✅ storage.js
- ✅ telephony.js
- ✅ tenants.js
- ✅ testing.js
- ✅ users.js (comprehensive)
- ✅ utils.js
- ✅ webhooks.js
- ✅ workflows.js
- ... (35 total with variants)

**Untested Routes (41):**
- ❌ accounts.v2.js
- ❌ activities.v2.js
- ❌ aiSummary.js
- ❌ assistant.js
- ❌ billing.js
- ❌ bizdev.js
- ❌ bizdevsources.js
- ❌ braidAudit.js
- ❌ braidChain.js
- ❌ braidGraph.js
- ❌ braidMetrics.js
- ❌ cashflow.js
- ❌ clients.js
- ❌ construction-*.js
- ❌ contacts.v2.js
- ❌ dashboard-funnel.js
- ❌ database.js
- ❌ devai.js
- ❌ documentation.js
- ❌ documentationfiles.js
- ❌ documents.js
- ❌ documents.v2.js
- ❌ edgeFunctions.js
- ❌ github-issues.js
- ❌ integrations.js
- ❌ leads.v2.js
- ❌ mcp.js (integration test exists)
- ❌ memory.js
- ❌ modulesettings.js
- ❌ notifications.js
- ❌ opportunities.v2.js
- ❌ permissions.js
- ❌ reports.v2.js
- ❌ security.js
- ❌ suggestions.js
- ❌ supabaseProxy.js
- ❌ synchealths.js
- ❌ system.js
- ❌ system-logs.js
- ❌ system-settings.js
- ❌ ... (see full list in issue)

### Coverage Targets

| Category | Current | Target |
|----------|---------|--------|
| Backend Routes | ~54% (41/76 routes) | 80% |
| Backend Code | TBD | 60% |
| Frontend Components | ~40% (27 files) | 50% |
| E2E Critical Flows | ~50% (8 specs) | 90% |

## CI Integration

### GitHub Actions Workflows

1. **backend-tests.yml** - Runs on backend changes
   - Unit tests (always run)
   - Integration tests (requires Supabase)
   - Coverage reporting (c8)
   - Uploads coverage artifacts

2. **api-schema-tests.yml** - Validates API schemas
   - Form validation
   - API schema validation

### Coverage Reporting

Coverage is automatically generated on CI:
1. Tests run with `npm run test:coverage`
2. c8 generates HTML and JSON reports
3. Reports uploaded as artifacts
4. Summary posted to PR (via GitHub Step Summary)

### Future Enhancements

- [ ] Coverage badges in README
- [ ] Codecov integration
- [ ] Coverage thresholds enforcement
- [ ] Fail CI on coverage drop >5%
- [ ] Per-PR coverage diff

## Writing New Tests

### 1. Choose Test Type

- **Unit Test**: Testing individual functions/classes
  - Backend: `backend/__tests__/lib/`, `backend/__tests__/utils/`
  - Frontend: Co-located with source

- **Integration Test**: Testing route handlers, API interactions
  - Backend: `backend/__tests__/routes/`, `backend/__tests__/integration/`

- **E2E Test**: Testing complete user workflows
  - Location: `tests/e2e/`

### 2. Follow Naming Convention

```
backend/__tests__/routes/myroute.route.test.js
backend/__tests__/ai/myfeature.test.js
src/components/MyComponent.test.jsx
tests/e2e/my-workflow.spec.js
```

### 3. Use Existing Helpers

```javascript
// Backend
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Frontend
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// E2E
import { test, expect } from '@playwright/test';
```

### 4. Test tenant Isolation

Always include `tenant_id` in backend tests:

```javascript
const res = await fetch(`${BASE_URL}/api/endpoint?tenant_id=${TENANT_ID}`);
```

### 5. Handle Auth States

Test both authenticated and unauthenticated states:

```javascript
// Unauthenticated - should return 401
const res = await fetch(`${BASE_URL}/api/protected`);
assert.equal(res.status, 401);

// Authenticated (when auth tokens available)
const authedRes = await fetch(`${BASE_URL}/api/protected`, {
  headers: { Authorization: `Bearer ${token}` }
});
assert.equal(authedRes.status, 200);
```

## Troubleshooting

### Tests Timing Out

Increase timeout in test file:

```javascript
test('slow operation', { timeout: 60000 }, async () => {
  // test code
});
```

### Tests Failing in CI Only

1. Check environment variables are set
2. Verify Supabase secrets configured
3. Check Redis availability
4. Review CI logs for network issues

### Coverage Not Generating

1. Ensure c8 is installed: `npm install -D c8`
2. Check `package.json` has `test:coverage` script
3. Verify `.c8rc.json` or `c8` config in `package.json`
4. Run locally: `cd backend && npm run test:coverage`

## Resources

- [Node.js Test Runner Docs](https://nodejs.org/api/test.html)
- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/)
- [c8 Coverage Tool](https://github.com/bcoe/c8)

## Contributing

When adding new features:

1. ✅ Write tests BEFORE implementing
2. ✅ Ensure tests pass locally
3. ✅ Run coverage: `npm run test:coverage`
4. ✅ Aim for >80% coverage on new code
5. ✅ Add E2E tests for user-facing features
6. ✅ Update this guide if adding new patterns
