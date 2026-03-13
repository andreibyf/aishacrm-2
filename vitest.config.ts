/// <reference types="node" />

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// ─── Shared config applied to every project ───────────────────────────────────
const sharedConfig = {
  globals: true,
  environment: "jsdom" as const,
  setupFiles: "./src/test/setup.js",
  css: true,
  testTimeout: 60000,
  hookTimeout: 30000,
  teardownTimeout: 10000,
  passWithNoTests: true,
  pool: "threads" as const,
  poolOptions: {
    threads: {
      singleThread: false,
      isolate: true,
    },
  },
  onConsoleLog: () => true,
};

export default defineConfig({
  plugins: [react()],
  test: {
    // Top-level reporters & output apply to all runs (including `vitest run`)
    reporters: ["default", "json"],
    outputFile: "./test-results/vitest-results.json",
    bail: 0,

    // ── Named projects — each maps to a logical category of tests ────────────
    // Run a single project:  vitest run --project=<name>
    // Run several projects:  vitest run --project=crm --project=reports
    // Run all projects:      vitest run  (no --project flag)
    projects: [
      {
        // AiSHA chat, voice, NLU, AI engine — anything under src/ai/ or src/__tests__/ai/
        name: "aisha",
        plugins: [react()],
        test: {
          ...sharedConfig,
          include: [
            "src/ai/**/*.test.{js,jsx,ts,tsx}",
            "src/ai/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/__tests__/ai/**/*.test.{js,jsx,ts,tsx}",
            "src/__tests__/processChatCommand.test.ts",
            "src/components/ai/**/*.test.{js,jsx,ts,tsx}",
            "src/components/ai/**/__tests__/**/*.{js,jsx,ts,tsx}",
          ],
        },
        resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
      },
      {
        // CRM entities: leads, contacts, accounts, opportunities, activities, bizdev
        name: "crm",
        plugins: [react()],
        test: {
          ...sharedConfig,
          include: [
            "src/components/leads/**/*.test.{js,jsx,ts,tsx}",
            "src/components/leads/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/components/contacts/**/*.test.{js,jsx,ts,tsx}",
            "src/components/contacts/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/components/accounts/**/*.test.{js,jsx,ts,tsx}",
            "src/components/accounts/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/components/opportunities/**/*.test.{js,jsx,ts,tsx}",
            "src/components/opportunities/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/components/activities/**/*.test.{js,jsx,ts,tsx}",
            "src/components/activities/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/components/bizdev/**/*.test.{js,jsx,ts,tsx}",
            "src/components/bizdev/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/components/employees/**/*.test.{js,jsx,ts,tsx}",
            "src/components/employees/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/pages/__tests__/*.smoke.test.{jsx,tsx}",
            "src/api/entities.test.js",
          ],
        },
        resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
      },
      {
        // Reports, analytics, forecasting, PEP query
        name: "reports",
        plugins: [react()],
        test: {
          ...sharedConfig,
          include: [
            "src/components/reports/**/*.test.{js,jsx,ts,tsx}",
            "src/components/reports/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/components/workflows/**/__tests__/**/*.pepQuery*.{js,jsx,ts,tsx}",
          ],
        },
        resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
      },
      {
        // Workflows and automation
        name: "workflows",
        plugins: [react()],
        test: {
          ...sharedConfig,
          include: [
            "src/components/workflows/**/*.test.{js,jsx,ts,tsx}",
            "src/components/workflows/**/__tests__/**/*.{js,jsx,ts,tsx}",
          ],
          exclude: [
            // pepQuery tests belong to reports project
            "src/components/workflows/**/__tests__/**/*.pepQuery*.{js,jsx,ts,tsx}",
          ],
        },
        resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
      },
      {
        // Integrations (file upload, WhatsApp, webhooks, etc.)
        name: "integrations",
        plugins: [react()],
        test: {
          ...sharedConfig,
          include: [
            "src/__tests__/integrations.test.js",
            "src/api/functions.test.js",
          ],
        },
        resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
      },
      {
        // Platform-level: shared components, hooks, utils, lib, settings
        name: "platform",
        plugins: [react()],
        test: {
          ...sharedConfig,
          include: [
            "src/components/shared/**/*.test.{js,jsx,ts,tsx}",
            "src/components/shared/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/components/settings/**/*.test.{js,jsx,ts,tsx}",
            "src/components/settings/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/hooks/**/*.test.{js,jsx,ts,tsx}",
            "src/hooks/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/utils/**/*.test.{js,jsx,ts,tsx}",
            "src/lib/**/*.test.{js,jsx,ts,tsx}",
            "src/lib/**/__tests__/**/*.{js,jsx,ts,tsx}",
            "src/__tests__/package-validation.test.js",
          ],
        },
        resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
      },
    ],
  },
});
