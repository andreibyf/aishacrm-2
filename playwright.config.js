// @ts-check
import { defineConfig, devices } from '@playwright/test';

// Normalize runner URLs: prefer explicit PLAYWRIGHT_* envs, then VITE_*, then Docker defaults
const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL
  || process.env.VITE_AISHACRM_FRONTEND_URL
  || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL
  || process.env.VITE_AISHACRM_BACKEND_URL
  || 'http://localhost:4001';

// Expose normalized values so specs that read process.env can rely on them
process.env.PLAYWRIGHT_FRONTEND_URL = FRONTEND_URL;
process.env.PLAYWRIGHT_BACKEND_URL = BACKEND_URL;

const authFile = 'playwright/.auth/superadmin.json';

/**
 * Playwright configuration for Aisha CRM E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Expanded to './tests' so non-E2E validation specs (form-validation.spec.js, api-schema-validation.spec.js)
  // are discovered. Existing e2e specs remain under tests/e2e. This enables targeted runs:
  //   npx playwright test tests/form-validation.spec.js
  // without "No tests found" errors.
  testDir: './tests',
  
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
    baseURL: FRONTEND_URL,
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    // Setup project that creates an authenticated SuperAdmin storage state
    {
      name: 'setup',
      // With testDir set to './tests', make the pattern relative to that directory
      testMatch: 'e2e/auth.setup.js',
    },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },

    // Firefox and WebKit disabled due to aggressive request abortion in headless mode
    // causing false positives. Tests pass in Chromium which is used by most CI/CD.
    // Uncomment below to run cross-browser tests manually if needed.
    
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'], storageState: authFile },
    //   dependencies: ['setup'],
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'], storageState: authFile },
    //   dependencies: ['setup'],
    // },

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
