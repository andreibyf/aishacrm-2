import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Static-analysis regression tests for docker-compose.vps2.yml.
//
// Three concrete bugs caused a 2026-04 outage where scheduler.aishacrm.com login
// redirected to http://localhost:3000 (which on the user's local box was hitting
// OpenWebUI). Each test below pins one of the fixes so a revert lands in CI
// instead of in production:
//
// 1. `BUILT_NEXT_PUBLIC_WEBAPP_URL` must be present in the calcom env block.
//    The calcom/cal.com:latest image bakes http://localhost:3000 into the static
//    Next.js bundle. The `replace-placeholder.sh` script in `command:` swaps it
//    for the runtime URL, but only if it knows what FROM string to look for. If
//    BUILT_NEXT_PUBLIC_WEBAPP_URL is absent, sh expands $BUILT_NEXT_PUBLIC_WEBAPP_URL
//    to "" and the script becomes a no-op — leaving 767 instances of localhost:3000
//    in the served bundle.
//
// 2. The `command:` line must escape `$BUILT_NEXT_PUBLIC_WEBAPP_URL` and
//    `$NEXT_PUBLIC_WEBAPP_URL` as `$$BUILT_...` and `$$NEXT_...`. Compose
//    interpolation runs at render time against HOST env / project .env, where
//    these vars are NOT defined — bare `$VAR` silently expands to "" before the
//    container ever starts. Double-dollar is Compose's literal-$ escape, so the
//    container's sh -c sees `$VAR` and expands against CONTAINER env (where the
//    vars are defined via the env: block).
//
// 3. `ALLOWED_HOSTNAMES` must contain literal double-quote chars. Cal.com parses
//    it as `JSON.parse('[' + value + ']')`. Without the inner quotes, e.g.
//    `ALLOWED_HOSTNAMES=scheduler.aishacrm.com`, the parser sees
//    `[scheduler.aishacrm.com]` (unquoted token) and throws — Cal.com returns
//    500 for every hostname-validated route. Compose's `${VAR:-default}` strips
//    the inner quotes from `default` expressions, so this value MUST be hardcoded
//    inline with YAML single-quote wrap to preserve the inner doubles.

const here = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(here, '..', '..', '..', 'docker-compose.vps2.yml');
const compose = readFileSync(composePath, 'utf8');

function getCalcomBlock(text) {
  // Extract the calcom service block — from `  calcom:` to the next top-level
  // service definition or a deploy/volumes top-level key. Good enough for static
  // string searches; we don't need a full YAML parser.
  const startMatch = text.match(/^ {2}calcom:$/m);
  if (!startMatch) return '';
  const start = startMatch.index;
  const after = text.slice(start + startMatch[0].length);
  const endMatch = after.match(/^ {2}[a-z][\w-]*:$|^volumes:$|^networks:$/m);
  const end = endMatch ? endMatch.index : after.length;
  return after.slice(0, end);
}

const calcomBlock = getCalcomBlock(compose);

test('docker-compose.vps2.yml: calcom service block is parseable', () => {
  assert.ok(
    calcomBlock.length > 200,
    'Could not isolate calcom service block — file structure may have changed',
  );
});

test('docker-compose.vps2.yml: BUILT_NEXT_PUBLIC_WEBAPP_URL is set in calcom env', () => {
  // Must appear as an env entry, NOT only mentioned in a comment.
  const envLine = calcomBlock
    .split('\n')
    .find((line) => /^\s+- BUILT_NEXT_PUBLIC_WEBAPP_URL=/.test(line));
  assert.ok(
    envLine,
    'BUILT_NEXT_PUBLIC_WEBAPP_URL must be set in calcom service env block — without it, replace-placeholder.sh runs as a no-op and the bundle keeps localhost:3000',
  );
  assert.match(
    envLine,
    /=http:\/\/localhost:3000\s*$/,
    'BUILT_NEXT_PUBLIC_WEBAPP_URL must equal http://localhost:3000 — that is the value baked into the calcom/cal.com:latest image',
  );
});

test('docker-compose.vps2.yml: command escapes $$ for runtime expansion', () => {
  const commandLine = calcomBlock
    .split('\n')
    .find((line) => line.includes('replace-placeholder.sh'));
  assert.ok(commandLine, 'replace-placeholder.sh command line must exist');
  assert.match(
    commandLine,
    /\$\$BUILT_NEXT_PUBLIC_WEBAPP_URL\s+\$\$NEXT_PUBLIC_WEBAPP_URL/,
    'Both vars must be `$$VAR` (double-dollar) — single-dollar is interpolated by Compose at render time and silently expands to empty strings',
  );
  // Use a negative lookbehind so we don't false-match the second `$` of `$$BUILT_...`.
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

test('docker-compose.vps2.yml: ALLOWED_HOSTNAMES preserves inner double-quotes', () => {
  const allowedLine = calcomBlock
    .split('\n')
    .find((line) => line.includes('ALLOWED_HOSTNAMES='));
  assert.ok(allowedLine, 'ALLOWED_HOSTNAMES must be set in calcom env block');

  // Two valid forms (both preserve inner double-quotes):
  //   - 'ALLOWED_HOSTNAMES="scheduler.aishacrm.com"'   (single-quoted YAML scalar)
  //   - "ALLOWED_HOSTNAMES=\"scheduler.aishacrm.com\"" (escaped doubles in YAML)
  // We accept either by searching for the literal pattern `="..."` after the env-key prefix.
  assert.match(
    allowedLine,
    /ALLOWED_HOSTNAMES=["\\]?"[^"]+"["\\]?/,
    'ALLOWED_HOSTNAMES must contain literal double-quote chars around the hostname — Cal.com does JSON.parse("[" + value + "]") and bare hostnames fail to parse',
  );
  // Reject the broken form `${...:-["..."]}` — the `[]` brackets create nested arrays after Cal.com wraps with `[...]`.
  assert.doesNotMatch(
    allowedLine,
    /ALLOWED_HOSTNAMES=\$\{[^}]+\[/,
    'ALLOWED_HOSTNAMES must NOT use `${...:-[...]}` default — Compose strips inner quotes and the bracket form makes Cal.com produce `[["..."]]` (nested array)',
  );
});

test('docker-compose.vps2.yml: NEXT_PUBLIC_WEBAPP_URL points at scheduler.aishacrm.com', () => {
  const line = calcomBlock
    .split('\n')
    .find((l) => /^\s+- NEXT_PUBLIC_WEBAPP_URL=/.test(l));
  assert.ok(line, 'NEXT_PUBLIC_WEBAPP_URL must be set in calcom env block');
  assert.match(
    line,
    /scheduler\.aishacrm\.com/,
    'NEXT_PUBLIC_WEBAPP_URL must reference scheduler.aishacrm.com (default or hardcoded)',
  );
});
