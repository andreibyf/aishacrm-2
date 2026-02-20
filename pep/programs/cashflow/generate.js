/* global process */
/**
 * Generate PEP Artifacts — Run compiler and write output to pep/programs/cashflow/
 * Usage: node pep/programs/cashflow/generate.js
 */

import { compile } from '../../compiler/index.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourcePath = join(__dirname, 'source.pep.md');
const source = readFileSync(sourcePath, 'utf8');

console.log('Compiling:', sourcePath);

const result = await compile(source, { useLegacyParser: true });

if (result.status !== 'compiled') {
  console.error('Compilation failed:', JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log('Compilation successful. Writing artifacts...');

writeFileSync(
  join(__dirname, 'semantic_frame.json'),
  JSON.stringify(result.semantic_frame, null, 2) + '\n',
);
writeFileSync(join(__dirname, 'braid_ir.json'), JSON.stringify(result.braid_ir, null, 2) + '\n');
writeFileSync(join(__dirname, 'plan.json'), JSON.stringify(result.plan, null, 2) + '\n');
writeFileSync(join(__dirname, 'audit.json'), JSON.stringify(result.audit, null, 2) + '\n');

console.log('Artifacts written:');
console.log('  - semantic_frame.json');
console.log('  - braid_ir.json');
console.log('  - plan.json');
console.log('  - audit.json');
