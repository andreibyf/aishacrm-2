/// <reference types="node" />

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    testTimeout: 60000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    reporters: ['default', 'json'],
    outputFile: './test-results/vitest-results.json',
    bail: 0,
    passWithNoTests: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        execArgv: ['--no-warnings=ExperimentalWarning'],
      },
    },
    onConsoleLog: () => true,
    exclude: ['backend/test/**', 'backend/tests/**', 'tests/e2e/**'],
    include: ['src/**/*.test.{js,jsx,ts,tsx}', 'src/**/__tests__/**/*.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/**/*.test.{js,jsx,ts,tsx}',
        'src/**/__tests__/**',
        'src/main.jsx',
        'src/vite-env.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
