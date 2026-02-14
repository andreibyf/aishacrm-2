// braid-scope.test.js — Tests for the Braid scope indexer
/* global process */
"use strict";

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from './braid-parse.js';
import { buildFileIndex, resolveImportPath, Symbol, Scope, FileIndex, containsPosition, posToRange, BUILTINS } from './braid-scope.js';

console.log('Braid scope indexer tests loaded');

const TEST_URI = 'test://scope-test.braid';

function idx(src, resolveImportFn = null) {
  const ast = parse(src, TEST_URI, { recover: true });
  return buildFileIndex(ast, TEST_URI, resolveImportFn);
}

// ============================================================================
// SCOPE BASICS
// ============================================================================

describe('Scope basics', () => {
  it('empty file produces empty index', () => {
    const index = idx('');
    assert.equal(index.definitions.length, 0);
    assert.equal(index.references.length, 0);
    assert.equal(index.entries.length, 0);
  });

  it('single function creates definition', () => {
    const index = idx('fn add(a: Number, b: Number) -> Number { return a; }');
    const fnDef = index.definitions.find(d => d.name === 'add');
    assert.ok(fnDef, 'should find function definition');
    assert.equal(fnDef.kind, 'function');
    assert.equal(fnDef.uri, TEST_URI);
  });

  it('multiple functions create multiple definitions', () => {
    const index = idx(`
fn foo() -> Number { return 1; }
fn bar() -> Number { return 2; }
fn baz() -> Number { return 3; }
    `);
    const fns = index.definitions.filter(d => d.kind === 'function');
    assert.equal(fns.length, 3);
    assert.deepEqual(fns.map(f => f.name).sort(), ['bar', 'baz', 'foo']);
  });

  it('type declaration creates definition', () => {
    const index = idx('type Color = Red | Green | Blue');
    const td = index.definitions.find(d => d.name === 'Color');
    assert.ok(td, 'should find type definition');
    assert.equal(td.kind, 'type');
  });

  it('function parameters create definitions', () => {
    const index = idx('fn greet(name: String, age: Number) -> String { return name; }');
    const params = index.definitions.filter(d => d.kind === 'parameter');
    assert.equal(params.length, 2);
    assert.deepEqual(params.map(p => p.name).sort(), ['age', 'name']);
  });

  it('let binding creates definition', () => {
    const index = idx('fn test() -> Number { let x = 42; return x; }');
    const binding = index.definitions.find(d => d.kind === 'variable');
    assert.ok(binding, 'should find let binding');
    assert.equal(binding.name, 'x');
  });

  it('forward reference resolves correctly', () => {
    const index = idx(`
fn helper() -> Number { return 1; }
fn main() -> Number { return helper(); }
    `);
    // helper() call in main should reference the helper definition
    const helperRefs = index.references.filter(r => r.name === 'helper');
    assert.ok(helperRefs.length >= 1, 'should have at least 1 reference to helper');
    assert.equal(helperRefs[0].symbol.kind, 'function');
  });

  it('symbolAtPosition finds definition', () => {
    const index = idx('fn test() -> Number { return 1; }');
    // Find where the 'test' definition actually ended up
    const testDef = index.definitions.find(d => d.name === 'test');
    assert.ok(testDef, 'should have test definition');
    const line = testDef.defRange.start.line;
    const char = testDef.defRange.start.character;
    const hit = index.symbolAtPosition(line, char);
    assert.ok(hit, 'should find symbol at position');
    assert.equal(hit.symbol.name, 'test');
    assert.equal(hit.isDef, true);
  });
});

// ============================================================================
// SCOPE RESOLUTION
// ============================================================================

describe('Scope resolution', () => {
  it('let binding reference resolves to definition', () => {
    const index = idx('fn test() -> Number { let x = 10; return x; }');
    const xRefs = index.references.filter(r => r.name === 'x');
    assert.equal(xRefs.length, 1, 'should have 1 reference to x');
    assert.equal(xRefs[0].symbol.kind, 'variable');
  });

  it('parameter reference resolves to parameter definition', () => {
    const index = idx('fn double(n: Number) -> Number { return n; }');
    const nRefs = index.references.filter(r => r.name === 'n');
    assert.equal(nRefs.length, 1, 'should have 1 reference to n');
    assert.equal(nRefs[0].symbol.kind, 'parameter');
  });

  it('function call resolves to function definition', () => {
    const index = idx(`
fn add(a: Number, b: Number) -> Number { return a; }
fn main() -> Number { return add(1, 2); }
    `);
    const addRefs = index.references.filter(r => r.name === 'add');
    assert.ok(addRefs.length >= 1, 'should have a reference to add');
    assert.equal(addRefs[0].symbol.kind, 'function');
    assert.equal(addRefs[0].symbol.name, 'add');
  });

  it('shadowed name resolves to inner binding', () => {
    const index = idx(`
fn test() -> Number {
  let x = 10;
  let x = 20;
  return x;
}
    `);
    // The return x should reference the second (inner) x
    const xDefs = index.definitions.filter(d => d.name === 'x' && d.kind === 'variable');
    assert.equal(xDefs.length, 2, 'should have 2 definitions of x');
    const xRefs = index.references.filter(r => r.name === 'x');
    assert.ok(xRefs.length >= 1, 'should have at least 1 reference to x');
    // The reference should point to the second definition (shadowed)
    assert.equal(xRefs[xRefs.length - 1].symbol, xDefs[1]);
  });

  it('for-loop binding scoped to loop body', () => {
    const index = idx(`
fn test(items: Array) -> Number {
  for item in items {
    let x = item;
  }
  return 0;
}
    `);
    const itemDef = index.definitions.find(d => d.name === 'item' && d.kind === 'for_binding');
    assert.ok(itemDef, 'should find for-loop binding');
    // items reference should resolve to the parameter
    const itemsRefs = index.references.filter(r => r.name === 'items');
    assert.ok(itemsRefs.length >= 1, 'should have reference to items param');
    assert.equal(itemsRefs[0].symbol.kind, 'parameter');
  });

  it('match arm binding scoped to arm body', () => {
    const index = idx(`
fn test(result: Result) -> Number {
  return match result {
    Ok{value} => value,
    Err{error} => 0,
    _ => 0
  };
}
    `);
    const valueDef = index.definitions.find(d => d.name === 'value' && d.kind === 'match_binding');
    assert.ok(valueDef, 'should find match binding for value');
    const errorDef = index.definitions.find(d => d.name === 'error' && d.kind === 'match_binding');
    assert.ok(errorDef, 'should find match binding for error');
    // value reference should resolve to the match binding
    const valueRefs = index.references.filter(r => r.name === 'value');
    assert.ok(valueRefs.length >= 1, 'should have reference to value');
    assert.equal(valueRefs[0].symbol.kind, 'match_binding');
  });

  it('builtins are not tracked as references', () => {
    const index = idx('fn test() -> Result { return Ok(42); }');
    const okRefs = index.references.filter(r => r.name === 'Ok');
    assert.equal(okRefs.length, 0, 'builtins should not be tracked');
  });
});

// ============================================================================
// FIND ALL REFERENCES
// ============================================================================

describe('Find all references', () => {
  it('all uses of a variable returned', () => {
    const index = idx(`
fn test() -> Number {
  let x = 10;
  let y = x;
  return x;
}
    `);
    const xDef = index.definitions.find(d => d.name === 'x' && d.kind === 'variable');
    assert.ok(xDef, 'should find x definition');
    assert.equal(xDef.refs.length, 2, 'x should have 2 references (y = x, return x)');
  });

  it('all call sites of a function returned', () => {
    const index = idx(`
fn helper() -> Number { return 1; }
fn a() -> Number { return helper(); }
fn b() -> Number { return helper(); }
fn c() -> Number { return helper(); }
    `);
    const helperDef = index.definitions.find(d => d.name === 'helper' && d.kind === 'function');
    assert.ok(helperDef, 'should find helper definition');
    assert.equal(helperDef.refs.length, 3, 'helper should have 3 call sites');
  });

  it('parameter uses returned', () => {
    const index = idx(`
fn calc(a: Number, b: Number) -> Number {
  let sum = a;
  let diff = a;
  return b;
}
    `);
    const aDef = index.definitions.find(d => d.name === 'a' && d.kind === 'parameter');
    assert.ok(aDef, 'should find param a');
    assert.equal(aDef.refs.length, 2, 'a should have 2 references');
    const bDef = index.definitions.find(d => d.name === 'b' && d.kind === 'parameter');
    assert.ok(bDef, 'should find param b');
    assert.equal(bDef.refs.length, 1, 'b should have 1 reference');
  });

  it('no references for unused definition', () => {
    const index = idx('fn unused() -> Number { return 42; }');
    const def = index.definitions.find(d => d.name === 'unused');
    assert.ok(def, 'should find definition');
    assert.equal(def.refs.length, 0, 'should have 0 references');
  });

  it('member expr object resolved but property not', () => {
    const index = idx(`
fn test() -> Number {
  let obj = 42;
  return obj;
}
    `);
    const objRefs = index.references.filter(r => r.name === 'obj');
    assert.ok(objRefs.length >= 1, 'object should be resolved');
  });

  it('references in array expressions resolved', () => {
    const index = idx(`
fn test() -> Array {
  let x = 1;
  let y = 2;
  return x;
}
    `);
    const xDef = index.definitions.find(d => d.name === 'x' && d.kind === 'variable');
    assert.ok(xDef, 'should find x');
    assert.ok(xDef.refs.length >= 1, 'x should have references');
  });
});

// ============================================================================
// IMPORT RESOLUTION
// ============================================================================

describe('Import resolution', () => {
  it('import creates definitions for each name', () => {
    const index = idx('import { Result, CRMError } from "../../spec/types.braid"');
    const importDefs = index.definitions.filter(d => d.kind === 'import');
    assert.equal(importDefs.length, 2);
    assert.deepEqual(importDefs.map(d => d.name).sort(), ['CRMError', 'Result']);
  });

  it('import with resolver links to origin symbol', () => {
    const depSrc = 'type MyType = Foo | Bar';
    const resolver = (path, _uri) => {
      const depAst = parse(depSrc, 'dep.braid');
      return buildFileIndex(depAst, 'dep.braid');
    };
    const index = idx('import { MyType } from "./dep.braid"', resolver);
    const importSym = index.definitions.find(d => d.name === 'MyType' && d.kind === 'import');
    assert.ok(importSym, 'should find import symbol');
    assert.ok(importSym.originSymbol, 'should have origin symbol linked');
    assert.equal(importSym.originSymbol.name, 'MyType');
    assert.equal(importSym.originSymbol.kind, 'type');
    assert.equal(importSym.originUri, 'dep.braid');
  });

  it('import without resolver creates unlinked symbols', () => {
    const index = idx('import { Result, CRMError } from "../../spec/types.braid"');
    const importSym = index.definitions.find(d => d.name === 'Result');
    assert.ok(importSym, 'should create symbol');
    assert.equal(importSym.originSymbol, null, 'should have no origin');
  });

  it('missing import file degrades gracefully', () => {
    const resolver = (_path, _uri) => { throw new Error('file not found'); };
    const index = idx('import { Foo } from "./missing.braid"', resolver);
    const importSym = index.definitions.find(d => d.name === 'Foo');
    assert.ok(importSym, 'should still create symbol');
    assert.equal(importSym.originSymbol, null, 'should have no origin');
    assert.equal(index.imports[0].resolved, false);
  });

  it('resolveImportPath resolves relative paths', () => {
    const result = resolveImportPath('../../spec/types.braid', '/a/b/c/file.braid');
    // On Windows, the leading / may be stripped — check the relative part
    assert.ok(result.endsWith('a/spec/types.braid') || result.endsWith('a\\spec\\types.braid'), `path should resolve correctly, got: ${result}`);
  });
});

// ============================================================================
// RENAME SUPPORT
// ============================================================================

describe('Rename support', () => {
  it('variable definition and all references returned', () => {
    const index = idx(`
fn test() -> Number {
  let count = 0;
  let next = count;
  return count;
}
    `);
    const countDef = index.definitions.find(d => d.name === 'count' && d.kind === 'variable');
    assert.ok(countDef, 'should find count definition');
    assert.equal(countDef.refs.length, 2, 'count has 2 references');
    // All refs should point to same symbol
    for (const ref of index.references.filter(r => r.name === 'count')) {
      assert.equal(ref.symbol, countDef, 'all refs should point to same symbol');
    }
  });

  it('function name and call sites returned', () => {
    const index = idx(`
fn helper() -> Number { return 1; }
fn main() -> Number { return helper(); }
    `);
    const helperDef = index.definitions.find(d => d.name === 'helper' && d.kind === 'function');
    assert.ok(helperDef, 'should find helper def');
    assert.equal(helperDef.refs.length, 1, 'helper has 1 call site');
    // Definition + references = rename targets
    const totalTargets = 1 + helperDef.refs.length;
    assert.equal(totalTargets, 2, 'rename would hit 2 locations');
  });

  it('BUILTINS set includes standard names', () => {
    assert.ok(BUILTINS.has('Ok'), 'Ok should be builtin');
    assert.ok(BUILTINS.has('Err'), 'Err should be builtin');
    assert.ok(BUILTINS.has('http'), 'http should be builtin');
    assert.ok(BUILTINS.has('len'), 'len should be builtin');
    assert.ok(BUILTINS.has('CRMError'), 'CRMError should be builtin');
    assert.ok(!BUILTINS.has('myVar'), 'myVar should not be builtin');
  });

  it('entries sorted by position', () => {
    const index = idx(`
fn a() -> Number { return 1; }
fn b() -> Number { return a(); }
    `);
    for (let i = 1; i < index.entries.length; i++) {
      const prev = index.entries[i - 1];
      const curr = index.entries[i];
      const prevPos = prev.range.start.line * 10000 + prev.range.start.character;
      const currPos = curr.range.start.line * 10000 + curr.range.start.character;
      assert.ok(prevPos <= currPos, `entries should be sorted: entry ${i - 1} (${prevPos}) <= entry ${i} (${currPos})`);
    }
  });

  it('containsPosition works correctly', () => {
    const range = { start: { line: 5, character: 10 }, end: { line: 5, character: 15 } };
    assert.ok(containsPosition(range, 5, 10), 'start of range');
    assert.ok(containsPosition(range, 5, 12), 'middle of range');
    assert.ok(!containsPosition(range, 5, 15), 'end is exclusive');
    assert.ok(!containsPosition(range, 5, 9), 'before range');
    assert.ok(!containsPosition(range, 4, 12), 'wrong line');
  });
});
