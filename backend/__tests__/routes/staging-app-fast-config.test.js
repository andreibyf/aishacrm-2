import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Static-analysis tests for staging/02-app-fast/docker-compose.yml.
// Two services: frontend (vite) + aisha-comms (backend image, comms worker).

const here = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(here, '..', '..', '..', 'staging', '02-app-fast', 'docker-compose.yml');
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

test('staging-app-fast: frontend block exists with correct image tag', () => {
  const block = getServiceBlock(compose, 'frontend');
  assert.ok(block.length > 200);
  assert.match(block, /image:\s*aishacrm-frontend:coolify/);
  assert.doesNotMatch(block, /image:\s*ghcr\.io/);
});

test('staging-app-fast: comms is named `aisha-comms` (NOT `comms`)', () => {
  // The manual stack uses `aisha-comms` and Doppler envs reference that name.
  assert.match(compose, /^\s{2}aisha-comms:$/m, 'service must be `aisha-comms`');
  assert.doesNotMatch(compose, /^\s{2}comms:$/m, 'must not use bare `comms` (collides with nothing but mismatches manual stack)');
});

test('staging-app-fast: aisha-comms uses backend image + worker:communications command', () => {
  const block = getServiceBlock(compose, 'aisha-comms');
  assert.match(block, /image:\s*aishacrm-backend:coolify/);
  assert.match(block, /command:\s*\["npm",\s*"run",\s*"worker:communications"\]/);
});

test('staging-app-fast: both services have build context `.` (no ../..)', () => {
  for (const svc of ['frontend', 'aisha-comms']) {
    const block = getServiceBlock(compose, svc);
    assert.match(block, /\s+build:\s*\n(?:[^\n]*\n)*?\s+context:\s*\.\s*\n/m,
      `${svc} build context must be \`.\``);
    assert.doesNotMatch(block, /context:\s*\.\.\//,
      `${svc} must NOT use \`..\` paths`);
  }
});

test('staging-app-fast: mem_limits set (frontend ~256m, comms ~768m)', () => {
  const fb = getServiceBlock(compose, 'frontend');
  const cb = getServiceBlock(compose, 'aisha-comms');
  assert.match(fb, /mem_limit:\s*256m/);
  assert.match(cb, /mem_limit:\s*768m/);
});

test('staging-app-fast: DNS aliases declared for each service', () => {
  const fb = getServiceBlock(compose, 'frontend');
  const cb = getServiceBlock(compose, 'aisha-comms');
  assert.match(fb, /aliases:\s*\n\s+-\s*frontend\s*$/m);
  assert.match(cb, /aliases:\s*\n\s+-\s*aisha-comms\s*$/m);
});

test('staging-app-fast: Doppler config is stg_stg for both', () => {
  for (const svc of ['frontend', 'aisha-comms']) {
    const block = getServiceBlock(compose, svc);
    const cfg = block.split('\n').find((l) => /^\s+- DOPPLER_CONFIG=/.test(l));
    assert.ok(cfg && /stg_stg/.test(cfg) && !/prd_prd/.test(cfg),
      `${svc} DOPPLER_CONFIG must be stg_stg`);
  }
});

test('staging-app-fast: top-level network maps to aishacrm_aishanet-staging', () => {
  const idx = compose.search(/^networks:\s*$/m);
  assert.ok(idx >= 0);
  const tail = compose.slice(idx);
  assert.match(tail, /^\s+staging-aishanet:\s*$/m);
  assert.match(tail, /^\s+external:\s*true\s*$/m);
  assert.match(tail, /^\s+name:\s*aishacrm_aishanet-staging\s*$/m);
});

test('staging-app-fast: frontend has SERVICE_FQDN_FRONTEND set (Coolify auto-routes)', () => {
  const block = getServiceBlock(compose, 'frontend');
  const line = block.split('\n').find((l) => /^\s+- SERVICE_FQDN_FRONTEND=/.test(l));
  assert.ok(line, 'SERVICE_FQDN_FRONTEND env required for Coolify auto-routing');
  assert.match(line, /staging-app\.aishacrm\.com/);
});
test('staging-app-fast: aisha-comms CRM_BACKEND_URL uses aishacrm-backend alias', () => {
  const block = getServiceBlock(compose, 'aisha-comms');
  const line = block.split('\n').find((l) => /CRM_BACKEND_URL=/.test(l));
  assert.ok(line);
  assert.match(line, /http:\/\/aishacrm-backend:3001/,
    'must use aishacrm-backend alias (Doppler convention) not bare `backend`');
});
