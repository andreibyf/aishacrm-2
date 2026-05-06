// staging-ghcr-images.test.js
//
// Regression test: every staging service must reference a GHCR image and
// must NOT have a local `build:` block. This enforces the migration from
// "Coolify builds on VPS-1" to "CI builds on GitHub, Coolify pulls".
//
// Origin: VPS-1 lockup investigation (2026-05-05) — Coolify's build phase
// runs outside aishacrm.slice and was tripping Zap's 5.5-core sustained
// hypervisor cap during deploys, causing CPU steal → in-slice services
// missed healthchecks → kernel softlockup. Moving builds to CI eliminates
// the build CPU on VPS-1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..');

const STAGING_COMPOSES = [
  'staging/01-backend-heavy/docker-compose.yml',
  'staging/02-app-fast/docker-compose.yml',
  'staging/04-braid/docker-compose.yml',
  'staging/services/litellm/docker-compose.yml',
];

const GHCR_IMAGE_RE = /image:\s*ghcr\.io\/andreibyf\/aishacrm-2-(backend|frontend|mcp|litellm):staging-latest/;
const LOCAL_BUILD_RE = /^\s+build:\s*$/m;

test('every staging compose uses a GHCR image (not a local build)', () => {
  for (const rel of STAGING_COMPOSES) {
    const abs = path.join(REPO, rel);
    assert.ok(fs.existsSync(abs), `${rel}: file not found`);
    const yaml = fs.readFileSync(abs, 'utf8');

    assert.match(
      yaml,
      GHCR_IMAGE_RE,
      `${rel}: must reference a ghcr.io/andreibyf/aishacrm-2-*:staging-latest image`,
    );

    assert.doesNotMatch(
      yaml,
      LOCAL_BUILD_RE,
      `${rel}: must NOT contain a local 'build:' block — staging builds run in CI now`,
    );
  }
});

test('staging build workflow is present and triggers on push to main', () => {
  const wf = path.join(REPO, '.github', 'workflows', 'build-staging.yml');
  assert.ok(fs.existsSync(wf), 'build-staging.yml workflow missing');
  const content = fs.readFileSync(wf, 'utf8');

  assert.match(content, /branches:\s*\n\s+-\s+main/, 'workflow must trigger on push to main');
  assert.match(content, /staging-latest/, 'workflow must publish :staging-latest tag');
  assert.match(content, /staging-\$\{\{\s*github\.sha\s*\}\}/, 'workflow must publish per-SHA tag');

  // Sanity: it should build all four services.
  for (const svc of ['frontend', 'backend', 'mcp', 'litellm']) {
    const re = new RegExp(`service:\\s*${svc}\\b`);
    assert.match(content, re, `workflow must include matrix entry for ${svc}`);
  }
});

test('staging build workflow has a deploy job that calls Coolify after build', () => {
  const wf = path.join(REPO, '.github', 'workflows', 'build-staging.yml');
  const content = fs.readFileSync(wf, 'utf8');

  assert.match(content, /^\s+deploy:/m, 'workflow must define a deploy job');
  assert.match(
    content,
    /needs:\s*\[changes,\s*build\]/,
    'deploy job must run after build (and have access to changes outputs)',
  );
  assert.match(
    content,
    /secrets\.COOLIFY_DEPLOY_TOKEN/,
    'deploy job must use the COOLIFY_DEPLOY_TOKEN secret',
  );
  assert.match(
    content,
    /\/api\/v1\/deploy\?uuid=/,
    'deploy job must call POST /api/v1/deploy?uuid=...',
  );
  // Backend rebuild must redeploy BOTH staging-backend-heavy AND staging-app-fast
  // (because aisha-comms in app-fast uses the backend image).
  assert.match(
    content,
    /UUID_BACKEND/,
    'deploy job must reference the backend app UUID',
  );
  assert.match(
    content,
    /UUID_APP_FAST/,
    'deploy job must reference the app-fast UUID',
  );
});

test('staging composes still bind services to aishacrm.slice', () => {
  // Don't regress the cap-coverage invariant from staging-host-cap-coverage.test.js
  for (const rel of STAGING_COMPOSES) {
    const yaml = fs.readFileSync(path.join(REPO, rel), 'utf8');
    assert.match(
      yaml,
      /cgroup_parent:\s*aishacrm\.slice/,
      `${rel}: must keep cgroup_parent: aishacrm.slice on at least one service`,
    );
  }
});
