import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    // Strict timeout settings - move on after 60s, don't hang forever
    testTimeout: 60000,      // 60s max per individual test
    hookTimeout: 30000,      // 30s for beforeEach/afterEach hooks
    teardownTimeout: 10000,  // 10s for cleanup
    // Multiple reporters: console progress + JSON file for review
    reporters: ['default', 'json'],
    outputFile: './test-results/vitest-results.json',
    // Continue running all tests, don't stop on first failure
    bail: 0,
    // Passthrough to continue even when tests fail
    passWithNoTests: true,
    // Pool settings - use threads for speed, isolate for stability
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
      },
    },
    // Print summary of failures at end
    onConsoleLog: () => true,
    exclude: [
      'backend/test/**',
      'backend/tests/**',
      'tests/e2e/**',
    ],
    include: [
      'src/**/*.test.{js,jsx,ts,tsx}',
      'src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
