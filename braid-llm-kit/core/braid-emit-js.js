// braid-emit-js.js — JavaScript code emitter for Braid IR
// Consumes the target-agnostic IR from braid-ir.js and produces JavaScript.
// This is one backend. Others (Python, Rust, etc.) consume the same IR.
"use strict";

import { walkIR } from './braid-ir.js';

// ============================================================================
// JS-SPECIFIC CONFIGURATION
// ============================================================================

const JS_TYPE_MAP = {
  String: 'string', Number: 'number', Boolean: 'boolean', Bool: 'boolean',
  Array: null, Object: null, JSONB: null, Void: null, Any: null, Null: null,
};

const JS_STDLIB = {
  len:        (args) => `(${args[0]}).length`,
  map:        (args) => `(${args[0]}).map(${args[1]})`,
  filter:     (args) => `(${args[0]}).filter(${args[1]})`,
  reduce:     (args) => args.length === 3 ? `(${args[0]}).reduce(${args[1]}, ${args[2]})` : `(${args[0]}).reduce(${args[1]})`,
  find:       (args) => `(${args[0]}).find(${args[1]})`,
  some:       (args) => `(${args[0]}).some(${args[1]})`,
  every:      (args) => `(${args[0]}).every(${args[1]})`,
  includes:   (args) => `(${args[0]}).includes(${args[1]})`,
  join:       (args) => `(${args[0]}).join(${args[1]})`,
  sort:       (args) => args.length === 2 ? `(${args[0]}).sort(${args[1]})` : `(${args[0]}).sort()`,
  reverse:    (args) => `(${args[0]}).reverse()`,
  flat:       (args) => args.length === 2 ? `(${args[0]}).flat(${args[1]})` : `(${args[0]}).flat()`,
  sum:        (args) => `(${args[0]}).reduce((a,b)=>a+b,0)`,
  avg:        (args) => `((${args[0]}).reduce((a,b)=>a+b,0)/(${args[0]}).length)`,
  keys:       (args) => `Object.keys(${args[0]})`,
  values:     (args) => `Object.values(${args[0]})`,
  entries:    (args) => `Object.entries(${args[0]})`,
  parseInt:   (args) => `parseInt(${args.join(', ')})`,
  parseFloat: (args) => `parseFloat(${args[0]})`,
  toString:   (args) => `String(${args[0]})`,
};

const ASYNC_IO_CALLS = new Set(['http.get', 'http.post', 'http.put', 'http.delete', 'clock.sleep', 'fs.read', 'fs.write']);

const DANGEROUS_IDENTS = new Set([
  'eval', 'Function', 'GeneratorFunction', 'AsyncFunction',
  'Proxy', 'Reflect', 'globalThis', 'window', 'global',
  'process', 'require', 'module', 'exports',
  '__filename', '__dirname', 'importScripts',
  'XMLHttpRequest', 'WebSocket', 'fetch',
  'setTimeout', 'setInterval', 'setImmediate',
]);

const DANGEROUS_PROPS = new Set([
  '__proto__', 'constructor', 'prototype',
  '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__',
]);

// ============================================================================
// EMITTER
// ============================================================================

/**
 * Emit JavaScript from Braid IR.
 * @param {Object} ir - IR from lower()
 * @param {Object} opts
 * @param {boolean} opts.sandbox - Enable sandbox guards
 * @param {string} opts.runtimeImport - Path to braid-rt.js
 * @returns {{ code: string, diagnostics: Array }}
 */
export function emitJS(ir, opts = {}) {
  const {
    sandbox = false,
    runtimeImport = './braid-rt.js',
  } = opts;

  const out = [];
  const diags = [];

  // Runtime imports
  out.push(`"use strict";`);
  out.push(`import { Ok, Err, IO, cap, checkType, CRMError } from "${runtimeImport}";`);

  if (sandbox) {
    const sbPath = runtimeImport.replace('braid-rt.js', 'braid-sandbox.js');
    out.push(`import { safeGet, safeSet, guardGlobal } from "${sbPath}";`);
  }

  const ctx = { sandbox, diags, effectful: false };

  for (const decl of (ir.decls || [])) {
    switch (decl.kind) {
      case 'FnDecl':    out.push(emitFnDecl(decl, ctx)); break;
      case 'TypeDecl':  out.push(emitTypeDecl(decl, ctx)); break;
      case 'ImportDecl': out.push(emitImportDecl(decl, ctx)); break;
    }
  }

  return { code: out.join('\n\n'), diagnostics: diags };
}

// ============================================================================
// DECLARATIONS
// ============================================================================

function emitFnDecl(decl, ctx) {
  const isEffectful = decl.effects.length > 0;
  const asyncKw = isEffectful ? 'async ' : '';

  const params = (isEffectful ? ['policy', 'deps'] : []).concat(
    decl.params.map(p => p.spread ? `...${p.name}` : p.name)
  );

  let prolog = '';

  // Type validation
  for (const p of decl.params) {
    if (!p.type) continue;
    const jsType = JS_TYPE_MAP[p.type.base];
    if (jsType) {
      prolog += `  checkType("${decl.name}", "${p.name}", ${p.name}, "${jsType}");\n`;
    } else if (p.type.base === 'Array') {
      prolog += `  if (!Array.isArray(${p.name})) throw Object.assign(new Error("[BRAID_TYPE] ${decl.name}(): '${p.name}' expected Array, got " + typeof ${p.name}), { code: 'BRAID_TYPE' });\n`;
    }
  }

  // Effect capability checks
  if (isEffectful) {
    for (const e of decl.effects) prolog += `  cap(policy, "${e}");\n`;
    prolog += `  const io = IO(policy, deps);\n`;
    prolog += `  const { http, clock, fs, rng } = io;\n`;
  }

  const fnCtx = { ...ctx, effectful: isEffectful };
  const body = emitInstrs(decl.body, fnCtx, 1);

  return `export ${asyncKw}function ${decl.name}(${params.join(', ')}) {\n${prolog}${body}\n}`;
}

function emitTypeDecl(decl, ctx) {
  const variants = decl.variants.map(v => {
    if (v.tag && v.fields.length) return `@typedef {{tag: '${v.tag}', ${v.fields.map(f => `${f.name}: ${f.type.base}`).join(', ')}}} ${decl.name}_${v.tag}`;
    if (v.tag) return `@typedef {'${v.tag}'} ${decl.name}_${v.tag}`;
    return `@typedef {Object} ${decl.name}`;
  }).join('\n * ');
  return `/**\n * ${variants}\n */`;
}

function emitImportDecl(decl, ctx) {
  if (decl.path && decl.path.endsWith('.braid')) {
    return `// Type-only import from ${decl.path} (skipped in JS)`;
  }
  return `import { ${decl.names.join(', ')} } from "${decl.path}";`;
}

// ============================================================================
// INSTRUCTIONS
// ============================================================================

function ind(depth) { return '  '.repeat(depth); }

function emitInstrs(instrs, ctx, depth) {
  const lines = [];
  for (const instr of instrs) {
    lines.push(emitInstr(instr, ctx, depth));
  }
  // Implicit return Ok(undefined) if no return
  if (!lines.some(l => l.trim().startsWith('return '))) {
    lines.push(`${ind(depth)}return Ok(undefined);`);
  }
  return lines.join('\n');
}

function emitInstrsNoImplicitReturn(instrs, ctx, depth) {
  return instrs.map(i => emitInstr(i, ctx, depth)).join('\n');
}

function emitInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  switch (instr.op) {
    case 'let':
      return `${prefix}const ${instr.name} = ${emitRef(instr.value, ctx)};`;
    case 'return':
      return `${prefix}return ${emitRef(instr.value, ctx)};`;
    case 'expr':
      return `${prefix}${emitRef(instr.value, ctx)};`;
    case 'binary':
      return `${prefix}const ${instr.target} = (${emitRef(instr.left, ctx)} ${instr.operator} ${emitRef(instr.right, ctx)});`;
    case 'unary':
      return `${prefix}const ${instr.target} = (${instr.operator}${emitRef(instr.arg, ctx)});`;
    case 'call':
      return emitCallInstr(instr, ctx, depth);
    case 'member':
      return emitMemberInstr(instr, ctx, depth);
    case 'index':
      return `${prefix}const ${instr.target} = ${emitRef(instr.object, ctx)}[${emitRef(instr.index, ctx)}];`;
    case 'array':
      return `${prefix}const ${instr.target} = [${instr.elements.map(e => (e.spread ? '...' : '') + emitRef(e.value, ctx)).join(', ')}];`;
    case 'object':
      return `${prefix}const ${instr.target} = { ${instr.props.map(p => p.spread ? `...${emitRef(p.value, ctx)}` : `${p.key}: ${emitRef(p.value, ctx)}`).join(', ')} };`;
    case 'template':
      return emitTemplateInstr(instr, ctx, depth);
    case 'lambda':
      return emitLambdaInstr(instr, ctx, depth);
    case 'match':
      return emitMatchInstr(instr, ctx, depth);
    case 'if':
      return emitIfInstr(instr, ctx, depth);
    case 'for_in':
      return `${prefix}for (const ${instr.binding} of ${emitRef(instr.iterable, ctx)}) {\n${emitInstrsNoImplicitReturn(instr.body, ctx, depth + 1)}\n${prefix}}`;
    case 'while': {
      // While condition is an AST expr ref — we need to inline it
      const cond = instr.cond.ref === 'ast_expr' ? emitASTExpr(instr.cond.node, ctx) : emitRef(instr.cond, ctx);
      return `${prefix}while (${cond}) {\n${emitInstrsNoImplicitReturn(instr.body, ctx, depth + 1)}\n${prefix}}`;
    }
    case 'break':    return `${prefix}break;`;
    case 'continue': return `${prefix}continue;`;
    default:         return `${prefix}/* unknown IR op: ${instr.op} */`;
  }
}

// ============================================================================
// CALL EMISSION (stdlib detection, auto-await)
// ============================================================================

function emitCallInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  const callee = instr.callee;
  const args = instr.args.map(a => (a.spread ? '...' : '') + emitRef(a.value, ctx));

  // Check for stdlib builtins
  if (callee.ref === 'ident' && JS_STDLIB[callee.name]) {
    const fn = JS_STDLIB[callee.name];
    return `${prefix}const ${instr.target} = ${fn(args)};`;
  }

  // Check for auto-await on IO calls
  const calleeStr = emitRef(callee, ctx);
  if (ctx.effectful && ASYNC_IO_CALLS.has(calleeStr)) {
    return `${prefix}const ${instr.target} = await ${calleeStr}(${args.join(', ')});`;
  }

  return `${prefix}const ${instr.target} = ${calleeStr}(${args.join(', ')});`;
}

function emitMemberInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  const obj = emitRef(instr.object, ctx);
  const prop = instr.property;

  if (ctx.sandbox && DANGEROUS_PROPS.has(prop)) {
    return `${prefix}const ${instr.target} = safeGet(${obj}, "${prop}");`;
  }

  const accessor = instr.optional ? '?.' : '.';
  return `${prefix}const ${instr.target} = ${obj}${accessor}${prop};`;
}

function emitTemplateInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  let s = '`';
  for (const part of instr.parts) {
    if (part.ref === 'literal' && part.type === 'String') {
      s += part.value.replace(/`/g, '\\`').replace(/\$/g, '\\$');
    } else {
      s += '${' + emitRef(part, ctx) + '}';
    }
  }
  s += '`';
  return `${prefix}const ${instr.target} = ${s};`;
}

function emitLambdaInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  const params = instr.params.map(p => p.name).join(', ');
  if (instr.body.length === 1 && instr.body[0].op === 'return') {
    return `${prefix}const ${instr.target} = (${params}) => (${emitRef(instr.body[0].value, ctx)});`;
  }
  const body = emitInstrsNoImplicitReturn(instr.body, ctx, depth + 1);
  return `${prefix}const ${instr.target} = (${params}) => {\n${body}\n${prefix}};`;
}

function emitMatchInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  const subject = emitRef(instr.subject, ctx);
  let s = `${prefix}const ${instr.target} = (() => { const __m = (${subject}); switch(__m.tag) {`;
  for (const arm of instr.arms) {
    if (arm.pattern.wildcard) {
      s += ` default: { ${emitMatchArmBody(arm.body, ctx)} }`;
    } else {
      s += ` case ${JSON.stringify(arm.pattern.tag)}: {`;
      for (const b of (arm.pattern.bindings || [])) s += ` const ${b} = __m.${b};`;
      s += ` ${emitMatchArmBody(arm.body, ctx)} }`;
    }
  }
  s += ` } })();`;
  return s;
}

function emitMatchArmBody(instrs, ctx) {
  let code = '';
  for (const instr of instrs) {
    if (instr.op === 'return') { code += ` return ${emitRef(instr.value, ctx)};`; }
    else if (instr.op === 'let') { code += ` const ${instr.name} = ${emitRef(instr.value, ctx)};`; }
    else if (instr.op === 'expr') { code += ` ${emitRef(instr.value, ctx)};`; }
    else { code += ` /* ${instr.op} */`; }
  }
  return code;
}

function emitIfInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  const cond = emitRef(instr.cond, ctx);
  const thenBody = emitInstrsNoImplicitReturn(instr.then, ctx, depth + 1);
  let s = `${prefix}if (${cond}) {\n${thenBody}\n${prefix}}`;
  if (instr.else) {
    const elseBody = emitInstrsNoImplicitReturn(instr.else, ctx, depth + 1);
    s += ` else {\n${elseBody}\n${prefix}}`;
  }
  return s;
}

// ============================================================================
// REFERENCE EMISSION
// ============================================================================

function emitRef(ref, ctx) {
  if (!ref) return 'undefined';
  switch (ref.ref) {
    case 'literal': {
      if (ref.type === 'String') return JSON.stringify(ref.value);
      if (ref.type === 'Null') return 'undefined';
      if (ref.value === null || ref.value === undefined) return 'undefined';
      return String(ref.value);
    }
    case 'ident': {
      if (ctx.sandbox && DANGEROUS_IDENTS.has(ref.name)) return `guardGlobal("${ref.name}")`;
      return ref.name;
    }
    case 'temp':
      return ref.name;
    default:
      return 'undefined';
  }
}

// Emit an AST expression directly (used for while conditions)
function emitASTExpr(node, ctx) {
  if (!node) return 'true';
  switch (node.type) {
    case 'NumberLit': return String(node.value);
    case 'StringLit': return JSON.stringify(node.value);
    case 'BoolLit':   return node.value ? 'true' : 'false';
    case 'NullLit':   return 'undefined';
    case 'Ident':     return ctx.sandbox && DANGEROUS_IDENTS.has(node.name) ? `guardGlobal("${node.name}")` : node.name;
    case 'BinaryExpr': return `(${emitASTExpr(node.left, ctx)} ${node.op} ${emitASTExpr(node.right, ctx)})`;
    case 'UnaryExpr':  return `(${node.op}${emitASTExpr(node.arg, ctx)})`;
    case 'MemberExpr': return `${emitASTExpr(node.obj, ctx)}.${node.prop}`;
    case 'CallExpr':   return `${emitASTExpr(node.callee, ctx)}(${(node.args || []).map(a => emitASTExpr(a, ctx)).join(', ')})`;
    default: return 'true';
  }
}
