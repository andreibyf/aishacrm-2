import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINANCE_MODULE_KEYS,
  isFinanceOpsEnabled,
  checkFinanceOpsEnabled,
} from '../../../lib/finance/financeModuleGate.js';

// ── Pure evaluation ───────────────────────────────────────────────────────────

describe('isFinanceOpsEnabled (pure)', () => {
  test('returns true when financeOps row is enabled', () => {
    const rows = [{ module_name: 'financeOps', is_enabled: true }];
    assert.equal(isFinanceOpsEnabled({ rows }), true);
  });

  test('returns true when enterpriseFinance alias row is enabled', () => {
    const rows = [{ module_name: 'enterpriseFinance', is_enabled: true }];
    assert.equal(isFinanceOpsEnabled({ rows }), true);
  });

  test('returns false when financeOps row is explicitly disabled', () => {
    const rows = [{ module_name: 'financeOps', is_enabled: false }];
    assert.equal(isFinanceOpsEnabled({ rows }), false);
  });

  test('returns false when no matching module row exists', () => {
    const rows = [{ module_name: 'teams', is_enabled: true }];
    assert.equal(isFinanceOpsEnabled({ rows }), false);
  });

  test('returns false when rows is empty', () => {
    assert.equal(isFinanceOpsEnabled({ rows: [] }), false);
  });

  test('returns false when called with no arguments', () => {
    assert.equal(isFinanceOpsEnabled(), false);
  });

  test('feature flag true overrides a disabled module row', () => {
    const rows = [{ module_name: 'financeOps', is_enabled: false }];
    assert.equal(isFinanceOpsEnabled({ rows, featureFlags: { financeOps: true } }), true);
  });

  test('feature flag false overrides an enabled module row', () => {
    const rows = [{ module_name: 'financeOps', is_enabled: true }];
    assert.equal(isFinanceOpsEnabled({ rows, featureFlags: { financeOps: false } }), false);
  });

  test('feature flag false still denies when module row is absent', () => {
    assert.equal(isFinanceOpsEnabled({ rows: [], featureFlags: { financeOps: false } }), false);
  });

  test('canonical and alias keys match the exported constants', () => {
    assert.equal(FINANCE_MODULE_KEYS.CANONICAL, 'financeOps');
    assert.equal(FINANCE_MODULE_KEYS.ALIAS, 'enterpriseFinance');
  });
});

// ── DB-integrated via mock Supabase client ────────────────────────────────────

function mockSupabaseClient(rows, error = null) {
  // Returns a getSupabaseClient factory whose chain resolves on .in()
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    in: () => Promise.resolve({ data: rows, error }),
  };
  return () => chain;
}

describe('checkFinanceOpsEnabled (with mock Supabase)', () => {
  test('resolves true when financeOps row is enabled', async () => {
    const getSupabaseClient = mockSupabaseClient([{ module_name: 'financeOps', is_enabled: true }]);
    const result = await checkFinanceOpsEnabled({ tenantId: 'tenant-1', getSupabaseClient });
    assert.equal(result, true);
  });

  test('resolves true when enterpriseFinance alias row is enabled', async () => {
    const getSupabaseClient = mockSupabaseClient([
      { module_name: 'enterpriseFinance', is_enabled: true },
    ]);
    const result = await checkFinanceOpsEnabled({ tenantId: 'tenant-1', getSupabaseClient });
    assert.equal(result, true);
  });

  test('resolves false when module row is disabled', async () => {
    const getSupabaseClient = mockSupabaseClient([
      { module_name: 'financeOps', is_enabled: false },
    ]);
    const result = await checkFinanceOpsEnabled({ tenantId: 'tenant-1', getSupabaseClient });
    assert.equal(result, false);
  });

  test('resolves false when no module row exists for tenant', async () => {
    const getSupabaseClient = mockSupabaseClient([]);
    const result = await checkFinanceOpsEnabled({ tenantId: 'tenant-1', getSupabaseClient });
    assert.equal(result, false);
  });

  test('feature flag true short-circuits DB — no Supabase call made', async () => {
    let dbCalled = false;
    const getSupabaseClient = () => {
      dbCalled = true;
      throw new Error('DB must not be called when flag overrides');
    };
    const result = await checkFinanceOpsEnabled({
      tenantId: 'tenant-1',
      getSupabaseClient,
      featureFlags: { financeOps: true },
    });
    assert.equal(result, true);
    assert.equal(dbCalled, false);
  });

  test('feature flag false short-circuits DB — no Supabase call made', async () => {
    let dbCalled = false;
    const getSupabaseClient = () => {
      dbCalled = true;
      throw new Error('DB must not be called when flag overrides');
    };
    const result = await checkFinanceOpsEnabled({
      tenantId: 'tenant-1',
      getSupabaseClient,
      featureFlags: { financeOps: false },
    });
    assert.equal(result, false);
    assert.equal(dbCalled, false);
  });

  test('throws when Supabase returns an error', async () => {
    const getSupabaseClient = mockSupabaseClient(null, new Error('DB connection failed'));
    await assert.rejects(
      () => checkFinanceOpsEnabled({ tenantId: 'tenant-1', getSupabaseClient }),
      /DB connection failed/,
    );
  });
});
