// braid-parse.js — minimal parser (fn/let/return/if + arrays/objects/member/index/call/lambda + match)
"use strict";

const KW  = new Set(["fn","let","return","if","else","true","false","match","_","type","import","export"]);
const TWO = new Set(["->","=>","==","!=", "<=", ">=", "&&","||"]);

function fail(msg, tok){ const e=new Error(`${msg} at ${tok?.line??0}:${tok?.col??0}`); e.line=tok?.line; e.col=tok?.col; throw e; }

function tokenize(src){
  const toks=[]; let i=0, line=1, col=1;
  const push=(type,value)=>toks.push({type,value,line,col});
  const ws=c=>" \t\r\n".includes(c), id0=c=>/[A-Za-z_]/.test(c), idc=c=>/[A-Za-z0-9_]/.test(c);
  while(i<src.length){
    let c=src[i];
    if (ws(c)){ if(c==='\n'){line++; col=1}else col++; i++; continue; }
    if (c==='/' && src[i+1]==='/'){ while(i<src.length && src[i]!== '\n') i++; continue; }
    if (c==='"' || c==="'"){ const q=c; i++; let s=""; while(i<src.length&&src[i]!==q){ if(src[i]==='\n'){line++;col=1} s+=src[i++]; } if(src[i]!==q) fail("unterminated string",{line,col}); i++; push('string',s); continue; }
    if (/[0-9]/.test(c)){ let s=""; while(i<src.length && /[0-9.]/.test(src[i])){ s+=src[i++]; col++; } push('number',s); continue; }
    if (id0(c)){ let s=""; while(i<src.length && idc(src[i])){ s+=src[i++]; col++; } push(KW.has(s)?'kw':'ident', s); continue; }
    const two=src.slice(i,i+2); if (TWO.has(two)){ push('op',two); i+=2; col+=2; continue; }
    // @annotations (e.g., @policy)
    if (c === '@') { i++; col++; let s = ''; while (i < src.length && idc(src[i])) { s += src[i++]; col++; } push('annotation', s); continue; }
    const singles="{}()[],;:+-*/%!<>=.&|"; if (singles.includes(c)){ push(c,c); i++; col++; continue; }
    fail(`bad char '${c}'`, {line,col});
  }
  toks.push({type:'eof',value:'',line,col}); return toks;
}

const PREC = { '||':1, '&&':2, '==':3, '!=':3, '<':4, '>':4, '<=':4, '>=':4, '+':5, '-':5, '*':6, '/':6, '%':6 };

export function parse(src, filename="stdin"){
  const t=tokenize(src); let p=0;
  const pk=()=>t[p];
  const eat=(ty,va=null)=>{ const x=t[p]; if(!x||x.type!==ty||(va!==null&&x.value!==va)) fail(`expected ${va??ty}`, x); p++; return x; };
  const match=(ty,va=null)=> (t[p]?.type===ty && (va===null || t[p].value===va)) ? t[p++] : null;

  const items=[]; while (pk().type!=='eof') items.push(parseItem());
  return { type:'Program', items, filename };

  function parseItem(){
    // Collect annotations before declarations: @policy(WRITE_OPERATIONS)
    const annotations = [];
    while (pk().type === 'annotation') {
      const name = t[p++].value;  // e.g., 'policy'
      let args = null;
      if (match('(', '(')) {
        args = [];
        if (pk().type !== ')') {
          while (true) {
            const tok = t[p++];
            args.push(tok.value);
            if (!match(',', ',')) break;
          }
        }
        eat(')', ')');
      }
      annotations.push({ name, args });
    }
    if (pk().type==='kw' && pk().value==='fn') return parseFnDecl(annotations);
    if (pk().type==='kw' && pk().value==='type') return parseTypeDecl();
    if (pk().type==='kw' && pk().value==='import') return parseImport();
    fail(`unexpected token '${pk().value}'`, pk());
  }

  // type Name<T> = Variant1 | Variant2 | { field: Type, ... }
  function parseTypeDecl(){
    eat('kw','type');
    const name = eat('ident').value;
    let typeParams = [];
    if (match('<','<')){
      while(true){
        typeParams.push(eat('ident').value);
        if (match(',',',')) continue;
        break;
      }
      eat('>','>');
    }
    eat('=','=');
    const variants = [];
    while(true){
      if (pk().type==='{') variants.push(parseObjectType());
      else if (pk().type==='ident') {
        const tag = eat('ident').value;
        let fields = null;
        if (pk().type === '{') {
          fields = parseObjectType().fields;
        }
        variants.push({ tag, fields });
      }
      if (!match('|','|')) break;
    }
    return { type:'TypeDecl', name, typeParams, variants };
  }

  function parseObjectType(){
    eat('{','{');
    const fields = [];
    if (pk().type!=='}'){
      while(true){
        const key = eat('ident').value;
        eat(':',':');
        const fieldType = parseTypeRef();
        fields.push({ name: key, type: fieldType });
        if (match(',',',')) continue;
        break;
      }
    }
    eat('}','}');
    return { type:'ObjectType', fields };
  }

  function parseTypeRef(){
    const base = eat('ident').value;
    let typeArgs = [];
    if (match('<','<')){
      while(true){
        typeArgs.push(parseTypeRef());
        if (match(',',',')) continue;
        break;
      }
      eat('>','>');
    }
    return { base, typeArgs };
  }

  function parseImport(){
    eat('kw','import');
    eat('{','{');
    const names = [];
    while(true){
      names.push(eat('ident').value);
      if (match(',',',')) continue;
      break;
    }
    eat('}','}');
    eat('ident','from'); // "from" as contextual keyword
    const path = eat('string').value;
    return { type:'ImportDecl', names, path };
  }

  // fn name(params) -> Type [!effs] { block }
  function parseFnDecl(annotations = []){
    eat('kw','fn');
    const name = eat('ident').value;
    eat('(','(');
    const params = parseParams();
    eat(')',')');
    eat('op','->');
    const ret = parseTypeRef();
    let effects = [];
    if (match('!','!')) effects = parseEffects();
    const body = parseBlock();
    return { type:'FnDecl', name, params, ret, effects, body, annotations };
  }
  function parseParams(){
    const ps=[]; if (pk().type===')') return ps;
    while(true){
      const nm = eat('ident').value;
      let type = null;
      if (match(':',':')) type = parseTypeRef();
      ps.push({ name: nm, type });
      if (match(',',',')) continue;
      break;
    }
    return ps;
  }
  function parseEffects(){ const out=[]; while(true){ out.push(eat('ident').value); if(!match(',',',')) break; } return out; }

  function parseBlock(){
    eat('{','{');
    const statements=[];
    while (pk().type !== '}') statements.push(parseStmt());
    eat('}','}');
    return { type:'Block', statements };
  }

  function parseStmt(){
    const k=pk();
    if (k.type==='kw' && k.value==='let'){ eat('kw','let'); const name=eat('ident').value; let letType=null; if(match(':',':')) letType=parseTypeRef(); eat('=','='); const value=parseExpr(); eat(';',';'); return { type:'LetStmt', name, letType, value }; }
    if (k.type==='kw' && k.value==='return'){ eat('kw','return'); const value=parseExpr(); eat(';',';'); return { type:'ReturnStmt', value }; }
    if (k.type==='kw' && k.value==='if'){ eat('kw','if'); let cond=null; if (match('(','(')){ cond=parseExpr(); eat(')',')'); } else cond=parseExpr(); const then=parseBlock(); let els=null; if (pk().type==='kw' && pk().value==='else'){ eat('kw','else'); els=parseBlock(); } return { type:'IfStmt', cond, then, else: els }; }
    if (k.type==='kw' && k.value==='match'){ const expr=parseMatchExpr(); eat(';',';'); return { type:'ExprStmt', expr }; }
    const expr=parseExpr(); if (pk().type !== '}') eat(';',';'); else match(';',';'); return { type:'ExprStmt', expr };
  }

  // Pratt
  function parseExpr(){ return parseBinary(0); }
  function parseBinary(minBP){
    let left=parseUnary();
    for(;;){
      const tok=pk();
      // Check for two-char operators (from 'op' type) or single-char operators
      const op = (tok.type==='op' && (tok.value in PREC)) ? tok.value : (['+','-','*','/','%','<','>'].includes(tok.type) ? tok.type : null);
      if (!op) break;
      const bp = PREC[op]; if (bp==null || bp<minBP) break;
      p++; // eat op
      const right = parseBinary(bp+1);
      left = { type:'BinaryExpr', op, left, right };
    }
    return left;
  }
  function parseUnary(){
    if (match('-','-')) return { type:'UnaryExpr', op:'-', arg: parseUnary() };
    if (match('!','!')) return { type:'UnaryExpr', op:'!', arg: parseUnary() };
    return parsePostfix(parsePrimary());
  }
  function parsePrimary(){
    const k=pk();
    if (k.type==='number'){ p++; return { type:'NumberLit', value:Number(k.value) }; }
    if (k.type==='string'){ p++; return { type:'StringLit', value:k.value }; }
    if (k.type==='kw' && (k.value==='true'||k.value==='false')){ p++; return { type:'BoolLit', value:k.value==='true' }; }
    if (k.type==='kw' && k.value==='match'){ return parseMatchExpr(); }
    if (k.type==='ident'){ p++; return { type:'Ident', name:k.value }; }
    if (match('(','(')){
      // lambda or parens
      const names=[];
      if (pk().type!==')'){ while (true){ if (pk().type!=='ident') break; names.push(eat('ident').value); if (match(',',',')) continue; break; } }
      eat(')',')');
      if (match('op','=>')){ const body = (pk().type==='{') ? parseBlock() : parseExpr(); return { type:'LambdaExpr', params:names.map(n=>({name:n})), body }; }
      if (names.length===1) return { type:'Ident', name:names[0] }; // simple parens MVP
      fail('unsupported parenthesized expression in MVP', pk());
    }
    if (match('[','[')){ const elements=[]; if (pk().type!==']'){ while(true){ elements.push(parseExpr()); if (match(',',',')) continue; break; } } eat(']',']'); return { type:'ArrayExpr', elements }; }
    if (match('{','{')){ const props=[]; if (pk().type!=='}'){ while(true){ const key=eat('ident').value; eat(':',':'); const value=parseExpr(); props.push({key, value}); if (match(',',',')) continue; break; } } eat('}','}'); return { type:'ObjectExpr', props }; }
    fail(`unexpected token '${k.value}'`, k);
  }
  function parsePostfix(node){
    let n=node;
    for(;;){
      if (match('.', '.')){ const prop=eat('ident').value; n={ type:'MemberExpr', obj:n, prop }; continue; }
      if (match('[','[')){ const idx=parseExpr(); eat(']',']'); n={ type:'IndexExpr', obj:n, index: idx }; continue; }
      if (match('(','(')){ const args=[]; if (pk().type!==')'){ while(true){ args.push(parseExpr()); if (match(',',',')) continue; break; } } eat(')',')'); n={ type:'CallExpr', callee:n, args }; continue; }
      break;
    }
    return n;
  }

  // match expr: match target { Tag{a,b}? => expr (, ...)? (,_ => expr)? }
  function parseMatchExpr(){
    eat('kw','match');
    const target = parseExpr();
    eat('{','{');
    const arms=[];
    while (pk().type!=='}'){
      let pat;
      if (pk().type==='kw' && pk().value==='_'){ eat('kw','_'); pat='_'; }
      else {
        const tag = eat('ident').value;
        let binds=[];
        if (match('{','{')){ if (pk().type!=='}'){ while(true){ binds.push({ name: eat('ident').value }); if (match(',',',')) continue; break; } } eat('}','}'); }
        pat = { tag, binds };
      }
      eat('op','=>');
      // Match arm value: block body { stmts } or expression
      let value;
      if (pk().type==='{' && isBlockBody()) {
        value = parseBlock();
      } else if (pk().type==='kw' && pk().value==='return') {
        // Allow bare `return expr` in match arms
        eat('kw','return'); value = { type:'ReturnStmt', value: parseExpr() };
      } else {
        value = parseExpr();
      }
      arms.push({ pat, value });
      if (match(',',',')) continue; else break;
    }
    eat('}','}');
    return { type:'MatchExpr', target, arms, unionName: null };
  }
  // Lookahead: is { the start of a block body (with statements) vs an object literal?
  function isBlockBody(){
    // Save position, peek past {
    const saved = p; p++;
    const next = pk();
    p = saved;
    // Block body starts with let, return, if, match, or fn — object starts with ident : 
    return next && next.type==='kw' && ['let','return','if','match'].includes(next.value);
  }

}
