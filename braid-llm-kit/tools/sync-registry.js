#!/usr/bin/env node

/**
 * Braid Registry Sync
 *
 * Generates tool registry from .braid files and updates backend/lib/braid/registry.js
 * Run this after modifying .braid files to keep the registry in sync.
 *
 * Usage:
 *   node sync-registry.js           # Update braidIntegration-v2.js
 *   node sync-registry.js --check   # Check for drift (CI mode)
 *   node sync-registry.js --dry-run # Show what would change
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanDirectory, inferPolicy } from './generate-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.join(__dirname, '..', 'examples', 'assistant');
const INTEGRATION_FILE = path.join(
  __dirname,
  '..',
  '..',
  'backend',
  'lib',
  'braid',
  'registry.js',
);

/**
 * Extract current TOOL_REGISTRY from braidIntegration-v2.js
 */
function extractCurrentRegistry(source) {
  const match = source.match(/export const TOOL_REGISTRY = \{([\s\S]*?)\n\};/);
  if (!match) return null;
  return match[0];
}

/**
 * Extract current BRAID_PARAM_ORDER from braidIntegration-v2.js
 */
function extractCurrentParamOrder(source) {
  const match = source.match(/const BRAID_PARAM_ORDER = \{([\s\S]*?)\n\};/);
  if (!match) return null;
  return match[0];
}

/**
 * Generate TOOL_REGISTRY block
 */
function generateToolRegistryBlock(functions) {
  const lines = ['export const TOOL_REGISTRY = {'];

  // Group by file
  const byFile = {};
  for (const fn of functions) {
    if (!byFile[fn.file]) byFile[fn.file] = [];
    byFile[fn.file].push(fn);
  }

  for (const [file, funcs] of Object.entries(byFile).sort()) {
    lines.push(
      `  // ${
        file.replace('.braid', '').charAt(0).toUpperCase() +
        file
          .replace('.braid', '')
          .slice(1)
          .replace(/-./g, (m) => ' ' + m[1].toUpperCase())
      }`,
    );
    for (const fn of funcs) {
      // Use the shared inferPolicy from generate-registry.js, which reads
      // the explicit @policy(...) annotation as the source of truth and
      // only falls back to a name-prefix heuristic for legacy files.
      // Without this, a duplicated heuristic-only inline copy here
      // would silently misclassify any verb not in the allowlist
      // (e.g., sendDocumentForSigning → READ_ONLY).
      const policy = inferPolicy(fn.name, fn.effects, fn.annotations);

      lines.push(
        `  ${fn.snakeName}: { file: '${fn.file}', function: '${fn.name}', policy: '${policy}' },`,
      );
    }
    lines.push('');
  }

  lines.push('};');
  return lines.join('\n');
}

/**
 * Generate BRAID_PARAM_ORDER block
 */
function generateParamOrderBlock(functions) {
  const lines = ['const BRAID_PARAM_ORDER = {'];

  // Group by file for comments
  const byFile = {};
  for (const fn of functions) {
    if (!byFile[fn.file]) byFile[fn.file] = [];
    byFile[fn.file].push(fn);
  }

  for (const [file, funcs] of Object.entries(byFile).sort()) {
    lines.push(`  // ${file}`);
    for (const fn of funcs) {
      if (fn.params.length > 0) {
        lines.push(`  ${fn.name}: ['${fn.params.join("', '")}'],`);
      }
    }
    lines.push('');
  }

  lines.push('};');
  return lines.join('\n');
}

/**
 * Compare registries and report differences.
 *
 * Detects:
 *   - added: tools in generated but not in current
 *   - removed: tools in current but not in generated
 *   - changed: tools whose entry text (e.g., policy) differs between current
 *              and generated. Without this, a policy correction (READ_ONLY
 *              → WRITE_OPERATIONS) on an existing tool is silently treated
 *              as "in sync" because tool-name set membership is unchanged.
 */
function compareRegistries(current, generated) {
  const extractEntries = (block) => {
    const map = new Map();
    // Match "tool_name: { ... }," — non-greedy across the closing brace.
    const re = /(\w+):\s*\{[^}]*\}/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      map.set(m[1], m[0]);
    }
    return map;
  };

  const currentEntries = extractEntries(current);
  const generatedEntries = extractEntries(generated);

  const currentNames = new Set(currentEntries.keys());
  const generatedNames = new Set(generatedEntries.keys());

  const added = [...generatedNames].filter((t) => !currentNames.has(t));
  const removed = [...currentNames].filter((t) => !generatedNames.has(t));

  // Policy/value drift on existing tools
  const changed = [];
  for (const [name, generatedEntry] of generatedEntries) {
    const currentEntry = currentEntries.get(name);
    if (currentEntry && currentEntry !== generatedEntry) {
      changed.push({ name, before: currentEntry, after: generatedEntry });
    }
  }

  return { added, removed, changed };
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const dryRun = args.includes('--dry-run');

  console.log('📁 Scanning .braid files...');
  const functions = scanDirectory(TOOLS_DIR);
  console.log(
    `✅ Found ${functions.length} functions in ${new Set(functions.map((f) => f.file)).size} files`,
  );

  // Read current integration file
  const currentSource = fs.readFileSync(INTEGRATION_FILE, 'utf8');
  const currentRegistry = extractCurrentRegistry(currentSource);
  const currentParamOrder = extractCurrentParamOrder(currentSource);

  if (!currentRegistry) {
    console.error('❌ Could not find TOOL_REGISTRY in backend/lib/braid/registry.js');
    process.exit(1);
  }

  // Generate new blocks
  const newRegistry = generateToolRegistryBlock(functions);
  const newParamOrder = generateParamOrderBlock(functions);

  // Compare
  const diff = compareRegistries(currentRegistry, newRegistry);

  if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
    console.log('✅ Registry is in sync with .braid files');
    process.exit(0);
  }

  console.log('\n📊 Registry Drift Detected:');
  if (diff.added.length > 0) {
    console.log(`   ➕ New tools: ${diff.added.join(', ')}`);
  }
  if (diff.removed.length > 0) {
    console.log(`   ➖ Removed tools: ${diff.removed.join(', ')}`);
  }
  if (diff.changed.length > 0) {
    console.log(`   ✏️  Changed tools: ${diff.changed.map((c) => c.name).join(', ')}`);
    for (const c of diff.changed) {
      console.log(`      ${c.name}:`);
      console.log(`        before: ${c.before}`);
      console.log(`        after:  ${c.after}`);
    }
  }

  if (checkOnly) {
    console.log('\n❌ Registry is out of sync. Run `node sync-registry.js` to update.');
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n--- New TOOL_REGISTRY (dry run) ---\n');
    console.log(newRegistry);
    console.log('\n--- New BRAID_PARAM_ORDER (dry run) ---\n');
    console.log(newParamOrder);
    process.exit(0);
  }

  // Update the file
  console.log('\n📝 Updating backend/lib/braid/registry.js...');

  let updatedSource = currentSource.replace(
    /export const TOOL_REGISTRY = \{[\s\S]*?\n\};/,
    newRegistry,
  );

  if (currentParamOrder) {
    updatedSource = updatedSource.replace(
      /const BRAID_PARAM_ORDER = \{[\s\S]*?\n\};/,
      newParamOrder,
    );
  }

  fs.writeFileSync(INTEGRATION_FILE, updatedSource);
  console.log('✅ Registry updated successfully');

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Total tools: ${functions.length}`);
  console.log(`   Files: ${new Set(functions.map((f) => f.file)).size}`);
  console.log(`   Added: ${diff.added.length}`);
  console.log(`   Removed: ${diff.removed.length}`);
}

main();
