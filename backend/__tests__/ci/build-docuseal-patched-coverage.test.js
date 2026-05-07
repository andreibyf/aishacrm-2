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
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const workflowPath = resolve(repoRoot, '.github', 'workflows', 'build-docuseal-patched.yml');
const dockerfilePath = resolve(repoRoot, 'docuseal-patched', 'Dockerfile');

// Cwd guard — when this suite runs inside the backend Docker container the
// repo root is not mounted (only /app/{backend contents} is), so .github/
// and docuseal-patched/ won't exist. Skip the whole suite cleanly instead
// of cascading ENOENT failures across 17 subtests. The assertions are
// CI-coverage contracts, so they're already validated by the same suite
// running on host (where cwd contains the repo root) and in GitHub Actions.
const repoRootReachable = existsSync(workflowPath) && existsSync(dockerfilePath);
const skipReason = repoRootReachable
  ? false
  : `repo root not reachable from cwd (workflowPath=${workflowPath}, dockerfilePath=${dockerfilePath}) — likely running inside the backend container which only mounts /app/{backend}. Run on host or in CI to exercise these assertions.`;

const workflow = repoRootReachable ? readFileSync(workflowPath, 'utf8') : '';
const dockerfile = repoRootReachable ? readFileSync(dockerfilePath, 'utf8') : '';

describe('build-docuseal-patched.yml — 4VD-27 Phase 1 coverage', () => {
  test('workflow file exists and is non-empty', { skip: skipReason }, () => {
    assert.ok(workflow.length > 0, 'build-docuseal-patched.yml should not be empty');
  });

  test('Dockerfile exists and is non-empty', { skip: skipReason }, () => {
    assert.ok(dockerfile.length > 0, 'docuseal-patched/Dockerfile should not be empty');
  });

  describe('triggers', () => {
    test('fires on push to main with docuseal-patched/** path filter', { skip: skipReason }, () => {
      assert.ok(/branches:\s*\[main\]/.test(workflow), 'should trigger on push to main');
      assert.ok(
        workflow.includes("'docuseal-patched/**'"),
        'path filter should include docuseal-patched/**',
      );
    });

    test(
      'also fires when the workflow file itself changes (so YAML edits get tested)',
      { skip: skipReason },
      () => {
        assert.ok(
          workflow.includes("'.github/workflows/build-docuseal-patched.yml'"),
          'self-trigger needed so workflow YAML edits land via the same workflow',
        );
      },
    );

    test(
      'exposes workflow_dispatch with docuseal_tag + push_latest inputs',
      { skip: skipReason },
      () => {
        assert.ok(workflow.includes('workflow_dispatch:'), 'workflow_dispatch trigger required');
        assert.ok(
          workflow.includes('docuseal_tag:'),
          'docuseal_tag input required for upstream rebuilds',
        );
        assert.ok(
          workflow.includes('push_latest:'),
          'push_latest input required for off-cycle rebuilds',
        );
      },
    );
  });

  describe('image publishing', () => {
    test('targets GHCR with -docuseal-patched suffix', { skip: skipReason }, () => {
      assert.ok(workflow.includes('REGISTRY: ghcr.io'), 'GHCR registry required');
      assert.ok(
        /IMAGE_NAME:\s*\$\{\{\s*github\.repository\s*\}\}-docuseal-patched/.test(workflow),
        'image name suffix must be -docuseal-patched (matches existing -frontend / -backend convention from docker-release.yml)',
      );
    });

    test(
      'logs in to GHCR using docker/login-action with GITHUB_TOKEN',
      { skip: skipReason },
      () => {
        assert.ok(workflow.includes('docker/login-action@v3'), 'docker login action required');
        assert.ok(workflow.includes('${{ secrets.GITHUB_TOKEN }}'), 'GITHUB_TOKEN auth required');
      },
    );

    test(
      'builds + pushes via docker/build-push-action with the docuseal-patched context',
      { skip: skipReason },
      () => {
        assert.ok(
          workflow.includes('docker/build-push-action@v5'),
          'build-push-action v5 required',
        );
        assert.ok(
          /context:\s*\.\/docuseal-patched/.test(workflow),
          'build context must be ./docuseal-patched',
        );
        assert.ok(
          /file:\s*\.\/docuseal-patched\/Dockerfile/.test(workflow),
          'Dockerfile path explicit (no implicit search)',
        );
        assert.ok(
          workflow.includes('DOCUSEAL_TAG=${{ steps.args.outputs.docuseal_tag }}'),
          'DOCUSEAL_TAG build-arg required so workflow_dispatch can pin upstream',
        );
      },
    );

    test('tag set includes :staging-latest and :upstream-<tag>-<sha>', { skip: skipReason }, () => {
      assert.ok(workflow.includes(':staging-latest'), 'staging-latest moving tag required');
      assert.ok(
        workflow.includes(':upstream-$TAG-$SHA'),
        'upstream-version-coupled tag required so we can correlate patch builds to upstream releases',
      );
    });

    test(
      ':<sha> tag is gated on push events only (Codex P2 review fix)',
      { skip: skipReason },
      () => {
        // The bare :<sha> tag is overwritable across workflow_dispatch reruns
        // of the same commit with different docuseal_tag inputs. Restrict to
        // push events where the input combo is fully determined by the commit.
        assert.ok(
          workflow.includes('if [ "$EVENT" = "push" ]'),
          'workflow must gate :<sha> tag on github.event_name == "push" so dispatch reruns do not overwrite',
        );
        assert.ok(
          /EVENT="\$\{\{\s*github\.event_name\s*\}\}"/.test(workflow),
          'workflow must read github.event_name into a shell var to drive the gate',
        );
      },
    );
  });

  describe('safety', () => {
    test(
      'verifies the CSRF skip marker is present in the published image',
      { skip: skipReason },
      () => {
        assert.ok(
          workflow.includes('AISHACRM_4VD23_CSRF_SKIP'),
          'workflow must verify the patch marker is present in the published image — drift here means a successful build that silently dropped the patch',
        );
        assert.ok(
          /grep -q AISHACRM_4VD23_CSRF_SKIP/.test(workflow),
          'verify step must use grep -q for clean exit-code semantics',
        );
      },
    );

    test(
      'Dockerfile contains the marker string the workflow grep targets',
      { skip: skipReason },
      () => {
        assert.ok(
          dockerfile.includes('AISHACRM_4VD23_CSRF_SKIP'),
          'Dockerfile must contain the marker string — workflow verification depends on it',
        );
      },
    );

    test(
      'Dockerfile has the idempotent grep-q-then-sed pattern (re-running stays safe)',
      { skip: skipReason },
      () => {
        assert.ok(
          dockerfile.includes('grep -q'),
          'Dockerfile must use grep -q guard so re-running on top of an already-patched upstream is a no-op',
        );
      },
    );
  });

  describe('observability', () => {
    test('writes a summary to GITHUB_STEP_SUMMARY', { skip: skipReason }, () => {
      assert.ok(
        workflow.includes('GITHUB_STEP_SUMMARY'),
        'workflow should write to step summary so the operator sees what was published without digging into logs',
      );
    });
  });

  describe('concurrency (Codex P1 review fix)', () => {
    test('declares a concurrency block at workflow scope', { skip: skipReason }, () => {
      // Two commits landing close together can race: an older run can
      // finish last and repoint :staging-latest at stale code. Cancel
      // in-progress runs on the same group to prevent that.
      assert.ok(
        /concurrency:\s*\n\s+group:\s*build-docuseal-patched/.test(workflow),
        'concurrency block with group=build-docuseal-patched-* required to prevent stale :staging-latest pushes',
      );
      assert.ok(
        /cancel-in-progress:\s*true/.test(workflow),
        'cancel-in-progress must be true so older runs are killed when a newer commit arrives',
      );
    });
  });
});
