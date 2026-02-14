// braid-transpile.js — AiSHA re-export from core
// The real transpiler lives in ../core/braid-transpile.js.
// This file re-exports everything so existing imports continue to work unchanged.
"use strict";

export {
  transpileToJS,
  extractPolicies,
  extractParamTypes,
  detectUsedEffects,
  IO_EFFECT_MAP,
  BRAID_TYPE_MAP,
  VALID_POLICIES,
} from '../core/braid-transpile.js';

// CLI: forward to core transpiler when invoked directly
import url from 'url';
import process from 'node:process';
const arg1 = (process?.argv?.length > 1) ? process.argv[1] : null;
const isMain = arg1 && (import.meta.url === url.pathToFileURL(arg1).href);
if (isMain) {
  // Dynamic import to avoid loading fs/process at module level for non-CLI use
  const { default: fs } = await import('fs');
  const { parse } = await import('../core/braid-parse.js');
  const { transpileToJS } = await import('../core/braid-transpile.js');

  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage: braid-transpile --file in.braid [--out out.js] [--pure] [--sandbox]');
    process.exit(0);
  }
  const fIdx = args.indexOf('--file');
  if (fIdx < 0) { console.error('missing --file'); process.exit(1); }
  const inPath = args[fIdx + 1];
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const pure = args.includes('--pure');
  const sandbox = args.includes('--sandbox');

  const source = fs.readFileSync(inPath, 'utf8');
  const ast = parse(source, inPath);
  const { code } = transpileToJS(ast, { source: inPath, pure, sandbox });
  if (outPath) {
    fs.writeFileSync(outPath, code, 'utf8');
    console.log(`✓ Transpiled ${inPath} → ${outPath}`);
  } else {
    process.stdout.write(code);
  }
}
