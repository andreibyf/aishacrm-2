// braid-transpile.js — Braid → JavaScript transpiler v0.4.0
// Features: type validation, policy validation, static effect analysis,
// sandbox mode, for/while loops, template strings, optional chaining,
// pipe operator, spread, else-if chains.
"use strict";

import fs from 'fs';
import url from 'url';
import process from 'node:process';
import { parse } from './braid-parse.js';

// ============================================================================
// TYPE SYSTEM
// ============================================================================

const BRAID_TYPE_MAP = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Bool: 'boolean',
  Array: null, Object: null, JSONB: null, Void: null,
};

// ============================================================================
// POLICY VALIDATION
// ============================================================================

const VALID_POLICIES = new Set([
  'READ_ONLY', 'WRITE', 'DELETE', 'ADMIN', 'SYSTEM',
  'WRITE_OPERATIONS', 'DELETE_OPERATIONS', 'ADMIN_ONLY',
  'SYSTEM_INTERNAL', 'AI_SUGGESTIONS', 'EXTERNAL_API',
]);

// ============================================================================
// STATIC EFFECT ANALYSIS
// ============================================================================

const IO_EFFECT_MAP = { http: 'net', clock: 'clock', fs: 'fs', rng: 'rng' };

function detectUsedEffects(node, found = new Set()) {
  if (!node || typeof node !== 'object') return found;
  if (node.type === 'MemberExpr' && node.obj?.type === 'Ident') {
    const eff = IO_EFFECT_MAP[node.obj.name];
    if (eff) found.add(eff);
  }
  if (node.type === 'OptionalMemberExpr' && node.obj?.type === 'Ident') {
    const eff = IO_EFFECT_MAP[node.obj.name];
    if (eff) found.add(eff);
  }
  if (node.type === 'CallExpr' && node.callee?.type === 'Ident') {
    const eff = IO_EFFECT_MAP[node.callee.name];
    if (eff) found.add(eff);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'pos') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object') detectUsedEffects(item, found);
      }
    } else if (child && typeof child === 'object' && child.type) {
      detectUsedEffects(child, found);
    }
  }
  return found;
}

// ============================================================================
// SANDBOX: DANGEROUS IDENTIFIER DETECTION
// ============================================================================

const DANGEROUS_IDENTS = new Set([
  'eval', 'Function', 'GeneratorFunction', 'AsyncFunction',
  'Proxy', 'Reflect', 'globalThis', 'window', 'global',
  'process', 'require', 'module', 'exports',
  '__filename', '__dirname', 'importScripts',
  'XMLHttpRequest', 'WebSocket',
  'fetch', 'setTimeout', 'setInterval', 'setImmediate',
]);

const DANGEROUS_PROPS = new Set([
  '__proto__', 'constructor', 'prototype',
  '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__',
]);

// ============================================================================
// TRANSPILER
// ============================================================================

/**
 * Transpile a Braid AST to JavaScript.
 * @param {Object} ast - Parsed AST from braid-parse.js
 * @param {Object} opts - Options
 * @param {boolean} opts.pure - Reject effectful functions
 * @param {boolean} opts.sandbox - Enable security sandbox
 * @param {string} opts.runtimeImport - Custom path to braid-rt.js
 * @param {string} opts.source - Source filename for diagnostics
 * @returns {{ code: string, map: null, diagnostics: Array }}
 */
export function transpileToJS(ast, opts = {}) {
  const {
    pure = false,
    sandbox = false,
    policy = null,
    source = 'stdin',
    typescript = false,
    runtimeImport = null,
  } = opts;

  const out = [];
  const ctx = { pure, sandbox, policy, source, typescript, diags: [], indent: 0 };

  out.push(`"use strict";`);

  const rtPath = runtimeImport || "./braid-rt.js";
  out.push(`import { Ok, Err, IO, cap, checkType, CRMError } from "${rtPath}";`);

  if (sandbox) {
    const sbPath = runtimeImport
      ? runtimeImport.replace('braid-rt.js', 'braid-sandbox.js').replace('/tools/', '/core/')
      : './braid-sandbox.js';
    out.push(`import { safeGet, safeSet, guardGlobal } from "${sbPath}";`);
  }

  // Type declarations
  for (const it of (ast.items || [])) {
    if (it.type === 'TypeDecl') out.push(emitTypeDecl(it, ctx));
    if (it.type === 'ImportDecl') out.push(emitImport(it, ctx));
  }

  // Function declarations
  for (const it of (ast.items || [])) {
    if (it.type === 'FnDecl') out.push(emitFn(it, ctx));
  }

  if (ctx.diags.some(d => d.severity === 'error')) {
    const errors = ctx.diags.filter(d => d.severity === 'error');
    throw new Error(errors.map(d => `${d.code}: ${d.message}`).join('\n'));
  }

  return { code: out.join("\n\n"), map: null, diagnostics: ctx.diags };
}

// ============================================================================
// TYPE DECLARATIONS
// ============================================================================

function emitTypeDecl(td, ctx) {
  if (ctx.typescript) {
    const variants = td.variants.map(v => {
      if (v.type === 'ObjectType') return `{ ${v.fields.map(f => `${f.name}: ${emitTypeRef(f.type)}`).join(', ')} }`;
      if (v.fields) return `{ tag: '${v.tag}', ${v.fields.map(f => `${f.name}: ${emitTypeRef(f.type)}`).join(', ')} }`;
      return `'${v.tag}'`;
    }).join(' | ');
    return `export type ${td.name}${td.typeParams.length ? `<${td.typeParams.join(',')}>` : ''} = ${variants};`;
  }
  const jsdoc = td.variants.map(v => {
    if (v.type === 'ObjectType') return `@typedef {Object} ${td.name}`;
    if (v.fields) return `@typedef {{tag: '${v.tag}', ${v.fields.map(f => `${f.name}: ${emitTypeRef(f.type)}`).join(', ')}}} ${td.name}_${v.tag}`;
    return `@typedef {'${v.tag}'} ${td.name}_${v.tag}`;
  }).join('\n * ');
  return `/**\n * ${jsdoc}\n */`;
}

function emitTypeRef(ref) {
  const baseMap = { String: 'string', Number: 'number', Boolean: 'boolean', Array: 'Array' };
  const base = baseMap[ref.base] || ref.base;
  if (ref.typeArgs.length) return `${base}<${ref.typeArgs.map(emitTypeRef).join(',')}>`;
  return base;
}

// ============================================================================
// IMPORTS
// ============================================================================

function emitImport(imp, _ctx) {
  if (imp.path && imp.path.endsWith('.braid')) {
    return `// Type-only import from ${imp.path} (skipped in JS)`;
  }
  return `import { ${imp.names.join(', ')} } from "${imp.path}";`;
}

// ============================================================================
// FUNCTIONS
// ============================================================================

function emitFn(fn, ctx) {
  const eff = new Set(fn.effects || []);
  const isEff = eff.size > 0;

  if (ctx.pure && isEff) {
    ctx.diags.push({ code: 'TP001', severity: 'error', message: `effectful function in --pure build: ${fn.name}` });
  }

  // @policy validation
  const policyAnnotation = (fn.annotations || []).find(a => a.name === 'policy');
  if (policyAnnotation) {
    const policyName = policyAnnotation.args?.[0];
    if (!policyName || !VALID_POLICIES.has(policyName)) {
      ctx.diags.push({
        code: 'TP003', severity: 'error',
        message: `${fn.name}: @policy(${policyName || '?'}) is not a valid policy. Valid: ${[...VALID_POLICIES].join(', ')}`,
      });
    }
  }

  // Static effect analysis
  if (fn.body && fn.body.type === 'Block') {
    const used = detectUsedEffects(fn.body);
    for (const u of used) {
      if (!eff.has(u)) {
        ctx.diags.push({
          code: 'TP002', severity: 'error',
          message: `${fn.name}: uses '${u}' effect but does not declare !${u}`,
        });
      }
    }
  }

  const asyncKw = isEff ? 'async ' : '';
  const params = (isEff ? ['policy', 'deps'] : []).concat(
    fn.params.map(p => p.spread ? `...${p.name}` : p.name)
  );

  let prolog = '';

  // Type validation
  for (const p of fn.params) {
    if (!p.type) continue;
    const jsType = BRAID_TYPE_MAP[p.type.base];
    if (jsType) {
      prolog += `  checkType("${fn.name}", "${p.name}", ${p.name}, "${jsType}");\n`;
    } else if (p.type.base === 'Array') {
      prolog += `  if (!Array.isArray(${p.name})) throw Object.assign(new Error("[BRAID_TYPE] ${fn.name}(): '${p.name}' expected Array, got " + typeof ${p.name}), { code: 'BRAID_TYPE' });\n`;
    }
  }

  // Effect capability checks + IO construction
  if (isEff) {
    for (const e of eff) prolog += `  cap(policy, "${e}");\n`;
    prolog += `  const io = IO(policy, deps);\n`;
    prolog += `  const { http, clock, fs, rng } = io;\n`;
  }

  const body = (fn.body && fn.body.type === 'Block')
    ? emitBlockAST(fn.body, { ...ctx, effectful: isEff }, 1)
    : '  return Ok(undefined);';

  return `export ${asyncKw}function ${fn.name}(${params.join(', ')}) {\n${prolog}${body}\n}`;
}

// ============================================================================
// BLOCKS AND STATEMENTS
// ============================================================================

function indent(n) { return '  '.repeat(n); }

function emitBlockAST(block, ctx, depth = 1) {
  const lines = [];
  for (const st of (block.statements || [])) {
    lines.push(emitStmt(st, ctx, depth));
  }
  if (!lines.some(l => l.trim().startsWith('return '))) {
    lines.push(`${indent(depth)}return Ok(undefined);`);
  }
  return lines.join("\n");
}

function emitStmt(st, ctx, depth = 1) {
  const ind = indent(depth);
  switch (st.type) {
    case 'LetStmt':
      return `${ind}const ${st.name} = ${emitExpr(st.value, ctx)};`;
    case 'ReturnStmt':
      return `${ind}return ${emitExpr(st.value, ctx)};`;
    case 'ExprStmt':
      return `${ind}${emitExpr(st.expr, ctx)};`;
    case 'IfStmt':
      return emitIf(st, ctx, depth);
    case 'ForStmt':
      return emitFor(st, ctx, depth);
    case 'WhileStmt':
      return emitWhile(st, ctx, depth);
    case 'BreakStmt':
      return `${ind}break;`;
    case 'ContinueStmt':
      return `${ind}continue;`;
    default:
      return `${ind}/* unhandled stmt: ${st.type} */`;
  }
}

function emitIf(node, ctx, depth) {
  const ind = indent(depth);
  const cond = emitExpr(node.cond, ctx);
  const thenB = emitBlockBody(node.then, ctx, depth + 1);
  let s = `${ind}if (${cond}) {\n${thenB}\n${ind}}`;
  if (node.else) {
    const elseStmts = node.else.statements || [];
    // else-if chain: single IfStmt child
    if (elseStmts.length === 1 && elseStmts[0].type === 'IfStmt') {
      s += ` else ${emitIf(elseStmts[0], ctx, depth).trimStart()}`;
    } else {
      const elseB = emitBlockBody(node.else, ctx, depth + 1);
      s += ` else {\n${elseB}\n${ind}}`;
    }
  }
  return s;
}

function emitFor(node, ctx, depth) {
  const ind = indent(depth);
  const iter = emitExpr(node.iterable, ctx);
  const body = emitBlockBody(node.body, ctx, depth + 1);
  return `${ind}for (const ${node.binding} of ${iter}) {\n${body}\n${ind}}`;
}

function emitWhile(node, ctx, depth) {
  const ind = indent(depth);
  const cond = emitExpr(node.cond, ctx);
  const body = emitBlockBody(node.body, ctx, depth + 1);
  return `${ind}while (${cond}) {\n${body}\n${ind}}`;
}

// Block body without the implicit return Ok(undefined)
function emitBlockBody(block, ctx, depth) {
  const lines = [];
  for (const st of (block.statements || [])) {
    lines.push(emitStmt(st, ctx, depth));
  }
  return lines.join("\n");
}

// ============================================================================
// EXPRESSIONS
// ============================================================================

function emitExpr(node, ctx) {
  if (!node) return 'undefined';
  switch (node.type) {
    case 'NumberLit':            return String(node.value);
    case 'StringLit':           return JSON.stringify(node.value);
    case 'BoolLit':             return node.value ? 'true' : 'false';
    case 'NullLit':             return 'undefined';
    case 'Ident':               return emitIdent(node, ctx);
    case 'TemplateLit':         return emitTemplate(node, ctx);
    case 'ArrayExpr':           return emitArray(node, ctx);
    case 'ObjectExpr':          return emitObject(node, ctx);
    case 'SpreadExpr':          return `...${emitExpr(node.arg, ctx)}`;
    case 'MemberExpr':          return emitMember(node, ctx);
    case 'OptionalMemberExpr':  return emitOptionalMember(node, ctx);
    case 'IndexExpr':           return `${emitExpr(node.obj, ctx)}[${emitExpr(node.index, ctx)}]`;
    case 'BinaryExpr':          return `(${emitExpr(node.left, ctx)} ${node.op} ${emitExpr(node.right, ctx)})`;
    case 'UnaryExpr':           return `(${node.op}${emitExpr(node.arg, ctx)})`;
    case 'PipeExpr':            return emitPipe(node, ctx);
    case 'CallExpr':            return emitCall(node, ctx);
    case 'LambdaExpr':          return emitLambda(node, ctx);
    case 'MatchExpr':           return emitMatchExpr(node, ctx);
    default:                    return 'undefined';
  }
}

function emitIdent(node, ctx) {
  if (ctx.sandbox && DANGEROUS_IDENTS.has(node.name)) {
    return `guardGlobal("${node.name}")`;
  }
  return node.name;
}

function emitTemplate(node, ctx) {
  // Emit as JS template literal
  const parts = node.parts || [];
  let s = '`';
  for (const part of parts) {
    if (part.kind === 'str') {
      s += part.value.replace(/`/g, '\\`').replace(/\$/g, '\\$');
    } else if (part.kind === 'expr') {
      // Parse the expression string through our own parser minimally
      // Since template exprs were captured as raw strings, emit directly
      s += '${' + part.value + '}';
    }
  }
  s += '`';
  return s;
}

function emitArray(node, ctx) {
  const els = (node.elements || []).map(e => emitExpr(e, ctx));
  return '[' + els.join(', ') + ']';
}

function emitObject(node, ctx) {
  const ps = (node.props || []).map(p => {
    if (p.type === 'SpreadProp') return `...${emitExpr(p.arg, ctx)}`;
    return `${p.key}: ${emitExpr(p.value, ctx)}`;
  });
  return '{ ' + ps.join(', ') + ' }';
}

function emitMember(node, ctx) {
  if (ctx.sandbox && DANGEROUS_PROPS.has(node.prop)) {
    return `safeGet(${emitExpr(node.obj, ctx)}, "${node.prop}")`;
  }
  return `${emitExpr(node.obj, ctx)}.${node.prop}`;
}

function emitOptionalMember(node, ctx) {
  if (ctx.sandbox && DANGEROUS_PROPS.has(node.prop)) {
    return `safeGet(${emitExpr(node.obj, ctx)}, "${node.prop}")`;
  }
  return `${emitExpr(node.obj, ctx)}?.${node.prop}`;
}

function emitPipe(node, ctx) {
  // left |> fn → fn(left)
  // left |> obj.method → obj.method(left)
  const left = emitExpr(node.left, ctx);
  const right = emitExpr(node.right, ctx);
  return `${right}(${left})`;
}

function emitLambda(node, ctx) {
  const args = (node.params || []).map(p => p.name).join(', ');
  if (node.body?.type === 'Block') return `(${args}) => {\n${emitBlockBody(node.body, ctx, 2)}\n}`;
  return `(${args}) => (${emitExpr(node.body, ctx)})`;
}

// ============================================================================
// FUNCTION CALLS (stdlib + auto-await)
// ============================================================================

function emitCall(node, ctx) {
  const name = node.callee?.name;
  const args = (node.args || []).map(a => emitExpr(a, ctx));

  // Stdlib builtins
  if (name === 'len'      && args.length === 1) return `(${args[0]}).length`;
  if (name === 'map'      && args.length === 2) return `(${args[0]}).map(${args[1]})`;
  if (name === 'filter'   && args.length === 2) return `(${args[0]}).filter(${args[1]})`;
  if (name === 'reduce'   && (args.length === 2 || args.length === 3)) return `(${args[0]}).reduce(${args[1]}${args[2] ? ', ' + args[2] : ''})`;
  if (name === 'find'     && args.length === 2) return `(${args[0]}).find(${args[1]})`;
  if (name === 'some'     && args.length === 2) return `(${args[0]}).some(${args[1]})`;
  if (name === 'every'    && args.length === 2) return `(${args[0]}).every(${args[1]})`;
  if (name === 'includes' && args.length === 2) return `(${args[0]}).includes(${args[1]})`;
  if (name === 'join'     && args.length === 2) return `(${args[0]}).join(${args[1]})`;
  if (name === 'sort'     && (args.length === 1 || args.length === 2)) return `(${args[0]}).sort(${args[1] || ''})`;
  if (name === 'reverse'  && args.length === 1) return `(${args[0]}).reverse()`;
  if (name === 'flat'     && (args.length === 1 || args.length === 2)) return `(${args[0]}).flat(${args[1] || ''})`;
  if (name === 'sum'      && args.length === 1) return `(${args[0]}).reduce((a,b)=>a+b,0)`;
  if (name === 'avg'      && args.length === 1) return `((${args[0]}).reduce((a,b)=>a+b,0)/(${args[0]}).length)`;
  if (name === 'keys'     && args.length === 1) return `Object.keys(${args[0]})`;
  if (name === 'values'   && args.length === 1) return `Object.values(${args[0]})`;
  if (name === 'entries'  && args.length === 1) return `Object.entries(${args[0]})`;
  if (name === 'parseInt' && args.length >= 1)  return `parseInt(${args.join(', ')})`;
  if (name === 'parseFloat' && args.length === 1) return `parseFloat(${args[0]})`;
  if (name === 'toString' && args.length === 1) return `String(${args[0]})`;

  // Auto-await effectful IO calls
  if (ctx.effectful && node.callee?.type === 'MemberExpr' && node.callee.obj?.type === 'Ident') {
    const objName = node.callee.obj.name;
    const propName = node.callee.prop;
    if (objName === 'http' && ['get', 'post', 'put', 'delete'].includes(propName)) {
      return `await ${emitExpr(node.callee, ctx)}(${args.join(', ')})`;
    }
    if (objName === 'clock' && propName === 'sleep') {
      return `await ${emitExpr(node.callee, ctx)}(${args.join(', ')})`;
    }
    if (objName === 'fs' && ['read', 'write'].includes(propName)) {
      return `await ${emitExpr(node.callee, ctx)}(${args.join(', ')})`;
    }
  }

  return `${emitExpr(node.callee, ctx)}(${args.join(', ')})`;
}

// ============================================================================
// MATCH EXPRESSIONS
// ============================================================================

function emitMatchExpr(node, ctx) {
  const id = "__t", t = emitExpr(node.target, ctx);
  let s = `(()=>{ const ${id}=(${t}); switch(${id}.tag){`;
  for (const arm of (node.arms || [])) {
    if (arm.pat === '_') { s += ` default: ${emitMatchArmValue(arm.value, ctx)}`; continue; }
    const tag = arm.pat.tag;
    s += ` case ${JSON.stringify(tag)}: {`;
    for (const b of (arm.pat.binds || [])) s += ` const ${b.name}=${id}.${b.name};`;
    s += ` ${emitMatchArmValue(arm.value, ctx)} }`;
  }
  s += ` } })()`;
  return s;
}

function emitMatchArmValue(value, ctx) {
  if (!value) return 'return undefined;';
  if (value.type === 'Block') {
    const stmts = value.statements || [];
    let code = '';
    for (let i = 0; i < stmts.length; i++) {
      const st = stmts[i];
      if (i === stmts.length - 1 && st.type === 'ExprStmt') {
        code += ` return ${emitExpr(st.expr, ctx)};`;
      } else if (st.type === 'LetStmt') {
        code += ` const ${st.name} = ${emitExpr(st.value, ctx)};`;
      } else if (st.type === 'ReturnStmt') {
        code += ` return ${emitExpr(st.value, ctx)};`;
      } else if (st.type === 'IfStmt') {
        code += ` ${emitIf(st, ctx, 2)}`;
      } else if (st.type === 'ForStmt') {
        code += ` ${emitFor(st, ctx, 2)}`;
      } else if (st.type === 'ExprStmt') {
        code += ` ${emitExpr(st.expr, ctx)};`;
      }
    }
    return code;
  }
  if (value.type === 'ReturnStmt') return `return ${emitExpr(value.value, ctx)};`;
  return `return ${emitExpr(value, ctx)};`;
}

// ============================================================================
// EXTRACTION UTILITIES
// ============================================================================

export function extractPolicies(ast) {
  const policies = {};
  for (const item of (ast.items || [])) {
    if (item.type !== 'FnDecl') continue;
    const ann = (item.annotations || []).find(a => a.name === 'policy');
    if (ann?.args?.[0]) policies[item.name] = ann.args[0];
  }
  return policies;
}

export function extractParamTypes(ast) {
  const types = {};
  for (const item of (ast.items || [])) {
    if (item.type !== 'FnDecl') continue;
    types[item.name] = item.params.map(p => ({
      name: p.name,
      type: p.type?.base || null,
      typeArgs: p.type?.typeArgs || [],
      spread: p.spread || false,
    }));
  }
  return types;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { detectUsedEffects, IO_EFFECT_MAP, BRAID_TYPE_MAP, VALID_POLICIES };

// ============================================================================
// CLI
// ============================================================================

function mainCLI() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log(`Usage: braid-transpile --file in.braid [--out out.js] [--pure] [--sandbox]`);
    process.exit(0);
  }
  const fIdx = args.indexOf('--file');
  if (fIdx < 0) { console.error('missing --file'); process.exit(1); }
  const inPath = args[fIdx + 1];
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const pure = args.includes('--pure');
  const sandbox = args.includes('--sandbox');

  const source = fs.readFileSync(inPath, 'utf8');
  const ast = parse(source, inPath);
  const { code } = transpileToJS(ast, { source: inPath, pure, sandbox });
  if (outPath) {
    fs.writeFileSync(outPath, code, 'utf8');
    console.log(`✓ Transpiled ${inPath} → ${outPath}`);
  } else {
    process.stdout.write(code);
  }
}

const arg1 = (process?.argv?.length > 1) ? process.argv[1] : null;
const isMain = arg1 && (import.meta.url === url.pathToFileURL(arg1).href);
if (isMain) mainCLI();
