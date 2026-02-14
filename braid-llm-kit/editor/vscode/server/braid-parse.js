// braid-parse.js — Braid language parser v0.4.0
// Produces an AST with source positions on every node.
// Features: error recovery, annotations, typed params, match arm blocks,
// for..in loops, while loops, string interpolation, optional chaining,
// pipe operator, spread operator, else-if chains, security property denylist.
"use strict";

const KW  = new Set([
  "fn","let","return","if","else","true","false","match","_",
  "type","import","export","for","in","while","break","continue","null"
]);
const TWO = new Set(["->","=>","==","!=","<=",">=","&&","||","|>","?."]);

const SECURITY_WARN_PROPS = new Set(["__proto__","constructor","prototype","__defineGetter__","__defineSetter__"]);

function makeError(msg, tok) {
  const e = new Error(`${msg} at ${tok?.line ?? 0}:${tok?.col ?? 0}`);
  e.line = tok?.line; e.col = tok?.col; e.braidParse = true;
  return e;
}
function fail(msg, tok) { throw makeError(msg, tok); }

function tokenize(src) {
  const toks = []; let i = 0, line = 1, col = 1;
  const push = (type, value) => toks.push({ type, value, line, col });
  const ws = c => " \t\r\n".includes(c);
  const id0 = c => /[A-Za-z_]/.test(c);
  const idc = c => /[A-Za-z0-9_]/.test(c);

  while (i < src.length) {
    let c = src[i];
    if (ws(c)) { if (c === '\n') { line++; col = 1; } else { col++; } i++; continue; }
    if (c === '/' && src[i+1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i+1] === '*') {
      i += 2; col += 2;
      while (i < src.length && !(src[i] === '*' && src[i+1] === '/')) { if (src[i] === '\n') { line++; col = 1; } else { col++; } i++; }
      if (i < src.length) { i += 2; col += 2; } continue;
    }
    if (c === '`') {
      const sL = line, sC = col; i++; col++;
      const parts = []; let cur = "";
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '$' && src[i+1] === '{') {
          if (cur.length > 0 || parts.length === 0) { parts.push({ kind: 'str', value: cur }); cur = ""; }
          i += 2; col += 2; let depth = 1; let expr = "";
          while (i < src.length && depth > 0) { if (src[i] === '{') depth++; if (src[i] === '}') depth--; if (depth > 0) expr += src[i]; if (src[i] === '\n') { line++; col = 1; } else { col++; } i++; }
          parts.push({ kind: 'expr', value: expr.trim() }); continue;
        }
        if (src[i] === '\\' && i+1 < src.length) {
          const n = src[i+1];
          if (n === 'n') cur += '\n'; else if (n === 't') cur += '\t'; else if (n === '\\') cur += '\\'; else if (n === '`') cur += '`'; else if (n === '$') cur += '$'; else cur += '\\' + n;
          i += 2; col += 2; continue;
        }
        if (src[i] === '\n') { line++; col = 1; } cur += src[i++]; col++;
      }
      if (i >= src.length) fail("unterminated template string", { line: sL, col: sC });
      i++; col++;
      if (cur.length > 0 || parts.length === 0) parts.push({ kind: 'str', value: cur });
      push('template', JSON.stringify(parts)); continue;
    }
    if (c === '"' || c === "'") {
      const q = c, sL = line, sC = col; i++; col++; let s = "";
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\' && i+1 < src.length) {
          const n = src[i+1];
          if (n === 'n') s += '\n'; else if (n === 't') s += '\t'; else if (n === '\\') s += '\\'; else if (n === q) s += q; else s += '\\' + n;
          i += 2; col += 2; continue;
        }
        if (src[i] === '\n') { line++; col = 1; } s += src[i++]; col++;
      }
      if (i >= src.length || src[i] !== q) fail("unterminated string", { line: sL, col: sC });
      i++; col++; push('string', s); continue;
    }
    if (/[0-9]/.test(c)) {
      let s = ""; const sC = col;
      while (i < src.length && /[0-9.]/.test(src[i])) { s += src[i++]; col++; }
      if ((s.match(/\./g) || []).length > 1) fail(`invalid number literal '${s}'`, { line, col: sC });
      push('number', s); continue;
    }
    if (id0(c)) { let s = ""; while (i < src.length && idc(src[i])) { s += src[i++]; col++; } push(KW.has(s) ? 'kw' : 'ident', s); continue; }
    if (c === '.' && src[i+1] === '.' && src[i+2] === '.') { push('op', '...'); i += 3; col += 3; continue; }
    const two = src.slice(i, i+2);
    if (TWO.has(two)) { push('op', two); i += 2; col += 2; continue; }
    if (c === '@') { i++; col++; let s = ''; while (i < src.length && idc(src[i])) { s += src[i++]; col++; } if (!s) fail("expected annotation name after @", { line, col }); push('annotation', s); continue; }
    const singles = "{}()[],;:+-*/%!<>=.&|?`";
    if (singles.includes(c)) { push(c, c); i++; col++; continue; }
    fail(`unexpected character '${c}'`, { line, col });
  }
  toks.push({ type: 'eof', value: '', line, col }); return toks;
}

const PREC = { '|>': 0, '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

export function parse(src, filename = "stdin", options = {}) {
  const { recover = false } = options;
  const t = tokenize(src); let p = 0; const diagnostics = [];
  const pk = () => t[p];
  const pos = () => ({ line: t[p]?.line, col: t[p]?.col, offset: p });
  const eat = (ty, va = null) => { const x = t[p]; if (!x || x.type !== ty || (va !== null && x.value !== va)) fail(`expected ${va ?? ty}, got '${x?.value ?? 'EOF'}'`, x); p++; return x; };
  const match = (ty, va = null) => (t[p]?.type === ty && (va === null || t[p].value === va)) ? t[p++] : null;

  const items = [];
  while (pk().type !== 'eof') {
    if (recover) { try { items.push(parseItem()); } catch (e) { if (e.braidParse) { diagnostics.push({ code: 'PARSE_ERROR', severity: 'error', message: e.message, line: e.line, col: e.col }); skipToNextItem(); } else throw e; } }
    else items.push(parseItem());
  }
  return { type: 'Program', items, filename, diagnostics };

  function skipToNextItem() { while (pk().type !== 'eof') { const tok = pk(); if (tok.type === 'kw' && (tok.value === 'fn' || tok.value === 'type' || tok.value === 'import')) break; if (tok.type === 'annotation') break; p++; } }

  function parseItem() {
    const annotations = [];
    while (pk().type === 'annotation') { const start = pos(); const name = t[p++].value; let args = null; if (match('(', '(')) { args = []; if (pk().type !== ')') { while (true) { const tok = t[p++]; args.push(tok.value); if (!match(',', ',')) break; } } eat(')', ')'); } annotations.push({ name, args, pos: start }); }
    if (pk().type === 'kw' && pk().value === 'fn') return parseFnDecl(annotations);
    if (pk().type === 'kw' && pk().value === 'type') return parseTypeDecl();
    if (pk().type === 'kw' && pk().value === 'import') return parseImport();
    fail(`unexpected token '${pk().value}'`, pk());
  }

  function parseTypeDecl() {
    const start = pos(); eat('kw', 'type'); const nameTok = eat('ident'); const name = nameTok.value;
    let typeParams = []; if (match('<', '<')) { while (true) { typeParams.push(eat('ident').value); if (match(',', ',')) continue; break; } eat('>', '>'); }
    eat('=', '='); const variants = [];
    while (true) { if (pk().type === '{') variants.push(parseObjectType()); else if (pk().type === 'ident') { const tag = eat('ident').value; let fields = null; if (pk().type === '{') fields = parseObjectType().fields; variants.push({ tag, fields }); } if (!match('|', '|')) break; }
    return { type: 'TypeDecl', name, typeParams, variants, pos: start, namePos: { line: nameTok.line, col: nameTok.col } };
  }
  function parseObjectType() { eat('{', '{'); const fields = []; if (pk().type !== '}') { while (true) { const key = eat('ident').value; eat(':', ':'); const fieldType = parseTypeRef(); fields.push({ name: key, type: fieldType }); if (match(',', ',')) continue; break; } } eat('}', '}'); return { type: 'ObjectType', fields }; }
  function parseTypeRef() { const base = eat('ident').value; let typeArgs = []; if (match('<', '<')) { while (true) { typeArgs.push(parseTypeRef()); if (match(',', ',')) continue; break; } eat('>', '>'); } return { base, typeArgs }; }
  function parseImport() { const start = pos(); eat('kw', 'import'); eat('{', '{'); const names = []; const nameTokens = []; while (true) { const tok = eat('ident'); names.push(tok.value); nameTokens.push({ name: tok.value, line: tok.line, col: tok.col }); if (match(',', ',')) continue; break; } eat('}', '}'); eat('ident', 'from'); const path = eat('string').value; return { type: 'ImportDecl', names, nameTokens, path, pos: start }; }

  function parseFnDecl(annotations = []) {
    const start = pos(); eat('kw', 'fn'); const nameTok = eat('ident'); const name = nameTok.value; eat('(', '('); const params = parseParams(); eat(')', ')'); eat('op', '->'); const ret = parseTypeRef();
    let effects = []; if (match('!', '!')) effects = parseEffects();
    const body = parseBlock();
    return { type: 'FnDecl', name, params, ret, effects, body, annotations, pos: start, namePos: { line: nameTok.line, col: nameTok.col } };
  }
  function parseParams() {
    const ps = []; if (pk().type === ')') return ps;
    while (true) {
      if (pk().type === 'op' && pk().value === '...') { eat('op', '...'); const tok = eat('ident'); const nm = tok.value; let type = null; if (match(':', ':')) type = parseTypeRef(); ps.push({ name: nm, type, spread: true, namePos: { line: tok.line, col: tok.col } }); }
      else { const tok = eat('ident'); const nm = tok.value; let type = null; if (match(':', ':')) type = parseTypeRef(); ps.push({ name: nm, type, namePos: { line: tok.line, col: tok.col } }); }
      if (match(',', ',')) continue; break;
    } return ps;
  }
  function parseEffects() { const out = []; while (true) { out.push(eat('ident').value); if (!match(',', ',')) break; } return out; }
  function parseBlock() { const start = pos(); eat('{', '{'); const statements = []; while (pk().type !== '}') statements.push(parseStmt()); eat('}', '}'); return { type: 'Block', statements, pos: start }; }

  function parseStmt() {
    const k = pk();
    if (k.type === 'kw' && k.value === 'let') { eat('kw', 'let'); const nameTok = eat('ident'); const name = nameTok.value; let letType = null; if (match(':', ':')) letType = parseTypeRef(); eat('=', '='); const value = parseExpr(); eat(';', ';'); return { type: 'LetStmt', name, letType, value, pos: { line: k.line, col: k.col }, namePos: { line: nameTok.line, col: nameTok.col } }; }
    if (k.type === 'kw' && k.value === 'return') { eat('kw', 'return'); const value = parseExpr(); eat(';', ';'); return { type: 'ReturnStmt', value, pos: { line: k.line, col: k.col } }; }
    if (k.type === 'kw' && k.value === 'if') return parseIfStmt();
    if (k.type === 'kw' && k.value === 'for') { eat('kw', 'for'); const bindTok = eat('ident'); const binding = bindTok.value; eat('kw', 'in'); const iterable = parseExpr(); const body = parseBlock(); return { type: 'ForStmt', binding, iterable, body, pos: { line: k.line, col: k.col }, namePos: { line: bindTok.line, col: bindTok.col } }; }
    if (k.type === 'kw' && k.value === 'while') { eat('kw', 'while'); let cond; if (match('(', '(')) { cond = parseExpr(); eat(')', ')'); } else cond = parseExpr(); const body = parseBlock(); return { type: 'WhileStmt', cond, body, pos: { line: k.line, col: k.col } }; }
    if (k.type === 'kw' && k.value === 'break') { eat('kw', 'break'); eat(';', ';'); return { type: 'BreakStmt', pos: { line: k.line, col: k.col } }; }
    if (k.type === 'kw' && k.value === 'continue') { eat('kw', 'continue'); eat(';', ';'); return { type: 'ContinueStmt', pos: { line: k.line, col: k.col } }; }
    if (k.type === 'kw' && k.value === 'match') { const expr = parseMatchExpr(); eat(';', ';'); return { type: 'ExprStmt', expr, pos: { line: k.line, col: k.col } }; }
    const expr = parseExpr(); if (pk().type !== '}') eat(';', ';'); else match(';', ';');
    return { type: 'ExprStmt', expr, pos: { line: k.line, col: k.col } };
  }

  function parseIfStmt() {
    const k = pk(); eat('kw', 'if');
    let cond; if (match('(', '(')) { cond = parseExpr(); eat(')', ')'); } else cond = parseExpr();
    const then = parseBlock(); let els = null;
    if (pk().type === 'kw' && pk().value === 'else') { eat('kw', 'else'); if (pk().type === 'kw' && pk().value === 'if') { els = { type: 'Block', statements: [parseIfStmt()], pos: pos() }; } else { els = parseBlock(); } }
    return { type: 'IfStmt', cond, then, else: els, pos: { line: k.line, col: k.col } };
  }

  function parseExpr() { return parseBinary(0); }
  function parseBinary(minBP) {
    let left = parseUnary();
    for (;;) {
      const tok = pk();
      const op = (tok.type === 'op' && (tok.value in PREC)) ? tok.value : (['+', '-', '*', '/', '%', '<', '>'].includes(tok.type) ? tok.type : null);
      if (!op) break; const bp = PREC[op]; if (bp == null || bp < minBP) break; p++;
      if (op === '|>') { const right = parseUnary(); left = { type: 'PipeExpr', left, right, pos: { line: tok.line, col: tok.col } }; }
      else { const right = parseBinary(bp + 1); left = { type: 'BinaryExpr', op, left, right, pos: { line: tok.line, col: tok.col } }; }
    } return left;
  }
  function parseUnary() { if (match('-', '-')) return { type: 'UnaryExpr', op: '-', arg: parseUnary() }; if (match('!', '!')) return { type: 'UnaryExpr', op: '!', arg: parseUnary() }; return parsePostfix(parsePrimary()); }

  function parsePrimary() {
    const k = pk();
    if (k.type === 'number') { p++; return { type: 'NumberLit', value: Number(k.value), pos: { line: k.line, col: k.col } }; }
    if (k.type === 'string') { p++; return { type: 'StringLit', value: k.value, pos: { line: k.line, col: k.col } }; }
    if (k.type === 'kw' && (k.value === 'true' || k.value === 'false')) { p++; return { type: 'BoolLit', value: k.value === 'true', pos: { line: k.line, col: k.col } }; }
    if (k.type === 'kw' && k.value === 'null') { p++; return { type: 'NullLit', pos: { line: k.line, col: k.col } }; }
    if (k.type === 'kw' && k.value === 'match') return parseMatchExpr();
    if (k.type === 'ident') { p++; return { type: 'Ident', name: k.value, pos: { line: k.line, col: k.col } }; }
    if (k.type === 'template') { p++; const parts = JSON.parse(k.value); return { type: 'TemplateLit', parts, pos: { line: k.line, col: k.col } }; }
    if (match('(', '(')) {
      const startP = p; const names = []; let isLambda = false;
      if (pk().type !== ')') { while (true) { if (pk().type !== 'ident') break; names.push(eat('ident').value); if (match(',', ',')) continue; break; } }
      if (pk().type === ')') { eat(')', ')'); if (match('op', '=>')) { isLambda = true; const body = (pk().type === '{') ? parseBlock() : parseExpr(); return { type: 'LambdaExpr', params: names.map(n => ({ name: n })), body }; } }
      if (!isLambda) { p = startP; const inner = parseExpr(); eat(')', ')'); return inner; }
      if (names.length === 1) return { type: 'Ident', name: names[0] };
      fail('unsupported parenthesized expression', pk());
    }
    if (match('[', '[')) {
      const elements = []; if (pk().type !== ']') { while (true) { if (pk().type === 'op' && pk().value === '...') { eat('op', '...'); elements.push({ type: 'SpreadExpr', arg: parseExpr() }); } else elements.push(parseExpr()); if (match(',', ',')) continue; break; } }
      eat(']', ']'); return { type: 'ArrayExpr', elements };
    }
    if (match('{', '{')) {
      const props = []; if (pk().type !== '}') { while (true) { if (pk().type === 'op' && pk().value === '...') { eat('op', '...'); props.push({ type: 'SpreadProp', arg: parseExpr() }); } else { const key = eat('ident').value; eat(':', ':'); const value = parseExpr(); props.push({ key, value }); } if (match(',', ',')) continue; break; } }
      eat('}', '}'); return { type: 'ObjectExpr', props };
    }
    fail(`unexpected token '${k.value}'`, k);
  }

  function parsePostfix(node) {
    let n = node;
    for (;;) {
      if (match('op', '?.')) { const propTok = eat('ident'); n = { type: 'OptionalMemberExpr', obj: n, prop: propTok.value, pos: { line: propTok.line, col: propTok.col } }; continue; }
      if (match('.', '.')) {
        const propTok = eat('ident');
        if (SECURITY_WARN_PROPS.has(propTok.value)) { diagnostics.push({ code: 'SEC001', severity: 'warning', message: `Access to '${propTok.value}' is a security risk and will be blocked at runtime`, line: propTok.line, col: propTok.col }); }
        n = { type: 'MemberExpr', obj: n, prop: propTok.value, pos: { line: propTok.line, col: propTok.col } }; continue;
      }
      if (match('[', '[')) { const idx = parseExpr(); eat(']', ']'); n = { type: 'IndexExpr', obj: n, index: idx }; continue; }
      if (match('(', '(')) {
        const args = []; if (pk().type !== ')') { while (true) { if (pk().type === 'op' && pk().value === '...') { eat('op', '...'); args.push({ type: 'SpreadExpr', arg: parseExpr() }); } else args.push(parseExpr()); if (match(',', ',')) continue; break; } }
        eat(')', ')'); n = { type: 'CallExpr', callee: n, args }; continue;
      }
      break;
    } return n;
  }

  function parseMatchExpr() {
    const start = pos(); eat('kw', 'match'); const target = parseExpr(); eat('{', '{'); const arms = [];
    while (pk().type !== '}') {
      let pat; if (pk().type === 'kw' && pk().value === '_') { eat('kw', '_'); pat = '_'; }
      else { const tag = eat('ident').value; let binds = []; if (match('{', '{')) { if (pk().type !== '}') { while (true) { binds.push({ name: eat('ident').value }); if (match(',', ',')) continue; break; } } eat('}', '}'); } pat = { tag, binds }; }
      eat('op', '=>');
      let value; if (pk().type === '{' && isBlockBody()) { value = parseBlock(); } else if (pk().type === 'kw' && pk().value === 'return') { eat('kw', 'return'); value = { type: 'ReturnStmt', value: parseExpr() }; } else { value = parseExpr(); }
      arms.push({ pat, value }); if (match(',', ',')) continue; else break;
    }
    eat('}', '}'); return { type: 'MatchExpr', target, arms, unionName: null, pos: start };
  }
  function isBlockBody() { const saved = p; p++; const next = pk(); p = saved; return next && next.type === 'kw' && ['let', 'return', 'if', 'match', 'for', 'while'].includes(next.value); }
}
