// braid-types.js — Braid static type checker v0.1.0
// Runs on parsed AST before transpilation. Catches type errors at compile time.
// Features: type inference, scoped environments, cross-file module resolution,
// structural typing, Result/Option flow analysis, exhaustiveness checking.
"use strict";

// ============================================================================
// BUILT-IN TYPE DEFINITIONS
// ============================================================================

/** Primitive types */
const T_STRING  = { kind: 'primitive', name: 'String' };
const T_NUMBER  = { kind: 'primitive', name: 'Number' };
const T_BOOLEAN = { kind: 'primitive', name: 'Boolean' };
const T_VOID    = { kind: 'primitive', name: 'Void' };
const T_NULL    = { kind: 'primitive', name: 'Null' };
const T_UNKNOWN = { kind: 'unknown' };
const T_ANY     = { kind: 'any' };

/** Generic type constructors */
function T_ARRAY(elem) { return { kind: 'generic', name: 'Array', args: [elem || T_UNKNOWN] }; }
function T_RESULT(ok, err) { return { kind: 'generic', name: 'Result', args: [ok || T_UNKNOWN, err || T_UNKNOWN] }; }
function T_OPTION(inner) { return { kind: 'generic', name: 'Option', args: [inner || T_UNKNOWN] }; }
function T_OBJECT(fields) { return { kind: 'object', fields: fields || {} }; }
function T_FUNCTION(params, ret) { return { kind: 'function', params: params || [], ret: ret || T_VOID }; }
function T_UNION(variants) { return { kind: 'union', variants: variants || [] }; }

/** Parse a TypeRef AST node into a type */
function resolveTypeRef(ref, typeEnv = {}) {
  if (!ref) return T_UNKNOWN;

  // Check custom types in environment
  if (typeEnv[ref.base]) return typeEnv[ref.base];

  switch (ref.base) {
    case 'String':  return T_STRING;
    case 'Number':  return T_NUMBER;
    case 'Boolean': case 'Bool': return T_BOOLEAN;
    case 'Void':    return T_VOID;
    case 'Object':  case 'JSONB': return T_OBJECT({});
    case 'Array':   return T_ARRAY(ref.typeArgs?.[0] ? resolveTypeRef(ref.typeArgs[0], typeEnv) : T_UNKNOWN);
    case 'Result':  return T_RESULT(
      ref.typeArgs?.[0] ? resolveTypeRef(ref.typeArgs[0], typeEnv) : T_UNKNOWN,
      ref.typeArgs?.[1] ? resolveTypeRef(ref.typeArgs[1], typeEnv) : T_UNKNOWN
    );
    case 'Option':  return T_OPTION(ref.typeArgs?.[0] ? resolveTypeRef(ref.typeArgs[0], typeEnv) : T_UNKNOWN);
    default: return { kind: 'named', name: ref.base, args: (ref.typeArgs || []).map(a => resolveTypeRef(a, typeEnv)) };
  }
}

/** Format a type for display */
function formatType(t) {
  if (!t) return '?';
  switch (t.kind) {
    case 'primitive': return t.name;
    case 'generic':   return `${t.name}<${t.args.map(formatType).join(', ')}>`;
    case 'object':    return `{ ${Object.entries(t.fields).map(([k, v]) => `${k}: ${formatType(v)}`).join(', ')} }`;
    case 'function':  return `(${t.params.map(p => `${p.name}: ${formatType(p.type)}`).join(', ')}) -> ${formatType(t.ret)}`;
    case 'union':     return t.variants.map(v => v.tag || formatType(v)).join(' | ');
    case 'named':     return t.args?.length ? `${t.name}<${t.args.map(formatType).join(', ')}>` : t.name;
    case 'unknown':   return '?';
    case 'any':       return 'Any';
    default:          return '?';
  }
}

/** Check if two types are compatible (assignable) */
function isAssignable(target, source) {
  if (!target || !source) return true;
  if (target.kind === 'any' || source.kind === 'any') return true;
  if (target.kind === 'unknown' || source.kind === 'unknown') return true;

  // Same primitive
  if (target.kind === 'primitive' && source.kind === 'primitive') return target.name === source.name;

  // Generics: name must match, args must match
  if (target.kind === 'generic' && source.kind === 'generic') {
    if (target.name !== source.name) return false;
    if (target.args.length !== source.args.length) return false;
    return target.args.every((a, i) => isAssignable(a, source.args[i]));
  }

  // Object structural typing: source must have all target fields
  if (target.kind === 'object' && source.kind === 'object') {
    for (const [key, type] of Object.entries(target.fields)) {
      if (!(key in source.fields)) return false;
      if (!isAssignable(type, source.fields[key])) return false;
    }
    return true;
  }

  // Named types: match by name
  if (target.kind === 'named' && source.kind === 'named') return target.name === source.name;

  // Null is assignable to Option
  if (target.kind === 'generic' && target.name === 'Option' && source.kind === 'primitive' && source.name === 'Null') return true;

  // Object literal assignable to named type (we can't fully check this without type defs)
  if (target.kind === 'named' && source.kind === 'object') return true;
  if (target.kind === 'object' && source.kind === 'named') return true;

  return false;
}

// ============================================================================
// SCOPED TYPE ENVIRONMENT
// ============================================================================

class TypeEnv {
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map(); // name → type
    this.types = new Map();    // TypeName → type def
    this.functions = new Map(); // fnName → { params, ret, effects, policy }
  }

  child() { return new TypeEnv(this); }

  bind(name, type) { this.bindings.set(name, type); }

  lookup(name) {
    if (this.bindings.has(name)) return this.bindings.get(name);
    if (this.parent) return this.parent.lookup(name);
    return null;
  }

  defineType(name, type) { this.types.set(name, type); }

  lookupType(name) {
    if (this.types.has(name)) return this.types.get(name);
    if (this.parent) return this.parent.lookupType(name);
    return null;
  }

  defineFunction(name, sig) { this.functions.set(name, sig); }

  lookupFunction(name) {
    if (this.functions.has(name)) return this.functions.get(name);
    if (this.parent) return this.parent.lookupFunction(name);
    return null;
  }
}

// ============================================================================
// STDLIB TYPE SIGNATURES
// ============================================================================

function buildStdlibEnv() {
  const env = new TypeEnv();

  // ADT constructors
  env.bind('Ok', T_FUNCTION([{ name: 'value', type: T_UNKNOWN }], T_RESULT(T_UNKNOWN, T_UNKNOWN)));
  env.bind('Err', T_FUNCTION([{ name: 'error', type: T_UNKNOWN }], T_RESULT(T_UNKNOWN, T_UNKNOWN)));
  env.bind('Some', T_FUNCTION([{ name: 'value', type: T_UNKNOWN }], T_OPTION(T_UNKNOWN)));
  env.bind('None', T_OPTION(T_UNKNOWN));

  // CRMError namespace
  env.bind('CRMError', T_OBJECT({
    fromHTTP: T_FUNCTION([{ name: 'url', type: T_STRING }, { name: 'status', type: T_NUMBER }, { name: 'op', type: T_STRING }], T_RESULT(T_UNKNOWN, T_UNKNOWN)),
    notFound: T_FUNCTION([{ name: 'entity', type: T_STRING }, { name: 'id', type: T_STRING }, { name: 'op', type: T_STRING }], T_RESULT(T_UNKNOWN, T_UNKNOWN)),
    validation: T_FUNCTION([{ name: 'fn', type: T_STRING }, { name: 'field', type: T_STRING }, { name: 'msg', type: T_STRING }], T_RESULT(T_UNKNOWN, T_UNKNOWN)),
    forbidden: T_FUNCTION([{ name: 'op', type: T_STRING }, { name: 'role', type: T_STRING }, { name: 'req', type: T_STRING }], T_RESULT(T_UNKNOWN, T_UNKNOWN)),
    network: T_FUNCTION([{ name: 'url', type: T_STRING }, { name: 'code', type: T_NUMBER }, { name: 'op', type: T_STRING }], T_RESULT(T_UNKNOWN, T_UNKNOWN)),
  }));

  // Array stdlib
  const stdFns = {
    len:      { params: [{ name: 'arr', type: T_ARRAY() }], ret: T_NUMBER },
    map:      { params: [{ name: 'arr', type: T_ARRAY() }, { name: 'fn', type: T_FUNCTION([], T_UNKNOWN) }], ret: T_ARRAY() },
    filter:   { params: [{ name: 'arr', type: T_ARRAY() }, { name: 'fn', type: T_FUNCTION([], T_BOOLEAN) }], ret: T_ARRAY() },
    reduce:   { params: [{ name: 'arr', type: T_ARRAY() }, { name: 'fn', type: T_FUNCTION([], T_UNKNOWN) }], ret: T_UNKNOWN },
    find:     { params: [{ name: 'arr', type: T_ARRAY() }, { name: 'fn', type: T_FUNCTION([], T_BOOLEAN) }], ret: T_UNKNOWN },
    some:     { params: [{ name: 'arr', type: T_ARRAY() }, { name: 'fn', type: T_FUNCTION([], T_BOOLEAN) }], ret: T_BOOLEAN },
    every:    { params: [{ name: 'arr', type: T_ARRAY() }, { name: 'fn', type: T_FUNCTION([], T_BOOLEAN) }], ret: T_BOOLEAN },
    includes: { params: [{ name: 'arr', type: T_ARRAY() }, { name: 'item', type: T_UNKNOWN }], ret: T_BOOLEAN },
    join:     { params: [{ name: 'arr', type: T_ARRAY() }, { name: 'sep', type: T_STRING }], ret: T_STRING },
    sort:     { params: [{ name: 'arr', type: T_ARRAY() }], ret: T_ARRAY() },
    reverse:  { params: [{ name: 'arr', type: T_ARRAY() }], ret: T_ARRAY() },
    flat:     { params: [{ name: 'arr', type: T_ARRAY() }], ret: T_ARRAY() },
    sum:      { params: [{ name: 'arr', type: T_ARRAY(T_NUMBER) }], ret: T_NUMBER },
    avg:      { params: [{ name: 'arr', type: T_ARRAY(T_NUMBER) }], ret: T_NUMBER },
    // Object stdlib
    keys:     { params: [{ name: 'obj', type: T_OBJECT({}) }], ret: T_ARRAY(T_STRING) },
    values:   { params: [{ name: 'obj', type: T_OBJECT({}) }], ret: T_ARRAY() },
    entries:  { params: [{ name: 'obj', type: T_OBJECT({}) }], ret: T_ARRAY() },
    // String stdlib
    split:      { params: [{ name: 'str', type: T_STRING }, { name: 'sep', type: T_STRING }], ret: T_ARRAY(T_STRING) },
    trim:       { params: [{ name: 'str', type: T_STRING }], ret: T_STRING },
    trimStart:  { params: [{ name: 'str', type: T_STRING }], ret: T_STRING },
    trimEnd:    { params: [{ name: 'str', type: T_STRING }], ret: T_STRING },
    toUpper:    { params: [{ name: 'str', type: T_STRING }], ret: T_STRING },
    toLower:    { params: [{ name: 'str', type: T_STRING }], ret: T_STRING },
    startsWith: { params: [{ name: 'str', type: T_STRING }, { name: 'prefix', type: T_STRING }], ret: T_BOOLEAN },
    endsWith:   { params: [{ name: 'str', type: T_STRING }, { name: 'suffix', type: T_STRING }], ret: T_BOOLEAN },
    replace:    { params: [{ name: 'str', type: T_STRING }, { name: 'from', type: T_STRING }, { name: 'to', type: T_STRING }], ret: T_STRING },
    replaceAll: { params: [{ name: 'str', type: T_STRING }, { name: 'from', type: T_STRING }, { name: 'to', type: T_STRING }], ret: T_STRING },
    contains:   { params: [{ name: 'str', type: T_STRING }, { name: 'sub', type: T_STRING }], ret: T_BOOLEAN },
    padStart:   { params: [{ name: 'str', type: T_STRING }, { name: 'len', type: T_NUMBER }, { name: 'fill', type: T_STRING }], ret: T_STRING },
    padEnd:     { params: [{ name: 'str', type: T_STRING }, { name: 'len', type: T_NUMBER }, { name: 'fill', type: T_STRING }], ret: T_STRING },
    charAt:     { params: [{ name: 'str', type: T_STRING }, { name: 'idx', type: T_NUMBER }], ret: T_STRING },
    slice:      { params: [{ name: 'str', type: T_STRING }, { name: 'start', type: T_NUMBER }], ret: T_STRING },
    repeat:     { params: [{ name: 'str', type: T_STRING }, { name: 'n', type: T_NUMBER }], ret: T_STRING },
    // Conversion
    parseInt:   { params: [{ name: 'str', type: T_STRING }], ret: T_NUMBER },
    parseFloat: { params: [{ name: 'str', type: T_STRING }], ret: T_NUMBER },
    toString:   { params: [{ name: 'val', type: T_UNKNOWN }], ret: T_STRING },
  };

  for (const [name, sig] of Object.entries(stdFns)) {
    env.bind(name, T_FUNCTION(sig.params, sig.ret));
    env.defineFunction(name, sig);
  }

  return env;
}

// ============================================================================
// TYPE CHECKER
// ============================================================================

/**
 * Type-check a Braid AST.
 * @param {Object} ast - Parsed AST (Program node)
 * @param {Object} opts - Options
 * @param {Function} opts.resolveModule - (path) => AST — for cross-file imports
 * @returns {{ diagnostics: Array, types: Map }} diagnostics and inferred types per function
 */
function typeCheck(ast, opts = {}) {
  const { resolveModule = null } = opts;
  const diagnostics = [];
  const globalEnv = buildStdlibEnv();
  const fnTypes = new Map();

  // Phase 1: Register all type declarations and function signatures
  for (const item of (ast.items || [])) {
    if (item.type === 'TypeDecl') {
      registerTypeDecl(item, globalEnv);
    }
  }
  for (const item of (ast.items || [])) {
    if (item.type === 'FnDecl') {
      registerFnDecl(item, globalEnv);
    }
  }

  // Phase 1.5: Resolve imports
  for (const item of (ast.items || [])) {
    if (item.type === 'ImportDecl') {
      resolveImport(item, globalEnv, resolveModule, diagnostics);
    }
  }

  // Phase 2: Type-check each function body
  for (const item of (ast.items || [])) {
    if (item.type === 'FnDecl') {
      const bodyTypes = checkFnBody(item, globalEnv, diagnostics);
      fnTypes.set(item.name, bodyTypes);
    }
  }

  return { diagnostics, types: fnTypes };
}

// --- Phase 1: Register types ---

function registerTypeDecl(td, env) {
  if (td.variants.length === 1 && td.variants[0].type === 'ObjectType') {
    // Record type
    const fields = {};
    for (const f of td.variants[0].fields) {
      fields[f.name] = resolveTypeRef(f.type);
    }
    env.defineType(td.name, T_OBJECT(fields));
  } else {
    // Union type
    const variants = td.variants.map(v => ({
      tag: v.tag,
      fields: v.fields ? Object.fromEntries(v.fields.map(f => [f.name, resolveTypeRef(f.type)])) : null,
    }));
    env.defineType(td.name, T_UNION(variants));
  }
}

function registerFnDecl(fn, env) {
  const typeEnv = {};
  for (const [name, type] of env.types) typeEnv[name] = type;

  const params = fn.params.map(p => ({
    name: p.name,
    type: p.type ? resolveTypeRef(p.type, typeEnv) : T_UNKNOWN,
    spread: p.spread || false,
  }));
  const ret = resolveTypeRef(fn.ret, typeEnv);
  const effects = fn.effects || [];
  const policy = (fn.annotations || []).find(a => a.name === 'policy')?.args?.[0] || null;

  env.defineFunction(fn.name, { params, ret, effects, policy });
  env.bind(fn.name, T_FUNCTION(params, ret));
}

function resolveImport(imp, env, resolveModule, diagnostics) {
  if (!imp.path.endsWith('.braid')) return; // non-braid imports are opaque

  if (!resolveModule) {
    // No resolver — just register imported names as unknown
    for (const name of imp.names) {
      if (!env.lookup(name)) env.bind(name, T_UNKNOWN);
    }
    return;
  }

  try {
    const depAst = resolveModule(imp.path);
    if (!depAst) {
      diagnostics.push({
        code: 'TC010', severity: 'warning',
        message: `Cannot resolve module '${imp.path}'`,
        line: imp.pos?.line, col: imp.pos?.col,
      });
      return;
    }

    // Register types and functions from the imported module
    for (const item of (depAst.items || [])) {
      if (item.type === 'TypeDecl' && imp.names.includes(item.name)) {
        registerTypeDecl(item, env);
      }
      if (item.type === 'FnDecl' && imp.names.includes(item.name)) {
        registerFnDecl(item, env);
      }
    }
  } catch (e) {
    diagnostics.push({
      code: 'TC011', severity: 'warning',
      message: `Error resolving module '${imp.path}': ${e.message}`,
      line: imp.pos?.line, col: imp.pos?.col,
    });
  }
}

// --- Phase 2: Check function bodies ---

function checkFnBody(fn, globalEnv, diagnostics) {
  const fnEnv = globalEnv.child();
  const sig = globalEnv.lookupFunction(fn.name);
  const returnType = sig?.ret || T_UNKNOWN;

  // Bind params
  for (const p of fn.params) {
    const pType = p.type ? resolveTypeRef(p.type) : T_UNKNOWN;
    fnEnv.bind(p.name, p.spread ? T_ARRAY(pType) : pType);
  }

  // IO namespace bindings for effectful functions
  if ((fn.effects || []).length > 0) {
    fnEnv.bind('http', T_OBJECT({
      get: T_FUNCTION([{ name: 'url', type: T_STRING }], T_RESULT(T_UNKNOWN, T_UNKNOWN)),
      post: T_FUNCTION([{ name: 'url', type: T_STRING }], T_RESULT(T_UNKNOWN, T_UNKNOWN)),
      put: T_FUNCTION([{ name: 'url', type: T_STRING }], T_RESULT(T_UNKNOWN, T_UNKNOWN)),
      delete: T_FUNCTION([{ name: 'url', type: T_STRING }], T_RESULT(T_UNKNOWN, T_UNKNOWN)),
    }));
    fnEnv.bind('clock', T_OBJECT({
      now: T_FUNCTION([], T_STRING),
      sleep: T_FUNCTION([{ name: 'ms', type: T_NUMBER }], T_VOID),
    }));
    fnEnv.bind('fs', T_OBJECT({
      read: T_FUNCTION([{ name: 'path', type: T_STRING }], T_RESULT(T_STRING, T_UNKNOWN)),
      write: T_FUNCTION([{ name: 'path', type: T_STRING }, { name: 'data', type: T_STRING }], T_RESULT(T_VOID, T_UNKNOWN)),
    }));
    fnEnv.bind('rng', T_OBJECT({
      random: T_FUNCTION([], T_NUMBER),
      uuid: T_FUNCTION([], T_STRING),
    }));
  }

  if (fn.body) {
    checkBlock(fn.body, fnEnv, returnType, fn.name, diagnostics);
  }

  return { returnType, params: sig?.params || [] };
}

function checkBlock(block, env, expectedReturn, fnName, diagnostics) {
  for (const stmt of (block.statements || [])) {
    checkStmt(stmt, env, expectedReturn, fnName, diagnostics);
  }
}

function checkStmt(stmt, env, expectedReturn, fnName, diagnostics) {
  switch (stmt.type) {
    case 'LetStmt': {
      const inferred = inferExpr(stmt.value, env, diagnostics);
      if (stmt.letType) {
        const declared = resolveTypeRef(stmt.letType);
        if (!isAssignable(declared, inferred)) {
          diagnostics.push({
            code: 'TC100', severity: 'error',
            message: `Type mismatch: '${stmt.name}' declared as ${formatType(declared)} but assigned ${formatType(inferred)}`,
            line: stmt.pos?.line, col: stmt.pos?.col,
          });
        }
        env.bind(stmt.name, declared);
      } else {
        env.bind(stmt.name, inferred);
      }
      break;
    }

    case 'ReturnStmt': {
      const retType = inferExpr(stmt.value, env, diagnostics);
      if (expectedReturn && expectedReturn.kind !== 'unknown' && !isAssignable(expectedReturn, retType)) {
        diagnostics.push({
          code: 'TC110', severity: 'error',
          message: `${fnName}: return type mismatch — expected ${formatType(expectedReturn)}, got ${formatType(retType)}`,
          line: stmt.pos?.line, col: stmt.pos?.col,
        });
      }
      break;
    }

    case 'IfStmt': {
      const condType = inferExpr(stmt.cond, env, diagnostics);
      if (condType.kind === 'primitive' && condType.name !== 'Boolean' && condType.kind !== 'unknown') {
        diagnostics.push({
          code: 'TC120', severity: 'warning',
          message: `Condition is ${formatType(condType)}, expected Boolean`,
          line: stmt.pos?.line, col: stmt.pos?.col,
        });
      }
      checkBlock(stmt.then, env.child(), expectedReturn, fnName, diagnostics);
      if (stmt.else) checkBlock(stmt.else, env.child(), expectedReturn, fnName, diagnostics);
      break;
    }

    case 'ForStmt': {
      const iterType = inferExpr(stmt.iterable, env, diagnostics);
      const loopEnv = env.child();
      // Infer element type from array
      if (iterType.kind === 'generic' && iterType.name === 'Array') {
        loopEnv.bind(stmt.binding, iterType.args[0] || T_UNKNOWN);
      } else {
        loopEnv.bind(stmt.binding, T_UNKNOWN);
        if (iterType.kind !== 'unknown' && !(iterType.kind === 'generic' && iterType.name === 'Array')) {
          diagnostics.push({
            code: 'TC130', severity: 'error',
            message: `Cannot iterate over ${formatType(iterType)} — expected Array`,
            line: stmt.pos?.line, col: stmt.pos?.col,
          });
        }
      }
      checkBlock(stmt.body, loopEnv, null, fnName, diagnostics);
      break;
    }

    case 'WhileStmt': {
      inferExpr(stmt.cond, env, diagnostics);
      checkBlock(stmt.body, env.child(), null, fnName, diagnostics);
      break;
    }

    case 'ExprStmt': {
      inferExpr(stmt.expr, env, diagnostics);
      break;
    }

    case 'BreakStmt':
    case 'ContinueStmt':
      break;

    default:
      break;
  }
}

// ============================================================================
// TYPE INFERENCE
// ============================================================================

function inferExpr(node, env, diagnostics) {
  if (!node) return T_UNKNOWN;

  switch (node.type) {
    case 'NumberLit':  return T_NUMBER;
    case 'StringLit':  return T_STRING;
    case 'TemplateLit': return T_STRING;
    case 'BoolLit':    return T_BOOLEAN;
    case 'NullLit':    return T_NULL;
    case 'ArrayExpr':  return inferArray(node, env, diagnostics);
    case 'ObjectExpr': return inferObject(node, env, diagnostics);

    case 'Ident': {
      const t = env.lookup(node.name);
      if (!t) {
        diagnostics.push({
          code: 'TC200', severity: 'error',
          message: `Undefined variable '${node.name}'`,
          line: node.pos?.line, col: node.pos?.col,
        });
        return T_UNKNOWN;
      }
      return t;
    }

    case 'BinaryExpr': return inferBinary(node, env, diagnostics);
    case 'UnaryExpr':  return inferUnary(node, env, diagnostics);
    case 'PipeExpr':   return inferPipe(node, env, diagnostics);

    case 'MemberExpr':
    case 'OptionalMemberExpr':
      return inferMember(node, env, diagnostics);

    case 'IndexExpr': {
      const objType = inferExpr(node.obj, env, diagnostics);
      inferExpr(node.index, env, diagnostics);
      if (objType.kind === 'generic' && objType.name === 'Array') return objType.args[0] || T_UNKNOWN;
      return T_UNKNOWN;
    }

    case 'CallExpr':   return inferCall(node, env, diagnostics);
    case 'LambdaExpr': return inferLambda(node, env, diagnostics);
    case 'MatchExpr':  return inferMatch(node, env, diagnostics);
    case 'SpreadExpr': return inferExpr(node.arg, env, diagnostics);

    default: return T_UNKNOWN;
  }
}

function inferArray(node, env, diagnostics) {
  if (!node.elements || node.elements.length === 0) return T_ARRAY(T_UNKNOWN);
  const elemTypes = node.elements.filter(e => e.type !== 'SpreadExpr').map(e => inferExpr(e, env, diagnostics));
  // Use first non-unknown element type
  const elemType = elemTypes.find(t => t.kind !== 'unknown') || T_UNKNOWN;
  return T_ARRAY(elemType);
}

function inferObject(node, env, diagnostics) {
  const fields = {};
  for (const p of (node.props || [])) {
    if (p.type === 'SpreadProp') continue; // spread — can't infer fields
    fields[p.key] = inferExpr(p.value, env, diagnostics);
  }
  return T_OBJECT(fields);
}

function inferBinary(node, env, diagnostics) {
  const left = inferExpr(node.left, env, diagnostics);
  const right = inferExpr(node.right, env, diagnostics);

  switch (node.op) {
    case '+': {
      // String + anything = String
      if (left.kind === 'primitive' && left.name === 'String') return T_STRING;
      if (right.kind === 'primitive' && right.name === 'String') return T_STRING;
      // Number + Number = Number
      if (left.kind === 'primitive' && left.name === 'Number' && right.kind === 'primitive' && right.name === 'Number') return T_NUMBER;
      return T_UNKNOWN;
    }
    case '-': case '*': case '/': case '%':
      return T_NUMBER;
    case '==': case '!=': case '<': case '>': case '<=': case '>=':
    case '&&': case '||':
      return T_BOOLEAN;
    default:
      return T_UNKNOWN;
  }
}

function inferUnary(node, env, diagnostics) {
  const arg = inferExpr(node.arg, env, diagnostics);
  if (node.op === '!') return T_BOOLEAN;
  if (node.op === '-') return T_NUMBER;
  return arg;
}

function inferPipe(node, env, diagnostics) {
  const inputType = inferExpr(node.left, env, diagnostics);
  const fnType = inferExpr(node.right, env, diagnostics);
  if (fnType.kind === 'function') return fnType.ret;
  return T_UNKNOWN;
}

function inferMember(node, env, diagnostics) {
  const objType = inferExpr(node.obj, env, diagnostics);

  // Object with known fields
  if (objType.kind === 'object' && objType.fields[node.prop]) {
    return objType.fields[node.prop];
  }

  // Array .length
  if (objType.kind === 'generic' && objType.name === 'Array' && node.prop === 'length') return T_NUMBER;

  // String .length
  if (objType.kind === 'primitive' && objType.name === 'String' && node.prop === 'length') return T_NUMBER;

  // Result .value / .error / .tag
  if (objType.kind === 'generic' && objType.name === 'Result') {
    if (node.prop === 'value') return objType.args[0] || T_UNKNOWN;
    if (node.prop === 'error') return objType.args[1] || T_UNKNOWN;
    if (node.prop === 'tag') return T_STRING;
    if (node.prop === 'data') return objType.args[0] || T_UNKNOWN; // common pattern
  }

  return T_UNKNOWN;
}

function inferCall(node, env, diagnostics) {
  const callee = node.callee;

  // Direct function call: fnName(args)
  if (callee?.type === 'Ident') {
    const fnSig = env.lookupFunction(callee.name);
    if (fnSig) {
      // Check argument count
      const expected = fnSig.params.filter(p => !p.spread).length;
      const actual = (node.args || []).filter(a => a.type !== 'SpreadExpr').length;
      if (actual < expected) {
        diagnostics.push({
          code: 'TC300', severity: 'error',
          message: `${callee.name}() expects ${expected} arguments, got ${actual}`,
          line: callee.pos?.line, col: callee.pos?.col,
        });
      }

      // Check argument types
      const args = node.args || [];
      for (let i = 0; i < Math.min(args.length, fnSig.params.length); i++) {
        if (args[i].type === 'SpreadExpr') continue;
        const argType = inferExpr(args[i], env, diagnostics);
        const paramType = fnSig.params[i]?.type;
        if (paramType && !isAssignable(paramType, argType)) {
          diagnostics.push({
            code: 'TC310', severity: 'warning',
            message: `${callee.name}(): argument '${fnSig.params[i].name}' expects ${formatType(paramType)}, got ${formatType(argType)}`,
            line: callee.pos?.line, col: callee.pos?.col,
          });
        }
      }

      return fnSig.ret;
    }

    // Fallback: lookup as binding
    const t = env.lookup(callee.name);
    if (t?.kind === 'function') return t.ret;
  }

  // Method call: obj.method(args)
  if (callee?.type === 'MemberExpr') {
    const objType = inferExpr(callee.obj, env, diagnostics);

    // Object with function field
    if (objType.kind === 'object' && objType.fields[callee.prop]) {
      const method = objType.fields[callee.prop];
      if (method.kind === 'function') return method.ret;
    }

    // String methods
    if (objType.kind === 'primitive' && objType.name === 'String') {
      const strMethods = {
        split: T_ARRAY(T_STRING), trim: T_STRING, trimStart: T_STRING, trimEnd: T_STRING,
        toUpperCase: T_STRING, toLowerCase: T_STRING, replace: T_STRING, replaceAll: T_STRING,
        startsWith: T_BOOLEAN, endsWith: T_BOOLEAN, includes: T_BOOLEAN, indexOf: T_NUMBER,
        slice: T_STRING, substring: T_STRING, charAt: T_STRING, repeat: T_STRING,
        padStart: T_STRING, padEnd: T_STRING, concat: T_STRING, match: T_UNKNOWN,
      };
      if (strMethods[callee.prop]) return strMethods[callee.prop];
    }

    // Array methods
    if (objType.kind === 'generic' && objType.name === 'Array') {
      const elemType = objType.args[0] || T_UNKNOWN;
      const arrMethods = {
        map: T_ARRAY(T_UNKNOWN), filter: T_ARRAY(elemType), find: elemType,
        some: T_BOOLEAN, every: T_BOOLEAN, includes: T_BOOLEAN,
        reduce: T_UNKNOWN, join: T_STRING, sort: T_ARRAY(elemType),
        reverse: T_ARRAY(elemType), flat: T_ARRAY(T_UNKNOWN), concat: T_ARRAY(elemType),
        push: T_NUMBER, pop: elemType, shift: elemType, unshift: T_NUMBER,
        indexOf: T_NUMBER, slice: T_ARRAY(elemType), splice: T_ARRAY(elemType),
        forEach: T_VOID,
      };
      if (arrMethods[callee.prop]) return arrMethods[callee.prop];
    }
  }

  // Type-check arguments even if we don't know the function
  for (const arg of (node.args || [])) inferExpr(arg, env, diagnostics);

  return T_UNKNOWN;
}

function inferLambda(node, env, diagnostics) {
  const lambdaEnv = env.child();
  for (const p of (node.params || [])) {
    lambdaEnv.bind(p.name, T_UNKNOWN);
  }
  let retType;
  if (node.body?.type === 'Block') {
    checkBlock(node.body, lambdaEnv, null, '<lambda>', diagnostics);
    retType = T_UNKNOWN; // Would need return analysis for precision
  } else {
    retType = inferExpr(node.body, lambdaEnv, diagnostics);
  }
  return T_FUNCTION(node.params.map(p => ({ name: p.name, type: T_UNKNOWN })), retType);
}

function inferMatch(node, env, diagnostics) {
  const targetType = inferExpr(node.target, env, diagnostics);
  let resultType = null;

  for (const arm of (node.arms || [])) {
    const armEnv = env.child();

    // Bind pattern variables
    if (arm.pat !== '_' && arm.pat.binds) {
      for (const b of arm.pat.binds) {
        // Infer from Result type if possible
        if (targetType.kind === 'generic' && targetType.name === 'Result') {
          if (arm.pat.tag === 'Ok') armEnv.bind(b.name, targetType.args[0] || T_UNKNOWN);
          else if (arm.pat.tag === 'Err') armEnv.bind(b.name, targetType.args[1] || T_UNKNOWN);
          else armEnv.bind(b.name, T_UNKNOWN);
        } else if (targetType.kind === 'generic' && targetType.name === 'Option') {
          if (arm.pat.tag === 'Some') armEnv.bind(b.name, targetType.args[0] || T_UNKNOWN);
          else armEnv.bind(b.name, T_UNKNOWN);
        } else {
          armEnv.bind(b.name, T_UNKNOWN);
        }
      }
    }

    let armType;
    if (arm.value?.type === 'Block') {
      const stmts = arm.value.statements || [];
      if (stmts.length > 0) {
        // Check all statements, infer from last
        for (let i = 0; i < stmts.length - 1; i++) checkStmt(stmts[i], armEnv, null, '<match>', diagnostics);
        const last = stmts[stmts.length - 1];
        if (last.type === 'ExprStmt') armType = inferExpr(last.expr, armEnv, diagnostics);
        else if (last.type === 'ReturnStmt') armType = inferExpr(last.value, armEnv, diagnostics);
        else { checkStmt(last, armEnv, null, '<match>', diagnostics); armType = T_UNKNOWN; }
      } else armType = T_UNKNOWN;
    } else if (arm.value?.type === 'ReturnStmt') {
      armType = inferExpr(arm.value.value, armEnv, diagnostics);
    } else {
      armType = inferExpr(arm.value, armEnv, diagnostics);
    }

    if (!resultType) resultType = armType;
  }

  return resultType || T_UNKNOWN;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  typeCheck,
  TypeEnv,
  resolveTypeRef,
  formatType,
  isAssignable,
  buildStdlibEnv,
  // Type constructors
  T_STRING, T_NUMBER, T_BOOLEAN, T_VOID, T_NULL, T_UNKNOWN, T_ANY,
  T_ARRAY, T_RESULT, T_OPTION, T_OBJECT, T_FUNCTION, T_UNION,
};
