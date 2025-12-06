import test from 'node:test';
import assert from 'node:assert';
import { setTimeout as delay } from 'node:timers/promises';

// In CI, skip integration tests that require a running backend
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

// The server starts automatically when server.js is imported.
// We leverage the existing exported server for teardown.
let serverRef;

async function startServerOnce() {
  if (serverRef) return serverRef;
  const mod = await import('../../server.js');
  serverRef = mod.server; // already listening on PORT env (default 3001)
  return serverRef;
}

async function waitForHealth(baseUrl, attempts = 15, intervalMs = 300) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        const json = await res.json();
        return json;
      }
      lastError = new Error(`Non-200: ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await delay(intervalMs);
  }
  throw lastError || new Error('Health endpoint unreachable');
}

const BASE = process.env.BACKEND_URL || 'http://localhost:3001';

// Integration test: ensure /health responds with expected shape
// NOTE: This does not mock external services; relies on Supabase env if configured.

(SHOULD_RUN ? test : test.skip)('health endpoint returns ok status and required fields', async () => {
  await startServerOnce();
  const data = await waitForHealth(BASE);
  assert.strictEqual(data.status, 'ok', 'status should be ok');
  assert.ok(typeof data.timestamp === 'string', 'timestamp should be string');
  assert.ok(typeof data.uptime === 'number', 'uptime should be number');
  assert.ok(['connected', 'not configured'].includes(data.database), 'database field should reflect connection status');
});

// Teardown: close server to avoid open handles keeping test process alive
// Use node:test built-in after hook
import { after } from 'node:test';
after(() => {
  if (!SHOULD_RUN) return;
  if (serverRef && serverRef.close) {
    return new Promise((resolve) => {
      serverRef.close(() => resolve());
    });
  }
});
