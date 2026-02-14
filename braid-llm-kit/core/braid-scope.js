// braid-scope.js — Braid scope indexer for LSP
// Builds a scope-aware symbol index from a parsed AST.
// Used by braid-lsp.js for go-to-definition, find-all-references, and rename.
"use strict";

// ============================================================================
// DATA STRUCTURES
// ============================================================================

class Symbol {
  constructor(name, kind, uri, defRange) {
    this.name = name;
    this.kind = kind;       // 'function' | 'type' | 'parameter' | 'variable' | 'for_binding' | 'match_binding' | 'import'
    this.uri = uri;
    this.defRange = defRange; // { start: {line, character}, end: {line, character} }
    this.refs = [];           // Array<{ uri, range }>
    this.originUri = null;    // For imports: URI of the defining file
    this.originSymbol = null; // For imports: the Symbol in the defining file
  }
}

class Scope {
  constructor(parent, uri) {
    this.parent = parent;
    this.uri = uri;
    this.symbols = new Map();
  }

  define(name, kind, range) {
    const sym = new Symbol(name, kind, this.uri, range);
    this.symbols.set(name, sym);
    return sym;
  }

  resolve(name) {
    if (this.symbols.has(name)) return this.symbols.get(name);
    if (this.parent) return this.parent.resolve(name);
    return null;
  }
}

class FileIndex {
  constructor(uri) {
    this.uri = uri;
    this.rootScope = null;
    this.definitions = [];   // Symbol[]
    this.references = [];    // Array<{ name, uri, range, symbol }>
    this.entries = [];        // Array<{ range, symbol, isDef }> sorted by position
    this.imports = [];        // Array<{ names, path, resolved }>
  }

  symbolAtPosition(line, character) {
    for (const entry of this.entries) {
      if (containsPosition(entry.range, line, character)) {
        return { symbol: entry.symbol, isDef: entry.isDef };
      }
    }
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function containsPosition(range, line, character) {
  if (line < range.start.line || line > range.end.line) return false;
  if (line === range.start.line && character < range.start.character) return false;
  if (line === range.end.line && character >= range.end.character) return false;
  return true;
}

function posToRange(pos, name) {
  const line = (pos?.line || 1) - 1;
  const character = (pos?.col || 1) - 1;
  return {
    start: { line, character },
    end: { line, character: character + (name?.length || 1) },
  };
}

// Builtins that should not be resolved as user-defined symbols
const BUILTINS = new Set([
  'http', 'clock', 'fs', 'rng',
  'Ok', 'Err', 'Some', 'None',
  'len', 'map', 'filter', 'reduce', 'find', 'some', 'every',
  'includes', 'join', 'sort', 'reverse', 'flat', 'sum', 'avg',
  'keys', 'values', 'entries', 'parseInt', 'parseFloat', 'toString',
  'CRMError', 'cap', 'checkType',
  'true', 'false', 'null',
]);

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export function buildFileIndex(ast, uri, resolveImportFn = null) {
  const index = new FileIndex(uri);
  const rootScope = new Scope(null, uri);
  index.rootScope = rootScope;

  if (!ast || !ast.items) return index;

  // Pass 1: Register top-level names (functions, types, imports)
  for (const item of ast.items) {
    if (item.type === 'FnDecl') registerFn(item, rootScope, index, uri);
    if (item.type === 'TypeDecl') registerType(item, rootScope, index, uri);
    if (item.type === 'ImportDecl') registerImport(item, rootScope, index, uri, resolveImportFn);
  }

  // Pass 2: Walk function bodies to collect references
  for (const item of ast.items) {
    if (item.type === 'FnDecl') walkFnBody(item, rootScope, index, uri);
  }

  // Pass 3: Build sorted entries for position lookup
  buildEntries(index);

  return index;
}

// ============================================================================
// PASS 1: REGISTRATION
// ============================================================================

function registerFn(fn, scope, index, uri) {
  const range = posToRange(fn.namePos || fn.pos, fn.name);
  const sym = scope.define(fn.name, 'function', range);
  index.definitions.push(sym);
}

function registerType(td, scope, index, uri) {
  const range = posToRange(td.namePos || td.pos, td.name);
  const sym = scope.define(td.name, 'type', range);
  index.definitions.push(sym);
}

function registerImport(imp, scope, index, uri, resolveImportFn) {
  let importedIndex = null;
  if (resolveImportFn) {
    try { importedIndex = resolveImportFn(imp.path, uri); } catch (_e) { /* degrade gracefully */ }
  }

  const resolved = !!importedIndex;
  index.imports.push({ names: imp.names, path: imp.path, resolved });

  for (let i = 0; i < imp.names.length; i++) {
    const name = imp.names[i];
    const tokenPos = imp.nameTokens?.[i];
    const range = tokenPos ? posToRange(tokenPos, name) : posToRange(imp.pos, name);
    const sym = scope.define(name, 'import', range);

    if (importedIndex) {
      const originSym = importedIndex.rootScope.resolve(name);
      if (originSym) {
        sym.originUri = importedIndex.uri;
        sym.originSymbol = originSym;
      }
    }

    index.definitions.push(sym);
  }
}

// ============================================================================
// PASS 2: WALK FUNCTION BODIES
// ============================================================================

function walkFnBody(fn, parentScope, index, uri) {
  const fnScope = new Scope(parentScope, uri);

  // Bind parameters
  for (const param of fn.params) {
    const range = param.namePos ? posToRange(param.namePos, param.name) : posToRange(fn.namePos || fn.pos, param.name);
    const sym = fnScope.define(param.name, 'parameter', range);
    index.definitions.push(sym);
  }

  walkBlock(fn.body, fnScope, index, uri);
}

function walkBlock(block, scope, index, uri) {
  if (!block || !block.statements) return;
  for (const stmt of block.statements) {
    walkStmt(stmt, scope, index, uri);
  }
}

function walkStmt(stmt, scope, index, uri) {
  if (!stmt) return;

  switch (stmt.type) {
    case 'LetStmt': {
      // Walk RHS first (name not yet in scope)
      walkExpr(stmt.value, scope, index, uri);
      const range = posToRange(stmt.namePos || stmt.pos, stmt.name);
      const sym = scope.define(stmt.name, 'variable', range);
      index.definitions.push(sym);
      break;
    }
    case 'ReturnStmt':
      walkExpr(stmt.value, scope, index, uri);
      break;
    case 'ExprStmt':
      walkExpr(stmt.expr, scope, index, uri);
      break;
    case 'IfStmt':
      walkExpr(stmt.cond, scope, index, uri);
      walkBlock(stmt.then, new Scope(scope, uri), index, uri);
      if (stmt.else) walkBlock(stmt.else, new Scope(scope, uri), index, uri);
      break;
    case 'ForStmt': {
      walkExpr(stmt.iterable, scope, index, uri);
      const forScope = new Scope(scope, uri);
      const range = posToRange(stmt.namePos || stmt.pos, stmt.binding);
      const sym = forScope.define(stmt.binding, 'for_binding', range);
      index.definitions.push(sym);
      walkBlock(stmt.body, forScope, index, uri);
      break;
    }
    case 'WhileStmt':
      walkExpr(stmt.cond, scope, index, uri);
      walkBlock(stmt.body, new Scope(scope, uri), index, uri);
      break;
    case 'BreakStmt':
    case 'ContinueStmt':
      break;
    default:
      break;
  }
}

function walkExpr(expr, scope, index, uri) {
  if (!expr) return;

  switch (expr.type) {
    case 'Ident': {
      if (BUILTINS.has(expr.name)) break;
      const sym = scope.resolve(expr.name);
      if (sym) {
        const range = posToRange(expr.pos, expr.name);
        sym.refs.push({ uri, range });
        index.references.push({ name: expr.name, uri, range, symbol: sym });
      }
      break;
    }
    case 'CallExpr':
      walkExpr(expr.callee, scope, index, uri);
      for (const arg of (expr.args || [])) {
        if (arg.type === 'SpreadExpr') walkExpr(arg.arg, scope, index, uri);
        else walkExpr(arg, scope, index, uri);
      }
      break;
    case 'MemberExpr':
    case 'OptionalMemberExpr':
      // Only resolve the object, not the property
      walkExpr(expr.obj, scope, index, uri);
      break;
    case 'IndexExpr':
      walkExpr(expr.obj, scope, index, uri);
      walkExpr(expr.index, scope, index, uri);
      break;
    case 'BinaryExpr':
      walkExpr(expr.left, scope, index, uri);
      walkExpr(expr.right, scope, index, uri);
      break;
    case 'PipeExpr':
      walkExpr(expr.left, scope, index, uri);
      walkExpr(expr.right, scope, index, uri);
      break;
    case 'UnaryExpr':
      walkExpr(expr.arg, scope, index, uri);
      break;
    case 'ArrayExpr':
      for (const elem of (expr.elements || [])) {
        if (elem.type === 'SpreadExpr') walkExpr(elem.arg, scope, index, uri);
        else walkExpr(elem, scope, index, uri);
      }
      break;
    case 'ObjectExpr':
      for (const prop of (expr.props || [])) {
        if (prop.type === 'SpreadProp') walkExpr(prop.arg, scope, index, uri);
        else walkExpr(prop.value, scope, index, uri);
      }
      break;
    case 'SpreadExpr':
      walkExpr(expr.arg, scope, index, uri);
      break;
    case 'MatchExpr': {
      walkExpr(expr.target, scope, index, uri);
      for (const arm of (expr.arms || [])) {
        const armScope = new Scope(scope, uri);
        if (arm.pat && arm.pat !== '_' && arm.pat.binds) {
          for (const bind of arm.pat.binds) {
            const range = posToRange(expr.pos, bind.name);
            const sym = armScope.define(bind.name, 'match_binding', range);
            index.definitions.push(sym);
          }
        }
        if (arm.value) {
          if (arm.value.type === 'Block') walkBlock(arm.value, armScope, index, uri);
          else if (arm.value.type === 'ReturnStmt') walkExpr(arm.value.value, armScope, index, uri);
          else walkExpr(arm.value, armScope, index, uri);
        }
      }
      break;
    }
    case 'LambdaExpr': {
      const lambdaScope = new Scope(scope, uri);
      for (const param of (expr.params || [])) {
        const sym = lambdaScope.define(param.name, 'parameter', posToRange(expr.pos || { line: 0, col: 0 }, param.name));
        index.definitions.push(sym);
      }
      if (expr.body) {
        if (expr.body.type === 'Block') walkBlock(expr.body, lambdaScope, index, uri);
        else walkExpr(expr.body, lambdaScope, index, uri);
      }
      break;
    }
    case 'TemplateLit':
      // Template interpolations are stored as raw strings, not parsed AST.
      // References inside templates are not tracked in this version.
      break;
    case 'NumberLit':
    case 'StringLit':
    case 'BoolLit':
    case 'NullLit':
      break;
    default:
      break;
  }
}

// ============================================================================
// PASS 3: BUILD SORTED ENTRIES
// ============================================================================

function buildEntries(index) {
  for (const sym of index.definitions) {
    index.entries.push({ range: sym.defRange, symbol: sym, isDef: true });
  }
  for (const ref of index.references) {
    index.entries.push({ range: ref.range, symbol: ref.symbol, isDef: false });
  }
  index.entries.sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) return a.range.start.line - b.range.start.line;
    return a.range.start.character - b.range.start.character;
  });
}

// ============================================================================
// IMPORT PATH RESOLUTION
// ============================================================================

export function resolveImportPath(importPath, currentUri) {
  // Handle file:// URIs
  let currentPath;
  if (currentUri.startsWith('file://')) {
    currentPath = currentUri.replace(/^file:\/\/\//, '').replace(/%3A/gi, ':');
  } else {
    currentPath = currentUri;
  }
  // Resolve relative path
  const sep = currentPath.includes('\\') ? '\\' : '/';
  const dir = currentPath.substring(0, currentPath.lastIndexOf(sep));
  // Normalize the import path separators to match
  const normalized = importPath.replace(/\//g, sep);
  // Simple path resolution
  const parts = (dir + sep + normalized).split(sep);
  const resolved = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join(sep);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { Symbol, Scope, FileIndex, containsPosition, posToRange, BUILTINS };
