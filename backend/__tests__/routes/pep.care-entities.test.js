/**
 * PEP Phase 5a — C.A.R.E. Entity Catalog Tests
 *
 * Validates that CareState and CareHistory entities are correctly
 * registered in the entity catalog and resolve/execute properly
 * through the query pipeline (resolver + executor mock).
 *
 * No LLM calls — tests the deterministic resolver layer only.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { resolveQuery, findQueryTarget } from '../../../pep/compiler/resolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CATALOGS_DIR = join(__dirname, '..', '..', '..', 'pep', 'catalogs');

let entityCatalog;

before(() => {
  entityCatalog = parseYaml(readFileSync(join(CATALOGS_DIR, 'entity-catalog.yaml'), 'utf8'));
});

// ─── Catalog registration ──────────────────────────────────────────────────

describe('Phase 5a — C.A.R.E. entities in catalog', () => {
  it('CareState entity is present in entity catalog', () => {
    const entities = entityCatalog.entities || [];
    const careState = entities.find((e) => e.id === 'CareState');
    assert.ok(careState, 'CareState entity not found in catalog');
  });

  it('CareHistory entity is present in entity catalog', () => {
    const entities = entityCatalog.entities || [];
    const careHistory = entities.find((e) => e.id === 'CareHistory');
    assert.ok(careHistory, 'CareHistory entity not found in catalog');
  });

  it('CareState maps to correct table', () => {
    const careState = (entityCatalog.entities || []).find((e) => e.id === 'CareState');
    assert.strictEqual(careState.aisha_binding.table, 'customer_care_state');
  });

  it('CareHistory maps to correct table', () => {
    const careHistory = (entityCatalog.entities || []).find((e) => e.id === 'CareHistory');
    assert.strictEqual(careHistory.aisha_binding.table, 'customer_care_state_history');
  });

  it('CareState has expected fields', () => {
    const careState = (entityCatalog.entities || []).find((e) => e.id === 'CareState');
    const fieldNames = careState.fields.map((f) => f.name);
    for (const expected of [
      'entity_type',
      'care_state',
      'escalation_status',
      'hands_off_enabled',
      'last_signal_at',
      'updated_at',
    ]) {
      assert.ok(fieldNames.includes(expected), `CareState missing field: ${expected}`);
    }
  });

  it('CareHistory has expected fields', () => {
    const careHistory = (entityCatalog.entities || []).find((e) => e.id === 'CareHistory');
    const fieldNames = careHistory.fields.map((f) => f.name);
    for (const expected of [
      'entity_type',
      'from_state',
      'to_state',
      'event_type',
      'reason',
      'actor_type',
      'created_at',
    ]) {
      assert.ok(fieldNames.includes(expected), `CareHistory missing field: ${expected}`);
    }
  });
});

// ─── findQueryTarget ───────────────────────────────────────────────────────

describe('Phase 5a — findQueryTarget resolves C.A.R.E. entities', () => {
  it('finds CareState by id (exact)', () => {
    const result = findQueryTarget('CareState', entityCatalog);
    assert.ok(result, 'CareState not found');
    assert.strictEqual(result.kind, 'entity');
    assert.strictEqual(result.target.id, 'CareState');
  });

  it('finds CareHistory by id (exact)', () => {
    const result = findQueryTarget('CareHistory', entityCatalog);
    assert.ok(result, 'CareHistory not found');
    assert.strictEqual(result.kind, 'entity');
    assert.strictEqual(result.target.id, 'CareHistory');
  });

  it('finds CareState by table name', () => {
    const result = findQueryTarget('customer_care_state', entityCatalog);
    assert.ok(result, 'customer_care_state not found by table name');
    assert.strictEqual(result.target.id, 'CareState');
  });

  it('finds CareHistory by table name', () => {
    const result = findQueryTarget('customer_care_state_history', entityCatalog);
    assert.ok(result, 'customer_care_state_history not found by table name');
    assert.strictEqual(result.target.id, 'CareHistory');
  });

  it('is case-insensitive for CareState', () => {
    const result = findQueryTarget('carestate', entityCatalog);
    assert.ok(result, 'carestate (lowercase) not found');
    assert.strictEqual(result.target.id, 'CareState');
  });
});

// ─── resolveQuery ─────────────────────────────────────────────────────────

describe('Phase 5a — resolveQuery for C.A.R.E. entities', () => {
  it('resolves CareState query with care_state filter', () => {
    const frame = {
      target: 'CareState',
      target_kind: 'entity',
      filters: [{ field: 'care_state', operator: 'eq', value: 'at_risk' }],
      sort: null,
      limit: 50,
    };
    const result = resolveQuery(frame, entityCatalog);
    assert.strictEqual(result.resolved, true, result.reason);
    assert.strictEqual(result.table, 'customer_care_state');
    assert.strictEqual(result.target, 'CareState');
    assert.strictEqual(result.filters[0].field, 'care_state');
    assert.strictEqual(result.filters[0].value, 'at_risk');
  });

  it('resolves CareState query with entity_type + escalation_status filters', () => {
    const frame = {
      target: 'CareState',
      target_kind: 'entity',
      filters: [
        { field: 'entity_type', operator: 'eq', value: 'lead' },
        { field: 'escalation_status', operator: 'eq', value: 'open' },
      ],
      sort: { field: 'updated_at', direction: 'desc' },
      limit: 100,
    };
    const result = resolveQuery(frame, entityCatalog);
    assert.strictEqual(result.resolved, true, result.reason);
    assert.strictEqual(result.filters.length, 2);
  });

  it('resolves CareHistory query with event_type filter', () => {
    const frame = {
      target: 'CareHistory',
      target_kind: 'entity',
      filters: [{ field: 'event_type', operator: 'eq', value: 'state_applied' }],
      sort: { field: 'created_at', direction: 'desc' },
      limit: 25,
    };
    const result = resolveQuery(frame, entityCatalog);
    assert.strictEqual(result.resolved, true, result.reason);
    assert.strictEqual(result.table, 'customer_care_state_history');
  });

  it('resolves CareHistory with from_state and to_state filters', () => {
    const frame = {
      target: 'CareHistory',
      target_kind: 'entity',
      filters: [
        { field: 'from_state', operator: 'eq', value: 'engaged' },
        { field: 'to_state', operator: 'eq', value: 'at_risk' },
      ],
      sort: null,
      limit: null,
    };
    const result = resolveQuery(frame, entityCatalog);
    assert.strictEqual(result.resolved, true, result.reason);
    assert.strictEqual(result.filters.length, 2);
  });

  it('rejects filter on non-existent field for CareState', () => {
    const frame = {
      target: 'CareState',
      target_kind: 'entity',
      filters: [{ field: 'nonexistent_field', operator: 'eq', value: 'foo' }],
      sort: null,
      limit: null,
    };
    const result = resolveQuery(frame, entityCatalog);
    assert.strictEqual(result.resolved, false);
    assert.ok(
      result.reason.includes('nonexistent_field'),
      `Expected field error, got: ${result.reason}`,
    );
  });

  it('rejects tenant_id filter on CareState (tenant isolation is automatic)', () => {
    const frame = {
      target: 'CareState',
      target_kind: 'entity',
      filters: [{ field: 'tenant_id', operator: 'eq', value: 'some-tenant' }],
      sort: null,
      limit: null,
    };
    const result = resolveQuery(frame, entityCatalog);
    assert.strictEqual(result.resolved, false);
    assert.ok(result.reason.includes('tenant_id'));
  });

  it('resolves CareState with is_null operator on escalation_status', () => {
    const frame = {
      target: 'CareState',
      target_kind: 'entity',
      filters: [{ field: 'escalation_status', operator: 'is_null', value: null }],
      sort: null,
      limit: null,
    };
    const result = resolveQuery(frame, entityCatalog);
    assert.strictEqual(result.resolved, true, result.reason);
  });

  it('emits correct table name in resolved output for /query executor', () => {
    const frame = {
      target: 'CareState',
      target_kind: 'entity',
      filters: [{ field: 'care_state', operator: 'in', value: ['dormant', 'lost'] }],
      sort: null,
      limit: 200,
    };
    const result = resolveQuery(frame, entityCatalog);
    assert.strictEqual(result.resolved, true);
    // The /query executor uses result.table to query Supabase directly
    assert.strictEqual(result.table, 'customer_care_state');
    // Limit should be clamped to 200
    assert.strictEqual(result.limit, 200);
  });
});

// ─── Capability catalog ────────────────────────────────────────────────────

describe('Phase 5a — capability catalog includes C.A.R.E. entities', () => {
  it('query_entity capability includes CareState binding', () => {
    const capCatalog = parseYaml(
      readFileSync(join(CATALOGS_DIR, 'capability-catalog.yaml'), 'utf8'),
    );
    const queryEntity = (capCatalog.capabilities || []).find((c) => c.id === 'query_entity');
    assert.ok(queryEntity, 'query_entity capability not found');
    assert.ok(queryEntity.bindings.CareState, 'CareState binding missing from query_entity');
    assert.ok(queryEntity.bindings.CareHistory, 'CareHistory binding missing from query_entity');
  });

  it('CareState and CareHistory bindings point to /api/pep/query', () => {
    const capCatalog = parseYaml(
      readFileSync(join(CATALOGS_DIR, 'capability-catalog.yaml'), 'utf8'),
    );
    const queryEntity = (capCatalog.capabilities || []).find((c) => c.id === 'query_entity');
    assert.strictEqual(queryEntity.bindings.CareState.http, 'POST /api/pep/query');
    assert.strictEqual(queryEntity.bindings.CareHistory.http, 'POST /api/pep/query');
  });
});
