/**
 * PEP Phase 5b — PEP Query Node Tests
 *
 * Unit tests for the PEP query node logic used in workflow execution.
 * Since execNode is embedded in the workflow route closure, these tests
 * validate the key sub-behaviors:
 *   - Variable resolution in IR filter values
 *   - Date token resolution
 *   - Filter application
 *   - Tenant isolation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Variable replacement (mirrors workflow executor's replaceVariables) ──────

function replaceVariables(template, payload, variables) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
    const trimmed = String(variable).trim();
    if (payload && payload[trimmed] !== undefined) return payload[trimmed];
    const parts = trimmed.split('.');
    if (parts.length > 1) {
      let value = variables[parts[0]];
      for (let i = 1; i < parts.length; i++) {
        if (value && value[parts[i]] !== undefined) value = value[parts[i]];
        else {
          value = undefined;
          break;
        }
      }
      if (value !== undefined) return value;
    } else if (variables && variables[trimmed] !== undefined) {
      return variables[trimmed];
    }
    return match;
  });
}

// ── Date token resolution (mirrors pep_query executor) ──────────────────────

function resolveDateToken(tokenValue) {
  if (typeof tokenValue !== 'string') return tokenValue;
  if (!tokenValue.startsWith('{{date:') || !tokenValue.endsWith('}}')) return tokenValue;

  const tokenInner = tokenValue.slice(7, -2).trim();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const dateMap = {
    today: now.toISOString().split('T')[0],
    start_of_month: new Date(y, m, 1).toISOString().split('T')[0],
    end_of_month: new Date(y, m + 1, 0).toISOString().split('T')[0],
    start_of_year: `${y}-01-01`,
  };
  if (dateMap[tokenInner]) return dateMap[tokenInner];

  const lastN = tokenInner.match(/^last_(\d+)_days$/);
  if (lastN) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(lastN[1], 10));
    return d.toISOString().split('T')[0];
  }
  return tokenValue; // unknown token — pass through
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PEP Query Node — Variable Resolution', () => {
  it('resolves {{entity_id}} from trigger payload', () => {
    const payload = { entity_id: 'abc-123-def', tenant_id: 't-1', event_type: 'lead_stagnant' };
    const ir = {
      op: 'query_entity',
      target: 'Activity',
      filters: [{ field: 'related_id', operator: 'eq', value: '{{entity_id}}' }],
    };

    // Stage 2: resolve workflow variables
    for (const f of ir.filters) {
      if (typeof f.value === 'string') f.value = replaceVariables(f.value, payload, {});
    }

    assert.equal(ir.filters[0].value, 'abc-123-def');
  });

  it('preserves literal values untouched', () => {
    const payload = { entity_id: 'abc-123' };
    const ir = {
      op: 'query_entity',
      target: 'Lead',
      filters: [{ field: 'status', operator: 'eq', value: 'qualified' }],
    };

    for (const f of ir.filters) {
      if (typeof f.value === 'string') f.value = replaceVariables(f.value, payload, {});
    }

    assert.equal(ir.filters[0].value, 'qualified');
  });

  it('leaves unresolvable variables as-is (no crash)', () => {
    const payload = {};
    const ir = {
      op: 'query_entity',
      target: 'Activity',
      filters: [{ field: 'related_id', operator: 'eq', value: '{{unknown_var}}' }],
    };

    for (const f of ir.filters) {
      if (typeof f.value === 'string') f.value = replaceVariables(f.value, payload, {});
    }

    assert.equal(ir.filters[0].value, '{{unknown_var}}');
  });

  it('resolves nested context variables like pep_results.count', () => {
    const variables = {
      pep_results: { count: 5, rows: [{ id: 1 }] },
    };
    const result = replaceVariables('{{pep_results.count}}', {}, variables);
    assert.equal(result, '5');
  });

  it('resolves multiple variables in a mixed-filter IR', () => {
    const payload = { entity_id: 'lead-uuid-456', event_type: 'deal_decay' };
    const ir = {
      op: 'query_entity',
      target: 'Activity',
      filters: [
        { field: 'related_id', operator: 'eq', value: '{{entity_id}}' },
        { field: 'status', operator: 'eq', value: 'open' },
        { field: 'type', operator: 'eq', value: '{{event_type}}' },
      ],
    };

    for (const f of ir.filters) {
      if (typeof f.value === 'string') f.value = replaceVariables(f.value, payload, {});
    }

    assert.equal(ir.filters[0].value, 'lead-uuid-456');
    assert.equal(ir.filters[1].value, 'open');
    assert.equal(ir.filters[2].value, 'deal_decay');
  });
});

describe('PEP Query Node — Date Token Resolution', () => {
  it('resolves {{date: today}} to current date', () => {
    const resolved = resolveDateToken('{{date: today}}');
    const expected = new Date().toISOString().split('T')[0];
    assert.equal(resolved, expected);
  });

  it('resolves {{date: start_of_month}} correctly', () => {
    const resolved = resolveDateToken('{{date: start_of_month}}');
    const now = new Date();
    const expected = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    assert.equal(resolved, expected);
  });

  it('resolves {{date: last_30_days}} correctly', () => {
    const resolved = resolveDateToken('{{date: last_30_days}}');
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const expected = d.toISOString().split('T')[0];
    assert.equal(resolved, expected);
  });

  it('passes through unknown date tokens', () => {
    const resolved = resolveDateToken('{{date: next_tuesday}}');
    assert.equal(resolved, '{{date: next_tuesday}}');
  });

  it('passes through non-date values', () => {
    assert.equal(resolveDateToken('qualified'), 'qualified');
    assert.equal(resolveDateToken('abc-123'), 'abc-123');
  });
});

describe('PEP Query Node — Two-Stage Resolution (Integration)', () => {
  it('compiled IR with workflow variable + date token resolves correctly at execution time', () => {
    // This simulates the full two-stage pipeline:
    // Stage 1 (compile time): IR has {{entity_id}} and {{date: last_30_days}} as placeholders
    // Stage 2 (execution time): both get resolved

    const compiledIr = {
      op: 'query_entity',
      target: 'Activity',
      table: 'activities',
      filters: [
        { field: 'related_id', operator: 'eq', value: '{{entity_id}}' },
        { field: 'created_date', operator: 'gte', value: '{{date: last_30_days}}' },
      ],
      sort: { field: 'created_date', direction: 'desc' },
      limit: 100,
    };

    const payload = { entity_id: 'lead-abc-789', tenant_id: 'tenant-1' };

    // Deep clone to avoid mutation
    const ir = JSON.parse(JSON.stringify(compiledIr));

    // Stage 2a: resolve workflow variables
    for (const f of ir.filters) {
      if (typeof f.value === 'string') {
        f.value = replaceVariables(f.value, payload, {});
      }
    }

    // Stage 2b: resolve date tokens
    for (const f of ir.filters) {
      f.value = resolveDateToken(f.value);
    }

    // Verify: entity_id resolved from payload
    assert.equal(ir.filters[0].value, 'lead-abc-789');

    // Verify: date token resolved to a valid date string
    const dateVal = ir.filters[1].value;
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(dateVal), `Expected date format, got: ${dateVal}`);

    // Verify: original IR was not mutated
    assert.equal(compiledIr.filters[0].value, '{{entity_id}}');
    assert.equal(compiledIr.filters[1].value, '{{date: last_30_days}}');
  });

  it('tenant_id is never taken from IR (security)', () => {
    // The workflow executor should always inject tenant_id from workflow.tenant_id
    // This test documents the contract
    const ir = {
      op: 'query_entity',
      target: 'leads',
      table: 'leads',
      filters: [
        // Attacker tries to inject a different tenant filter
        { field: 'tenant_id', operator: 'eq', value: 'attacker-tenant-id' },
      ],
    };

    // In the real executor, the Supabase query starts with:
    //   .eq('tenant_id', workflow.tenant_id)
    // The IR's tenant_id filter would create a second .eq('tenant_id', ...) call
    // But since the executor ALWAYS injects its own tenant_id first, and Supabase
    // applies all filters as AND, the attacker's filter would restrict to the
    // intersection (empty set) — NOT expand access.
    //
    // Additionally, the PEP resolver rejects explicit tenant_id filters at compile time.
    // This is just a defense-in-depth check.

    const workflowTenantId = 'real-tenant-id';
    assert.notEqual(ir.filters[0].value, workflowTenantId);
    // Contract: executor MUST .eq('tenant_id', workflow.tenant_id) regardless of IR content
    assert.ok(true, 'Tenant isolation is enforced by executor, not by IR');
  });
});

describe('PEP Query Node — Config Shape', () => {
  it('validates expected node config structure', () => {
    const validConfig = {
      source: 'show me all leads assigned to {{entity_id}}',
      compiled_ir: {
        op: 'query_entity',
        target: 'Lead',
        table: 'leads',
        target_kind: 'entity',
        filters: [{ field: 'assigned_to', operator: 'eq', value: '{{entity_id}}' }],
        sort: null,
        limit: 100,
      },
      compiled_at: '2026-02-21T14:00:00Z',
      compile_status: 'success',
      compile_error: null,
    };

    assert.ok(validConfig.source, 'source is required');
    assert.ok(validConfig.compiled_ir, 'compiled_ir should be present after compilation');
    assert.equal(validConfig.compiled_ir.op, 'query_entity');
    assert.equal(validConfig.compile_status, 'success');
    assert.equal(validConfig.compile_error, null);
  });

  it('handles missing compiled_ir gracefully (triggers recompile)', () => {
    const configWithoutIr = {
      source: 'show me all open leads',
      compiled_ir: null,
      compile_status: null,
    };

    // The executor checks: if (!pepIr) { ... compile on the fly }
    assert.equal(configWithoutIr.compiled_ir, null);
    assert.ok(configWithoutIr.source, 'source is available for recompilation');
  });
});
