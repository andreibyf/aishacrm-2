import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as validation from '../../lib/validation.js';
import * as uuidValidator from '../../lib/uuidValidator.js';

describe('validation re-exports', () => {
  it('re-exports expected UUID validator APIs', () => {
    assert.equal(typeof validation.isValidUUID, 'function');
    assert.equal(typeof validation.validateUUIDParam, 'function');
    assert.equal(typeof validation.validateTenantId, 'function');
    assert.equal(typeof validation.validateTenantScopedId, 'function');
  });

  it('re-exported functions are same references as uuidValidator exports', () => {
    assert.strictEqual(validation.isValidUUID, uuidValidator.isValidUUID);
    assert.strictEqual(validation.validateUUIDParam, uuidValidator.validateUUIDParam);
    assert.strictEqual(validation.validateTenantId, uuidValidator.validateTenantId);
    assert.strictEqual(validation.validateTenantScopedId, uuidValidator.validateTenantScopedId);
  });

  it('validateTenantScopedId returns true for valid uuid and tenant id', () => {
    const res = {
      status: () => ({
        json: () => {},
      }),
    };

    const ok = validation.validateTenantScopedId(
      'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      'tenant-123',
      res,
    );
    assert.equal(ok, true);
  });
});
