/**
 * Unit tests for clearFinanceTestData (slice 6c).
 *
 * Fully spy-driven — no real DB. Verifies:
 *  - the DELETE targets finance.audit_events with `is_test_data = true AND tenant_id = $1`
 *    and the tenant param;
 *  - the rebuild is invoked with isTestData=true for mode 'test' and false for 'live';
 *  - a thrown rebuild is NON-FATAL (still resolves { deleted, rebuilt: false });
 *  - a missing tenantId throws.
 */

import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { clearFinanceTestData } from '../../../lib/finance/clearFinanceTestData.js';

const TENANT = '6cb4c008-4847-426a-9a2e-918ad70e7b69';

// A spy pg pool that records every query (text + params) and returns a fixed
// rowCount for the DELETE.
function makeSpyPool({ rowCount = 0 } = {}) {
  const calls = [];
  return {
    calls,
    query: mock.fn(async (text, params) => {
      calls.push({ text, params });
      return { rowCount, rows: Array.from({ length: rowCount }, (_, i) => ({ id: i })) };
    }),
  };
}

// A spy getSupabaseClient that resolves the given finance data mode via the
// modulesettings read shape fetchFinanceDataMode performs.
function makeSupabaseForMode(mode) {
  return () => ({
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                in: async () => ({
                  data: [{ module_name: 'financeOps', settings: { data_mode: mode } }],
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  });
}

// Silent logger so warn-on-failure does not pollute test output.
const silentLogger = { warn: () => {}, error: () => {}, info: () => {} };

describe('clearFinanceTestData', () => {
  test('deletes the tenant test events with the exact parameterized SQL', async () => {
    const pool = makeSpyPool({ rowCount: 7 });
    const rebuild = mock.fn(async () => ({ rebuilt: ['ledger'], degraded: [] }));

    const result = await clearFinanceTestData({
      pool,
      getSupabaseClient: makeSupabaseForMode('test'),
      tenantId: TENANT,
      logger: silentLogger,
      rebuild,
    });

    assert.equal(pool.query.mock.callCount(), 1);
    const { text, params } = pool.calls[0];
    assert.match(text, /DELETE FROM finance\.audit_events/);
    assert.match(text, /is_test_data = true/);
    assert.match(text, /tenant_id = \$1/);
    assert.deepEqual(params, [TENANT]);

    assert.deepEqual(result, { deleted: 7, rebuilt: true });
  });

  test('rebuilds with isTestData=true when the tenant is in test mode', async () => {
    const pool = makeSpyPool({ rowCount: 3 });
    const rebuild = mock.fn(async () => ({ rebuilt: [], degraded: [] }));

    await clearFinanceTestData({
      pool,
      getSupabaseClient: makeSupabaseForMode('test'),
      tenantId: TENANT,
      logger: silentLogger,
      rebuild,
    });

    assert.equal(rebuild.mock.callCount(), 1);
    const arg = rebuild.mock.calls[0].arguments[0];
    assert.equal(arg.isTestData, true);
    assert.equal(arg.tenantId, TENANT);
  });

  test('rebuilds with isTestData=false when the tenant is in live mode', async () => {
    const pool = makeSpyPool({ rowCount: 0 });
    const rebuild = mock.fn(async () => ({ rebuilt: [], degraded: [] }));

    await clearFinanceTestData({
      pool,
      getSupabaseClient: makeSupabaseForMode('live'),
      tenantId: TENANT,
      logger: silentLogger,
      rebuild,
    });

    assert.equal(rebuild.mock.callCount(), 1);
    const arg = rebuild.mock.calls[0].arguments[0];
    assert.equal(arg.isTestData, false);
  });

  test('a thrown rebuild is non-fatal — delete result still returned with rebuilt:false', async () => {
    const pool = makeSpyPool({ rowCount: 5 });
    const rebuild = mock.fn(async () => {
      throw new Error('projection store unavailable');
    });

    const result = await clearFinanceTestData({
      pool,
      getSupabaseClient: makeSupabaseForMode('test'),
      tenantId: TENANT,
      logger: silentLogger,
      rebuild,
    });

    assert.deepEqual(result, { deleted: 5, rebuilt: false });
  });

  test('a thrown data-mode fetch is non-fatal — rebuilt:false, delete preserved', async () => {
    const pool = makeSpyPool({ rowCount: 2 });
    const throwingSupabase = () => ({
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  in: async () => ({ data: null, error: new Error('supabase down') }),
                };
              },
            };
          },
        };
      },
    });
    const rebuild = mock.fn(async () => ({ rebuilt: [], degraded: [] }));

    const result = await clearFinanceTestData({
      pool,
      getSupabaseClient: throwingSupabase,
      tenantId: TENANT,
      logger: silentLogger,
      rebuild,
    });

    assert.equal(rebuild.mock.callCount(), 0);
    assert.deepEqual(result, { deleted: 2, rebuilt: false });
  });

  test('throws when tenantId is missing', async () => {
    const pool = makeSpyPool();
    await assert.rejects(
      () =>
        clearFinanceTestData({
          pool,
          getSupabaseClient: makeSupabaseForMode('test'),
          logger: silentLogger,
          rebuild: mock.fn(),
        }),
      /requires a tenantId/,
    );
    // The DELETE must not run without a tenant.
    assert.equal(pool.query.mock.callCount(), 0);
  });
});
