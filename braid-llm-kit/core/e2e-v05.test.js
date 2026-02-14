// e2e-v05.test.js — End-to-end: parse → transpile → validate
// Also tests the IR pipeline: parse → lower → emitJS / emitPython
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { parse } from './braid-parse.js';
import { transpileToJS } from './braid-transpile.js';
import { lower, printIR, extractSignatures } from './braid-ir.js';
import { emitJS } from './braid-emit-js.js';
import { emitPython } from './braid-emit-py.js';

const source = fs.readFileSync(new URL('./e2e-v05.braid', import.meta.url), 'utf8');

describe('E2E: Parse v0.5 features', () => {
  let ast;

  it('parses without errors', () => {
    ast = parse(source, 'e2e-v05.braid');
    assert.ok(ast, 'AST should exist');
    assert.ok(ast.items.length > 0, 'Should have declarations');
    // Check no parse errors in diagnostics
    const errors = (ast.diagnostics || []).filter(d => d.severity === 'error');
    assert.equal(errors.length, 0, `Parse errors: ${errors.map(e => e.message).join(', ')}`);
  });

  it('finds all 4 functions', () => {
    ast = ast || parse(source, 'e2e-v05.braid');
    const fns = ast.items.filter(i => i.type === 'FnDecl');
    const names = fns.map(f => f.name);
    assert.ok(names.includes('searchLeadsAdvanced'), 'Missing searchLeadsAdvanced');
    assert.ok(names.includes('getLeadNames'), 'Missing getLeadNames');
    assert.ok(names.includes('batchUpdateLeads'), 'Missing batchUpdateLeads');
    assert.ok(names.includes('buildSearchPayload'), 'Missing buildSearchPayload');
  });

  it('parses @policy annotations', () => {
    ast = ast || parse(source, 'e2e-v05.braid');
    const fns = ast.items.filter(i => i.type === 'FnDecl');
    const readOnly = fns.filter(f => f.annotations?.some(a => a.name === 'policy' && a.args.includes('READ_ONLY')));
    const write = fns.filter(f => f.annotations?.some(a => a.name === 'policy' && a.args.includes('WRITE_OPERATIONS')));
    assert.equal(readOnly.length, 2, 'Should have 2 READ_ONLY functions');
    assert.equal(write.length, 1, 'Should have 1 WRITE_OPERATIONS function');
  });

  it('parses effects correctly', () => {
    ast = ast || parse(source, 'e2e-v05.braid');
    const search = ast.items.find(i => i.name === 'searchLeadsAdvanced');
    assert.deepEqual(search.effects, ['net']);
    const pure = ast.items.find(i => i.name === 'buildSearchPayload');
    assert.deepEqual(pure.effects, []);
  });

  it('parses for..in loops', () => {
    ast = ast || parse(source, 'e2e-v05.braid');
    const search = ast.items.find(i => i.name === 'searchLeadsAdvanced');
    const hasFor = JSON.stringify(search).includes('"ForStmt"');
    assert.ok(hasFor, 'searchLeadsAdvanced should contain ForStmt');
  });

  it('parses while loops', () => {
    ast = ast || parse(source, 'e2e-v05.braid');
    const batch = ast.items.find(i => i.name === 'batchUpdateLeads');
    const hasWhile = JSON.stringify(batch).includes('"WhileStmt"');
    assert.ok(hasWhile, 'batchUpdateLeads should contain WhileStmt');
  });

  it('parses template strings', () => {
    ast = ast || parse(source, 'e2e-v05.braid');
    const hasTemplate = JSON.stringify(ast).includes('"TemplateLit"');
    assert.ok(hasTemplate, 'Should contain TemplateLit nodes');
  });

  it('parses optional chaining', () => {
    ast = ast || parse(source, 'e2e-v05.braid');
    const hasOptional = JSON.stringify(ast).includes('"OptionalMemberExpr"');
    assert.ok(hasOptional, 'Should contain OptionalMemberExpr nodes');
  });

  it('parses pipe operator', () => {
    ast = ast || parse(source, 'e2e-v05.braid');
    const hasPipe = JSON.stringify(ast).includes('"PipeExpr"');
    assert.ok(hasPipe, 'Should contain PipeExpr nodes');
  });

  it('parses spread in arrays and objects', () => {
    ast = ast || parse(source, 'e2e-v05.braid');
    const hasSpread = JSON.stringify(ast).includes('"SpreadExpr"') || JSON.stringify(ast).includes('"SpreadProp"');
    assert.ok(hasSpread, 'Should contain spread nodes');
  });

  it('parses null literal', () => {
    ast = ast || parse(source, 'e2e-v05.braid');
    const hasNull = JSON.stringify(ast).includes('"NullLit"');
    assert.ok(hasNull, 'Should contain NullLit nodes');
  });
});

describe('E2E: Direct transpile (AST → JS)', () => {
  it('transpiles without errors', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const { code, diagnostics } = transpileToJS(ast, { source: 'e2e-v05.braid', sandbox: true });
    
    const errors = (diagnostics || []).filter(d => d.severity === 'error');
    assert.equal(errors.length, 0, `Transpile errors: ${errors.map(e => `${e.code}: ${e.message}`).join(', ')}`);
    assert.ok(code.length > 0, 'Should produce code');
  });

  it('emits async for effectful functions', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const { code } = transpileToJS(ast, { source: 'e2e-v05.braid' });
    assert.ok(code.includes('async function searchLeadsAdvanced'), 'searchLeadsAdvanced should be async');
    assert.ok(code.includes('async function batchUpdateLeads'), 'batchUpdateLeads should be async');
  });

  it('emits non-async for pure functions', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const { code } = transpileToJS(ast, { source: 'e2e-v05.braid' });
    // buildSearchPayload should NOT be async
    assert.ok(code.includes('function buildSearchPayload'), 'buildSearchPayload should exist');
    assert.ok(!code.includes('async function buildSearchPayload'), 'buildSearchPayload should NOT be async');
  });

  it('emits for..of loops', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const { code } = transpileToJS(ast, { source: 'e2e-v05.braid' });
    assert.ok(code.includes('for (const lead of'), 'Should emit for..of');
  });

  it('emits while loops', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const { code } = transpileToJS(ast, { source: 'e2e-v05.braid' });
    assert.ok(code.includes('while ('), 'Should emit while');
  });

  it('emits template literals', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const { code } = transpileToJS(ast, { source: 'e2e-v05.braid' });
    assert.ok(code.includes('`'), 'Should emit template literals');
  });

  it('emits optional chaining', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const { code } = transpileToJS(ast, { source: 'e2e-v05.braid' });
    assert.ok(code.includes('?.'), 'Should emit optional chaining');
  });

  it('emits spread', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const { code } = transpileToJS(ast, { source: 'e2e-v05.braid' });
    assert.ok(code.includes('...'), 'Should emit spread operator');
  });

  it('sandbox mode emits guardGlobal/safeGet', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const { code } = transpileToJS(ast, { source: 'e2e-v05.braid', sandbox: true });
    assert.ok(code.includes('safeGet') || code.includes('guardGlobal') || code.includes('braid-sandbox'),
      'Sandbox mode should import sandbox guards');
  });

  it('emits checkType for typed params', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const { code } = transpileToJS(ast, { source: 'e2e-v05.braid' });
    assert.ok(code.includes('checkType('), 'Should emit type checks');
  });
});

describe('E2E: IR pipeline (AST → IR → JS)', () => {
  it('lowers to IR without errors', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const ir = lower(ast);
    assert.ok(ir.decls.length > 0, 'Should have declarations');
    assert.equal(ir.diagnostics.length, 0, 'Should have no diagnostics');
  });

  it('IR has all 4 functions', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const ir = lower(ast);
    const sigs = extractSignatures(ir);
    assert.ok(sigs.searchLeadsAdvanced, 'Missing searchLeadsAdvanced');
    assert.ok(sigs.getLeadNames, 'Missing getLeadNames');
    assert.ok(sigs.batchUpdateLeads, 'Missing batchUpdateLeads');
    assert.ok(sigs.buildSearchPayload, 'Missing buildSearchPayload');
  });

  it('IR preserves effects', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const ir = lower(ast);
    const sigs = extractSignatures(ir);
    assert.deepEqual(sigs.searchLeadsAdvanced.effects, ['net']);
    assert.deepEqual(sigs.buildSearchPayload.effects, []);
  });

  it('IR preserves annotations', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const ir = lower(ast);
    const sigs = extractSignatures(ir);
    assert.equal(sigs.searchLeadsAdvanced.annotations[0].name, 'policy');
    assert.deepEqual(sigs.searchLeadsAdvanced.annotations[0].args, ['READ_ONLY']);
  });

  it('printIR produces readable output', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const ir = lower(ast);
    const printed = printIR(ir);
    assert.ok(printed.includes('fn searchLeadsAdvanced'), 'Should show function name');
    assert.ok(printed.includes('fn buildSearchPayload'), 'Should show pure function');
  });

  it('emits JS from IR', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const ir = lower(ast);
    const { code } = emitJS(ir);
    assert.ok(code.includes('function searchLeadsAdvanced'), 'Should emit JS functions');
    assert.ok(code.includes('checkType'), 'Should emit type checks');
  });

  it('emits Python from IR', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const ir = lower(ast);
    const { code } = emitPython(ir);
    assert.ok(code.includes('def searchLeadsAdvanced'), 'Should emit Python functions');
    assert.ok(code.includes('check_type'), 'Should emit type checks');
    assert.ok(code.includes('async def'), 'Effectful functions should be async');
  });
});

describe('E2E: Cross-target consistency', () => {
  it('both targets compile the same source', () => {
    const ast = parse(source, 'e2e-v05.braid');
    const ir = lower(ast);
    const js = emitJS(ir);
    const py = emitPython(ir);

    // Both should compile without errors
    assert.equal(js.diagnostics.length, 0);
    assert.equal(py.diagnostics.length, 0);

    // Both should have all functions
    assert.ok(js.code.includes('function searchLeadsAdvanced'));
    assert.ok(py.code.includes('def searchLeadsAdvanced'));
    assert.ok(js.code.includes('function buildSearchPayload'));
    assert.ok(py.code.includes('def buildSearchPayload'));
  });
});

console.log('E2E v0.5 tests loaded');
