// @ts-check
/**
 * build-docuseal-patched-coverage.test.js (4VD-27 Phase 1)
 *
 * Mirrors the staging-deploy-paths-coverage.test.js pattern from 4VD-30:
 * pin the workflow's structural shape so silent drift gets caught at PR
 * time, not at "why isn't my image showing up in GHCR" time.
 *
 * Asserts:
 *   1. The workflow file exists and parses as text containing the expected
 *      key strings (path filter, GHCR push, build args, tag set,
 *      patch-marker verification step, workflow_dispatch inputs).
 *   2. The Dockerfile that the workflow builds still contains the marker
 *      string the verification step greps for. Decouples "we built an
 *      image" from "we built the RIGHT image".
 *   3. The image name slug matches the docs the operator follows.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const workflowPath = resolve(repoRoot, '.github', 'workflows', 'build-docuseal-patched.yml');
const dockerfilePath = resolve(repoRoot, 'docuseal-patched', 'Dockerfile');

describe('build-docuseal-patched.yml — 4VD-27 Phase 1 coverage', () => {
  /** @type {string} */
  let workflow;
  /** @type {string} */
  let dockerfile;

  test('workflow file exists and is non-empty', () => {
    workflow = readFileSync(workflowPath, 'utf8');
    assert.ok(workflow.length > 0, 'build-docuseal-patched.yml should not be empty');
  });

  test('Dockerfile exists and is non-empty', () => {
    dockerfile = readFileSync(dockerfilePath, 'utf8');
    assert.ok(dockerfile.length > 0, 'docuseal-patched/Dockerfile should not be empty');
  });

  describe('triggers', () => {
    test('fires on push to main with docuseal-patched/** path filter', () => {
      assert.ok(/branches:\s*\[main\]/.test(workflow), 'should trigger on push to main');
      assert.ok(workflow.includes("'docuseal-patched/**'"),
        'path filter should include docuseal-patched/**');
    });

    test('also fires when the workflow file itself changes (so YAML edits get tested)', () => {
      assert.ok(workflow.includes("'.github/workflows/build-docuseal-patched.yml'"),
        'self-trigger needed so workflow YAML edits land via the same workflow');
    });

    test('exposes workflow_dispatch with docuseal_tag + push_latest inputs', () => {
      assert.ok(workflow.includes('workflow_dispatch:'), 'workflow_dispatch trigger required');
      assert.ok(workflow.includes('docuseal_tag:'), 'docuseal_tag input required for upstream rebuilds');
      assert.ok(workflow.includes('push_latest:'), 'push_latest input required for off-cycle rebuilds');
    });
  });

  describe('image publishing', () => {
    test('targets GHCR with -docuseal-patched suffix', () => {
      assert.ok(workflow.includes('REGISTRY: ghcr.io'), 'GHCR registry required');
      assert.ok(/IMAGE_NAME:\s*\$\{\{\s*github\.repository\s*\}\}-docuseal-patched/.test(workflow),
        'image name suffix must be -docuseal-patched (matches existing -frontend / -backend convention from docker-release.yml)');
    });

    test('logs in to GHCR using docker/login-action with GITHUB_TOKEN', () => {
      assert.ok(workflow.includes('docker/login-action@v3'), 'docker login action required');
      assert.ok(workflow.includes('${{ secrets.GITHUB_TOKEN }}'), 'GITHUB_TOKEN auth required');
    });

    test('builds + pushes via docker/build-push-action with the docuseal-patched context', () => {
      assert.ok(workflow.includes('docker/build-push-action@v5'),
        'build-push-action v5 required');
      assert.ok(/context:\s*\.\/docuseal-patched/.test(workflow),
        'build context must be ./docuseal-patched');
      assert.ok(/file:\s*\.\/docuseal-patched\/Dockerfile/.test(workflow),
        'Dockerfile path explicit (no implicit search)');
      assert.ok(workflow.includes('DOCUSEAL_TAG=${{ steps.args.outputs.docuseal_tag }}'),
        'DOCUSEAL_TAG build-arg required so workflow_dispatch can pin upstream');
    });

    test('tag set includes :staging-latest, :<sha>, and :upstream-<tag>-<sha>', () => {
      assert.ok(workflow.includes(':staging-latest'), 'staging-latest moving tag required');
      assert.ok(workflow.includes(':$SHA'), 'per-sha immutable tag required for audit trail');
      assert.ok(workflow.includes(':upstream-$TAG-$SHA'),
        'upstream-version-coupled tag required so we can correlate patch builds to upstream releases');
    });
  });

  describe('safety', () => {
    test('verifies the CSRF skip marker is present in the published image', () => {
      assert.ok(workflow.includes('AISHACRM_4VD23_CSRF_SKIP'),
        'workflow must verify the patch marker is present in the published image — drift here means a successful build that silently dropped the patch');
      assert.ok(/grep -q AISHACRM_4VD23_CSRF_SKIP/.test(workflow),
        'verify step must use grep -q for clean exit-code semantics');
    });

    test('Dockerfile contains the marker string the workflow grep targets', () => {
      assert.ok(dockerfile.includes('AISHACRM_4VD23_CSRF_SKIP'),
        'Dockerfile must contain the marker string — workflow verification depends on it');
    });

    test('Dockerfile has the idempotent grep-q-then-sed pattern (re-running stays safe)', () => {
      assert.ok(dockerfile.includes('grep -q'),
        'Dockerfile must use grep -q guard so re-running on top of an already-patched upstream is a no-op');
    });
  });

  describe('observability', () => {
    test('writes a summary to GITHUB_STEP_SUMMARY', () => {
      assert.ok(workflow.includes('GITHUB_STEP_SUMMARY'),
        'workflow should write to step summary so the operator sees what was published without digging into logs');
    });
  });
});
