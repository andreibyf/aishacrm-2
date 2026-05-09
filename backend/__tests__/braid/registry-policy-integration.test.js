/**
 * registry-policy-integration.test.js
 *
 * Integration test - pins the live TOOL_REGISTRY against the live .braid
 * source files. Fails CI if any tool's `policy` field disagrees with the
 * `@policy(...)` annotation in its source .braid file.
 *
 * Why this test exists (4VD-38, follow-up to 4VD-10):
 *   PR #565 fixed a registry generator bug that silently downgraded 10
 *   `@policy(WRITE_OPERATIONS)` tools to `READ_ONLY` in
 *   `backend/lib/braid/registry.js`. The downgrade defeated the runtime
 *   capability gate (role check, audit, rate limit) AND, because the
 *   runtime caches READ_ONLY results in Redis for 90s, also caused
 *   identical-args repeats of write operations like `initiate_call` and
 *   `send_document_for_signing` to silently no-op within the cache window.
 *
 *   The unit test in
 *     `braid-llm-kit/tools/__tests__/registry-policy-inference.test.js`
 *   pins inferPolicy()'s logic. This test pins the END STATE - that the
 *   registry actually checked into git matches the source-of-truth
 *   annotations. Drift between any of the three layers (.braid -> generator
 *   -> committed registry) breaks this test.
 *
 *   Three layers, three pinned by tests:
 *     1. .braid files declare @policy            (humans write this)
 *     2. generate-registry.js reads it           (unit test pins)
 *     3. registry.js committed copy matches      (THIS test pins)
 *
 * Run:
 *   cd backend && npm test -- registry-policy-integration
 *   OR
 *   node --test backend/__tests__/braid/registry-policy-integration.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOOL_REGISTRY } from '../../lib/braid/registry.js';
import { parseBraidFile } from '../../../braid-llm-kit/tools/generate-registry.js';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOLS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'braid-llm-kit',
  'examples',
  'assistant',
);

/**
 * Extract the @policy(...) annotation argument from a function's
 * annotations array. Returns null if no @policy annotation is present.
 */
function getDeclaredPolicy(fn) {
  if (!Array.isArray(fn.annotations)) return null;
  const ann = fn.annotations.find((a) => a && a.name === 'policy');
  if (!ann || !Array.isArray(ann.args) || ann.args.length === 0) return null;
  return String(ann.args[0]);
}

/**
 * Coerce a declared @policy into the registry's two-bucket schema.
 * The .braid layer can declare DELETE_OPERATIONS / ADMIN_ONLY / etc., but
 * registry.js stores only { READ_ONLY | WRITE_OPERATIONS }. Anything that
 * implies write capability collapses to WRITE_OPERATIONS.
 *
 * Mirrors the coercion logic in generate-registry.js's inferPolicy().
 */
function coerceToRegistryPolicy(declared) {
  if (!declared) return null;
  if (declared === 'READ_ONLY') return 'READ_ONLY';
  // Everything else with side effects collapses to the broader bucket
  if (
    [
      'WRITE_OPERATIONS',
      'DELETE_OPERATIONS',
      'ADMIN_ONLY',
      'AI_SUGGESTIONS',
      'EXTERNAL_API',
      'SYSTEM_INTERNAL',
    ].includes(declared)
  ) {
    return 'WRITE_OPERATIONS';
  }
  return null; // unknown declaration - fall through, test will surface it
}

/**
 * Walk all .braid files and build a map: snake_case_function_name -> declared policy.
 */
function buildBraidPolicyMap() {
  const files = fs.readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.braid'));
  const map = new Map();
  for (const file of files) {
    const fns = parseBraidFile(path.join(TOOLS_DIR, file));
    for (const fn of fns) {
      const declared = getDeclaredPolicy(fn);
      if (!declared) continue; // legacy file without @policy - skip
      map.set(fn.snakeName, {
        file,
        fnName: fn.name,
        declared,
        coerced: coerceToRegistryPolicy(declared),
      });
    }
  }
  return map;
}

describe('TOOL_REGISTRY policy <-> .braid @policy parity', () => {
  const braidMap = buildBraidPolicyMap();

  test('every TOOL_REGISTRY entry whose .braid declares @policy matches', () => {
    const mismatches = [];
    for (const [toolName, config] of Object.entries(TOOL_REGISTRY)) {
      const declared = braidMap.get(toolName);
      if (!declared) continue; // .braid file has no @policy annotation; skip
      if (config.policy !== declared.coerced) {
        mismatches.push({
          toolName,
          file: declared.file,
          fnName: declared.fnName,
          braidDeclared: declared.declared,
          braidCoerced: declared.coerced,
          registryStored: config.policy,
        });
      }
    }
    assert.deepEqual(
      mismatches,
      [],
      `Registry policy drift detected. Run \`npm run braid:sync\` to regenerate registry.js.\n` +
        `Mismatches:\n${JSON.stringify(mismatches, null, 2)}`,
    );
  });

  test('the 10 tools fixed by PR #565 are stored as WRITE_OPERATIONS', () => {
    // Regression pin - these are the exact tools that were silently
    // downgraded before the generate-registry.js fix landed.
    const writeOnly = [
      'process_inbound_communication',
      'analyze_document',
      'send_document_for_signing',
      'draft_email',
      'full_lifecycle_advance',
      'clear_report_cache',
      'initiate_call',
      'call_contact',
      'invite_user',
      'instantiate_workflow_template',
    ];
    const downgraded = writeOnly.filter(
      (name) => TOOL_REGISTRY[name] && TOOL_REGISTRY[name].policy !== 'WRITE_OPERATIONS',
    );
    assert.deepEqual(
      downgraded,
      [],
      `These tools were misclassified before PR #565 and must remain WRITE_OPERATIONS:\n` +
        downgraded.map((n) => `  - ${n}: ${TOOL_REGISTRY[n].policy}`).join('\n'),
    );
  });

  test('every .braid function with @policy has a corresponding TOOL_REGISTRY entry', () => {
    // Ensures we can't silently land a new .braid function with an
    // annotation but forget to register it. The reverse (registry entries
    // pointing at functions that no longer exist) is caught by the
    // sync-registry --check pre-existing pipeline.
    const missing = [];
    for (const [snakeName, info] of braidMap.entries()) {
      if (!TOOL_REGISTRY[snakeName]) {
        missing.push({ snakeName, file: info.file, fnName: info.fnName });
      }
    }
    assert.deepEqual(
      missing,
      [],
      `These .braid functions declare @policy but are missing from TOOL_REGISTRY:\n` +
        JSON.stringify(missing, null, 2) +
        `\nRun \`npm run braid:sync\` or remove the orphaned function.`,
    );
  });

  test('every TOOL_REGISTRY policy is one of READ_ONLY or WRITE_OPERATIONS', () => {
    // Defense-in-depth: registry.js only supports the two-bucket schema
    // (the runtime in execution.js uses CRM_POLICIES[config.policy] which
    // tolerates more, but we keep the registry constrained to the buckets
    // that map cleanly to the runtime gate's role/cache/audit semantics).
    const invalid = [];
    for (const [toolName, config] of Object.entries(TOOL_REGISTRY)) {
      if (config.policy !== 'READ_ONLY' && config.policy !== 'WRITE_OPERATIONS') {
        invalid.push({ toolName, policy: config.policy });
      }
    }
    assert.deepEqual(
      invalid,
      [],
      `Registry contains policies outside { READ_ONLY, WRITE_OPERATIONS }:\n` +
        JSON.stringify(invalid, null, 2),
    );
  });

  test('parser actually loaded .braid files (smoke test - no silent zero match)', () => {
    // Guards against the test suite being a green no-op if TOOLS_DIR
    // resolution or parseBraidFile silently returns nothing (the kind of
    // bug we're trying to prevent in the first place).
    assert.ok(
      braidMap.size >= 50,
      `Expected at least 50 functions with @policy across all .braid files, ` +
        `got ${braidMap.size}. TOOLS_DIR=${TOOLS_DIR}`,
    );
  });
});
