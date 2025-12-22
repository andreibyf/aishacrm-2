/* eslint-disable no-undef */
// Enhanced Braid Validator - Better error messages with context
// Provides human-friendly diagnostics for common issues

import fs from 'fs';
import path from 'path';
import { parse } from './braid-parse.js';

/**
 * Error codes and their human-friendly explanations
 */
const ERROR_EXPLANATIONS = {
  // Syntax errors
  BRAID001: {
    title: 'No function declarations found',
    help: 'Every Braid file should define at least one function using the `fn` keyword.',
    example: `fn myFunction(param: String) -> Result<String, CRMError> !net {
  // your code here
}`
  },
  BRAID002: {
    title: 'Null not allowed',
    help: 'Braid uses Option<T> instead of null for optional values.',
    example: `// Instead of: let x = null;
// Use: let x: Option<String> = None;

// Or in function signatures:
fn findUser(id: String) -> Option<User> { ... }`
  },
  BRAID003: {
    title: 'Unhandled effect',
    help: 'Functions that use capabilities (network, time, file system) must declare their effects.',
    example: `// Add the effect declaration after the return type:
fn fetchData(url: String) -> Result<Data, Error> !net {
  // http.get requires !net effect
  return http.get(url);
}`
  },
  BRAID004: {
    title: 'Missing return type',
    help: 'All functions must declare their return type using -> Type syntax.',
    example: `fn myFunction(x: Number) -> Number {
  return x * 2;
}`
  },
  BRAID005: {
    title: 'Invalid match pattern',
    help: 'Match patterns should handle Ok, Err, and wildcard _ case.',
    example: `match response {
  Ok{value} => handleSuccess(value),
  Err{error} => handleError(error),
  _ => handleUnknown()
}`
  },
  BRAID006: {
    title: 'Missing tenant_id parameter',
    help: 'CRM tools should include tenant_id as the first parameter for tenant isolation.',
    example: `fn createLead(tenant_id: String, name: String, email: String) -> Result<Lead, CRMError> !net {
  // tenant_id is automatically enforced by policy
}`
  },
  BRAID007: {
    title: 'Import not found',
    help: 'Check that the import path is correct and the file exists.',
    example: `import { Result, Lead, CRMError } from "../../spec/types.braid"`
  },
  BRAID008: {
    title: 'Type mismatch',
    help: 'The value type does not match the expected type.',
    example: `// Ensure types match:
let count: Number = 42;     // ✓
let count: Number = "42";   // ✗ - string not number`
  },
  BRAID009: {
    title: 'Missing semicolon',
    help: 'Statements must end with a semicolon.',
    example: `let x: Number = 42;  // Note the semicolon`
  },
  BRAID010: {
    title: 'Expected identifier',
    help: 'An identifier (variable/function name) was expected here.',
    example: `// Valid identifiers start with a letter or underscore:
fn myFunction(param_1: String) -> String { ... }`
  },
  BRAID011: {
    title: 'Unclosed bracket',
    help: 'Make sure all brackets { }, ( ), [ ] are properly closed.',
    example: null
  },
  BRAID012: {
    title: 'Unknown keyword',
    help: 'This word is not a recognized Braid keyword.',
    example: `// Valid keywords: fn, type, enum, match, let, return, if, else, true, false`
  }
};

/**
 * Get source context around an error location
 */
function getSourceContext(source, line, col, contextLines = 2) {
  const lines = source.split('\n');
  const startLine = Math.max(0, line - 1 - contextLines);
  const endLine = Math.min(lines.length - 1, line - 1 + contextLines);
  
  const contextArr = [];
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = i + 1;
    const prefix = lineNum === line ? '> ' : '  ';
    contextArr.push(`${prefix}${String(lineNum).padStart(4)} | ${lines[i]}`);
    
    // Add pointer to error column
    if (lineNum === line && col > 0) {
      const pointer = ' '.repeat(col + 7) + '^';
      contextArr.push(pointer);
    }
  }
  
  return contextArr.join('\n');
}

/**
 * Format a diagnostic for human-readable output
 */
function formatDiagnostic(diag, source) {
  const lines = [];
  const errorInfo = ERROR_EXPLANATIONS[diag.code] || {};
  
  // Header
  const severity = diag.severity === 'error' ? '❌ ERROR' : '⚠️  WARNING';
  lines.push(`${severity} [${diag.code}]: ${errorInfo.title || diag.message}`);
  lines.push(`  → ${diag.span.file}:${diag.span.start.line || diag.span.start}:${diag.span.start.col || 0}`);
  
  // Message
  lines.push('');
  lines.push(`  ${diag.message}`);
  
  // Source context
  if (source && diag.span.start.line) {
    lines.push('');
    lines.push(getSourceContext(source, diag.span.start.line, diag.span.start.col || 0));
  }
  
  // Help text
  if (errorInfo.help) {
    lines.push('');
    lines.push(`  💡 ${errorInfo.help}`);
  }
  
  // Example
  if (errorInfo.example) {
    lines.push('');
    lines.push('  Example:');
    errorInfo.example.split('\n').forEach(l => lines.push(`    ${l}`));
  }
  
  // Suggested fixes
  if (diag.fixes && diag.fixes.length > 0) {
    lines.push('');
    lines.push('  🔧 Suggested fixes:');
    diag.fixes.forEach((fix, i) => {
      lines.push(`    ${i + 1}. ${fix.label}`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Enhanced validate function with better error messages
 */
export function validate(src, filename = "input.braid") {
  const diags = [];
  
  const push = (code, severity, message, startLine, startCol, endLine, endCol, fixes = []) => {
    diags.push({
      code,
      severity,
      message,
      span: {
        file: filename,
        start: { line: startLine, col: startCol },
        end: { line: endLine || startLine, col: endCol || startCol }
      },
      fixes
    });
  };

  // Track line numbers for better error reporting
  const lines = src.split('\n');
  const findLine = (idx) => {
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      charCount += lines[i].length + 1;
      if (charCount > idx) return { line: i + 1, col: idx - (charCount - lines[i].length - 1) };
    }
    return { line: 1, col: 0 };
  };

  // Check for function declarations
  if (!/\bfn\s+\w+\s*\(/.test(src)) {
    push("BRAID001", "error", "No function declarations found. Define at least one function using the 'fn' keyword.", 1, 1, 1, 1);
  }

  // Check for null usage
  const nullRegex = /\bnull\b/g;
  let nullMatch;
  while ((nullMatch = nullRegex.exec(src)) !== null) {
    const loc = findLine(nullMatch.index);
    push("BRAID002", "error", "'null' is not allowed in Braid. Use Option<T> with Some(value) or None instead.", 
         loc.line, loc.col, loc.line, loc.col + 4);
  }

  // Check for unhandled effects
  const fnRegex = /fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*([^!{\n]+)(![^\s{]+)?/g;
  let fnMatch;
  while ((fnMatch = fnRegex.exec(src)) !== null) {
    const fnName = fnMatch[1];
    const fnLoc = findLine(fnMatch.index);
    const effects = fnMatch[4] || '';
    
    // Find function body
    const bodyStart = src.indexOf('{', fnMatch.index + fnMatch[0].length);
    const bodyEnd = findMatchingBrace(src, bodyStart);
    const body = bodyStart >= 0 && bodyEnd > bodyStart ? src.slice(bodyStart, bodyEnd + 1) : '';
    
    // Check for network usage without !net
    if (/\bhttp\.(get|post|put|delete|patch)\b/.test(body) && !effects.includes('net')) {
      push("BRAID003", "error", 
           `Function '${fnName}' uses http operations but doesn't declare '!net' effect. Add !net after the return type.`,
           fnLoc.line, 0, fnLoc.line, fnMatch[0].length,
           [{ label: "Add !net effect", edit: { insert: " !net", at: fnMatch.index + fnMatch[0].length } }]);
    }
    
    // Check for clock usage without !clock
    if (/\bclock\.(now|today)\b/.test(body) && !effects.includes('clock')) {
      push("BRAID003", "error", 
           `Function '${fnName}' uses clock operations but doesn't declare '!clock' effect. Add !clock after the return type.`,
           fnLoc.line, 0, fnLoc.line, fnMatch[0].length,
           [{ label: "Add !clock effect", edit: { insert: " !clock", at: fnMatch.index + fnMatch[0].length } }]);
    }
    
    // Check for fs usage without !fs
    if (/\bfs\./.test(body) && !effects.includes('fs')) {
      push("BRAID003", "error", 
           `Function '${fnName}' uses file system operations but doesn't declare '!fs' effect. Add !fs after the return type.`,
           fnLoc.line, 0, fnLoc.line, fnMatch[0].length,
           [{ label: "Add !fs effect", edit: { insert: " !fs", at: fnMatch.index + fnMatch[0].length } }]);
    }
  }

  // Check for missing tenant_id in CRM tool patterns
  const crmToolPattern = /fn\s+(create|update|delete|list|search|get)\w+\s*\(([^)]*)\)/g;
  let crmMatch;
  while ((crmMatch = crmToolPattern.exec(src)) !== null) {
    const params = crmMatch[2];
    if (params.length > 0 && !params.includes('tenant_id')) {
      const loc = findLine(crmMatch.index);
      push("BRAID006", "warning", 
           `CRM function '${crmMatch[0].match(/fn\s+(\w+)/)[1]}' should include 'tenant_id: String' as the first parameter for tenant isolation.`,
           loc.line, 0, loc.line, crmMatch[0].length);
    }
  }

  // Check for match expressions without wildcard
  const matchRegex = /match\s+\w+\s*\{([^}]+)\}/g;
  let matchMatch;
  while ((matchMatch = matchRegex.exec(src)) !== null) {
    const matchBody = matchMatch[1];
    if (!matchBody.includes('_') && !matchBody.includes('_ =>')) {
      const loc = findLine(matchMatch.index);
      push("BRAID005", "warning", 
           "Match expression should include a wildcard '_' case to handle unexpected values.",
           loc.line, 0, loc.line, 5,
           [{ label: "Add wildcard case", edit: { insert: ",\n  _ => Err(NetworkError{ url: url, code: 500 })", at: matchMatch.index + matchMatch[0].length - 1 } }]);
    }
  }

  // Try parsing for syntax errors
  try {
    parse(src, filename);
  } catch (e) {
    const line = e.line || 1;
    const col = e.col || 1;
    let code = 'BRAID010';
    let message = e.message;
    
    // Categorize parser errors
    if (message.includes('expected')) {
      if (message.includes('ident')) {
        code = 'BRAID010';
        message = `Expected an identifier (variable or function name). ${message}`;
      } else if (message.includes('}') || message.includes('{')) {
        code = 'BRAID011';
        message = `Unclosed or mismatched bracket. ${message}`;
      } else if (message.includes(';')) {
        code = 'BRAID009';
        message = `Missing semicolon at end of statement. ${message}`;
      }
    } else if (message.includes('unexpected')) {
      code = 'BRAID012';
    } else if (message.includes('unterminated string')) {
      code = 'BRAID011';
      message = 'String literal is not closed. Add a closing quote.';
    }
    
    push(code, "error", message, line, col, line, col + 1);
  }

  return diags;
}

/**
 * Find matching closing brace
 */
function findMatchingBrace(src, start) {
  if (src[start] !== '{') return -1;
  let depth = 1;
  let i = start + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') depth--;
    i++;
  }
  return depth === 0 ? i - 1 : -1;
}

/**
 * Validate a file and print human-friendly output
 */
export function validateFile(filePath, options = { format: 'pretty' }) {
  const src = fs.readFileSync(filePath, 'utf8');
  const diags = validate(src, path.basename(filePath));
  
  if (options.format === 'json') {
    return diags;
  }
  
  // Pretty format
  if (diags.length === 0) {
    console.log(`✅ ${filePath}: No issues found`);
    return [];
  }
  
  const errors = diags.filter(d => d.severity === 'error');
  const warnings = diags.filter(d => d.severity === 'warning');
  
  console.log(`\n📁 ${filePath}`);
  console.log(`   Found ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  
  diags.forEach(diag => {
    console.log(formatDiagnostic(diag, src));
    console.log('');
  });
  
  return diags;
}

// CLI usage
if (process.argv[1] && process.argv[1].endsWith('validate-enhanced.js')) {
  const files = process.argv.slice(2).filter(f => !f.startsWith('--'));
  const format = process.argv.includes('--json') ? 'json' : 'pretty';
  
  if (files.length === 0) {
    console.log('Usage: node validate-enhanced.js [--json] <file.braid> [file2.braid ...]');
    process.exit(1);
  }
  
  let allDiags = [];
  for (const file of files) {
    const diags = validateFile(file, { format });
    allDiags.push(...diags);
  }
  
  if (format === 'json') {
    console.log(JSON.stringify(allDiags, null, 2));
  }
  
  const hasErrors = allDiags.some(d => d.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}
