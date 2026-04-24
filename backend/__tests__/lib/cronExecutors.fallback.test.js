import test from 'node:test';
import assert from 'node:assert/strict';

import {
  markUsersOffline,
  cleanOldActivities,
  checkCreditExpiry,
} from '../../lib/cronExecutors.js';

/**
 * These tests verify that cron executors tolerate the new cron.js calling
 * convention introduced in commit 51363e09, which passes pgPool=null and
 * provides the supabase client via jobMetadata.supabase.
 *
 * Prior to the fix, markUsersOffline/cleanOldActivities/checkCreditExpiry
 * dereferenced pgPool unconditionally, crashing with:
 *   "Cannot read properties of null (reading 'query')"
 * every scheduled tick.
 */

function createSupabaseMock({ selectRows = [], updateRows = [], countValue = 0 } = {}) {
  const calls = {
    from: [],
    selects: [],
    updates: [],
    filters: [],
  };

  const builder = () => {
    // Track the FIRST op so that `.update().select()` resolves as an update,
    // matching Supabase semantics (select after update returns affected rows).
    const state = { primaryOp: null, isHeadCount: false };
    const chain = {
      select(cols, opts) {
        if (!state.primaryOp) state.primaryOp = 'select';
        calls.selects.push({ cols, opts });
        if (opts && opts.head && opts.count === 'exact') {
          state.isHeadCount = true;
        }
        return chain;
      },
      update(row) {
        if (!state.primaryOp) state.primaryOp = 'update';
        calls.updates.push(row);
        return chain;
      },
      eq(col, val) {
        calls.filters.push(['eq', col, val]);
        return chain;
      },
      lt(col, val) {
        calls.filters.push(['lt', col, val]);
        return chain;
      },
      gt(col, val) {
        calls.filters.push(['gt', col, val]);
        return chain;
      },
      or(expr) {
        calls.filters.push(['or', expr]);
        return chain;
      },
      then(resolve, reject) {
        if (state.isHeadCount) {
          return Promise.resolve({ count: countValue, error: null }).then(resolve, reject);
        }
        if (state.primaryOp === 'update') {
          return Promise.resolve({ data: updateRows, error: null }).then(resolve, reject);
        }
        if (state.primaryOp === 'select') {
          return Promise.resolve({ data: selectRows, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return chain;
  };

  const supabase = {
    from(table) {
      calls.from.push(table);
      return builder();
    },
  };

  return { supabase, calls };
}

test('markUsersOffline returns success when pgPool is null and supabase is in metadata', async () => {
  const { supabase, calls } = createSupabaseMock({
    selectRows: [{ id: 'u1', email: 'stale@example.com', metadata: { last_seen: '2000-01-01' } }],
  });

  const result = await markUsersOffline(null, { supabase, timeout_minutes: 5 });

  assert.equal(result.success, true, 'should succeed using supabase fallback');
  assert.ok(calls.from.includes('users'), 'should query users table');
  assert.ok(calls.from.includes('employees'), 'should query employees table');
});

test('markUsersOffline handles empty result set without error', async () => {
  const { supabase } = createSupabaseMock({ selectRows: [] });

  const result = await markUsersOffline(null, { supabase, timeout_minutes: 5 });

  assert.equal(result.success, true);
  assert.match(result.message, /Marked 0 users/);
});

test('cleanOldActivities returns success when pgPool is null and supabase is in metadata', async () => {
  const { supabase, calls } = createSupabaseMock({ countValue: 42 });

  const result = await cleanOldActivities(null, { supabase, retention_days: 365 });

  assert.equal(result.success, true, 'should succeed using supabase fallback');
  assert.ok(calls.from.includes('activity'), 'should query activity table');
  assert.equal(result.details.count, 42);
});

test('checkCreditExpiry returns success when pgPool is null and supabase is in metadata', async () => {
  const { supabase, calls } = createSupabaseMock({
    updateRows: [
      { id: 'c1', tenant_id: 't1', contact_id: null, lead_id: 'l1', credits_remaining: 0 },
      { id: 'c2', tenant_id: 't1', contact_id: 'c2', lead_id: null, credits_remaining: 0 },
    ],
  });

  const result = await checkCreditExpiry(null, { supabase });

  assert.equal(result.success, true, 'should succeed using supabase fallback');
  assert.ok(calls.from.includes('session_credits'), 'should query session_credits table');
  assert.equal(result.details.expired_count, 2);
});

test('markUsersOffline still works when a real pgPool is provided (backward compat)', async () => {
  let queryCount = 0;
  const fakePool = {
    query: async () => {
      queryCount++;
      return { rowCount: 0, rows: [] };
    },
  };

  const result = await markUsersOffline(fakePool, { timeout_minutes: 5 });

  assert.equal(result.success, true);
  assert.equal(queryCount, 2, 'should call pgPool.query for users + employees');
});
