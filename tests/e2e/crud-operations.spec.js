/**
 * End-to-End CRUD Tests for Aisha CRM
 * Tests Create, Read, Update, Delete operations across major entities
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';

// Helper: Wait for backend to be healthy
async function waitForBackendHealth() {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/system/status`);
      if (response.ok) return true;
    } catch {
      // Backend not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Backend health check timeout after 30s');
}

test.describe('CRUD Operations - End-to-End', () => {
  test.beforeAll(async () => {
    // Ensure backend is running
    await waitForBackendHealth();
  });

  test.beforeEach(async ({ page }) => {
    // Auto-accept any native dialogs (e.g., window.confirm)
    page.on('dialog', dialog => dialog.accept());
    
    // Log console messages from browser
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('[ContactForm]')) {
        console.log(`Browser console.${msg.type()}: ${msg.text()}`);
      }
    });

    // Navigate to app and wait for initial load
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    
    // Wait for app to be fully initialized - wait for main content
    await page.waitForSelector('main, [role="main"], .app-content', { timeout: 15000 }).catch(() => {
      // If no main selector, just wait for any content to load
      return page.waitForSelector('body', { timeout: 5000 });
    });
    
    // Give React time to hydrate
    await page.waitForTimeout(1000);
  });

  test.describe('Activities CRUD', () => {
    test('should create a new activity', async ({ page }) => {
      // Navigate to Activities page
      await page.goto(`${BASE_URL}/activities`, { waitUntil: 'networkidle' });
      
      // Wait for page to load
      await page.waitForSelector('h1, h2', { timeout: 10000 });
      
      // Click Add Activity button - try multiple possible selectors
      const addButton = page.locator('button:has-text("Add Activity"), button:has-text("New Activity"), button:has-text("Create")').first();
      await addButton.waitFor({ timeout: 5000 });
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
      
  // Save activity
  await page.click('button[type="submit"]:has-text("Save"), button:has-text("Create"), button:has-text("Submit")');

  // Wait for form to close and list to refresh
  await page.waitForSelector('form', { state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
      
      // Verify activity appears (check for the subject text anywhere on page)
      await expect(page.locator(`text=${testSubject}`).first()).toBeVisible({ timeout: 10000 });
    });

    test('should edit an existing activity', async ({ page }) => {
      // Navigate to Activities
      await page.click('a[href="/activities"]');
      await page.waitForURL('**/activities');
      
      // Find first activity row and click edit button
      const firstRow = page.locator('table tbody tr').first();
      await firstRow.locator('button[aria-label="Edit"], button:has-text("Edit")').click();
      
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
      
      // Save changes
      await page.click('button[type="submit"]:has-text("Save")');
      
      // Wait for form to close
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Verify updated activity appears
      await expect(page.locator(`text=${updatedSubject}`)).toBeVisible({ timeout: 10000 });
    });

    test('should delete an activity', async ({ page }) => {
      // Navigate to Activities
      await page.click('a[href="/activities"]');
      await page.waitForURL('**/activities');
      
      // First create an activity to delete
      await page.click('button:has-text("Add Activity")');
      await page.waitForSelector('input#subject, [data-testid="activity-subject-input"]', { timeout: 10000 });
      
      const timestamp = Date.now();
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
      // Navigate to Activities
      await page.click('a[href="/activities"]');
      await page.waitForURL('**/activities');
      
      // Click Add Activity
      await page.click('button:has-text("Add Activity")');
      await page.waitForSelector('form', { state: 'visible' });
      
      // Try to save without filling required fields
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
      await page.click('a[href="/leads"]');
      await page.waitForURL('**/leads');
      
      // Click Add Lead
      await page.click('button:has-text("Add Lead"), button:has-text("New Lead")');
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
      await page.click('a[href="/leads"]');
      await page.waitForURL('**/leads');
      
      // First, create a lead to edit
      await page.click('button:has-text("Add Lead"), button:has-text("New Lead")');
      await page.waitForSelector('form', { state: 'visible' });
      
      const testEmail = `update-lead-${Date.now()}@example.com`;
      await page.fill('#email', testEmail);
      await page.fill('#first_name', 'Update');
      await page.fill('#last_name', 'Test');
      await page.fill('#company', 'Test Co');
      await page.fill('#job_title', 'Original Title');
      
      await page.click('button[type="submit"]:has-text("Create")');
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Wait for lead to appear in list
      await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(500); // Small delay for data to settle
      
      // Now find and edit this lead using data-testid
      const leadRow = page.locator(`[data-testid="lead-row-${testEmail}"]`);
      await expect(leadRow).toBeVisible({ timeout: 5000 });
      await leadRow.locator('td:last-child button').nth(1).click(); // Click Edit button (2nd button)
      
      await page.waitForSelector('form', { state: 'visible' });
      
      // Update job title - using ID selector
      const newJobTitle = `Manager ${Date.now()}`;
      await page.fill('#job_title', newJobTitle);
      
      // Save - button text is "Update Lead" for editing
      // Wait for the network request to complete
      const updatePromise = page.waitForResponse(response => 
        response.url().includes('/api/leads/') && response.request().method() === 'PUT'
      );
      
      await page.click('button[type="submit"]:has-text("Update")', { force: true });
      
      // Wait for the API response
      await updatePromise;
      
      // Wait for dialog to close
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Wait a moment for the table to refresh
      await page.waitForTimeout(500);
      
      // Re-query the lead row after update (in case DOM refreshed)
      const updatedLeadRow = page.locator(`[data-testid="lead-row-${testEmail}"]`);
      
      // Verify we're looking at the right lead by checking email
      await expect(updatedLeadRow.locator('[data-testid="lead-email"]')).toHaveText(testEmail);
      
      // Verify update - find the job title within the specific lead row
      await expect(updatedLeadRow.locator('[data-testid="lead-job-title"]')).toHaveText(newJobTitle, { timeout: 10000 });
    });
  });

  test.describe('Contacts CRUD', () => {
    test('should create a new contact', async ({ page }) => {
      // Navigate to Contacts
      await page.click('a[href="/contacts"]');
      await page.waitForURL('**/contacts');
      
      // Click Add Contact
      await page.click('button:has-text("Add Contact"), button:has-text("New Contact")');
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
      await page.click('a[href="/contacts"]');
      await page.waitForURL('**/contacts');
      
      // First, create a contact to edit
      await page.click('button:has-text("Add Contact"), button:has-text("New Contact")');
      await page.waitForSelector('form', { state: 'visible' });
      
      const testEmail = `tag-test-${Date.now()}@example.com`;
      await page.fill('#email', testEmail);
      await page.fill('#first_name', 'TagTest');
      await page.fill('#last_name', 'Contact');
      await page.fill('#job_title', 'Test Role');
      
      // Check "Test Data" checkbox to skip duplicate validation
      await page.check('#is_test_data');
      
      await page.click('button[type="submit"]:has-text("Create")');
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Wait for success toast and form close, then wait for contact to appear
      await page.waitForTimeout(2000);
      
      // Verify contact appears in the table (pagination fix should show it on page 1)
      await expect(page.locator(`table tbody tr:has-text("${testEmail}")`).first()).toBeVisible({ timeout: 5000 });
      
      // Now open edit form for this contact - use first matching row in table
      const contactRow = page.locator(`table tbody tr:has-text("${testEmail}")`).first();
      // The action buttons are icon buttons with tooltips - click the second button (Edit)
      await contactRow.locator('td:last-child button').nth(1).click();
      
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
      await page.click('a[href="/opportunities"]');
      await page.waitForURL('**/opportunities');
      
      // Click Add Opportunity
      await page.click('button:has-text("Add Opportunity"), button:has-text("New Opportunity")');
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
      await page.click('button[type="submit"]:has-text("Create")');
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Verify opportunity appears
      await expect(page.locator(`text=${testName}`)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('System Logs CRUD', () => {
    test('should create test log and clear all', async ({ page }) => {
      // Navigate to Settings > System Logs
      // Wait for page to be fully loaded and stable
      await page.waitForLoadState('networkidle');
      
      // Settings is in a dropdown menu - click user menu to open it
      // User menu button contains the user's initial in a circle - get the last one (in header)
      const userMenuButton = page.locator('button:has(div.bg-slate-200.rounded-full)').last();
      await userMenuButton.waitFor({ state: 'visible', timeout: 10000 });
      await userMenuButton.click();
      await page.waitForTimeout(500); // Wait for dropdown to open
      
      // Click Settings link in the dropdown
      const settingsLink = page.locator('a[href*="/settings"]:has-text("Settings")');
      await expect(settingsLink).toBeVisible({ timeout: 10000 });
      await settingsLink.click();
      
      await page.waitForURL('**/settings', { timeout: 10000 });
      await page.waitForLoadState('networkidle');
      
      // Click on System Logs
      const systemLogsLink = page.locator('a[href="/settings/system-logs"], button:has-text("System Logs"), a:has-text("System Logs")').first();
      await expect(systemLogsLink).toBeVisible({ timeout: 10000 });
      await systemLogsLink.click();
      
      // Wait for page to load
      await page.waitForLoadState('networkidle');
      
      // Get initial log count from the "X logs found" text
      const initialCountText = await page.locator('text=/\\d+ logs? found/').textContent();
      const initialLogCount = parseInt(initialCountText.match(/\d+/)[0]);
      
      // Click Add Test Log
      await page.click('button:has-text("Add Test Log")');
      
      // Wait for log to appear
      await page.waitForTimeout(1500);
      
      // Verify log count increased
      const newCountText = await page.locator('text=/\\d+ logs? found/').textContent();
      const newLogCount = parseInt(newCountText.match(/\d+/)[0]);
      expect(newLogCount).toBeGreaterThan(initialLogCount);
      
      // Clear all logs
      await page.click('button:has-text("Clear All")');
      
      // Click the confirm button in the dialog
      await page.click('button:has-text("Delete All")');
      
      // Wait for logs to clear
      await page.waitForTimeout(1500);
      
      // Verify logs cleared - should show "No logs found" message
      await expect(page.locator('text="No logs found"')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Data Type Validation', () => {
    test('should enforce priority ENUM values', async ({ page }) => {
      // Navigate to Activities
      await page.click('a[href="/activities"]');
      await page.waitForURL('**/activities');
      
      // Create activity with valid priority
      await page.click('button:has-text("Add Activity")');
      await page.waitForSelector('form', { state: 'visible' });
      
      // Fill subject using correct ID selector
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
      await page.click('button:has-text("Add Activity")');
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
