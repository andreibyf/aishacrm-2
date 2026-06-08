/**
 * resolveSystemTenantId Tests
 *
 * Tests for backend/lib/uuidValidator.js -> resolveSystemTenantId
 *
 * Regression coverage for the "invalid input syntax for type uuid: \"system\""
 * failure: system-originated rows (system_logs, audit_log) must never send the
 * literal string 'system' into a uuid column.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { resolveSystemTenantId } from '../../lib/uuidValidator.js';

const SYSTEM_UUID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const OTHER_UUID = '550e8400-e29b-41d4-a716-446655440000';

function withSystemTenantEnv(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'SYSTEM_TENANT_ID');
  const prev = process.env.SYSTEM_TENANT_ID;
  if (value === undefined) {
    delete process.env.SYSTEM_TENANT_ID;
  } else {
    process.env.SYSTEM_TENANT_ID = value;
  }
  try {
    fn();
  } finally {
    if (had) {
      process.env.SYSTEM_TENANT_ID = prev;
    } else {
      delete process.env.SYSTEM_TENANT_ID;
    }
  }
}

test('resolveSystemTenantId - no SYSTEM_TENANT_ID env set', async (t) => {
  await t.test("coerces the 'system' alias to null", () => {
    withSystemTenantEnv(undefined, () => {
      assert.strictEqual(resolveSystemTenantId('system'), null);
    });
  });

  await t.test('coerces undefined/null/empty to null', () => {
    withSystemTenantEnv(undefined, () => {
      assert.strictEqual(resolveSystemTenantId(undefined), null);
      assert.strictEqual(resolveSystemTenantId(null), null);
      assert.strictEqual(resolveSystemTenantId(''), null);
    });
  });

  await t.test('coerces other system aliases to null', () => {
    withSystemTenantEnv(undefined, () => {
      assert.strictEqual(resolveSystemTenantId('unknown'), null);
      assert.strictEqual(resolveSystemTenantId('anonymous'), null);
    });
  });

  await t.test('coerces arbitrary non-uuid strings to null', () => {
    withSystemTenantEnv(undefined, () => {
      assert.strictEqual(resolveSystemTenantId('not-a-uuid'), null);
    });
  });

  await t.test('passes a valid UUID through unchanged', () => {
    withSystemTenantEnv(undefined, () => {
      assert.strictEqual(resolveSystemTenantId(OTHER_UUID), OTHER_UUID);
    });
  });
});

test('resolveSystemTenantId - SYSTEM_TENANT_ID env set to a valid UUID', async (t) => {
  await t.test("maps the 'system' alias to the configured system UUID", () => {
    withSystemTenantEnv(SYSTEM_UUID, () => {
      assert.strictEqual(resolveSystemTenantId('system'), SYSTEM_UUID);
    });
  });

  await t.test('maps undefined/null to the configured system UUID', () => {
    withSystemTenantEnv(SYSTEM_UUID, () => {
      assert.strictEqual(resolveSystemTenantId(undefined), SYSTEM_UUID);
      assert.strictEqual(resolveSystemTenantId(null), SYSTEM_UUID);
    });
  });

  await t.test('still prefers an explicit valid UUID over the env fallback', () => {
    withSystemTenantEnv(SYSTEM_UUID, () => {
      assert.strictEqual(resolveSystemTenantId(OTHER_UUID), OTHER_UUID);
    });
  });
});

test('resolveSystemTenantId - SYSTEM_TENANT_ID env set to an invalid value', async (t) => {
  await t.test('does not leak an invalid env value; returns null', () => {
    withSystemTenantEnv('system', () => {
      assert.strictEqual(resolveSystemTenantId('system'), null);
    });
    withSystemTenantEnv('garbage', () => {
      assert.strictEqual(resolveSystemTenantId('system'), null);
    });
  });

  await t.test('never returns the literal string "system"', () => {
    for (const env of [undefined, SYSTEM_UUID, 'system', 'garbage']) {
      withSystemTenantEnv(env, () => {
        assert.notStrictEqual(resolveSystemTenantId('system'), 'system');
      });
    }
  });
});
