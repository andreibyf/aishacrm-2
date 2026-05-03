import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Static-analysis tests for staging/01-backend-heavy/docker-compose.yml.
// Coolify-native build; redis intentionally NOT in this file (manual stack
// owns redis-memory + redis-cache for state persistence).

const here = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(here, '..', '..', '..', 'staging', '01-backend-heavy', 'docker-compose.yml');

if (!existsSync(composePath)) {
  test.skip('compose file not reachable from cwd — these static-analysis tests only run from the repo root, not from inside the backend container', () => {});
} else {
  const compose = readFileSync(composePath, 'utf8');

  function getServiceBlock(text, serviceName) {
    const startRe = new RegExp(`^ {2}${serviceName}:$`, 'm');
    const startMatch = text.match(startRe);
    if (!startMatch) return '';
    const start = startMatch.index;
    const after = text.slice(start + startMatch[0].length);
    const endMatch = after.match(/^ {2}[a-z][\w-]*:$|^volumes:$|^networks:$/m);
    const end = endMatch ? endMatch.index : after.length;
    return after.slice(0, end);
  }

  test('staging-backend-heavy: backend service block exists', () => {
  const block = getServiceBlock(compose, 'backend');
  assert.ok(block.length > 200, 'backend service block missing or truncated');
});

test('staging-backend-heavy: redis services NOT in this compose (manual stack owns them)', () => {
  assert.doesNotMatch(compose, /^\s{2}redis-memory:$/m,
    'redis-memory must remain in manual docker-compose.staging.yml');
  assert.doesNotMatch(compose, /^\s{2}redis-cache:$/m,
    'redis-cache must remain in manual docker-compose.staging.yml');
});

test('staging-backend-heavy: build context is `.` (no ../..)', () => {
  const block = getServiceBlock(compose, 'backend');
  assert.match(block, /\s+build:\s*\n(?:[^\n]*\n)*?\s+context:\s*\.\s*\n/m,
    'context must be `.` for Coolify --project-directory');
  assert.doesNotMatch(block, /context:\s*\.\.\//,
    'must NOT use `..` paths');
});

test('staging-backend-heavy: image is locally-built (no ghcr.io)', () => {
  const block = getServiceBlock(compose, 'backend');
  assert.doesNotMatch(block, /image:\s*ghcr\.io/);
  assert.match(block, /image:\s*aishacrm-backend:coolify/);
});

test('staging-backend-heavy: backend declares both DNS aliases [backend, aishacrm-backend]', () => {
  const block = getServiceBlock(compose, 'backend');
  assert.match(block, /aliases:\s*\n\s+-\s*backend\s*\n\s+-\s*aishacrm-backend/m,
    'must declare both `backend` and `aishacrm-backend` aliases (Doppler CRM_BACKEND_URL uses the latter)');
});

test('staging-backend-heavy: mem_limit set within prod range', () => {
  const block = getServiceBlock(compose, 'backend');
  const m = block.match(/mem_limit:\s*(\d+)([mg])/);
  assert.ok(m, 'mem_limit must be declared');
  const mb = m[2] === 'g' ? parseInt(m[1]) * 1024 : parseInt(m[1]);
  assert.ok(mb >= 1536 && mb <= 4096, `mem_limit ${mb}MB must be in [1536, 4096]`);
});

test('staging-backend-heavy: Doppler config is stg_stg', () => {
  const block = getServiceBlock(compose, 'backend');
  const cfg = block.split('\n').find((l) => /^\s+- DOPPLER_CONFIG=/.test(l));
  assert.ok(cfg && /stg_stg/.test(cfg) && !/prd_prd/.test(cfg));
});

test('staging-backend-heavy: top-level network maps to aishacrm_aishanet-staging', () => {
  const idx = compose.search(/^networks:\s*$/m);
  assert.ok(idx >= 0);
  const tail = compose.slice(idx);
  assert.match(tail, /^\s+staging-aishanet:\s*$/m);
  assert.match(tail, /^\s+external:\s*true\s*$/m);
  assert.match(tail, /^\s+name:\s*aishacrm_aishanet-staging\s*$/m);
});

test('staging-backend-heavy: SERVICE_FQDN_BACKEND env set (Coolify auto-routes)', () => {
  const block = getServiceBlock(compose, 'backend');
  const line = block.split('\n').find((l) => /^\s+- SERVICE_FQDN_BACKEND=/.test(l));
  assert.ok(line, 'SERVICE_FQDN_BACKEND env required for Coolify auto-routing');
  assert.match(line, /staging-api\.aishacrm\.com/);
});
test('staging-backend-heavy: BRAID_MCP_URL points at canonical braid-mcp-server', () => {
  const block = getServiceBlock(compose, 'backend');
  const line = block.split('\n').find((l) => /^\s+- BRAID_MCP_URL=/.test(l));
  assert.ok(line);
  assert.match(line, /http:\/\/braid-mcp-server:8000/);
});
}
