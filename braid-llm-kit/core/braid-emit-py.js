// braid-emit-py.js — Python code emitter for Braid IR
// Consumes the target-agnostic IR from braid-ir.js and produces Python 3.
// Demonstrates that Braid is not tied to JavaScript.
"use strict";

// ============================================================================
// PYTHON-SPECIFIC CONFIGURATION
// ============================================================================

const PY_TYPE_MAP = {
  String: 'str', Number: 'float', Boolean: 'bool', Bool: 'bool',
  Array: 'list', Object: 'dict', JSONB: 'dict', Void: 'None',
  Any: 'Any', Null: 'None', Int: 'int',
};

const PY_STDLIB = {
  len:        (args) => `len(${args[0]})`,
  map:        (args) => `list(map(${args[1]}, ${args[0]}))`,
  filter:     (args) => `list(filter(${args[1]}, ${args[0]}))`,
  reduce:     (args) => args.length === 3 ? `functools.reduce(${args[1]}, ${args[0]}, ${args[2]})` : `functools.reduce(${args[1]}, ${args[0]})`,
  find:       (args) => `next((x for x in ${args[0]} if ${args[1]}(x)), None)`,
  some:       (args) => `any(${args[1]}(x) for x in ${args[0]})`,
  every:      (args) => `all(${args[1]}(x) for x in ${args[0]})`,
  includes:   (args) => `(${args[1]} in ${args[0]})`,
  join:       (args) => `${args[1]}.join(${args[0]})`,
  sort:       (args) => args.length === 2 ? `sorted(${args[0]}, key=functools.cmp_to_key(${args[1]}))` : `sorted(${args[0]})`,
  reverse:    (args) => `list(reversed(${args[0]}))`,
  flat:       (args) => `_braid_flatten(${args[0]})`,
  sum:        (args) => `sum(${args[0]})`,
  avg:        (args) => `(sum(${args[0]}) / len(${args[0]}))`,
  keys:       (args) => `list(${args[0]}.keys())`,
  values:     (args) => `list(${args[0]}.values())`,
  entries:    (args) => `list(${args[0]}.items())`,
  parseInt:   (args) => `int(${args[0]})`,
  parseFloat: (args) => `float(${args[0]})`,
  toString:   (args) => `str(${args[0]})`,
};

const ASYNC_IO_CALLS = new Set(['http.get', 'http.post', 'http.put', 'http.delete', 'clock.sleep', 'fs.read', 'fs.write']);

// ============================================================================
// EMITTER
// ============================================================================

/**
 * Emit Python 3 from Braid IR.
 * @param {Object} ir - IR from lower()
 * @param {Object} opts
 * @param {boolean} opts.typed - Emit type annotations
 * @returns {{ code: string, diagnostics: Array }}
 */
export function emitPython(ir, opts = {}) {
  const { typed = true } = opts;
  const out = [];
  const diags = [];
  const ctx = { typed, diags, effectful: false, needsFunctools: false };

  // Header
  out.push('"""Auto-generated from Braid DSL — do not edit manually."""');
  out.push('from __future__ import annotations');
  out.push('from dataclasses import dataclass');
  out.push('from typing import Any, Optional, Union, TypeVar, Generic');
  out.push('');

  // Braid runtime preamble (ADTs)
  out.push('# --- Braid Runtime ---');
  out.push('T = TypeVar("T")');
  out.push('E = TypeVar("E")');
  out.push('');
  out.push('@dataclass(frozen=True)');
  out.push('class Ok:');
  out.push('    value: Any');
  out.push('    tag: str = "Ok"');
  out.push('');
  out.push('@dataclass(frozen=True)');
  out.push('class Err:');
  out.push('    error: Any');
  out.push('    tag: str = "Err"');
  out.push('');
  out.push('@dataclass(frozen=True)');
  out.push('class Some:');
  out.push('    value: Any');
  out.push('    tag: str = "Some"');
  out.push('');
  out.push('@dataclass(frozen=True)');
  out.push('class NoneVal:');
  out.push('    tag: str = "None"');
  out.push('');
  out.push('NONE = NoneVal()');
  out.push('');
  out.push('def check_type(fn: str, param: str, value: Any, expected: str) -> None:');
  out.push("    if value is None:");
  out.push("        raise TypeError(f'[BRAID_TYPE] {fn}(): {param} is None, expected {expected}')");
  out.push("    actual = type(value).__name__");
  out.push("    type_map = {'string': 'str', 'number': 'float', 'boolean': 'bool'}");
  out.push("    if type_map.get(expected, expected) != actual and not (expected == 'number' and actual == 'int'):");
  out.push("        raise TypeError(f'[BRAID_TYPE] {fn}(): {param} expected {expected}, got {actual}')");
  out.push('');
  out.push('def _braid_flatten(lst, depth=1):');
  out.push('    result = []');
  out.push('    for item in lst:');
  out.push('        if isinstance(item, list) and depth > 0:');
  out.push('            result.extend(_braid_flatten(item, depth - 1))');
  out.push('        else:');
  out.push('            result.append(item)');
  out.push('    return result');
  out.push('');

  // Declarations
  for (const decl of (ir.decls || [])) {
    switch (decl.kind) {
      case 'FnDecl':    out.push(emitFnDecl(decl, ctx)); break;
      case 'TypeDecl':  out.push(emitTypeDecl(decl, ctx)); break;
      case 'ImportDecl': out.push(emitImportDecl(decl, ctx)); break;
    }
  }

  // Add functools import if needed
  if (ctx.needsFunctools) {
    out.splice(4, 0, 'import functools');
  }

  return { code: out.join('\n'), diagnostics: diags };
}

// ============================================================================
// DECLARATIONS
// ============================================================================

function emitFnDecl(decl, ctx) {
  const isEffectful = decl.effects.length > 0;
  const asyncKw = isEffectful ? 'async ' : '';

  const params = decl.params.map(p => {
    const spread = p.spread ? '*' : '';
    const typeAnn = ctx.typed && p.type ? `: ${pyType(p.type)}` : '';
    return `${spread}${p.name}${typeAnn}`;
  });

  if (isEffectful) {
    params.unshift('policy: dict', 'deps: dict');
  }

  const retType = ctx.typed ? ` -> ${pyType(decl.returnType)}` : '';
  const fnCtx = { ...ctx, effectful: isEffectful };

  let prolog = '';

  // Type validation
  for (const p of decl.params) {
    if (!p.type) continue;
    const pyT = PY_TYPE_MAP[p.type.base];
    if (pyT && pyT !== 'None') {
      prolog += `    check_type("${decl.name}", "${p.name}", ${p.name}, "${pyT}")\n`;
    }
  }

  const body = emitInstrs(decl.body, fnCtx, 1);
  const annotations = decl.annotations.map(a => `# @${a.name}(${a.args.join(', ')})`).join('\n');

  return `${annotations ? annotations + '\n' : ''}${asyncKw}def ${decl.name}(${params.join(', ')})${retType}:\n${prolog}${body}\n`;
}

function emitTypeDecl(decl, ctx) {
  // Emit as Python dataclass
  const lines = [];
  for (const v of decl.variants) {
    if (v.tag && v.fields.length) {
      lines.push(`@dataclass`);
      lines.push(`class ${v.tag}:`);
      for (const f of v.fields) {
        lines.push(`    ${f.name}: ${pyType(f.type)}`);
      }
      lines.push(`    tag: str = "${v.tag}"`);
      lines.push('');
    }
  }
  if (decl.variants.length > 1) {
    const names = decl.variants.filter(v => v.tag).map(v => v.tag);
    lines.push(`${decl.name} = Union[${names.join(', ')}]`);
    lines.push('');
  }
  return lines.join('\n');
}

function emitImportDecl(decl, ctx) {
  if (decl.path.endsWith('.braid')) {
    return `# Type-only import from ${decl.path} (skipped in Python)`;
  }
  return `# import { ${decl.names.join(', ')} } from "${decl.path}"  # TODO: map to Python`;
}

// ============================================================================
// INSTRUCTIONS
// ============================================================================

function ind(depth) { return '    '.repeat(depth); }

function emitInstrs(instrs, ctx, depth) {
  const lines = [];
  for (const instr of instrs) {
    lines.push(emitInstr(instr, ctx, depth));
  }
  if (!lines.some(l => l.trim().startsWith('return '))) {
    lines.push(`${ind(depth)}return Ok(None)`);
  }
  return lines.join('\n');
}

function emitInstrsNoReturn(instrs, ctx, depth) {
  if (instrs.length === 0) return `${ind(depth)}pass`;
  return instrs.map(i => emitInstr(i, ctx, depth)).join('\n');
}

function emitInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  switch (instr.op) {
    case 'let':      return `${prefix}${instr.name} = ${emitRef(instr.value, ctx)}`;
    case 'return':   return `${prefix}return ${emitRef(instr.value, ctx)}`;
    case 'expr':     return `${prefix}${emitRef(instr.value, ctx)}`;
    case 'binary':   return `${prefix}${instr.target} = (${emitRef(instr.left, ctx)} ${pyOp(instr.operator)} ${emitRef(instr.right, ctx)})`;
    case 'unary':    return `${prefix}${instr.target} = (${pyUnaryOp(instr.operator)}${emitRef(instr.arg, ctx)})`;
    case 'call':     return emitCallInstr(instr, ctx, depth);
    case 'member':   return emitMemberInstr(instr, ctx, depth);
    case 'index':    return `${prefix}${instr.target} = ${emitRef(instr.object, ctx)}[${emitRef(instr.index, ctx)}]`;
    case 'array':    return `${prefix}${instr.target} = [${instr.elements.map(e => (e.spread ? '*' : '') + emitRef(e.value, ctx)).join(', ')}]`;
    case 'object':   return `${prefix}${instr.target} = {${instr.props.map(p => p.spread ? `**${emitRef(p.value, ctx)}` : `"${p.key}": ${emitRef(p.value, ctx)}`).join(', ')}}`;
    case 'template': return emitTemplateInstr(instr, ctx, depth);
    case 'lambda':   return emitLambdaInstr(instr, ctx, depth);
    case 'match':    return emitMatchInstr(instr, ctx, depth);
    case 'if':       return emitIfInstr(instr, ctx, depth);
    case 'for_in':   return `${prefix}for ${instr.binding} in ${emitRef(instr.iterable, ctx)}:\n${emitInstrsNoReturn(instr.body, ctx, depth + 1)}`;
    case 'while': {
      const cond = instr.cond.ref === 'ast_expr' ? emitASTExpr(instr.cond.node, ctx) : emitRef(instr.cond, ctx);
      return `${prefix}while ${cond}:\n${emitInstrsNoReturn(instr.body, ctx, depth + 1)}`;
    }
    case 'break':    return `${prefix}break`;
    case 'continue': return `${prefix}continue`;
    default:         return `${prefix}# unknown IR op: ${instr.op}`;
  }
}

function emitCallInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  const callee = instr.callee;
  const args = instr.args.map(a => (a.spread ? '*' : '') + emitRef(a.value, ctx));

  // Stdlib
  if (callee.ref === 'ident' && PY_STDLIB[callee.name]) {
    if (callee.name === 'reduce' || callee.name === 'sort') ctx.needsFunctools = true;
    return `${prefix}${instr.target} = ${PY_STDLIB[callee.name](args)}`;
  }

  // Async IO
  const calleeStr = emitRef(callee, ctx);
  if (ctx.effectful && ASYNC_IO_CALLS.has(calleeStr)) {
    return `${prefix}${instr.target} = await ${calleeStr}(${args.join(', ')})`;
  }

  return `${prefix}${instr.target} = ${calleeStr}(${args.join(', ')})`;
}

function emitMemberInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  const obj = emitRef(instr.object, ctx);
  // Python dict access for data objects
  if (instr.optional) {
    return `${prefix}${instr.target} = (${obj}.get("${instr.property}") if isinstance(${obj}, dict) else getattr(${obj}, "${instr.property}", None))`;
  }
  return `${prefix}${instr.target} = ${obj}.${instr.property}`;
}

function emitTemplateInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  let s = 'f"';
  for (const part of instr.parts) {
    if (part.ref === 'literal' && part.type === 'String') {
      s += part.value.replace(/"/g, '\\"').replace(/{/g, '{{').replace(/}/g, '}}');
    } else {
      s += '{' + emitRef(part, ctx) + '}';
    }
  }
  s += '"';
  return `${prefix}${instr.target} = ${s}`;
}

function emitLambdaInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  const params = instr.params.map(p => p.name).join(', ');
  if (instr.body.length === 1 && instr.body[0].op === 'return') {
    return `${prefix}${instr.target} = lambda ${params}: ${emitRef(instr.body[0].value, ctx)}`;
  }
  // Multi-statement lambdas need a named function in Python
  const fnName = `_lambda_${instr.target}`;
  let s = `${prefix}def ${fnName}(${params}):\n`;
  s += emitInstrsNoReturn(instr.body, ctx, depth + 1);
  s += `\n${prefix}${instr.target} = ${fnName}`;
  return s;
}

function emitMatchInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  const subject = emitRef(instr.subject, ctx);

  // Python 3.10+ has match/case. For broader compat, use if/elif chain.
  let s = `${prefix}__m = ${subject}\n`;
  let first = true;
  for (const arm of instr.arms) {
    const kw = first ? 'if' : 'elif';
    first = false;
    if (arm.pattern.wildcard) {
      s += `${prefix}else:\n`;
    } else {
      s += `${prefix}${kw} __m.tag == ${JSON.stringify(arm.pattern.tag)}:\n`;
      for (const b of (arm.pattern.bindings || [])) {
        s += `${ind(depth + 1)}${b} = __m.${b}\n`;
      }
    }
    const bodyLines = arm.body.map(i => emitInstr(i, ctx, depth + 1)).join('\n');
    s += bodyLines + '\n';
  }
  // Capture the result
  // (In Python, match-as-expression is trickier; we'd need to refactor.
  //  For now, the match arms should contain returns.)
  s += `${prefix}${instr.target} = None  # match result captured via return`;
  return s;
}

function emitIfInstr(instr, ctx, depth) {
  const prefix = ind(depth);
  const cond = emitRef(instr.cond, ctx);
  let s = `${prefix}if ${cond}:\n${emitInstrsNoReturn(instr.then, ctx, depth + 1)}`;
  if (instr.else) {
    s += `\n${prefix}else:\n${emitInstrsNoReturn(instr.else, ctx, depth + 1)}`;
  }
  return s;
}

// ============================================================================
// REFERENCES
// ============================================================================

function emitRef(ref, ctx) {
  if (!ref) return 'None';
  switch (ref.ref) {
    case 'literal': {
      if (ref.type === 'String') return JSON.stringify(ref.value);
      if (ref.type === 'Boolean') return ref.value ? 'True' : 'False';
      if (ref.type === 'Null' || ref.value === null || ref.value === undefined) return 'None';
      return String(ref.value);
    }
    case 'ident':   return ref.name;
    case 'temp':    return ref.name;
    default:        return 'None';
  }
}

function emitASTExpr(node, ctx) {
  if (!node) return 'True';
  switch (node.type) {
    case 'NumberLit': return String(node.value);
    case 'StringLit': return JSON.stringify(node.value);
    case 'BoolLit':   return node.value ? 'True' : 'False';
    case 'NullLit':   return 'None';
    case 'Ident':     return node.name;
    case 'BinaryExpr': return `(${emitASTExpr(node.left, ctx)} ${pyOp(node.op)} ${emitASTExpr(node.right, ctx)})`;
    case 'UnaryExpr':  return `(${pyUnaryOp(node.op)}${emitASTExpr(node.arg, ctx)})`;
    case 'MemberExpr': return `${emitASTExpr(node.obj, ctx)}.${node.prop}`;
    case 'CallExpr':   return `${emitASTExpr(node.callee, ctx)}(${(node.args || []).map(a => emitASTExpr(a, ctx)).join(', ')})`;
    default: return 'True';
  }
}

function pyType(t) {
  if (!t) return 'Any';
  const base = PY_TYPE_MAP[t.base] || t.base;
  if (t.typeArgs && t.typeArgs.length) return `${base}[${t.typeArgs.map(pyType).join(', ')}]`;
  return base;
}

function pyOp(op) {
  if (op === '&&') return 'and';
  if (op === '||') return 'or';
  if (op === '==') return '==';
  if (op === '!=') return '!=';
  return op;
}

function pyUnaryOp(op) {
  if (op === '!') return 'not ';
  return op;
}
