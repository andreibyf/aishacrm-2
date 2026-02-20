/**
 * PEP Compiler — Entry Point
 *
 * Compiles a plain English business rule into deterministic execution artifacts.
 *
 * Usage:
 *   import { compile } from './index.js';
 *   const result = await compile(englishSource, { entity_catalog, capability_catalog });
 *
 * Returns on success:
 *   { status: 'compiled', semantic_frame, braid_ir, plan, audit }
 *
 * Returns on failure:
 *   { status: 'clarification_required', reason, unresolved, partial_frame }
 *
 * The compiler NEVER executes capabilities.
 * The compiler ALWAYS fails closed on ambiguity.
 * Phase 2: LLM parser by default; use context.useLegacyParser for deterministic regex.
 */

/* global process */
'use strict';

import { parse } from './parser.js';
import { parseLLM } from './llmParser.js';
import { resolve } from './resolver.js';
import { emit } from './emitter.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CATALOGS_DIR = join(__dirname, '..', 'catalogs');

/**
 * Load the default catalogs from pep/catalogs/.
 * @returns {{ entity_catalog: object, capability_catalog: object }}
 */
function loadDefaultCatalogs() {
  const entity_catalog = parseYaml(readFileSync(join(CATALOGS_DIR, 'entity-catalog.yaml'), 'utf8'));
  const capability_catalog = parseYaml(
    readFileSync(join(CATALOGS_DIR, 'capability-catalog.yaml'), 'utf8'),
  );
  return { entity_catalog, capability_catalog };
}

/**
 * Compile a plain English program into deterministic execution artifacts.
 *
 * @param {string} englishSource - The plain English program text
 * @param {object} [context] - Optional context overrides
 * @param {object} [context.entity_catalog] - Override entity catalog
 * @param {object} [context.capability_catalog] - Override capability catalog
 * @param {boolean} [context.useLegacyParser] - Use Phase 1 regex parser instead of LLM
 * @returns {Promise<{ status: 'compiled', semantic_frame, braid_ir, plan, audit } | { status: 'clarification_required', reason, unresolved, partial_frame }>}
 */
async function compile(englishSource, context = {}) {
  // Never throw — always return a result object
  try {
    // Load catalogs (from context or defaults)
    let entity_catalog, capability_catalog;
    if (context.entity_catalog && context.capability_catalog) {
      entity_catalog = context.entity_catalog;
      capability_catalog = context.capability_catalog;
    } else {
      const defaults = loadDefaultCatalogs();
      entity_catalog = context.entity_catalog || defaults.entity_catalog;
      capability_catalog = context.capability_catalog || defaults.capability_catalog;
    }

    // Phase 1: Parse — English → CBE pattern
    let parsed;
    if (context.useLegacyParser) {
      // Legacy: deterministic regex parser (Phase 1)
      parsed = parse(englishSource);
    } else {
      // Default: LLM-powered parser (Phase 2)
      try {
        parsed = await parseLLM(englishSource, { entity_catalog, capability_catalog });
      } catch (_llmErr) {
        return {
          status: 'clarification_required',
          reason: `LLM parser error: ${_llmErr.message}`,
          unresolved: [],
          partial_frame: null,
        };
      }
    }

    if (!parsed.match) {
      return {
        status: 'clarification_required',
        reason: parsed.reason,
        unresolved: [],
        partial_frame: null,
      };
    }

    // Phase 2: Resolve — CBE pattern → annotated pattern with catalog bindings
    const resolved = resolve(parsed, entity_catalog, capability_catalog);
    if (resolved.status === 'clarification_required') {
      return resolved;
    }

    // Phase 3: Emit — resolved pattern → four artifacts
    const artifacts = emit(resolved, englishSource);

    return {
      status: 'compiled',
      semantic_frame: artifacts.semantic_frame,
      braid_ir: artifacts.braid_ir,
      plan: artifacts.plan,
      audit: artifacts.audit,
    };
  } catch (err) {
    // Fail closed — never throw, return clarification_required
    return {
      status: 'clarification_required',
      reason: `Compiler internal error: ${err.message}`,
      unresolved: [],
      partial_frame: null,
    };
  }
}

export { compile, loadDefaultCatalogs };

// CLI entry point: node pep/compiler/index.js --source <path>
if (
  (process.argv[1] && process.argv[1].includes('compiler/index.js')) ||
  (process.argv[1] && process.argv[1].includes('compiler\\index.js'))
) {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf('--source');
  if (sourceIdx === -1 || !args[sourceIdx + 1]) {
    console.error('Usage: node pep/compiler/index.js --source <path-to-source.pep.md>');
    process.exit(1);
  }

  const sourcePath = args[sourceIdx + 1];
  const source = readFileSync(sourcePath, 'utf8');
  const useLegacy = args.includes('--legacy');
  const result = await compile(source, { useLegacyParser: useLegacy });
  console.log(JSON.stringify(result, null, 2));
}
