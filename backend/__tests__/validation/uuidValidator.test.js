/**
 * UUID Validator Tests
 * 
 * Tests for backend/lib/uuidValidator.js
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  isValidUUID,
  sanitizeUuidInput,
  sanitizeUuidFilter,
} from '../../lib/uuidValidator.js';

test('UUID Validator - isValidUUID', async (t) => {
  await t.test('returns true for valid UUIDs', () => {
    assert.strictEqual(isValidUUID('550e8400-e29b-41d4-a716-446655440000'), true);
    assert.strictEqual(isValidUUID('a11dfb63-4b18-4eb8-872e-747af2e37c46'), true);
    assert.strictEqual(isValidUUID('123e4567-E89B-12D3-A456-426614174000'), true);
  });

  await t.test('returns false for invalid UUIDs', () => {
    assert.strictEqual(isValidUUID('system'), false);
    assert.strictEqual(isValidUUID('not-a-uuid'), false);
    assert.strictEqual(isValidUUID('123'), false);
    assert.strictEqual(isValidUUID(''), false);
  });

  await t.test('returns false for non-strings', () => {
    assert.strictEqual(isValidUUID(null), false);
    assert.strictEqual(isValidUUID(undefined), false);
    assert.strictEqual(isValidUUID(123), false);
    assert.strictEqual(isValidUUID({}), false);
  });
});

test('UUID Validator - sanitizeUuidInput', async (t) => {
  await t.test('returns valid UUIDs unchanged', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    assert.strictEqual(sanitizeUuidInput(uuid), uuid);
  });

  await t.test('converts system aliases to NULL', () => {
    assert.strictEqual(sanitizeUuidInput('system'), null);
    assert.strictEqual(sanitizeUuidInput('SYSTEM'), null);
    assert.strictEqual(sanitizeUuidInput('unknown'), null);
    assert.strictEqual(sanitizeUuidInput('anonymous'), null);
  });

  await t.test('converts invalid UUIDs to NULL', () => {
    assert.strictEqual(sanitizeUuidInput('not-a-uuid'), null);
    assert.strictEqual(sanitizeUuidInput('123abc'), null);
  });

  await t.test('handles NULL and empty values', () => {
    assert.strictEqual(sanitizeUuidInput(null), null);
    assert.strictEqual(sanitizeUuidInput(undefined), null);
    assert.strictEqual(sanitizeUuidInput(''), null);
  });

  await t.test('respects allowNull option', () => {
    assert.strictEqual(sanitizeUuidInput(null, { allowNull: false }), undefined);
    assert.strictEqual(sanitizeUuidInput('', { allowNull: false }), undefined);
  });

  await t.test('respects custom systemAliases', () => {
    assert.strictEqual(
      sanitizeUuidInput('bot', { systemAliases: ['bot', 'automation'] }),
      null
    );
    assert.strictEqual(
      sanitizeUuidInput('system', { systemAliases: ['bot'] }),
      null // still invalid UUID
    );
  });
});

test('UUID Validator - sanitizeUuidFilter', async (t) => {
  await t.test('sanitizes UUID columns in filter', () => {
    const filter = {
      tenant_id: 'system',
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test'
    };

    const result = sanitizeUuidFilter(filter, ['tenant_id', 'user_id']);

    assert.strictEqual(result.tenant_id, null);
    assert.strictEqual(result.user_id, '550e8400-e29b-41d4-a716-446655440000');
    assert.strictEqual(result.name, 'Test');
  });

  await t.test('handles $or conditions', () => {
    const filter = {
      $or: [
        { user_id: 'system' },
        { user_id: '550e8400-e29b-41d4-a716-446655440000' }
      ]
    };

    const result = sanitizeUuidFilter(filter, ['user_id']);

    assert.strictEqual(result.$or[0].user_id, null);
    assert.strictEqual(result.$or[1].user_id, '550e8400-e29b-41d4-a716-446655440000');
  });

  await t.test('handles $and conditions', () => {
    const filter = {
      $and: [
        { tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46' },
        { user_id: 'invalid-uuid' }
      ]
    };

    const result = sanitizeUuidFilter(filter, ['tenant_id', 'user_id']);

    assert.strictEqual(result.$and[0].tenant_id, 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
    assert.strictEqual(result.$and[1].user_id, null);
  });

  await t.test('preserves operator objects like $regex', () => {
    const filter = {
      tenant_id: '550e8400-e29b-41d4-a716-446655440000',
      name: { $regex: 'test', $options: 'i' }
    };

    const result = sanitizeUuidFilter(filter, ['tenant_id']);

    assert.deepStrictEqual(result.name, { $regex: 'test', $options: 'i' });
  });

  await t.test('handles empty filter', () => {
    assert.deepStrictEqual(sanitizeUuidFilter({}, ['tenant_id']), {});
    assert.strictEqual(sanitizeUuidFilter(null, ['tenant_id']), null);
  });
});
