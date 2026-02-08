#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");

const DEFAULT_CONTAINER = "aishacrm-backend";
const DEFAULT_TEST_CMD = [
  "node",
  "--test",
  "--test-timeout=120000",
  "--test-reporter",
  "tap",
  "__tests__/**/*.test.js",
];

const REQUIRED_ENV = [
  "BACKEND_URL",
  "TEST_TENANT_ID",
  "TEST_TENANT_SLUG",
  "CI",
  "CI_BACKEND_TESTS",
  "SKIP_SLOW_TESTS",
  "OFFICE_VIZ_URL",
  "TELEMETRY_SIDECAR",
  "TELEMETRY_ENABLED",
  "TELEMETRY_LOG_PATH",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "GITHUB_REPO_OWNER",
  "GITHUB_REPO_NAME",
  "GITHUB_WORKFLOW_FILE",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_ENDPOINT",
];

const args = process.argv.slice(2);
const containerArg = args.find((arg) => arg.startsWith("--container="));
const containerName = containerArg ? containerArg.split("=")[1] : process.env.BACKEND_CONTAINER || DEFAULT_CONTAINER;
const commandIndex = args.indexOf("--");
const command = commandIndex === -1 ? DEFAULT_TEST_CMD : args.slice(commandIndex + 1);

const envArgs = [];
const missing = [];
const injected = [];

for (const key of REQUIRED_ENV) {
  const value = process.env[key];
  if (value === undefined || value === "") {
    missing.push(key);
    continue;
  }

  injected.push(key);
  envArgs.push("-e", `${key}=${value}`);
}

if (injected.length) {
  console.log("Injected env:", injected.join(", "));
}

if (missing.length) {
  console.warn("Missing env (not injected):", missing.join(", "));
}

const dockerArgs = ["exec", ...envArgs, containerName, ...command];
const result = spawnSync("docker", dockerArgs, { stdio: "inherit" });

process.exit(result.status ?? 1);
