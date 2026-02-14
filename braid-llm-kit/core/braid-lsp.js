// braid-lsp.js — Braid Language Server Protocol implementation
// Provides: real-time diagnostics, hover info, go-to-definition,
// completion, signature help, document symbols.
"use strict";

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  CompletionItemKind,
  SymbolKind,
  MarkupKind,
} from 'vscode-languageserver/node.js';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from './braid-parse.js';
import { transpileToJS, detectUsedEffects, extractPolicies, VALID_POLICIES, IO_EFFECT_MAP, BRAID_TYPE_MAP } from './braid-transpile.js';
import { typeCheck } from './braid-types.js';

// ============================================================================
// SERVER SETUP
// ============================================================================

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// AST cache: uri → { ast, version }
const astCache = new Map();

connection.onInitialize((params) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ['.', '@', '!', '|', '?'],
        resolveProvider: false,
      },
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ['(', ','],
      },
    },
  };
});

connection.onInitialized(() => {
  connection.console.log('Braid LSP server initialized');
});

// ============================================================================
// DOCUMENT VALIDATION (real-time diagnostics)
// ============================================================================

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

function validateDocument(doc) {
  const text = doc.getText();
  const uri = doc.uri;
  const diagnostics = [];

  // Phase 1: Parse
  let ast;
  try {
    ast = parse(text, uri, { recover: true });
  } catch (e) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      message: `Fatal parse error: ${e.message}`,
      source: 'braid',
      code: 'PARSE_FATAL',
    });
    connection.sendDiagnostics({ uri, diagnostics });
    return;
  }

  // Cache the AST
  astCache.set(uri, { ast, version: doc.version });

  // Parser diagnostics (syntax errors, security warnings)
  for (const d of (ast.diagnostics || [])) {
    diagnostics.push({
      severity: d.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      range: {
        start: { line: (d.line || 1) - 1, character: (d.col || 1) - 1 },
        end: { line: (d.line || 1) - 1, character: (d.col || 1) + 10 },
      },
      message: d.message,
      source: 'braid',
      code: d.code,
    });
  }

  // Phase 2: Structural checks per function
  for (const item of (ast.items || [])) {
    if (item.type !== 'FnDecl') continue;
    const fn = item;
    const fnLine = (fn.pos?.line || 1) - 1;

    // Missing @policy annotation
    const hasPolicy = (fn.annotations || []).some(a => a.name === 'policy');
    if (!hasPolicy && (fn.effects || []).length > 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: fnLine, character: 0 }, end: { line: fnLine, character: fn.name.length + 3 } },
        message: `Function '${fn.name}' has effects but no @policy annotation`,
        source: 'braid',
        code: 'BRD010',
      });
    }

    // Invalid policy name
    const policyAnn = (fn.annotations || []).find(a => a.name === 'policy');
    if (policyAnn) {
      const policyName = policyAnn.args?.[0];
      if (policyName && !VALID_POLICIES.has(policyName)) {
        const annLine = (policyAnn.pos?.line || 1) - 1;
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: annLine, character: 0 }, end: { line: annLine, character: 20 } },
          message: `Unknown policy '${policyName}'. Valid: ${[...VALID_POLICIES].join(', ')}`,
          source: 'braid',
          code: 'BRD011',
        });
      }
    }

    // Effect consistency
    const declared = new Set(fn.effects || []);
    if (fn.body) {
      const used = detectUsedEffects(fn.body);
      for (const u of used) {
        if (!declared.has(u)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: fnLine, character: 0 }, end: { line: fnLine, character: 50 } },
            message: `'${fn.name}' uses '${u}' effect but doesn't declare !${u}`,
            source: 'braid',
            code: 'BRD020',
          });
        }
      }
      for (const d of declared) {
        if (!used.has(d)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: { start: { line: fnLine, character: 0 }, end: { line: fnLine, character: 50 } },
            message: `'${fn.name}' declares !${d} but never uses it`,
            source: 'braid',
            code: 'BRD021',
          });
        }
      }
    }

    // tenant_id convention: effectful functions should have tenant_id as first param
    if (declared.size > 0 && fn.params.length > 0) {
      const firstParam = fn.params[0];
      if (firstParam.name !== 'tenant_id') {
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: { start: { line: fnLine, character: 0 }, end: { line: fnLine, character: 50 } },
          message: `Convention: effectful functions should have 'tenant_id' as first parameter`,
          source: 'braid',
          code: 'BRD030',
        });
      }
    }

    // Match exhaustiveness: warn if no wildcard arm
    checkMatchExhaustiveness(fn.body, diagnostics);

    // Null literal usage
    checkNullUsage(fn.body, diagnostics);

    // Unreachable code after return
    checkUnreachable(fn.body, diagnostics);
  }

  // Phase 3: Type checking
  try {
    const { diagnostics: tcDiags } = typeCheck(ast);
    for (const d of tcDiags) {
      diagnostics.push({
        severity: d.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
        range: {
          start: { line: (d.line || 1) - 1, character: (d.col || 1) - 1 },
          end: { line: (d.line || 1) - 1, character: (d.col || 1) + 10 },
        },
        message: d.message,
        source: 'braid-types',
        code: d.code,
      });
    }
  } catch (e) {
    // Type checker should not crash the LSP
  }

  connection.sendDiagnostics({ uri, diagnostics });
}

function checkMatchExhaustiveness(node, diagnostics) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'MatchExpr') {
    const hasWildcard = (node.arms || []).some(a => a.pat === '_');
    if (!hasWildcard) {
      const line = (node.pos?.line || 1) - 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line, character: 0 }, end: { line, character: 20 } },
        message: 'Match expression has no wildcard (_) arm — may not be exhaustive',
        source: 'braid',
        code: 'BRD040',
      });
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'pos' || key === 'type') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach(c => checkMatchExhaustiveness(c, diagnostics));
    else if (child && typeof child === 'object' && child.type) checkMatchExhaustiveness(child, diagnostics);
  }
}

function checkNullUsage(node, diagnostics) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'NullLit') {
    const line = (node.pos?.line || 1) - 1;
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: { start: { line, character: (node.pos?.col || 1) - 1 }, end: { line, character: (node.pos?.col || 1) + 3 } },
      message: 'Prefer Option<T> (Some/None) over null',
      source: 'braid',
      code: 'BRD002',
    });
  }
  for (const key of Object.keys(node)) {
    if (key === 'pos' || key === 'type') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach(c => checkNullUsage(c, diagnostics));
    else if (child && typeof child === 'object' && child.type) checkNullUsage(child, diagnostics);
  }
}

function checkUnreachable(node, diagnostics) {
  if (!node || node.type !== 'Block') return;
  const stmts = node.statements || [];
  for (let i = 0; i < stmts.length - 1; i++) {
    if (stmts[i].type === 'ReturnStmt') {
      const nextLine = (stmts[i + 1].pos?.line || 1) - 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: nextLine, character: 0 }, end: { line: nextLine, character: 20 } },
        message: 'Unreachable code after return statement',
        source: 'braid',
        code: 'BRD050',
      });
      break;
    }
  }
}

// ============================================================================
// HOVER
// ============================================================================

connection.onHover((params) => {
  const uri = params.textDocument.uri;
  const cached = astCache.get(uri);
  if (!cached) return null;

  const doc = documents.get(uri);
  if (!doc) return null;

  const line = params.position.line;
  const col = params.position.character;
  const text = doc.getText();
  const lines = text.split('\n');
  if (line >= lines.length) return null;

  const lineText = lines[line];
  const word = getWordAt(lineText, col);
  if (!word) return null;

  // Check if it's a function name
  const fn = (cached.ast.items || []).find(i => i.type === 'FnDecl' && i.name === word);
  if (fn) {
    return { contents: buildFnHover(fn) };
  }

  // Check if it's a type name
  const td = (cached.ast.items || []).find(i => i.type === 'TypeDecl' && i.name === word);
  if (td) {
    return { contents: buildTypeHover(td) };
  }

  // Check stdlib builtins
  const stdlib = getStdlibHover(word);
  if (stdlib) return { contents: stdlib };

  // Check keywords/concepts
  const kwHover = getKeywordHover(word);
  if (kwHover) return { contents: kwHover };

  // Check IO namespaces
  const ioHover = getIOHover(word, lineText, col);
  if (ioHover) return { contents: ioHover };

  return null;
});

function buildFnHover(fn) {
  const params = fn.params.map(p => {
    const spread = p.spread ? '...' : '';
    const type = p.type ? `: ${formatType(p.type)}` : '';
    return `${spread}${p.name}${type}`;
  }).join(', ');

  const effects = (fn.effects || []).length > 0 ? ` !${fn.effects.join(', ')}` : '';
  const ret = formatType(fn.ret);
  const policy = (fn.annotations || []).find(a => a.name === 'policy');
  const policyStr = policy ? `@policy(${policy.args[0]})\n` : '';

  return {
    kind: MarkupKind.Markdown,
    value: `\`\`\`braid\n${policyStr}fn ${fn.name}(${params}) -> ${ret}${effects}\n\`\`\``,
  };
}

function buildTypeHover(td) {
  const variants = td.variants.map(v => {
    if (v.type === 'ObjectType') return `{ ${v.fields.map(f => `${f.name}: ${formatType(f.type)}`).join(', ')} }`;
    if (v.fields) return `${v.tag} { ${v.fields.map(f => `${f.name}: ${formatType(f.type)}`).join(', ')} }`;
    return v.tag;
  }).join(' | ');
  const tp = td.typeParams.length ? `<${td.typeParams.join(', ')}>` : '';
  return {
    kind: MarkupKind.Markdown,
    value: `\`\`\`braid\ntype ${td.name}${tp} = ${variants}\n\`\`\``,
  };
}

function formatType(t) {
  if (!t) return '?';
  const base = t.base || '?';
  if (t.typeArgs && t.typeArgs.length) return `${base}<${t.typeArgs.map(formatType).join(', ')}>`;
  return base;
}

function getStdlibHover(name) {
  const docs = {
    len: '`len(arr)` → `Number`\n\nReturns the length of an array or string.',
    map: '`map(arr, fn)` → `Array`\n\nTransform each element using the function.',
    filter: '`filter(arr, fn)` → `Array`\n\nKeep elements where the function returns true.',
    reduce: '`reduce(arr, fn, init?)` → `T`\n\nReduce array to a single value.',
    find: '`find(arr, fn)` → `T | undefined`\n\nFind first element matching predicate.',
    some: '`some(arr, fn)` → `Boolean`\n\nTrue if any element matches.',
    every: '`every(arr, fn)` → `Boolean`\n\nTrue if all elements match.',
    includes: '`includes(arr, item)` → `Boolean`\n\nTrue if array contains the item.',
    join: '`join(arr, sep)` → `String`\n\nJoin array elements into a string.',
    sort: '`sort(arr, fn?)` → `Array`\n\nSort array, optionally with comparator.',
    reverse: '`reverse(arr)` → `Array`\n\nReverse array order.',
    flat: '`flat(arr, depth?)` → `Array`\n\nFlatten nested arrays.',
    sum: '`sum(arr)` → `Number`\n\nSum all numeric elements.',
    avg: '`avg(arr)` → `Number`\n\nAverage of all numeric elements.',
    keys: '`keys(obj)` → `Array<String>`\n\nGet all keys of an object.',
    values: '`values(obj)` → `Array`\n\nGet all values of an object.',
    entries: '`entries(obj)` → `Array<[String, T]>`\n\nGet key-value pairs.',
    parseInt: '`parseInt(str, radix?)` → `Number`\n\nParse string to integer.',
    parseFloat: '`parseFloat(str)` → `Number`\n\nParse string to float.',
    toString: '`toString(val)` → `String`\n\nConvert value to string.',
    Ok: '`Ok(value)` → `Result<T, E>`\n\nSuccess result constructor.',
    Err: '`Err(error)` → `Result<T, E>`\n\nError result constructor.',
    Some: '`Some(value)` → `Option<T>`\n\nPresent value constructor.',
    None: '`None` → `Option<T>`\n\nAbsent value (frozen singleton).',
  };
  if (docs[name]) return { kind: MarkupKind.Markdown, value: docs[name] };
  return null;
}

function getKeywordHover(word) {
  const docs = {
    'match': '**match expression**\n\nPattern match on tagged unions:\n```braid\nmatch result {\n  Ok{value} => value,\n  Err{error} => handle(error),\n  _ => fallback\n}\n```',
    'for': '**for..in loop**\n\nIterate over collections:\n```braid\nfor item in items {\n  process(item);\n}\n```',
    'while': '**while loop**\n\nLoop while condition is true:\n```braid\nwhile count < limit {\n  count = count + 1;\n}\n```',
  };
  if (docs[word]) return { kind: MarkupKind.Markdown, value: docs[word] };
  return null;
}

function getIOHover(word, lineText, col) {
  const ioDocs = {
    http: '**IO namespace: http** (!net)\n\n- `http.get(url, opts)` — GET request\n- `http.post(url, opts)` — POST request\n- `http.put(url, opts)` — PUT request\n- `http.delete(url, opts)` — DELETE request\n\nRequires `!net` effect declaration.',
    clock: '**IO namespace: clock** (!clock)\n\n- `clock.now()` — Current timestamp\n- `clock.sleep(ms)` — Async delay\n\nRequires `!clock` effect declaration.',
    fs: '**IO namespace: fs** (!fs)\n\n- `fs.read(path)` — Read file\n- `fs.write(path, data)` — Write file\n\nRequires `!fs` effect declaration.',
    rng: '**IO namespace: rng** (!rng)\n\n- `rng.random()` — Random float 0-1\n- `rng.uuid()` — Generate UUID\n\nRequires `!rng` effect declaration.',
  };
  if (ioDocs[word]) return { kind: MarkupKind.Markdown, value: ioDocs[word] };
  return null;
}

// ============================================================================
// COMPLETION
// ============================================================================

connection.onCompletion((params) => {
  const uri = params.textDocument.uri;
  const doc = documents.get(uri);
  if (!doc) return [];

  const text = doc.getText();
  const lines = text.split('\n');
  const line = params.position.line;
  const col = params.position.character;
  if (line >= lines.length) return [];

  const lineText = lines[line];
  const before = lineText.slice(0, col);
  const items = [];

  // After @ → annotation completions
  if (before.endsWith('@') || before.match(/@\w*$/)) {
    items.push(
      { label: '@policy', kind: CompletionItemKind.Keyword, insertText: 'policy(${1|READ_ONLY,WRITE_OPERATIONS,DELETE_OPERATIONS,ADMIN_ONLY|})', detail: 'Policy annotation' },
      { label: '@audit', kind: CompletionItemKind.Keyword, insertText: 'audit', detail: 'Audit annotation' },
      { label: '@deprecated', kind: CompletionItemKind.Keyword, insertText: 'deprecated', detail: 'Deprecation marker' },
    );
    return items;
  }

  // After |> → function completions from current file
  if (before.match(/\|>\s*$/)) {
    const cached = astCache.get(uri);
    if (cached) {
      for (const item of (cached.ast.items || [])) {
        if (item.type === 'FnDecl') {
          items.push({
            label: item.name,
            kind: CompletionItemKind.Function,
            detail: `fn ${item.name}(...) -> ${formatType(item.ret)}`,
          });
        }
      }
    }
    // Also suggest stdlib
    for (const name of ['map', 'filter', 'reduce', 'find', 'sort', 'reverse', 'flat', 'sum', 'avg', 'len', 'join']) {
      items.push({ label: name, kind: CompletionItemKind.Function, detail: `stdlib: ${name}` });
    }
    return items;
  }

  // After . → member completions
  if (before.match(/\w+\.$/)) {
    const obj = before.match(/(\w+)\.$/)?.[1];
    if (obj === 'http') {
      items.push(
        { label: 'get', kind: CompletionItemKind.Method, detail: 'http.get(url, opts) !net' },
        { label: 'post', kind: CompletionItemKind.Method, detail: 'http.post(url, opts) !net' },
        { label: 'put', kind: CompletionItemKind.Method, detail: 'http.put(url, opts) !net' },
        { label: 'delete', kind: CompletionItemKind.Method, detail: 'http.delete(url, opts) !net' },
      );
    } else if (obj === 'clock') {
      items.push(
        { label: 'now', kind: CompletionItemKind.Method, detail: 'clock.now() !clock' },
        { label: 'sleep', kind: CompletionItemKind.Method, detail: 'clock.sleep(ms) !clock' },
      );
    } else if (obj === 'fs') {
      items.push(
        { label: 'read', kind: CompletionItemKind.Method, detail: 'fs.read(path) !fs' },
        { label: 'write', kind: CompletionItemKind.Method, detail: 'fs.write(path, data) !fs' },
      );
    } else if (obj === 'rng') {
      items.push(
        { label: 'random', kind: CompletionItemKind.Method, detail: 'rng.random() !rng' },
        { label: 'uuid', kind: CompletionItemKind.Method, detail: 'rng.uuid() !rng' },
      );
    } else if (obj === 'CRMError') {
      items.push(
        { label: 'fromHTTP', kind: CompletionItemKind.Method, detail: 'CRMError.fromHTTP(url, status, op)' },
        { label: 'notFound', kind: CompletionItemKind.Method, detail: 'CRMError.notFound(entity, id, op)' },
        { label: 'validation', kind: CompletionItemKind.Method, detail: 'CRMError.validation(fn, field, msg)' },
        { label: 'forbidden', kind: CompletionItemKind.Method, detail: 'CRMError.forbidden(op, role, req)' },
        { label: 'network', kind: CompletionItemKind.Method, detail: 'CRMError.network(url, code, op)' },
      );
    }
    return items;
  }

  // After ! → effect completions
  if (before.match(/->\s*\w+(<[^>]*>)?\s*![\w,\s]*$/)) {
    items.push(
      { label: 'net', kind: CompletionItemKind.Keyword, detail: 'Network effect (http)' },
      { label: 'clock', kind: CompletionItemKind.Keyword, detail: 'Time effect (clock)' },
      { label: 'fs', kind: CompletionItemKind.Keyword, detail: 'File system effect' },
      { label: 'rng', kind: CompletionItemKind.Keyword, detail: 'Random effect' },
    );
    return items;
  }

  // General completions (keywords, ADTs, stdlib)
  const kws = ['fn', 'let', 'return', 'if', 'else', 'match', 'for', 'in', 'while', 'break', 'continue', 'type', 'import', 'true', 'false', 'null'];
  for (const kw of kws) {
    items.push({ label: kw, kind: CompletionItemKind.Keyword });
  }

  const adts = ['Ok', 'Err', 'Some', 'None', 'CRMError'];
  for (const a of adts) {
    items.push({ label: a, kind: CompletionItemKind.Constructor, detail: 'Result/Option ADT' });
  }

  const stdlib = ['len', 'map', 'filter', 'reduce', 'find', 'some', 'every', 'includes', 'join', 'sort', 'reverse', 'flat', 'sum', 'avg', 'keys', 'values', 'entries'];
  for (const s of stdlib) {
    items.push({ label: s, kind: CompletionItemKind.Function, detail: `stdlib: ${s}` });
  }

  // Functions from current file
  const cached = astCache.get(uri);
  if (cached) {
    for (const item of (cached.ast.items || [])) {
      if (item.type === 'FnDecl') {
        items.push({ label: item.name, kind: CompletionItemKind.Function, detail: `fn ${item.name}` });
      }
      if (item.type === 'TypeDecl') {
        items.push({ label: item.name, kind: CompletionItemKind.Class, detail: `type ${item.name}` });
      }
    }
  }

  return items;
});

// ============================================================================
// GO TO DEFINITION
// ============================================================================

connection.onDefinition((params) => {
  const uri = params.textDocument.uri;
  const cached = astCache.get(uri);
  if (!cached) return null;

  const doc = documents.get(uri);
  if (!doc) return null;

  const line = params.position.line;
  const col = params.position.character;
  const text = doc.getText();
  const lines = text.split('\n');
  if (line >= lines.length) return null;

  const word = getWordAt(lines[line], col);
  if (!word) return null;

  // Find function or type declaration
  for (const item of (cached.ast.items || [])) {
    if ((item.type === 'FnDecl' || item.type === 'TypeDecl') && item.name === word) {
      return {
        uri,
        range: {
          start: { line: (item.pos?.line || 1) - 1, character: (item.pos?.col || 1) - 1 },
          end: { line: (item.pos?.line || 1) - 1, character: (item.pos?.col || 1) - 1 + word.length },
        },
      };
    }
  }

  // Find local variable (let bindings in the current function)
  const currentFn = findFnAtLine(cached.ast, line + 1);
  if (currentFn) {
    const binding = findLetBinding(currentFn.body, word);
    if (binding) {
      return {
        uri,
        range: {
          start: { line: (binding.pos?.line || 1) - 1, character: (binding.pos?.col || 1) - 1 },
          end: { line: (binding.pos?.line || 1) - 1, character: (binding.pos?.col || 1) - 1 + word.length },
        },
      };
    }
    // Check params
    const param = currentFn.params.find(p => p.name === word);
    if (param) {
      return {
        uri,
        range: {
          start: { line: (currentFn.pos?.line || 1) - 1, character: 0 },
          end: { line: (currentFn.pos?.line || 1) - 1, character: 50 },
        },
      };
    }
  }

  return null;
});

function findFnAtLine(ast, line) {
  // Simple: find the function whose body contains this line
  for (const item of (ast.items || [])) {
    if (item.type !== 'FnDecl') continue;
    if (item.pos?.line <= line) return item; // rough heuristic
  }
  return null;
}

function findLetBinding(node, name) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'LetStmt' && node.name === name) return node;
  if (node.type === 'ForStmt' && node.binding === name) return node;
  for (const key of Object.keys(node)) {
    if (key === 'pos' || key === 'type') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        const found = findLetBinding(c, name);
        if (found) return found;
      }
    } else if (child && typeof child === 'object' && child.type) {
      const found = findLetBinding(child, name);
      if (found) return found;
    }
  }
  return null;
}

// ============================================================================
// DOCUMENT SYMBOLS (outline)
// ============================================================================

connection.onDocumentSymbol((params) => {
  const uri = params.textDocument.uri;
  const cached = astCache.get(uri);
  if (!cached) return [];

  const symbols = [];
  for (const item of (cached.ast.items || [])) {
    if (item.type === 'FnDecl') {
      const effects = (item.effects || []).length > 0 ? ` !${item.effects.join(', ')}` : '';
      const policy = (item.annotations || []).find(a => a.name === 'policy');
      const detail = `${formatType(item.ret)}${effects}${policy ? ` @${policy.args[0]}` : ''}`;
      symbols.push({
        name: item.name,
        kind: SymbolKind.Function,
        detail,
        range: {
          start: { line: (item.pos?.line || 1) - 1, character: 0 },
          end: { line: (item.pos?.line || 1) - 1 + 20, character: 0 },
        },
        selectionRange: {
          start: { line: (item.pos?.line || 1) - 1, character: (item.pos?.col || 1) - 1 },
          end: { line: (item.pos?.line || 1) - 1, character: (item.pos?.col || 1) - 1 + item.name.length },
        },
      });
    }
    if (item.type === 'TypeDecl') {
      symbols.push({
        name: item.name,
        kind: SymbolKind.Class,
        detail: `type ${item.name}`,
        range: {
          start: { line: (item.pos?.line || 1) - 1, character: 0 },
          end: { line: (item.pos?.line || 1) - 1 + 5, character: 0 },
        },
        selectionRange: {
          start: { line: (item.pos?.line || 1) - 1, character: (item.pos?.col || 1) - 1 },
          end: { line: (item.pos?.line || 1) - 1, character: (item.pos?.col || 1) - 1 + item.name.length },
        },
      });
    }
  }
  return symbols;
});

// ============================================================================
// SIGNATURE HELP
// ============================================================================

connection.onSignatureHelp((params) => {
  const uri = params.textDocument.uri;
  const cached = astCache.get(uri);
  if (!cached) return null;

  const doc = documents.get(uri);
  if (!doc) return null;

  const line = params.position.line;
  const col = params.position.character;
  const lines = doc.getText().split('\n');
  if (line >= lines.length) return null;

  const before = lines[line].slice(0, col);

  // Find the function name before the opening paren
  const fnMatch = before.match(/(\w+)\s*\([^)]*$/);
  if (!fnMatch) return null;

  const fnName = fnMatch[1];

  // Look up in current file
  const fn = (cached.ast.items || []).find(i => i.type === 'FnDecl' && i.name === fnName);
  if (fn) {
    const params = fn.params.map(p => {
      const spread = p.spread ? '...' : '';
      const type = p.type ? `: ${formatType(p.type)}` : '';
      return { label: `${spread}${p.name}${type}` };
    });
    return {
      signatures: [{
        label: `${fn.name}(${params.map(p => p.label).join(', ')}) -> ${formatType(fn.ret)}`,
        parameters: params,
      }],
      activeSignature: 0,
      activeParameter: (before.match(/,/g) || []).length,
    };
  }

  // Stdlib signatures
  const stdlibSigs = {
    map: { label: 'map(arr, fn)', params: [{ label: 'arr' }, { label: 'fn: (item) => T' }] },
    filter: { label: 'filter(arr, fn)', params: [{ label: 'arr' }, { label: 'fn: (item) => Boolean' }] },
    reduce: { label: 'reduce(arr, fn, init?)', params: [{ label: 'arr' }, { label: 'fn: (acc, item) => T' }, { label: 'init?: T' }] },
    find: { label: 'find(arr, fn)', params: [{ label: 'arr' }, { label: 'fn: (item) => Boolean' }] },
    join: { label: 'join(arr, sep)', params: [{ label: 'arr' }, { label: 'sep: String' }] },
    sort: { label: 'sort(arr, fn?)', params: [{ label: 'arr' }, { label: 'fn?: (a, b) => Number' }] },
    includes: { label: 'includes(arr, item)', params: [{ label: 'arr' }, { label: 'item' }] },
    len: { label: 'len(arr)', params: [{ label: 'arr' }] },
    sum: { label: 'sum(arr)', params: [{ label: 'arr: Array<Number>' }] },
    avg: { label: 'avg(arr)', params: [{ label: 'arr: Array<Number>' }] },
  };

  if (stdlibSigs[fnName]) {
    const sig = stdlibSigs[fnName];
    return {
      signatures: [{ label: sig.label, parameters: sig.params }],
      activeSignature: 0,
      activeParameter: (before.match(/,/g) || []).length,
    };
  }

  return null;
});

// ============================================================================
// HELPERS
// ============================================================================

function getWordAt(lineText, col) {
  let start = col, end = col;
  while (start > 0 && /\w/.test(lineText[start - 1])) start--;
  while (end < lineText.length && /\w/.test(lineText[end])) end++;
  const word = lineText.slice(start, end);
  return word || null;
}

// ============================================================================
// START
// ============================================================================

documents.listen(connection);
connection.listen();
