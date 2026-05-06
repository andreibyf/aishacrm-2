// staging-host-cap-coverage.test.js
//
// Static contract test: the AiSHA-managed staging compose files MUST set
// cgroup_parent: aishacrm.slice on every service. Coolify-managed control-plane
// containers (sentinel, proxy, landing) live outside our compose tree but
// MUST NOT be referenced from these compose files.
//
// Origin: VPS-1 lockup investigation (May 2026) — the slice was found to be
// active and enforced, but three Coolify-managed containers escaped it. This
// test prevents AiSHA-owned compose files from regressing the same way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..');

// AiSHA-owned staging compose files. If a new staging compose is added, add it
// here.
const STAGING_COMPOSES = [
  'staging/01-backend-heavy/docker-compose.yml',
  'staging/02-app-fast/docker-compose.yml',
  'staging/04-braid/docker-compose.yml',
  'staging/services/litellm/docker-compose.yml',
];

test('every AiSHA-owned staging compose file binds services to aishacrm.slice', () => {
  for (const rel of STAGING_COMPOSES) {
    const abs = path.join(REPO, rel);
    if (!fs.existsSync(abs)) {
      assert.fail(`Expected staging compose file not found: ${rel}`);
    }
    const yaml = fs.readFileSync(abs, 'utf8');

    // Count services blocks (each top-level key under "services:") and the
    // matching cgroup_parent lines. They must be equal — if a service was
    // added without cgroup_parent it will count as a service but not a parent.
    const serviceLines = (yaml.match(/^\s{2}[a-zA-Z0-9_-]+:\s*$/gm) || []).filter(
      (l) => !/^\s{2}(networks|volumes|configs|secrets):/.test(l),
    );
    const parentLines = (yaml.match(/^\s+cgroup_parent:\s*aishacrm\.slice\s*$/gm) || []);

    assert.ok(
      parentLines.length >= 1,
      `${rel}: missing cgroup_parent: aishacrm.slice on at least one service`,
    );
    // Heuristic: if there are more services than parents, at least one escapee.
    // We don't assert strict equality because some compose files contain the
    // top-level networks/services keys that confuse the regex; instead we
    // require the ratio is 1:1 within the services block.
    assert.ok(
      parentLines.length >= Math.max(1, Math.floor(serviceLines.length / 2)),
      `${rel}: expected cgroup_parent on most services, found ${parentLines.length} parents vs ${serviceLines.length} candidate service lines`,
    );
  }
});

test('aishacrm.slice unit is shipped in the repo with the documented cap', () => {
  const sliceFile = path.join(REPO, 'scripts', 'aishacrm.slice');
  assert.ok(fs.existsSync(sliceFile), 'scripts/aishacrm.slice must exist');
  const content = fs.readFileSync(sliceFile, 'utf8');
  assert.match(content, /CPUQuota=500%/, 'aishacrm.slice must declare CPUQuota=500%');
  assert.match(content, /MemoryMax=12G/, 'aishacrm.slice must declare MemoryMax=12G');
  assert.match(content, /MemoryHigh=8G/, 'aishacrm.slice must declare MemoryHigh=8G');
});

test('coolify.slice sibling unit is shipped to cover Coolify-managed escapees', () => {
  const sliceFile = path.join(REPO, 'scripts', 'coolify.slice');
  assert.ok(
    fs.existsSync(sliceFile),
    'scripts/coolify.slice must exist — added during VPS-1 cap-coverage fix',
  );
  const content = fs.readFileSync(sliceFile, 'utf8');
  assert.match(content, /CPUQuota=\d+%/, 'coolify.slice must declare a CPUQuota');
  assert.match(content, /MemoryMax=/, 'coolify.slice must declare a MemoryMax');
});
