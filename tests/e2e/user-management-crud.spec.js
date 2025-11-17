/**
 * End-to-End CRUD Tests for User Management
 * Tests basic Create, Read, Update, Delete operations for users
 * Separated from permission/role testing for simpler test execution
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';

// Test user credentials
const SUPERADMIN_EMAIL = 'admin@aishacrm.com';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin123!';
// Prefer environment-driven tenant ID for cloud E2E; fallback retained for local dev
const TENANT_ID = process.env.E2E_TENANT_ID || 'local-tenant-001';

// Helper: Wait for backend health
async function waitForBackendHealth() {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/system/status`);
      if (response.ok) return true;
    } catch {
      // Backend not ready
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Backend health check timeout after 30s');
}

// Helper: Login as user
async function loginAsUser(page, email, password) {
  await page.goto(BASE_URL);

  // If already logged in (thanks to storageState), skip login
  const hasLoginForm = await page
    .locator('input[type="email"], input[name="email"]')
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (!hasLoginForm) {
    return;
  }

  // Fill login form
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);

  // Submit login
  await page.click('button[type="submit"]');

  // Wait for successful login (dashboard or main content loads)
  await page.waitForSelector('main, [role="main"], .dashboard', { timeout: 15000 });
}

// Helper: Navigate to User Management page
async function navigateToUserManagement(page) {
  // Look for Settings or User Management nav link
  const settingsLink = page.locator('a:has-text("Settings"), button:has-text("Settings")').first();
  const userMgmtLink = page.locator('a:has-text("User Management"), a:has-text("Users")').first();
  
  // Try User Management direct link first
  if (await userMgmtLink.isVisible({ timeout: 2000 })) {
    await userMgmtLink.click();
  } else if (await settingsLink.isVisible({ timeout: 2000 })) {
    await settingsLink.click();
    await page.waitForTimeout(500);
    // Now look for User Management sub-link
    await userMgmtLink.click();
  } else {
    // Navigate directly via URL
    await page.goto(`${BASE_URL}/settings/users`);
  }
  
  // Wait for user management page to load
  await page.waitForSelector('text=/User Management|Users/i', { timeout: 10000 });
}

// Global setup
test.beforeAll(async () => {
  await waitForBackendHealth();
});

test.describe('User Management - Basic CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
  });

  test('Can access User Management page', async ({ page }) => {
    await navigateToUserManagement(page);
    
    // Verify page loaded successfully
    await expect(page.locator('text=/User Management|Users/i')).toBeVisible({ timeout: 5000 });
    
    // Should see Add User/Invite User button
    await expect(page.locator('button:has-text("Add User"), button:has-text("Invite User")')).toBeVisible({ timeout: 5000 });
  });

  test('Can see list of existing users', async ({ page }) => {
    await navigateToUserManagement(page);
    
    // Wait for users list/table to load
    await page.waitForSelector('table, [role="table"], .user-list, [data-testid="users-list"]', { timeout: 10000 });
    
    // Should see at least the superadmin user (ourselves)
    await expect(page.locator(`text=${SUPERADMIN_EMAIL}`)).toBeVisible({ timeout: 5000 });
  });

  test('CREATE: Can create a new basic user', async ({ page }) => {
    await navigateToUserManagement(page);
    
    // Open Add User dialog
    await page.locator('button:has-text("Add User"), button:has-text("Invite User")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Generate unique email
    const timestamp = Date.now();
    const testEmail = `crud.test.${timestamp}@example.com`;
    const testName = `CRUD Test User ${timestamp}`;
    
    // Fill required fields
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[placeholder*="full name" i], input[placeholder*="name" i]', testName);
    
    // Select a role (default to 'user' or first available)
    const roleSelect = page.locator('select[name="role"], [role="combobox"]:has-text("Role")').first();
    if (await roleSelect.isVisible({ timeout: 2000 })) {
      await roleSelect.selectOption({ label: 'User' });
    }
    
    // Submit form
    await page.locator('button:has-text("Send Invite"), button:has-text("Create User"), button[type="submit"]').first().click();
    
    // Wait for success (toast or dialog close)
    await page.waitForTimeout(2000);
    
    // Close dialog if still open
    const dialogCloseButton = page.locator('[role="dialog"] button:has-text("Cancel"), [role="dialog"] button[aria-label="Close"]');
    if (await dialogCloseButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dialogCloseButton.click();
    }
    
    // Verify user appears in the list
    await page.waitForTimeout(1000);
    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 5000 });
  });

  test('READ: Can view user details', async ({ page }) => {
    await navigateToUserManagement(page);
    
    // Find and click on a user row (look for superadmin or first user)
    const firstUserRow = page.locator(`table tr:has-text("${SUPERADMIN_EMAIL}"), .user-list-item:has-text("${SUPERADMIN_EMAIL}")`).first();
    await firstUserRow.click();
    
    // Should open details view or dialog
    await page.waitForTimeout(1000);
    
    // Verify user details are visible (email, role, etc.)
    await expect(page.locator(`text=${SUPERADMIN_EMAIL}`)).toBeVisible();
  });

  test('UPDATE: Can edit user information', async ({ page }) => {
    await navigateToUserManagement(page);
    
    // Create a test user first
    await page.locator('button:has-text("Add User"), button:has-text("Invite User")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    const timestamp = Date.now();
    const testEmail = `edit.test.${timestamp}@example.com`;
    const originalName = `Original Name ${timestamp}`;
    
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[placeholder*="full name" i], input[placeholder*="name" i]', originalName);
    await page.locator('button:has-text("Send Invite"), button:has-text("Create User"), button[type="submit"]').first().click();
    
    await page.waitForTimeout(2000);
    
    // Close dialog
    const dialogCloseButton = page.locator('[role="dialog"] button:has-text("Cancel"), [role="dialog"] button[aria-label="Close"]');
    if (await dialogCloseButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dialogCloseButton.click();
    }
    
    // Find the created user and click to edit
    await page.waitForTimeout(1000);
    const userRow = page.locator(`table tr:has-text("${testEmail}"), .user-list-item:has-text("${testEmail}")`).first();
    await userRow.click();
    
    // Look for Edit button
    const editButton = page.locator('button:has-text("Edit"), button[aria-label="Edit"]').first();
    if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(500);
      
      // Update name
      const updatedName = `Updated Name ${timestamp}`;
      const nameInput = page.locator('input[placeholder*="full name" i], input[placeholder*="name" i]').first();
      await nameInput.fill(updatedName);
      
      // Save changes
      await page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').first().click();
      await page.waitForTimeout(1000);
      
      // Verify updated name appears
      await expect(page.locator(`text=${updatedName}`)).toBeVisible({ timeout: 5000 });
    }
  });

  test('DELETE: Can delete a user', async ({ page }) => {
    await navigateToUserManagement(page);
    
    // Create a test user to delete
    await page.locator('button:has-text("Add User"), button:has-text("Invite User")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    const timestamp = Date.now();
    const testEmail = `delete.test.${timestamp}@example.com`;
    
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[placeholder*="full name" i], input[placeholder*="name" i]', `Delete Test ${timestamp}`);
    await page.locator('button:has-text("Send Invite"), button:has-text("Create User"), button[type="submit"]').first().click();
    
    await page.waitForTimeout(2000);
    
    // Close dialog
    const dialogCloseButton = page.locator('[role="dialog"] button:has-text("Cancel"), [role="dialog"] button[aria-label="Close"]');
    if (await dialogCloseButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dialogCloseButton.click();
    }
    
    // Find and select the user
    await page.waitForTimeout(1000);
    const userRow = page.locator(`table tr:has-text("${testEmail}"), .user-list-item:has-text("${testEmail}")`).first();
    await userRow.click();
    
    // Look for Delete button
    const deleteButton = page.locator('button:has-text("Delete"), button[aria-label="Delete"]').first();
    if (await deleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteButton.click();
      
      // Confirm deletion in confirmation dialog
      await page.waitForTimeout(500);
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete"), button:has-text("Yes")').last();
      await confirmButton.click();
      
      await page.waitForTimeout(2000);
      
      // Verify user is removed from list
      await expect(page.locator(`text=${testEmail}`)).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('Backend API: Can fetch users via API', async () => {
  const response = await fetch(`${BACKEND_URL}/api/users?tenant_id=${TENANT_ID}`);
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.status).toBe('success');
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
    
    // Should include superadmin
    const superadmin = data.data.find(u => u.email === SUPERADMIN_EMAIL);
    expect(superadmin).toBeDefined();
    expect(superadmin.role).toBe('superadmin');
  });

  test('Backend API: Can create user via API', async () => {
    const timestamp = Date.now();
    const testUser = {
      email: `api.test.${timestamp}@example.com`,
      full_name: `API Test User ${timestamp}`,
      role: 'user',
      tenant_id: TENANT_ID
    };
    
    const response = await fetch(`${BACKEND_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.status).toBe('success');
    expect(data.data.email).toBe(testUser.email);
    expect(data.data.full_name).toBe(testUser.full_name);
  });
});
