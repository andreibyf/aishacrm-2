import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINANCE_DATA_MODES,
  resolveFinanceDataMode,
  fetchFinanceDataMode,
} from '../../../lib/finance/financeDataMode.js';

const FIN = 'financeOps';
const ALIAS = 'enterpriseFinance';

describe('resolveFinanceDataMode (pure)', () => {
  test('defaults to test with no rows', () => {
    assert.equal(resolveFinanceDataMode({ rows: [] }), 'test');
    assert.equal(resolveFinanceDataMode(), 'test');
  });

  test('resolves live only when settings.data_mode is explicitly live', () => {
    assert.equal(
      resolveFinanceDataMode({ rows: [{ module_name: FIN, settings: { data_mode: 'live' } }] }),
      'live',
    );
  });

  test('anything other than live resolves to test (default-closed)', () => {
    for (const settings of [{ data_mode: 'test' }, { data_mode: 'bogus' }, {}, null]) {
      assert.equal(resolveFinanceDataMode({ rows: [{ module_name: FIN, settings }] }), 'test');
    }
  });

  test('CANONICAL (financeOps) wins over ALIAS when they conflict', () => {
    const rows = [
      { module_name: ALIAS, settings: { data_mode: 'live' } },
      { module_name: FIN, settings: { data_mode: 'test' } },
    ];
    assert.equal(resolveFinanceDataMode({ rows }), 'test');
  });

  test('falls back to the alias row when no canonical row exists', () => {
    const rows = [{ module_name: ALIAS, settings: { data_mode: 'live' } }];
    assert.equal(resolveFinanceDataMode({ rows }), 'live');
  });

  test('featureFlags.financeDataMode overrides DB rows', () => {
    const rows = [{ module_name: FIN, settings: { data_mode: 'live' } }];
    assert.equal(resolveFinanceDataMode({ rows, featureFlags: { financeDataMode: 'test' } }), 'test');
    assert.equal(resolveFinanceDataMode({ rows: [], featureFlags: { financeDataMode: 'live' } }), 'live');
  });

  test('exports the mode constants', () => {
    assert.equal(FINANCE_DATA_MODES.TEST, 'test');
    assert.equal(FINANCE_DATA_MODES.LIVE, 'live');
  });
});

describe('fetchFinanceDataMode (with Supabase)', () => {
  function spyClient(rows) {
    const calls = [];
    const client = {
      from: (table) => {
        calls.push({ table });
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: async () => ({ data: rows, error: null }),
        };
        return builder;
      },
    };
    return { client, calls };
  }

  test('fetches modulesettings and resolves the mode', async () => {
    const { client, calls } = spyClient([{ module_name: FIN, settings: { data_mode: 'live' } }]);
    const mode = await fetchFinanceDataMode({ tenantId: 't1', getSupabaseClient: () => client });
    assert.equal(mode, 'live');
    assert.equal(calls[0].table, 'modulesettings');
  });

  test('feature flag short-circuits the DB call', async () => {
    let called = false;
    const getSupabaseClient = () => {
      called = true;
      return {};
    };
    const mode = await fetchFinanceDataMode({
      tenantId: 't1',
      getSupabaseClient,
      featureFlags: { financeDataMode: 'live' },
    });
    assert.equal(mode, 'live');
    assert.equal(called, false, 'no Supabase round-trip when the flag is explicit');
  });

  test('propagates a Supabase error', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ in: async () => ({ data: null, error: new Error('db down') }) }) }),
      }),
    };
    await assert.rejects(
      () => fetchFinanceDataMode({ tenantId: 't1', getSupabaseClient: () => client }),
      /db down/,
    );
  });
});
