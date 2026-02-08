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
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    css: true,
    testTimeout: 60000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    reporters: ["default", "json"],
    outputFile: "./test-results/vitest-results.json",
    bail: 0,
    passWithNoTests: true,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true
      }
    },
    onConsoleLog: () => true,
    exclude: ["backend/test/**", "backend/tests/**", "tests/e2e/**"],
    include: ["src/**/*.test.{js,jsx,ts,tsx}", "src/**/__tests__/**/*.{js,jsx,ts,tsx}"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
