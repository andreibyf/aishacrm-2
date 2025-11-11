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
 * Transpile a block expression
 * Supports: string literals, identifiers, numeric literals, arithmetic, string concatenation, let bindings
 */
function transpileBlock(block) {
  const bodyText = (block.raw || '').trim();
  
  if (!bodyText) {
    return '  return "";';
  }
  
  // Check for multiple let bindings FIRST (before checking for string concat)
  // More robust: look for any number of let statements followed by a final expression
  if (bodyText.includes('let ') && bodyText.includes(';')) {
    // Split by semicolons to find individual statements
    const statements = bodyText.split(/;/).map(s => s.trim()).filter(s => s);
    
    if (statements.length > 1) {
      const lines = [];
      let hasLet = false;
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        
        // Check if this is a let binding
        const letMatch = stmt.match(/^let\s+(\w+)\s*:\s*\w+\s*=\s*(.+)$/);
        if (letMatch) {
          const [, varName, value] = letMatch;
          lines.push(`  const ${varName} = ${value.trim()};`);
          hasLet = true;
        } else if (i === statements.length - 1) {
          // Last statement is the return expression
          lines.push(`  return ${stmt};`);
        }
      }
      
      if (hasLet) {
        return lines.join('\n');
      }
    }
  }
  
  // Check if it's a string literal
  const stringMatch = bodyText.match(/^"([^"]*)"$/);
  if (stringMatch) {
    const stringValue = stringMatch[1];
    return `  return "${stringValue}";`;
  }
  
  // Check if it's a numeric literal
  const numericMatch = bodyText.match(/^-?\d+(\.\d+)?$/);
  if (numericMatch) {
    return `  return ${bodyText};`;
  }
  
  // Check if it's a simple identifier (variable/parameter reference)
  const identifierMatch = bodyText.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
  if (identifierMatch) {
    return `  return ${bodyText};`;
  }
  
  // Check for string concatenation (e.g., "Hello, " + name + "!")
  // This handles any expression with + that contains at least one string literal
  if (bodyText.includes('+') && bodyText.includes('"')) {
    // Simple approach: if it has + and quotes, treat as concatenation expression
    return `  return ${bodyText};`;
  }
  
  // Check if it's a simple arithmetic expression (identifiers with operators)
  // Supports: a + b, x * y, x - y, x / y, etc.
  const arithmeticMatch = bodyText.match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*[+\-*/%]\s*[a-zA-Z_][a-zA-Z0-9_]*$/);
  if (arithmeticMatch) {
    return `  return ${bodyText};`;
  }
  
  // Check for single let binding with string literal: let varName: Type = "value"; returnExpr
  const letStringMatch = bodyText.match(/let\s+(\w+)\s*:\s*\w+\s*=\s*"([^"]*)"\s*;\s*(\w+)/);
  if (letStringMatch) {
    const [, varName, stringValue, returnExpr] = letStringMatch;
    return `  const ${varName} = "${stringValue}";\n  return ${returnExpr};`;
  }
  
  // Check for single let binding with numeric literal: let varName: Type = 123; returnExpr
  const letNumericMatch = bodyText.match(/let\s+(\w+)\s*:\s*\w+\s*=\s*(-?\d+(?:\.\d+)?)\s*;\s*(\w+)/);
  if (letNumericMatch) {
    const [, varName, numericValue, returnExpr] = letNumericMatch;
    return `  const ${varName} = ${numericValue};\n  return ${returnExpr};`;
  }
  
  // Fallback: return empty string
  console.warn(`[Transpiler] Unhandled block expression: ${bodyText}`);
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
