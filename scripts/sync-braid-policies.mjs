#!/usr/bin/env node
/**
 * sync-braid-policies.mjs
 * 
 * Validates that @policy annotations in .braid files match TOOL_REGISTRY assignments.
 * Can optionally update registry.js to match .braid annotations (--write flag).
 * 
 * Usage:
 *   node scripts/sync-braid-policies.mjs          # validate only (CI-safe)
 *   node scripts/sync-braid-policies.mjs --write   # update registry.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from '../braid-llm-kit/tools/braid-parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAID_DIR = path.join(__dirname, '..', 'braid-llm-kit', 'examples', 'assistant');
const REGISTRY_PATH = path.join(__dirname, '..', 'backend', 'lib', 'braid', 'registry.js');

const writeMode = process.argv.includes('--write');

// --- Phase 1: Extract @policy from all .braid files ---
const braidPolicies = {};  // functionName → { policy, file }
const files = fs.readdirSync(BRAID_DIR).filter(f => f.endsWith('.braid'));

for (const fname of files) {
  const src = fs.readFileSync(path.join(BRAID_DIR, fname), 'utf8');
  try {
    const ast = parse(src, fname);
    for (const item of ast.items) {
      if (item.type !== 'FnDecl') continue;
      const ann = (item.annotations || []).find(a => a.name === 'policy');
      if (ann?.args?.[0]) {
        braidPolicies[item.name] = { policy: ann.args[0], file: fname };
      }
    }
  } catch (e) {
    console.error(`  ✗ Parse error in ${fname}: ${e.message}`);
  }
}

console.log(`Extracted ${Object.keys(braidPolicies).length} @policy annotations from ${files.length} .braid files\n`);

// --- Phase 2: Read TOOL_REGISTRY ---
const registrySrc = fs.readFileSync(REGISTRY_PATH, 'utf8');
const registryPolicies = {};  // functionName → policy from registry
const registryRe = /(\w+):\s*\{[^}]*function:\s*'(\w+)'[^}]*policy:\s*'(\w+)'/g;
let m;
while ((m = registryRe.exec(registrySrc)) !== null) {
  registryPolicies[m[2]] = { toolName: m[1], policy: m[3] };
}

// --- Phase 3: Compare ---
let mismatches = 0;
let missing_from_braid = 0;
let missing_from_registry = 0;

// Functions in registry but missing @policy in .braid
for (const [fn, reg] of Object.entries(registryPolicies)) {
  if (!braidPolicies[fn]) {
    console.log(`  ⚠ ${fn}: in registry (${reg.policy}) but no @policy in .braid`);
    missing_from_braid++;
  } else if (braidPolicies[fn].policy !== reg.policy) {
    console.log(`  ✗ ${fn}: .braid says @policy(${braidPolicies[fn].policy}), registry says '${reg.policy}'`);
    mismatches++;
  }
}

// Functions with @policy but not in registry
for (const [fn, bp] of Object.entries(braidPolicies)) {
  if (!registryPolicies[fn]) {
    console.log(`  ⚠ ${fn}: @policy(${bp.policy}) in ${bp.file} but not in TOOL_REGISTRY`);
    missing_from_registry++;
  }
}

const matched = Object.keys(braidPolicies).length - mismatches - missing_from_registry;
console.log(`\n✓ ${matched} policies match`);
if (mismatches) console.log(`✗ ${mismatches} mismatches`);
if (missing_from_braid) console.log(`⚠ ${missing_from_braid} missing from .braid files`);
if (missing_from_registry) console.log(`⚠ ${missing_from_registry} missing from registry`);

if (mismatches === 0 && missing_from_braid === 0) {
  console.log('\n✅ All policies are in sync');
} else {
  console.log('\n❌ Policy drift detected');
  if (writeMode) {
    console.log('\n--write mode: updating registry.js...');
    let updated = registrySrc;
    for (const [fn, bp] of Object.entries(braidPolicies)) {
      if (registryPolicies[fn] && registryPolicies[fn].policy !== bp.policy) {
        // Replace policy in registry for this function
        const re = new RegExp(
          `(function:\\s*'${fn}'[^}]*policy:\\s*')${registryPolicies[fn].policy}(')`
        );
        updated = updated.replace(re, `$1${bp.policy}$2`);
        console.log(`  Updated ${fn}: ${registryPolicies[fn].policy} → ${bp.policy}`);
      }
    }
    fs.writeFileSync(REGISTRY_PATH, updated);
    console.log('Registry updated.');
  } else {
    console.log('Run with --write to update registry.js from .braid annotations');
  }
  process.exit(1);
}
