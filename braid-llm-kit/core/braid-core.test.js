// braid-core.test.js — Comprehensive test suite for Braid DSL core
// Covers: parser, transpiler, runtime, sandbox, error recovery, security
"use strict";

import { parse } from './braid-parse.js';
import { transpileToJS, extractPolicies, extractParamTypes, detectUsedEffects } from './braid-transpile.js';
import { Ok, Err, Some, None, checkType, cap, IO, CRMError, POLICIES, createPolicy } from './braid-rt.js';
import { safeGet, safeSet, guardGlobal } from './braid-sandbox.js';
import { describe, it } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// 1. RUNTIME: ALGEBRAIC DATA TYPES
// ============================================================================

describe('Runtime: ADTs', () => {
  it('Ok wraps value', () => {
    const r = Ok(42);
    assert.strictEqual(r.tag, 'Ok');
    assert.strictEqual(r.value, 42);
  });

  it('Err wraps error', () => {
    const r = Err('fail');
    assert.strictEqual(r.tag, 'Err');
    assert.strictEqual(r.error, 'fail');
  });

  it('Some wraps value', () => {
    const r = Some('x');
    assert.strictEqual(r.tag, 'Some');
    assert.strictEqual(r.value, 'x');
  });

  it('None is frozen singleton', () => {
    assert.strictEqual(None.tag, 'None');
    assert.throws(() => { None.tag = 'Bad'; }, TypeError);
  });
});

// ============================================================================
// 2. RUNTIME: TYPE CHECKING
// ============================================================================

describe('Runtime: checkType', () => {
  it('passes valid string', () => {
    assert.doesNotThrow(() => checkType('fn', 'p', 'hello', 'string'));
  });

  it('rejects null', () => {
    assert.throws(() => checkType('fn', 'p', null, 'string'), /BRAID_TYPE/);
  });

  it('rejects undefined', () => {
    assert.throws(() => checkType('fn', 'p', undefined, 'number'), /BRAID_TYPE/);
  });

  it('rejects wrong type', () => {
    assert.throws(() => checkType('fn', 'p', 42, 'string'), /expected string, got number/);
  });

  it('error has structured metadata', () => {
    try { checkType('myFn', 'myParam', 42, 'string'); }
    catch (e) {
      assert.strictEqual(e.code, 'BRAID_TYPE');
      assert.strictEqual(e.fn, 'myFn');
      assert.strictEqual(e.param, 'myParam');
      return;
    }
    assert.fail('should have thrown');
  });
});

// ============================================================================
// 3. RUNTIME: CRMError CONSTRUCTORS
// ============================================================================

describe('Runtime: CRMError', () => {
  it('notFound returns Err with 404', () => {
    const r = CRMError.notFound('Lead', '123', 'get');
    assert.strictEqual(r.tag, 'Err');
    assert.strictEqual(r.error.type, 'NotFound');
    assert.strictEqual(r.error.code, 404);
  });

  it('fromHTTP maps 404 to NotFound', () => {
    const r = CRMError.fromHTTP('/api', 404, 'get');
    assert.strictEqual(r.error.type, 'NotFound');
  });

  it('fromHTTP maps 400 to ValidationError', () => {
    const r = CRMError.fromHTTP('/api', 400, 'create');
    assert.strictEqual(r.error.type, 'ValidationError');
  });

  it('fromHTTP maps 403 to PermissionDenied', () => {
    const r = CRMError.fromHTTP('/api', 403, 'delete');
    assert.strictEqual(r.error.type, 'PermissionDenied');
  });

  it('fromHTTP maps 500 to NetworkError', () => {
    const r = CRMError.fromHTTP('/api', 500, 'get');
    assert.strictEqual(r.error.type, 'NetworkError');
  });
});

// ============================================================================
// 4. RUNTIME: CAPABILITY ENFORCEMENT
// ============================================================================

describe('Runtime: cap', () => {
  it('allows declared effect', () => {
    assert.doesNotThrow(() => cap({ allow_effects: ['net'] }, 'net'));
  });

  it('denies undeclared effect', () => {
    assert.throws(() => cap({ allow_effects: ['clock'] }, 'net'), /BRAID_CAP/);
  });

  it('denies when no policy', () => {
    assert.throws(() => cap(null, 'net'), /no policy/);
  });

  it('wildcard allows everything', () => {
    assert.doesNotThrow(() => cap({ allow_effects: ['*'] }, 'fs'));
  });

  it('calls onCapCheck callback', () => {
    let called = false;
    cap({ allow_effects: ['net'], onCapCheck: () => { called = true; } }, 'net');
    assert.strictEqual(called, true);
  });
});

// ============================================================================
// 5. RUNTIME: IO SANDBOX
// ============================================================================

describe('Runtime: IO', () => {
  it('creates sandboxed IO object', () => {
    const io = IO({ allow_effects: ['net'], max_execution_ms: 1000 }, {
      http: { get: async () => 'ok' },
    });
    assert.ok(io.http.get);
    assert.ok(io.clock.now);
  });

  it('denies missing deps', async () => {
    const io = IO({ allow_effects: ['net'] }, {});
    await assert.rejects(() => io.http.get('/x'), /not provided/);
  });

  it('enforces tenant isolation', async () => {
    let capturedOpts;
    const io = IO(
      { allow_effects: ['net'], tenant_isolation: true, context: { tenant_id: 't1' } },
      { http: { get: async (_url, opts) => { capturedOpts = opts; return 'ok'; } } }
    );
    await io.http.get('/api', {});
    assert.strictEqual(capturedOpts.params.tenant_id, 't1');
  });

  it('throws on timeout', async () => {
    const io = IO(
      { allow_effects: ['net'], max_execution_ms: 50 },
      { http: { get: async () => new Promise(r => setTimeout(r, 200)) } }
    );
    await assert.rejects(() => io.http.get('/slow'), /BRAID_TIMEOUT/);
  });
});

// ============================================================================
// 6. RUNTIME: POLICIES
// ============================================================================

describe('Runtime: POLICIES', () => {
  it('READ_ONLY is frozen', () => {
    assert.throws(() => { POLICIES.READ_ONLY.max_execution_ms = 999; }, TypeError);
  });

  it('createPolicy attaches context', () => {
    const p = createPolicy('READ_ONLY', { tenant_id: 't1' });
    assert.strictEqual(p.context.tenant_id, 't1');
    assert.deepStrictEqual(p.allow_effects, ['net', 'clock']);
  });

  it('createPolicy rejects unknown template', () => {
    assert.throws(() => createPolicy('BOGUS', {}), /Unknown policy/);
  });
});

// ============================================================================
// 7. SANDBOX: PROPERTY ACCESS
// ============================================================================

describe('Sandbox: safeGet', () => {
  it('allows normal property', () => {
    assert.strictEqual(safeGet({ x: 1 }, 'x'), 1);
  });

  it('blocks __proto__', () => {
    assert.throws(() => safeGet({}, '__proto__'), /BRAID_SANDBOX/);
  });

  it('blocks constructor', () => {
    assert.throws(() => safeGet({}, 'constructor'), /BRAID_SANDBOX/);
  });

  it('blocks prototype', () => {
    assert.throws(() => safeGet({}, 'prototype'), /BRAID_SANDBOX/);
  });

  it('blocks dunder properties', () => {
    assert.throws(() => safeGet({}, '__lookupGetter__'), /BRAID_SANDBOX/);
  });

  it('returns undefined for null obj', () => {
    assert.strictEqual(safeGet(null, 'x'), undefined);
  });
});

describe('Sandbox: safeSet', () => {
  it('allows normal set', () => {
    const obj = {};
    safeSet(obj, 'x', 1);
    assert.strictEqual(obj.x, 1);
  });

  it('blocks __proto__ set', () => {
    assert.throws(() => safeSet({}, '__proto__', {}), /BRAID_SANDBOX/);
  });
});

describe('Sandbox: guardGlobal', () => {
  it('blocks eval', () => {
    assert.throws(() => guardGlobal('eval'), /BRAID_SANDBOX.*eval/);
  });

  it('blocks Function', () => {
    assert.throws(() => guardGlobal('Function'), /BRAID_SANDBOX/);
  });

  it('blocks process', () => {
    assert.throws(() => guardGlobal('process'), /BRAID_SANDBOX/);
  });

  it('blocks require', () => {
    assert.throws(() => guardGlobal('require'), /BRAID_SANDBOX/);
  });

  it('blocks fetch (must use IO)', () => {
    assert.throws(() => guardGlobal('fetch'), /BRAID_SANDBOX/);
  });
});

// ============================================================================
// 8. PARSER: BASICS
// ============================================================================

describe('Parser: basics', () => {
  it('parses simple function', () => {
    const ast = parse('fn test() -> String { return "hello"; }');
    assert.strictEqual(ast.items[0].type, 'FnDecl');
    assert.strictEqual(ast.items[0].name, 'test');
  });

  it('has source position on FnDecl', () => {
    const ast = parse('fn test() -> String { return "hi"; }');
    assert.ok(ast.items[0].pos);
    assert.strictEqual(ast.items[0].pos.line, 1);
  });

  it('parses effects', () => {
    const ast = parse('fn f() -> String !net, clock { return "x"; }');
    assert.deepStrictEqual(ast.items[0].effects, ['net', 'clock']);
  });

  it('parses typed params', () => {
    const ast = parse('fn f(name: String, age: Number) -> Boolean { return true; }');
    assert.strictEqual(ast.items[0].params[0].type.base, 'String');
    assert.strictEqual(ast.items[0].params[1].type.base, 'Number');
  });

  it('parses @policy annotation', () => {
    const ast = parse('@policy(READ_ONLY)\nfn f() -> String { return "x"; }');
    assert.strictEqual(ast.items[0].annotations[0].name, 'policy');
    assert.deepStrictEqual(ast.items[0].annotations[0].args, ['READ_ONLY']);
  });

  it('parses block comments', () => {
    const ast = parse('/* comment */\nfn f() -> String { return "x"; }');
    assert.strictEqual(ast.items[0].name, 'f');
  });

  it('parses escape sequences in strings', () => {
    const ast = parse('fn f() -> String { return "a\\nb"; }');
    const ret = ast.items[0].body.statements[0];
    assert.strictEqual(ret.value.value, 'a\nb');
  });
});

// ============================================================================
// 9. PARSER: ERROR RECOVERY
// ============================================================================

describe('Parser: error recovery', () => {
  it('recovers from bad function and parses next', () => {
    const ast = parse(
      'fn bad( -> String { }\nfn good() -> String { return "ok"; }',
      'test.braid',
      { recover: true }
    );
    assert.ok(ast.diagnostics.length > 0);
    // Should still parse the second function
    const goodFn = ast.items.find(i => i.name === 'good');
    assert.ok(goodFn, 'should recover and parse good()');
  });

  it('collects multiple diagnostics', () => {
    const ast = parse(
      'fn a( { }\nfn b( { }\nfn c() -> String { return "ok"; }',
      'test.braid',
      { recover: true }
    );
    assert.ok(ast.diagnostics.length >= 2);
  });
});

// ============================================================================
// 10. PARSER: SECURITY WARNINGS
// ============================================================================

describe('Parser: security warnings', () => {
  it('warns on __proto__ access', () => {
    const ast = parse('fn f() -> String { let x = obj.__proto__; return x; }', 'test.braid', { recover: true });
    const secWarns = ast.diagnostics.filter(d => d.code === 'SEC001');
    assert.ok(secWarns.length > 0, 'should warn about __proto__');
  });

  it('warns on constructor access', () => {
    const ast = parse('fn f() -> String { let x = obj.constructor; return x; }', 'test.braid', { recover: true });
    const secWarns = ast.diagnostics.filter(d => d.code === 'SEC001');
    assert.ok(secWarns.length > 0);
  });
});

// ============================================================================
// 11. TRANSPILER: SANDBOX MODE
// ============================================================================

describe('Transpiler: sandbox mode', () => {
  it('emits guardGlobal for eval', () => {
    const ast = parse('fn f() -> String { let x = eval; return x; }');
    const { code } = transpileToJS(ast, { sandbox: true });
    assert.ok(code.includes('guardGlobal("eval")'), 'should guard eval');
  });

  it('emits safeGet for __proto__', () => {
    const ast = parse('fn f() -> String { let x = obj.__proto__; return x; }');
    const { code } = transpileToJS(ast, { sandbox: true });
    assert.ok(code.includes('safeGet('), 'should use safeGet for __proto__');
  });

  it('normal mode does not emit sandbox calls', () => {
    const ast = parse('fn f() -> String { let x = obj.name; return x; }');
    const { code } = transpileToJS(ast, { sandbox: false });
    assert.ok(!code.includes('safeGet('));
    assert.ok(!code.includes('guardGlobal('));
  });

  it('emits sandbox import', () => {
    const ast = parse('fn f() -> String { return "x"; }');
    const { code } = transpileToJS(ast, { sandbox: true });
    assert.ok(code.includes('braid-sandbox.js'));
  });
});

// ============================================================================
// 12. TRANSPILER: EFFECT ANALYSIS
// ============================================================================

describe('Transpiler: static effect analysis', () => {
  it('detects http.get requires !net', () => {
    const ast = parse('fn f() -> String { let x = http.get("/api"); return x; }');
    assert.throws(() => transpileToJS(ast), /uses 'net' effect but does not declare !net/);
  });

  it('detects clock.now requires !clock', () => {
    const ast = parse('fn f() -> String { let x = clock.now(); return x; }');
    assert.throws(() => transpileToJS(ast), /uses 'clock' effect/);
  });

  it('passes when effects declared', () => {
    const ast = parse('fn f() -> String !net { let x = http.get("/api"); return x; }');
    assert.doesNotThrow(() => transpileToJS(ast));
  });
});

// ============================================================================
// 13. TRANSPILER: POLICY VALIDATION
// ============================================================================

describe('Transpiler: @policy validation', () => {
  it('rejects unknown policy', () => {
    const ast = parse('@policy(BOGUS)\nfn f() -> String { return "x"; }');
    assert.throws(() => transpileToJS(ast), /not a valid policy/);
  });

  it('accepts valid policy', () => {
    const ast = parse('@policy(READ_ONLY)\nfn f() -> String { return "x"; }');
    assert.doesNotThrow(() => transpileToJS(ast));
  });
});

// ============================================================================
// 14. TRANSPILER: TYPE VALIDATION EMISSION
// ============================================================================

describe('Transpiler: type validation', () => {
  it('emits checkType for String param', () => {
    const ast = parse('fn f(name: String) -> String { return name; }');
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('checkType("f", "name", name, "string")'));
  });

  it('emits Array.isArray check', () => {
    const ast = parse('fn f(items: Array) -> String { return "x"; }');
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('Array.isArray'));
  });

  it('no check for untyped params', () => {
    const ast = parse('fn f(x) -> String { return x; }');
    const { code } = transpileToJS(ast);
    assert.ok(!code.includes('checkType('), 'should not emit checkType call for untyped param');
  });
});

// ============================================================================
// 15. EXTRACTION UTILITIES
// ============================================================================

describe('Extraction: policies', () => {
  it('extracts policies from annotated functions', () => {
    const ast = parse('@policy(WRITE)\nfn create() -> String { return "x"; }\n@policy(READ_ONLY)\nfn read() -> String { return "x"; }');
    const policies = extractPolicies(ast);
    assert.strictEqual(policies.create, 'WRITE');
    assert.strictEqual(policies.read, 'READ_ONLY');
  });
});

describe('Extraction: param types', () => {
  it('extracts typed params', () => {
    const ast = parse('fn f(name: String, age: Number) -> Boolean { return true; }');
    const types = extractParamTypes(ast);
    assert.strictEqual(types.f[0].type, 'String');
    assert.strictEqual(types.f[1].type, 'Number');
  });
});

console.log('All braid-core tests loaded');
