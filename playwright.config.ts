/// <reference types="node" />

import "dotenv/config";
import process from "process";
import { defineConfig, devices } from "@playwright/test";

const FRONTEND_URL =
  process.env.PLAYWRIGHT_FRONTEND_URL ||
  process.env.VITE_AISHACRM_FRONTEND_URL ||
  "http://localhost:4000";
const BACKEND_URL =
  process.env.PLAYWRIGHT_BACKEND_URL ||
  process.env.VITE_AISHACRM_BACKEND_URL ||
  "http://localhost:4001";

process.env.PLAYWRIGHT_FRONTEND_URL = FRONTEND_URL;
process.env.PLAYWRIGHT_BACKEND_URL = BACKEND_URL;

const authFile = "playwright/.auth/superadmin.json";

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/components/**",
  timeout: 60 * 1000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: FRONTEND_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "setup",
      testMatch: "e2e/auth.setup.js"
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: authFile },
      dependencies: ["setup"]
    }
  ]
});
