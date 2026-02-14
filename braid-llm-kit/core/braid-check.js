#!/usr/bin/env node
/* global process */
// braid-check — Braid static analyzer
// Uses the real parser + transpiler diagnostics pipeline.
// Checks: syntax, effects, policies, types, security properties.
"use strict";

import fs from 'fs';
import path from 'path';
import { parse } from './braid-parse.js';
import { transpileToJS, extractPolicies, detectUsedEffects, IO_EFFECT_MAP, VALID_POLICIES, BRAID_TYPE_MAP } from './braid-transpile.js';
import { typeCheck } from './braid-types.js';

// ============================================================================
// DIAGNOSTIC COLLECTOR
// ============================================================================

function check(src, filename = 'stdin') {
  const diags = [];

  const push = (code, severity, message, line = 0, col = 0) => {
    diags.push({ code, severity, message, file: filename, line, col });
  };

  // --- Phase 1: Parse ---
  let ast;
  try {
    ast = parse(src, filename, { recover: true });
    // Collect parser diagnostics (including security warnings)
    for (const d of (ast.diagnostics || [])) {
      diags.push({ ...d, file: filename });
    }
  } catch (e) {
    push('BRD001', 'error', `Parse error: ${e.message}`, e.line, e.col);
    return diags;
  }

  // --- Phase 2: Structural checks (AST-based) ---
  for (const item of (ast.items || [])) {
    if (item.type !== 'FnDecl') continue;
    const fn = item;
    const fnLine = fn.pos?.line || 0;

    // 2a. @policy annotation required
    const hasPolicy = (fn.annotations || []).some(a => a.name === 'policy');
    if (!hasPolicy) {
      push('BRD010', 'warning', `Function '${fn.name}' has no @policy annotation`, fnLine);
    } else {
      const policyName = (fn.annotations.find(a => a.name === 'policy'))?.args?.[0];
      if (policyName && !VALID_POLICIES.has(policyName)) {
        push('BRD011', 'error', `Function '${fn.name}': unknown policy '${policyName}'`, fnLine);
      }
    }

    // 2b. Effect consistency
    const declared = new Set(fn.effects || []);
    if (fn.body) {
      const used = detectUsedEffects(fn.body);
      for (const u of used) {
        if (!declared.has(u)) {
          const ioName = Object.keys(IO_EFFECT_MAP).find(k => IO_EFFECT_MAP[k] === u) || u;
          push('BRD020', 'error', `Function '${fn.name}': uses ${ioName}.* but does not declare !${u}`, fnLine);
        }
      }
      for (const d of declared) {
        if (!used.has(d)) {
          push('BRD021', 'warning', `Function '${fn.name}': declares !${d} but no usage detected (may be indirect)`, fnLine);
        }
      }
    }

    // 2c. tenant_id as first param for effectful functions
    if (declared.has('net') && fn.params.length > 0) {
      const firstParam = fn.params[0];
      if (firstParam.name !== 'tenant_id') {
        push('BRD030', 'warning', `Function '${fn.name}': first param should be 'tenant_id' for tenant isolation`, fnLine);
      }
    }

    // 2d. Return type should be Result for effectful functions
    if (declared.size > 0 && fn.ret?.base !== 'Result') {
      push('BRD031', 'warning', `Function '${fn.name}': effectful functions should return Result<T, E>`, fnLine);
    }

    // 2e. Match exhaustiveness hint — check for missing wildcard
    checkMatchExhaustiveness(fn.body, fn.name, push);

    // 2f. Null literal usage (Braid uses Option<T>)
    checkForNull(fn.body, fn.name, push);
  }

  // --- Phase 3: Type checking ---
  try {
    const { diagnostics: tcDiags } = typeCheck(ast);
    for (const d of tcDiags) {
      diags.push({ code: d.code, severity: d.severity, message: d.message, file: filename, line: d.line || 0, col: d.col || 0 });
    }
  } catch (e) {
    push('TC999', 'warning', `Type checker error: ${e.message}`);
  }

  // --- Phase 4: Transpiler validation (catches type/policy errors) ---
  try {
    transpileToJS(ast, { source: filename, pure: false, sandbox: false });
  } catch (e) {
    // Transpiler errors are already specific (TP001, TP002, TP003)
    for (const line of e.message.split('\n')) {
      const m = line.match(/^(\w+):\s*(.+)/);
      if (m) push(m[1], 'error', m[2]);
      else push('BRD099', 'error', line);
    }
  }

  return diags;
}

// ============================================================================
// AST WALKERS
// ============================================================================

function checkMatchExhaustiveness(node, fnName, push) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'MatchExpr') {
    const hasWildcard = (node.arms || []).some(a => a.pat === '_');
    if (!hasWildcard) {
      push('BRD040', 'warning', `Function '${fnName}': match expression should include a wildcard '_' case`, node.pos?.line);
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'pos') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object') checkMatchExhaustiveness(item, fnName, push);
      }
    } else if (child && typeof child === 'object' && child.type) {
      checkMatchExhaustiveness(child, fnName, push);
    }
  }
}

function checkForNull(node, fnName, push) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Ident' && node.name === 'null') {
    push('BRD002', 'error', `Function '${fnName}': 'null' is not allowed in Braid, use Option<T>`, node.pos?.line, node.pos?.col);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'pos') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object') checkForNull(item, fnName, push);
      }
    } else if (child && typeof child === 'object' && child.type) {
      checkForNull(child, fnName, push);
    }
  }
}

// ============================================================================
// FORMATTER
// ============================================================================

function formatDiag(d) {
  const sev = d.severity === 'error' ? '❌' : '⚠️ ';
  const loc = d.line ? `${d.file}:${d.line}${d.col ? ':' + d.col : ''}` : d.file;
  return `${sev} [${d.code}] ${loc}: ${d.message}`;
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const files = args.filter(a => !a.startsWith('--'));

if (files.length === 0) {
  // Read from stdin
  const src = fs.readFileSync(0, 'utf8');
  const diags = check(src, 'stdin');
  output(diags);
} else {
  let allDiags = [];
  for (const file of files) {
    if (fs.statSync(file).isDirectory()) {
      // Recursively find .braid files
      const braidFiles = findBraidFiles(file);
      for (const bf of braidFiles) {
        const src = fs.readFileSync(bf, 'utf8');
        allDiags.push(...check(src, bf));
      }
    } else {
      const src = fs.readFileSync(file, 'utf8');
      allDiags.push(...check(src, file));
    }
  }
  output(allDiags);
}

function findBraidFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findBraidFiles(full));
    else if (entry.name.endsWith('.braid')) results.push(full);
  }
  return results;
}

function output(diags) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(diags, null, 2) + '\n');
  } else {
    const errors = diags.filter(d => d.severity === 'error');
    const warnings = diags.filter(d => d.severity === 'warning');
    for (const d of diags) console.log(formatDiag(d));
    if (diags.length > 0) {
      console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
    } else {
      console.log('✅ No issues found');
    }
  }
  process.exit(diags.some(d => d.severity === 'error') ? 1 : 0);
}

export { check };
