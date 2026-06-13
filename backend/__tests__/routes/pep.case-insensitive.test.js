/**
 * Tests for PEP case-insensitive text filtering.
 * [2026-06-12 Claude] "job title owner" should match "Owner" — free-text eq/neq
 * use ILIKE; uuids/dates/numbers keep exact match.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isFreeText, applyFilter, filterToOrClause } from '../../routes/pep.js';

describe('isFreeText', () => {
  it('treats plain strings as free text', () => {
    assert.equal(isFreeText('Owner'), true);
    assert.equal(isFreeText('owner'), true);
    assert.equal(isFreeText('VP of Sales'), true);
  });

  it('excludes uuids, dates, and numbers (ilike would error / be wrong)', () => {
    assert.equal(isFreeText('123e4567-e89b-12d3-a456-426614174000'), false);
    assert.equal(isFreeText('2026-06-01'), false);
    assert.equal(isFreeText('2026-06-01T12:00:00Z'), false);
    assert.equal(isFreeText('5'), false);
    assert.equal(isFreeText('-12.5'), false);
    assert.equal(isFreeText(5), false);
  });
});

// Minimal chainable mock that records the last builder call.
function mockQuery() {
  const calls = [];
  const q = {};
  for (const m of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'in', 'is', 'not']) {
    q[m] = (...args) => {
      calls.push([m, ...args]);
      return q;
    };
  }
  q._calls = calls;
  return q;
}

describe('applyFilter — case-insensitive text equality', () => {
  it('uses ILIKE for a free-text eq so casing does not matter', () => {
    const q = applyFilter(mockQuery(), { field: 'job_title', operator: 'eq', value: 'owner' });
    assert.deepEqual(q._calls.at(-1), ['ilike', 'job_title', 'owner']);
  });

  it('uses NOT ILIKE for a free-text neq', () => {
    const q = applyFilter(mockQuery(), { field: 'status', operator: 'neq', value: 'Active' });
    assert.deepEqual(q._calls.at(-1), ['not', 'status', 'ilike', 'Active']);
  });

  it('keeps exact eq for a uuid value (assigned_to)', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const q = applyFilter(mockQuery(), { field: 'assigned_to', operator: 'eq', value: id });
    assert.deepEqual(q._calls.at(-1), ['eq', 'assigned_to', id]);
  });

  it('keeps exact comparison for date values', () => {
    const q = applyFilter(mockQuery(), {
      field: 'created_at',
      operator: 'gte',
      value: '2026-06-01',
    });
    assert.deepEqual(q._calls.at(-1), ['gte', 'created_at', '2026-06-01']);
  });

  it('contains stays ILIKE with wildcards', () => {
    const q = applyFilter(mockQuery(), { field: 'email', operator: 'contains', value: 'acme' });
    assert.deepEqual(q._calls.at(-1), ['ilike', 'email', '%acme%']);
  });
});

describe('filterToOrClause (OR logic)', () => {
  it('renders comparisons and case-insensitive text for a PostgREST or() clause', () => {
    assert.equal(
      filterToOrClause({ field: 'amount', operator: 'lt', value: '50000' }),
      'amount.lt.50000',
    );
    assert.equal(
      filterToOrClause({ field: 'stage', operator: 'eq', value: 'Proposal' }),
      'stage.ilike.Proposal', // free-text eq → ilike
    );
    assert.equal(
      filterToOrClause({
        field: 'assigned_to',
        operator: 'eq',
        value: '123e4567-e89b-12d3-a456-426614174000',
      }),
      'assigned_to.eq.123e4567-e89b-12d3-a456-426614174000', // uuid stays exact
    );
    assert.equal(
      filterToOrClause({ field: 'email', operator: 'contains', value: 'acme' }),
      'email.ilike.%acme%',
    );
  });

  it('quotes values that contain structural characters', () => {
    assert.equal(
      filterToOrClause({ field: 'name', operator: 'eq', value: 'Acme, Inc' }),
      'name.ilike."Acme, Inc"',
    );
  });
});
