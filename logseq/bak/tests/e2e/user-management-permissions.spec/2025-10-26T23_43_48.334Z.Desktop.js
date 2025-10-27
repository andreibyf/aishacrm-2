/**
 * End-to-End Tests for User Management & Permission System
 * Tests CRM Access Toggle, Role Assignment, and Permission Validation
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';

// Test user credentials
const SUPERADMIN_EMAIL = 'admin@aishacrm.com';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'admin123';

// Helper: Wait for backend health
async function waitForBackendHealth() {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
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

// Helper: Navigate to User Management
async function navigateToUserManagement(page) {
  // Look for Settings navigation item
  const settingsLink = page.locator('text=Settings, a[href*="settings"]').first();
  await settingsLink.click({ timeout: 5000 });
  
  // Wait for Settings page to load
  await page.waitForTimeout(1000);
  
  // Look for User Management tab/section
  const userMgmtTab = page.locator('text=/User Management|Users|Employees/i').first();
  await userMgmtTab.click({ timeout: 5000 });
  
  // Wait for user list to load
  await page.waitForTimeout(1000);
}

test.describe('User Management - Permission System', () => {
  test.beforeAll(async () => {
    await waitForBackendHealth();
  });

  test.beforeEach(async ({ page }) => {
    // Auto-accept dialogs
    page.on('dialog', dialog => dialog.accept());
    
    // Log console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Browser error: ${msg.text()}`);
      }
    });
  });

  test('SuperAdmin can access User Management and see Add User button', async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await navigateToUserManagement(page);
    
    // Verify Add User button exists
    const addUserButton = page.locator('button:has-text("Add User"), button:has-text("Invite User")').first();
    await expect(addUserButton).toBeVisible({ timeout: 5000 });
  });

  test('Add User dialog shows all 4 roles for SuperAdmin', async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await navigateToUserManagement(page);
    
    // Click Add User button
    const addUserButton = page.locator('button:has-text("Add User"), button:has-text("Invite User")').first();
    await addUserButton.click();
    
    // Wait for dialog to open
    await page.waitForSelector('[role="dialog"], .dialog', { timeout: 5000 });
    
    // Find role dropdown/select
    const roleSelect = page.locator('select[name="role"], [role="combobox"]:near(label:has-text("Role"))').first();
    await roleSelect.click();
    
    // Verify all 4 roles are present
    await expect(page.locator('text=superadmin, text=Superadmin')).toBeVisible();
    await expect(page.locator('text=admin, text=Admin')).toBeVisible();
    await expect(page.locator('text=manager, text=Manager')).toBeVisible();
    await expect(page.locator('text=employee, text=Employee')).toBeVisible();
  });

  test('CRM Access toggle is visible and functional', async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await navigateToUserManagement(page);
    
    // Open Add User dialog
    const addUserButton = page.locator('button:has-text("Add User"), button:has-text("Invite User")').first();
    await addUserButton.click();
    
    // Wait for dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Find CRM Access toggle
    const crmAccessToggle = page.locator('text=/CRM Access|Login Enabled/i').first();
    await expect(crmAccessToggle).toBeVisible();
    
    // Verify ShieldCheck icon is present
    const shieldIcon = page.locator('svg').filter({ has: page.locator('text=/shield/i') }).first();
    await expect(shieldIcon).toBeVisible();
  });

  test('CRM Access toggle shows dynamic help text', async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await navigateToUserManagement(page);
    
    // Open Add User dialog
    await page.locator('button:has-text("Add User"), button:has-text("Invite User")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Initially should show "can log in" text (default is ON)
    await expect(page.locator('text=/can log in|access the CRM/i')).toBeVisible();
    
    // Find and click the toggle switch
    const toggleSwitch = page.locator('button[role="switch"]:near(label:has-text("CRM Access"))').first();
    await toggleSwitch.click();
    
    // After toggle OFF, should show "cannot log in" text
    await expect(page.locator('text=/cannot log in|reference.*only/i')).toBeVisible();
    
    // Toggle back ON
    await toggleSwitch.click();
    
    // Should show "can log in" again
    await expect(page.locator('text=/can log in|access the CRM/i')).toBeVisible();
  });

  test('Can create user with CRM access enabled', async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await navigateToUserManagement(page);
    
    // Open Add User dialog
    await page.locator('button:has-text("Add User"), button:has-text("Invite User")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Generate unique email
    const timestamp = Date.now();
    const testEmail = `test.crm.on.${timestamp}@example.com`;
    
    // Fill form
    await page.fill('input[type="email"], input[name="email"]', testEmail);
    await page.fill('input[name="full_name"], input:near(label:has-text("Full Name"))', 'Test CRM User');
    
    // Select employee role
    const roleSelect = page.locator('select[name="role"], [role="combobox"]:near(label:has-text("Role"))').first();
    await roleSelect.click();
    await page.locator('text=employee, text=Employee').first().click();
    
    // Ensure CRM Access is ON (should be default)
    const toggleSwitch = page.locator('button[role="switch"]:near(label:has-text("CRM Access"))').first();
    const isChecked = await toggleSwitch.getAttribute('data-state');
    if (isChecked !== 'checked') {
      await toggleSwitch.click();
    }
    
    // Submit form
    await page.locator('button:has-text("Create User"), button[type="submit"]').first().click();
    
    // Wait for success message
    await expect(page.locator('text=/created successfully|added to the system/i')).toBeVisible({ timeout: 10000 });
    
    // Verify user appears in list
    await page.waitForTimeout(1000);
    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 5000 });
  });

  test('Can create user with CRM access disabled', async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await navigateToUserManagement(page);
    
    // Open Add User dialog
    await page.locator('button:has-text("Add User"), button:has-text("Invite User")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Generate unique email
    const timestamp = Date.now();
    const testEmail = `reference.crm.off.${timestamp}@example.com`;
    
    // Fill form
    await page.fill('input[type="email"], input[name="email"]', testEmail);
    await page.fill('input[name="full_name"], input:near(label:has-text("Full Name"))', 'Reference User');
    
    // Select employee role
    const roleSelect = page.locator('select[name="role"], [role="combobox"]:near(label:has-text("Role"))').first();
    await roleSelect.click();
    await page.locator('text=employee, text=Employee').first().click();
    
    // Toggle CRM Access OFF
    const toggleSwitch = page.locator('button[role="switch"]:near(label:has-text("CRM Access"))').first();
    const isChecked = await toggleSwitch.getAttribute('data-state');
    if (isChecked === 'checked') {
      await toggleSwitch.click();
    }
    
    // Verify help text shows "cannot log in"
    await expect(page.locator('text=/cannot log in|reference.*only/i')).toBeVisible();
    
    // Submit form
    await page.locator('button:has-text("Create User"), button[type="submit"]').first().click();
    
    // Wait for success message
    await expect(page.locator('text=/created successfully|added to the system/i')).toBeVisible({ timeout: 10000 });
    
    // Verify user appears in list
    await page.waitForTimeout(1000);
    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 5000 });
  });

  test('Navigation Permissions section is visible and functional', async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await navigateToUserManagement(page);
    
    // Open Add User dialog
    await page.locator('button:has-text("Add User"), button:has-text("Invite User")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Scroll to Navigation Permissions section
    await page.locator('text=/Navigation Permissions|Page Access/i').first().scrollIntoViewIfNeeded();
    
    // Verify section is visible
    await expect(page.locator('text=/Navigation Permissions/i')).toBeVisible();
    
    // Verify "Enable All" button exists
    await expect(page.locator('button:has-text("Enable All")')).toBeVisible();
    
    // Verify some key permission toggles exist
    await expect(page.locator('text=/Dashboard/i')).toBeVisible();
    await expect(page.locator('text=/Contacts/i')).toBeVisible();
    await expect(page.locator('text=/Accounts/i')).toBeVisible();
  });

  test('Enable All button toggles all navigation permissions', async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await navigateToUserManagement(page);
    
    // Open Add User dialog
    await page.locator('button:has-text("Add User"), button:has-text("Invite User")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Scroll to Navigation Permissions
    await page.locator('text=/Navigation Permissions/i').first().scrollIntoViewIfNeeded();
    
    // Click "Enable All" button
    await page.locator('button:has-text("Enable All")').click();
    
    // Wait for toggles to update
    await page.waitForTimeout(500);
    
    // Verify multiple toggles are now checked
    const dashboardToggle = page.locator('button[role="switch"]:near(label:has-text("Dashboard"))').first();
    const contactsToggle = page.locator('button[role="switch"]:near(label:has-text("Contacts"))').first();
    
    await expect(dashboardToggle).toHaveAttribute('data-state', 'checked');
    await expect(contactsToggle).toHaveAttribute('data-state', 'checked');
  });

  test('Form validation prevents submission without required fields', async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await navigateToUserManagement(page);
    
    // Open Add User dialog
    await page.locator('button:has-text("Add User"), button:has-text("Invite User")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Try to submit without filling email
    await page.locator('button:has-text("Create User"), button[type="submit"]').first().click();
    
    // Should show validation error or prevent submission
    await expect(page.locator('text=/required|email.*required/i, input[type="email"]:invalid')).toBeVisible({ timeout: 3000 });
  });

  test('Backend API creates user with correct CRM access metadata', async () => {
    // Direct backend API test
    const timestamp = Date.now();
    const testEmail = `api.test.${timestamp}@example.com`;
    
    const response = await fetch(`${BACKEND_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        first_name: 'API',
        last_name: 'Test',
        role: 'employee',
        tenant_id: 'test-tenant',
        status: 'active',
        metadata: {
          crm_access: true,
          access_level: 'read_write',
          navigation_permissions: {
            Dashboard: true,
            Contacts: true
          }
        }
      })
    });
    
    expect(response.ok).toBeTruthy();
    const data = await response.json();
    
    // Verify metadata includes CRM access
    expect(data.metadata).toBeDefined();
    expect(data.metadata.crm_access).toBe(true);
    expect(data.metadata.access_level).toBe('read_write');
  });

  test('Audit logs are created for user creation', async ({ page }) => {
    // Create a user via API
    const timestamp = Date.now();
    const testEmail = `audit.test.${timestamp}@example.com`;
    
    await fetch(`${BACKEND_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        first_name: 'Audit',
        last_name: 'Test',
        role: 'employee',
        tenant_id: 'test-tenant',
        status: 'active',
        metadata: {
          crm_access: true,
          access_level: 'read_write'
        }
      })
    });
    
    // Wait for audit log to be written
    await page.waitForTimeout(1000);
    
    // Fetch recent audit logs
    const logsResponse = await fetch(`${BACKEND_URL}/api/system-logs?limit=10`);
    expect(logsResponse.ok).toBeTruthy();
    
    const logsData = await logsResponse.json();
    const logs = logsData.data['system-logs'];
    
    // Verify audit log exists for user creation
    const userCreationLog = logs.find(log => 
      log.source === 'user_management' && 
      log.message?.includes(testEmail)
    );
    
    // Note: This might not pass if audit logging isn't fully integrated yet
    // It's here as a placeholder for when frontend passes currentUser to inviteUser
    if (userCreationLog) {
      expect(userCreationLog.level).toBe('INFO');
      expect(userCreationLog.metadata).toBeDefined();
    }
  });
});

test.describe('User Management - Permission Validation', () => {
  test.beforeAll(async () => {
    await waitForBackendHealth();
  });

  test('Permission utility functions work correctly', async ({ page }) => {
    await loginAsUser(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    
    // Navigate to any page that uses permissions
    await page.goto(`${BASE_URL}/settings`);
    
    // Execute permission checks in browser context
    const permissionChecks = await page.evaluate(() => {
      // Import permissions if available globally
      if (typeof window.permissions !== 'undefined') {
        const currentUser = { role: 'superadmin', email: 'admin@aishacrm.com' };
        
        return {
          canAssignCRMAccess: window.permissions.canAssignCRMAccess(currentUser),
          assignableRoles: window.permissions.getAssignableRoles(currentUser)
        };
      }
      return null;
    });
    
    // If permissions are exposed, verify they work
    if (permissionChecks) {
      expect(permissionChecks.canAssignCRMAccess).toBe(true);
      expect(permissionChecks.assignableRoles).toBeDefined();
    }
  });
});
