// braid-transpile.test.js - Transpiler tests including static effect analysis
// Run with: node --test braid-llm-kit/tools/__tests__/braid-transpile.test.js

import { transpileToJS, detectUsedEffects, IO_EFFECT_MAP, extractPolicies, extractParamTypes, VALID_POLICIES } from '../braid-transpile.js';
import { parse } from '../braid-parse.js';
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Braid Transpiler', () => {

  describe('Basic Transpilation', () => {
    it('transpiles a pure function', () => {
      const ast = parse('fn add(a: Number, b: Number) -> Number { return a + b; }');
      const { code } = transpileToJS(ast);
      assert.ok(code.includes('export function add(a, b)'));
      assert.ok(!code.includes('async'));
      assert.ok(!code.includes('cap('));
    });

    it('transpiles an effectful function with !net', () => {
      const ast = parse(`
        fn fetchData(url: String) -> Result !net {
          let response = http.get(url);
          return response;
        }
      `);
      const { code } = transpileToJS(ast);
      assert.ok(code.includes('export async function fetchData(policy, deps, url)'));
      assert.ok(code.includes('cap(policy, "net")'));
      assert.ok(code.includes('const io = IO(policy, deps)'));
      assert.ok(code.includes('const { http, clock, fs, rng } = io'));
    });

    it('transpiles function with multiple effects', () => {
      const ast = parse(`
        fn timedFetch(url: String) -> Result !net, clock {
          let ts = clock.now();
          let response = http.get(url);
          return response;
        }
      `);
      const { code } = transpileToJS(ast);
      assert.ok(code.includes('cap(policy, "net")'));
      assert.ok(code.includes('cap(policy, "clock")'));
    });

    it('rejects effectful function in pure build', () => {
      const ast = parse('fn fetch(url: String) -> Result !net { let r = http.get(url); return r; }');
      assert.throws(() => {
        transpileToJS(ast, { pure: true });
      }, /TP001/);
    });
  });

  describe('Static Effect Analysis (detectUsedEffects)', () => {
    it('detects http.get usage as net effect', () => {
      const ast = parse('fn test() -> Result !net { let r = http.get("/api"); return r; }');
      const fnBody = ast.items[0].body;
      const used = detectUsedEffects(fnBody);
      assert.ok(used.has('net'));
    });

    it('detects http.post usage as net effect', () => {
      const ast = parse('fn test() -> Result !net { let r = http.post("/api", { body: {} }); return r; }');
      const fnBody = ast.items[0].body;
      const used = detectUsedEffects(fnBody);
      assert.ok(used.has('net'));
    });

    it('detects clock.now usage as clock effect', () => {
      const ast = parse('fn test() -> String !clock { let ts = clock.now(); return ts; }');
      const fnBody = ast.items[0].body;
      const used = detectUsedEffects(fnBody);
      assert.ok(used.has('clock'));
    });

    it('detects multiple effects in one function', () => {
      const ast = parse(`
        fn test() -> Result !net, clock {
          let ts = clock.now();
          let r = http.get("/api");
          return r;
        }
      `);
      const fnBody = ast.items[0].body;
      const used = detectUsedEffects(fnBody);
      assert.ok(used.has('net'));
      assert.ok(used.has('clock'));
    });

    it('returns empty set for pure function', () => {
      const ast = parse('fn add(a: Number, b: Number) -> Number { return a + b; }');
      const fnBody = ast.items[0].body;
      const used = detectUsedEffects(fnBody);
      assert.strictEqual(used.size, 0);
    });

    it('IO_EFFECT_MAP maps namespaces to effect names', () => {
      assert.strictEqual(IO_EFFECT_MAP.http, 'net');
      assert.strictEqual(IO_EFFECT_MAP.clock, 'clock');
      assert.strictEqual(IO_EFFECT_MAP.fs, 'fs');
      assert.strictEqual(IO_EFFECT_MAP.rng, 'rng');
    });
  });

  describe('Effect Mismatch Detection', () => {
    it('errors when http.* used without declaring !net', () => {
      const ast = parse('fn test() -> Result { let r = http.get("/api"); return r; }');
      assert.throws(() => {
        transpileToJS(ast);
      }, /TP002.*uses 'net' effect.*does not declare !net/);
    });

    it('errors when clock.* used without declaring !clock', () => {
      const ast = parse('fn test() -> String { let ts = clock.now(); return ts; }');
      assert.throws(() => {
        transpileToJS(ast);
      }, /TP002.*uses 'clock' effect.*does not declare !clock/);
    });

    it('succeeds when all used effects are declared', () => {
      const ast = parse(`
        fn test() -> Result !net, clock {
          let ts = clock.now();
          let r = http.get("/api");
          return r;
        }
      `);
      // Should not throw
      const { code } = transpileToJS(ast);
      assert.ok(code.includes('cap(policy, "net")'));
      assert.ok(code.includes('cap(policy, "clock")'));
    });
  });

  describe('Match Expression Transpilation', () => {
    it('transpiles match with Ok/Err arms', () => {
      const ast = parse(`
        fn test() -> String !net {
          let r = http.get("/api");
          return match r {
            Ok{value} => value,
            Err{error} => "failed",
            _ => "unknown"
          };
        }
      `);
      const { code } = transpileToJS(ast);
      assert.ok(code.includes('function test('));
    });
  });

  describe('Output Structure', () => {
    it('includes runtime import', () => {
      const ast = parse('fn test() -> String { return "hello"; }');
      const { code } = transpileToJS(ast);
      assert.ok(code.includes('import { Ok, Err, IO, cap, checkType, CRMError }'));
    });

    it('uses custom runtime import path', () => {
      const ast = parse('fn test() -> String { return "hello"; }');
      const { code } = transpileToJS(ast, { runtimeImport: 'file:///custom/braid-rt.js' });
      assert.ok(code.includes('from "file:///custom/braid-rt.js"'));
    });

    it('exports functions', () => {
      const ast = parse('fn myFunc() -> String { return "hi"; }');
      const { code } = transpileToJS(ast);
      assert.ok(code.includes('export function myFunc'));
    });
  });
  describe('@policy Annotations', () => {
    it('extracts @policy from parsed AST', () => {
      const ast = parse(`
        @policy(READ_ONLY)
        fn list(t: String) -> Result !net { let r = http.get("/api"); return r; }
        @policy(WRITE_OPERATIONS)
        fn create(t: String) -> Result !net { let r = http.post("/api", {}); return r; }
      `);
      const policies = extractPolicies(ast);
      assert.strictEqual(policies.list, 'READ_ONLY');
      assert.strictEqual(policies.create, 'WRITE_OPERATIONS');
    });

    it('skips functions without @policy', () => {
      const ast = parse('fn helper(x: Number) -> Number { return x; }');
      const policies = extractPolicies(ast);
      assert.strictEqual(Object.keys(policies).length, 0);
    });

    it('rejects invalid @policy name at transpile time', () => {
      const ast = parse('@policy(FAKE) fn bad(t: String) -> String { return t; }');
      assert.throws(() => transpileToJS(ast), /TP003.*FAKE.*not a valid policy/);
    });

    it('accepts all valid policy names', () => {
      for (const p of VALID_POLICIES) {
        const ast = parse(`@policy(${p}) fn f(t: String) -> String { return t; }`);
        assert.doesNotThrow(() => transpileToJS(ast));
      }
    });

    it('stores annotations in AST FnDecl node', () => {
      const ast = parse('@policy(ADMIN_ONLY) @deprecated fn old() -> String { return "x"; }');
      const fn = ast.items[0];
      assert.strictEqual(fn.annotations.length, 2);
      assert.strictEqual(fn.annotations[0].name, 'policy');
      assert.strictEqual(fn.annotations[0].args[0], 'ADMIN_ONLY');
      assert.strictEqual(fn.annotations[1].name, 'deprecated');
      assert.strictEqual(fn.annotations[1].args, null);
    });
  });

  describe('Type Validation', () => {
    it('emits checkType for String params', () => {
      const ast = parse('fn greet(name: String) -> String { return name; }');
      const { code } = transpileToJS(ast);
      assert.ok(code.includes('checkType("greet", "name", name, "string")'));
    });

    it('emits checkType for Number params', () => {
      const ast = parse('fn calc(x: Number, y: Number) -> Number { return x; }');
      const { code } = transpileToJS(ast);
      assert.ok(code.includes('checkType("calc", "x", x, "number")'));
      assert.ok(code.includes('checkType("calc", "y", y, "number")'));
    });

    it('emits Array.isArray check for Array params', () => {
      const ast = parse('fn proc(items: Array) -> String { return "done"; }');
      const { code } = transpileToJS(ast);
      assert.ok(code.includes('Array.isArray(items)'));
    });

    it('skips type check for untyped params', () => {
      const ast = parse('fn legacy(x) -> String { return x; }');
      const { code } = transpileToJS(ast);
      assert.ok(!code.includes('checkType'));
    });

    it('places type checks before cap() calls', () => {
      const ast = parse('fn fetch(tenant: String) -> Result !net { let r = http.get("/api"); return r; }');
      const { code } = transpileToJS(ast);
      const checkIdx = code.indexOf('checkType');
      const capIdx = code.indexOf('cap(policy');
      assert.ok(checkIdx < capIdx, 'checkType should come before cap()');
    });

    it('extractParamTypes returns structured type info', () => {
      const ast = parse('fn search(q: String, limit: Number, tags: Array<String>) -> Result !net { let r = http.get("/x"); return r; }');
      const types = extractParamTypes(ast);
      assert.strictEqual(types.search[0].type, 'String');
      assert.strictEqual(types.search[1].type, 'Number');
      assert.strictEqual(types.search[2].type, 'Array');
      assert.strictEqual(types.search[2].typeArgs[0].base, 'String');
    });
  });

});

console.log('All transpiler tests passed!');
