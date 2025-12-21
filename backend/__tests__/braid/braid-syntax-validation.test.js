/**
 * Braid Schema Validation Tests
 * 
 * These tests ensure all .braid files in the project can be parsed without errors.
 * This prevents syntax errors (like JavaScript optional chaining ?.) from reaching production.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

// Find all production .braid files (assistant tools and backend modules)
// Excludes experimental examples that use parser features not yet implemented
const PRODUCTION_BRAID_DIRS = [
  'braid-llm-kit/examples/assistant',  // Production AI tools
  'backend/modules',                    // Backend modules
];

// Files to exclude (use experimental features like @route decorators or complex control flow)
const EXCLUDE_FILES = [
  'health.braid',     // Uses @route decorator (not supported by parser)
  'lifecycle.braid',  // Uses complex match-with-assignment (experimental syntax)
];

function findBraidFiles(baseDir) {
  const files = [];
  
  for (const relDir of PRODUCTION_BRAID_DIRS) {
    const dir = path.join(baseDir, relDir);
    if (!fs.existsSync(dir)) continue;
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.braid') && !EXCLUDE_FILES.includes(entry.name)) {
          files.push(path.join(dir, entry.name));
        }
      }
    } catch {
      // Ignore permission errors
    }
  }
  
  return files;
}

// Import the braid parser
async function loadBraidParser() {
  const parserPath = path.join(ROOT_DIR, 'braid-llm-kit', 'tools', 'braid-parse.js');
  if (!fs.existsSync(parserPath)) {
    return null;
  }
  try {
    const parserModule = await import(`file://${parserPath.replace(/\\/g, '/')}`);
    return parserModule.parse || parserModule.default?.parse || null;
  } catch (err) {
    console.warn('[BraidValidation] Could not load parser:', err.message);
    return null;
  }
}

describe('Braid Schema Validation', () => {
  const braidFiles = findBraidFiles(ROOT_DIR);
  
  test('Braid files exist in project', () => {
    assert.ok(braidFiles.length > 0, `Expected to find .braid files in project, found ${braidFiles.length}`);
    console.log(`[BraidValidation] Found ${braidFiles.length} .braid files`);
  });

  test('All .braid files have valid syntax', async () => {
    const parse = await loadBraidParser();
    if (!parse) {
      console.log('[BraidValidation] Parser not available, skipping syntax validation');
      return;
    }

    const errors = [];
    
    for (const filePath of braidFiles) {
      const relativePath = path.relative(ROOT_DIR, filePath);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Parse the file - this will throw if there's a syntax error
        parse(content, relativePath);
        console.log(`  ✓ ${relativePath}`);
      } catch (err) {
        const errorMessage = `${relativePath}: ${err?.message || err}`;
        errors.push(errorMessage);
        console.error(`  ✗ ${relativePath}: ${err?.message || err}`);
      }
    }

    if (errors.length > 0) {
      assert.fail(`${errors.length} Braid file(s) have syntax errors:\n${errors.join('\n')}`);
    }
  });

  test('No unsupported JavaScript syntax in .braid files', async () => {
    // Check for common JavaScript-isms that Braid doesn't support
    const unsupportedPatterns = [
      { pattern: /\?\./g, name: 'optional chaining (?.)', fix: 'use direct property access' },
      { pattern: /\?\?/g, name: 'nullish coalescing (??)', fix: 'use logical OR or if statement' },
      { pattern: /`[^`]*\${/g, name: 'template literals', fix: 'use string concatenation' },
    ];

    const violations = [];

    for (const filePath of braidFiles) {
      const relativePath = path.relative(ROOT_DIR, filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const { pattern, name, fix } of unsupportedPatterns) {
        lines.forEach((line, idx) => {
          const matches = line.match(pattern);
          if (matches) {
            violations.push(`${relativePath}:${idx + 1} - Unsupported: ${name} (${fix})`);
          }
        });
      }
    }

    if (violations.length > 0) {
      assert.fail(`Found unsupported JavaScript syntax in Braid files:\n${violations.join('\n')}`);
    }
  });
});
