// braid-core.test.js — Comprehensive test suite for Braid DSL core v0.4.0
// Covers: parser, transpiler, runtime, sandbox, new language features
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Ok, Err, Some, None, checkType, CRMError, cap, IO, POLICIES, createPolicy } from './braid-rt.js';
import { safeGet, safeSet, guardGlobal } from './braid-sandbox.js';
import { parse } from './braid-parse.js';
import { transpileToJS, detectUsedEffects, extractPolicies, extractParamTypes, VALID_POLICIES } from './braid-transpile.js';

// ============================================================================
// RUNTIME: ADTs
// ============================================================================

describe('Runtime ADTs', () => {
  it('Ok wraps value', () => { assert.deepEqual(Ok(42), { tag: 'Ok', value: 42 }); });
  it('Err wraps error', () => { assert.deepEqual(Err("bad"), { tag: 'Err', error: "bad" }); });
  it('Some wraps value', () => { assert.deepEqual(Some("x"), { tag: 'Some', value: "x" }); });
  it('None is frozen', () => { assert.equal(None.tag, 'None'); assert.ok(Object.isFrozen(None)); });
});

describe('Runtime checkType', () => {
  it('passes valid string', () => { checkType("fn", "x", "hi", "string"); });
  it('rejects null', () => { assert.throws(() => checkType("fn", "x", null, "string"), /BRAID_TYPE/); });
  it('rejects wrong type', () => { assert.throws(() => checkType("fn", "x", 42, "string"), /expected string, got number/); });
  it('error has metadata', () => {
    try { checkType("foo", "bar", undefined, "number"); } catch (e) {
      assert.equal(e.code, 'BRAID_TYPE');
      assert.equal(e.fn, 'foo');
    }
  });
});

describe('CRMError constructors', () => {
  it('notFound → 404', () => { assert.equal(CRMError.notFound("Lead", "1", "get").error.code, 404); });
  it('fromHTTP 404 → NotFound', () => { assert.equal(CRMError.fromHTTP("/a", 404, "op").error.type, 'NotFound'); });
  it('fromHTTP 400 → Validation', () => { assert.equal(CRMError.fromHTTP("/a", 400, "op").error.type, 'ValidationError'); });
  it('fromHTTP 403 → Permission', () => { assert.equal(CRMError.fromHTTP("/a", 403, "op").error.type, 'PermissionDenied'); });
  it('fromHTTP 500 → Network', () => { assert.equal(CRMError.fromHTTP("/a", 500, "op").error.type, 'NetworkError'); });
});

describe('Capability enforcement', () => {
  it('allows declared effect', () => { cap({ allow_effects: ['net'] }, 'net'); });
  it('denies undeclared', () => { assert.throws(() => cap({ allow_effects: ['net'] }, 'fs'), /BRAID_CAP/); });
  it('wildcard allows all', () => { cap({ allow_effects: ['*'] }, 'anything'); });
  it('no policy throws', () => { assert.throws(() => cap(null, 'net'), /no policy/); });
  it('onCapCheck callback', () => {
    let called = false;
    cap({ allow_effects: ['net'], onCapCheck: () => { called = true; } }, 'net');
    assert.ok(called);
  });
});

describe('IO sandbox', () => {
  it('creates sandboxed object', () => {
    const io = IO({ allow_effects: ['*'] }, { http: { get: async () => "ok" } });
    assert.ok(io.http.get);
    assert.ok(io.clock.now);
  });
  it('denies missing deps', () => {
    const io = IO({ allow_effects: ['*'] }, {});
    assert.rejects(() => io.http.get(), /not provided/);
  });
});

describe('Policies', () => {
  it('READ_ONLY is frozen', () => { assert.ok(Object.isFrozen(POLICIES.READ_ONLY)); });
  it('createPolicy attaches context', () => {
    const p = createPolicy('WRITE', { tenant_id: 't1' });
    assert.equal(p.context.tenant_id, 't1');
    assert.deepEqual(p.allow_effects, ['net', 'clock']);
  });
  it('rejects unknown template', () => { assert.throws(() => createPolicy('FAKE', {}), /Unknown/); });
});

// ============================================================================
// SANDBOX
// ============================================================================

describe('Sandbox safeGet', () => {
  it('allows normal', () => { assert.equal(safeGet({ x: 1 }, 'x'), 1); });
  it('blocks __proto__', () => { assert.throws(() => safeGet({}, '__proto__'), /BRAID_SANDBOX/); });
  it('blocks constructor', () => { assert.throws(() => safeGet({}, 'constructor'), /BRAID_SANDBOX/); });
  it('blocks dunder', () => { assert.throws(() => safeGet({}, '__custom__'), /dunder/); });
  it('null returns undefined', () => { assert.equal(safeGet(null, 'x'), undefined); });
});

describe('Sandbox safeSet', () => {
  it('allows normal', () => { const o = {}; safeSet(o, 'x', 1); assert.equal(o.x, 1); });
  it('blocks __proto__', () => { assert.throws(() => safeSet({}, '__proto__', {}), /BRAID_SANDBOX/); });
});

describe('Sandbox guardGlobal', () => {
  it('blocks eval', () => { assert.throws(() => guardGlobal('eval'), /BRAID_SANDBOX/); });
  it('blocks require', () => { assert.throws(() => guardGlobal('require'), /BRAID_SANDBOX/); });
  it('blocks fetch', () => { assert.throws(() => guardGlobal('fetch'), /BRAID_SANDBOX/); });
});

// ============================================================================
// PARSER: BASICS
// ============================================================================

describe('Parser basics', () => {
  it('parses a function', () => {
    const ast = parse(`fn greet(name: String) -> String { return name; }`);
    assert.equal(ast.items[0].type, 'FnDecl');
    assert.equal(ast.items[0].name, 'greet');
  });

  it('captures source positions', () => {
    const ast = parse(`fn test() -> Void { return true; }`);
    assert.ok(ast.items[0].pos.line >= 1);
  });

  it('parses effects', () => {
    const ast = parse(`fn fetch(url: String) -> String !net, clock { return url; }`);
    assert.deepEqual(ast.items[0].effects, ['net', 'clock']);
  });

  it('parses typed params', () => {
    const ast = parse(`fn add(a: Number, b: Number) -> Number { return a; }`);
    assert.equal(ast.items[0].params[0].type.base, 'Number');
  });

  it('parses @policy annotations', () => {
    const ast = parse(`@policy(READ_ONLY)\nfn test() -> Void { return true; }`);
    assert.equal(ast.items[0].annotations[0].name, 'policy');
    assert.deepEqual(ast.items[0].annotations[0].args, ['READ_ONLY']);
  });

  it('parses block comments', () => {
    const ast = parse(`/* comment */\nfn test() -> Void { return true; }`);
    assert.equal(ast.items.length, 1);
  });
});

describe('Parser error recovery', () => {
  it('recovers and parses next fn', () => {
    const ast = parse(`fn bad( -> Void { } fn good() -> Void { return true; }`, "test", { recover: true });
    assert.ok(ast.diagnostics.length > 0);
    assert.ok(ast.items.some(i => i.name === 'good'));
  });
});

describe('Parser security warnings', () => {
  it('warns on __proto__ access', () => {
    const ast = parse(`fn test() -> Void { let x = obj.__proto__; }`, "test", { recover: true });
    assert.ok(ast.diagnostics.some(d => d.code === 'SEC001'));
  });
});

// ============================================================================
// PARSER: NEW FEATURES
// ============================================================================

describe('Parser: for..in loops', () => {
  it('parses for..in', () => {
    const ast = parse(`fn test(items: Array) -> Void { for item in items { let x = item; } }`);
    const stmt = ast.items[0].body.statements[0];
    assert.equal(stmt.type, 'ForStmt');
    assert.equal(stmt.binding, 'item');
  });
});

describe('Parser: while loops', () => {
  it('parses while', () => {
    const ast = parse(`fn test() -> Void { while true { break; } }`);
    const stmt = ast.items[0].body.statements[0];
    assert.equal(stmt.type, 'WhileStmt');
  });

  it('parses break and continue', () => {
    const ast = parse(`fn test() -> Void { while true { break; continue; } }`);
    const stmts = ast.items[0].body.statements[0].body.statements;
    assert.equal(stmts[0].type, 'BreakStmt');
    assert.equal(stmts[1].type, 'ContinueStmt');
  });
});

describe('Parser: template strings', () => {
  it('parses simple template', () => {
    const src = 'fn test(name: String) -> String { return `hello`; }';
    const ast = parse(src);
    const ret = ast.items[0].body.statements[0].value;
    assert.equal(ret.type, 'TemplateLit');
  });

  it('parses interpolation', () => {
    const src = 'fn test(name: String) -> String { return `hi ${name}`; }';
    const ast = parse(src);
    const ret = ast.items[0].body.statements[0].value;
    assert.equal(ret.type, 'TemplateLit');
    assert.ok(ret.parts.some(p => p.kind === 'expr'));
  });
});

describe('Parser: optional chaining', () => {
  it('parses obj?.prop', () => {
    const ast = parse(`fn test(x: Object) -> Void { let y = x?.name; }`);
    const val = ast.items[0].body.statements[0].value;
    assert.equal(val.type, 'OptionalMemberExpr');
    assert.equal(val.prop, 'name');
  });
});

describe('Parser: pipe operator', () => {
  it('parses expr |> fn', () => {
    const ast = parse(`fn test(x: Number) -> Number { return x |> double; }`);
    const ret = ast.items[0].body.statements[0].value;
    assert.equal(ret.type, 'PipeExpr');
  });
});

describe('Parser: spread operator', () => {
  it('parses spread in array', () => {
    const ast = parse(`fn test() -> Void { let x = [1, ...items, 3]; }`);
    const arr = ast.items[0].body.statements[0].value;
    assert.equal(arr.type, 'ArrayExpr');
    assert.ok(arr.elements.some(e => e.type === 'SpreadExpr'));
  });

  it('parses spread in object', () => {
    const ast = parse(`fn test() -> Void { let x = { ...base, name: "test" }; }`);
    const obj = ast.items[0].body.statements[0].value;
    assert.ok(obj.props.some(p => p.type === 'SpreadProp'));
  });

  it('parses rest param', () => {
    const ast = parse(`fn test(first: String, ...rest: Array) -> Void { return first; }`);
    assert.ok(ast.items[0].params[1].spread);
  });
});

describe('Parser: else-if chains', () => {
  it('parses if/else if/else', () => {
    const src = `fn test(x: Number) -> String {
      if x > 10 { return "big"; }
      else if x > 5 { return "med"; }
      else { return "small"; }
    }`;
    const ast = parse(src);
    const ifStmt = ast.items[0].body.statements[0];
    assert.equal(ifStmt.type, 'IfStmt');
    assert.ok(ifStmt.else); // has else
    const elseIf = ifStmt.else.statements[0];
    assert.equal(elseIf.type, 'IfStmt'); // else-if is nested IfStmt
    assert.ok(elseIf.else); // has final else
  });
});

describe('Parser: null literal', () => {
  it('parses null', () => {
    const ast = parse(`fn test() -> Void { let x = null; }`);
    assert.equal(ast.items[0].body.statements[0].value.type, 'NullLit');
  });
});

// ============================================================================
// TRANSPILER: EXISTING FEATURES
// ============================================================================

describe('Transpiler: sandbox mode', () => {
  it('emits guardGlobal for eval', () => {
    const ast = parse(`fn test() -> Void { let x = eval; }`);
    const { code } = transpileToJS(ast, { sandbox: true });
    assert.ok(code.includes('guardGlobal("eval")'));
  });

  it('emits safeGet for __proto__', () => {
    const ast = parse(`fn test() -> Void { let x = obj.__proto__; }`, "test", { recover: true });
    const { code } = transpileToJS(ast, { sandbox: true });
    assert.ok(code.includes('safeGet('));
  });

  it('normal mode skips sandbox', () => {
    const ast = parse(`fn test() -> Void { let x = eval; }`);
    const { code } = transpileToJS(ast, { sandbox: false });
    assert.ok(!code.includes('guardGlobal'));
  });
});

describe('Transpiler: effect analysis', () => {
  it('detects http.get requires net', () => {
    const ast = parse(`fn test() -> Void { let x = http.get("/api"); }`);
    assert.throws(() => transpileToJS(ast), /TP002.*net/);
  });

  it('passes when declared', () => {
    const ast = parse(`fn test() -> Void !net { let x = http.get("/api"); }`);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('cap(policy, "net")'));
  });
});

describe('Transpiler: policy validation', () => {
  it('rejects unknown policy', () => {
    const ast = parse(`@policy(FAKE)\nfn test() -> Void { return true; }`);
    assert.throws(() => transpileToJS(ast), /TP003/);
  });

  it('accepts valid policy', () => {
    const ast = parse(`@policy(READ_ONLY)\nfn test() -> Void { return true; }`);
    transpileToJS(ast); // no throw
  });
});

describe('Transpiler: type validation', () => {
  it('emits checkType for String', () => {
    const ast = parse(`fn test(name: String) -> Void { return name; }`);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('checkType("test", "name", name, "string")'));
  });
});

// ============================================================================
// TRANSPILER: NEW FEATURES
// ============================================================================

describe('Transpiler: for..in', () => {
  it('emits for..of loop', () => {
    const ast = parse(`fn test(items: Array) -> Void { for item in items { let x = item; } }`);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('for (const item of items)'));
  });
});

describe('Transpiler: while', () => {
  it('emits while loop', () => {
    const ast = parse(`fn test() -> Void { while true { break; } }`);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('while (true)'));
    assert.ok(code.includes('break;'));
  });
});

describe('Transpiler: template strings', () => {
  it('emits JS template literal', () => {
    const src = 'fn test(name: String) -> String { return `hello ${name}`; }';
    const ast = parse(src);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('`'));
  });
});

describe('Transpiler: optional chaining', () => {
  it('emits ?. in normal mode', () => {
    const ast = parse(`fn test(x: Object) -> Void { let y = x?.name; }`);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('x?.name'));
  });
});

describe('Transpiler: pipe operator', () => {
  it('transforms to function call', () => {
    const ast = parse(`fn test(x: Number) -> Number { return x |> double; }`);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('double(x)'));
  });
});

describe('Transpiler: spread', () => {
  it('emits spread in array', () => {
    const ast = parse(`fn test() -> Void { let x = [1, ...items]; }`);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('...items'));
  });

  it('emits spread in object', () => {
    const ast = parse(`fn test() -> Void { let x = { ...base, y: 1 }; }`);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('...base'));
  });

  it('emits rest param', () => {
    const ast = parse(`fn test(first: String, ...rest: Array) -> Void { return first; }`);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('...rest'));
  });
});

describe('Transpiler: else-if chains', () => {
  it('emits clean else if', () => {
    const src = `fn test(x: Number) -> String {
      if x > 10 { return "big"; }
      else if x > 5 { return "med"; }
      else { return "small"; }
    }`;
    const ast = parse(src);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('else if'));
  });
});

describe('Transpiler: null literal', () => {
  it('emits undefined for null', () => {
    const ast = parse(`fn test() -> Void { let x = null; }`);
    const { code } = transpileToJS(ast);
    assert.ok(code.includes('= undefined'));
  });
});

// ============================================================================
// EXTRACTION UTILITIES
// ============================================================================

describe('Extraction', () => {
  it('extractPolicies from annotated fns', () => {
    const ast = parse(`@policy(READ_ONLY)\nfn read() -> Void { return true; }\n@policy(WRITE_OPERATIONS)\nfn write() -> Void { return true; }`);
    const p = extractPolicies(ast);
    assert.equal(p.read, 'READ_ONLY');
    assert.equal(p.write, 'WRITE_OPERATIONS');
  });

  it('extractParamTypes', () => {
    const ast = parse(`fn test(name: String, age: Number) -> Void { return true; }`);
    const t = extractParamTypes(ast);
    assert.equal(t.test[0].type, 'String');
    assert.equal(t.test[1].type, 'Number');
  });
});

console.log('All braid-core v0.4.0 tests loaded');
