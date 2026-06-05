import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINANCE_DATA_MODES,
  resolveFinanceDataMode,
  fetchFinanceDataMode,
  setFinanceDataMode,
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
    assert.equal(
      resolveFinanceDataMode({ rows, featureFlags: { financeDataMode: 'test' } }),
      'test',
    );
    assert.equal(
      resolveFinanceDataMode({ rows: [], featureFlags: { financeDataMode: 'live' } }),
      'live',
    );
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
        select: () => ({
          eq: () => ({ in: async () => ({ data: null, error: new Error('db down') }) }),
        }),
      }),
    };
    await assert.rejects(
      () => fetchFinanceDataMode({ tenantId: 't1', getSupabaseClient: () => client }),
      /db down/,
    );
  });
});

describe('setFinanceDataMode', () => {
  function spyClient({ rows = [], readError = null, writeError = null } = {}) {
    const calls = { updated: null };
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ in: async () => ({ data: rows, error: readError }) }) }),
        update: (payload) => ({
          eq: async (_col, val) => {
            calls.updated = { payload, id: val };
            return { error: writeError };
          },
        }),
      }),
    };
    return { client, calls };
  }

  test('updates the canonical financeOps row settings.data_mode (merging existing keys)', async () => {
    const { client, calls } = spyClient({
      rows: [{ id: 'r1', module_name: FIN, settings: { other: 1 } }],
    });
    const mode = await setFinanceDataMode({
      tenantId: 't1',
      mode: 'live',
      getSupabaseClient: () => client,
    });
    assert.equal(mode, 'live');
    assert.deepEqual(calls.updated.payload, { settings: { other: 1, data_mode: 'live' } });
    assert.equal(calls.updated.id, 'r1');
  });

  test('rejects an invalid mode (400) without touching the DB', async () => {
    let called = false;
    await assert.rejects(
      () =>
        setFinanceDataMode({
          tenantId: 't1',
          mode: 'bogus',
          getSupabaseClient: () => {
            called = true;
            return {};
          },
        }),
      (e) => e.statusCode === 400 && e.code === 'FINANCE_DATA_MODE_INVALID',
    );
    assert.equal(called, false);
  });

  test('throws 409 when Finance Ops is not enabled for the tenant (no row)', async () => {
    const { client } = spyClient({ rows: [] });
    await assert.rejects(
      () => setFinanceDataMode({ tenantId: 't1', mode: 'live', getSupabaseClient: () => client }),
      (e) => e.statusCode === 409 && e.code === 'FINANCE_NOT_ENABLED',
    );
  });

  test('prefers the canonical row over the alias', async () => {
    const { client, calls } = spyClient({
      rows: [
        { id: 'alias', module_name: ALIAS, settings: {} },
        { id: 'canon', module_name: FIN, settings: {} },
      ],
    });
    await setFinanceDataMode({ tenantId: 't1', mode: 'test', getSupabaseClient: () => client });
    assert.equal(calls.updated.id, 'canon');
  });
});
