import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Static-analysis tests for prod/01-litellm/docker-compose.yml.
//
// First service in Phase 2 (GHCR -> Coolify-native build). This compose
// runs ALONGSIDE the existing GHCR-deployed litellm during the ≥48h soak,
// so the contract here pins the side-by-side coexistence rules:
//
//   - Container name must NOT collide with the GHCR sibling
//     (`aishacrm-litellm`) — uses `-coolify` suffix.
//   - Service network must be the existing external `aishanet` (not a new
//     bridge) so backend reaches both via Docker DNS without bridging.
//   - mem_limit must be set so the side-by-side pair fits under the host
//     budget (8 GB Hetzner with all prod containers also running).
//   - `build:` directive must point at `litellm/Dockerfile` (relative to
//     repo root) so Coolify builds from the OneDev clone, not GHCR.
//   - No `image: ghcr.io/...` — defeats the point of Phase 2.

const here = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(here, '..', '..', '..', 'prod', '01-litellm', 'docker-compose.yml');
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

const litellmBlock = getServiceBlock(compose, 'litellm');

test('prod-litellm: file is loadable + has litellm service block', () => {
  assert.ok(litellmBlock.length > 200, 'litellm service block missing or truncated');
});

test('prod-litellm: container_name is suffixed with -coolify (no collision with GHCR sibling)', () => {
  const line = litellmBlock.split('\n').find((l) => /^\s+container_name:/.test(l));
  assert.ok(line, 'container_name directive missing');
  assert.match(
    line,
    /container_name:\s*aishacrm-litellm-coolify\b/,
    'container_name must be `aishacrm-litellm-coolify` so it can run alongside the existing GHCR-built `aishacrm-litellm` during the soak window',
  );
});

test('prod-litellm: build directive uses context: . (NOT ../..) and points at litellm/Dockerfile', () => {
  // Coolify v4 invokes compose with `--project-directory /artifacts/<uuid>/`
  // and resolves relative paths against that. Using `..` segments resolves
  // outside the artifacts tree (lstat /litellm: no such file or directory).
  // `context: .` resolves to the repo root via Coolify's project-directory,
  // and dockerfile: litellm/Dockerfile points at the actual Dockerfile.
  assert.match(
    litellmBlock,
    /\s+build:\s*\n(?:[^\n]*\n)*?\s+context:\s*\.\s*\n(?:[^\n]*\n)*?\s+dockerfile:\s*litellm\/Dockerfile/m,
    'build context must be `.` and dockerfile `litellm/Dockerfile` — Coolify resolves both against the project root via --project-directory',
  );
  assert.doesNotMatch(
    litellmBlock,
    /context:\s*\.\.\//,
    'context must NOT use `..` segments — Coolify v4 resolves them outside the artifacts tree',
  );
});

test('prod-litellm: image is locally-built (no ghcr.io reference)', () => {
  assert.doesNotMatch(
    litellmBlock,
    /image:\s*ghcr\.io/,
    'Found `image: ghcr.io/...` in litellm service — the whole point of Phase 2 is to remove the GHCR dependency. Image tag should be `aishacrm-litellm:coolify` (or similar local cache key) alongside the `build:` directive.',
  );
  assert.match(
    litellmBlock,
    /image:\s*aishacrm-litellm:coolify/,
    'image tag should be `aishacrm-litellm:coolify` — Compose treats this as a local cache key when `build:` is present',
  );
});

test('prod-litellm: mem_limit is set (within 256m..512m for soak coexistence)', () => {
  const line = litellmBlock.split('\n').find((l) => /^\s+mem_limit:/.test(l));
  assert.ok(line, 'mem_limit must be declared — the GHCR sibling is also running during soak; both must fit under host budget');
  const value = line.replace(/^\s+mem_limit:\s*/, '').trim();
  const mb = (() => {
    const m = value.match(/^(\d+)([gmk])$/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    const u = m[2].toLowerCase();
    return u === 'g' ? n * 1024 : u === 'm' ? n : n / 1024;
  })();
  assert.ok(mb && mb >= 256 && mb <= 768, `mem_limit=${value} (${mb}MB) must be between 256MB and 768MB`);
});

test('prod-litellm: service joins external aishanet, not a new bridge', () => {
  assert.match(
    litellmBlock,
    /networks:\s*\n\s+- aishanet/,
    'litellm service must join the `aishanet` network so backend (also on aishanet) reaches it via Docker DNS',
  );
});

test('prod-litellm: top-level networks declares aishanet as external', () => {
  // Tolerate comment lines between `networks:` and the network entry.
  const match = compose.match(/^networks:\s*\n([\s\S]+?)(?:^volumes:|^services:|$(?![\r\n]))/m);
  assert.ok(match, 'top-level `networks:` section not found');
  const section = match[1];
  assert.match(section, /^\s+aishanet:\s*$/m, 'aishanet network entry missing');
  assert.match(
    section,
    /^\s+external:\s*true\s*$/m,
    'aishanet must be declared `external: true` — it is owned by docker-compose.prod.yml; if Coolify recreates it, the GHCR-deployed prod stack loses DNS',
  );
});

test('prod-litellm: cgroup_parent matches prod stack (aishacrm.slice)', () => {
  assert.match(
    litellmBlock,
    /cgroup_parent:\s*aishacrm\.slice/,
    'cgroup_parent must be aishacrm.slice — the host slice already imposes aggregate CPU/memory limits across the prod containers',
  );
});

test('prod-litellm: Doppler env injection is wired up', () => {
  for (const key of ['DOPPLER_TOKEN', 'DOPPLER_PROJECT', 'DOPPLER_CONFIG']) {
    assert.match(
      litellmBlock,
      new RegExp(`-\\s+${key}=`),
      `${key} must be in the env block — Doppler injects LITELLM_MASTER_KEY + provider keys at runtime`,
    );
  }
});
