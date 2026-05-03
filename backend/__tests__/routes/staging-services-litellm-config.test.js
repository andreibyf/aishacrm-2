import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Static-analysis tests for staging/services/litellm/docker-compose.yml.
//
// Mirror of prod-litellm-coolify-config.test.js with the staging-specific
// expectations (staging-aishanet network, stg_stg Doppler, aishacrm-litellm-staging-coolify
// container name). Designed to catch the same Coolify v4 quirks that bit
// the prod deploy: `..` path resolution, container_name being ignored,
// service-name DNS collision.

const here = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(
  here, '..', '..', '..', 'staging', 'services', 'litellm', 'docker-compose.yml',
);

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

const block = getServiceBlock(compose, 'litellm');

test('staging-litellm: file is loadable + has litellm service block', () => {
  assert.ok(block.length > 200, 'litellm service block missing or truncated');
});

test('staging-litellm: service name is `litellm` (replaces retired GHCR sibling)', () => {
  // After the GHCR-pulled aishacrm-litellm-staging is retired, the Coolify-
  // built container claims the service name `litellm` on staging-aishanet.
  // Backend's LITELLM_BASE_URL=http://litellm:4000 resolves to this one.
  assert.match(compose, /^\s{2}litellm:\s*$/m, 'service must be named `litellm`');
});

test('staging-litellm: build context is `.` (not ../..) — Coolify v4 quirk', () => {
  assert.match(block,
    /\s+build:\s*\n(?:[^\n]*\n)*?\s+context:\s*\.\s*\n(?:[^\n]*\n)*?\s+dockerfile:\s*litellm\/Dockerfile/m,
    'build context must be `.` and dockerfile `litellm/Dockerfile` — Coolify resolves both via --project-directory');
  assert.doesNotMatch(block, /context:\s*\.\.\//,
    'context must NOT use `..` — Coolify v4 path resolution breaks with relative parents');
});

test('staging-litellm: image is locally-built (no ghcr.io)', () => {
  assert.doesNotMatch(block, /image:\s*ghcr\.io/,
    'must not pull from GHCR — the whole point of Phase 2 is local build');
  assert.match(block, /image:\s*aishacrm-litellm-staging:coolify/,
    'image tag should be `aishacrm-litellm-staging:coolify` — local cache key alongside `build:` directive');
});

test('staging-litellm: mem_limit set in 256m..768m range', () => {
  const line = block.split('\n').find((l) => /^\s+mem_limit:/.test(l));
  assert.ok(line, 'mem_limit must be declared so it fits alongside the manually-deployed sibling');
  const value = line.replace(/^\s+mem_limit:\s*/, '').trim();
  const m = value.match(/^(\d+)([gmk])$/i);
  assert.ok(m, `mem_limit value '${value}' must match digit+unit format`);
  const mb = parseInt(m[1], 10) * (m[2].toLowerCase() === 'g' ? 1024 : 1);
  // Bumped from 256-768 MB after first deploy showed 384m was 97% utilized.
  assert.ok(mb >= 384 && mb <= 1024, `mem_limit ${value} (${mb}MB) must be in [384, 1024] MB`);
});

test('staging-litellm: joins external staging-aishanet (not prod aishanet)', () => {
  assert.match(block, /networks:\s*\n\s+staging-aishanet:/,
    'service must join staging-aishanet — backend-staging lives on it. Joining `aishanet` would mix staging traffic into prod (not present on this host but bad practice).');
  assert.doesNotMatch(block, /^\s+- aishanet$/m,
    'service must NOT join the bare `aishanet` network');
});

test('staging-litellm: explicit DNS alias `litellm`', () => {
  assert.match(block,
    /networks:\s*\n\s+staging-aishanet:\s*\n[\s\S]+?aliases:\s*\n\s+-\s*litellm\s*$/m,
    'aliases: [- litellm] gives backend the DNS hostname it expects, independent of Coolify-generated container_name');
});

test('staging-litellm: top-level network declares staging-aishanet as external + correct host name', () => {
  const match = compose.match(/^networks:\s*\n([\s\S]+?)(?:^volumes:|^services:|$(?![\r\n]))/m);
  assert.ok(match, 'top-level networks: section missing');
  assert.match(match[1], /^\s+staging-aishanet:\s*$/m, 'staging-aishanet entry missing');
  assert.match(match[1], /^\s+external:\s*true\s*$/m,
    'staging-aishanet must be `external: true` — it is owned by docker-compose.staging.yml; Coolify must not recreate it');
  assert.match(match[1], /^\s+name:\s*aishacrm_aishanet-staging\s*$/m,
    'name: must map to the actual host network `aishacrm_aishanet-staging` (Compose project-prefixed name from docker-compose.staging.yml)');
});

test('staging-litellm: Doppler env points at stg_stg (not prd_prd)', () => {
  const cfgLine = block.split('\n').find((l) => /^\s+- DOPPLER_CONFIG=/.test(l));
  assert.ok(cfgLine, 'DOPPLER_CONFIG must be in env');
  assert.match(cfgLine, /stg_stg/,
    'DOPPLER_CONFIG must default to stg_stg — staging isolation from prd_prd');
  assert.doesNotMatch(cfgLine, /prd_prd/,
    'DOPPLER_CONFIG must not reference prd_prd');
});
}
