// tests/deployment/compose-topology.test.js
//
// Validates the deploy/coolify/* split for BOTH prod and staging lanes.
//
// For each domain we verify:
//   - services listed are exactly the expected set
//   - no service leaks between deployment domains
//   - every compose file declares the expected external network
//   - staging files use the staging network, staging container prefix, and
//     do not accidentally bind to prod host ports
//   - no deprecated or out-of-scope services appear anywhere
//
// Runs with plain `node --test` — no new dependencies.
//
// Usage:
//   node --test tests/deployment/compose-topology.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

// Expected service names by domain. Staging uses the same logical service
// keys under `services:` — only container_name changes.
const DOMAINS = {
  'aisha-app': {
    prod: ['frontend', 'backend', 'aisha-comms'],
    staging: ['frontend', 'backend'], // aisha-comms is Phase B (commented out)
  },
  'data-support': {
    prod: ['redis-memory', 'redis-cache'],
    staging: ['redis-memory', 'redis-cache'],
  },
  scheduling: {
    prod: ['calcom-db', 'calcom'],
    staging: ['calcom-db', 'calcom'],
  },
  'ai-runtime': {
    prod: ['braid-mcp-server', 'braid-mcp-1', 'braid-mcp-2'],
    staging: ['braid-mcp-server', 'braid-mcp-1', 'braid-mcp-2'],
  },
  'ai-infra': {
    prod: ['ollama', 'litellm'],
    staging: ['ollama', 'litellm'],
  },
};

const PROD_NETWORK = 'aishanet';
const STAGING_NETWORK = 'aishanet-staging';

// Prod host ports that must NEVER appear bound in a staging file.
const PROD_HOST_PORTS = [
  '4000', // frontend
  '4001', // backend
  '6379', // redis-memory (host side)
  '6380', // redis-cache (host side)
  '3002', // calcom
  '8000', // braid-mcp-server (host side)
  '11434', // ollama (host side)
  '11436', // dev ollama (host side)
  '4002', // litellm (host side)
];

function composePath(domain, lane) {
  return path.join(
    repoRoot,
    'deploy',
    'coolify',
    domain,
    lane === 'staging' ? 'docker-compose.staging.yml' : 'docker-compose.yml',
  );
}

// Minimal YAML scanner — top-level service key names under `services:`.
function extractServiceNames(yaml) {
  const lines = yaml.split(/\r?\n/);
  const services = [];
  let inServices = false;
  for (const line of lines) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (!inServices) continue;
    // A new top-level block ends the services section.
    if (/^[A-Za-z_][\w-]*:\s*$/.test(line)) {
      break;
    }
    // Skip commented lines (Phase B aisha-comms block).
    if (/^\s*#/.test(line)) continue;
    const match = line.match(/^ {2}([a-zA-Z0-9][a-zA-Z0-9_-]*):\s*$/);
    if (match) services.push(match[1]);
  }
  return services;
}

function hasExternalNetwork(yaml, name) {
  const networksIdx = yaml.search(/^networks:\s*$/m);
  if (networksIdx === -1) return false;
  const tail = yaml.slice(networksIdx);
  const nameRe = new RegExp(`^ {2}${name.replace(/-/g, '-')}:\\s*$`, 'm');
  const nameIdx = tail.search(nameRe);
  if (nameIdx === -1) return false;
  const block = tail.slice(nameIdx);
  const endOfBlock = block.slice(1).search(/^ {2}[a-zA-Z]/m);
  const slice = endOfBlock === -1 ? block : block.slice(0, endOfBlock + 1);
  return /^ {4}external:\s*true\s*$/m.test(slice);
}

// Pull out container_name values (uncommented) to verify the staging prefix.
function extractContainerNames(yaml) {
  return [...yaml.matchAll(/^\s*container_name:\s*([A-Za-z0-9._-]+)\s*$/gm)].map((m) => m[1]);
}

// Pull out published host ports from any `ports:` block entries.
// Looks for strings like "127.0.0.1:4100:3000" or "4100:3000".
function extractPublishedHostPorts(yaml) {
  const ports = [];
  const re = /^\s*-\s*"([^"]+)"\s*$/gm;
  let m;
  while ((m = re.exec(yaml)) !== null) {
    const spec = m[1];
    // Strip optional IP prefix.
    const parts = spec.split(':');
    let host;
    if (parts.length === 3)
      host = parts[1]; // "ip:host:container"
    else if (parts.length === 2)
      host = parts[0]; // "host:container"
    else continue;
    if (/^\d+$/.test(host)) ports.push(host);
  }
  return ports;
}

// ── prod lane ────────────────────────────────────────────────────────────────

test("[prod] every domain's compose file exists", () => {
  for (const domain of Object.keys(DOMAINS)) {
    const p = composePath(domain, 'prod');
    assert.ok(fs.existsSync(p), `missing prod compose at ${p}`);
  }
});

test('[prod] each domain declares exactly its services', () => {
  for (const [domain, expected] of Object.entries(DOMAINS)) {
    const yaml = fs.readFileSync(composePath(domain, 'prod'), 'utf8');
    const actual = extractServiceNames(yaml).sort();
    const want = [...expected.prod].sort();
    assert.deepEqual(
      actual,
      want,
      `prod "${domain}" has ${JSON.stringify(actual)}, want ${JSON.stringify(want)}`,
    );
  }
});

test('[prod] no service appears in more than one domain', () => {
  const seen = new Map();
  for (const [domain, { prod }] of Object.entries(DOMAINS)) {
    for (const svc of prod) {
      if (seen.has(svc)) {
        assert.fail(`service "${svc}" appears in both "${seen.get(domain)}" and "${domain}"`);
      }
      seen.set(svc, domain);
    }
  }
});

test('[prod] every compose joins the external aishanet network', () => {
  for (const domain of Object.keys(DOMAINS)) {
    const yaml = fs.readFileSync(composePath(domain, 'prod'), 'utf8');
    assert.ok(
      hasExternalNetwork(yaml, PROD_NETWORK),
      `prod "${domain}" missing external ${PROD_NETWORK}`,
    );
  }
});

test('[prod] no domain declares n8n, openreplay, or caddy (out of scope)', () => {
  for (const domain of Object.keys(DOMAINS)) {
    const yaml = fs.readFileSync(composePath(domain, 'prod'), 'utf8');
    const services = extractServiceNames(yaml);
    for (const forbidden of ['n8n', 'n8n-proxy', 'openreplay', 'caddy', 'caddy-proxy']) {
      assert.ok(!services.includes(forbidden), `prod "${domain}" must not declare "${forbidden}"`);
    }
  }
});

// ── staging lane ─────────────────────────────────────────────────────────────

test("[staging] every domain's staging compose file exists", () => {
  for (const domain of Object.keys(DOMAINS)) {
    const p = composePath(domain, 'staging');
    assert.ok(fs.existsSync(p), `missing staging compose at ${p}`);
  }
});

test('[staging] each domain declares exactly its services', () => {
  for (const [domain, expected] of Object.entries(DOMAINS)) {
    const yaml = fs.readFileSync(composePath(domain, 'staging'), 'utf8');
    const actual = extractServiceNames(yaml).sort();
    const want = [...expected.staging].sort();
    assert.deepEqual(
      actual,
      want,
      `staging "${domain}" has ${JSON.stringify(actual)}, want ${JSON.stringify(want)}`,
    );
  }
});

test('[staging] every compose joins the external aishanet-staging network', () => {
  for (const domain of Object.keys(DOMAINS)) {
    const yaml = fs.readFileSync(composePath(domain, 'staging'), 'utf8');
    assert.ok(
      hasExternalNetwork(yaml, STAGING_NETWORK),
      `staging "${domain}" missing external ${STAGING_NETWORK}`,
    );
  }
});

test('[staging] every container_name uses the staging prefix', () => {
  const allowedPrefixes = ['aishacrm-staging-', 'braid-mcp-staging-'];
  for (const domain of Object.keys(DOMAINS)) {
    const yaml = fs.readFileSync(composePath(domain, 'staging'), 'utf8');
    const names = extractContainerNames(yaml);
    assert.ok(names.length > 0, `staging "${domain}" has no container_name set`);
    for (const name of names) {
      const ok = allowedPrefixes.some((p) => name.startsWith(p));
      assert.ok(
        ok,
        `staging "${domain}" container_name "${name}" must start with one of ${JSON.stringify(
          allowedPrefixes,
        )}`,
      );
    }
  }
});

test('[staging] no prod host port is bound by any staging service', () => {
  for (const domain of Object.keys(DOMAINS)) {
    const yaml = fs.readFileSync(composePath(domain, 'staging'), 'utf8');
    const hostPorts = extractPublishedHostPorts(yaml);
    for (const port of hostPorts) {
      assert.ok(
        !PROD_HOST_PORTS.includes(port),
        `staging "${domain}" binds prod host port ${port} — would collide with production`,
      );
    }
  }
});

test('[staging] no domain declares n8n, openreplay, or caddy', () => {
  for (const domain of Object.keys(DOMAINS)) {
    const yaml = fs.readFileSync(composePath(domain, 'staging'), 'utf8');
    const services = extractServiceNames(yaml);
    for (const forbidden of ['n8n', 'n8n-proxy', 'openreplay', 'caddy', 'caddy-proxy']) {
      assert.ok(
        !services.includes(forbidden),
        `staging "${domain}" must not declare "${forbidden}"`,
      );
    }
  }
});

test('[staging] staging compose does NOT reference the prod network', () => {
  for (const domain of Object.keys(DOMAINS)) {
    const yaml = fs.readFileSync(composePath(domain, 'staging'), 'utf8');
    // Fail if staging compose attaches any service to the prod `aishanet`
    // network. Allow the word to appear in comments — match only YAML usage:
    // either `- aishanet` (network list membership) or `  aishanet:` (network
    // definition at 2-space indent).
    const listMatch = /^\s*-\s*aishanet\s*$/m.test(yaml);
    const defMatch = /^ {2}aishanet:\s*$/m.test(yaml);
    assert.ok(
      !listMatch && !defMatch,
      `staging "${domain}" references the prod network "aishanet" — must use "aishanet-staging"`,
    );
  }
});

// ── cross-lane: prod and staging must not clash on container_name ────────────

test('[cross] prod and staging container_names are disjoint', () => {
  const prodNames = new Set();
  const stagingNames = new Set();
  for (const domain of Object.keys(DOMAINS)) {
    for (const lane of ['prod', 'staging']) {
      const yaml = fs.readFileSync(composePath(domain, lane), 'utf8');
      const target = lane === 'prod' ? prodNames : stagingNames;
      for (const name of extractContainerNames(yaml)) target.add(name);
    }
  }
  for (const name of prodNames) {
    assert.ok(
      !stagingNames.has(name),
      `container_name "${name}" appears in both prod and staging — will collide on the VPS`,
    );
  }
});

// ── support-infra is README-only ─────────────────────────────────────────────

test('support-infra is README-only (no compose)', () => {
  const p = path.join(repoRoot, 'deploy', 'coolify', 'support-infra', 'docker-compose.yml');
  assert.ok(
    !fs.existsSync(p),
    `"support-infra" must remain README-only; unexpected compose at ${p}`,
  );
  const readme = path.join(repoRoot, 'deploy', 'coolify', 'support-infra', 'README.md');
  assert.ok(fs.existsSync(readme), `"support-infra" README.md required`);
});

// ── docs ─────────────────────────────────────────────────────────────────────

test('deployment docs exist', () => {
  for (const rel of [
    'docs/deployment/coolify-migration.md',
    'docs/deployment/env-matrix.md',
    'deploy/coolify/STAGING.md',
  ]) {
    const p = path.join(repoRoot, rel);
    assert.ok(fs.existsSync(p), `missing: ${rel}`);
  }
});
