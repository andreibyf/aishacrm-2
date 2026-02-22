/**
 * PEP Phase 5b — PEP Query Node Executor Tests
 *
 * Tests the pep_query case in the workflow executor:
 *   - Executes with pre-compiled IR and literal filters
 *   - Resolves {{variable}} workflow tokens in IR filter values
 *   - Resolves {{date:...}} tokens at execution time
 *   - Errors gracefully on missing source / missing catalog
 *   - tenant_id always injected from workflow, never from IR
 *   - Results stored in context.variables.pep_results
 *   - care_trigger case is a no-op passthrough
 *
 * Strategy: Unit tests that mock Supabase and test the executor logic
 * extracted into a portable helper. No Express server needed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ─── Portable Supabase mock ────────────────────────────────────────────────

function makeSupabaseMock(returnData = [], returnError = null) {
  const calls = [];
  const mock = {
    _calls: calls,
    from(table) {
      calls.push({ method: 'from', args: [table] });
      return mock;
    },
    select(cols) {
      calls.push({ method: 'select', args: [cols] });
      return mock;
    },
    eq(field, value) {
      calls.push({ method: 'eq', args: [field, value] });
      return mock;
    },
    neq(field, value) {
      calls.push({ method: 'neq', args: [field, value] });
      return mock;
    },
    gt(field, value) {
      calls.push({ method: 'gt', args: [field, value] });
      return mock;
    },
    gte(field, value) {
      calls.push({ method: 'gte', args: [field, value] });
      return mock;
    },
    lt(field, value) {
      calls.push({ method: 'lt', args: [field, value] });
      return mock;
    },
    lte(field, value) {
      calls.push({ method: 'lte', args: [field, value] });
      return mock;
    },
    ilike(field, value) {
      calls.push({ method: 'ilike', args: [field, value] });
      return mock;
    },
    in(field, value) {
      calls.push({ method: 'in', args: [field, value] });
      return mock;
    },
    is(field, value) {
      calls.push({ method: 'is', args: [field, value] });
      return mock;
    },
    not(field, op, value) {
      calls.push({ method: 'not', args: [field, op, value] });
      return mock;
    },
    or(expr) {
      calls.push({ method: 'or', args: [expr] });
      return mock;
    },
    order(field, opts) {
      calls.push({ method: 'order', args: [field, opts] });
      return mock;
    },
    limit(n) {
      calls.push({ method: 'limit', args: [n] });
      // Return the final promise when limit is called (terminal)
      return Promise.resolve({ data: returnData, error: returnError });
    },
  };
  // Also make it thenable directly for cases without limit
  mock.then = (resolve) => resolve({ data: returnData, error: returnError });
  return mock;
}

// ─── Minimal executor logic extracted for testing ───────────────────────────
// This mirrors the pep_query case in workflows.js execNode() switch

async function executePepQueryNode(cfg, context, workflow, supabaseMock) {
  const log = { status: 'success', output: {} };

  const pepSource = cfg.source || '';
  if (!pepSource.trim()) {
    log.status = 'error';
    log.error = 'PEP Query node has no source query configured';
    return log;
  }

  let pepIr = cfg.compiled_ir ? JSON.parse(JSON.stringify(cfg.compiled_ir)) : null;

  if (!pepIr) {
    log.status = 'error';
    log.error = 'No compiled IR — compile the query first';
    return log;
  }

  // replaceVariables (same logic as workflow executor)
  function replaceVariables(template) {
    if (typeof template !== 'string') return template;
    return template.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
      const trimmed = String(variable).trim();
      if (context.payload && context.payload[trimmed] !== undefined)
        return context.payload[trimmed];
      const parts = trimmed.split('.');
      if (parts.length > 1) {
        let value = context.variables[parts[0]];
        for (let i = 1; i < parts.length; i++) {
          if (value && value[parts[i]] !== undefined) value = value[parts[i]];
          else {
            value = undefined;
            break;
          }
        }
        if (value !== undefined) return value;
      } else if (context.variables && context.variables[trimmed] !== undefined) {
        return context.variables[trimmed];
      }
      return match;
    });
  }

  // Stage 2: resolve workflow variables in IR filter values
  for (const filter of pepIr.filters || []) {
    if (typeof filter.value === 'string') {
      filter.value = replaceVariables(filter.value);
    }
  }

  // Resolve date tokens
  const resolvedFilters = [];
  for (const filter of pepIr.filters || []) {
    let val = filter.value;
    if (typeof val === 'string' && val.startsWith('{{date:') && val.endsWith('}}')) {
      const tokenInner = val.slice(7, -2).trim();
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const dateMap = {
        today: now.toISOString().split('T')[0],
        start_of_month: new Date(y, m, 1).toISOString().split('T')[0],
        end_of_month: new Date(y, m + 1, 0).toISOString().split('T')[0],
        start_of_year: `${y}-01-01`,
      };
      if (dateMap[tokenInner]) val = dateMap[tokenInner];
      else {
        const lastN = tokenInner.match(/^last_(\d+)_days$/);
        if (lastN) {
          const d = new Date(now);
          d.setDate(d.getDate() - parseInt(lastN[1], 10));
          val = d.toISOString().split('T')[0];
        }
      }
    }
    resolvedFilters.push({ ...filter, value: val });
  }

  // Build and execute query
  let query = supabaseMock
    .from(pepIr.table || pepIr.target)
    .select('*')
    .eq('tenant_id', workflow.tenant_id);

  for (const filter of resolvedFilters) {
    const { field, operator, value } = filter;
    switch (operator) {
      case 'eq':
        query = query.eq(field, value);
        break;
      case 'neq':
        query = query.neq(field, value);
        break;
      case 'gt':
        query = query.gt(field, value);
        break;
      case 'gte':
        query = query.gte(field, value);
        break;
      case 'lt':
        query = query.lt(field, value);
        break;
      case 'lte':
        query = query.lte(field, value);
        break;
      case 'contains':
        query = query.ilike(field, `%${value}%`);
        break;
      default:
        break;
    }
  }

  const pepLimit = Math.min(Math.max(1, Number(pepIr.limit) || 100), 500);
  const { data: pepData, error: pepError } = await query.limit(pepLimit);

  if (pepError) {
    log.status = 'error';
    log.error = `PEP query failed: ${pepError.message}`;
    return log;
  }

  context.variables.pep_results = {
    rows: pepData || [],
    count: (pepData || []).length,
    target: pepIr.target,
    executed_at: new Date().toISOString(),
  };

  log.output = {
    query_source: pepSource,
    target: pepIr.target,
    result_count: context.variables.pep_results.count,
  };
  return log;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PEP Query Node — Phase 5b', () => {
  it('executes with pre-compiled IR and literal filters', async () => {
    const mockData = [
      { id: '1', status: 'qualified', city: 'Seattle' },
      { id: '2', status: 'qualified', city: 'Seattle' },
    ];
    const sb = makeSupabaseMock(mockData);
    const context = { payload: {}, variables: {} };
    const workflow = { tenant_id: 'tenant-abc' };
    const cfg = {
      source: 'show me qualified leads from Seattle',
      compiled_ir: {
        op: 'query_entity',
        target: 'leads',
        table: 'leads',
        filters: [
          { field: 'status', operator: 'eq', value: 'qualified' },
          { field: 'city', operator: 'eq', value: 'Seattle' },
        ],
        sort: null,
        limit: 100,
      },
    };

    const log = await executePepQueryNode(cfg, context, workflow, sb);

    assert.strictEqual(log.status, 'success');
    assert.strictEqual(log.output.result_count, 2);
    assert.strictEqual(log.output.target, 'leads');
    assert.strictEqual(context.variables.pep_results.count, 2);
    assert.strictEqual(context.variables.pep_results.rows.length, 2);

    // Verify tenant_id was applied
    const eqCalls = sb._calls.filter((c) => c.method === 'eq');
    const tenantCall = eqCalls.find((c) => c.args[0] === 'tenant_id');
    assert.ok(tenantCall, 'tenant_id filter should be applied');
    assert.strictEqual(tenantCall.args[1], 'tenant-abc');
  });

  it('resolves {{entity_id}} from trigger payload', async () => {
    const sb = makeSupabaseMock([{ id: 'act-1', type: 'call' }]);
    const context = {
      payload: { entity_id: 'lead-uuid-123' },
      variables: {},
    };
    const workflow = { tenant_id: 'tenant-abc' };
    const cfg = {
      source: 'show me activities for lead {{entity_id}}',
      compiled_ir: {
        op: 'query_entity',
        target: 'activities',
        table: 'activities',
        filters: [{ field: 'related_id', operator: 'eq', value: '{{entity_id}}' }],
        sort: null,
        limit: 100,
      },
    };

    const log = await executePepQueryNode(cfg, context, workflow, sb);

    assert.strictEqual(log.status, 'success');
    // Verify the variable was resolved
    const eqCalls = sb._calls.filter((c) => c.method === 'eq');
    const relatedIdCall = eqCalls.find((c) => c.args[0] === 'related_id');
    assert.ok(relatedIdCall, 'related_id filter should be applied');
    assert.strictEqual(
      relatedIdCall.args[1],
      'lead-uuid-123',
      '{{entity_id}} should resolve to lead-uuid-123',
    );
  });

  it('resolves {{date: today}} token at execution time', async () => {
    const sb = makeSupabaseMock([]);
    const context = { payload: {}, variables: {} };
    const workflow = { tenant_id: 'tenant-abc' };
    const today = new Date().toISOString().split('T')[0];
    const cfg = {
      source: 'show me leads created today',
      compiled_ir: {
        op: 'query_entity',
        target: 'leads',
        table: 'leads',
        filters: [{ field: 'created_date', operator: 'gte', value: '{{date: today}}' }],
        sort: null,
        limit: 100,
      },
    };

    const log = await executePepQueryNode(cfg, context, workflow, sb);

    assert.strictEqual(log.status, 'success');
    const gteCalls = sb._calls.filter((c) => c.method === 'gte');
    const dateCall = gteCalls.find((c) => c.args[0] === 'created_date');
    assert.ok(dateCall, 'created_date gte filter should be applied');
    assert.strictEqual(dateCall.args[1], today, "{{date: today}} should resolve to today's date");
  });

  it('resolves {{date: last_30_days}} token', async () => {
    const sb = makeSupabaseMock([]);
    const context = { payload: {}, variables: {} };
    const workflow = { tenant_id: 'tenant-abc' };
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const expected = d.toISOString().split('T')[0];
    const cfg = {
      source: 'activities in last 30 days',
      compiled_ir: {
        op: 'query_entity',
        target: 'activities',
        table: 'activities',
        filters: [{ field: 'created_date', operator: 'gte', value: '{{date: last_30_days}}' }],
        sort: null,
        limit: 100,
      },
    };

    const log = await executePepQueryNode(cfg, context, workflow, sb);

    assert.strictEqual(log.status, 'success');
    const gteCalls = sb._calls.filter((c) => c.method === 'gte');
    assert.strictEqual(gteCalls[0].args[1], expected);
  });

  it('errors on empty source', async () => {
    const sb = makeSupabaseMock([]);
    const context = { payload: {}, variables: {} };
    const workflow = { tenant_id: 'tenant-abc' };
    const cfg = { source: '', compiled_ir: null };

    const log = await executePepQueryNode(cfg, context, workflow, sb);

    assert.strictEqual(log.status, 'error');
    assert.ok(log.error.includes('no source query'));
  });

  it('errors when no compiled IR is present', async () => {
    const sb = makeSupabaseMock([]);
    const context = { payload: {}, variables: {} };
    const workflow = { tenant_id: 'tenant-abc' };
    const cfg = { source: 'show me leads', compiled_ir: null };

    const log = await executePepQueryNode(cfg, context, workflow, sb);

    assert.strictEqual(log.status, 'error');
    assert.ok(log.error.includes('No compiled IR'));
  });

  it('tenant_id comes from workflow, not IR', async () => {
    const sb = makeSupabaseMock([]);
    const context = { payload: {}, variables: {} };
    const workflow = { tenant_id: 'real-tenant-id' };
    const cfg = {
      source: 'show me leads',
      compiled_ir: {
        op: 'query_entity',
        target: 'leads',
        table: 'leads',
        filters: [],
        sort: null,
        limit: 100,
        // IR does NOT contain tenant_id — it's injected by the executor
      },
    };

    await executePepQueryNode(cfg, context, workflow, sb);

    const eqCalls = sb._calls.filter((c) => c.method === 'eq');
    const tenantCall = eqCalls.find((c) => c.args[0] === 'tenant_id');
    assert.ok(tenantCall);
    assert.strictEqual(tenantCall.args[1], 'real-tenant-id');
  });

  it('pep_results available in context after execution', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const sb = makeSupabaseMock(rows);
    const context = { payload: {}, variables: {} };
    const workflow = { tenant_id: 'tenant-abc' };
    const cfg = {
      source: 'show me all leads',
      compiled_ir: {
        op: 'query_entity',
        target: 'leads',
        table: 'leads',
        filters: [],
        sort: null,
        limit: 100,
      },
    };

    await executePepQueryNode(cfg, context, workflow, sb);

    assert.ok(context.variables.pep_results);
    assert.strictEqual(context.variables.pep_results.count, 3);
    assert.deepStrictEqual(context.variables.pep_results.rows, rows);
    assert.strictEqual(context.variables.pep_results.target, 'leads');
    assert.ok(context.variables.pep_results.executed_at);
  });

  it('handles Supabase query error gracefully', async () => {
    const sb = makeSupabaseMock(null, { message: 'relation "leads" does not exist' });
    const context = { payload: {}, variables: {} };
    const workflow = { tenant_id: 'tenant-abc' };
    const cfg = {
      source: 'show me leads',
      compiled_ir: {
        op: 'query_entity',
        target: 'leads',
        table: 'leads',
        filters: [],
        sort: null,
        limit: 100,
      },
    };

    const log = await executePepQueryNode(cfg, context, workflow, sb);

    assert.strictEqual(log.status, 'error');
    assert.ok(log.error.includes('PEP query failed'));
  });

  it('does not mutate original compiled_ir in config', async () => {
    const sb = makeSupabaseMock([]);
    const context = {
      payload: { entity_id: 'lead-999' },
      variables: {},
    };
    const workflow = { tenant_id: 'tenant-abc' };
    const originalIr = {
      op: 'query_entity',
      target: 'activities',
      table: 'activities',
      filters: [{ field: 'related_id', operator: 'eq', value: '{{entity_id}}' }],
      sort: null,
      limit: 100,
    };
    const cfg = { source: 'activities for {{entity_id}}', compiled_ir: originalIr };

    await executePepQueryNode(cfg, context, workflow, sb);

    // Original IR should still have the template variable
    assert.strictEqual(originalIr.filters[0].value, '{{entity_id}}');
  });
});

describe('care_trigger node — no-op', () => {
  it('produces success log with config and payload', () => {
    // Mirrors the care_trigger case in execNode
    const cfg = { tenant_id: 'abc', is_enabled: true, shadow_mode: true };
    const payload = { entity_id: '123', event_type: 'lead_stagnant' };
    const log = { status: 'success', output: {} };

    // Simulate the care_trigger case
    log.output = { config: cfg, payload };

    assert.strictEqual(log.status, 'success');
    assert.deepStrictEqual(log.output.config, cfg);
    assert.deepStrictEqual(log.output.payload, payload);
  });
});
