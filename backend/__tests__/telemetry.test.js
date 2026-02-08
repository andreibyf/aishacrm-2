import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { withTimeoutSkip, getTestTimeoutMs } from './helpers/timeout.js';

const timeoutTest = (name, fn) =>
  test(name, { timeout: getTestTimeoutMs() }, async (t) => {
    await withTimeoutSkip(t, fn);
  });

function makeTempFile() {
  return path.join(os.tmpdir(), `telemetry-test-${Date.now()}-${Math.random()}.ndjson`);
}

async function loadTelemetryWithEnv(envOverrides) {
  const prevEnabled = process.env.TELEMETRY_ENABLED;
  const prevPath = process.env.TELEMETRY_LOG_PATH;

  process.env.TELEMETRY_ENABLED = envOverrides.TELEMETRY_ENABLED;
  process.env.TELEMETRY_LOG_PATH = envOverrides.TELEMETRY_LOG_PATH;

  // Bust the ESM module cache so env is read fresh each time
  const modulePath = `../lib/telemetry/index.js?ts=${Date.now()}-${Math.random()}`;
  const mod = await import(modulePath);

  process.env.TELEMETRY_ENABLED = prevEnabled;
  process.env.TELEMETRY_LOG_PATH = prevPath;

  return mod;
}

function readEvents(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const content = fs.readFileSync(logPath, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map((line) => JSON.parse(line));
}

timeoutTest('telemetryLog writes sanitized event when enabled', async () => {
  const logPath = makeTempFile();
  const { telemetryLog } = await loadTelemetryWithEnv({
    TELEMETRY_ENABLED: 'true',
    TELEMETRY_LOG_PATH: logPath,
  });

  const oversized = 'x'.repeat(3005);
  telemetryLog({ type: 'run_started', tenant_id: 'tenant-123', extra: oversized });

  const events = readEvents(logPath);
  assert.equal(events.length, 1);
  const evt = events[0];

  assert.equal(evt.type, 'run_started');
  assert.equal(evt.tenant_id, 'tenant-123');
  assert.equal(evt._telemetry, true);
  assert.ok(evt.ts, 'ts should be present');
  assert.ok(evt.extra.length <= 2001, 'extra should be truncated to capString limit');

  fs.rmSync(logPath, { force: true });
});

timeoutTest('telemetryLog does nothing when disabled', async () => {
  const logPath = makeTempFile();
  const { telemetryLog } = await loadTelemetryWithEnv({
    TELEMETRY_ENABLED: 'false',
    TELEMETRY_LOG_PATH: logPath,
  });

  telemetryLog({ type: 'run_started', tenant_id: 'tenant-123' });

  const events = readEvents(logPath);
  assert.equal(events.length, 0);
  fs.rmSync(logPath, { force: true });
});
