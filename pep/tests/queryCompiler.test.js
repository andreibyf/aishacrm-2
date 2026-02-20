/**
 * PEP Phase 3 — Query Compiler Tests
 *
 * Tests the query compilation path: resolveQuery + emitQuery + buildConfirmationString.
 * All tests are deterministic (no LLM calls).
 * Run with: node --test pep/tests/queryCompiler.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { resolveQuery } from '../compiler/resolver.js';
import { emitQuery, buildConfirmationString } from '../compiler/emitter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CATALOGS_DIR = join(__dirname, '..', 'catalogs');

const entityCatalog = parseYaml(readFileSync(join(CATALOGS_DIR, 'entity-catalog.yaml'), 'utf8'));

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Valid entity query resolves and emits correctly
// ─────────────────────────────────────────────────────────────────────────────
describe('Query Compiler — valid entity query', () => {
  it('resolves Lead with status=open filter', () => {
    const result = resolveQuery(
      {
        target: 'Lead',
        target_kind: 'entity',
        filters: [{ field: 'status', operator: 'eq', value: 'open' }],
        sort: { field: 'created_date', direction: 'desc' },
        limit: 50,
      },
      entityCatalog,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.target, 'Lead');
    assert.equal(result.target_kind, 'entity');
    assert.equal(result.filters.length, 1);
    assert.equal(result.filters[0].field, 'status');
    assert.equal(result.filters[0].operator, 'eq');
    assert.equal(result.sort.field, 'created_date');
    assert.equal(result.sort.direction, 'desc');
    assert.equal(result.limit, 50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Valid view query resolves
// ─────────────────────────────────────────────────────────────────────────────
describe('Query Compiler — valid view query', () => {
  it('resolves v_activity_stream with type=call filter', () => {
    const result = resolveQuery(
      {
        target: 'v_activity_stream',
        target_kind: 'view',
        filters: [{ field: 'type', operator: 'eq', value: 'call' }],
        sort: null,
        limit: null,
      },
      entityCatalog,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.target, 'v_activity_stream');
    assert.equal(result.target_kind, 'view');
    assert.equal(result.filters[0].field, 'type');
    assert.equal(result.limit, 100); // default
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Unknown entity is rejected
// ─────────────────────────────────────────────────────────────────────────────
describe('Query Compiler — unknown entity rejection', () => {
  it('returns resolved=false for unknown entity name', () => {
    const result = resolveQuery(
      { target: 'Invoice', filters: [], sort: null, limit: null },
      entityCatalog,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.reason.includes('Invoice'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Unknown field is rejected
// ─────────────────────────────────────────────────────────────────────────────
describe('Query Compiler — unknown field rejection', () => {
  it('returns resolved=false for a field that does not exist on the entity', () => {
    const result = resolveQuery(
      {
        target: 'Opportunity',
        filters: [{ field: 'banana', operator: 'eq', value: 'yes' }],
        sort: null,
        limit: null,
      },
      entityCatalog,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.reason.toLowerCase().includes('banana'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Invalid operator is rejected
// ─────────────────────────────────────────────────────────────────────────────
describe('Query Compiler — invalid operator rejection', () => {
  it('returns resolved=false for operator not in the valid set', () => {
    const result = resolveQuery(
      {
        target: 'Lead',
        filters: [{ field: 'status', operator: 'LIKE', value: 'open' }],
        sort: null,
        limit: null,
      },
      entityCatalog,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.reason.toLowerCase().includes('operator'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Employee name token passes through in filter value
// ─────────────────────────────────────────────────────────────────────────────
describe('Query Compiler — employee name token', () => {
  it('preserves {{resolve_employee: Name}} token in filter value', () => {
    const result = resolveQuery(
      {
        target: 'Lead',
        filters: [{ field: 'assigned_to', operator: 'eq', value: '{{resolve_employee: James}}' }],
        sort: null,
        limit: null,
      },
      entityCatalog,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.filters[0].value, '{{resolve_employee: James}}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Date token passes through in filter value
// ─────────────────────────────────────────────────────────────────────────────
describe('Query Compiler — date token', () => {
  it('preserves {{date: start_of_month}} token in filter value', () => {
    const result = resolveQuery(
      {
        target: 'Opportunity',
        filters: [{ field: 'close_date', operator: 'gte', value: '{{date: start_of_quarter}}' }],
        sort: null,
        limit: null,
      },
      entityCatalog,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.filters[0].value, '{{date: start_of_quarter}}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Missing target is rejected
// ─────────────────────────────────────────────────────────────────────────────
describe('Query Compiler — missing target rejection', () => {
  it('returns resolved=false when target is absent', () => {
    const result = resolveQuery(
      { filters: [{ field: 'status', operator: 'eq', value: 'open' }] },
      entityCatalog,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.reason.toLowerCase().includes('target'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: emitQuery produces correct IR shape
// ─────────────────────────────────────────────────────────────────────────────
describe('Query Compiler — emitQuery IR shape', () => {
  it('emitted braid_ir has query_entity op with correct keys', () => {
    const resolved = resolveQuery(
      {
        target: 'Contact',
        filters: [{ field: 'status', operator: 'eq', value: 'active' }],
        sort: { field: 'created_date', direction: 'asc' },
        limit: 25,
      },
      entityCatalog,
    );
    assert.equal(resolved.resolved, true);
    const { braid_ir } = emitQuery(resolved, 'show active contacts');
    const instr = braid_ir.instructions[0];
    assert.equal(instr.op, 'query_entity');
    assert.equal(instr.target, 'Contact');
    assert.equal(instr.target_kind, 'entity');
    assert.equal(instr.assign, 'results');
    assert.equal(instr.limit, 25);
    assert.equal(instr.sort.direction, 'asc');
    assert.equal(braid_ir.policy, 'READ_ONLY');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: buildConfirmationString produces readable output
// ─────────────────────────────────────────────────────────────────────────────
describe('Query Compiler — confirmation string', () => {
  it('produces a readable string describing the query', () => {
    const resolved = resolveQuery(
      {
        target: 'Opportunity',
        filters: [
          { field: 'stage', operator: 'eq', value: 'negotiation' },
          { field: 'amount', operator: 'gt', value: 50000 },
        ],
        sort: { field: 'amount', direction: 'desc' },
        limit: 100,
      },
      entityCatalog,
    );
    assert.equal(resolved.resolved, true);
    const confirmation = buildConfirmationString(resolved);
    assert.ok(confirmation.includes('Opportunity'));
    assert.ok(confirmation.includes('stage'));
    assert.ok(confirmation.includes('amount'));
    assert.ok(confirmation.includes('negotiation'));
    assert.ok(confirmation.includes('50000'));
    assert.ok(confirmation.includes('desc'));
  });
});
