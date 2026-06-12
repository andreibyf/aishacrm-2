/**
 * Tests for PEP field projection + schema-derived denylist.
 * [2026-06-12 Claude] "report of contacts with only first name, last name,
 * telephone, email" — projection resolution, friendly-name synonyms, and the
 * column denylist.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuery } from '../../../pep/compiler/resolver.js';
import { isDeniedColumn } from '../../../pep/compiler/schemaCatalog.js';

const CATALOG = {
  entities: [
    {
      id: 'Contact',
      aisha_binding: { table: 'contacts', route: '/api/v2/contacts' },
      fields: [
        { name: 'first_name', operators: ['eq', 'contains', 'is_null'] },
        { name: 'last_name', operators: ['eq', 'contains', 'is_null'] },
        { name: 'email', operators: ['eq', 'contains', 'is_null'] },
        { name: 'phone', operators: ['eq', 'contains', 'is_null'] },
        { name: 'mobile', operators: ['eq', 'contains', 'is_null'] },
        { name: 'created_date', operators: ['gte', 'lte', 'eq'] },
      ],
    },
  ],
  views: [],
};

describe('PEP projection resolution', () => {
  it('maps friendly field names to catalog columns', () => {
    const r = resolveQuery(
      {
        target: 'Contact',
        filters: [],
        fields: ['first name', 'last name', 'telephone number', 'email address'],
      },
      CATALOG,
    );
    assert.equal(r.resolved, true);
    assert.deepEqual(r.fields, ['first_name', 'last_name', 'phone', 'email']);
    assert.deepEqual(r.field_warnings, []);
  });

  it('drops unmappable projection fields instead of failing the whole query', () => {
    const r = resolveQuery(
      { target: 'Contact', filters: [], fields: ['first name', 'telephone', 'ssn', 'salary'] },
      CATALOG,
    );
    assert.equal(r.resolved, true); // still resolves
    assert.deepEqual(r.fields, ['first_name', 'phone']);
    assert.equal(r.field_warnings.length, 2); // ssn + salary omitted
  });

  it('returns fields:null when no projection is requested (all columns)', () => {
    const r = resolveQuery({ target: 'Contact', filters: [] }, CATALOG);
    assert.equal(r.resolved, true);
    assert.equal(r.fields, null);
  });

  it('a date filter (e.g. created last week) still resolves alongside projection', () => {
    const r = resolveQuery(
      {
        target: 'Contact',
        filters: [{ field: 'created_date', operator: 'gte', value: '{{date: last_7_days}}' }],
        fields: ['first name', 'email address'],
      },
      CATALOG,
    );
    assert.equal(r.resolved, true);
    assert.equal(r.filters.length, 1);
    assert.equal(r.filters[0].field, 'created_date');
    assert.deepEqual(r.fields, ['first_name', 'email']);
  });
});

describe('PEP column denylist', () => {
  it('denies metadata-type, tenant_id, embeddings, and legacy jsonb columns', () => {
    for (const c of ['metadata', 'activity_metadata', 'tenant_id', 'embedding', 'tags_jsonb_old']) {
      assert.equal(isDeniedColumn(c), true, `${c} should be denied`);
    }
  });

  it('allows normal person/report fields', () => {
    for (const c of [
      'first_name',
      'last_name',
      'email',
      'phone',
      'created_date',
      'status',
      'city',
    ]) {
      assert.equal(isDeniedColumn(c), false, `${c} should be allowed`);
    }
  });
});
