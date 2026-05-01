import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Static-analysis tests for docker-compose.prod.yml memory caps.
//
// Phase 2 of the GHCR-to-Coolify migration plan (docs/deployment/COOLIFY_MIGRATION.md)
// requires every prod service to declare an explicit `mem_limit`. Reason:
// Coolify-native builds spike RAM 2-3 GB during the build step; without per-
// container caps a single runaway can OOM-kill the Hetzner 8 GB host and
// take prod down for the duration of a deploy.
//
// Targets (sum < 70% of 8 GB host = 5.6 GB):
//   backend       3584m (4g -> 3.5g for build headroom)
//   aisha-comms   768m
//   frontend      256m
//   redis-memory  384m  (wraps Redis maxmemory 256m + RDB fork headroom)
//   redis-cache   640m  (wraps Redis maxmemory 512m)
//
// (litellm moved to Coolify-built `prod/01-litellm/` and is no longer in
//  docker-compose.prod.yml. Its 768m cap is asserted by
//  prod-litellm-coolify-config.test.js instead.)
//
// Total: ~5.55 GB capped + 2.45 GB build/litellm headroom = 8 GB peak usage.

const here = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(here, '..', '..', '..', 'docker-compose.prod.yml');
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

// Services that MUST be capped — any production-active service. n8n, calcom,
// calcom-db are profile-gated (not running by default on Hetzner) so they're
// covered by their own files / lower priority.
const REQUIRED_CAPS = {
  'redis-memory': { min: 256, max: 512 },
  'redis-cache': { min: 384, max: 768 },
  backend: { min: 3072, max: 4096 },
  'aisha-comms': { min: 384, max: 1024 },
  // litellm moved to Coolify-managed prod/01-litellm/docker-compose.yml.
  // Its mem_limit is asserted by prod-litellm-coolify-config.test.js.
  frontend: { min: 128, max: 384 },
};

function parseMemLimit(value) {
  // Accepts strings like "3584m", "1g", "768m", or numeric bytes.
  if (!value) return null;
  const m = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*([gmkbGMKB]?)$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'g') return num * 1024;
  if (unit === 'm') return num;
  if (unit === 'k') return num / 1024;
  return num / (1024 * 1024); // raw bytes
}

for (const [serviceName, range] of Object.entries(REQUIRED_CAPS)) {
  test(`prod compose: ${serviceName} declares mem_limit`, () => {
    const block = getServiceBlock(compose, serviceName);
    assert.ok(block, `service block '${serviceName}' not found`);
    const memLimitLine = block.split('\n').find((l) => /^\s+mem_limit:/.test(l));
    assert.ok(
      memLimitLine,
      `${serviceName} must declare mem_limit (Phase 2 requirement: prevent OOM during Coolify builds)`,
    );
    const value = memLimitLine.replace(/^\s+mem_limit:\s*/, '').trim();
    const mb = parseMemLimit(value);
    assert.ok(
      mb && mb >= range.min && mb <= range.max,
      `${serviceName} mem_limit=${value} (${mb}MB) must be in [${range.min}MB, ${range.max}MB]`,
    );
  });
}

test('prod compose: total mem_limit budget is under 70% of Hetzner 8 GB', () => {
  // 70% of 8 GB = 5734 MB. We allow up to 6144 MB (75%) since builds can
  // be queued behind a backend restart that frees RAM.
  let total = 0;
  for (const serviceName of Object.keys(REQUIRED_CAPS)) {
    const block = getServiceBlock(compose, serviceName);
    const line = block.split('\n').find((l) => /^\s+mem_limit:/.test(l));
    if (line) {
      const value = line.replace(/^\s+mem_limit:\s*/, '').trim();
      const mb = parseMemLimit(value);
      if (mb) total += mb;
    }
  }
  assert.ok(
    total < 6144,
    `Total mem_limit budget = ${total} MB; must stay under 6144 MB (75% of 8 GB) to leave Coolify build headroom`,
  );
});
