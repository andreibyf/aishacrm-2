#!/usr/bin/env node
"use strict";

/**
 * Braid → JavaScript transpiler (MVP, AST-first)
 */
import fs from 'fs';
import url from 'url';
import process from 'node:process';
import { parse } from './braid-parse.js';

export function transpileToJS(ast, opts = {}) {
  const { pure=false, policy=null, source='stdin', typescript=false, runtimeImport=null } = opts;
  const out = [];
  const ctx = { pure, policy, source, typescript, diags:[] };

  out.push(`"use strict";`);
  // Support custom runtime import path for data URL modules
  const rtPath = runtimeImport || "./braid-rt.js";
  out.push(`import { Ok, Err, IO, cap } from "${rtPath}";`);

  // Emit type declarations as JSDoc/TypeScript
  for (const it of (ast.items||[])) {
    if (it.type === 'TypeDecl') out.push(emitTypeDecl(it, ctx));
    if (it.type === 'ImportDecl') out.push(emitImport(it, ctx));
  }

  for (const it of (ast.items||[])) {
    if (it.type === 'FnDecl') out.push(emitFn(it, ctx));
  }
  if (ctx.diags.length) throw new Error(ctx.diags.map(d=>`${d.code}: ${d.message}`).join('\n'));
  return { code: out.join("\n\n"), map: null };
}

function emitTypeDecl(td, ctx){
  if (ctx.typescript) {
    // TypeScript union type
    const variants = td.variants.map(v => {
      if (v.type === 'ObjectType') return `{ ${v.fields.map(f=>`${f.name}: ${emitTypeRef(f.type)}`).join(', ')} }`;
      if (v.fields) return `{ tag: '${v.tag}', ${v.fields.map(f=>`${f.name}: ${emitTypeRef(f.type)}`).join(', ')} }`;
      return `'${v.tag}'`;
    }).join(' | ');
    return `export type ${td.name}${td.typeParams.length?`<${td.typeParams.join(',')}>`:''}  = ${variants};`;
  }
  // JSDoc for JavaScript
  const jsdoc = td.variants.map(v => {
    if (v.type === 'ObjectType') return `@typedef {Object} ${td.name}`;
    if (v.fields) return `@typedef {{tag: '${v.tag}', ${v.fields.map(f=>`${f.name}: ${emitTypeRef(f.type)}`).join(', ')}}} ${td.name}_${v.tag}`;
    return `@typedef {'${v.tag}'} ${td.name}_${v.tag}`;
  }).join('\n * ');
  return `/**\n * ${jsdoc}\n */`;
}

function emitTypeRef(ref){
  const baseMap = { String:'string', Number:'number', Boolean:'boolean', Array:'Array' };
  const base = baseMap[ref.base] || ref.base;
  if (ref.typeArgs.length) return `${base}<${ref.typeArgs.map(emitTypeRef).join(',')}>`;
  return base;
}

function emitImport(imp, _ctx){
  // Skip .braid imports - they're type-only declarations
  if (imp.path && imp.path.endsWith('.braid')) {
    return `// Type-only import from ${imp.path} (skipped in JS)`;
  }
  return `import { ${imp.names.join(', ')} } from "${imp.path}";`;
}

function emitFn(fn, ctx){
  const eff = new Set(fn.effects||[]);
  const isEff = eff.size>0;
  if (ctx.pure && isEff) ctx.diags.push({code:'TP001',message:`effectful function in --pure build: ${fn.name}`});
  const asyncKw = isEff ? 'async ' : '';
  const params = (isEff?['policy','deps']:[]).concat(fn.params.map(p=>p.name));

  let prolog='';
  if (isEff){
    for (const e of eff) prolog += `  cap(policy, "${e}");\n`;
    prolog += `  const io = IO(policy, deps);\n`;
    // Provide convenient aliases for common IO namespaces
    prolog += `  const { http, clock, fs, rng } = io;\n`;
  }

  const body = (fn.body && fn.body.type === 'Block')
    ? emitBlockAST(fn.body, { ...ctx, effectful: isEff })
    : transpileBlockRaw(fn.body?.raw || '');

  return `export ${asyncKw}function ${fn.name}(${params.join(', ')}) {\n${prolog}${body}\n}`;
}

function emitBlockAST(block, ctx){
  const lines=[];
  for (const st of (block.statements||[])){
    switch (st.type){
      case 'LetStmt':     lines.push(`  const ${st.name} = ${emitExpr(st.value, ctx)};`); break;
      case 'ReturnStmt':  lines.push(`  return ${emitExpr(st.value, ctx)};`); break;
      case 'ExprStmt':    lines.push(`  ${emitExpr(st.expr, ctx)};`); break;
      case 'IfStmt':      lines.push(emitIf(st, ctx)); break;
      default:            lines.push(`  /* unhandled stmt: ${st.type} */`);
    }
  }
  if (!lines.some(l => l.trim().startsWith('return '))) lines.push(`  return Ok(undefined);`);
  return lines.join("\n");
}

function emitIf(node, ctx){
  const cond = emitExpr(node.cond, ctx);
  const thenB = emitBlockAST(node.then, ctx);
  const elseB = node.else ? emitBlockAST(node.else, ctx) : null;
  let s = `  if (${cond}) {\n${thenB}\n  }`;
  if (elseB) s += ` else {\n${elseB}\n  }`;
  return s;
}

function emitExpr(node, ctx){
  if (!node) return 'undefined';
  switch (node.type){
    case 'NumberLit':   return String(node.value);
    case 'StringLit':   return JSON.stringify(node.value);
    case 'BoolLit':     return node.value ? 'true' : 'false';
    case 'NullLit':     return 'undefined';
    case 'Ident':       return node.name;
    case 'ArrayExpr':   return '[' + (node.elements||[]).map(e=>emitExpr(e,ctx)).join(', ') + ']';
    case 'ObjectExpr':  return '{ ' + (node.props||[]).map(p=>`${p.key}: ${emitExpr(p.value,ctx)}`).join(', ') + ' }';
    case 'MemberExpr':  return `${emitExpr(node.obj,ctx)}.${node.prop}`;
    case 'IndexExpr':   return `${emitExpr(node.obj,ctx)}[${emitExpr(node.index,ctx)}]`;
    case 'BinaryExpr':  return `(${emitExpr(node.left,ctx)} ${node.op} ${emitExpr(node.right,ctx)})`;
    case 'UnaryExpr':   return `(${node.op}${emitExpr(node.arg,ctx)})`;
    case 'CallExpr':    return emitCall(node, ctx);
    case 'LambdaExpr':  return emitLambda(node, ctx);
    case 'MatchExpr':   return emitMatchExpr(node, ctx);
    default:            return 'undefined';
  }
}

function emitLambda(node, ctx){
  const args = (node.params||[]).map(p=>p.name).join(', ');
  if (node.body?.type === 'Block') return `(${args}) => {\n${emitBlockAST(node.body, ctx)}\n}`;
  return `(${args}) => (${emitExpr(node.body, ctx)})`;
}

function emitCall(node, ctx){
  const name = node.callee?.name;
  const args = (node.args||[]).map(a=>emitExpr(a, ctx));
  if (name==='len'      && args.length===1) return `(${args[0]}).length`;
  if (name==='map'      && args.length===2) return `(${args[0]}).map(${args[1]})`;
  if (name==='filter'   && args.length===2) return `(${args[0]}).filter(${args[1]})`;
  if (name==='reduce'   && (args.length===2||args.length===3)) return `(${args[0]}).reduce(${args[1]}${args[2]?', '+args[2]:''})`;
  if (name==='find'     && args.length===2) return `(${args[0]}).find(${args[1]})`;
  if (name==='some'     && args.length===2) return `(${args[0]}).some(${args[1]})`;
  if (name==='every'    && args.length===2) return `(${args[0]}).every(${args[1]})`;
  if (name==='includes' && args.length===2) return `(${args[0]}).includes(${args[1]})`;
  if (name==='join'     && args.length===2) return `(${args[0]}).join(${args[1]})`;
  if (name==='sort'     && (args.length===1||args.length===2)) return `(${args[0]}).sort(${args[1]||''})`;
  if (name==='reverse'  && args.length===1) return `(${args[0]}).reverse()`;
  if (name==='flat'     && (args.length===1||args.length===2)) return `(${args[0]}).flat(${args[1]||''})`;
  if (name==='sum'      && args.length===1) return `(${args[0]}).reduce((a,b)=>a+b,0)`;
  if (name==='avg'      && args.length===1) return `((${args[0]}).reduce((a,b)=>a+b,0)/(${args[0]}).length)`;
  // Auto-await common effectful IO calls when inside effectful (async) functions
  if (ctx.effectful && node.callee && node.callee.type === 'MemberExpr' && node.callee.obj?.type === 'Ident') {
    const objName = node.callee.obj.name;
    const propName = node.callee.prop;
    if (objName === 'http' && ['get','post','put','delete'].includes(propName)) {
      return `await ${emitExpr(node.callee, ctx)}(${args.join(', ')})`;
    }
    if (objName === 'clock' && propName === 'sleep') {
      return `await ${emitExpr(node.callee, ctx)}(${args.join(', ')})`;
    }
  }
  const tgt = emitExpr(node.callee, ctx);
  return `${tgt}(${args.join(', ')})`;
}

function emitMatchExpr(node, ctx){
  const id="__t", t=emitExpr(node.target, ctx);
  let s = `(()=>{ const ${id}=(${t}); switch(${id}.tag){`;
  for (const arm of (node.arms||[])){
    if (arm.pat==='_' ){ s += ` default: return ${emitExpr(arm.value, ctx)};`; continue; }
    const tag = arm.pat.tag;
    s += ` case ${JSON.stringify(tag)}: {`;
    for (const b of (arm.pat.binds||[])) s += ` const ${b.name}=${id}.${b.name};`;
    s += ` return ${emitExpr(arm.value, ctx)}; }`;
  }
  s += ` } })()`;
  return s;
}

// Fallback for legacy raw blocks
function transpileBlockRaw(raw){
  const t=(raw||'').trim();
  if (!t) return '  return Ok(undefined);';
  if (t.startsWith('{') && t.endsWith('}')) return `  return Ok(${t});`;
  if (t.startsWith('[') && t.endsWith(']')) return `  return Ok(${t});`;
  if (/^[0-9]+(\.[0-9]+)?$/.test(t)) return `  return Ok(${t});`;
  if (/^".*"$/.test(t)) return `  return Ok(${t});`;
  return `  return Ok(${t});`;
}

// CLI
function mainCLI(){
  const args = process.argv.slice(2);
  if (args.length===0 || args.includes('--help')){
    console.log(`Usage: braid-transpile --file in.braid [--out out.js] [--pure] [--policy policy.json]`);
    process.exit(0);
  }
  const fIdx=args.indexOf('--file'); if (fIdx<0){ console.error('missing --file'); process.exit(1); }
  const inPath=args[fIdx+1];
  const outIdx=args.indexOf('--out'); const outPath=outIdx>=0?args[outIdx+1]:null;
  const pure=args.includes('--pure');
  const polIdx=args.indexOf('--policy');
  const policy=polIdx>=0?JSON.parse(fs.readFileSync(args[polIdx+1],'utf8')):null;

  const source=fs.readFileSync(inPath,'utf8');
  const ast=parse(source,inPath);
  const { code } = transpileToJS(ast,{source:inPath,pure,policy});
  if (outPath){ fs.writeFileSync(outPath,code,'utf8'); console.log(`✓ Transpiled ${inPath} → ${outPath}`); }
  else { process.stdout.write(code); }
}
// Guard against invocation contexts (e.g. `node -e`) where process.argv[1] may be undefined
const arg1 = (process && process.argv && process.argv.length > 1) ? process.argv[1] : null;
const isMain = arg1 && (import.meta.url === url.pathToFileURL(arg1).href);
if (isMain) mainCLI();
