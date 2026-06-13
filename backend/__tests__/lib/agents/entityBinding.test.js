/**
 * Tests for the single-entity task-worker entity binding.
 * Verifies the worker binds the originating entity id ONLY when the model's value is
 * missing/placeholder, preserves legitimate cross-entity UUIDs, and stays inert for
 * unrelated tools — so it can never leak into multi-entity AiSHA chat behavior.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bindOriginatingEntity,
  isValidUuid,
  ENTITY_ATTACHING_TOOLS,
} from '../../../lib/agents/entityBinding.js';

const ACCOUNT = '11111111-2222-3333-4444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('isValidUuid', () => {
  it('accepts real UUIDs and rejects placeholders/blank', () => {
    assert.equal(isValidUuid(ACCOUNT), true);
    assert.equal(isValidUuid('<account_id>'), false);
    assert.equal(isValidUuid(''), false);
    assert.equal(isValidUuid(undefined), false);
    assert.equal(isValidUuid(null), false);
  });
});

describe('bindOriginatingEntity — the failing case', () => {
  it('replaces a placeholder entity_id with the originating account id', () => {
    const { args, bound } = bindOriginatingEntity(
      'create_note',
      { title: 'x', content: 'y', entity_type: 'account', entity_id: '<account_id>' },
      'account',
      ACCOUNT,
    );
    assert.equal(bound, true);
    assert.equal(args.entity_id, ACCOUNT);
    assert.equal(args.entity_type, 'account');
  });

  it('injects entity_id when the model omitted it entirely (attaching tool)', () => {
    const { args, bound } = bindOriginatingEntity(
      'create_activity',
      { subject: 'Follow up' },
      'account',
      ACCOUNT,
    );
    assert.equal(bound, true);
    assert.equal(args.entity_id, ACCOUNT);
    assert.equal(args.entity_type, 'account');
  });
});

describe('bindOriginatingEntity — preserves legitimate values', () => {
  it('keeps a model-supplied valid UUID (cross-entity reference allowed)', () => {
    const { args, bound } = bindOriginatingEntity(
      'create_note',
      { entity_type: 'opportunity', entity_id: OTHER },
      'account',
      ACCOUNT,
    );
    assert.equal(bound, false);
    assert.equal(args.entity_id, OTHER);
    assert.equal(args.entity_type, 'opportunity');
  });

  it('keeps the model entity_type when only the id needed binding', () => {
    const { args } = bindOriginatingEntity(
      'create_note',
      { entity_type: 'contact', entity_id: '' },
      'account',
      ACCOUNT,
    );
    assert.equal(args.entity_id, ACCOUNT);
    assert.equal(args.entity_type, 'contact'); // model's intent kept; only id was bad
  });
});

describe('bindOriginatingEntity — inert / safe no-ops', () => {
  it('does nothing without a valid originating id', () => {
    const input = { entity_id: '<account_id>' };
    const { args, bound } = bindOriginatingEntity('create_note', input, 'account', undefined);
    assert.equal(bound, false);
    assert.equal(args.entity_id, '<account_id>');
  });

  it('leaves unrelated tools (no entity_id arg) untouched', () => {
    const { args, bound } = bindOriginatingEntity(
      'search_accounts',
      { query: 'acme' },
      'account',
      ACCOUNT,
    );
    assert.equal(bound, false);
    assert.deepEqual(args, { query: 'acme' });
  });

  it('does not mutate the input args object', () => {
    const input = { entity_type: 'account', entity_id: '<account_id>' };
    const { args } = bindOriginatingEntity('create_note', input, 'account', ACCOUNT);
    assert.equal(input.entity_id, '<account_id>'); // original unchanged
    assert.notEqual(args, input); // new object returned
  });

  it('only the two known write tools are entity-attaching by name', () => {
    assert.deepEqual([...ENTITY_ATTACHING_TOOLS].sort(), ['create_activity', 'create_note']);
  });
});
