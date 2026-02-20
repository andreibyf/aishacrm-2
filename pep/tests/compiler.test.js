/**
 * PEP Compiler Tests
 *
 * Tests for parser, resolver, emitter, compiler, and runtime validation.
 * All compiler code is deterministic — no LLM mocking needed.
 *
 * Test runner: Node.js native test runner (matches backend pattern)
 * Run: node --test pep/tests/compiler.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { parse } from '../compiler/parser.js';
import {
  resolve,
  resolveEntity,
  resolveCapability,
  resolveNotifyRole,
  resolveTimeExpressions,
  resolveSingleDuration,
} from '../compiler/resolver.js';
import { emitBraidIR, emitPlan, emitAudit } from '../compiler/emitter.js';
import { compile } from '../compiler/index.js';
import { validateCompiledProgram } from '../runtime/pepRuntime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const entityCatalog = parseYaml(
  readFileSync(join(__dirname, '..', 'catalogs', 'entity-catalog.yaml'), 'utf8'),
);
const capabilityCatalog = parseYaml(
  readFileSync(join(__dirname, '..', 'catalogs', 'capability-catalog.yaml'), 'utf8'),
);

const FIRST_PROGRAM = `When a cash flow transaction is marked as recurring,
automatically create the next transaction based on the recurrence pattern.
If creation fails, notify the owner.`;

// ---------------------------------------------------------------------------
// Test 1: Parse the first PEP program source
// ---------------------------------------------------------------------------
describe('PEP Parser', () => {
  it('Test 1: parses the first PEP program source with trigger, action, fallback', () => {
    const result = parse(FIRST_PROGRAM);
    assert.equal(result.match, true, 'Should match');
    assert.ok(result.trigger, 'Should have trigger');
    assert.ok(result.action, 'Should have action');
    assert.ok(result.fallback, 'Should have fallback');
    assert.ok(
      result.trigger.entity_ref.includes('cash flow'),
      'Trigger entity should reference cash flow',
    );
    assert.ok(
      result.trigger.state_change.includes('recurring'),
      'Trigger state should reference recurring',
    );
    assert.ok(result.action.capability_ref.includes('create'), 'Action should reference create');
    assert.equal(result.fallback.role_ref, 'owner', 'Fallback role should be owner');
  });

  // ---------------------------------------------------------------------------
  // Test 2: Parse unrecognized English
  // ---------------------------------------------------------------------------
  it('Test 2: returns { match: false } for unrecognized English', () => {
    const result = parse('Make it so');
    assert.equal(result.match, false, 'Should not match');
    assert.ok(result.reason, 'Should have a reason');
    assert.ok(result.reason.length > 0, 'Reason should not be empty');
  });
});

// ---------------------------------------------------------------------------
// RESOLVER TESTS
// ---------------------------------------------------------------------------
describe('PEP Resolver', () => {
  // ---------------------------------------------------------------------------
  // Test 3: Resolve "cash flow transaction" against entity catalog
  // ---------------------------------------------------------------------------
  it('Test 3: resolves "cash flow transaction" to CashFlowTransaction', () => {
    const result = resolveEntity('cash flow transaction', entityCatalog);
    assert.equal(result.resolved, true);
    assert.equal(result.entity.id, 'CashFlowTransaction');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Resolve "invoice" against entity catalog — clarification_required
  // ---------------------------------------------------------------------------
  it('Test 4: returns clarification_required for "invoice" with suggestion', () => {
    const result = resolveEntity('invoice', entityCatalog);
    assert.equal(result.resolved, false);
    assert.ok(result.reason.includes('invoice'), 'Reason should mention the unresolved entity');
    assert.ok(result.suggestion, 'Should suggest an alternative');
  });

  // ---------------------------------------------------------------------------
  // Test 5: Resolve "recurring" recurrence pattern — returns all 4 patterns
  // ---------------------------------------------------------------------------
  it('Test 5: resolves "recurring" recurrence pattern to all 4 duration options', () => {
    const result = resolveTimeExpressions('recurrence pattern', capabilityCatalog);
    assert.equal(result.resolved, true);
    assert.ok(result.patterns, 'Should have patterns');
    const patternKeys = Object.keys(result.patterns);
    assert.ok(patternKeys.includes('weekly'), 'Should include weekly');
    assert.ok(patternKeys.includes('monthly'), 'Should include monthly');
    assert.ok(patternKeys.includes('quarterly'), 'Should include quarterly');
    assert.ok(patternKeys.includes('annually'), 'Should include annually');
  });

  // ---------------------------------------------------------------------------
  // Test 6: Resolve "monthly" to ISO-8601 duration P1M
  // ---------------------------------------------------------------------------
  it('Test 6: resolves "monthly" to ISO-8601 duration P1M', () => {
    const result = resolveSingleDuration('monthly', capabilityCatalog);
    assert.equal(result, 'P1M');
  });

  // ---------------------------------------------------------------------------
  // Test 7: Resolve "create the next transaction" against capability catalog
  // ---------------------------------------------------------------------------
  it('Test 7: resolves "create the next transaction" to persist_entity.create', () => {
    const result = resolveCapability(
      'create the next transaction',
      'CashFlowTransaction',
      capabilityCatalog,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.capability.id, 'persist_entity');
    assert.equal(result.operation, 'create');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Resolve "notify the owner" against capability catalog
  // ---------------------------------------------------------------------------
  it('Test 8: resolves "notify the owner" to notify_role.owner', () => {
    const result = resolveNotifyRole('owner', capabilityCatalog);
    assert.equal(result.resolved, true);
    assert.equal(result.capability.id, 'notify_role');
    assert.equal(result.target, 'owner');
  });
});

// ---------------------------------------------------------------------------
// COMPILER END-TO-END TESTS
// ---------------------------------------------------------------------------
describe('PEP Compiler', () => {
  // ---------------------------------------------------------------------------
  // Test 9: Full compile of first PEP program
  // ---------------------------------------------------------------------------
  it('Test 9: full compile returns { status: "compiled" } with all four artifacts', async () => {
    const result = await compile(FIRST_PROGRAM, {
      entity_catalog: entityCatalog,
      capability_catalog: capabilityCatalog,
      useLegacyParser: true,
    });
    assert.equal(result.status, 'compiled');
    assert.ok(result.semantic_frame, 'Should have semantic_frame');
    assert.ok(result.braid_ir, 'Should have braid_ir');
    assert.ok(result.plan, 'Should have plan');
    assert.ok(result.audit, 'Should have audit');
  });

  // ---------------------------------------------------------------------------
  // Test 10: Compile with missing capability — clarification_required
  // ---------------------------------------------------------------------------
  it('Test 10: compile with "send an invoice" returns clarification_required — never throws', async () => {
    const badSource = `When a cash flow transaction is marked as recurring,
automatically send an invoice based on the recurrence pattern.
If creation fails, notify the owner.`;
    const result = await compile(badSource, {
      entity_catalog: entityCatalog,
      capability_catalog: capabilityCatalog,
      useLegacyParser: true,
    });
    assert.equal(result.status, 'clarification_required');
    assert.ok(result.reason, 'Should have a reason');
    // Must never throw
    assert.ok(true, 'Did not throw');
  });
});

// ---------------------------------------------------------------------------
// RUNTIME VALIDATION TESTS
// ---------------------------------------------------------------------------
describe('PEP Runtime Validation', () => {
  // ---------------------------------------------------------------------------
  // Test 11: validateCompiledProgram on valid compiled output
  // ---------------------------------------------------------------------------
  it('Test 11: validateCompiledProgram returns { valid: true } for compiled cashflow', async () => {
    const compiled = await compile(FIRST_PROGRAM, {
      entity_catalog: entityCatalog,
      capability_catalog: capabilityCatalog,
      useLegacyParser: true,
    });
    const validation = validateCompiledProgram(compiled);
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.errors, []);
  });

  // ---------------------------------------------------------------------------
  // Test 12: validateCompiledProgram on malformed object
  // ---------------------------------------------------------------------------
  it('Test 12: validateCompiledProgram returns { valid: false } for malformed object', () => {
    const malformed = { status: 'broken', oops: true };
    const validation = validateCompiledProgram(malformed);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.length > 0, 'Should have errors');
  });
});

// ---------------------------------------------------------------------------
// EMITTER TESTS
// ---------------------------------------------------------------------------
describe('PEP Emitter', () => {
  // Helper: get a resolved pattern for emitter tests
  function getResolved() {
    const parsed = parse(FIRST_PROGRAM);
    return resolve(parsed, entityCatalog, capabilityCatalog);
  }

  // ---------------------------------------------------------------------------
  // Test 13: Emitter produces braid_ir with at least one instruction node
  // ---------------------------------------------------------------------------
  it('Test 13: braid_ir has at least one instruction node', () => {
    const resolved = getResolved();
    const ir = emitBraidIR(resolved);
    assert.ok(Array.isArray(ir.instructions), 'instructions should be an array');
    assert.ok(ir.instructions.length >= 1, 'Should have at least 1 instruction');
  });

  // ---------------------------------------------------------------------------
  // Test 14: Emitter produces audit with risk_flags and cost_estimate
  // ---------------------------------------------------------------------------
  it('Test 14: audit has risk_flags and cost_estimate keys', () => {
    const resolved = getResolved();
    const audit = emitAudit(resolved, FIRST_PROGRAM);
    assert.ok(audit.risk_flags, 'Should have risk_flags');
    assert.ok(audit.cost_estimate, 'Should have cost_estimate');
    assert.ok(Array.isArray(audit.risk_flags), 'risk_flags should be an array');
    assert.ok(typeof audit.cost_estimate === 'object', 'cost_estimate should be an object');
  });

  // ---------------------------------------------------------------------------
  // Test 15: Emitter produces plan with steps array (at least 2 steps)
  // ---------------------------------------------------------------------------
  it('Test 15: plan has steps array with at least 2 steps', () => {
    const resolved = getResolved();
    const plan = emitPlan(resolved);
    assert.ok(Array.isArray(plan.steps), 'steps should be an array');
    assert.ok(plan.steps.length >= 2, `Should have at least 2 steps, got ${plan.steps.length}`);
  });
});
