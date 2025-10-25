// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Aisha CRM E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* Maximum time one test can run for */
  timeout: 60 * 1000,
  
  /* Run tests in files in parallel */
  fullyParallel: false,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:5173',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // Commented out - start servers manually before running tests
  // webServer: [
  //   {
  //     command: 'npm run dev',
  //     url: 'http://localhost:5173',
  //     timeout: 120 * 1000,
  //     reuseExistingServer: true, // Always reuse existing servers
  //   },
  //   {
  //     command: 'cd backend && npm run dev',
  //     url: 'http://localhost:3001/api/system/health',
  //     timeout: 120 * 1000,
  //     reuseExistingServer: true, // Always reuse existing servers
  //   },
  // ],
});
