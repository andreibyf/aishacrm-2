/**
 * Form Validation & Schema Alignment Tests
 * Tests all entity forms with minimal required fields and validates database acceptance
 */

import { test, expect } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.PLAYWRIGHT_FRONTEND_URL || 'http://localhost:4000';

test.describe('Form Schema Validation Tests', () => {
  // Use E2E test mode to bypass real authentication
  test.beforeEach(async ({ page }) => {
    // Enable E2E test mode before navigation
    await page.addInitScript(() => {
      localStorage.setItem('E2E_TEST_MODE', 'true');
      window.__e2eUser = {
        id: 'e2e-test-user-id',
        email: 'e2e-test@aishacrm.com',
        role: 'superadmin',
        tenant_id: process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69',
        permissions: ['*']
      };
    });
    
    await page.goto(`${BASE_URL}/`);
    
    // Wait for the app to render with E2E user
    const sidebar = page.locator('[data-testid="sidebar-header"], [data-testid="app-header"]');
    await expect(sidebar.first()).toBeVisible({ timeout: 15000 });
  });

  test.describe('Employee Form Tests', () => {
    
    test('should create employee with only required fields (first_name, last_name)', async ({ page }) => {
  await page.goto(`${BASE_URL}/Employees`);
      await page.click('button:has-text("Create Employee")');
      
      // Fill only required fields
      await page.fill('input[name="first_name"]', 'Test');
      await page.fill('input[name="last_name"]', 'Employee');
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Employee")');
      
      // Verify success
      await expect(page.locator('text=Employee created successfully')).toBeVisible({ timeout: 5000 });
    });

    test('should reject employee with missing first_name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Employees`);
      await page.click('button:has-text("Create Employee")');
      
      // Fill only last_name
      await page.fill('input[name="last_name"]', 'Employee');
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Employee")');
      
      // Verify error
      await expect(page.locator('text=First name is required')).toBeVisible({ timeout: 5000 });
    });

    test('should reject employee with missing last_name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Employees`);
      await page.click('button:has-text("Create Employee")');
      
      // Fill only first_name
      await page.fill('input[name="first_name"]', 'Test');
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Employee")');
      
      // Verify error
      await expect(page.locator('text=Last name is required')).toBeVisible({ timeout: 5000 });
    });

    test('should require email when CRM access is enabled', async ({ page }) => {
  await page.goto(`${BASE_URL}/Employees`);
      await page.click('button:has-text("Create Employee")');
      
      // Fill required fields
      await page.fill('input[name="first_name"]', 'Test');
      await page.fill('input[name="last_name"]', 'Employee');
      
      // Enable CRM access
      await page.click('input[type="checkbox"][id="has-crm-access"]');
      
      // Submit without email
      await page.click('button[type="submit"]:has-text("Create Employee")');
      
      // Verify error
      await expect(page.locator('text=Email is required for CRM access')).toBeVisible({ timeout: 5000 });
    });

    test('should create employee with CRM access when email is provided', async ({ page }) => {
  await page.goto(`${BASE_URL}/Employees`);
      await page.click('button:has-text("Create Employee")');
      
      // Fill required fields
      await page.fill('input[name="first_name"]', 'Test');
      await page.fill('input[name="last_name"]', 'CRM User');
  // Use a domain not blocked by backend test email patterns
  await page.fill('input[type="email"]', `crmuser${Date.now()}@allowed.test`);
      
      // Enable CRM access
      await page.click('input[type="checkbox"][id="has-crm-access"]');
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Employee")');
      
      // Verify success
      await expect(page.locator('text=Employee created successfully')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Account Form Tests', () => {
    
    test('should create account with only required field (name)', async ({ page }) => {
  await page.goto(`${BASE_URL}/Accounts`);
      await page.click('button:has-text("Create Account")');
      
      // Fill only required field
      await page.fill('input[name="name"]', `Test Account ${Date.now()}`);
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Account")');
      
      // Verify success
      await expect(page.locator('text=Account created successfully')).toBeVisible({ timeout: 5000 });
    });

    test('should reject account with missing name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Accounts`);
      await page.click('button:has-text("Create Account")');
      
      // Try to submit without name
      await page.click('button[type="submit"]:has-text("Create Account")');
      
      // Verify HTML5 validation or error message
      const nameInput = page.locator('input[name="name"]');
      await expect(nameInput).toHaveAttribute('required');
    });

    test('should create account without email (optional field)', async ({ page }) => {
  await page.goto(`${BASE_URL}/Accounts`);
      await page.click('button:has-text("Create Account")');
      
      // Fill only name, leave email empty
      await page.fill('input[name="name"]', `Test Account No Email ${Date.now()}`);
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Account")');
      
      // Verify success
      await expect(page.locator('text=Account created successfully')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Contact Form Tests', () => {
    
    test('should create contact with only first_name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Contacts`);
      await page.click('button:has-text("Create Contact")');
      
      // Fill only first_name
      await page.fill('input[name="first_name"]', 'FirstOnly');
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Contact")');
      
      // Verify success
      await expect(page.locator('text=Contact created successfully')).toBeVisible({ timeout: 5000 });
    });

    test('should create contact with only last_name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Contacts`);
      await page.click('button:has-text("Create Contact")');
      
      // Fill only last_name
      await page.fill('input[name="last_name"]', 'LastOnly');
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Contact")');
      
      // Verify success
      await expect(page.locator('text=Contact created successfully')).toBeVisible({ timeout: 5000 });
    });

    test('should reject contact with neither first_name nor last_name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Contacts`);
      await page.click('button:has-text("Create Contact")');
      
      // Try to submit without any name
      await page.click('button[type="submit"]:has-text("Create Contact")');
      
      // Verify error
      await expect(page.locator('text=At least first name or last name is required')).toBeVisible({ timeout: 5000 });
    });

    test('should create contact with both names', async ({ page }) => {
  await page.goto(`${BASE_URL}/Contacts`);
      await page.click('button:has-text("Create Contact")');
      
      // Fill both names
      await page.fill('input[name="first_name"]', 'Test');
      await page.fill('input[name="last_name"]', 'Contact');
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Contact")');
      
      // Verify success
      await expect(page.locator('text=Contact created successfully')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Lead Form Tests', () => {
    
    test('should create lead with only first_name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Leads`);
      await page.click('button:has-text("Create Lead")');
      
      // Fill only first_name
      await page.fill('input[name="first_name"]', 'LeadFirst');
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Lead")');
      
      // Verify success
      await expect(page.locator('text=Lead created successfully')).toBeVisible({ timeout: 5000 });
    });

    test('should create lead with only last_name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Leads`);
      await page.click('button:has-text("Create Lead")');
      
      // Fill only last_name
      await page.fill('input[name="last_name"]', 'LeadLast');
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Lead")');
      
      // Verify success
      await expect(page.locator('text=Lead created successfully')).toBeVisible({ timeout: 5000 });
    });

    test('should reject lead with neither first_name nor last_name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Leads`);
      await page.click('button:has-text("Create Lead")');
      
      // Try to submit without any name
      await page.click('button[type="submit"]:has-text("Create Lead")');
      
      // Verify error
      await expect(page.locator('text=At least first name or last name is required')).toBeVisible({ timeout: 5000 });
    });

    test('should create lead without email (optional field)', async ({ page }) => {
  await page.goto(`${BASE_URL}/Leads`);
      await page.click('button:has-text("Create Lead")');
      
      // Fill only name, leave email empty
      await page.fill('input[name="first_name"]', 'Test');
      await page.fill('input[name="last_name"]', 'Lead');
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Lead")');
      
      // Verify success
      await expect(page.locator('text=Lead created successfully')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Opportunity Form Tests', () => {
    
    test('should create opportunity with only name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Opportunities`);
      await page.click('button:has-text("Create Opportunity")');
      
      // Fill only required field
      await page.fill('input[name="name"]', `Test Opportunity ${Date.now()}`);
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Opportunity")');
      
      // Verify success
      await expect(page.locator('text=Opportunity created successfully')).toBeVisible({ timeout: 5000 });
    });

    test('should reject opportunity with missing name', async ({ page }) => {
  await page.goto(`${BASE_URL}/Opportunities`);
      await page.click('button:has-text("Create Opportunity")');
      
      // Try to submit without name
      await page.click('button[type="submit"]:has-text("Create Opportunity")');
      
      // Verify error
      await expect(page.locator('text=Please fill in the required field: Name')).toBeVisible({ timeout: 5000 });
    });

    test('should create opportunity without amount (optional field)', async ({ page }) => {
  await page.goto(`${BASE_URL}/Opportunities`);
      await page.click('button:has-text("Create Opportunity")');
      
      // Fill only name, leave amount empty
      await page.fill('input[name="name"]', `Test Opportunity No Amount ${Date.now()}`);
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Opportunity")');
      
      // Verify success
      await expect(page.locator('text=Opportunity created successfully')).toBeVisible({ timeout: 5000 });
    });

    test('should create opportunity without close_date (optional field)', async ({ page }) => {
  await page.goto(`${BASE_URL}/Opportunities`);
      await page.click('button:has-text("Create Opportunity")');
      
      // Fill only name, leave close_date empty
      await page.fill('input[name="name"]', `Test Opportunity No Date ${Date.now()}`);
      
      // Submit form
      await page.click('button[type="submit"]:has-text("Create Opportunity")');
      
      // Verify success
      await expect(page.locator('text=Opportunity created successfully')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Visual Indicator Tests', () => {
    
    test('should show red asterisk (*) on required fields - Employee', async ({ page }) => {
  await page.goto(`${BASE_URL}/Employees`);
      await page.click('button:has-text("Create Employee")');
      
      // Check for red asterisks on required fields
      await expect(page.locator('label:has-text("First name") span.text-red-400')).toBeVisible();
      await expect(page.locator('label:has-text("Last name") span.text-red-400')).toBeVisible();
      
      // Check for "Required fields" note
      await expect(page.locator('text=* Required fields')).toBeVisible();
    });

    test('should show red asterisk (*) on email when CRM access enabled - Employee', async ({ page }) => {
  await page.goto(`${BASE_URL}/Employees`);
      await page.click('button:has-text("Create Employee")');
      
      // Email should not have asterisk initially
      const emailLabelBefore = page.locator('label:has-text("Email")');
      await expect(emailLabelBefore.locator('span.text-red-400')).not.toBeVisible();
      
      // Enable CRM access
      await page.click('input[type="checkbox"][id="has-crm-access"]');
      
      // Email should now have asterisk
      await expect(emailLabelBefore.locator('span.text-red-400')).toBeVisible();
    });

    test('should show red asterisk (*) on required fields - Account', async ({ page }) => {
  await page.goto(`${BASE_URL}/Accounts`);
      await page.click('button:has-text("Create Account")');
      
      // Check for red asterisk on Account Name
      await expect(page.locator('label:has-text("Account Name") span.text-red-400, label:has-text("Account Name *")')).toBeVisible();
      
      // Check that Email does NOT have asterisk
      const emailLabel = page.locator('label:has-text("Email")');
      await expect(emailLabel.locator('span.text-red-400')).not.toBeVisible();
    });

    test('should show either/or helper text - Contact', async ({ page }) => {
  await page.goto(`${BASE_URL}/Contacts`);
      await page.click('button:has-text("Create Contact")');
      
      // Check for helper text on name fields
      await expect(page.locator('text=(or Last Name required)')).toBeVisible();
      await expect(page.locator('text=(or First Name required)')).toBeVisible();
    });

    test('should show either/or helper text - Lead', async ({ page }) => {
  await page.goto(`${BASE_URL}/Leads`);
      await page.click('button:has-text("Create Lead")');
      
      // Check for helper text on name fields
      await expect(page.locator('text=(or Last Name required)')).toBeVisible();
      await expect(page.locator('text=(or First Name required)')).toBeVisible();
    });
  });
});
