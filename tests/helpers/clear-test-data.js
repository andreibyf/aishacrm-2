import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend/.env
dotenv.config({ path: resolve(__dirname, '../../backend/.env') });

// ── Safety guards ────────────────────────────────────────────────────
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — aborting.');
  process.exit(1);
}

if (process.env.ALLOW_TEST_DATA_CLEANUP !== '1') {
  console.error('Set ALLOW_TEST_DATA_CLEANUP=1 to run this script.');
  process.exit(1);
}

const url = new URL(process.env.SUPABASE_URL);
if (!url.hostname.endsWith('.supabase.co') && !url.hostname.startsWith('localhost') && !url.hostname.startsWith('127.')) {
  console.error(`Unexpected SUPABASE_URL hostname "${url.hostname}" — aborting to prevent accidental production wipe.`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Comprehensive test data cleanup script.
 *
 * Strategy (ordered by specificity):
 * 1. Delete rows flagged with is_test_data = true  (set by TestFactory)
 * 2. Delete rows matched by known test email patterns
 * 3. Delete rows matched by known test company/title patterns
 *
 * Tables are ordered so child rows are deleted before parents
 * (e.g., activities before accounts).
 */

// ── Configuration ────────────────────────────────────────────────────

/** Tables that have an `is_test_data` boolean column (or metadata->is_test_data). */
const FLAGGED_TABLES = [
  'activities',
  'notes',
  'opportunities',
  'contacts',
  'accounts',
  'leads',
  'bizdevsources',
  'announcements',
  'aicampaigns',
  'workflows',
];

/** Tables + email column for pattern-based cleanup (fallback). */
const EMAIL_TABLES = [
  { table: 'activities', column: 'email' },
  { table: 'notes', column: 'email' },
  { table: 'opportunities', column: 'email' },
  { table: 'contacts', column: 'email' },
  { table: 'accounts', column: 'email' },
  { table: 'leads', column: 'email' },
];

/** Email patterns injected by TestFactory and Playwright fixtures. */
const TEST_EMAIL_PATTERNS = [
  '%@acmecorp.test',
  '%@example.com',
  '%@playwright.test',
  '%test-factory%',
];

/** Name/title patterns for tables without email columns. */
const NAME_PATTERN_TABLES = [
  {
    table: 'bizdevsources',
    column: 'company_name',
    patterns: ['%Test%Corp%', '%CSV Import Test%'],
  },
  { table: 'announcements', column: 'title', patterns: ['Test Announcement%'] },
];

// ── Helpers ──────────────────────────────────────────────────────────

async function deleteByFlag(table) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq('is_test_data', true);

  return { error, count };
}

async function deleteByEmailPatterns(table, column) {
  let totalDeleted = 0;
  for (const pattern of TEST_EMAIL_PATTERNS) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .like(column, pattern);
    if (error) return { error, count: totalDeleted };
    totalDeleted += count || 0;
  }
  return { error: null, count: totalDeleted };
}

async function deleteByNamePatterns(table, column, patterns) {
  let totalDeleted = 0;
  for (const pattern of patterns) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .like(column, pattern);
    if (error) return { error, count: totalDeleted };
    totalDeleted += count || 0;
  }
  return { error: null, count: totalDeleted };
}

// ── Main ─────────────────────────────────────────────────────────────

async function clearTestData() {
  console.log('🧹 Clearing test data from database...\n');

  let grandTotal = 0;

  // ── Pass 1: is_test_data flag ──────────────────────────────────────
  console.log('── Pass 1: is_test_data flag ──');
  for (const table of FLAGGED_TABLES) {
    try {
      const { error, count } = await deleteByFlag(table);
      if (error) {
        // Column may not exist on this table — skip silently
        if (error.message.includes('column') || error.code === '42703') {
          console.log(`   ${table}: no is_test_data column — skipped`);
        } else {
          console.log(`❌ ${table}: ${error.message}`);
        }
      } else {
        const n = count || 0;
        grandTotal += n;
        console.log(`✅ ${table}: ${n} rows deleted`);
      }
    } catch (err) {
      console.log(`⚠️  ${table}: ${err.message}`);
    }
  }

  // ── Pass 2: Email patterns ─────────────────────────────────────────
  console.log('\n── Pass 2: email patterns ──');
  for (const { table, column } of EMAIL_TABLES) {
    try {
      const { error, count } = await deleteByEmailPatterns(table, column);
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        grandTotal += count || 0;
        console.log(`✅ ${table}: ${count || 0} rows deleted`);
      }
    } catch (err) {
      console.log(`⚠️  ${table}: ${err.message}`);
    }
  }

  // ── Pass 3: Name/title patterns ────────────────────────────────────
  console.log('\n── Pass 3: name/title patterns ──');
  for (const { table, column, patterns } of NAME_PATTERN_TABLES) {
    try {
      const { error, count } = await deleteByNamePatterns(table, column, patterns);
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        grandTotal += count || 0;
        console.log(`✅ ${table}: ${count || 0} rows deleted`);
      }
    } catch (err) {
      console.log(`⚠️  ${table}: ${err.message}`);
    }
  }

  console.log(`\n✨ Test data cleanup complete! ${grandTotal} total rows removed.\n`);
}

clearTestData().catch(console.error);
