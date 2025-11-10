#!/usr/bin/env node
/* eslint-env node */
import fs from 'fs';
import path from 'path';
import url from 'url';
import peggy from 'peggy';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const grammarPath = path.join(__dirname, '../spec/grammar.pegjs');
const grammarSource = fs.readFileSync(grammarPath, 'utf8');

// Compile grammar once at module load
const parser = peggy.generate(grammarSource, {
  grammarSource: 'grammar.pegjs'
});

/**
 * Parse Braid source code into an AST
 * @param {string} source - Braid source code
 * @param {string} filename - Optional filename for error messages
 * @returns {object} AST with { type: 'Program', items: [...] }
 * @throws {Error} Parse error with location info
 */
export function parse(source, filename = 'input.braid') {
  try {
    return parser.parse(source);
  } catch (err) {
    if (err.location) {
      const { start } = err.location;
      throw new Error(`Parse error in ${filename} at line ${start.line}, column ${start.column}: ${err.message}`);
    }
    throw err;
  }
}

// CLI mode: parse file and output JSON AST
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: braid-parse <file.braid>');
    process.exit(2);
  }
  const source = fs.readFileSync(file, 'utf8');
  const ast = parse(source, file);
  console.log(JSON.stringify(ast, null, 2));
}
