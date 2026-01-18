import { execSync, spawnSync } from 'node:child_process';
import assert from 'node:assert';
import test from 'node:test';

const OFFICE_VIZ_URL = process.env.OFFICE_VIZ_URL || 'http://localhost:4010';
const SIDE_CAR = process.env.TELEMETRY_SIDECAR || 'aisha-telemetry-sidecar';

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

async function isOfficeVizHealthy() {
  try {
    await fetchJson('/health', 3000);
    return true;
  } catch {
    return false;
  }
}

function injectTestEvents() {
  // Generate a small, deterministic set of events and pipe them into the telemetry sidecar volume.
  const events = execSync(
    'node scripts/maintenance/emit_viz_test_events.js --count 1 --complete 1 --assignee ops_manager:dev --tenant dev --interval-ms 10',
    { cwd: process.cwd() }
  );

  const r = spawnSync(
    'docker',
    ['exec', '-i', SIDE_CAR, 'sh', '-c', 'cat >> /telemetry/telemetry.ndjson'],
    { input: events }
  );

  if (r.status !== 0) {
    const err = r.stderr?.toString() || 'unknown';
    throw new Error(`Failed to inject telemetry events: ${err}`);
  }
}

async function waitForEvent(predicate, timeoutMs = 15000, intervalMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await fetchJson('/events', 3000);
    const match = (data?.events || []).find(predicate);
    if (match) return match;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for matching event`);
}

test('office-viz ingests backoffice agent telemetry (timeout-protected)', { timeout: 20000 }, async (t) => {
  if (!(await isOfficeVizHealthy())) {
    t.skip('office-viz not reachable on /health');
  }

  // Inject a single backoffice/ops task event set into the telemetry stream.
  injectTestEvents();

  const evt = await waitForEvent(
    (e) => e?.type === 'task_created' && e?.agent_id === 'ops_manager:dev',
    15000,
    1000
  );

  assert.ok(evt, 'expected task_created event for ops_manager:dev');
});