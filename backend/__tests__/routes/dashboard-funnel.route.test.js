/**
 * Dashboard Funnel Route Tests
 *
 * Regression coverage for the failure mode where the materialized view
 * `dashboard_funnel_counts` exists but has not been populated, which
 * previously returned HTTP 500.
 *
 * The route is now expected to fall back to live aggregation and respond 200.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isViewUnusableError,
  computeLiveFunnelCounts,
} from '../../routes/dashboard-funnel.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSupabaseStub({ tables = {}, opportunities = [] } = {}) {
  // Replicates the chunk of Supabase JS the route actually uses:
  //   from(table).select(...).eq(...).in?(...).or?(...)
  function makeBuilder(table) {
    const state = { filters: [] };

    const builder = {
      _state: state,
      _table: table,
      select(_cols, opts = {}) {
        state.head = !!opts.head;
        state.countExact = opts.count === 'exact';
        if (state.head) {
          // count-only: return a thenable that resolves once filters are applied
          return builder;
        }
        return builder;
      },
      eq(col, val) {
        state.filters.push({ col, val });
        return builder;
      },
      in(col, vals) {
        state.filters.push({ col, op: 'in', val: vals });
        return builder;
      },
      or(_expr) {
        state.realOnly = true;
        return builder;
      },
      single() {
        state.single = true;
        return builder;
      },
      then(resolve) {
        const rows = (tables[table] || []).filter((row) =>
          state.filters.every((f) => {
            if (f.op === 'in') return f.val.includes(row[f.col]);
            return row[f.col] === f.val;
          }),
        );

        let filtered = rows;
        if (state.realOnly) {
          filtered = rows.filter((r) => r.is_test_data === false || r.is_test_data == null);
        }

        if (state.head && state.countExact) {
          return resolve({ count: filtered.length, error: null });
        }
        if (state.single) {
          return resolve({ data: filtered[0] || null, error: null });
        }
        return resolve({ data: filtered, error: null });
      },
    };
    return builder;
  }

  // opportunities table needs select('stage,amount,is_test_data') which goes the non-head path
  if (opportunities.length && !tables.opportunities) {
    tables.opportunities = opportunities;
  }

  return {
    from(table) {
      return makeBuilder(table);
    },
  };
}

// ─── isViewUnusableError ─────────────────────────────────────────────────────

describe('isViewUnusableError', () => {
  it('matches "has not been populated" message', () => {
    const err = {
      code: '55000',
      message: 'materialized view "dashboard_funnel_counts" has not been populated',
    };
    assert.equal(isViewUnusableError(err), true);
  });

  it('matches "does not exist" message', () => {
    const err = { code: '42P01', message: 'relation "dashboard_funnel_counts" does not exist' };
    assert.equal(isViewUnusableError(err), true);
  });

  it('matches PGRST116 (no rows)', () => {
    assert.equal(isViewUnusableError({ code: 'PGRST116', message: 'no rows' }), true);
  });

  it('matches 42P01 by code even with empty message', () => {
    assert.equal(isViewUnusableError({ code: '42P01', message: '' }), true);
  });

  it('matches 55000 by code', () => {
    assert.equal(isViewUnusableError({ code: '55000' }), true);
  });

  it('matches PostgREST "could not find the table" message', () => {
    const err = {
      message: "Could not find the table 'public.dashboard_funnel_counts' in the schema cache",
    };
    assert.equal(isViewUnusableError(err), true);
  });

  it('matches PGRST205 by code', () => {
    assert.equal(isViewUnusableError({ code: 'PGRST205' }), true);
  });

  it('does NOT match unrelated errors', () => {
    assert.equal(isViewUnusableError({ code: '42501', message: 'permission denied' }), false);
    assert.equal(isViewUnusableError(null), false);
    assert.equal(isViewUnusableError(undefined), false);
  });

  it('is case-insensitive on the message check', () => {
    assert.equal(
      isViewUnusableError({ message: 'Materialized View HAS NOT BEEN POPULATED' }),
      true,
    );
  });
});

// ─── computeLiveFunnelCounts ─────────────────────────────────────────────────

describe('computeLiveFunnelCounts', () => {
  const tenantId = '759a83e8-7340-4482-a586-cd2d049fb0b5';

  it('returns suffixed totals/real/test split across all entities', async () => {
    const supabase = makeSupabaseStub({
      tables: {
        bizdev_sources: [
          { id: 's1', tenant_id: tenantId, is_test_data: false },
          { id: 's2', tenant_id: tenantId, is_test_data: false },
          { id: 's3', tenant_id: tenantId, is_test_data: true },
          { id: 's4', tenant_id: tenantId, is_test_data: null },
        ],
        leads: [
          { id: 'l1', tenant_id: tenantId, is_test_data: false },
          { id: 'l2', tenant_id: tenantId, is_test_data: true },
        ],
        contacts: [{ id: 'c1', tenant_id: tenantId, is_test_data: false }],
        accounts: [],
        opportunities: [
          { stage: 'prospecting', amount: '100', is_test_data: false, tenant_id: tenantId },
          { stage: 'prospecting', amount: '50', is_test_data: true, tenant_id: tenantId },
          { stage: 'won', amount: '500', is_test_data: false, tenant_id: tenantId }, // alias → closed_won
          { stage: 'closed_lost', amount: '25', is_test_data: false, tenant_id: tenantId },
        ],
      },
    });

    const result = await computeLiveFunnelCounts({ supabase, tenantId });

    assert.equal(result.funnel.sources_total, 4);
    assert.equal(result.funnel.sources_real, 3); // false + null counted as real
    assert.equal(result.funnel.sources_test, 1);
    assert.equal(result.funnel.leads_total, 2);
    assert.equal(result.funnel.leads_real, 1);
    assert.equal(result.funnel.leads_test, 1);
    assert.equal(result.funnel.contacts_total, 1);
    assert.equal(result.funnel.accounts_total, 0);

    const stages = Object.fromEntries(result.pipeline.map((p) => [p.stage, p]));
    assert.equal(stages.prospecting.count_total, 2);
    assert.equal(stages.prospecting.count_real, 1);
    assert.equal(stages.prospecting.value_total, 150);
    assert.equal(stages.prospecting.value_real, 100);
    // 'won' alias collapses into closed_won
    assert.equal(stages.closed_won.count_total, 1);
    assert.equal(stages.closed_won.value_total, 500);
    assert.equal(stages.closed_lost.count_total, 1);
    assert.equal(stages.closed_lost.value_total, 25);
    // unrepresented stages still appear with zeros
    assert.equal(stages.qualification.count_total, 0);
    assert.equal(stages.qualification.value_total, 0);

    assert.equal(result.cached, false);
    assert.ok(result.last_refreshed);
  });

  it('returns all zeros for a tenant with no data', async () => {
    const supabase = makeSupabaseStub({
      tables: {
        bizdev_sources: [],
        leads: [],
        contacts: [],
        accounts: [],
        opportunities: [],
      },
    });

    const result = await computeLiveFunnelCounts({
      supabase,
      tenantId: '00000000-0000-0000-0000-000000000000',
    });

    assert.equal(result.funnel.sources_total, 0);
    assert.equal(result.funnel.leads_total, 0);
    assert.equal(result.funnel.contacts_total, 0);
    assert.equal(result.funnel.accounts_total, 0);
    assert.equal(result.pipeline.length, 6);
    for (const stage of result.pipeline) {
      assert.equal(stage.count_total, 0);
      assert.equal(stage.value_total, 0);
    }
  });

  it('honours scopeEmployeeIds via the .in filter', async () => {
    const supabase = makeSupabaseStub({
      tables: {
        bizdev_sources: [
          { id: 's1', tenant_id: tenantId, assigned_to: 'emp-a', is_test_data: false },
          { id: 's2', tenant_id: tenantId, assigned_to: 'emp-b', is_test_data: false },
        ],
        leads: [],
        contacts: [],
        accounts: [],
        opportunities: [],
      },
    });

    const result = await computeLiveFunnelCounts({
      supabase,
      tenantId,
      scopeEmployeeIds: ['emp-a'],
    });

    assert.equal(result.funnel.sources_total, 1);
    assert.equal(result.funnel.sources_real, 1);
  });

  it('isolates by tenant_id', async () => {
    const supabase = makeSupabaseStub({
      tables: {
        bizdev_sources: [
          { id: 's1', tenant_id: tenantId, is_test_data: false },
          { id: 's2', tenant_id: 'other-tenant', is_test_data: false },
        ],
        leads: [],
        contacts: [],
        accounts: [],
        opportunities: [],
      },
    });

    const result = await computeLiveFunnelCounts({ supabase, tenantId });
    assert.equal(result.funnel.sources_total, 1);
  });
});
