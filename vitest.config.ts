/// <reference types="node" />
/* global process */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === "win32";
// forks pool on Windows times out starting worker processes when 6 projects run
// concurrently; vmForks uses Node VM context which starts significantly faster.
const testPool = isWindows ? "vmForks" : "threads";
const poolOptions = isWindows
  ? {
      vmForks: {
        singleFork: true,
      },
    }
  : {
      threads: {
        singleThread: false,
        isolate: true,
      },
    };

export const SUBSYSTEM_TAGS = [
  "PLATFORM",
  "CRM",
  "AISHA_CHAT",
  "CARE",
  "WORKFLOWS",
  "REPORTS",
  "INTEGRATIONS",
  "PERFORMANCE"
] as const;

// ─── Shared resolve config ────────────────────────────────────────────────────
// Applied to every project-level resolve to ensure consistent module resolution.
// @reduxjs/toolkit is aliased to its CJS bundle because recharts requires it
// via CJS but Vite's SSR module runner resolves the 'module' export condition
// which points to an ESM .modern.mjs file, causing "Unexpected token 'export'".
const sharedAlias = {
  "@": path.resolve(__dirname, "./src"),
  "@reduxjs/toolkit": path.resolve(
    __dirname,
    "node_modules/@reduxjs/toolkit/dist/cjs/index.js"
  ),
};

const sharedResolve = {
  alias: sharedAlias,
};


const sharedConfig = {
  globals: true,
  environment: 'jsdom' as const,
  setupFiles: './src/test/setup.js',
  css: true,
  testTimeout: 60000,
  hookTimeout: 30000,
  teardownTimeout: 10000,
  passWithNoTests: true,
  pool: testPool,
  poolOptions,
  onConsoleLog: () => true,
  // @reduxjs/toolkit ships ESM (.modern.mjs) inside a CJS-style package;
  // recharts requires it and the vmForks SSR module runner picks up the
  // 'module' export condition → ESM syntax error. Pre-bundle via the SSR
  // optimizer to force Vite/esbuild to convert it to CJS before execution.
  deps: {
    optimizer: {
      ssr: {
        include: ['@reduxjs/toolkit', 'recharts'],
      },
    },
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: sharedAlias,
    // Drop 'module' condition so the Vite module-runner (vmForks) doesn't
    // resolve ESM-only builds of CJS packages like @reduxjs/toolkit.
    conditions: ['browser', 'import', 'default'],
    // Also drop 'module' from mainFields to prevent ESM resolution via
    // pkg.module when the exports map isn't matched.
    mainFields: ['browser', 'main'],
  },
  test: {
    // Top-level reporters & output apply to all runs (including `vitest run`)
    reporters: ['default', 'json'],
    outputFile: './test-results/vitest-results.json',
    bail: 0,

    // ── Named projects — each maps to a logical category of tests ────────────
    // Run a single project:  vitest run --project=<name>
    // Run several projects:  vitest run --project=crm --project=reports
    // Run all projects:      vitest run  (no --project flag)
    projects: [
      {
        // AiSHA chat, voice, NLU, AI engine — anything under src/ai/ or src/__tests__/ai/
        name: 'aisha',
        plugins: [react()],
        test: {
          ...sharedConfig,
          include: [
            'src/ai/**/*.test.{js,jsx,ts,tsx}',
            'src/ai/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/__tests__/ai/**/*.test.{js,jsx,ts,tsx}',
            'src/__tests__/processChatCommand.test.ts',
            'src/components/ai/**/*.test.{js,jsx,ts,tsx}',
            'src/components/ai/**/__tests__/**/*.{js,jsx,ts,tsx}',
          ],
        },
        resolve: sharedResolve,
      },
      {
        // CRM entities: leads, contacts, accounts, opportunities, activities, bizdev
        name: 'crm',
        plugins: [react()],
        test: {
          ...sharedConfig,
          include: [
            'src/components/leads/**/*.test.{js,jsx,ts,tsx}',
            'src/components/leads/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/components/contacts/**/*.test.{js,jsx,ts,tsx}',
            'src/components/contacts/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/components/accounts/**/*.test.{js,jsx,ts,tsx}',
            'src/components/accounts/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/components/opportunities/**/*.test.{js,jsx,ts,tsx}',
            'src/components/opportunities/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/components/activities/**/*.test.{js,jsx,ts,tsx}',
            'src/components/activities/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/components/bizdev/**/*.test.{js,jsx,ts,tsx}',
            'src/components/bizdev/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/components/employees/**/*.test.{js,jsx,ts,tsx}',
            'src/components/employees/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/pages/__tests__/*.smoke.test.{jsx,tsx}',
            'src/api/entities.test.js',
          ],
        },
        resolve: sharedResolve,
      },
      {
        // Reports, analytics, forecasting, PEP query
        name: 'reports',
        plugins: [react()],
        test: {
          ...sharedConfig,
          // recharts (CJS) requires @reduxjs/toolkit which exposes only an ESM
          // export condition; mock recharts at setup time to avoid loading it.
          setupFiles: ['./src/test/setup.js', './src/test/setup-reports.js'],
          include: [
            'src/components/reports/**/*.test.{js,jsx,ts,tsx}',
            'src/components/reports/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/components/workflows/**/__tests__/**/*.pepQuery*.{js,jsx,ts,tsx}',
          ],
        },
        resolve: sharedResolve,
      },
      {
        // Workflows and automation
        name: 'workflows',
        plugins: [react()],
        test: {
          ...sharedConfig,
          env: { NODE_ENV: 'test' },
          include: [
            'src/components/workflows/**/*.test.{js,jsx,ts,tsx}',
            'src/components/workflows/**/__tests__/**/*.{js,jsx,ts,tsx}',
          ],
          exclude: [
            // pepQuery tests belong to reports project
            'src/components/workflows/**/__tests__/**/*.pepQuery*.{js,jsx,ts,tsx}',
          ],
        },
        resolve: sharedResolve,
      },
      {
        // Integrations (file upload, WhatsApp, webhooks, etc.)
        name: 'integrations',
        plugins: [react()],
        test: {
          ...sharedConfig,
          include: [
            'src/__tests__/integrations.test.js',
            'src/api/functions.test.js',
            'src/api/emailTemplates.test.js',
          ],
        },
        resolve: sharedResolve,
      },
      {
        // Platform-level: shared components, hooks, utils, lib, settings
        name: 'platform',
        plugins: [react()],
        test: {
          ...sharedConfig,
          include: [
            'src/components/shared/**/*.test.{js,jsx,ts,tsx}',
            'src/components/shared/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/components/settings/**/*.test.{js,jsx,ts,tsx}',
            'src/components/settings/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/hooks/**/*.test.{js,jsx,ts,tsx}',
            'src/hooks/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/utils/**/*.test.{js,jsx,ts,tsx}',
            'src/lib/**/*.test.{js,jsx,ts,tsx}',
            'src/lib/**/__tests__/**/*.{js,jsx,ts,tsx}',
            'src/__tests__/package-validation.test.js',
          ],
        },
        resolve: sharedResolve,
      },
    ],
  },
});
