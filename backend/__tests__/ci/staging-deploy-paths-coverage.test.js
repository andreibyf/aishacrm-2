// @ts-check
/**
 * staging-deploy-paths-coverage.test.js
 *
 * Asserts that .github/workflows/deploy-staging.yml's per-app path filters
 * match Coolify's authoritative watch_paths for each staging Application.
 * Drift here would silently cause "deployed code didn't update on staging"
 * incidents like 4VD-30 — the symptom we're trying to prevent.
 *
 * The Coolify-side watch_paths are captured here as a snapshot, fetched
 * from `GET /api/v1/applications/<uuid>` on 2026-05-06. If staging's
 * watch_paths config changes in the Coolify UI, update both this snapshot
 * AND the workflow filter — they must move together.
 *
 * The test does NOT call Coolify at runtime to avoid coupling test results
 * to network availability and credentials in CI.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const workflowPath = resolve(repoRoot, '.github', 'workflows', 'deploy-staging.yml');
const compositeActionPath = resolve(repoRoot, '.github', 'actions', 'coolify-deploy', 'action.yml');

// Snapshot of Coolify watch_paths per Application (as of 2026-05-06).
// Source: GET https://deploy.aishacrm.com/api/v1/applications/<uuid>
// Update both this snapshot and the workflow's `dorny/paths-filter` block
// when staging app paths change.
const COOLIFY_WATCH_PATHS = Object.freeze({
  'app-fast': {
    uuid: 'di7ko49ikfd2mz8yh0q7id8q',
    name: 'staging-app-fast',
    paths: [
      'src/**',
      'public/**',
      'index.html',
      'Dockerfile',
      'frontend-entrypoint.sh',
      'package.json',
      'package-lock.json',
      'vite.config.ts',
      'tailwind.config.js',
      'postcss.config.js',
      'staging/02-app-fast/**',
    ],
  },
  'backend-heavy': {
    uuid: 'd24ro1fqm0zyl7pd72g6snd2',
    name: 'staging-backend-heavy',
    paths: ['backend/**', 'staging/01-backend-heavy/**'],
  },
  braid: {
    uuid: 'tw8zmua5jyzwnhh1oxw15kkm',
    name: 'staging-braid',
    paths: ['braid-mcp-node-server/**', 'staging/04-braid/**'],
  },
  litellm: {
    uuid: 'zsy5fsbw9hccxvoznkbpy1il',
    name: 'staging-litellm',
    paths: ['litellm/**', 'staging/services/litellm/**'],
  },
});

describe('deploy-staging.yml coverage', () => {
  /** @type {string} */
  let workflow;

  test('workflow file exists and reads', () => {
    workflow = readFileSync(workflowPath, 'utf8');
    assert.ok(workflow.length > 0, 'workflow file should not be empty');
  });

  for (const [appKey, app] of Object.entries(COOLIFY_WATCH_PATHS)) {
    describe(`${appKey} (${app.name}, ${app.uuid})`, () => {
      test('workflow declares the app UUID', () => {
        assert.ok(
          workflow.includes(app.uuid),
          `Workflow should reference UUID ${app.uuid} for ${app.name}`,
        );
      });

      test('workflow declares the app name string', () => {
        assert.ok(
          workflow.includes(app.name),
          `Workflow should reference application_name '${app.name}'`,
        );
      });

      for (const p of app.paths) {
        test(`workflow declares path filter '${p}'`, () => {
          // The path filter is single-quoted in the YAML; check both quoted
          // and a tolerant variant in case YAML was reformatted.
          const quoted = `'${p}'`;
          const present = workflow.includes(quoted) || workflow.includes(`"${p}"`);
          assert.ok(
            present,
            `Workflow filter for ${appKey} missing path '${p}'. Coolify will deploy on this path but workflow will skip — drift bug.`,
          );
        });
      }
    });
  }

  test('every Coolify app has a deploy job in the workflow', () => {
    for (const [appKey, app] of Object.entries(COOLIFY_WATCH_PATHS)) {
      const jobName = `deploy-${appKey}`;
      assert.ok(
        workflow.includes(`${jobName}:`),
        `Workflow should declare a job '${jobName}' for ${app.name}`,
      );
    }
  });

  test('composite action exists and uses POST + poll pattern', () => {
    const action = readFileSync(compositeActionPath, 'utf8');
    assert.ok(
      action.includes('curl') && action.includes('/api/v1/deploy?uuid=') && action.includes('/api/v1/deployments/'),
      'coolify-deploy composite action should POST to /api/v1/deploy and poll /api/v1/deployments',
    );
    assert.ok(
      action.includes('deployment_uuid'),
      'composite action must extract deployment_uuid for failure reporting',
    );
    assert.ok(
      /finished|failed|cancelled/.test(action),
      'composite action must check terminal deployment statuses',
    );
  });
});
