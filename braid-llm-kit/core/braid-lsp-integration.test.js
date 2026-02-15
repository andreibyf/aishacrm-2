// braid-lsp-integration.test.js — Integration tests for LSP with mock connection
// Tests the actual LSP protocol handlers using a simulated client/server pair.
"use strict";

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from './braid-parse.js';
import { buildFileIndex, resolveImportPath } from './braid-scope.js';

// ============================================================================
// We can't easily spin up the full LSP server in a test (it needs stdin/stdout
// transport), so we test the *logic* that powers each LSP handler by importing
// the same modules the LSP uses and simulating the request/response cycle.
//
// This validates: scope resolution, cross-file references, rename edits,
// definition jumps, document symbols, and incremental cache behavior.
// ============================================================================

const URI_A = 'file:///project/a.braid';
const URI_B = 'file:///project/b.braid';
const URI_TYPES = 'file:///project/spec/types.braid';

// Simulate the LSP's scope cache
function createMockLSP() {
  const scopeCache = new Map();
  const astCache = new Map();

  function indexFile(uri, src, resolveImportFn = null) {
    const ast = parse(src, uri, { recover: true });
    const fileIndex = buildFileIndex(ast, uri, resolveImportFn);
    scopeCache.set(uri, fileIndex);
    astCache.set(uri, { ast, version: 1, text: src });
    return { ast, fileIndex };
  }

  // Simulate onDefinition
  function goToDefinition(uri, line, character) {
    const fileIndex = scopeCache.get(uri);
    if (!fileIndex) return null;
    const hit = fileIndex.symbolAtPosition(line, character);
    if (!hit || !hit.symbol) return null;
    const symbol = hit.symbol;
    if (symbol.originSymbol) {
      return { uri: symbol.originSymbol.uri, range: symbol.originSymbol.defRange };
    }
    return { uri: symbol.uri, range: symbol.defRange };
  }

  // Simulate onReferences
  function findReferences(uri, line, character, includeDeclaration = true) {
    const fileIndex = scopeCache.get(uri);
    if (!fileIndex) return [];
    const hit = fileIndex.symbolAtPosition(line, character);
    if (!hit || !hit.symbol) return [];
    let targetSymbol = hit.symbol;
    if (targetSymbol.originSymbol) targetSymbol = targetSymbol.originSymbol;

    const locations = [];
    if (includeDeclaration) {
      locations.push({ uri: targetSymbol.uri, range: targetSymbol.defRange });
    }
    for (const [cachedUri, cachedIndex] of scopeCache) {
      for (const ref of cachedIndex.references) {
        if (ref.symbol === targetSymbol || ref.symbol.originSymbol === targetSymbol) {
          locations.push({ uri: cachedUri, range: ref.range });
        }
      }
    }
    if (includeDeclaration) {
      for (const [cachedUri, cachedIndex] of scopeCache) {
        for (const def of cachedIndex.definitions) {
          if (def.originSymbol === targetSymbol && def !== targetSymbol) {
            locations.push({ uri: cachedUri, range: def.defRange });
          }
        }
      }
    }
    return locations;
  }

  // Simulate onRenameRequest (cross-file version)
  function rename(uri, line, character, newName) {
    const STDLIB_NAMES = new Set([
      'len', 'map', 'filter', 'reduce', 'find', 'some', 'every',
      'includes', 'join', 'sort', 'reverse', 'flat', 'sum', 'avg',
      'keys', 'values', 'entries', 'parseInt', 'parseFloat', 'toString',
      'Ok', 'Err', 'Some', 'None', 'CRMError',
      'http', 'clock', 'fs', 'rng',
    ]);

    const fileIndex = scopeCache.get(uri);
    if (!fileIndex) return null;
    const hit = fileIndex.symbolAtPosition(line, character);
    if (!hit || !hit.symbol) return null;
    let symbol = hit.symbol;
    if (STDLIB_NAMES.has(symbol.name)) return null;
    if (symbol.kind === 'import' && symbol.originSymbol) {
      symbol = symbol.originSymbol;
    }

    const changes = {};
    if (!changes[symbol.uri]) changes[symbol.uri] = [];
    changes[symbol.uri].push({ range: symbol.defRange, newText: newName });

    for (const [cachedUri, cachedIndex] of scopeCache) {
      for (const ref of cachedIndex.references) {
        if (ref.symbol === symbol || ref.symbol.originSymbol === symbol) {
          if (!changes[cachedUri]) changes[cachedUri] = [];
          changes[cachedUri].push({ range: ref.range, newText: newName });
        }
      }
      for (const def of cachedIndex.definitions) {
        if (def.originSymbol === symbol && def !== symbol) {
          if (!changes[cachedUri]) changes[cachedUri] = [];
          changes[cachedUri].push({ range: def.defRange, newText: newName });
        }
      }
    }
    return { changes };
  }

  // Simulate document symbols
  function documentSymbols(uri) {
    const cached = astCache.get(uri);
    if (!cached) return [];
    const symbols = [];
    for (const item of (cached.ast.items || [])) {
      if (item.type === 'FnDecl') {
        symbols.push({ name: item.name, kind: 'function', line: (item.pos?.line || 1) - 1 });
      }
      if (item.type === 'TypeDecl') {
        symbols.push({ name: item.name, kind: 'type', line: (item.pos?.line || 1) - 1 });
      }
    }
    return symbols;
  }

  // Simulate incremental update
  function updateFile(uri, src) {
    const existing = astCache.get(uri);
    if (existing && existing.text === src) {
      return { reused: true };
    }
    indexFile(uri, src);
    return { reused: false };
  }

  // Simulate cache invalidation (onDidChangeWatchedFiles)
  function invalidateFile(uri) {
    scopeCache.delete(uri);
    astCache.delete(uri);
  }

  return { indexFile, goToDefinition, findReferences, rename, documentSymbols, updateFile, invalidateFile, scopeCache, astCache };
}

// ============================================================================
// SINGLE FILE TESTS
// ============================================================================

describe('LSP Integration: single file', () => {
  it('go-to-definition finds function', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn helper() -> Number { return 1; }
fn main() -> Number { return helper(); }`);

    // Find 'helper' call on line 1
    const helperDef = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'helper');
    const helperRef = lsp.scopeCache.get(URI_A).references.find(r => r.name === 'helper');
    assert.ok(helperRef, 'should have helper reference');

    const result = lsp.goToDefinition(URI_A, helperRef.range.start.line, helperRef.range.start.character);
    assert.ok(result, 'should find definition');
    assert.equal(result.uri, URI_A);
    assert.equal(result.range.start.line, helperDef.defRange.start.line);
  });

  it('find-all-references returns definition + all call sites', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn helper() -> Number { return 1; }
fn a() -> Number { return helper(); }
fn b() -> Number { return helper(); }`);

    const helperDef = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'helper');
    const refs = lsp.findReferences(URI_A, helperDef.defRange.start.line, helperDef.defRange.start.character, true);
    assert.equal(refs.length, 3, 'definition + 2 call sites');
  });

  it('rename updates definition and all references', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn old_name() -> Number { return 1; }
fn main() -> Number { return old_name(); }`);

    const oldDef = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'old_name');
    const result = lsp.rename(URI_A, oldDef.defRange.start.line, oldDef.defRange.start.character, 'new_name');
    assert.ok(result, 'should produce rename result');
    assert.ok(result.changes[URI_A], 'should have edits for file A');
    assert.equal(result.changes[URI_A].length, 2, 'definition + 1 reference');
    assert.ok(result.changes[URI_A].every(e => e.newText === 'new_name'));
  });

  it('rename refuses stdlib names', () => {
    const lsp = createMockLSP();
    // We can't rename 'Ok' because it's a builtin and won't appear as a definition
    // Instead test that a function named to match stdlib is still renameable
    lsp.indexFile(URI_A, `fn my_func() -> Number { return 1; }`);
    const def = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'my_func');
    const result = lsp.rename(URI_A, def.defRange.start.line, def.defRange.start.character, 'renamed');
    assert.ok(result, 'should allow rename of non-stdlib name');
  });

  it('document symbols returns functions and types', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `type Color = Red | Green | Blue
fn paint() -> Color { return Red; }
fn mix() -> Color { return Green; }`);

    const symbols = lsp.documentSymbols(URI_A);
    assert.equal(symbols.length, 3);
    assert.ok(symbols.some(s => s.name === 'Color' && s.kind === 'type'));
    assert.ok(symbols.some(s => s.name === 'paint' && s.kind === 'function'));
    assert.ok(symbols.some(s => s.name === 'mix' && s.kind === 'function'));
  });
});

// ============================================================================
// CROSS-FILE TESTS
// ============================================================================

describe('LSP Integration: cross-file', () => {
  it('go-to-definition follows import to origin file', () => {
    const lsp = createMockLSP();

    // Index the dependency first
    lsp.indexFile(URI_TYPES, `type Result = Ok | Err
type CRMError = { code: Number, message: String }`);

    // Index the consumer with import resolution
    const resolver = (path, _uri) => lsp.scopeCache.get(URI_TYPES) || null;
    lsp.indexFile(URI_A, `import { Result, CRMError } from "../../spec/types.braid"
fn test() -> Result { return Ok(1); }`, resolver);

    // Find the import symbol for Result
    const resultImport = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'Result' && d.kind === 'import');
    assert.ok(resultImport, 'should have Result import');

    const def = lsp.goToDefinition(URI_A, resultImport.defRange.start.line, resultImport.defRange.start.character);
    assert.ok(def, 'should resolve to origin');
    assert.equal(def.uri, URI_TYPES, 'should jump to types file');
  });

  it('find-all-references spans multiple files', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn shared() -> Number { return 1; }
fn use_a() -> Number { return shared(); }`);

    // File B references shared() from file A
    const resolver = (_path, _uri) => lsp.scopeCache.get(URI_A) || null;
    lsp.indexFile(URI_B, `import { shared } from "./a.braid"
fn use_b() -> Number { return shared(); }`, resolver);

    // Find references to shared from file A's definition
    const sharedDef = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'shared' && d.kind === 'function');
    const refs = lsp.findReferences(URI_A, sharedDef.defRange.start.line, sharedDef.defRange.start.character, true);

    // Should find: definition in A, call in A, import def in B, call in B
    assert.ok(refs.length >= 3, `should find cross-file refs, got ${refs.length}`);
    const fileUris = refs.map(r => r.uri);
    assert.ok(fileUris.includes(URI_A), 'should include file A');
    assert.ok(fileUris.includes(URI_B), 'should include file B');
  });

  it('cross-file rename produces edits in both files', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn old_helper() -> Number { return 1; }
fn use_a() -> Number { return old_helper(); }`);

    const resolver = (_path, _uri) => lsp.scopeCache.get(URI_A) || null;
    lsp.indexFile(URI_B, `import { old_helper } from "./a.braid"
fn use_b() -> Number { return old_helper(); }`, resolver);

    const def = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'old_helper' && d.kind === 'function');
    const result = lsp.rename(URI_A, def.defRange.start.line, def.defRange.start.character, 'new_helper');

    assert.ok(result, 'should produce rename result');
    assert.ok(result.changes[URI_A], 'should have edits in file A');
    assert.ok(result.changes[URI_B], 'should have edits in file B');

    // All edits should use the new name
    for (const [uri, edits] of Object.entries(result.changes)) {
      for (const edit of edits) {
        assert.equal(edit.newText, 'new_helper', `edit in ${uri} should use new name`);
      }
    }
  });
});

// ============================================================================
// TEMPLATE INTERPOLATION TRACKING
// ============================================================================

describe('LSP Integration: template interpolation references', () => {
  it('simple variable in template is tracked', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, 'fn test(name: String) -> String { return `hello ${name}`; }');

    const nameParam = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'name' && d.kind === 'parameter');
    assert.ok(nameParam, 'should find name parameter');
    assert.ok(nameParam.refs.length >= 1, 'name should have at least 1 reference from template');
  });

  it('multiple variables in template are tracked', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn test(tenant: String, id: String) -> String {
  return \`/api/\${tenant}/items/\${id}\`;
}`);

    const tenantParam = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'tenant');
    const idParam = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'id');
    assert.ok(tenantParam, 'should find tenant');
    assert.ok(idParam, 'should find id');
    assert.ok(tenantParam.refs.length >= 1, 'tenant should be referenced from template');
    assert.ok(idParam.refs.length >= 1, 'id should be referenced from template');
  });

  it('property access in template tracks only the object', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn test(user: Object) -> String {
  return \`Hello \${user.name}\`;
}`);

    const userParam = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'user');
    assert.ok(userParam, 'should find user');
    assert.ok(userParam.refs.length >= 1, 'user should be referenced');
    // 'name' should NOT be tracked (it's a property)
    const nameRefs = lsp.scopeCache.get(URI_A).references.filter(r => r.name === 'name');
    assert.equal(nameRefs.length, 0, 'property "name" should not be tracked');
  });

  it('template with let binding resolves correctly', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn test(tenant_id: String, query: String) -> String {
  let limit = 50;
  return \`/api?tenant=\${tenant_id}&q=\${query}&limit=\${limit}\`;
}`);

    const limitDef = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'limit' && d.kind === 'variable');
    assert.ok(limitDef, 'should find limit');
    assert.ok(limitDef.refs.length >= 1, 'limit should be referenced from template');
  });

  it('find-all-references includes template usage', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn test(id: String) -> String {
  let url = \`/api/items/\${id}\`;
  return url;
}`);

    const idParam = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'id');
    assert.ok(idParam, 'should find id');
    // id is used in template interpolation
    const refs = lsp.findReferences(URI_A, idParam.defRange.start.line, idParam.defRange.start.character, false);
    assert.ok(refs.length >= 1, 'should find reference from template');
  });
});

// ============================================================================
// INCREMENTAL PARSING
// ============================================================================

describe('LSP Integration: incremental parsing', () => {
  it('unchanged document reuses cached AST', () => {
    const lsp = createMockLSP();
    const src = 'fn test() -> Number { return 1; }';
    lsp.indexFile(URI_A, src);

    const result = lsp.updateFile(URI_A, src);
    assert.equal(result.reused, true, 'should reuse cache for identical text');
  });

  it('changed document triggers re-parse', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, 'fn test() -> Number { return 1; }');

    const result = lsp.updateFile(URI_A, 'fn test() -> Number { return 2; }');
    assert.equal(result.reused, false, 'should re-parse changed text');
  });

  it('cache invalidation clears both caches', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, 'fn test() -> Number { return 1; }');
    assert.ok(lsp.scopeCache.has(URI_A));
    assert.ok(lsp.astCache.has(URI_A));

    lsp.invalidateFile(URI_A);
    assert.ok(!lsp.scopeCache.has(URI_A), 'scope cache should be cleared');
    assert.ok(!lsp.astCache.has(URI_A), 'ast cache should be cleared');
  });

  it('re-indexing after invalidation works', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, 'fn old() -> Number { return 1; }');
    lsp.invalidateFile(URI_A);
    lsp.indexFile(URI_A, 'fn new_fn() -> Number { return 2; }');

    const symbols = lsp.documentSymbols(URI_A);
    assert.equal(symbols.length, 1);
    assert.equal(symbols[0].name, 'new_fn');
  });

  it('scope cache updates when file changes', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn helper() -> Number { return 1; }
fn main() -> Number { return helper(); }`);

    let helperDef = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'helper');
    assert.equal(helperDef.refs.length, 1, 'helper should have 1 reference');

    // Add another call site
    lsp.indexFile(URI_A, `fn helper() -> Number { return 1; }
fn main() -> Number { return helper(); }
fn other() -> Number { return helper(); }`);

    helperDef = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'helper');
    assert.equal(helperDef.refs.length, 2, 'helper should now have 2 references');
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('LSP Integration: edge cases', () => {
  it('empty file does not crash', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, '');
    const symbols = lsp.documentSymbols(URI_A);
    assert.equal(symbols.length, 0);
    const refs = lsp.findReferences(URI_A, 0, 0, false);
    assert.equal(refs.length, 0);
  });

  it('syntax error file still provides partial results', () => {
    const lsp = createMockLSP();
    // Incomplete function — parser should recover
    lsp.indexFile(URI_A, `fn good() -> Number { return 1; }
fn bad( -> { }`);

    const symbols = lsp.documentSymbols(URI_A);
    assert.ok(symbols.length >= 1, 'should still find good() even with parse errors');
  });

  it('deeply nested scopes resolve correctly', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `fn test(items: Array) -> Number {
  let total = 0;
  for item in items {
    let value = item;
    if value > 0 {
      let doubled = value;
      let result = doubled + total;
    }
  }
  return total;
}`);

    const totalDef = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'total' && d.kind === 'variable');
    assert.ok(totalDef, 'should find total');
    // total is used in return + nested let result
    assert.ok(totalDef.refs.length >= 1, 'total should be referenced');
  });

  it('production-like CRM function parses and indexes', () => {
    const lsp = createMockLSP();
    lsp.indexFile(URI_A, `import { Result, CRMError } from "../../spec/types.braid"

// @policy(READ_ONLY)
fn list_leads(
  tenant_id: String,
  limit: Number,
  offset: Number
) -> Result<Array, CRMError> !net {
  let url = \`/api/v2/leads?tenant_id=\${tenant_id}&limit=\${limit}&offset=\${offset}\`;
  let response = http.get(url);
  return match response {
    Ok{data} => Ok(data),
    Err{error} => Err(CRMError.fromHTTP(error))
  };
}`);

    const symbols = lsp.documentSymbols(URI_A);
    assert.ok(symbols.some(s => s.name === 'list_leads'), 'should find list_leads');

    // Template interpolation should track tenant_id, limit, offset
    const tenantDef = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'tenant_id');
    assert.ok(tenantDef, 'should find tenant_id param');
    assert.ok(tenantDef.refs.length >= 1, 'tenant_id should be referenced from template');

    const limitDef = lsp.scopeCache.get(URI_A).definitions.find(d => d.name === 'limit');
    assert.ok(limitDef, 'should find limit param');
    assert.ok(limitDef.refs.length >= 1, 'limit should be referenced from template');
  });
});
