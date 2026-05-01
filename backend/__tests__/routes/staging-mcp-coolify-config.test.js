import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Static-analysis tests for staging/04-braid/docker-compose.yml (mcp).
// Mirrors the staging-services-litellm-config test pattern with mcp-specific
// expectations: 3-container distributed setup, all on staging-aishanet.

const here = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(here, '..', '..', '..', 'staging', '04-braid', 'docker-compose.yml');
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

// Services use `-coolify` suffix during soak to avoid DNS collision with
// the existing GHCR sibling `aishacrm-braid-mcp-staging` (service name
// `braid-mcp-server` on aishanet-staging). At cutover (post-soak), they
// rename back — see staging-mcp-coolify-final-config.test.js for that.
const SERVICES = ['braid-mcp-server-coolify', 'braid-mcp-1-coolify', 'braid-mcp-2-coolify'];

for (const svc of SERVICES) {
  test(`staging-mcp: ${svc} service block exists`, () => {
    const block = getServiceBlock(compose, svc);
    assert.ok(block.length > 100, `${svc} service block missing or truncated`);
  });

  test(`staging-mcp: ${svc} build context is 'braid-mcp-node-server' (no ../)`, () => {
    const block = getServiceBlock(compose, svc);
    assert.match(
      block,
      /\s+build:\s*\n(?:[^\n]*\n)*?\s+context:\s*braid-mcp-node-server\s*\n(?:[^\n]*\n)*?\s+dockerfile:\s*Dockerfile/m,
      `${svc} build context must be 'braid-mcp-node-server' (relative to repo root via Coolify --project-directory)`,
    );
    assert.doesNotMatch(block, /context:\s*\.\.\//,
      `${svc} context must NOT use '..' — Coolify v4 path resolution breaks`);
  });

  test(`staging-mcp: ${svc} image is locally-built (no ghcr.io)`, () => {
    const block = getServiceBlock(compose, svc);
    assert.doesNotMatch(block, /image:\s*ghcr\.io/,
      `${svc}: must not pull from GHCR — Phase 2 is local build`);
    assert.match(block, /image:\s*aishacrm-mcp:coolify/,
      `${svc} image tag should be 'aishacrm-mcp:coolify'`);
  });

  test(`staging-mcp: ${svc} mem_limit set`, () => {
    const block = getServiceBlock(compose, svc);
    const line = block.split('\n').find((l) => /^\s+mem_limit:/.test(l));
    assert.ok(line, `${svc} must declare mem_limit`);
  });

  test(`staging-mcp: ${svc} explicit DNS alias '${svc}'`, () => {
    const block = getServiceBlock(compose, svc);
    const aliasRe = new RegExp(
      `networks:\\s*\\n\\s+staging-aishanet:\\s*\\n[\\s\\S]+?aliases:\\s*\\n\\s+-\\s*${svc.replace(/-/g, '\\-')}\\s*$`,
      'm',
    );
    assert.match(block, aliasRe,
      `${svc} must declare aliases: [- ${svc}] under networks.staging-aishanet`);
  });

  test(`staging-mcp: ${svc} Doppler env points at stg_stg`, () => {
    const block = getServiceBlock(compose, svc);
    const cfg = block.split('\n').find((l) => /^\s+- DOPPLER_CONFIG=/.test(l));
    assert.ok(cfg, `${svc} DOPPLER_CONFIG must be set`);
    assert.match(cfg, /stg_stg/, `${svc} DOPPLER_CONFIG must default to stg_stg`);
    assert.doesNotMatch(cfg, /prd_prd/, `${svc} must not reference prd_prd`);
  });
}

test('staging-mcp: top-level network maps staging-aishanet -> aishacrm_aishanet-staging', () => {
  // Locate the top-level networks: block (anchored, no leading whitespace)
  const idx = compose.search(/^networks:\s*$/m);
  assert.ok(idx >= 0, 'top-level networks: section missing');
  const tail = compose.slice(idx);
  assert.match(tail, /^\s+staging-aishanet:\s*$/m, 'staging-aishanet entry missing');
  assert.match(tail, /^\s+external:\s*true\s*$/m, 'must be external: true');
  assert.match(tail, /^\s+name:\s*aishacrm_aishanet-staging\s*$/m,
    'must map to actual host network aishacrm_aishanet-staging');
});

test('staging-mcp: workers depend on braid-mcp-server-coolify health', () => {
  for (const svc of ['braid-mcp-1-coolify', 'braid-mcp-2-coolify']) {
    const block = getServiceBlock(compose, svc);
    assert.match(block, /depends_on:\s*\n\s+braid-mcp-server-coolify:\s*\n\s+condition:\s*service_healthy/m,
      `${svc} must wait for braid-mcp-server-coolify health`);
  }
});

test('staging-mcp: workers point MCP_SERVER_URL at -coolify sibling, not GHCR sibling', () => {
  for (const svc of ['braid-mcp-1-coolify', 'braid-mcp-2-coolify']) {
    const block = getServiceBlock(compose, svc);
    const line = block.split('\n').find((l) => /^\s+- MCP_SERVER_URL=/.test(l));
    assert.ok(line, `${svc} MCP_SERVER_URL must be set`);
    assert.match(line, /braid-mcp-server-coolify:8000/,
      `${svc} MCP_SERVER_URL must point at the Coolify-built coordinator (not the GHCR sibling)`);
  }
});
