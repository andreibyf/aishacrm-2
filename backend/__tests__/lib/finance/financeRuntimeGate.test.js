import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// Helper: run isFinanceRuntimeEnabled with a specific env value, then restore.
function withEnv(value, fn) {
  const original = process.env.ENABLE_FINANCE_OPS;
  try {
    if (value === undefined) {
      delete process.env.ENABLE_FINANCE_OPS;
    } else {
      process.env.ENABLE_FINANCE_OPS = value;
    }
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.ENABLE_FINANCE_OPS;
    } else {
      process.env.ENABLE_FINANCE_OPS = original;
    }
  }
}

describe('financeRuntimeGate — isFinanceRuntimeEnabled()', () => {
  test('returns false when ENABLE_FINANCE_OPS is undefined', async () => {
    // Dynamic import so env is read at call time, not module load time.
    const { isFinanceRuntimeEnabled } = await import('../../../lib/finance/financeRuntimeGate.js');
    const result = withEnv(undefined, () => isFinanceRuntimeEnabled());
    assert.equal(result, false);
  });

  test('returns false when ENABLE_FINANCE_OPS=false', async () => {
    const { isFinanceRuntimeEnabled } = await import('../../../lib/finance/financeRuntimeGate.js');
    const result = withEnv('false', () => isFinanceRuntimeEnabled());
    assert.equal(result, false);
  });

  test('returns true when ENABLE_FINANCE_OPS=true', async () => {
    const { isFinanceRuntimeEnabled } = await import('../../../lib/finance/financeRuntimeGate.js');
    const result = withEnv('true', () => isFinanceRuntimeEnabled());
    assert.equal(result, true);
  });

  test('returns false for any value other than "true" (e.g. "1", "yes", "TRUE")', async () => {
    const { isFinanceRuntimeEnabled } = await import('../../../lib/finance/financeRuntimeGate.js');
    for (const val of ['1', 'yes', 'TRUE', 'True', 'on', '']) {
      const result = withEnv(val, () => isFinanceRuntimeEnabled());
      assert.equal(result, false, `expected false for ENABLE_FINANCE_OPS="${val}"`);
    }
  });
});
