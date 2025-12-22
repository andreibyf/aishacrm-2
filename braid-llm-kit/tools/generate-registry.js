#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * Braid Registry Generator
 * 
 * Scans .braid files and automatically generates:
 * 1. TOOL_REGISTRY entries
 * 2. BRAID_PARAM_ORDER entries  
 * 3. TOOL_DESCRIPTIONS entries
 * 
 * Usage:
 *   node generate-registry.js [--dir ./examples/assistant] [--output ./generated-registry.js]
 *   node generate-registry.js --help
 */

import fs from 'fs';
import path from 'path';
import { parse } from './braid-parse.js';

// Default directories
const DEFAULT_TOOLS_DIR = path.join(process.cwd(), 'examples', 'assistant');
const DEFAULT_OUTPUT = path.join(process.cwd(), 'generated', 'registry.js');

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * Infer tool description from function name
 */
function inferDescription(fnName, params) {
  const action = fnName.match(/^(create|update|delete|list|search|get|fetch|mark|qualify|convert|advance|schedule|approve|reject|apply|trigger)/)?.[1];
  const entity = fnName.replace(/^(create|update|delete|list|search|get|fetch|mark|qualify|convert|advance|schedule|approve|reject|apply|trigger)/, '');
  
  const entityReadable = entity
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase();
  
  const descriptions = {
    create: `Create a new ${entityReadable} record`,
    update: `Update an existing ${entityReadable} record`,
    delete: `Delete a ${entityReadable} record`,
    list: `List ${entityReadable} records`,
    search: `Search for ${entityReadable} records`,
    get: `Get details of a specific ${entityReadable}`,
    fetch: `Fetch ${entityReadable} data`,
    mark: `Mark ${entityReadable} with a status`,
    qualify: `Qualify ${entityReadable} for next stage`,
    convert: `Convert ${entityReadable} to another entity type`,
    advance: `Advance ${entityReadable} to the next stage`,
    schedule: `Schedule a new ${entityReadable}`,
    approve: `Approve a pending ${entityReadable}`,
    reject: `Reject a ${entityReadable}`,
    apply: `Apply a ${entityReadable} action`,
    trigger: `Trigger ${entityReadable} process`
  };
  
  return descriptions[action] || `${fnName} operation`;
}

/**
 * Infer policy from function effects and name
 */
function inferPolicy(fnName, effects) {
  // Write operations
  const writePatterns = ['create', 'update', 'delete', 'mark', 'convert', 'qualify', 'advance', 'schedule', 'approve', 'reject', 'apply', 'trigger'];
  const isWrite = writePatterns.some(p => fnName.toLowerCase().startsWith(p));
  
  return isWrite ? 'WRITE_OPERATIONS' : 'READ_ONLY';
}

/**
 * Parse a Braid file and extract function definitions
 */
function parseBraidFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);
  
  const functions = [];
  
  try {
    const ast = parse(source, filename);
    
    for (const item of ast.items) {
      if (item.type === 'FnDecl') {
        functions.push({
          name: item.name,
          snakeName: toSnakeCase(item.name),
          params: item.params.map(p => p.name),
          effects: item.effects || [],
          returnType: item.ret?.text || 'unknown',
          file: filename
        });
      }
    }
  } catch (e) {
    console.warn(`⚠️  Warning: Could not parse ${filename}: ${e.message}`);
    
    // Fallback: regex-based extraction
    const fnRegex = /fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*([^!{\n]+)(![^\s{]+)?/g;
    let match;
    while ((match = fnRegex.exec(source)) !== null) {
      const params = match[2]
        .split(',')
        .map(p => p.trim().split(':')[0].trim())
        .filter(p => p);
      
      const effects = (match[4] || '')
        .replace('!', '')
        .split(',')
        .map(e => e.trim())
        .filter(e => e);
      
      functions.push({
        name: match[1],
        snakeName: toSnakeCase(match[1]),
        params,
        effects,
        returnType: match[3].trim(),
        file: filename
      });
    }
  }
  
  return functions;
}

/**
 * Scan directory for .braid files
 */
function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  const braidFiles = files.filter(f => f.endsWith('.braid'));
  
  const allFunctions = [];
  
  for (const file of braidFiles) {
    const filePath = path.join(dir, file);
    const functions = parseBraidFile(filePath);
    allFunctions.push(...functions);
  }
  
  return allFunctions;
}

/**
 * Generate registry code
 */
function generateRegistry(functions, options = {}) {
  const lines = [];
  
  lines.push(`/**`);
  lines.push(` * AUTO-GENERATED Braid Tool Registry`);
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(` * Source: ${options.sourceDir || 'braid-llm-kit/examples/assistant'}`);
  lines.push(` * `);
  lines.push(` * DO NOT EDIT MANUALLY - Re-run generate-registry.js to update`);
  lines.push(` */`);
  lines.push('');
  
  // Group by file
  const byFile = {};
  for (const fn of functions) {
    if (!byFile[fn.file]) byFile[fn.file] = [];
    byFile[fn.file].push(fn);
  }
  
  // TOOL_REGISTRY
  lines.push('export const TOOL_REGISTRY = {');
  for (const [file, funcs] of Object.entries(byFile).sort()) {
    lines.push(`  // ${file}`);
    for (const fn of funcs) {
      const policy = inferPolicy(fn.name, fn.effects);
      lines.push(`  ${fn.snakeName}: { file: '${fn.file}', function: '${fn.name}', policy: '${policy}' },`);
    }
    lines.push('');
  }
  lines.push('};');
  lines.push('');
  
  // BRAID_PARAM_ORDER
  lines.push('export const BRAID_PARAM_ORDER = {');
  for (const fn of functions) {
    if (fn.params.length > 0) {
      lines.push(`  ${fn.snakeName}: ['${fn.params.join("', '")}'],`);
    }
  }
  lines.push('};');
  lines.push('');
  
  // TOOL_DESCRIPTIONS
  lines.push('export const TOOL_DESCRIPTIONS = {');
  for (const fn of functions) {
    const desc = inferDescription(fn.name, fn.params);
    lines.push(`  ${fn.snakeName}: '${desc}',`);
  }
  lines.push('};');
  lines.push('');
  
  // Summary stats
  lines.push('// Summary');
  lines.push(`// Total tools: ${functions.length}`);
  lines.push(`// Files scanned: ${Object.keys(byFile).length}`);
  lines.push(`// Read-only tools: ${functions.filter(f => inferPolicy(f.name, f.effects) === 'READ_ONLY').length}`);
  lines.push(`// Write tools: ${functions.filter(f => inferPolicy(f.name, f.effects) === 'WRITE_OPERATIONS').length}`);
  
  return lines.join('\n');
}

/**
 * Generate a TypeScript declarations file
 */
function generateTypeDeclarations(functions) {
  const lines = [];
  
  lines.push(`/**`);
  lines.push(` * Braid Tool Type Declarations`);
  lines.push(` * AUTO-GENERATED - Do not edit`);
  lines.push(` */`);
  lines.push('');
  
  lines.push('export type BraidToolName =');
  for (const fn of functions) {
    lines.push(`  | '${fn.snakeName}'`);
  }
  lines.push(';');
  lines.push('');
  
  lines.push('export interface BraidToolInfo {');
  lines.push('  file: string;');
  lines.push('  function: string;');
  lines.push("  policy: 'READ_ONLY' | 'WRITE_OPERATIONS';");
  lines.push('}');
  lines.push('');
  
  lines.push('export type BraidToolRegistry = Record<BraidToolName, BraidToolInfo>;');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Braid Registry Generator

Scans .braid files and generates TOOL_REGISTRY, BRAID_PARAM_ORDER, and TOOL_DESCRIPTIONS.

Usage:
  node generate-registry.js [options]

Options:
  --dir <path>      Directory containing .braid files (default: ./examples/assistant)
  --output <path>   Output file path (default: ./generated/registry.js)
  --types           Also generate TypeScript declarations
  --dry-run         Print output without writing files
  --help, -h        Show this help message

Examples:
  node generate-registry.js
  node generate-registry.js --dir ../my-tools --output ./my-registry.js
  node generate-registry.js --dry-run
`);
    process.exit(0);
  }
  
  // Parse arguments
  let toolsDir = DEFAULT_TOOLS_DIR;
  let outputPath = DEFAULT_OUTPUT;
  let dryRun = args.includes('--dry-run');
  let generateTypes = args.includes('--types');
  
  const dirIdx = args.indexOf('--dir');
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    toolsDir = path.resolve(args[dirIdx + 1]);
  }
  
  const outIdx = args.indexOf('--output');
  if (outIdx !== -1 && args[outIdx + 1]) {
    outputPath = path.resolve(args[outIdx + 1]);
  }
  
  // Validate directory
  if (!fs.existsSync(toolsDir)) {
    console.error(`❌ Error: Directory not found: ${toolsDir}`);
    process.exit(1);
  }
  
  console.log(`📁 Scanning: ${toolsDir}`);
  
  // Scan and parse
  const functions = scanDirectory(toolsDir);
  
  if (functions.length === 0) {
    console.warn('⚠️  No functions found in .braid files');
    process.exit(0);
  }
  
  console.log(`✅ Found ${functions.length} functions`);
  
  // Generate registry
  const registryCode = generateRegistry(functions, { sourceDir: toolsDir });
  
  if (dryRun) {
    console.log('\n--- Generated Registry (dry run) ---\n');
    console.log(registryCode);
  } else {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, registryCode);
    console.log(`📝 Written to: ${outputPath}`);
    
    // Generate types if requested
    if (generateTypes) {
      const typesPath = outputPath.replace('.js', '.d.ts');
      const typesCode = generateTypeDeclarations(functions);
      fs.writeFileSync(typesPath, typesCode);
      console.log(`📝 Types written to: ${typesPath}`);
    }
  }
  
  // Print summary
  console.log('\n📊 Summary:');
  const byFile = {};
  for (const fn of functions) {
    if (!byFile[fn.file]) byFile[fn.file] = [];
    byFile[fn.file].push(fn);
  }
  for (const [file, funcs] of Object.entries(byFile).sort()) {
    console.log(`   ${file}: ${funcs.length} functions`);
  }
}

// Run if executed directly
if (process.argv[1]?.endsWith('generate-registry.js')) {
  main();
}

export { parseBraidFile, scanDirectory, generateRegistry, generateTypeDeclarations };
