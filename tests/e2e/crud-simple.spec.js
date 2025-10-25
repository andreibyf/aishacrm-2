/**
 * Simplified E2E CRUD Tests for Aisha CRM
 * Basic smoke tests to verify pages load and basic functionality works
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

test.describe('Basic CRUD Operations', () => {
  test.beforeAll(async () => {
    // Ensure backend is running
    await waitForBackendHealth();
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for main content to appear
    await page.waitForSelector('body', { timeout: 10000 });
    await page.waitForTimeout(2000); // Give React time to hydrate
  });

  test('should load the home page', async ({ page }) => {
    // Just verify the page loaded
    await expect(page).toHaveURL(BASE_URL);
    
    // Check for any content
    const body = await page.locator('body').textContent();
    expect(body.length).toBeGreaterThan(0);
  });

  test('should navigate to Activities page', async ({ page }) => {
    // Try to navigate to activities
    await page.goto(`${BASE_URL}/activities`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for content
    await page.waitForTimeout(2000);
    
    // Verify we're on the right page
    await expect(page).toHaveURL(/activities/);
  });

  test('should navigate to Contacts page', async ({ page }) => {
    await page.goto(`${BASE_URL}/contacts`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/contacts/);
  });

  test('should navigate to Leads page', async ({ page }) => {
    await page.goto(`${BASE_URL}/leads`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/leads/);
  });

  test('should navigate to Opportunities page', async ({ page }) => {
    await page.goto(`${BASE_URL}/opportunities`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/opportunities/);
  });

  test('backend health check should return success', async () => {
    const response = await fetch(`${BACKEND_URL}/api/system/status`);
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.status).toBe('success');
    expect(data.data.server).toBe('running');
  });

  test('should fetch opportunities from backend', async () => {
    const response = await fetch(`${BACKEND_URL}/api/opportunities?tenant_id=local-tenant-001`);
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.status).toBe('success');
    expect(Array.isArray(data.data.opportunities)).toBe(true);
  });
});
