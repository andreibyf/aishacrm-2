/**
 * tenants-slug.test.js
 *
 * Unit tests for the tenant-slug helpers exported by routes/tenants.js
 * (4VD-7). Pure functions — no I/O, no backend, no Supabase needed.
 *
 * Run:
 *   cd backend && node --test __tests__/routes/tenants-slug.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isValidTenantSlug, slugifyTenantName } from '../../routes/tenants.js';

describe('isValidTenantSlug', () => {
  test('accepts simple lowercase + hyphen slugs', () => {
    assert.equal(isValidTenantSlug('acme-corp'), true);
    assert.equal(isValidTenantSlug('acme'), true);
    assert.equal(isValidTenantSlug('a1'), true);
    assert.equal(isValidTenantSlug('4v-data-consulting'), true);
  });

  test('rejects uppercase, spaces, special chars', () => {
    assert.equal(isValidTenantSlug('Acme'), false);
    assert.equal(isValidTenantSlug('acme corp'), false);
    assert.equal(isValidTenantSlug('acme.corp'), false);
    assert.equal(isValidTenantSlug('acme_corp'), false);
  });

  test('rejects leading/trailing/double hyphens', () => {
    assert.equal(isValidTenantSlug('-acme'), false);
    assert.equal(isValidTenantSlug('acme-'), false);
    assert.equal(isValidTenantSlug('acme--corp'), false);
  });

  test('enforces length 2..64', () => {
    assert.equal(isValidTenantSlug('a'), false);
    assert.equal(isValidTenantSlug('ab'), true);
    assert.equal(isValidTenantSlug('a'.repeat(64)), true);
    assert.equal(isValidTenantSlug('a'.repeat(65)), false);
  });

  test('rejects non-strings', () => {
    assert.equal(isValidTenantSlug(undefined), false);
    assert.equal(isValidTenantSlug(null), false);
    assert.equal(isValidTenantSlug(42), false);
    assert.equal(isValidTenantSlug(['acme']), false);
  });
});

describe('slugifyTenantName', () => {
  test('slugifies typical company names', () => {
    assert.equal(slugifyTenantName('Acme Corporation'), 'acme-corporation');
    assert.equal(slugifyTenantName('4V Data Consulting'), '4v-data-consulting');
    assert.equal(slugifyTenantName('Smith & Sons, Inc.'), 'smith-sons-inc');
  });

  test('collapses runs of non-alphanumerics into a single hyphen', () => {
    assert.equal(slugifyTenantName('Foo___Bar!!!Baz'), 'foo-bar-baz');
    assert.equal(slugifyTenantName('   spaced   out   '), 'spaced-out');
  });

  test('falls back to tenant-<uuid8> when name slugifies to empty/short', () => {
    const id = '7a8b9c0d-1234-5678-9abc-def012345678';
    assert.equal(slugifyTenantName('!!!', id), 'tenant-7a8b9c0d');
    assert.equal(slugifyTenantName('', id), 'tenant-7a8b9c0d');
    assert.equal(slugifyTenantName('X', id), 'tenant-7a8b9c0d'); // length < 2
  });

  test('truncates very long names to 64 chars', () => {
    const long = 'a'.repeat(200);
    const out = slugifyTenantName(long);
    assert.ok(out.length <= 64, `expected ≤64, got ${out.length}`);
    assert.equal(isValidTenantSlug(out), true, 'truncated slug should still validate');
  });

  test('output always passes isValidTenantSlug for sane inputs', () => {
    const samples = ['Acme', 'Acme Corporation, LLC', '4V Data', 'A & B (Co.)', 'X Y Z'];
    for (const s of samples) {
      const out = slugifyTenantName(s, '11111111-2222-3333-4444-555555555555');
      assert.equal(isValidTenantSlug(out), true, `slugify("${s}") → "${out}" must be a valid slug`);
    }
  });
});
