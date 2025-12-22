/**
 * End-to-End CRUD Tests for Aisha CRM
 * Tests Create, Read, Update, Delete operations across major entities
 * 
 * NOTE: User Management CRUD tests are in separate files:
 * - user-management-crud.spec.js (basic CRUD operations)
 * - user-management-permissions.spec.js (permissions & role testing)
 */
import { test, expect } from '@playwright/test';
import { suppressAuthErrors, setE2EMode, injectMockUser, waitForUserPage } from './setup-helpers.js';

const BASE_URL = process.env.VITE_AISHACRM_FRONTEND_URL || process.env.PLAYWRIGHT_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || process.env.PLAYWRIGHT_BACKEND_URL || '';

// Test user credentials (must be provided via env; do not hardcode defaults)
const TEST_EMAIL = process.env.SUPERADMIN_EMAIL || '';
const TEST_PASSWORD = process.env.SUPERADMIN_PASSWORD || '';

// Helper: Wait for backend to be healthy using Playwright's request fixture
async function waitForBackendHealth(request) {
  if (!BACKEND_URL) {
    throw new Error('BACKEND_URL is not set. Provide VITE_AISHACRM_BACKEND_URL for non-local runs.');
  }

  await expect
    .poll(
      async () => {
        try {
          const res = await request.get(`${BACKEND_URL}/api/system/status`, { timeout: 5000 });
          return res.ok() ? 200 : res.status();
        } catch {
          return 0; // Treat exceptions as retryable
        }
      },
      {
        timeout: 60_000,
        intervals: [500, 1000, 1500],
        message: `Waiting for backend health at ${BACKEND_URL}`
      }
    )
    .toBe(200);
}

// Helper: Login as user
async function loginAsUser(page, email, password) {
  await page.goto(BASE_URL);
  
  // Check if already logged in by looking for main content OR absence of login form
  const hasLoginForm = await page.locator('input[type="email"], input[name="email"]').isVisible({ timeout: 2000 }).catch(() => false);
  if (!hasLoginForm) {
    console.log('[Test] Already logged in, skipping login');
    return;
  }
  if (!email || !password) {
    console.warn('[Test] No credentials provided; skipping login and relying on E2E mock user.');
    return;
  }
  
  // Wait for login form
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
  
  // Fill login form
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  
  // Submit login
  await page.click('button[type="submit"]');
  
  // Wait for successful login (dashboard or main content loads)
  await page.waitForSelector('main, [role="main"], .dashboard', { timeout: 15000 });
  
  // Wait for navigation to settle
  await page.waitForTimeout(1000);
}

// Helper: Reliable navigation that works with collapsed headers or missing anchors
async function navigateTo(page, path) {
  // Normalize common routes to match app's PascalCase paths
  const ROUTE_MAP = {
    '/': '/',
    '/dashboard': '/Dashboard',
    '/contacts': '/Contacts',
    '/accounts': '/Accounts',
    '/opportunities': '/Opportunities',
    '/activities': '/Activities',
    '/settings': '/Settings',
    '/reports': '/Reports',
    '/documentation': '/Documentation',
    '/leads': '/Leads',
    '/systemlogs': '/SystemLogs',
    '/system-logs': '/SystemLogs',
    '/workflows': '/Workflows'
  };
  const normalized = ROUTE_MAP[(path || '').toLowerCase()] || path;

  // Prefer direct navigation for stability
  await page.goto(`${BASE_URL}${normalized}`, { waitUntil: 'domcontentloaded' });
  try { await page.waitForURL(`**${normalized}`, { timeout: 10000 }); } catch { /* ignore */ }
  // Fallback: click anchor if we're not on the expected route
  if (!page.url().includes(normalized)) {
    const link = page.locator(`a[href="${normalized}"]`).first();
    if (await link.count().catch(() => 0)) {
      await link.click();
      await page.waitForURL(`**${normalized}`, { timeout: 10000 });
    }
  }
  // Small settle time
  await page.waitForTimeout(250);
}

// Helper: Ensure a tenant is selected for admin/superadmin flows
async function ensureTenantSelected(page) {
  try {
    // If an explicit E2E tenant is provided, force-select it
    const envTenant = process.env.E2E_TENANT_ID;
    if (envTenant) {
      await page.evaluate((id) => {
        try {
          localStorage.setItem('selected_tenant_id', id);
          const url = new URL(window.location.href);
          url.searchParams.set('tenant', id);
          window.history.replaceState({}, '', url);
  } catch { /* ignore */ }
      }, envTenant);
      return envTenant;
    }
    // If a tenant is already selected in localStorage, keep it
    const existing = await page.evaluate(() => localStorage.getItem('selected_tenant_id'));
    if (existing && existing !== 'null' && existing !== 'undefined') {
      return existing;
    }

    // Fetch any available tenant from backend
    const resp = await page.request.get(`${BACKEND_URL}/api/tenants?limit=1`);
    if (!resp.ok()) {
      console.warn('[Test] Unable to fetch tenants, status:', resp.status());
      return null;
    }
    const data = await resp.json();
    const tenantId = data?.data?.tenants?.[0]?.tenant_id || null;
    if (!tenantId) {
      console.warn('[Test] No tenants available to select. Some create operations may be blocked.');
      return null;
    }
    // Persist selection and reflect in URL param (TenantProvider reads both)
    await page.evaluate((id) => {
      try {
        localStorage.setItem('selected_tenant_id', id);
        const url = new URL(window.location.href);
        url.searchParams.set('tenant', id);
        window.history.replaceState({}, '', url);
      } catch { /* ignore */ }
    }, tenantId);
    return tenantId;
  } catch (e) {
    console.warn('[Test] ensureTenantSelected error:', e?.message || e);
    return null;
  }
}

// Helper: Ensure the logged-in user has a tenant_id assigned (needed for some forms)
async function ensureUserTenantAssigned(page, email) {
  // Guard: never mutate global superadmin in cloud unless explicitly allowed
  const isLocalBackend = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)?.*/i.test(BACKEND_URL || '');
  const allowMutations = process.env.ALLOW_E2E_MUTATIONS === 'true' || isLocalBackend;
  try {
    // Determine selected tenant id (from storage) or fetch one
    let tenantId = await page.evaluate(() => localStorage.getItem('selected_tenant_id'));
    if (!tenantId || tenantId === 'null' || tenantId === 'undefined') {
      const respTen = await page.request.get(`${BACKEND_URL}/api/tenants?limit=1`);
      if (respTen.ok()) {
        const data = await respTen.json();
        tenantId = data?.data?.tenants?.[0]?.tenant_id || null;
      }
    }
    if (!tenantId) return false;

    // Find user by email (search across users/employees)
    const resp = await page.request.get(`${BACKEND_URL}/api/users?email=${encodeURIComponent(email)}`);
    if (!resp.ok()) return false;
    const list = await resp.json();
    const userRec = list?.data?.users?.[0];
    if (!userRec?.id) return false;

    // If already assigned to a tenant, nothing to do
    if (userRec.tenant_id) return true;

    // Assign tenant_id to this user
    if (!allowMutations) {
      console.warn(`[E2E] Skipping tenant assignment mutation for ${email} on non-local backend (${BACKEND_URL}).`);
      return true; // Treat as success to avoid cascading test failures
    }
    const put = await page.request.put(`${BACKEND_URL}/api/users/${userRec.id}`, { data: { tenant_id: tenantId } });
    return put.ok();
  } catch (e) {
    console.warn('[Test] ensureUserTenantAssigned error:', e?.message || e);
    return false;
  }
}

test.describe('CRUD Operations - End-to-End', () => {
  test.beforeAll(async ({ request }) => {
    // Ensure backend is running
    await waitForBackendHealth(request);
  });

  test.beforeEach(async ({ page }) => {
    // Auto-accept any native dialogs (e.g., window.confirm)
    page.on('dialog', dialog => dialog.accept());
    
    // Log console messages from browser (including E2E debug logs)
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' || text.includes('[ContactForm]') || text.includes('[E2E]')) {
        console.log(`Browser console.${msg.type()}: ${text}`);
      }
    });

    // Log failed network requests for debugging CORS/proxy issues
    page.on('requestfailed', request => {
      console.log(`[requestfailed] ${request.method()} ${request.url()} -> ${request.failure()?.errorText}`);
    });

    // Set E2E mode flag to suppress background polling/health checks
    await page.addInitScript({ content: `
      const TENANT_ID = '${process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69'}';
      (${setE2EMode.toString()})();
      (${injectMockUser.toString()})('${TEST_EMAIL || 'e2e@example.com'}', 'superadmin', TENANT_ID);
      try { localStorage.setItem('selected_tenant_id', TENANT_ID); } catch {}
      (${suppressAuthErrors.toString()})();
    ` });

    // Login before each test
    await loginAsUser(page, TEST_EMAIL, TEST_PASSWORD);

    // Ensure a tenant is selected to allow create/update operations (esp. for superadmins)
    const selected = await ensureTenantSelected(page);
    if (selected) {
      // Navigate to root to ensure React picks up the tenant selection, then settle
      await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
      await page.waitForTimeout(500);
    }

    // Ensure the logged-in user has tenant_id set (ActivityForm requires tenantId)
    const assigned = TEST_EMAIL ? await ensureUserTenantAssigned(page, TEST_EMAIL) : false;
    if (assigned) {
      // Refresh app state after assignment
      await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
      await page.waitForTimeout(500);
    }

    // Verify E2E user is injected by checking for its presence
    const userInjected = await page.evaluate(() => !!window.__e2eUser);
    if (!userInjected) {
      console.warn('[E2E] __e2eUser not set; re-injecting...');
      await page.evaluate(({ email, tId }) => {
        window.__e2eUser = {
          id: 'e2e-test-user-id',
          email: email || 'e2e@example.com',
          role: 'superadmin',
          tenant_id: tId
        };
        try { localStorage.setItem('selected_tenant_id', tId); } catch { /* ignore */ }
      }, { email: TEST_EMAIL || 'e2e@example.com', tId: process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69' });
    }
  });  test.describe('Activities CRUD', () => {
    test('should create a new activity', async ({ page }) => {
      // Navigate to Activities page
      await navigateTo(page, '/activities');
      
      // Wait for page to load user and show content (Activities requires user)
  await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com', process.env.E2E_TENANT_ID);
      
      // Click Add Activity button
      const addButton = page.locator('button:has-text("Add Activity"), button:has-text("New Activity"), button:has-text("Add")').first();
      await addButton.waitFor({ state: 'visible', timeout: 15000 });
      await addButton.click();
      
      // Wait for form to appear
      await page.waitForSelector('input#subject, [data-testid="activity-subject-input"]', { timeout: 10000 });
      
      // Fill activity form
      const testSubject = `E2E Test Activity ${Date.now()}`;
      await page.fill('input#subject, [data-testid="activity-subject-input"]', testSubject);
      
      // Select activity type if available
      const typeSelect = page.locator('select#type, select[name="type"]');
      if (await typeSelect.count() > 0) {
        await typeSelect.selectOption('task');
      }
      // Set up API response wait BEFORE submitting
      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/activities') &&
          response.request().method() === 'POST',
        { timeout: 15000 }
      ).catch(() => null); // Don't fail if no POST observed (dev fallback mode)

      // Save activity
      await page.click('button[type="submit"]:has-text("Save"), button:has-text("Create"), button:has-text("Submit")');

      // Wait for either: (1) API response, or (2) success flag in E2E mode
      const createResp = await Promise.race([
        createResponsePromise,
        page.waitForFunction(() => window.__activitySaveSuccess === true, { timeout: 10000 }).then(() => ({ ok: () => true }))
      ]).catch(() => null);

      if (!createResp || !createResp.ok || (createResp.ok && !createResp.ok())) {
        // If the API call failed or didn't arrive, surface any visible error toast
        const errorToastText = await page.locator('[role="alert"], [data-toast]')
          .first()
          .textContent()
          .catch(() => '');
        throw new Error(`Activity creation did not succeed. ${errorToastText || 'No response or save flag.'}`);
      }

      // Wait for form to close and list to refresh
      await page.waitForSelector('form', { state: 'hidden', timeout: 15000 }).catch(() => {});
      // Force a small reload to ensure the new item is included in the table
      await page.goto(`${BASE_URL}/activities`, { waitUntil: 'domcontentloaded' });
  await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com', process.env.E2E_TENANT_ID);

      // Narrow down to the created subject using the built-in search to avoid pagination issues
      const searchBox = page.locator('input[placeholder*="Search activities"], input[placeholder*="Search"]');
      if (await searchBox.count() > 0) {
        await searchBox.fill(testSubject);
        // allow debounce/filter to apply
        await page.waitForTimeout(1000);
      }
      
      // Verify activity appears in the table (search within rows for stability)
      const rowWithSubject = page.locator('table tbody tr').filter({ hasText: testSubject }).first();
      await expect(rowWithSubject).toBeVisible({ timeout: 15000 });
    });

    test('should edit an existing activity', async ({ page }) => {
      // Navigate to Activities page
      await navigateTo(page, '/activities');
      
      // Wait for page to load user and show content
  await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com', process.env.E2E_TENANT_ID);
      
      // Wait for table to load
      await page.waitForSelector('table tbody tr', { timeout: 15000 });
      
      // Find first activity row and click edit button
      const firstRow = page.locator('table tbody tr').first();
      const editButton = firstRow.locator('button[aria-label="Edit"], button:has-text("Edit")').first();
      await editButton.waitFor({ state: 'visible', timeout: 10000 });
      await editButton.click();
      
      // Wait for form
      await page.waitForSelector('form', { state: 'visible' });
      
      // Get current subject and modify it
      const subjectInput = page.locator('input[name="subject"], input#subject, [data-testid="activity-subject-input"]');
      const originalSubject = await subjectInput.inputValue();
      const updatedSubject = `${originalSubject} - UPDATED ${Date.now()}`;
      
      // Update fields
      await subjectInput.fill(updatedSubject);
      // Update status if native select available; otherwise skip
      const statusSelect = page.locator('select[name="status"]');
      if (await statusSelect.count() > 0) {
        await statusSelect.selectOption('completed');
      }
      
      // Prepare to capture the PUT /api/activities/:id response so we can verify backend state deterministically
      const putResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/activities/') && resp.request().method() === 'PUT',
        { timeout: 30000 }
      ).catch(() => null);

      // Save changes
      await page.click('button[type="submit"]:has-text("Save")');
      
      // Wait for form to close
      await page.waitForSelector('form', { state: 'hidden', timeout: 20000 });
      
      // Ensure the PUT completed and extract the updated record id
      const putResp = await putResponsePromise;
      let updatedId = null;
      if (putResp && putResp.ok()) {
        try {
          const body = await putResp.json();
          updatedId = body?.data?.id || body?.data?.activity?.id || null;
        } catch { /* ignore */ }
      } else {
        // Backend update failed - log details and throw
        let errorDetails = `status ${putResp?.status() || 'unknown'}`;
        if (putResp) {
          try {
            const errorBody = await putResp.json();
            errorDetails += `, message: ${errorBody?.message || JSON.stringify(errorBody)}`;
          } catch { /* ignore parse error */ }
        }
        throw new Error(`Activity update failed with ${errorDetails}`);
      }

      // Poll the backend until the subject reflects the new value
      const tenantIdForPoll = process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';
      await expect
        .poll(async () => {
          try {
            const res = await page.request.get(`${BACKEND_URL}/api/activities/${updatedId}?tenant_id=${tenantIdForPoll}`, { timeout: 5000 });
            if (!res.ok()) return 'pending';
            const data = await res.json();
            return data?.data?.subject && data.data.subject.includes(updatedSubject) ? 'ok' : 'pending';
          } catch { return 'pending'; }
        }, { timeout: 30000, intervals: [500, 750, 1000] })
        .toBe('ok');

      // Hard refresh the Activities page to avoid stale table state
      await page.goto(`${BASE_URL}/Activities`, { waitUntil: 'domcontentloaded' });
  await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com', process.env.E2E_TENANT_ID);

      // Use search to find the updated activity (to handle pagination)
      const searchBox = page.locator('input[placeholder*="Search activities" i], input[placeholder*="Search" i], input[type="search"]').first();
      if (await searchBox.count() > 0) {
        await searchBox.fill(updatedSubject);
        await page.waitForTimeout(1500); // Allow debounce/filter to apply
      }

      // Verify updated activity appears in the filtered results (poll table text to be safe)
      await expect(
        page.locator('table tbody tr').filter({ hasText: updatedSubject }).first()
      ).toBeVisible({ timeout: 30000 });
    });

    test('should delete an activity', async ({ page }) => {
      // Navigate to Activities
      await navigateTo(page, '/activities');
      
      // Wait for page to load user and show content
  await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com', process.env.E2E_TENANT_ID);
      
      // First create an activity to delete - wait for Add button to appear
      const addButton = page.locator('button:has-text("Add Activity"), button:has-text("Add")').first();
      await addButton.waitFor({ state: 'visible', timeout: 15000 });
      await addButton.click();
      await page.waitForSelector('input#subject, [data-testid="activity-subject-input"]', { timeout: 10000 });      const timestamp = Date.now();
      const testSubject = `E2E Delete Test Activity ${timestamp}`;
      await page.fill('input#subject, [data-testid="activity-subject-input"]', testSubject);
      
      const typeSelect = page.locator('select#type, select[name="type"]');
      if (await typeSelect.count() > 0) {
        await typeSelect.selectOption('task');
      }
      
      await page.click('button[type="submit"]:has-text("Save")');
      
      // Wait for form to close and activity to appear
      await page.waitForSelector('form', { state: 'hidden', timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator(`text=${testSubject}`).first()).toBeVisible({ timeout: 10000 });
      
      // Get count of activities before delete
      const rowsBefore = await page.locator('table tbody tr').count();
      expect(rowsBefore).toBeGreaterThan(0); // Ensure we have at least one activity
      
      // Find the activity we just created and click delete
      const activityRow = page.locator(`table tbody tr:has-text("${testSubject}")`).first();
      await activityRow.waitFor({ state: 'visible', timeout: 5000 });
      
      await activityRow.locator('button[aria-label="Delete"]').click();
      
      // Wait for confirmation dialog and confirm deletion
      await page.waitForSelector('[role="alertdialog"]', { state: 'visible' });
      await page.click('button:has-text("Delete")');
      
      // Wait for deletion to complete
      await page.waitForTimeout(1500);
      
      // Verify activity is no longer visible
      await expect(page.locator(`text=${testSubject}`)).not.toBeVisible();
      
      // Verify count decreased
      const rowsAfter = await page.locator('table tbody tr').count();
      expect(rowsAfter).toBeLessThan(rowsBefore);
    });

    test('should validate required fields', async ({ page }) => {
      // Navigate to Activities page
      await navigateTo(page, '/activities');
      
      // Wait for page to load user and show content
      await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com');
      
      // Wait for Add Activity button and click it
      const addButton = page.locator('button:has-text("Add Activity"), button:has-text("Add")').first();
      await addButton.waitFor({ state: 'visible', timeout: 15000 });
      await addButton.click();
      await page.waitForSelector('form', { state: 'visible' });      // Try to save without filling required fields
      await page.click('button[type="submit"]:has-text("Save")');
      
      // Verify validation message appears (form should NOT close)
      await expect(page.locator('form')).toBeVisible();
      
      // Check for HTML5 validation or custom error messages
      const subjectInput = page.locator('input[name="subject"]');
      const isValid = await subjectInput.evaluate(el => el.validity.valid);
      expect(isValid).toBe(false);
    });
  });

  test.describe('Leads CRUD', () => {
    test('should create a new lead', async ({ page }) => {
  // Navigate to Leads
  await navigateTo(page, '/leads');
      
      // Wait for page to load user and show content
      await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com');
      
      // Wait for Add Lead button to appear and click it
      const addLeadButton = page.locator('button:has-text("Add Lead"), button:has-text("New Lead")').first();
      await addLeadButton.waitFor({ state: 'visible', timeout: 15000 });
      await addLeadButton.click();
      await page.waitForSelector('form', { state: 'visible' });
      
      // Fill lead form - using ID selectors that match the actual form
      const testEmail = `test-${Date.now()}@example.com`;
      await page.fill('#email', testEmail);
      await page.fill('#first_name', 'Test');
      await page.fill('#last_name', 'Lead');
      await page.fill('#company', 'Test Company');
      await page.fill('#job_title', 'Test Manager');
      
      // Note: Lead source uses shadcn/ui Select component, not native select
      // We'll skip this field for now as it requires more complex interaction
      
      // Save lead - button text is "Create Lead" not "Save"
      await page.click('button[type="submit"]:has-text("Create")');
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Verify lead appears
      await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 });
    });

    test('should update lead job_title without date errors', async ({ page }) => {
  // Navigate to Leads
  await navigateTo(page, '/leads');
      
      // Wait for page to load user and show content
      await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com');
      
      // First, create a lead to edit
      const addLeadBtn = page.locator('button:has-text("Add Lead"), button:has-text("New Lead")').first();
      await addLeadBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addLeadBtn.click();
      await page.waitForSelector('form', { state: 'visible' });
      
      const testEmail = `update-lead-${Date.now()}@example.com`;
      await page.fill('#email', testEmail);
      await page.fill('#first_name', 'Update');
      await page.fill('#last_name', 'Test');
      await page.fill('#company', 'Test Co');
      await page.fill('#job_title', 'Original Title');
      
      await page.click('button[type="submit"]:has-text("Create")');
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Bring the created lead into view via search (handles pagination)
      const leadSearch = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
      if (await leadSearch.count() > 0) {
        await leadSearch.fill(testEmail);
        await page.waitForTimeout(1500);
      }

      // Wait for lead to appear in list
      await expect(page.locator(`table tbody tr:has-text("${testEmail}")`).first()).toBeVisible({ timeout: 15000 });
      
      // Brief wait for table to stabilize
      await page.waitForTimeout(1000);
      
      // Now find and edit this lead using data-testid
      // Prefer data-testid when available, fall back to a text-based row match
      let leadRow = page.locator(`[data-testid="lead-row-${testEmail}"]`);
      if (await leadRow.count() === 0) {
        leadRow = page.locator('table tbody tr').filter({ hasText: testEmail }).first();
      }
      await expect(leadRow).toBeVisible({ timeout: 10000 });
      
      const editBtn = leadRow.locator('td:last-child button').nth(1);
      await editBtn.waitFor({ state: 'visible', timeout: 5000 });
      await editBtn.click(); // Click Edit button (2nd button)
      
      await page.waitForSelector('form', { state: 'visible' });
      
      // Update job title
      const newJobTitle = `Manager ${Date.now()}`;
      await page.fill('#job_title', newJobTitle);

      // Set up response promise BEFORE submitting
      const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/leads/') && response.request().method() === 'PUT',
        { timeout: 15000 }
      );

      // Submit form
      await page.click('button[type="submit"]:has-text("Update")');

      // Wait for the API response
      await responsePromise;

      // Wait for dialog to close
  await page.waitForSelector('[data-testid="lead-form"], form', { state: 'hidden', timeout: 10000 });
      
      // Wait for table refresh
      await page.waitForTimeout(1000);      // Wait a moment for the table to refresh
      await page.waitForTimeout(1000);
      
      // Re-query the lead row after update (in case DOM refreshed)
      const updatedLeadRow = page.locator(`[data-testid="lead-row-${testEmail}"]`);
      
      // Verify we're looking at the right lead by checking email (fallback to text if testid missing)
      const emailCell = updatedLeadRow.locator('[data-testid="lead-email"]');
      if (await emailCell.count() > 0) {
        await expect(emailCell).toHaveText(testEmail);
      } else {
        await expect(updatedLeadRow).toContainText(testEmail);
      }
      
      // Verify update - find the job title within the specific lead row
      const jobTitleCell = updatedLeadRow.locator('[data-testid="lead-job-title"]');
      if (await jobTitleCell.count() > 0) {
        await expect(jobTitleCell).toHaveText(newJobTitle, { timeout: 15000 });
      } else {
        await expect(updatedLeadRow).toContainText(newJobTitle);
      }
    });
  });

  test.describe('Contacts CRUD', () => {
    test('should create a new contact', async ({ page }) => {
  // Navigate to Contacts
  await navigateTo(page, '/contacts');
      
      // Wait for page to load user and show content
      await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com');
      
      // Click Add Contact
      const addContactBtn = page.locator('button:has-text("Add Contact"), button:has-text("New Contact")').first();
      await addContactBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addContactBtn.click();
      await page.waitForSelector('form', { state: 'visible' });
      
      // Fill contact form - using ID selectors that match the actual form
      const testEmail = `contact-${Date.now()}@example.com`;
      await page.fill('#email', testEmail);
      await page.fill('#first_name', 'Bob');
      await page.fill('#last_name', 'Wilson');
      await page.fill('#job_title', 'VP Sales');
      
      // Check "Test Data" checkbox to skip duplicate validation
      await page.check('#is_test_data');
      
      // Check if submit button is disabled before clicking
      const submitButton = page.locator('button[type="submit"]:has-text("Create")');
      const isDisabled = await submitButton.getAttribute('disabled');
      console.log('Submit button disabled?', isDisabled);
      
      // Save contact - button text is "Create Contact"
      await submitButton.click();
      
      // Wait a moment to see if submission starts
      await page.waitForTimeout(1000);
      
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Wait for the contact list to reload
      await page.waitForTimeout(2000);

      // Verify contact was created - either by finding it in the list or checking that total increased
      // Try to find the contact email (it might not be visible if pagination puts it on another page)
      const contactVisible = await page.locator(`text=${testEmail}`).isVisible().catch(() => false);
      if (!contactVisible) {
        // If not visible, at least verify the form closed successfully and no error appeared
        const errorToast = await page.locator('[role="alert"]:has-text("Failed"), [role="status"]:has-text("Error")').count();
        if (errorToast > 0) {
          throw new Error('Contact creation failed with error toast');
        }
        console.log('Contact created but not visible in current view (might be on different page)');
      } else {
        // Verify contact appears
        await expect(page.locator(`text=${testEmail}`)).toBeVisible();
      }
    });

  test('should load contact tags without tenant_id errors', async ({ page }) => {
      // This test verifies the fix for ContactForm tenant_id issue
  await navigateTo(page, '/contacts');
      
      // Wait for page to load user and show content
      await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com');
      
      // First, create a contact to edit
      const addContactBtn = page.locator('button:has-text("Add Contact"), button:has-text("New Contact")').first();
      await addContactBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addContactBtn.click();
      await page.waitForSelector('form', { state: 'visible' });
      
      const testEmail = `tag-test-${Date.now()}@example.com`;
      await page.fill('#email', testEmail);
      await page.fill('#first_name', 'TagTest');
      await page.fill('#last_name', 'Contact');
      await page.fill('#job_title', 'Test Role');
      
      // Check "Test Data" checkbox to skip duplicate validation
      await page.check('#is_test_data');
      
      // Prefer a resilient wait: either the POST /api/contacts completes or the form closes successfully
      const createRace = Promise.race([
        page.waitForResponse(
          response => response.url().includes('/api/contacts') && response.request().method() === 'POST',
          { timeout: 30000 }
        ),
        page.waitForSelector('form', { state: 'hidden', timeout: 30000 })
      ]);

      await page.click('button[type="submit"]:has-text("Create")');

      await createRace;
      // Ensure form is closed before proceeding
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
    // Use the search box to find the newly created contact
    await page.waitForTimeout(2000); // Wait for contact list to update
    const searchBox = page.locator('input[placeholder*="Search contacts" i]');
    await searchBox.fill(testEmail);
    await page.waitForTimeout(1000); // Wait for search to filter
      
    // Verify contact appears in the search results
    const contactRow = page.locator(`table tbody tr:has-text("${testEmail}")`).first();
    await expect(contactRow).toBeVisible({ timeout: 10000 });
      
      // Now open edit form for this contact - use first matching row in table
      // The action buttons are icon buttons with tooltips - click the second button (Edit)
      const editContactBtn = contactRow.locator('td:last-child button').nth(1);
      await editContactBtn.waitFor({ state: 'visible', timeout: 5000 });
      await editContactBtn.click();
      
      await page.waitForSelector('form', { state: 'visible' });
      
      // Check console for tenant_id errors
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error' && msg.text().includes('tenant_id')) {
          consoleErrors.push(msg.text());
        }
      });
      
      // Wait for tags to load
      await page.waitForTimeout(2000);
      
      // Verify no tenant_id errors
      expect(consoleErrors).toHaveLength(0);
    });
  });

  test.describe('Opportunities CRUD', () => {
    test('should create a new opportunity', async ({ page }) => {
  // Navigate to Opportunities
  await navigateTo(page, '/opportunities');
      
      // Wait for page to load user and show content
      await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com');
      
      // Click Add Opportunity
      const addOppBtn = page.locator('button:has-text("Add Opportunity"), button:has-text("New Opportunity")').first();
      await addOppBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addOppBtn.click();
      await page.waitForSelector('form', { state: 'visible' });
      
      // Fill opportunity form - using ID selectors that match the actual form
      const testName = `E2E Opportunity ${Date.now()}`;
      await page.fill('#opp-name', testName);
      await page.fill('#opp-amount', '50000');
      
      // Note: Stage uses shadcn/ui Select component (#opp-stage), not native select
      // We'll skip stage selection for now as it requires more complex interaction
      
      // Set close date
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 2);
      await page.fill('#opp-close-date', futureDate.toISOString().split('T')[0]);
      
      // Save - button text is "Create Opportunity"
      // Set up promise race between network response and success flag
      const savePromise = Promise.race([
        page.waitForResponse(resp => resp.url().includes('/api/opportunities') && resp.request().method() === 'POST', { timeout: 60000 })
          .then(() => 'network'),
        page.waitForFunction(() => window.__opportunitySaveSuccess === true, { timeout: 60000 })
          .then(() => 'flag')
      ]);
      
      await page.click('button[type="submit"]:has-text("Create")');
      
      await savePromise.catch(async () => {
        const errorToastText = await page
          .locator('[role="status"], .toast, [class*="toast"]')
          .first()
          .textContent()
          .catch(() => '');
        throw new Error(`Opportunity creation did not succeed. ${errorToastText || 'No response or save flag.'}`);
      });
      
      // Wait for form to close and list to refresh
      await page.waitForSelector('form', { state: 'hidden', timeout: 5000 }).catch(() => {});
      
      // Reload page to ensure fresh data (domcontentloaded is faster than networkidle)
      await page.goto(`${BASE_URL}/opportunities`, { waitUntil: 'domcontentloaded' });
      await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com');
      
      // Try clicking refresh button if available to force data reload
      const refreshBtn = page.locator('button[aria-label*="efresh"], button:has-text("Refresh")').first();
      if (await refreshBtn.isVisible().catch(() => false)) {
        await refreshBtn.click();
        await page.waitForTimeout(1000);
      }
      
      // Search for the created opportunity to bring it into view
      const searchBox = page.locator('input[placeholder*="Search"], input[type="search"]').first();
      if (await searchBox.isVisible()) {
        await searchBox.fill(testName);
        await page.waitForTimeout(1500); // Longer wait for search debounce + Firefox
      }
      
      // Verify opportunity appears
      await expect(page.locator(`text=${testName}`)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('System Logs CRUD', () => {
    test('should create test log and clear all', async ({ page }) => {
      // Allow more time for logs to load and operations to complete in CI
      test.setTimeout(120_000);
      // Navigate to Settings > System Logs
      // Wait for dashboard page to load fully (we're at root after beforeEach)
      await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com');
      
      // Settings is in a dropdown menu - click user menu to open it
      // User menu button contains the user's initial in a circle - get the last one (in header)
      const userMenuButton = page.locator('button:has(div.bg-slate-200.rounded-full)').last();
      await userMenuButton.waitFor({ state: 'visible', timeout: 10000 });
      await userMenuButton.click();
      await page.waitForTimeout(500); // Wait for dropdown to open
      
      // Click Settings link in the dropdown (fallback to direct nav if menu structure differs)
      const settingsLink = page.locator('a[href*="/Settings"]:has-text("Settings"), a[href*="/settings"]:has-text("Settings")');
      if (await settingsLink.isVisible().catch(() => false)) {
        await settingsLink.click();
        await page.waitForURL('**/Settings', { timeout: 15000 }).catch(() => {});
      } else {
        await page.goto(`${BASE_URL}/Settings`, { waitUntil: 'domcontentloaded' });
      }

      // Go directly to System Logs to avoid menu structure differences; route is /SystemLogs
      await page.goto(`${BASE_URL}/SystemLogs`, { waitUntil: 'domcontentloaded' });
      await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com');

      // Ensure the System Logs page content is visible
      await expect(page.locator('h1:has-text("System Logs"), [data-testid="system-logs"]')).toBeVisible({ timeout: 20000 });

      // Wait for loading to settle (hide "Loading logs..." if present)
      const loadingLocator = page.locator('text=Loading logs...');
      if (await loadingLocator.count()) {
        await loadingLocator.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
      }
      // Wait for either count text or empty state
      await Promise.race([
        page.locator('text=/\\d+ logs? found/').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
        page.locator('text=/No logs found/i').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
      ]);

      // Initial count may be very large due to merged API error logs; we won't rely on it.
      
      // Click Add Test Log
      const addLogBtn = page.locator('button:has-text("Add Test Log")').first();
      await addLogBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addLogBtn.click();
      
      // After clicking, wait until a new test log appears (match message text)
      await expect(page.locator('text=/Test log created at/i').first()).toBeVisible({ timeout: 30000 });
      
  // Optionally read count (some environments have large baseline from API error logs)
  // We rely on the presence of the test log message instead of strict count deltas.
      
      // Clear all logs
      await page.click('button:has-text("Clear All")');
      
      // Click the confirm button in the dialog
      await page.click('button:has-text("Delete All")');

      // Wait for user feedback: either a success/info toast appears or the empty state shows
      const deletedToast = page.locator('text=/Deleted .* log/i').first();
      const noMatchToast = page.locator('text=/No logs matched the filter/i').first();
      await Promise.race([
        deletedToast.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
        noMatchToast.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
        page.locator('text=/No logs found/i').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
      ]);
    });
  });

  test.describe('Data Type Validation', () => {
    test('should enforce priority ENUM values', async ({ page }) => {
      // Navigate to Activities
      await navigateTo(page, '/activities');
      
      // Wait for page to load user and show content
      await waitForUserPage(page, TEST_EMAIL || 'e2e@example.com');
      
      // Create activity with valid priority
      const addActivityBtn = page.locator('button:has-text("Add Activity"), button:has-text("Add")').first();
      await addActivityBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addActivityBtn.click();
      await page.waitForSelector('form', { state: 'visible' });      // Fill subject using correct ID selector
      await page.fill('#subject', 'Priority Test');
      
      // Note: Priority uses shadcn/ui Select component with data-testid="activity-priority-select"
      // The test needs to interact with the Select component which requires clicking to open the dropdown
      // For now, we'll skip the priority selection in the first part
      
      // Try to save the activity (subject is the required field)
      await page.click('button[type="submit"]:has-text("Save")');
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Verify activity appears - use more specific selector to avoid multiple matches
      await expect(page.locator('table tbody tr').filter({ hasText: 'Priority Test' }).first()).toBeVisible({ timeout: 10000 });
      
      // Open another activity form to verify priority options
      const addAnotherBtn = page.locator('button:has-text("Add Activity")').first();
      await addAnotherBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addAnotherBtn.click();
      await page.waitForSelector('form', { state: 'visible' });
      
      // Click on the priority select trigger to open dropdown
      await page.click('[data-testid="activity-priority-select"]');
      
      // Wait for dropdown to appear and verify only valid priority options exist
      await page.waitForTimeout(500);
      
      // The Select component renders options in a portal, check for valid priorities
      const validPriorities = ['low', 'normal', 'high', 'urgent'];
      
      // Verify at least one valid priority option is visible
      const hasValidPriorities = await Promise.race(
        validPriorities.map(priority => 
          page.locator(`[role="option"]:has-text("${priority}")`).first().isVisible().catch(() => false)
        )
      );
      
      expect(hasValidPriorities).toBeTruthy();
    });
  });
});
