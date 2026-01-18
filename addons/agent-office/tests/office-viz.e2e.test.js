import { execSync, spawnSync } from 'node:child_process';
import assert from 'node:assert';
import test from 'node:test';

// Dev defaults; override via env if needed.
const OFFICE_VIZ_URL = process.env.OFFICE_VIZ_URL || 'http://localhost:4010';
const TELEMETRY_SIDECAR = process.env.TELEMETRY_SIDECAR || 'aisha-telemetry-sidecar';

async function fetchJson(path, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OFFICE_VIZ_URL}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function isHealthy() {
  try {
    await fetchJson('/health', 2000);
    return true;
  } catch {
    return false;
  }
}

function injectTelemetry() {
  // Generate a small event set targeted at backoffice/ops agents.
  const events = execSync(
    'node scripts/maintenance/emit_viz_test_events.js --count 1 --complete 1 --assignee ops_manager:dev --tenant dev --interval-ms 10',
    { cwd: process.cwd() }
  );

  const r = spawnSync(
    'docker',
    ['exec', '-i', TELEMETRY_SIDECAR, 'sh', '-c', 'cat >> /telemetry/telemetry.ndjson'],
    { input: events }
  );

  if (r.status !== 0) {
    throw new Error(r.stderr?.toString() || 'failed to inject events');
  }
}

async function waitFor(predicate, timeoutMs = 15000, intervalMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await fetchJson('/events', 3000).catch(() => null);
    const evt = data?.events?.find(predicate);
    if (evt) return evt;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for matching event`);
}

test('office-viz receives backoffice/ops telemetry (timeout protected)', { timeout: 20000 }, async (t) => {
  if (!(await isHealthy())) {
    t.skip('office-viz not reachable on /health');
  }

  injectTelemetry();

  const evt = await waitFor(
    (e) => e?.type === 'task_created' && e?.agent_id === 'ops_manager:dev',
    15000,
    1000
  );

  assert.ok(evt, 'expected task_created event for ops_manager:dev');
});

test('office-viz /events reflects injected backoffice tasks', { timeout: 20000 }, async (t) => {
  if (!(await isHealthy())) {
    t.skip('office-viz not reachable on /health');
  }

  injectTelemetry();

  const evt = await waitFor(
    (e) => e?.type === 'task_assigned' && e?.to_agent_id === 'ops_manager:dev',
    20000,
    1000
  );

  assert.ok(evt, 'expected task_assigned to ops_manager:dev to appear in /events');
});

test('office-viz surfaces tool_call for backoffice agent', { timeout: 20000 }, async (t) => {
  if (!(await isHealthy())) {
    t.skip('office-viz not reachable on /health');
  }

  injectTelemetry();

  const evt = await waitFor(
    (e) => e?.type === 'tool_call' && e?.agent_id === 'ops_manager:dev',
    15000,
    1000
  );

  assert.ok(evt, 'expected tool_call from ops_manager:dev');
});