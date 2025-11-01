# End-to-End Testing with Playwright

This directory contains Playwright E2E tests for Aisha CRM, focusing on CRUD operations across all major entities.

## Setup

1. **Install Playwright:**
   ```powershell
   npm install
   npx playwright install
   ```

2. **Ensure backend and frontend are configured:**
   - Copy `.env.example` to `.env` if not already done
   - Configure `VITE_AISHACRM_BACKEND_URL` and database credentials
   - Apply migrations: `cd backend && node apply-supabase-migrations.js`

## Running Tests

### Run all tests (headless):
```powershell
npm run test:e2e
```

### Run tests with UI (interactive):
```powershell
npm run test:e2e:ui
```

### Debug tests:
```powershell
npm run test:e2e:debug
```

### View test report:
```powershell
npm run test:e2e:report
```

### Run specific test file:
```powershell
npx playwright test tests/e2e/crud-operations.spec.js
```

### Run tests in specific browser:
```powershell
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Test Coverage

The E2E test suite covers:

### Activities CRUD
- ✅ Create activity with all fields (subject, type, description, due_date, due_time, priority)
- ✅ Edit activity and update status to "completed"
- ✅ Delete activity with confirmation
- ✅ Validate required fields enforcement

### Leads CRUD
- ✅ Create lead with contact information
- ✅ Update lead job_title without date format errors
- ✅ Verify date handling fixes (yyyy-MM-dd format)

### Contacts CRUD
- ✅ Create contact with email and job details
- ✅ Load contact tags without tenant_id errors (verifies fix)

### Opportunities CRUD
- ✅ Create opportunity with amount, stage, close_date

### System Logs CRUD
- ✅ Create test log entry
- ✅ Clear all logs with confirmation

### Data Type Validation
- ✅ Enforce priority ENUM values (low/normal/high/urgent only)

## Test Configuration

Tests are configured in `playwright.config.js`:

- **Timeout:** 60 seconds per test
- **Retries:** 2 retries on CI, 0 locally
- **Workers:** 1 on CI (sequential), parallel locally
- **Browsers:** Chromium, Firefox, WebKit
- **Screenshots:** Only on failure
- **Video:** Retained on failure
- **Trace:** On first retry

## Start Servers (manual, recommended)

Follow the workspace Terminal Rules. Start frontend and backend in separate terminals before running tests:

```powershell
# Terminal 1: Verify location and start services
Get-Location
cd c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53
./start-all.ps1

# Terminal 2: Run tests
npm run test:e2e
```

Note: The Playwright config is set to reuse existing servers; it does not auto-start them.

## Superuser Session (auto)

Tests run as a SuperAdmin using a persisted login session created at the start of the run.

- Email: `admin@aishacrm.com`
- Password: from `SUPERADMIN_PASSWORD` env var, or fallback `SuperAdmin123!`

The setup test `tests/e2e/auth.setup.js` logs in once and saves storage to `playwright/.auth/superadmin.json`, which is then reused across all browser projects. You typically don't need to run anything extra—just ensure the password env is correct if you've changed it.

## Troubleshooting

### Backend not starting
- Check `.env` file has correct `DATABASE_URL`
- Verify Supabase credentials are valid
- See `backend/TROUBLESHOOTING_NODE_ESM.md`

### Frontend not loading
- Check `VITE_AISHACRM_BACKEND_URL` points to backend (http://localhost:3001)
- Verify port 5173 is not in use

### SuperAdmin login failing
- Ensure the user `admin@aishacrm.com` exists and is active
- Set `SUPERADMIN_PASSWORD` in your environment before running tests
- Delete `playwright/.auth/superadmin.json` to force a fresh login

### Tests timing out
- Increase timeout in `playwright.config.js`
- Check network tab in `--debug` mode for slow API calls

### tenant_id errors
- Ensure migration 012 and 013 are applied
- Check ContactForm passes `selectedTenantId` to entity calls
- Verify `callBackendAPI()` auto-injects tenant_id

### Date format errors
- Verify ActivityForm uses try-catch date parsing
- Check date inputs receive yyyy-MM-dd format (not ISO 8601)
- See `src/components/activities/ActivityForm.jsx` lines 105-135

## CI/CD Integration

For GitHub Actions or similar CI:

```yaml
- name: Install dependencies
  run: npm install

- name: Install Playwright browsers
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true
    VITE_AISHACRM_BACKEND_URL: ${{ secrets.BACKEND_URL }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}

- name: Upload test results
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Adding New Tests

1. Create test file in `tests/e2e/`
2. Use pattern:
   ```javascript
   test.describe('Feature Name', () => {
     test('should do something', async ({ page }) => {
       // Navigate
       await page.goto('/path');
       
       // Interact
       await page.click('button');
       await page.fill('input', 'value');
       
       // Assert
       await expect(page.locator('text=Success')).toBeVisible();
     });
   });
   ```
3. Run test: `npx playwright test --grep "should do something"`

## Best Practices

- ✅ Use descriptive test names with "should" prefix
- ✅ Wait for network idle before interacting
- ✅ Use data attributes for selectors (more stable than text)
- ✅ Clean up test data after tests (or use unique timestamps)
- ✅ Check console for errors with `page.on('console')`
- ✅ Verify backend health before running tests
- ✅ Use `page.waitForLoadState('networkidle')` after navigation

## Related Documentation

- [Playwright Docs](https://playwright.dev)
- [API Error Types](../docs/API_ERROR_TYPES.md)
- [Unit Test Assessment](../docs/UNIT_TEST_ASSESSMENT.md)
- [Backend README](../backend/README.md)
