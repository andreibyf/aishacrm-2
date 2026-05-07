/**
 * resolveRelatedEntityFields.test.js
 *
 * 4VD-39: lock the contract that activity-row inserts can resolve a related
 * entity to {related_name, related_email} so the timeline hyperlink renders
 * "[Entity Name]" instead of "View Contact" / "View Lead" etc.
 *
 * Run:
 *   cd backend && node --test __tests__/lib/resolveRelatedEntityFields.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveRelatedEntityFields,
  composeDisplayName,
  ENTITY_FIELD_MAP,
} from '../../lib/resolveRelatedEntityFields.js';

const TENANT = '00000000-0000-0000-0000-00000000000a';

/**
 * Tiny supabase double: each test wires up the rows it expects.
 * The helper calls `from(table).select(cols).eq('tenant_id', X).eq('id', Y).maybeSingle()`,
 * so we mirror that chain.
 */
function makeSupabase({ table, row, error = null, rejectWith = null }) {
  return {
    from(t) {
      assert.equal(t, table, `expected query against ${table}, got ${t}`);
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => {
          if (rejectWith) throw rejectWith;
          return { data: row, error };
        },
      };
    },
  };
}

describe('composeDisplayName', () => {
  test('single-field entity returns the trimmed value', () => {
    assert.equal(composeDisplayName({ name: 'Acme Corp' }, ['name']), 'Acme Corp');
    assert.equal(composeDisplayName({ name: '  Acme  ' }, ['name']), 'Acme');
  });

  test('two-field entity joins with a space', () => {
    assert.equal(
      composeDisplayName({ first_name: 'Jane', last_name: 'Doe' }, ['first_name', 'last_name']),
      'Jane Doe',
    );
  });

  test('two-field entity skips empty halves cleanly', () => {
    assert.equal(
      composeDisplayName({ first_name: '', last_name: 'Doe' }, ['first_name', 'last_name']),
      'Doe',
      'no leading space when first_name is empty',
    );
    assert.equal(
      composeDisplayName({ first_name: 'Jane', last_name: null }, ['first_name', 'last_name']),
      'Jane',
    );
  });

  test('null/missing entity returns empty', () => {
    assert.equal(composeDisplayName(null, ['name']), '');
    assert.equal(composeDisplayName(undefined, ['name']), '');
  });

  test('all-null fields return empty (not " ")', () => {
    assert.equal(
      composeDisplayName({ first_name: null, last_name: null }, ['first_name', 'last_name']),
      '',
    );
  });
});

describe('ENTITY_FIELD_MAP — supported entity types', () => {
  test('lead/contact use first_name+last_name', () => {
    assert.deepEqual(ENTITY_FIELD_MAP.lead.nameFields, ['first_name', 'last_name']);
    assert.deepEqual(ENTITY_FIELD_MAP.contact.nameFields, ['first_name', 'last_name']);
  });

  test('account/opportunity use single name field', () => {
    assert.deepEqual(ENTITY_FIELD_MAP.account.nameFields, ['name']);
    assert.deepEqual(ENTITY_FIELD_MAP.opportunity.nameFields, ['name']);
  });

  test('opportunity has no email field (no recipient on opps)', () => {
    assert.equal(ENTITY_FIELD_MAP.opportunity.emailField, null);
  });

  test('bizdev_source supported (matches Activities.jsx entityMap)', () => {
    assert.equal(ENTITY_FIELD_MAP.bizdev_source.table, 'bizdev_sources');
  });
});

describe('resolveRelatedEntityFields', () => {
  test('lead → "First Last" + email', async () => {
    const supabase = makeSupabase({
      table: 'leads',
      row: { first_name: 'Jane', last_name: 'Doe', email: 'jane@acme.com' },
    });
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'lead', 'lead-uuid');
    assert.deepEqual(out, { related_name: 'Jane Doe', related_email: 'jane@acme.com' });
  });

  test('contact → "First Last" + email', async () => {
    const supabase = makeSupabase({
      table: 'contacts',
      row: { first_name: 'Bob', last_name: 'Smith', email: 'bob@x.com' },
    });
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'contact', 'contact-uuid');
    assert.deepEqual(out, { related_name: 'Bob Smith', related_email: 'bob@x.com' });
  });

  test('account → single name + email', async () => {
    const supabase = makeSupabase({
      table: 'accounts',
      row: { name: 'Acme Corp', email: 'info@acme.com' },
    });
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'account', 'acct-uuid');
    assert.deepEqual(out, { related_name: 'Acme Corp', related_email: 'info@acme.com' });
  });

  test('opportunity → name with NULL email (no email field on opps)', async () => {
    const supabase = makeSupabase({
      table: 'opportunities',
      row: { name: 'Q4 Renewal' },
    });
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'opportunity', 'opp-uuid');
    assert.deepEqual(out, { related_name: 'Q4 Renewal', related_email: null });
  });

  test('bizdev_source → "First Last" + email', async () => {
    const supabase = makeSupabase({
      table: 'bizdev_sources',
      row: { first_name: 'Carol', last_name: 'Lee', email: 'carol@x.com' },
    });
    const out = await resolveRelatedEntityFields(
      supabase,
      TENANT,
      'bizdev_source',
      'bd-uuid',
    );
    assert.deepEqual(out, { related_name: 'Carol Lee', related_email: 'carol@x.com' });
  });
});

describe('resolveRelatedEntityFields — graceful degrade', () => {
  test('unknown entity type returns nulls (no throw)', async () => {
    const supabase = { from() { throw new Error('should not be called'); } };
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'unknown', 'x');
    assert.deepEqual(out, { related_name: null, related_email: null });
  });

  test('missing args return nulls', async () => {
    const supabase = { from() { throw new Error('should not be called'); } };
    assert.deepEqual(
      await resolveRelatedEntityFields(supabase, '', 'contact', 'x'),
      { related_name: null, related_email: null },
    );
    assert.deepEqual(
      await resolveRelatedEntityFields(supabase, TENANT, 'contact', ''),
      { related_name: null, related_email: null },
    );
    assert.deepEqual(
      await resolveRelatedEntityFields(null, TENANT, 'contact', 'x'),
      { related_name: null, related_email: null },
    );
  });

  test('supabase error returns nulls (insert should still proceed)', async () => {
    const supabase = makeSupabase({
      table: 'leads',
      row: null,
      error: { message: 'permission denied' },
    });
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'lead', 'lead-uuid');
    assert.deepEqual(out, { related_name: null, related_email: null });
  });

  test('row not found returns nulls', async () => {
    const supabase = makeSupabase({ table: 'leads', row: null });
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'lead', 'nope');
    assert.deepEqual(out, { related_name: null, related_email: null });
  });

  test('supabase throws → returns nulls (does not propagate)', async () => {
    const supabase = makeSupabase({
      table: 'leads',
      row: null,
      rejectWith: new Error('connection refused'),
    });
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'lead', 'lead-uuid');
    assert.deepEqual(out, { related_name: null, related_email: null });
  });

  test('partial-name entity (only last_name) renders the available half', async () => {
    const supabase = makeSupabase({
      table: 'contacts',
      row: { first_name: null, last_name: 'Doe', email: 'doe@x.com' },
    });
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'contact', 'c-uuid');
    assert.deepEqual(out, { related_name: 'Doe', related_email: 'doe@x.com' });
  });

  test('all-empty name fields return null name (not empty string)', async () => {
    const supabase = makeSupabase({
      table: 'contacts',
      row: { first_name: '', last_name: '', email: 'x@y.com' },
    });
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'contact', 'c-uuid');
    assert.deepEqual(out, { related_name: null, related_email: 'x@y.com' });
  });

  test('empty email string returns null email (not empty string)', async () => {
    const supabase = makeSupabase({
      table: 'leads',
      row: { first_name: 'Jane', last_name: 'Doe', email: '' },
    });
    const out = await resolveRelatedEntityFields(supabase, TENANT, 'lead', 'lead-uuid');
    assert.deepEqual(out, { related_name: 'Jane Doe', related_email: null });
  });
});

describe('resolveRelatedEntityFields — tenant scoping', () => {
  test('queries filter by tenant_id (not just id) to defend against cross-tenant id leaks', async () => {
    let capturedFilters = [];
    const supabase = {
      from(table) {
        assert.equal(table, 'leads');
        return {
          select() { return this; },
          eq(col, val) {
            capturedFilters.push([col, val]);
            return this;
          },
          maybeSingle: async () => ({
            data: { first_name: 'Jane', last_name: 'Doe', email: 'jane@x.com' },
            error: null,
          }),
        };
      },
    };
    await resolveRelatedEntityFields(supabase, TENANT, 'lead', 'lead-uuid');
    // Both filters must be applied
    assert.ok(
      capturedFilters.some(([col, val]) => col === 'tenant_id' && val === TENANT),
      'must filter by tenant_id',
    );
    assert.ok(
      capturedFilters.some(([col, val]) => col === 'id' && val === 'lead-uuid'),
      'must filter by id',
    );
  });
});
