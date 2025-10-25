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
      
      // Fill lead form
      const testEmail = `test-${Date.now()}@example.com`;
      await page.fill('input[name="email"]', testEmail);
      await page.fill('input[name="first_name"]', 'Test');
      await page.fill('input[name="last_name"]', 'Lead');
      await page.fill('input[name="company"]', 'Test Company');
      await page.fill('input[name="job_title"]', 'Test Manager');
      
      // Select lead source
      await page.selectOption('select[name="lead_source"]', 'website');
      
      // Save lead
      await page.click('button[type="submit"]:has-text("Save")');
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Verify lead appears
      await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 });
    });

    test('should update lead job_title without date errors', async ({ page }) => {
      // Navigate to Leads
      await page.click('a[href="/leads"]');
      await page.waitForURL('**/leads');
      
      // Click first lead to edit
      const firstRow = page.locator('table tbody tr').first();
      await firstRow.locator('button[aria-label="Edit"], button:has-text("Edit")').click();
      
      await page.waitForSelector('form', { state: 'visible' });
      
      // Update job title
      const newJobTitle = `Manager ${Date.now()}`;
      await page.fill('input[name="job_title"]', newJobTitle);
      
      // Save
      await page.click('button[type="submit"]:has-text("Save")');
      
      // Should save without date format errors
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Verify update
      await expect(page.locator(`text=${newJobTitle}`)).toBeVisible({ timeout: 10000 });
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
      
      // Fill contact form
      const testEmail = `contact-${Date.now()}@example.com`;
      await page.fill('input[name="email"]', testEmail);
      await page.fill('input[name="first_name"]', 'Bob');
      await page.fill('input[name="last_name"]', 'Wilson');
      await page.fill('input[name="job_title"]', 'VP Sales');
      
      // Save contact
      await page.click('button[type="submit"]:has-text("Save")');
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Verify contact appears
      await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 });
    });

    test('should load contact tags without tenant_id errors', async ({ page }) => {
      // This test verifies the fix for ContactForm tenant_id issue
      await page.click('a[href="/contacts"]');
      await page.waitForURL('**/contacts');
      
      // Open edit form for first contact
      const firstRow = page.locator('table tbody tr').first();
      await firstRow.locator('button[aria-label="Edit"], button:has-text("Edit")').click();
      
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
      
      // Fill opportunity form
      const testName = `E2E Opportunity ${Date.now()}`;
      await page.fill('input[name="name"]', testName);
      await page.fill('input[name="amount"]', '50000');
      
      // Select stage
      await page.selectOption('select[name="stage"]', 'proposal');
      
      // Set close date
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 2);
      await page.fill('input[name="close_date"]', futureDate.toISOString().split('T')[0]);
      
      // Save
      await page.click('button[type="submit"]:has-text("Save")');
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Verify opportunity appears
      await expect(page.locator(`text=${testName}`)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('System Logs CRUD', () => {
    test('should create test log and clear all', async ({ page }) => {
      // Navigate to Settings > System Logs
      await page.click('a[href="/settings"]');
      await page.waitForURL('**/settings');
      await page.click('a[href="/settings/system-logs"], button:has-text("System Logs")');
      
      // Click Add Test Log
      await page.click('button:has-text("Add Test Log")');
      
      // Wait for log to appear
      await page.waitForTimeout(1000);
      
      // Verify log count increased
      const logRows = await page.locator('table tbody tr').count();
      expect(logRows).toBeGreaterThan(0);
      
      // Clear all logs
      await page.click('button:has-text("Clear All")');
      await page.click('button:has-text("Confirm"), button:has-text("Yes")');
      
      // Wait for logs to clear
      await page.waitForTimeout(1000);
      
      // Verify logs cleared
      const rowsAfterClear = await page.locator('table tbody tr').count();
      expect(rowsAfterClear).toBe(0);
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
      
      await page.fill('input[name="subject"]', 'Priority Test');
      await page.selectOption('select[name="priority"]', 'urgent');
      
      await page.click('button[type="submit"]:has-text("Save")');
      await page.waitForSelector('form', { state: 'hidden', timeout: 10000 });
      
      // Verify only valid priority options are available
      await page.click('button:has-text("Add Activity")');
      await page.waitForSelector('form', { state: 'visible' });
      
      const priorityOptions = await page.locator('select[name="priority"] option').allTextContents();
      const validPriorities = ['low', 'normal', 'high', 'urgent'];
      
      priorityOptions.forEach(opt => {
        const normalized = opt.toLowerCase().trim();
        if (normalized && !validPriorities.includes(normalized)) {
          throw new Error(`Invalid priority option found: ${opt}`);
        }
      });
    });
  });
});
