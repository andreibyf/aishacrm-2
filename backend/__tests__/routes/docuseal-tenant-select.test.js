/**
 * docuseal-tenant-select.test.js
 *
 * Integration regression for Bug 4 from the 2026-05-04 4VD-7 smoke test:
 * the routes' tenant lookups had `.select('name, slug, logo_url, primary_color, branding_settings')`
 * but `tenant` has only `name, slug, branding_settings` as real columns —
 * `logo_url` / `primary_color` / `accent_color` live inside `branding_settings`.
 * PostgREST returned 400 "column tenant.logo_url does not exist" and
 * supabase-js's .maybeSingle() swallowed the error into `data: null`,
 * silently breaking the white-label signing URL build.
 *
 * Helper-level unit tests didn't catch this because they mock the supabase
 * client. This test runs the actual `.select(...)` strings used by both
 * docuseal routes against the live dev/staging Supabase and asserts each
 * returns non-null data — i.e. that every column listed actually exists on
 * the tenant table at the schema layer.
 *
 * Skips when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are absent so this
 * doesn't break CI/local runs without env. Run as part of the docker
 * regression: `docker exec aishacrm-backend npm test`.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !url || !key;
const skipReason = 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping live schema check';

// The exact select-list strings used by the routes today. If a future PR
// changes either route's select list, mirror the change here. The point of
// the test is that whatever the routes ASK for, the schema MUST provide.
const DOCUSEAL_ROUTE_SELECT = 'name, slug, branding_settings';
const PUBLIC_DOCUSEAL_NESTED_TENANT_SELECT = 'id, name, slug, branding_settings';

describe(
  'docuseal route tenant.select() column list matches real schema',
  { skip, skipReason },
  () => {
    const supabase = skip ? null : createClient(url, key);

    test('routes/docuseal.js — POST /api/docuseal/submissions tenant lookup returns all listed columns', async () => {
      // Pick any tenant row — the column existence check doesn't care which.
      const { data: any } = await supabase.from('tenant').select('id').limit(1).maybeSingle();
      assert.ok(any?.id, 'expected at least one tenant row to exist for the schema check');

      const { data, error, status } = await supabase
        .from('tenant')
        .select(DOCUSEAL_ROUTE_SELECT)
        .eq('id', any.id)
        .maybeSingle();

      assert.equal(
        error,
        null,
        `select('${DOCUSEAL_ROUTE_SELECT}') failed: ${error?.code} ${error?.message}`,
      );
      assert.equal(status, 200, `expected 200, got ${status}`);
      assert.ok(data, 'data must be non-null — 4VD-7 Bug 4 manifested as data:null after a 400');
      assert.ok('name' in data, 'name column must be selectable');
      assert.ok('slug' in data, 'slug column must be selectable (added in migration 161)');
      assert.ok('branding_settings' in data, 'branding_settings column must be selectable');
    });

    test('routes/public-docuseal.js — GET /sign/:slug/:token nested tenant select returns all listed columns', async () => {
      // The public route reads tenant via a nested select on docuseal_submissions.
      // Validate the nested-select column list directly against `tenant` since
      // the join shape just feeds those same columns through.
      const { data: any } = await supabase.from('tenant').select('id').limit(1).maybeSingle();
      assert.ok(any?.id);

      const { data, error, status } = await supabase
        .from('tenant')
        .select(PUBLIC_DOCUSEAL_NESTED_TENANT_SELECT)
        .eq('id', any.id)
        .maybeSingle();

      assert.equal(
        error,
        null,
        `select('${PUBLIC_DOCUSEAL_NESTED_TENANT_SELECT}') failed: ${error?.code} ${error?.message}`,
      );
      assert.equal(status, 200);
      assert.ok(data);
      assert.ok('id' in data);
      assert.ok('name' in data);
      assert.ok('slug' in data);
      assert.ok('branding_settings' in data);
    });

    test('regression: known-bad column names rejected by PostgREST (sanity check the failure mode is real)', async () => {
      // This test pins the exact failure mode that fooled 4VD-7's smoke test.
      // If PostgREST ever changed behavior to ignore unknown columns instead of
      // 400-ing, that would be a worse failure mode (silent partial reads) and
      // we'd want to know about it.
      const { data, error, status } = await supabase.from('tenant').select('id, logo_url').limit(1);

      assert.equal(
        status,
        400,
        'PostgREST must 400 on unknown columns; if this changes, silent-data-loss is now possible',
      );
      assert.equal(data, null);
      assert.equal(error?.code, '42703', 'expected SQL undefined-column error code');
      assert.match(
        error?.message || '',
        /column .* does not exist/,
        'error message should name the bad column for diagnosability',
      );
    });
  },
);
