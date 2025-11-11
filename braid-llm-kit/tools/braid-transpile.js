#!/usr/bin/env node
/**
 * Braid Transpiler (MVP)
 * Converts Braid source code to JavaScript
 * 
 * Current support: String literals only
 * Future: Full expression/statement support
 */

import { parse } from './braid-parse.js';
import fs from 'fs';

/**
 * Transpile a Braid AST to JavaScript
 * @param {object} ast - Parsed Braid AST
 * @returns {string} - JavaScript code
 */
function transpileToJS(ast) {
  const lines = [];
  
  for (const item of ast.items) {
    if (item.type === 'FnDecl') {
      const jsFunc = transpileFunction(item);
      lines.push(jsFunc);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

/**
 * Transpile a Braid function to JavaScript
 */
function transpileFunction(func) {
  const params = func.params
    .map(p => p.name)
    .join(', ');
  
  // For MVP: Only handle string literals in body
  const body = transpileBlock(func.body);
  
  return `export function ${func.name}(${params}) {\n${body}\n}`;
}

/**
 * Transpile a conditional expression (if/else/else-if)
 * Handles nested blocks with proper indentation
 */
function transpileConditional(bodyText) {
  // Strategy: Convert Braid if/else to JavaScript if/else
  // Pattern: if condition { trueExpr } else { falseExpr }
  // Or: if cond1 { expr1 } else if cond2 { expr2 } else { expr3 }
  
  // Remove Windows line endings and normalize whitespace
  const normalized = bodyText.replace(/\r\n/g, '\n').trim();
  
  // Parse the condition and blocks
  // Simple approach: regex to extract condition and branches
  const result = parseIfExpression(normalized);
  
  if (!result) {
    console.warn('[Transpiler] Failed to parse conditional:', bodyText);
    return '  return "";';
  }
  
  return result;
}

/**
 * Recursively parse if/else-if/else chains
 */
function parseIfExpression(text, indent = '  ') {
  // Match: if condition { body } [else ...]
  const ifMatch = text.match(/^if\s+([^{]+)\s*\{([^}]*)\}\s*(.*)/s);
  
  if (!ifMatch) {
    return null;
  }
  
  const [, condition, thenBody, rest] = ifMatch;
  const cleanThen = thenBody.trim();
  
  // Extract the value from thenBody (handle string literals, identifiers, etc.)
  const thenValue = extractValue(cleanThen);
  
  // Transform builtins in condition (e.g., len(arr) -> arr.length)
  const transformedCond = transformBuiltins(condition.trim());
  let jsCode = `${indent}if (${transformedCond}) {\n${indent}  return ${thenValue};\n${indent}}`;
  
  // Check if there's an else clause
  const restTrimmed = rest.trim();
  if (restTrimmed.startsWith('else if')) {
    // Handle else-if chain
    const elseIfText = restTrimmed.substring(4).trim(); // Remove "else"
    const elseIfCode = parseIfExpression(elseIfText, indent);
    if (elseIfCode) {
      jsCode += ` else ${elseIfCode.trim()}`;
    }
  } else if (restTrimmed.startsWith('else')) {
    // Handle final else
    const elseMatch = restTrimmed.match(/^else\s*\{([^}]*)\}/);
    if (elseMatch) {
      const elseBody = elseMatch[1].trim();
      const elseValue = extractValue(elseBody);
      jsCode += ` else {\n${indent}  return ${elseValue};\n${indent}}`;
    }
  }
  
  return jsCode;
}

/**
 * Extract a value from a block body (handles strings, identifiers, numbers, expressions)
 */
function extractValue(text) {
  const trimmed = text.trim();
  const transformed = transformBuiltins(trimmed);
  
  // String literal
  if (transformed.startsWith('"') && transformed.endsWith('"')) {
    return transformed;
  }
  
  // Numeric literal
  if (/^-?\d+(\.\d+)?$/.test(transformed)) {
    return transformed;
  }
  
  // Expression (arithmetic, comparison, function calls, etc.)
  return transformed;
}

/**
 * Transform Braid builtins to JavaScript equivalents.
 * Currently supports:
 * - len(expr) -> (expr).length
 */
function transformBuiltins(text) {
  if (!text) return text;
  let out = text;
  // Replace len(x) with (x).length, preserving inner expression
  out = out.replace(/\blen\(([^)]+)\)/g, '($1).length');
  // List helpers: map(list, fn) -> (list).map(fn)
  out = out.replace(/\bmap\(([^,]+),\s*([^)]+)\)/g, '($1).map($2)');
  // filter(list, fn) -> (list).filter(fn)
  out = out.replace(/\bfilter\(([^,]+),\s*([^)]+)\)/g, '($1).filter($2)');
  // reduce(list, fn, init) -> (list).reduce(fn, init)
  out = out.replace(/\breduce\(([^,]+),\s*([^,]+),\s*([^)]+)\)/g, '($1).reduce($2, $3)');
  // find(list, fn) -> (list).find(fn)
  out = out.replace(/\bfind\(([^,]+),\s*([^)]+)\)/g, '($1).find($2)');
  // some(list, fn) -> (list).some(fn)
  out = out.replace(/\bsome\(([^,]+),\s*([^)]+)\)/g, '($1).some($2)');
  // every(list, fn) -> (list).every(fn)
  out = out.replace(/\bevery\(([^,]+),\s*([^)]+)\)/g, '($1).every($2)');
  // includes(list, val) -> (list).includes(val)
  out = out.replace(/\bincludes\(([^,]+),\s*([^)]+)\)/g, '($1).includes($2)');
  // join(list, sep) -> (list).join(sep)
  out = out.replace(/\bjoin\(([^,]+),\s*([^)]+)\)/g, '($1).join($2)');
  return out;
}

/**
 * Check if text contains a function call
 * Pattern: identifier followed by parentheses
 */
function hasFunctionCall(text) {
  // Look for pattern: word characters followed by (
  // This matches: double(x), format_greeting("World"), etc.
  return /[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(text);
}

/**
 * Transpile a block expression
 * Supports: string literals, identifiers, numeric literals, arithmetic, string concatenation, let bindings, conditionals, function calls
 */
function transpileBlock(block) {
  const bodyText = (block.raw || '').trim();
  const processed = transformBuiltins(bodyText);
  
  if (!processed) {
    return '  return "";';
  }
  
  // Check for conditional expressions FIRST (most complex pattern)
  // Handles: if/else, else if chains
  if (processed.startsWith('if ')) {
    return transpileConditional(processed);
  }
  
  // Check for array literals
  // Pattern: [1, 2, 3] or ["a", "b"] or [x, y, z] or []
  // JavaScript arrays have the same syntax as Braid
  if (processed.startsWith('[') && processed.endsWith(']')) {
    return `  return ${processed};`;
  }
  
  // Check for object literals
  // Pattern: { key: value, ... } or {}
  // JavaScript objects have the same syntax as Braid
  if (processed.startsWith('{') && processed.endsWith('}')) {
    // Empty object or object with key-value pairs
    return `  return ${processed};`;
  }

  // Early: multiple let bindings (ensure they transpile before indexing/property access shortcuts)
  if (processed.includes('let ') && processed.includes(';')) {
    const statements = processed.split(/;/).map(s => s.trim()).filter(s => s);
    if (statements.length > 1) {
      const lines = [];
      let hasLet = false;
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const letMatch = stmt.match(/^let\s+(\w+)\s*:\s*\w+\s*=\s*(.+)$/);
        if (letMatch) {
          const [, varName, value] = letMatch;
          lines.push(`  const ${varName} = ${transformBuiltins(value.trim())};`);
          hasLet = true;
        } else if (i === statements.length - 1) {
          lines.push(`  return ${stmt};`);
        }
      }
      if (hasLet) {
        return lines.join('\n');
      }
    }
  }
  
  // Check for function calls
  // Pattern: functionName(args) or expressions containing function calls
  // This is deliberately broad - if it has parentheses and looks like a call, pass it through
  // Examples: double(x), format_greeting("World"), double(n) + double(n)
  if (hasFunctionCall(processed)) {
    // Function calls in JavaScript have the same syntax as Braid, so pass through
    return `  return ${processed};`;
  }

  // Property access chains on identifiers: user.name, account.owner.id
  if (/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(processed)) {
    return `  return ${processed};`;
  }

  // Identifier indexing with property chain: items[0].name, arr[i].value
  if (/^\w+\s*\[[^\]]+\](\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(processed)) {
    return `  return ${processed};`;
  }

  // Array literal indexing then property: [ { name: "A" } ][0].name or [1,2,3][0].toString()
  if (/^\[.*\]\s*\[[^\]]+\](\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(processed)) {
    return `  return ${processed};`;
  }

  // Object literal with property access chain: { user: { name: "Alice" } }.user.name
  // (User might wrap with let binding, but allow direct literal property access.)
  if (/^\{.*\}(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(processed)) {
    return `  return (${processed});`; // wrap in parens for safety
  }

  // Support indexing directly on array literals e.g. [1,2,3][0]
  if (/^\[.*\]\s*\[[^\]]+\]$/.test(processed)) {
    return `  return ${processed};`;
  }

  // Check for list indexing (e.g., arr[0], items[i]) or property access like .length
  if (/\w+\s*\[[^\]]+\]/.test(processed) || processed.includes('.length')) {
    return `  return ${processed};`;
  }
  
  
  // Check if it's a string literal
  const stringMatch = processed.match(/^"([^"]*)"$/);
  if (stringMatch) {
    const stringValue = stringMatch[1];
    return `  return "${stringValue}";`;
  }
  
  // Check if it's a numeric literal
  const numericMatch = bodyText.match(/^-?\d+(\.\d+)?$/);
  if (numericMatch) {
    return `  return ${processed};`;
  }
  
  // Check if it's a simple identifier (variable/parameter reference)
  const identifierMatch = processed.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
  if (identifierMatch) {
    return `  return ${processed};`;
  }
  
  // Check for string concatenation (e.g., "Hello, " + name + "!")
  // This handles any expression with + that contains at least one string literal
  if (processed.includes('+') && processed.includes('"')) {
    // Simple approach: if it has + and quotes, treat as concatenation expression
    return `  return ${processed};`;
  }
  
  // Check if it's an arithmetic expression
  // Supports: a + b, x * y, x * 2, 5 + n, etc.
  // More general pattern: includes arithmetic operators
  // Allow word chars, whitespace, brackets for indexing, and dots for property access
  // eslint-disable-next-line no-useless-escape -- the character class intentionally includes brackets and dot
  const arithmeticMatch = processed.match(/^[\w\s\.\[\]]+\s*[+\-*/%]\s*[\w\s\.\[\]]+$/);
  if (arithmeticMatch) {
    return `  return ${processed};`;
  }
  
  // Check for single let binding with string literal: let varName: Type = "value"; returnExpr
  const letStringMatch = processed.match(/let\s+(\w+)\s*:\s*\w+\s*=\s*"([^"]*)"\s*;\s*(\w+)/);
  if (letStringMatch) {
    const [, varName, stringValue, returnExpr] = letStringMatch;
    return `  const ${varName} = "${stringValue}";\n  return ${returnExpr};`;
  }
  
  // Check for single let binding with numeric literal: let varName: Type = 123; returnExpr
  const letNumericMatch = processed.match(/let\s+(\w+)\s*:\s*\w+\s*=\s*(-?\d+(?:\.\d+)?)\s*;\s*(\w+)/);
  if (letNumericMatch) {
    const [, varName, numericValue, returnExpr] = letNumericMatch;
    return `  const ${varName} = ${numericValue};\n  return ${returnExpr};`;
  }
  
  // Fallback: return empty string
  console.warn(`[Transpiler] Unhandled block expression: ${processed}`);
  return '  return "";';
}

// CLI mode
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: braid-transpile [options]

Options:
  --file <path>    Path to .braid file to transpile
  --output <path>  Output path for .js file (default: stdout)
  --help           Show this help message

Example:
  braid-transpile --file hello.braid --output hello.js
`);
    process.exit(0);
  }
  
  const fileIdx = args.indexOf('--file');
  const outputIdx = args.indexOf('--output');
  
  if (fileIdx === -1) {
    console.error('Error: --file is required');
    process.exit(1);
  }
  
  const filePath = args[fileIdx + 1];
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;
  
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    const ast = parse(source, filePath);
    const jsCode = transpileToJS(ast);
    
    if (outputPath) {
      fs.writeFileSync(outputPath, jsCode, 'utf8');
      console.log(`✓ Transpiled ${filePath} → ${outputPath}`);
    } else {
      console.log(jsCode);
    }
  } catch (err) {
    console.error('Transpilation failed:', err.message);
    process.exit(1);
  }
}

export { transpileToJS };
