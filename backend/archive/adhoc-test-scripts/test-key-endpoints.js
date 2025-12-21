/**
 * Key Endpoints Smoke Tests
 * - Users heartbeat
 * - Employees list
 */

const BASE_URL = 'http://localhost:3001';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function req(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, ok: res.ok, data };
}

async function testHeartbeat(email) {
  const r = await req('POST', '/api/users/heartbeat', { email });
  if (r.ok && r.data?.status === 'success') {
    log(colors.green, `✓ Heartbeat OK for ${email}`);
  } else {
    log(colors.red, `✗ Heartbeat failed for ${email}`, r.status, r.data);
    process.exitCode = 1;
  }
}

async function testEmployeesList(tenantId) {
  const r = await req('GET', `/api/employees?tenant_id=${encodeURIComponent(tenantId)}`);
  if (r.ok && r.data?.status === 'success' && Array.isArray(r.data?.data?.employees)) {
    log(colors.green, `✓ Employees list OK for tenant ${tenantId} (count=${r.data.data.employees.length})`);
  } else {
    log(colors.red, `✗ Employees list failed for tenant ${tenantId}`, r.status, r.data);
    process.exitCode = 1;
  }
}

async function go() {
  log(colors.blue, '\nKey Endpoints Smoke Tests');
  await testHeartbeat('abyfield@4vdataconsulting.com');
  await testEmployeesList('a11dfb63-4b18-4eb8-872e-747af2e37c46');
}

go().catch(err => {
  log(colors.red, 'Fatal error:', err.message);
  process.exit(1);
});
