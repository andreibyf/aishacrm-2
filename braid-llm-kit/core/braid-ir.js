// braid-ir.js — Braid Intermediate Representation
// Target-agnostic IR that sits between the parser AST and backend emitters.
// The IR normalizes Braid semantics into a flat, explicit representation
// that any code generator can consume without understanding Braid syntax.
//
// Pipeline: source → parse() → AST → lower() → IR → emit_js/emit_py/emit_rs
"use strict";

// ============================================================================
// IR NODE TYPES
// ============================================================================
//
// The IR is a flat list of top-level declarations (functions, types, imports).
// Each function body is a list of IR instructions — no nested expressions.
// Every intermediate value is assigned to a named temporary (SSA-like).
//
// This makes code generation trivial for any target: each IR instruction
// maps 1:1 to a statement in the target language.

/**
 * Lower a Braid AST (from braid-parse.js) into IR.
 * @param {Object} ast - Parsed AST
 * @returns {{ decls: Array, diagnostics: Array }}
 */
export function lower(ast) {
  const decls = [];
  const diagnostics = [];
  let tempCounter = 0;

  function freshTemp() { return `__t${tempCounter++}`; }

  for (const item of (ast.items || [])) {
    switch (item.type) {
      case 'FnDecl':    decls.push(lowerFn(item)); break;
      case 'TypeDecl':  decls.push(lowerType(item)); break;
      case 'ImportDecl': decls.push(lowerImport(item)); break;
    }
  }

  return { decls, diagnostics };

  // --- Functions ---
  function lowerFn(fn) {
    const annotations = (fn.annotations || []).map(a => ({
      name: a.name,
      args: a.args || [],
    }));

    const params = fn.params.map(p => ({
      name: p.name,
      type: p.type ? typeRefToIR(p.type) : null,
      spread: p.spread || false,
    }));

    const effects = fn.effects || [];
    const returnType = typeRefToIR(fn.ret);
    const body = lowerBlock(fn.body);

    return {
      kind: 'FnDecl',
      name: fn.name,
      params,
      returnType,
      effects,
      annotations,
      body,
      pos: fn.pos,
    };
  }

  // --- Types ---
  function lowerType(td) {
    return {
      kind: 'TypeDecl',
      name: td.name,
      typeParams: td.typeParams || [],
      variants: td.variants.map(v => ({
        tag: v.tag || null,
        fields: (v.fields || []).map(f => ({
          name: f.name,
          type: typeRefToIR(f.type),
        })),
      })),
      pos: td.pos,
    };
  }

  // --- Imports ---
  function lowerImport(imp) {
    return {
      kind: 'ImportDecl',
      names: imp.names,
      path: imp.path,
      pos: imp.pos,
    };
  }

  // --- Type References ---
  function typeRefToIR(t) {
    if (!t) return { base: 'Any', typeArgs: [] };
    return {
      base: t.base,
      typeArgs: (t.typeArgs || []).map(typeRefToIR),
    };
  }

  // --- Blocks → IR instruction list ---
  function lowerBlock(block) {
    if (!block || block.type !== 'Block') return [];
    const instrs = [];
    for (const stmt of (block.statements || [])) {
      lowerStmt(stmt, instrs);
    }
    return instrs;
  }

  // --- Statements ---
  function lowerStmt(stmt, instrs) {
    switch (stmt.type) {
      case 'LetStmt': {
        const val = lowerExpr(stmt.value, instrs);
        instrs.push({
          op: 'let',
          name: stmt.name,
          type: stmt.letType ? typeRefToIR(stmt.letType) : null,
          value: val,
          pos: stmt.pos,
        });
        break;
      }

      case 'ReturnStmt': {
        const val = lowerExpr(stmt.value, instrs);
        instrs.push({ op: 'return', value: val, pos: stmt.pos });
        break;
      }

      case 'IfStmt': {
        const cond = lowerExpr(stmt.cond, instrs);
        const thenBody = lowerBlock(stmt.then);
        const elseBody = stmt.else ? lowerBlock(stmt.else) : null;
        instrs.push({ op: 'if', cond, then: thenBody, else: elseBody, pos: stmt.pos });
        break;
      }

      case 'ForStmt': {
        const iter = lowerExpr(stmt.iterable, instrs);
        const body = lowerBlock(stmt.body);
        instrs.push({ op: 'for_in', binding: stmt.binding, iterable: iter, body, pos: stmt.pos });
        break;
      }

      case 'WhileStmt': {
        // While condition needs re-evaluation each iteration, so we
        // don't flatten it outside the loop — we keep it as an expression ref
        const body = lowerBlock(stmt.body);
        instrs.push({ op: 'while', cond: exprToRef(stmt.cond), body, pos: stmt.pos });
        break;
      }

      case 'BreakStmt':    instrs.push({ op: 'break', pos: stmt.pos }); break;
      case 'ContinueStmt': instrs.push({ op: 'continue', pos: stmt.pos }); break;

      case 'ExprStmt': {
        const val = lowerExpr(stmt.expr, instrs);
        // If the expression has side effects (calls), we keep the instruction
        // Otherwise it's a dead expression and we can skip it
        instrs.push({ op: 'expr', value: val, pos: stmt.pos });
        break;
      }
    }
  }

  // --- Expressions → flattened into temporaries ---
  // Returns a "ref" — either a temp name, a literal, or an ident
  function lowerExpr(expr, instrs) {
    if (!expr) return { ref: 'literal', value: undefined, type: 'Void' };

    switch (expr.type) {
      case 'NumberLit':  return { ref: 'literal', value: expr.value, type: 'Number' };
      case 'StringLit':  return { ref: 'literal', value: expr.value, type: 'String' };
      case 'BoolLit':    return { ref: 'literal', value: expr.value, type: 'Boolean' };
      case 'NullLit':    return { ref: 'literal', value: null, type: 'Null' };
      case 'Ident':      return { ref: 'ident', name: expr.name };

      case 'TemplateLit': {
        // Lower template parts to concat operations
        const parts = (expr.parts || []).map(p => {
          if (p.kind === 'str') return { ref: 'literal', value: p.value, type: 'String' };
          // Expression parts: these are raw strings that need re-parsing
          // In the IR, we represent them as ident refs (simplified)
          return { ref: 'ident', name: p.value };
        });
        const tmp = freshTemp();
        instrs.push({ op: 'template', target: tmp, parts, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'ArrayExpr': {
        const elements = (expr.elements || []).map(e => {
          if (e.type === 'SpreadExpr') {
            return { spread: true, value: lowerExpr(e.arg, instrs) };
          }
          return { spread: false, value: lowerExpr(e, instrs) };
        });
        const tmp = freshTemp();
        instrs.push({ op: 'array', target: tmp, elements, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'ObjectExpr': {
        const props = (expr.props || []).map(p => {
          if (p.type === 'SpreadProp') {
            return { spread: true, value: lowerExpr(p.arg, instrs) };
          }
          return { spread: false, key: p.key, value: lowerExpr(p.value, instrs) };
        });
        const tmp = freshTemp();
        instrs.push({ op: 'object', target: tmp, props, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'BinaryExpr': {
        const left = lowerExpr(expr.left, instrs);
        const right = lowerExpr(expr.right, instrs);
        const tmp = freshTemp();
        instrs.push({ op: 'binary', target: tmp, operator: expr.op, left, right, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'UnaryExpr': {
        const arg = lowerExpr(expr.arg, instrs);
        const tmp = freshTemp();
        instrs.push({ op: 'unary', target: tmp, operator: expr.op, arg, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'PipeExpr': {
        // left |> fn  →  call(fn, [left])
        const left = lowerExpr(expr.left, instrs);
        const fn = lowerExpr(expr.right, instrs);
        const tmp = freshTemp();
        instrs.push({ op: 'call', target: tmp, callee: fn, args: [{ spread: false, value: left }], pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'MemberExpr': {
        const obj = lowerExpr(expr.obj, instrs);
        const tmp = freshTemp();
        instrs.push({ op: 'member', target: tmp, object: obj, property: expr.prop, optional: false, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'OptionalMemberExpr': {
        const obj = lowerExpr(expr.obj, instrs);
        const tmp = freshTemp();
        instrs.push({ op: 'member', target: tmp, object: obj, property: expr.prop, optional: true, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'IndexExpr': {
        const obj = lowerExpr(expr.obj, instrs);
        const idx = lowerExpr(expr.index, instrs);
        const tmp = freshTemp();
        instrs.push({ op: 'index', target: tmp, object: obj, index: idx, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'CallExpr': {
        const callee = lowerExpr(expr.callee, instrs);
        const args = (expr.args || []).map(a => {
          if (a.type === 'SpreadExpr') {
            return { spread: true, value: lowerExpr(a.arg, instrs) };
          }
          return { spread: false, value: lowerExpr(a, instrs) };
        });
        const tmp = freshTemp();
        instrs.push({ op: 'call', target: tmp, callee, args, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'LambdaExpr': {
        const params = (expr.params || []).map(p => ({ name: p.name }));
        const body = expr.body?.type === 'Block'
          ? lowerBlock(expr.body)
          : [{ op: 'return', value: lowerExpr(expr.body, []) }];
        const tmp = freshTemp();
        instrs.push({ op: 'lambda', target: tmp, params, body, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      case 'MatchExpr': {
        const target = lowerExpr(expr.target, instrs);
        const arms = (expr.arms || []).map(arm => ({
          pattern: arm.pat === '_' ? { wildcard: true } : {
            wildcard: false,
            tag: arm.pat.tag,
            bindings: (arm.pat.binds || []).map(b => b.name),
          },
          body: lowerMatchArmBody(arm.value),
        }));
        const tmp = freshTemp();
        instrs.push({ op: 'match', target: tmp, subject: target, arms, pos: expr.pos });
        return { ref: 'temp', name: tmp };
      }

      default:
        return { ref: 'literal', value: undefined, type: 'Void' };
    }
  }

  // Keep expression as an AST reference (for while conditions that re-evaluate)
  function exprToRef(expr) {
    return { ref: 'ast_expr', node: expr };
  }

  function lowerMatchArmBody(value) {
    if (!value) return [{ op: 'return', value: { ref: 'literal', value: undefined, type: 'Void' } }];
    if (value.type === 'Block') return lowerBlock(value);
    if (value.type === 'ReturnStmt') {
      const instrs = [];
      const val = lowerExpr(value.value, instrs);
      instrs.push({ op: 'return', value: val });
      return instrs;
    }
    const instrs = [];
    const val = lowerExpr(value, instrs);
    instrs.push({ op: 'return', value: val });
    return instrs;
  }
}

// ============================================================================
// IR PRETTY PRINTER (for debugging)
// ============================================================================

export function printIR(ir) {
  const lines = [];
  for (const decl of (ir.decls || [])) {
    switch (decl.kind) {
      case 'FnDecl': {
        const anns = decl.annotations.map(a => `@${a.name}(${a.args.join(', ')})`).join(' ');
        const params = decl.params.map(p => `${p.spread ? '...' : ''}${p.name}${p.type ? ': ' + printType(p.type) : ''}`).join(', ');
        const effects = decl.effects.length ? ` !${decl.effects.join(', ')}` : '';
        lines.push(`${anns ? anns + '\n' : ''}fn ${decl.name}(${params}) -> ${printType(decl.returnType)}${effects} {`);
        for (const instr of decl.body) {
          lines.push('  ' + printInstr(instr));
        }
        lines.push('}');
        lines.push('');
        break;
      }
      case 'TypeDecl': {
        const tp = decl.typeParams.length ? `<${decl.typeParams.join(', ')}>` : '';
        const variants = decl.variants.map(v => {
          if (v.tag && v.fields.length) return `${v.tag} { ${v.fields.map(f => `${f.name}: ${printType(f.type)}`).join(', ')} }`;
          if (v.tag) return v.tag;
          return '{ ... }';
        }).join(' | ');
        lines.push(`type ${decl.name}${tp} = ${variants}`);
        lines.push('');
        break;
      }
      case 'ImportDecl': {
        lines.push(`import { ${decl.names.join(', ')} } from "${decl.path}"`);
        break;
      }
    }
  }
  return lines.join('\n');
}

function printType(t) {
  if (!t) return '?';
  if (t.typeArgs && t.typeArgs.length) return `${t.base}<${t.typeArgs.map(printType).join(', ')}>`;
  return t.base;
}

function printRef(r) {
  if (!r) return '???';
  if (r.ref === 'literal') return JSON.stringify(r.value);
  if (r.ref === 'ident') return r.name;
  if (r.ref === 'temp') return `%${r.name}`;
  if (r.ref === 'ast_expr') return '<expr>';
  return '???';
}

function printInstr(instr) {
  switch (instr.op) {
    case 'let':      return `let ${instr.name} = ${printRef(instr.value)}`;
    case 'return':   return `return ${printRef(instr.value)}`;
    case 'expr':     return `_ = ${printRef(instr.value)}`;
    case 'binary':   return `%${instr.target} = ${printRef(instr.left)} ${instr.operator} ${printRef(instr.right)}`;
    case 'unary':    return `%${instr.target} = ${instr.operator}${printRef(instr.arg)}`;
    case 'call':     return `%${instr.target} = call ${printRef(instr.callee)}(${instr.args.map(a => (a.spread ? '...' : '') + printRef(a.value)).join(', ')})`;
    case 'member':   return `%${instr.target} = ${printRef(instr.object)}${instr.optional ? '?.' : '.'}${instr.property}`;
    case 'index':    return `%${instr.target} = ${printRef(instr.object)}[${printRef(instr.index)}]`;
    case 'array':    return `%${instr.target} = [${instr.elements.map(e => (e.spread ? '...' : '') + printRef(e.value)).join(', ')}]`;
    case 'object':   return `%${instr.target} = { ${instr.props.map(p => p.spread ? `...${printRef(p.value)}` : `${p.key}: ${printRef(p.value)}`).join(', ')} }`;
    case 'template': return `%${instr.target} = template(${instr.parts.map(printRef).join(', ')})`;
    case 'lambda':   return `%${instr.target} = lambda(${instr.params.map(p => p.name).join(', ')}) { ... }`;
    case 'match':    return `%${instr.target} = match ${printRef(instr.subject)} { ${instr.arms.length} arms }`;
    case 'if':       return `if ${printRef(instr.cond)} { ${instr.then.length} instrs }${instr.else ? ` else { ${instr.else.length} instrs }` : ''}`;
    case 'for_in':   return `for ${instr.binding} in ${printRef(instr.iterable)} { ${instr.body.length} instrs }`;
    case 'while':    return `while <cond> { ${instr.body.length} instrs }`;
    case 'break':    return 'break';
    case 'continue': return 'continue';
    default:         return `??? ${instr.op}`;
  }
}

// ============================================================================
// IR ANALYSIS UTILITIES
// ============================================================================

/** Extract all function signatures from IR (for cross-file analysis) */
export function extractSignatures(ir) {
  const sigs = {};
  for (const decl of (ir.decls || [])) {
    if (decl.kind !== 'FnDecl') continue;
    sigs[decl.name] = {
      params: decl.params,
      returnType: decl.returnType,
      effects: decl.effects,
      annotations: decl.annotations,
    };
  }
  return sigs;
}

/** Extract all type declarations from IR */
export function extractTypes(ir) {
  const types = {};
  for (const decl of (ir.decls || [])) {
    if (decl.kind !== 'TypeDecl') continue;
    types[decl.name] = {
      typeParams: decl.typeParams,
      variants: decl.variants,
    };
  }
  return types;
}

/** Walk all IR instructions, calling visitor for each */
export function walkIR(instrs, visitor) {
  for (const instr of instrs) {
    visitor(instr);
    if (instr.then) walkIR(instr.then, visitor);
    if (instr.else) walkIR(instr.else, visitor);
    if (instr.body) walkIR(instr.body, visitor);
    if (instr.arms) {
      for (const arm of instr.arms) {
        if (arm.body) walkIR(arm.body, visitor);
      }
    }
  }
}

/** Count IR instructions (for complexity analysis) */
export function countInstructions(ir) {
  let count = 0;
  for (const decl of (ir.decls || [])) {
    if (decl.kind === 'FnDecl') {
      walkIR(decl.body, () => count++);
    }
  }
  return count;
}
