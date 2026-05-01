import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Static-analysis regression tests for staging/services/calcom/docker-compose.yml.
//
// Mirrors backend/__tests__/routes/calcom-vps2-deploy-config.test.js (which guards
// the prod calcom compose) but pins the *staging-specific* contract:
//
//   - Container names end in `-staging` and do NOT collide with prod calcom names
//     on the same VPS-2 host.
//   - calcom-db host port is 5433 (NOT 5432 — prod calcom-db owns 5432).
//   - Network is an isolated bridge `aishanet-staging-calcom` — staging calcom
//     must NOT join prod's `aishacrm_aishanet`.
//   - Volume name is `staging_calcom_db_data` — distinct from prod's `calcom_db_data`
//     so a `docker volume rm calcom_db_data` doesn't nuke staging too.
//   - Inherits the same three bake-time bug-fixes from prod:
//     * BUILT_NEXT_PUBLIC_WEBAPP_URL must be set
//     * command must use `$$VAR` double-dollar escape
//     * ALLOWED_HOSTNAMES must preserve inner double-quotes
//     (See calcom-vps2-deploy-config.test.js for the underlying bug history.)

const here = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(
  here,
  '..',
  '..',
  '..',
  'staging',
  'services',
  'calcom',
  'docker-compose.yml',
);
const compose = readFileSync(composePath, 'utf8');

function getServiceBlock(text, serviceName) {
  // Extract a service block — from `  <name>:` to the next top-level
  // service definition or a `volumes:` / `networks:` top-level key. Good
  // enough for static string searches; we don't need a full YAML parser.
  const startRe = new RegExp(`^ {2}${serviceName}:$`, 'm');
  const startMatch = text.match(startRe);
  if (!startMatch) return '';
  const start = startMatch.index;
  const after = text.slice(start + startMatch[0].length);
  const endMatch = after.match(/^ {2}[a-z][\w-]*:$|^volumes:$|^networks:$/m);
  const end = endMatch ? endMatch.index : after.length;
  return after.slice(0, end);
}

const calcomBlock = getServiceBlock(compose, 'calcom');
const calcomDbBlock = getServiceBlock(compose, 'calcom-db');

test('staging compose: file is loadable and has both service blocks', () => {
  assert.ok(calcomBlock.length > 200, 'calcom service block missing or truncated');
  assert.ok(calcomDbBlock.length > 100, 'calcom-db service block missing or truncated');
});

test('staging compose: calcom container_name ends in -staging', () => {
  const line = calcomBlock.split('\n').find((l) => /^\s+container_name:/.test(l));
  assert.ok(line, 'container_name directive missing on calcom');
  assert.match(
    line,
    /container_name:\s*aishacrm-calcom-staging\b/,
    'calcom container_name must be `aishacrm-calcom-staging` to avoid collision with prod `aishacrm-calcom` on the same VPS-2 host',
  );
});

test('staging compose: calcom-db container_name ends in -staging', () => {
  const line = calcomDbBlock.split('\n').find((l) => /^\s+container_name:/.test(l));
  assert.ok(line, 'container_name directive missing on calcom-db');
  assert.match(
    line,
    /container_name:\s*aishacrm-calcom-db-staging\b/,
    'calcom-db container_name must be `aishacrm-calcom-db-staging` to avoid collision with prod `aishacrm-calcom-db`',
  );
});

test('staging compose: calcom host port is 3004 (cross-VPS hop from Staging cloudflared)', () => {
  // Staging's cloudflared (aishacrm-tunnel) on VPS-1 reaches VPS-2's calcom
  // over the public WAN at http://147.189.168.164:3004. Port 3004 chosen to
  // avoid prod calcom's host port 3002 and the VPS-1 staging stack's host
  // ports (5xxx range). UFW on VPS-2 restricts to Staging's IP.
  const portsBlock = calcomBlock.match(/^\s+ports:\n((?:\s+- .+\n)+)/m);
  assert.ok(portsBlock, 'calcom must declare a host ports block for the cross-VPS HTTP hop');
  assert.match(
    portsBlock[1],
    /"?3004:3000"?/,
    'calcom must publish 3004:3000 — Staging cloudflared routes staging-scheduler.aishacrm.com → http://147.189.168.164:3004',
  );
});

test('staging compose: calcom-db host port is 5433 (not 5432 — prod owns 5432)', () => {
  const portsBlock = calcomDbBlock.match(/^\s+ports:\n((?:\s+- .+\n)+)/m);
  assert.ok(portsBlock, 'calcom-db must declare a host ports block');
  assert.match(
    portsBlock[1],
    /"?5433:5432"?/,
    'staging calcom-db must publish 5433:5432 — prod calcom-db on the same host owns 5432, and the Staging server backend reaches this DB at 147.189.168.164:5433',
  );
  assert.doesNotMatch(
    portsBlock[1],
    /"?5432:5432"?/,
    'Found `5432:5432` host port — that conflicts with prod calcom-db on VPS-2',
  );
});

test('staging compose: BUILT_NEXT_PUBLIC_WEBAPP_URL is set in calcom env', () => {
  const envLine = calcomBlock
    .split('\n')
    .find((line) => /^\s+- BUILT_NEXT_PUBLIC_WEBAPP_URL=/.test(line));
  assert.ok(
    envLine,
    'BUILT_NEXT_PUBLIC_WEBAPP_URL must be set — without it, replace-placeholder.sh runs as a no-op and the bundle keeps localhost:3000',
  );
  assert.match(
    envLine,
    /=http:\/\/localhost:3000\s*$/,
    'BUILT_NEXT_PUBLIC_WEBAPP_URL must equal http://localhost:3000 — value baked into calcom/cal.com:latest at image build time',
  );
});

test('staging compose: command escapes $$ for runtime expansion', () => {
  // Skip comment lines (some mention replace-placeholder.sh in the rationale).
  const commandLine = calcomBlock
    .split('\n')
    .find((line) => line.includes('replace-placeholder.sh') && /^\s*command:/.test(line));
  assert.ok(
    commandLine,
    'replace-placeholder.sh command line must exist on a `command:` directive (not just in comments)',
  );
  assert.match(
    commandLine,
    /\$\$BUILT_NEXT_PUBLIC_WEBAPP_URL\s+\$\$NEXT_PUBLIC_WEBAPP_URL/,
    'Both vars must be `$$VAR` (double-dollar) — single-dollar is interpolated by Compose at render time and silently expands to empty strings',
  );
  assert.doesNotMatch(
    commandLine,
    /(?<!\$)\$BUILT_NEXT_PUBLIC_WEBAPP_URL/,
    'Found bare `$BUILT_NEXT_PUBLIC_WEBAPP_URL` — must be `$$BUILT_...`',
  );
  assert.doesNotMatch(
    commandLine,
    /(?<!\$)\$NEXT_PUBLIC_WEBAPP_URL/,
    'Found bare `$NEXT_PUBLIC_WEBAPP_URL` — must be `$$NEXT_PUBLIC_WEBAPP_URL`',
  );
});

test('staging compose: ALLOWED_HOSTNAMES preserves inner double-quotes', () => {
  const allowedLine = calcomBlock.split('\n').find((line) => line.includes('ALLOWED_HOSTNAMES='));
  assert.ok(allowedLine, 'ALLOWED_HOSTNAMES must be set in calcom env block');
  assert.match(
    allowedLine,
    /ALLOWED_HOSTNAMES=["\\]?"[^"]+"["\\]?/,
    'ALLOWED_HOSTNAMES must contain literal double-quote chars — Cal.com does JSON.parse("[" + value + "]")',
  );
  assert.match(
    allowedLine,
    /staging-scheduler\.aishacrm\.com/,
    'ALLOWED_HOSTNAMES must reference staging-scheduler.aishacrm.com — not the prod host',
  );
});

test('staging compose: CALCOM_PUBLIC_URL / NEXT_PUBLIC_WEBAPP_URL point at staging host', () => {
  const cpu = calcomBlock.split('\n').find((l) => /^\s+- CALCOM_PUBLIC_URL=/.test(l));
  const npu = calcomBlock.split('\n').find((l) => /^\s+- NEXT_PUBLIC_WEBAPP_URL=/.test(l));
  assert.ok(cpu, 'CALCOM_PUBLIC_URL must be set');
  assert.ok(npu, 'NEXT_PUBLIC_WEBAPP_URL must be set');
  assert.match(
    cpu,
    /staging-scheduler\.aishacrm\.com/,
    'CALCOM_PUBLIC_URL must reference staging-scheduler.aishacrm.com — not prod scheduler',
  );
  assert.match(
    npu,
    /staging-scheduler\.aishacrm\.com/,
    'NEXT_PUBLIC_WEBAPP_URL must reference staging-scheduler.aishacrm.com — not prod scheduler',
  );
});

test('staging compose: services join the isolated network, not prod aishanet', () => {
  // Both services should declare the staging network only.
  for (const [name, block] of [
    ['calcom', calcomBlock],
    ['calcom-db', calcomDbBlock],
  ]) {
    assert.match(
      block,
      /networks:\s*\n\s*- aishanet-staging-calcom/,
      `${name} must join the aishanet-staging-calcom network`,
    );
    assert.doesNotMatch(
      block,
      /^\s+- aishacrm_aishanet$/m,
      `${name} must NOT join aishacrm_aishanet (that's prod's network — staging must stay isolated)`,
    );
  }
});

test('staging compose: top-level network declaration exists and has explicit name', () => {
  // Find the top-level `networks:` section (YAML left-margin) and check the
  // network entry inside it. Tolerant of comments between the section header
  // and the network entry.
  const networksSectionMatch = compose.match(
    /^networks:\s*\n([\s\S]+?)(?:^volumes:|^services:|$(?![\r\n]))/m,
  );
  assert.ok(networksSectionMatch, 'Top-level `networks:` section not found');
  const section = networksSectionMatch[1];
  assert.match(
    section,
    /^\s+aishanet-staging-calcom:\s*$/m,
    'Top-level networks: must declare `aishanet-staging-calcom`',
  );
  assert.match(
    section,
    /^\s+name:\s*aishanet-staging-calcom\s*$/m,
    'aishanet-staging-calcom must have an explicit `name:` to ensure consistent network identity across compose project renames',
  );
});

test('staging compose: volume name is staging-prefixed', () => {
  // Volume must be `staging_calcom_db_data` so it doesn't collide with prod's
  // `calcom_db_data` on the same Docker host.
  assert.match(
    compose,
    /^volumes:\s*\n\s+staging_calcom_db_data:/m,
    'Top-level volumes: must declare `staging_calcom_db_data` — distinct from prod calcom_db_data on the same host',
  );
  assert.doesNotMatch(
    compose,
    /^\s+calcom_db_data:/m,
    'Found prod-style volume `calcom_db_data` in staging compose — would collide with prod calcom-db volume on VPS-2',
  );
});

test('staging compose: image is calcom/cal.com:latest (matches prod)', () => {
  const imgLine = calcomBlock.split('\n').find((l) => /^\s+image:\s*calcom\/cal\.com/.test(l));
  assert.ok(imgLine, 'calcom service must specify a calcom/cal.com image');
  assert.match(
    imgLine,
    /calcom\/cal\.com:latest$/,
    'staging calcom should track prod (calcom/cal.com:latest) so we surface upstream regressions in staging first',
  );
});

test('staging compose: calcom has memory cap (mem_limit or deploy.resources.limits.memory)', () => {
  // VPS-2 hosts multiple services; calcom must not balloon. Accept either
  // `mem_limit:` (compose v2 short-form) or a `memory:` line under
  // `deploy.resources.limits`. Tolerant of comment lines mixed in.
  const hasMemLimit = /^\s+mem_limit:\s*\d/m.test(calcomBlock);
  const hasResourcesMemory =
    /\s+resources:\s*\n[\s\S]*?\s+limits:\s*\n[\s\S]*?\s+memory:\s*\S/m.test(calcomBlock);
  assert.ok(
    hasMemLimit || hasResourcesMemory,
    'calcom service must declare a memory cap (`mem_limit:` or `deploy.resources.limits.memory:`) — VPS-2 hosts other services and an unbounded calcom risks OOM',
  );
});
