#!/usr/bin/env node
/**
 * Regenerate backend/types/database.types.ts from the live dev branch schema.
 *
 * Why: Bug 4 from the 4VD-7 smoke test was a route .select('logo_url, ...')
 * referencing columns that don't exist on `tenant`. PostgREST 400'd and
 * supabase-js's .maybeSingle() swallowed the error silently. With generated
 * types + // @ts-check, the bug surfaces in the editor before the bug ships.
 *
 * Run after every migration:
 *   npm run db:types
 *
 * Requires the Supabase CLI logged in:
 *   npm i -g supabase    (one-time)
 *   supabase login        (one-time, opens browser)
 *
 * If you don't have CLI auth set up, the command fails with a clear message
 * and you can fall back to running generate_typescript_types via the
 * Supabase MCP tool from inside Claude.
 *
 * The dev branch is the canonical source of schema truth — staging and prod
 * may lag behind pending migrations. See feedback_migration_postgrest_reload
 * memory for the migration runbook.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DEST = join(REPO_ROOT, 'backend', 'types', 'database.types.ts');

// Dev branch is canonical; staging/prod may lag.
const PROJECT_ID = 'nrtrjsatmsosslxwlmoj';

console.log(`Regenerating ${DEST} from project ${PROJECT_ID}...`);

try {
  const output = execSync(
    `npx --yes supabase gen types typescript --project-id ${PROJECT_ID} --schema public`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

  if (!output || !output.includes('export type Database')) {
    console.error('Unexpected output from supabase gen types:');
    console.error(output.slice(0, 500));
    process.exit(1);
  }

  mkdirSync(dirname(DEST), { recursive: true });
  writeFileSync(DEST, output, 'utf8');
  console.log(`Wrote ${output.length} chars to ${DEST}`);
  console.log('Done. Commit the regenerated file alongside the migration.');
} catch (err) {
  console.error('\nFailed to regenerate types.');
  console.error('\nMost common cause: the Supabase CLI is not installed or not logged in.');
  console.error('Fix:');
  console.error('  npm i -g supabase');
  console.error('  supabase login');
  console.error('\nOr ask Claude to regenerate via the Supabase MCP and write the file directly.');
  console.error('\nUnderlying error:');
  console.error(err.stderr?.toString() || err.message);
  process.exit(1);
}
