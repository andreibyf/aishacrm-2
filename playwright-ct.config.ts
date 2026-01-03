import { defineConfig, devices } from '@playwright/experimental-ct-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Playwright Component Testing Configuration
 * 
 * This runs React components in a real browser, solving Radix UI + JSDOM issues.
 * Use for components that hang/timeout in Vitest due to JSDOM limitations.
 */
export default defineConfig({
  testDir: './tests/components',
  snapshotDir: './tests/components/__snapshots__',
  
  // Timeout for each test
  timeout: 30000,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  // eslint-disable-next-line no-undef
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  // eslint-disable-next-line no-undef
  retries: process.env.CI ? 2 : 0,
  
  // Limit workers on CI
  // eslint-disable-next-line no-undef
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter to use
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/component-results.json' }],
  ],
  
  use: {
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    
    // Base URL for component tests
    ctPort: 3100,
    
    // Vite config for component tests
    ctViteConfig: {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
